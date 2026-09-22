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

// ---- 音色を組み立てる ------------------------------------------------
// **表から選ぶのをやめる。** 20種の表から選んでいたので、役ごとに取れる処方が
// 5〜9種しかなく、音色の組み合わせがすぐ尽きた。
// 依頼者「音色の選択肢ももっと膨大にして」。
//
// 鳴らす仕組み（撞く・擦る・声・打つ・FM・加算）は**楽器**であって素材ではない。
// 素材は**その楽器の設定**なので、こちらを作品ごとに組み立てる。
// 倍音の比・波形・明るさ・減りかた・立ち上がり・唸り・フォルマント——全部振る。
//
// **音の哲学は動かさない**——美しい方へ振る。雑音を前に出さない
// （雑音は太鼓の胴に1本だけ）。だから振れる幅は「その楽器らしさ」の内側に収める。
//
// 役: mel=旋律 arp=分散和音 bass=低音 pad=持続 hit=一撃 pulse=拍
//
// **撥弦（pluck）に重みを掛けないこと。**
// 最初は `mel` が6分の2、`arp` が**3分の2**を撥弦にしていた。
// 分散和音の声部は作品の頭から終わりまで鳴り続ける役なので、
// 3分の2が撥弦だと**どの作品も「オルゴールが延々鳴っている」音になる**
// （依頼者「音楽はオルゴール調にたよりすぎ」——実際にそう聞こえていた）。
// いまはどの役も**機構を等しく持ち、撥弦は1つぶんだけ**。
// 伴奏にも弓・風琴・聲を入れて、作品ごとに中の声の質が替わるようにした。
const MECH = {
  mel: ['pluck', 'fm', 'bow', 'organ', 'choir'],
  arp: ['pluck', 'fm', 'bow', 'organ', 'choir'],
  bass: ['pluck', 'bow', 'organ', 'fm'],
  pad: ['bow', 'organ', 'choir'],
  hit: ['pluck', 'fm', 'organ'],
  pulse: ['drum', 'drum', 'pluck', 'fm'],
};
// 役ごとの音域の向き（低音は暗く、旋律は抜ける）
const ROLE_LP = { mel: [2200, 11000], arp: [1800, 9000], bass: [260, 1300],
  pad: [700, 3400], hit: [3000, 12000], pulse: [400, 3000] };

function pickOf(rng, a) { return a[Math.floor(rng() * a.length)]; }
function betw(rng, a, b) { return a + (b - a) * rng(); }

export function makeInstrument(rng, role) {
  const k = pickOf(rng, MECH[role] || MECH.mel);
  const [lo, hi] = ROLE_LP[role] || ROLE_LP.mel;
  const lp = betw(rng, lo, hi);
  const bright = (lp - lo) / Math.max(1, hi - lo);   // 0=暗い 1=明るい

  if (k === 'pluck') {
    // 倍音の比を組む。整数に寄せると弦・木、ずらすと鐘・金物になる
    const inh = rng() < 0.4;                          // 非整数倍音（鐘の側）
    const n = 2 + Math.floor(rng() * 4);
    const parts = [[1, 1, 1]];
    for (let i = 1; i < n; i++) {
      const base = i + 1;
      const mul = inh ? base * betw(rng, 1.02, 1.55) : base + betw(rng, -0.02, 0.02);
      parts.push([mul, betw(rng, 0.04, 0.42) / i, betw(rng, 0.18, 0.7)]);
    }
    const long = role === 'pulse' ? false : rng() < 0.45;
    return {
      n: name(k, bright, long, inh), k, r: role, type: pickOf(rng, ['sine', 'sine', 'triangle']),
      lp, g: betw(rng, 0.24, 0.46) * (role === 'bass' ? 1.1 : 1),
      dmin: role === 'pulse' ? 0.18 : long ? 1.2 : 0.3,
      dmax: role === 'pulse' ? 0.45 : long ? betw(rng, 2.4, 4.2) : betw(rng, 0.9, 1.8),
      dmul: betw(rng, 0.6, 2.0), parts,
    };
  }
  if (k === 'fm') {
    // 比が整数に近いと楽器らしく、離すと鈴・金物。指数が浅いと笛に寄る
    const ratio = rng() < 0.55
      ? Math.round(betw(rng, 1, 5)) + betw(rng, -0.01, 0.01)
      : betw(rng, 1.3, 7.4);
    const index = betw(rng, 0.4, 6.5);
    const long = rng() < 0.4;
    return {
      n: name(k, bright, long, index > 3), k, r: role, ratio, index,
      mw: pickOf(rng, ['sine', 'sine', 'triangle']), mdec: betw(rng, 0.25, 0.9),
      lp, g: betw(rng, 0.2, 0.38), atk: betw(rng, 0.003, 0.05),
      hold: role === 'pad' || (role === 'mel' && rng() < 0.3),
      dmin: long ? 1.1 : 0.28, dmax: long ? betw(rng, 2.6, 4.6) : betw(rng, 0.8, 1.7),
      dmul: betw(rng, 0.7, 1.9),
    };
  }
  if (k === 'bow') {
    const spread = betw(rng, 2, 14);
    const voices = 1 + Math.floor(rng() * 3);
    const det = [];
    for (let i = 0; i < voices + 1; i++) det.push(Math.round((i - voices / 2) * spread));
    return {
      n: name(k, bright, true, spread > 8), k, r: role,
      atk: role === 'pad' ? betw(rng, 0.4, 1.4) : betw(rng, 0.03, 0.3),
      lp, det, g: betw(rng, 0.12, 0.3),
    };
  }
  if (k === 'organ') {
    // 引き栓（どの倍音をどれだけ出すか）。ここが音色の顔になる
    const muls = [1, 2, 3, 4, 5, 6, 8];
    const draws = [[1, betw(rng, 0.5, 1)]];
    for (const m of muls.slice(1)) if (rng() < 0.55) draws.push([m, betw(rng, 0.05, 0.5) / m]);
    return {
      n: name(k, bright, true, draws.length > 3), k, r: role, draws,
      lp, det: rng() < 0.5 ? betw(rng, 2, 9) : 0,
      atk: betw(rng, 0.02, 0.5), rel: betw(rng, 0.15, 0.6), g: betw(rng, 0.1, 0.22),
    };
  }
  if (k === 'choir') {
    // 母音のフォルマント。3つの山の場所で「あ・い・う・お」が変わる
    const f1 = betw(rng, 380, 830), f2 = betw(rng, 850, 2100), f3 = betw(rng, 2300, 3200);
    return {
      n: name(k, bright, true, f2 > 1500), k, r: role, g: betw(rng, 0.1, 0.2),
      form: [[f1, betw(rng, 7, 14), 1], [f2, betw(rng, 8, 15), betw(rng, 0.3, 0.7)],
        [f3, betw(rng, 9, 16), betw(rng, 0.08, 0.28)]],
    };
  }
  return {
    n: name(k, bright, false, false), k, r: role,
    g: betw(rng, 0.4, 0.65), tight: betw(rng, 0.6, 1.8), noise: betw(rng, 0.3, 1.6),
  };
}

// 名前。**報告が読めるように**（どの音色が出たか、あとで分かる必要がある）
function name(k, bright, long, edge) {
  const b = bright > 0.66 ? '明' : bright > 0.33 ? '中' : '暗';
  const base = k === 'pluck' ? (long ? (edge ? '鐘' : '硝子') : (edge ? '鉄' : '木'))
    : k === 'fm' ? (edge ? '鈴' : '簧')
      : k === 'bow' ? (edge ? '群弦' : '弦')
        : k === 'organ' ? (edge ? '風琴' : '笛')
          : k === 'choir' ? (edge ? '聲' : '遠い聲')
            : '胴';
  // **区切りに「・」を使わないこと。** 声部の並びも「・」で繋ぐので、
  // 「鉄・中短・鈴・中長」が4つの楽器に見えて報告が読めなくなった。
  return base + '(' + b + (long ? '長' : '短') + ')';
}

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
  // 譜は**処方の物**を渡してくる（`makeInstrument` が組んだもの）。
  // 名前の文字列で渡ってきたら、並んでいる処方から引く（古い呼び出しのため）。
  const VO = (tone && tone.voices ? tone.voices : DEFAULT_VOICES)
    .map((v) => (typeof v === 'string' ? byName(v) : v));

  // FM（片方の音で片方の高さを揺らす）。**加算では出ない色が出る**
  // ——鈴・鉄琴・簧（リード）のような硬さと、低い指数でのやわらかい笛。
  // **雑音は使わない**（この作品で雑音を前に出さない、という線は動かさない）。
  function fmTone(at, f, dur, peak, I) {
    const car = osc('sine', f, 0);
    const mod = osc(I.mw || 'sine', f * I.ratio, 0);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * I.index, at);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, f * I.index * 0.02), at + dur * (I.mdec || 0.5));
    mod.connect(mg); mg.connect(car.frequency);
    const fil = ctx.createBiquadFilter();
    fil.type = 'lowpass'; fil.frequency.value = I.lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + (I.atk || 0.005));
    if (I.hold) g.gain.setValueAtTime(peak, at + Math.max((I.atk || 0.005) + 0.02, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.1);
    car.connect(fil); fil.connect(g); g.connect(master);
    car.start(at); car.stop(at + dur + 0.2);
    mod.start(at); mod.stop(at + dur + 0.2);
  }

  // 加算（正弦を積むだけ）。弓の鋸とは別の色が出る——風琴・笛・遠い和音。
  function organTone(at, f, dur, peak, I) {
    const fil = ctx.createBiquadFilter();
    fil.type = 'lowpass'; fil.frequency.value = I.lp;
    const g = ctx.createGain();
    const atk = I.atk || 0.1;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.setValueAtTime(peak, at + Math.max(atk + 0.02, dur * 0.85));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + (I.rel || 0.3));
    fil.connect(g); g.connect(master);
    for (const [mul, amp] of I.draws) {
      const o = osc('sine', f * mul, I.det ? (nzp(mul) * I.det) : 0);
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og); og.connect(fil);
      o.start(at); o.stop(at + dur + (I.rel || 0.3) + 0.1);
    }
  }
  // 決まった小さな揺れ（同じ入力なら同じ値。オルガンの唸りに使う）
  function nzp(x) { return ((Math.sin(x * 12.9898) * 43758.5453) % 1) * 2 - 1; }

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
    } else if (I.k === 'fm') {
      const d = Math.max(I.dmin, Math.min(I.dmax, n.d * I.dmul)) * T.melDecay;
      fmTone(at, f, d, v * I.g, Object.assign({}, I, { lp: I.lp * T.melBright }));
    } else if (I.k === 'organ') {
      organTone(at, f, n.d, v * I.g, Object.assign({}, I, {
        lp: I.lp * T.bowBright, atk: (I.atk || 0.1) * T.bowAtk,
      }));
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
