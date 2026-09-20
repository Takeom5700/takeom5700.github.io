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
  function choir(at, f, dur, peak) {
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
    for (const [fr, q, amp] of [[700, 9, 1], [1150, 11, 0.55], [2600, 13, 0.2]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
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
  function drum(at, f, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(28, f * 0.8), at + 0.12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + 0.6);
    const s2 = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    s2.buffer = NB; s2.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.9;
    ng.gain.setValueAtTime(peak * 0.5, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    s2.connect(bp); bp.connect(ng); ng.connect(master);
    s2.start(at); s2.stop(at + 0.2);
  }

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
    } else if (n.voice === 4) {
      // 鐘（部の変わり目だけ）
      pluck(at, f, Math.max(2.5, n.d), v * 0.3,
        [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.16, 0.25], [8.9, 0.06, 0.15]], 'sine', 9000);
    } else if (n.voice === 5) {
      drum(at, f, v * 0.55);                          // 太鼓
    } else if (n.voice === 6) {
      choir(at, f, n.d, v * 0.16);                    // 聲
    } else if (n.voice === 7) {
      // 弾（ピツィカート）
      pluck(at, f, 0.3, v * 0.34, [[1, 1, 1], [2, 0.3, 0.4], [3.1, 0.12, 0.25]], 'triangle', 2400);
    } else {
      // 弓の旋律（弦が主旋律を取る）
      bowed(at, f, n.d, v * 0.2, 0.12, 2400, [-7, 0, 6]);
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
