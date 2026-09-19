// 音（sound）— 譜と同じ数から出す。音のファイルは1つも無い。
//
// 第一版の音は持続音だけで、拍も打撃も無かった（「拍が入ると体が数えはじめる」
// と自分で禁じていた）。絵を切るようにした以上、音も切る。
// **断のたびに、和音が段で入れ替わり、打撃が入る。** 溶かさない。
//
// 一つの景につき出るもの:
//   - 打撃（低い衝き／雑音の破裂／金属の点）… au.hit
//   - 床（2〜3本の持続音）… au.root と au.chord。景が変わった瞬間に入れ替わる
// 「空」の景では床だけ小さく鳴らす。無音もまた対比の側にある。

const CHORDS = [[0, 7], [0, 3, 7], [0, 5, 10], [0, 6, 11]];

export function createSound(seed, givenCtx) {
  const AC = givenCtx ? null : (window.AudioContext || window.webkitAudioContext);
  if (!givenCtx && !AC) return null;
  const ctx = givenCtx || new AC();

  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);

  // 雑音は1本だけ作って使い回す
  const NB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  {
    const d = NB.getChannelData(0);
    let s = (seed | 0) || 1;
    for (let i = 0; i < d.length; i++) {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
      d[i] = (s >>> 0) / 2147483648 - 1;
    }
  }

  const hz = (n) => 55 * Math.pow(2, n / 12);
  let muted = false;

  function env(g, at, peak, atk, dec) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + atk + dec);
  }

  // 低い衝き。腹に来る
  function thump(at, root, level) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz(root) * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(24, hz(root) * 0.5), at + 0.22);
    env(g, at, 0.95 * level, 0.004, 0.42);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + 0.7);
  }
  // 雑音の破裂。断そのものの音
  function burst(at, root, level, dur) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = NB; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(hz(root + 36), at);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, hz(root + 12)), at + dur);
    env(g, at, 0.5 * level, 0.002, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(at); s.stop(at + dur + 0.1);
  }
  // 金属の点。高いところに刺す
  function ping(at, root, level) {
    const c = ctx.createOscillator(), m = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    c.type = 'sine'; m.type = 'sine';
    c.frequency.value = hz(root + 48);
    m.frequency.value = hz(root + 48) * 2.41;
    mg.gain.setValueAtTime(hz(root + 48) * 3.2, at);
    mg.gain.exponentialRampToValueAtTime(1, at + 0.28);
    env(g, at, 0.34 * level, 0.002, 0.34);
    m.connect(mg); mg.connect(c.frequency);
    c.connect(g); g.connect(master);
    m.start(at); c.start(at); m.stop(at + 0.6); c.stop(at + 0.6);
  }
  // 床。景のあいだ鳴り続け、次の断で入れ替わる（溶かさない）
  function bed(at, dur, root, chord, level) {
    const iv = CHORDS[chord % CHORDS.length];
    for (let i = 0; i < iv.length; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz(root + iv[i] + (i === 0 ? 0 : 12));
      o.detune.value = (i - 1) * 6;
      f.type = 'lowpass'; f.frequency.value = 340 + i * 180; f.Q.value = 0.7;
      const pk = (i === 0 ? 0.22 : 0.12) * level;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(pk, at + 0.012);
      g.gain.setValueAtTime(pk, at + Math.max(0.02, dur - 0.06));
      g.gain.linearRampToValueAtTime(0.0001, at + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(at); o.stop(at + dur + 0.05);
    }
  }

  function scheduleShot(sh, at) {
    if (muted) return;
    const a = sh.au;
    const lv = a.level * (sh.empty ? 0.42 : 1);
    if (a.silent) return;
    bed(at, sh.dur, a.root, a.chord, lv * (sh.dur < 0.6 ? 0.7 : 1));
    if (a.hit === 1) thump(at, a.root, lv);
    else if (a.hit === 2) burst(at, a.root, lv, Math.min(0.5, 0.08 + sh.dur * 0.2));
    else if (a.hit === 3) ping(at, a.root, lv);
  }

  return {
    ctx, master,
    scheduleShot,
    resume() { if (ctx.resume) ctx.resume(); },
    toggleMute() { muted = !muted; master.gain.value = muted ? 0 : 0.5; return muted; },
    close() { if (ctx.close && !givenCtx) ctx.close(); },
  };
}
