// 音の手（sound）— 音色。音のファイルは1つも無い。
//
// 何を鳴らすかは music.js が決める。ここは**どう鳴らすか**だけを持つ
// （絵でいう paint.js と同じ位置）。
//
// 前の版は雑音の破裂と低い衝きで、おどろおどろしい方へ振っていた。
// 絵の側がすでに「驚かし」なのだから、音まで驚かすと同じことを二度言うことになる。
// **だから音は美しい方へ振る。** オルゴール・竪琴・弓・弦、そして残響。
// 怖い絵に綺麗な音が乗っている状態そのものが、いちばん強い対比になる。

export function createSound(givenCtx) {
  const AC = givenCtx ? null : (window.AudioContext || window.webkitAudioContext);
  if (!givenCtx && !AC) return null;
  const ctx = givenCtx || new AC();

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
    const len = Math.floor(ctx.sampleRate * 2.6);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let s = 1234567;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
        const n = (s >>> 0) / 2147483648 - 1;
        d[i] = n * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1);
      }
    }
    rev.buffer = buf;
    master.connect(dry); dry.connect(comp);
    master.connect(rev); rev.connect(wet); wet.connect(comp);
  } catch (e) {
    master.connect(comp);
  }
  comp.connect(ctx.destination);

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
    for (const d of detune) {
      const o = osc('sawtooth', f, d);
      const og = ctx.createGain(); og.gain.value = 1 / detune.length;
      o.connect(og); og.connect(fil);
      o.start(at); o.stop(at + dur + 0.45);
    }
    // ごく浅いビブラート（機械の音から離す）
    const lfo = osc('sine', 4.6 + (f % 7) * 0.1, 0);
    const lg = ctx.createGain(); lg.gain.value = f * 0.004;
    lfo.connect(lg);
    lfo.start(at); lfo.stop(at + dur + 0.45);
  }

  let muted = false;

  // music.js の音符を1つ鳴らす
  function play(n, at) {
    if (muted) return;
    const f = hz(n.midi), v = n.v;
    if (n.voice === 0) {
      // 旋律：オルゴール
      pluck(at, f, Math.max(1.1, Math.min(2.4, n.d * 1.7)), v * 0.42,
        [[1, 1, 1], [2.01, 0.28, 0.55], [3.98, 0.12, 0.3], [5.4, 0.05, 0.2]], 'sine', 7000);
    } else if (n.voice === 1) {
      // 分散和音：竪琴
      pluck(at, f, Math.max(0.5, Math.min(1.4, n.d)), v * 0.3,
        [[1, 1, 1], [2, 0.22, 0.5], [3, 0.08, 0.3]], 'triangle', 3200);
    } else if (n.voice === 2) {
      // 低音：弓
      bowed(at, f, n.d, v * 0.3, 0.09, 420, [-6, 5]);
    } else if (n.voice === 3) {
      // 持続：弦
      bowed(at, f, n.d, v * 0.16, 0.85, 1250, [-8, 0, 7]);
    } else {
      // 鐘（部の変わり目だけ）
      pluck(at, f, Math.max(2.5, n.d), v * 0.3,
        [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.16, 0.25], [8.9, 0.06, 0.15]], 'sine', 9000);
    }
  }

  return {
    ctx, master, play,
    resume() { if (ctx.resume) ctx.resume(); },
    toggleMute() { muted = !muted; master.gain.value = muted ? 0 : 1.15; return muted; },
    close() { if (ctx.close && !givenCtx) ctx.close(); },
  };
}
