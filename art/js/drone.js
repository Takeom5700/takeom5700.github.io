// 音。譜の同じ数から作る。音声ファイルは一つも無い（全部その場で合成）。
//
// 絵と音を別の作者が作ると、合っているように「見せる」作業が必要になる。
// ここでは両方が同じ譜から出るので、合わせる作業がそもそも要らない。
// 基音・倍音の量・風の帯域は楽章のパラメータそのまま。
//
// メロディも拍も無い。持続音だけ。拍が入ると体が数えはじめて、
// 時間が「長さ」として意識される。それは基軸「三・間」の逆をやることになる。

import { makeRng } from './rng.js';

const RATIOS = [1, 2, 2.996, 4, 5.04, 6, 7.98, 10.06, 12.1, 15.9];

export function createDrone(seed) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const rng = makeRng((seed | 0) ^ 0x2f6b1d);

  const master = ctx.createGain();
  master.gain.value = 0.0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 22; hp.Q.value = 0.3;
  master.connect(lp); lp.connect(hp); hp.connect(ctx.destination);

  // 倍音。1つずつ微妙にずれた2本で作る（うなりが「厚み」になる）
  const parts = RATIOS.map((r, i) => {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    const oscs = [0, 1].map((k) => {
      const o = ctx.createOscillator();
      o.type = i < 4 ? 'sine' : 'triangle';
      o.frequency.value = 40 * r;
      o.detune.value = (k === 0 ? -1 : 1) * (1.5 + rng() * 5.5) * (1 + i * 0.35);
      o.connect(g); o.start();
      return o;
    });
    return { r, g, oscs, phase: rng() * 6.283, rate: 0.006 + rng() * 0.021 };
  });

  // 風。帯域を絞った雑音。種から作った8秒のループ
  const len = Math.floor(ctx.sampleRate * 8);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const wn = rng() * 2 - 1;
    b0 = 0.99765 * b0 + wn * 0.0990460;
    b1 = 0.96300 * b1 + wn * 0.2965164;
    b2 = 0.57000 * b2 + wn * 1.0526913;
    d[i] = (b0 + b1 + b2 + wn * 0.1848) * 0.16;
  }
  // 継ぎ目を消す
  const fade = Math.floor(ctx.sampleRate * 0.35);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[len - fade + i] * (1 - k);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0;
  noise.connect(bp); bp.connect(ng); ng.connect(master);
  noise.start();

  // 最下部。ほとんど聞こえないが、無いと画面が軽くなる
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine'; subOsc.frequency.value = 20;
  const subG = ctx.createGain(); subG.gain.value = 0;
  subOsc.connect(subG); subG.connect(master); subOsc.start();

  let muted = false, level = 0.26;
  const T = 0.7; // 追従の時定数（秒）。速く動かすと音が「切り替わった」と聞こえる

  function set(node, v, tc) {
    node.setTargetAtTime(v, ctx.currentTime, tc === undefined ? T : tc);
  }

  return {
    ctx,
    resume() { if (ctx.state !== 'running') ctx.resume(); },
    get muted() { return muted; },
    toggleMute() { muted = !muted; set(master.gain, muted ? 0 : level, 0.5); return muted; },
    update(a, env, t) {
      const on = muted ? 0 : level * env;
      set(master.gain, on, 0.6);
      const f0 = a.tone;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // 上の倍音ほど spectrum と shimmer に支配される
        const k = i / (parts.length - 1);
        let amp = Math.pow(1 - k, 1.9) * 0.34;
        amp *= (1 - k) + k * (a.spectrum * 2.0 + a.shimmer * 1.6);
        // ごくゆっくりした呼吸。周期は 45〜170秒
        amp *= 0.55 + 0.45 * Math.sin(p.phase + t * p.rate * 6.283);
        amp *= a.level;
        set(p.g.gain, Math.max(0, amp) * 0.42);
        for (const o of p.oscs) set(o.frequency, f0 * p.r, 1.6);
      }
      set(ng.gain, a.windAmt * a.level * 0.55);
      set(bp.frequency, a.wind, 1.2);
      set(subG.gain, a.sub * 0.20 * a.level);
      set(subOsc.frequency, f0 * 0.5, 1.6);
      set(lp.frequency, 620 + a.spectrum * 2600 + a.shimmer * 3400, 1.0);
    },
  };
}
