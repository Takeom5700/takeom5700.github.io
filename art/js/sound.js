// 音の手（sound）— 音色。音のファイルは1つも無い。
//
// 何を鳴らすかは music.js が決める。ここは**どう鳴らすか**だけを持つ
// （絵でいう paint.js と同じ位置）。
//
// 前の版は雑音の破裂と低い衝きで、おどろおどろしい方へ振っていた。
// 絵の側がすでに「驚かし」なのだから、音まで驚かすと同じことを二度言うことになる。
// **だから音は美しい方へ振る。** オルゴール・竪琴・弓・弦、そして残響。
// 怖い絵に綺麗な音が乗っている状態そのものが、いちばん強い対比になる。

// **音色は1本ごとに振る**（`tone` は music.js が種から出す）。
// 渡されなければ既定値で鳴る（古い呼び出しも壊れない）。
// 振れる幅は「同じ楽器の別の個体」くらいに収める。**音の哲学は動かさない**
// ——美しい方へ振る、雑音で驚かさない、という線は超えない。
const TONE0 = {
  melWave: 'sine', melBright: 1, melDecay: 1,
  harpWave: 'triangle', harpBright: 1,
  bowAtk: 1, bowBright: 1, spread: 1,
  bellBright: 1, drumTight: 1, drumNoise: 1, choirBright: 1, pizzBright: 1,
};

// ---- 楽器の処方 ------------------------------------------------------
// **声部と音の対応を固定しないこと。** 第七版まで「旋律は必ずオルゴール、
// 低音は必ず弓、持続は必ず弦」だった。和音・拍子・音階を振っても、
// **鳴っている楽器が毎回同じなら同じ曲に聞こえる**（依頼者に二度そう聞こえた）。
// だから処方はここに並べ、**どの役に何を当てるかは music.js が作品ごとに決める**
// （絵でいう paint.js と score.js の関係と同じ）。
//
// `r` はその処方が取れる役。
//   mel=旋律 arp=分散和音 bass=低音 pad=持続 hit=一撃 pulse=拍
// **音の哲学は動かさない**——美しい方へ振る。雑音を前に出さない。
export const INSTRUMENTS = [
  // 撞いて減るもの
  { n: 'オルゴール', k: 'pluck', r: 'mel arp hit', type: 'sine', lp: 7000, g: 0.42, dmin: 1.1, dmax: 2.4, dmul: 1.7,
    parts: [[1, 1, 1], [2.01, 0.28, 0.55], [3.98, 0.12, 0.3], [5.4, 0.05, 0.2]] },
  { n: '鉄琴', k: 'pluck', r: 'mel arp hit', type: 'sine', lp: 12000, g: 0.3, dmin: 0.5, dmax: 1.6, dmul: 1.2,
    parts: [[1, 1, 1], [4, 0.3, 0.4], [10.2, 0.1, 0.2]] },
  { n: '木琴', k: 'pluck', r: 'mel arp pulse', type: 'triangle', lp: 5200, g: 0.36, dmin: 0.22, dmax: 0.5, dmul: 0.7,
    parts: [[1, 1, 1], [3, 0.35, 0.35], [6.1, 0.12, 0.2]] },
  { n: '竪琴', k: 'pluck', r: 'arp mel', type: 'triangle', lp: 3200, g: 0.3, dmin: 0.5, dmax: 1.4, dmul: 1,
    parts: [[1, 1, 1], [2, 0.22, 0.5], [3, 0.08, 0.3]] },
  { n: '硝子', k: 'pluck', r: 'mel arp hit', type: 'sine', lp: 9000, g: 0.26, dmin: 1.6, dmax: 3.2, dmul: 2.2,
    parts: [[1, 1, 1], [2, 0.2, 0.7], [4, 0.1, 0.5], [8, 0.04, 0.3]] },
  { n: '鐘', k: 'pluck', r: 'hit pad', type: 'sine', lp: 9000, g: 0.3, dmin: 2.5, dmax: 6, dmul: 2,
    parts: [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.16, 0.25], [8.9, 0.06, 0.15]] },
  { n: '弾く弦', k: 'pluck', r: 'bass pulse arp', type: 'triangle', lp: 2400, g: 0.34, dmin: 0.24, dmax: 0.4, dmul: 0.5,
    parts: [[1, 1, 1], [2, 0.3, 0.4], [3.1, 0.12, 0.25]] },
  { n: '低い撥', k: 'pluck', r: 'bass', type: 'triangle', lp: 900, g: 0.4, dmin: 0.5, dmax: 1.2, dmul: 1,
    parts: [[1, 1, 1], [2, 0.18, 0.4]] },
  // 擦る・吹くもの
  { n: '弓の低音', k: 'bow', r: 'bass', atk: 0.09, lp: 420, det: [-6, 5], g: 0.3 },
  { n: '弦の持続', k: 'bow', r: 'pad', atk: 0.85, lp: 1250, det: [-8, 0, 7], g: 0.16 },
  { n: '弦の旋律', k: 'bow', r: 'mel', atk: 0.12, lp: 2400, det: [-7, 0, 6], g: 0.2 },
  { n: '葦笛', k: 'bow', r: 'mel', atk: 0.05, lp: 3400, det: [0, 4], g: 0.17 },
  { n: '横笛', k: 'bow', r: 'mel pad', atk: 0.16, lp: 1900, det: [-3, 3], g: 0.15 },
  { n: '風琴', k: 'bow', r: 'pad bass', atk: 0.02, lp: 1600, det: [-12, 0, 12], g: 0.13 },
  { n: '唸る低弦', k: 'bow', r: 'bass pad', atk: 0.35, lp: 300, det: [-10, 0, 9], g: 0.28 },
  // 声
  { n: '聲', k: 'choir', r: 'pad mel', g: 0.16, form: [[700, 9, 1], [1150, 11, 0.55], [2600, 13, 0.2]] },
  { n: '遠い聲', k: 'choir', r: 'pad', g: 0.13, form: [[520, 12, 1], [900, 14, 0.4], [3100, 10, 0.12]] },
  // 打つもの
  { n: '太鼓', k: 'drum', r: 'pulse', g: 0.55, tight: 1, noise: 1 },
  { n: '締太鼓', k: 'drum', r: 'pulse', g: 0.45, tight: 1.6, noise: 0.5 },
  { n: '深い胴', k: 'drum', r: 'pulse', g: 0.6, tight: 0.7, noise: 1.4 },
];
export const forRole = (role) => INSTRUMENTS.filter((x) => x.r.split(' ').includes(role));

export function createSound(givenCtx, tone) {
  const AC = givenCtx ? null : (window.AudioContext || window.webkitAudioContext);
  if (!givenCtx && !AC) return null;
  const ctx = givenCtx || new AC();
  const T = Object.assign({}, TONE0, tone || {});

  const master = ctx.createGain();
  master.gain.value = 1.15;   // 合成音は素で小さい。実測 RMS 0.018 だったので上げた
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4;
  comp.attack.value = 0.006; comp.release.value = 0.25;

  // 残響。部屋を作らないと、合成音はどうしても玩具に聞こえる。
  // 雑音を指数で減らしたものを畳み込むだけ（音のファイルは要らない）。
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  const dry = ctx.createGain(); dry.gain.value = 0.82;
  let out = comp;
  try {
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.9);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let s = 1234567;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
        const n = (s >>> 0) / 2147483648 - 1;
        d[i] = n * Math.pow(1 - i / len, 2.4) * (i < 400 ? i / 400 : 1);
      }
    }
    rev.buffer = buf;
    master.connect(dry); dry.connect(comp);
    master.connect(rev); rev.connect(wet); wet.connect(comp);
  } catch (e) {
    master.connect(comp);
  }
  comp.connect(ctx.destination);

  // 太鼓の胴に使う雑音。**これ1本だけ**（音として前に出す雑音は使わない）
  const NB = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  {
    const d = NB.getChannelData(0);
    let s = 20250919;
    for (let i = 0; i < d.length; i++) {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
      d[i] = (s >>> 0) / 2147483648 - 1;
    }
  }

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function osc(type, f, detune) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    if (detune) o.detune.value = detune;
    return o;
  }
  // 撞いて減る音（オルゴール・竪琴・鐘）
  function pluck(at, f, dur, peak, parts, type, lp) {
    const g = ctx.createGain();
    const fil = ctx.createBiquadFilter();
    fil.type = 'lowpass'; fil.frequency.value = lp || 6000;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    fil.connect(g); g.connect(master);
    for (const [mul, amp, dd] of parts) {
      const o = osc(type || 'sine', f * mul, 0);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(amp, at);
      pg.gain.exponentialRampToValueAtTime(0.0001, at + dur * dd);
      o.connect(pg); pg.connect(fil);
      o.start(at); o.stop(at + dur + 0.05);
    }
  }
  // 息の長い音（弓・弦）
  function bowed(at, f, dur, peak, atk, lp, detune) {
    const g = ctx.createGain();
    const fil = ctx.createBiquadFilter();
    fil.type = 'lowpass'; fil.frequency.value = lp; fil.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.setValueAtTime(peak, at + Math.max(atk + 0.02, dur * 0.85));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.35);
    fil.connect(g); g.connect(master);
    const made = [];
    for (const d of detune) {
      const o = osc('sawtooth', f, d);
      const og = ctx.createGain(); og.gain.value = 1 / detune.length;
      o.connect(og); og.connect(fil);
      o.start(at); o.stop(at + dur + 0.45);
      made.push(o);
    }
    // ごく浅いビブラート（機械の音から離す）。
    // **揺らす先に繋ぐのを忘れないこと。** 繋がないと一切かからないまま、
    // 音符の数だけ無駄な発振器が積み上がる（実際にそうなっていた）。
    const lfo = osc('sine', 4.6 + (f % 7) * 0.1, 0);
    const lg = ctx.createGain(); lg.gain.value = f * 0.004;
    lfo.connect(lg);
    for (const o of made) lg.connect(o.frequency);
    lfo.start(at); lfo.stop(at + dur + 0.45);
  }

  let muted = false;

  // 声（合唱）。母音のフォルマントを重ねるだけで人の声に寄る。
  // **これを足したのは、音に変化が足りないと言われたから。**
  function choir(at, f, dur, peak, form) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.7);
    g.gain.setValueAtTime(peak, at + Math.max(0.75, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.6);
    g.connect(master);
    const src = [];
    for (const d of [-9, 0, 8]) {
      const o = osc('sawtooth', f, d);
      o.start(at); o.stop(at + dur + 0.7);
      src.push(o);
    }
    for (const [fr, q, amp] of (form || [[700, 9, 1], [1150, 11, 0.55], [2600, 13, 0.2]])) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = fr * T.choirBright; bp.Q.value = q;
      const ag = ctx.createGain(); ag.gain.value = amp * 0.5;
      for (const o of src) o.connect(bp);
      bp.connect(ag); ag.connect(g);
    }
    const lfo = osc('sine', 5.1, 0);
    const lg = ctx.createGain(); lg.gain.value = f * 0.006;
    lfo.connect(lg);
    for (const o of src) lg.connect(o.frequency);
    lfo.start(at); lfo.stop(at + dur + 0.7);
  }

  // 太鼓。撥で打つ膜。雑音を一瞬だけ通して、低い胴を鳴らす
  function drum(at, f, peak, tight, noise) {
    const tg = (tight || 1) * T.drumTight, nz = (noise || 1) * T.drumNoise;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2 * tg, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(28, f * 0.8), at + 0.12 / tg);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + 0.6);
    const s2 = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    s2.buffer = NB; s2.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.9;
    ng.gain.setValueAtTime(peak * 0.5 * nz, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    s2.connect(bp); bp.connect(ng); ng.connect(master);
    s2.start(at); s2.stop(at + 0.2);
  }

  // music.js の音符を1つ鳴らす。
  // **どの声部がどの楽器かは譜が決める**（`tone.voices`）。
  // 渡されていなければ既定の並びで鳴る（古い呼び出しも壊れない）。
  const DEFAULT_VOICES = ['オルゴール', '竪琴', '弓の低音', '弦の持続', '鐘',
    '太鼓', '聲', '弾く弦', '弦の旋律'];
  const byName = (n) => INSTRUMENTS.find((x) => x.n === n) || INSTRUMENTS[0];
  const VO = (tone && tone.voices ? tone.voices : DEFAULT_VOICES).map(byName);

  function play(n, at) {
    if (muted) return;
    const f = hz(n.midi), v = n.v;
    const I = VO[n.voice] || VO[0] || INSTRUMENTS[0];
    const sp = (a) => a.map((x) => x * T.spread);
    if (I.k === 'pluck') {
      const d = Math.max(I.dmin, Math.min(I.dmax, n.d * I.dmul)) * T.melDecay;
      pluck(at, f, d, v * I.g, I.parts, I.type, I.lp * T.melBright);
    } else if (I.k === 'bow') {
      bowed(at, f, n.d, v * I.g, I.atk * T.bowAtk, I.lp * T.bowBright, sp(I.det));
    } else if (I.k === 'choir') {
      choir(at, f, n.d, v * I.g, I.form);
    } else {
      drum(at, f, v * I.g, I.tight, I.noise);
    }
  }

  // 録るための出口。画面と一緒に1本へ録るときだけ使う
  // （`ctx.destination` とは別に、音声トラックとして取り出せるようにする）。
  let streamDest = null;
  function stream() {
    if (!ctx.createMediaStreamDestination) return null;
    if (!streamDest) {
      try { streamDest = ctx.createMediaStreamDestination(); comp.connect(streamDest); }
      catch (e) { return null; }
    }
    return streamDest.stream;
  }

  return {
    ctx, master, play, stream,
    resume() { if (ctx.resume) ctx.resume(); },
    toggleMute() { muted = !muted; master.gain.value = muted ? 0 : 1.15; return muted; },
    close() { if (ctx.close && !givenCtx) ctx.close(); },
  };
}
