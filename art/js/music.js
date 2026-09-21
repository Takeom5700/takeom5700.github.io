// 音の譜（music）— どの音を、いつ、どれだけ鳴らすか。**数だけで作る。**
// 音色は sound.js が持つ（絵でいう score.js と paint.js の関係と同じ）。
//
// 第三版の音は「景が替わるたびに一音だけ伸びる」だった。依頼者の指摘:
//
//   「バーバーって単音で、カットごとに1個ずつ伸びてる。すごくつまらないし、
//    長いカットのときにも一音伸びてると、あれ画面止まった、事故かな、になる。
//    長いカットのときはピロピロピロってメロディーが動いてたりするといい。
//    そもそもこんなおどろおどろしいシンセノイズにする必要があるのか疑問。
//    映像自体が古典的な驚かし系なんだから、音楽は美しかったりクラシカルな方が、
//    その対比が面白くなって映える」
//
// 全部その通りなので、作り直した。要点は3つ。
//
//   1. **音は断に付かない。** 音は音の時計（拍と小節）で進む。
//      だから長い景でも旋律は動き続ける。絵と音が別の周期で進むこと自体が対比になる。
//   2. **調性を持たせる。** 主調・属調・遠い調があり、和音が機能で進む。
//      絵のソナタ形式と同じ道筋を、音でもなぞる（再現部で主調に帰る）。
//   3. **雑音と打撃をやめた。** オルゴール・竪琴・弦。美しい方へ振る。
//
// 返すのは音符の並びだけ: { t 秒, d 秒, midi, v 強さ, voice 声部 }
//   voice 0=旋律（オルゴール） 1=分散和音（竪琴） 2=低音（弓） 3=持続（弦） 4=鐘
//         5=太鼓 6=聲（合唱） 7=弾（ピツィカート） 8=弓の旋律（弦が主旋律）
//
// **楽器は部ごとに入れ替わる。** 依頼者の指摘:
//   「基本的にオルゴール調で、最後のエンディング近くだけストリングスの和音が
//    入ったのが、やっと変化が入ったなと思ったぐらい。サウンドがあまり変わらない。
//    どこかで急に違う楽器になったり、ドラムが入ったり、コーラスが入ったり、
//    いろいろ考えられる」
// その通りなので、音色そのものにも構造を持たせた。
//   序=オルゴールと弦／提示A=オルゴール／提示B=**弦が主旋律・弾く低音**
//   展開=**太鼓が入り、途中から聲（合唱）が重なる**／再現=オルゴールが帰る
//   終=聲と弦、最後にオルゴールが独りで終わる

import { makeRng, between, pick } from './rng.js';

// ---- 音階 ------------------------------------------------------------
// **音階は哲学ではない。** 根（対比）・型（ソナタ形式）・6分・一つの種は動かさないが、
// どの音階で鳴らすかは1本ごとに変わってよい。第六版まで自然短音階だけで作っていて、
// 12種の譜を並べても**音階も拍子も編成も和音の進行も全部同じ**だった
// （実測: 声部の組 1通り/12・拍子 1通り/12・進行は定数）。
// 依頼者の指摘「前回創ったのと同じ音楽が流れだした」は事実そのままだった。
const MODES = [
  { name: '自然短', sc: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'ドリア', sc: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'フリギア', sc: [0, 1, 3, 5, 7, 8, 10] },
  { name: '和声的短', sc: [0, 2, 3, 5, 7, 8, 11] },
  { name: '長', sc: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'ミクソリディア', sc: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'リディア', sc: [0, 2, 4, 6, 7, 9, 11] },
  { name: '旋律的短', sc: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'ロクリア', sc: [0, 1, 3, 5, 6, 8, 10] },
  { name: '和声的長', sc: [0, 2, 4, 5, 7, 8, 11] },
];

// 音階の度 → 主音からの半音数（どの音階でも同じ式で引ける）
function degOf(sc, d) {
  const oct = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return sc[i] + oct * 12;
}
// **和音は音階から組む。** 固定の三和音表を持つと、音階を替えた瞬間に濁る
// （長音階に短主和音が乗る）。度の 0・2・4 を積めば、どの音階でも必ず収まる。
function triadOn(sc, deg, opt) {
  const o = opt || {};
  if (o.sus) return [degOf(sc, deg), degOf(sc, deg + 3), degOf(sc, deg + 4)];
  const t = [degOf(sc, deg), degOf(sc, deg + 2), degOf(sc, deg + 4)];
  // 終わりだけ長三和音へ寄せる（ピカルディ）。短三度を長三度へ上げる
  if (o.major && t[1] - t[0] === 3) t[1] = t[0] + 4;
  return t;
}

// ---- 音色 ------------------------------------------------------------
// **音色も1本ごとに替える。** 割り当て（編成）だけ替えても、楽器の音そのものが
// 毎回同じなら「同じ音楽」に聞こえる（依頼者に実際にそう聞こえた）。
// ここで出した数を sound.js が倍音・波形・立ち上がり・明るさ・唸りに掛ける。
// **音の哲学は動かさない**（美しい方へ振る。雑音で驚かさない）。だから
// 振れる幅は「同じ楽器の別の個体」くらいに収めてある。
const TONE_NAMES = ['硝子', '木', '鐘', '息', '弦'];
function makeTone(rng) {
  const i = Math.floor(rng() * TONE_NAMES.length);
  return {
    name: TONE_NAMES[i],
    melWave: pick(rng, ['sine', 'sine', 'triangle']),
    melBright: between(rng, 0.7, 1.5),
    melDecay: between(rng, 0.75, 1.5),
    harpWave: pick(rng, ['triangle', 'triangle', 'sine', 'sawtooth']),
    harpBright: between(rng, 0.7, 1.6),
    bowAtk: between(rng, 0.6, 1.8),
    bowBright: between(rng, 0.7, 1.7),
    spread: between(rng, 0.5, 2.2),
    bellBright: between(rng, 0.7, 1.4),
    drumTight: between(rng, 0.7, 1.6),
    drumNoise: between(rng, 0.4, 1.5),
    choirBright: between(rng, 0.75, 1.4),
    pizzBright: between(rng, 0.7, 1.5),
  };
}

// ---- 和声の進行 ------------------------------------------------------
// **表から選ばない。** 選択肢が有限だと、いつか必ず同じ進行の作品が出る
// （第六版は進行が定数で、全作品が同じ和音列だった）。
// だから**筋だけを法として与えて、その場で組む。**
//
// 守る筋（＝哲学の側。これは動かさない）:
//   序    解決しない（主和音で終わらない）＝問いを置く
//   提示A 主和音から始まり、主和音以外で閉じる（先へ促す）
//   推移  主和音から始めない
//   提示B 主和音を避ける（対比＝別の調の感じ）
//   展開  最も遠くまで行く。同じ和音を続けない
//   再現A **提示Aと同一**（＝帰ってきた合図）
//   再現B 主和音で始まり主和音で終わる（解決の出どころ）
//   終    主和音で解決する
function makeProg(rng) {
  const d = () => Math.floor(rng() * 7);
  const non0 = () => { let x; do { x = d(); } while (x === 0); return x; };
  // 同じ和音を隣に置かない列
  const walk = (len, first) => {
    const out = [first];
    for (let i = 1; i < len; i++) {
      let x; let guard = 0;
      do { x = d(); guard++; } while (x === out[out.length - 1] && guard < 20);
      out.push(x);
    }
    return out;
  };
  const intro = walk(4, rng() < 0.5 ? 0 : 5);
  if (intro[3] === 0) intro[3] = non0();                   // 解決させない
  const expoA = walk(4, 0);
  if (expoA[3] === 0) expoA[3] = pick(rng, [4, 6, 3]);     // 閉じない
  const trans = walk(4, non0());
  const expoB = walk(4, pick(rng, [2, 4, 5, 3]));
  for (let i = 0; i < 4; i++) if (expoB[i] === 0) expoB[i] = non0();
  const devel = walk(8, non0());
  const recapB = walk(4, 0); recapB[3] = 0;                // 主調で帰る
  const coda = walk(4, 0); coda[3] = 0;                    // 解決する
  return {
    name: intro.join('') + '-' + expoA.join(''),
    intro, expoA, trans, expoB, devel, recapB, coda,
  };
}

// ---- 編成 ------------------------------------------------------------
// こちらも組み立てる。守る筋は2つだけ。
//   ・**再現部は提示部と同じ編成**（同じ主題が同じ姿で帰ることが分かる）
//   ・**隣り合う部は必ずどこかが違う**（部ごとに音色が入れ替わる）
// 声部 0=オルゴール 1=竪琴 2=弓の低音 3=弦の持続 4=鐘 5=太鼓 6=聲 7=弾 8=弦の旋律
function makeBand(rng) {
  const MEL = [0, 8, 6, 0, 8];
  const BASS = [2, 7];
  const PAD = [3, 6];
  const mel = [], bass = [], pad = [];
  for (let i = 0; i < 5; i++) {
    let m; let b; let p; let guard = 0;
    do {
      m = pick(rng, MEL); b = pick(rng, BASS); p = pick(rng, PAD); guard++;
    } while (guard < 24 && i > 0 && m === mel[i - 1] && b === bass[i - 1] && p === pad[i - 1]);
    mel.push(m); bass.push(b); pad.push(p);
  }
  mel[3] = mel[1]; bass[3] = bass[1]; pad[3] = pad[1];     // 再現＝提示
  const NM = { 0: 'オルゴール', 8: '弦', 6: '聲' };
  return { name: mel.map((x) => NM[x] || x).join('・'), mel, bass, pad };
}

// ---- 拍子 ------------------------------------------------------------
// **4/4 だけで6分やると、それだけで「同じ曲」に聞こえる。**
// 拍の数と、1拍をどれだけの長さに取るかを1本ごとに替える。
const METERS = [
  { name: '4/4', beats: 4, div: 8 },
  { name: '3/4', beats: 3, div: 6 },
  { name: '6/8', beats: 6, div: 6, half: 1 },              // 1拍を八分に取る
  { name: '5/4', beats: 5, div: 10 },
  { name: '7/8', beats: 7, div: 7, half: 1 },
  { name: '2/2', beats: 2, div: 8 },
  { name: '9/8', beats: 9, div: 9, half: 1 },
  { name: '12/8', beats: 12, div: 12, half: 1 },
];

// ---- 編成 ------------------------------------------------------------
// 部ごとの楽器立て。**どの部で何が主旋律になるかを1本ごとに替える。**
// 声部 0=オルゴール 1=竪琴 2=弓の低音 3=弦の持続 4=鐘 5=太鼓 6=聲 7=弾 8=弦の旋律
const BANDS = [
  { name: 'オルゴール主', mel: [0, 0, 8, 0, 0], bass: [2, 2, 2, 2, 2], pad: [3, 3, 3, 3, 6] },
  { name: '弦主', mel: [8, 8, 0, 8, 8], bass: [2, 7, 2, 2, 2], pad: [3, 3, 6, 3, 3] },
  { name: '聲主', mel: [0, 8, 6, 0, 6], bass: [2, 2, 7, 2, 2], pad: [6, 3, 3, 3, 6] },
  { name: '弾き主', mel: [0, 0, 8, 8, 0], bass: [7, 7, 2, 7, 2], pad: [3, 6, 3, 3, 3] },
];

// 旋律の種。隣へ動くのを主にして、たまに跳ぶ。山を1つ作る。
function makeTune(rng, len, span) {
  // **メロディの刻みも1本ごとに替える。** 6通りしか無いと似た旋律が出る。
  const rhythms = [
    [1, 1, 2], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2], [2, 1, 1],
    [0.5, 0.5, 0.5, 0.5, 2], [1.5, 0.5, 2], [3, 1], [1, 2, 1],
    [0.75, 0.25, 1, 2], [2, 0.5, 0.5, 1], [0.5, 1, 0.5, 2], [1, 1, 1, 1],
    [2, 2], [0.5, 0.5, 2, 1], [1.5, 1.5, 1], [0.25, 0.25, 0.5, 1, 2],
  ];
  const r = pick(rng, rhythms);
  const out = [];
  let deg = 0;
  for (let i = 0; i < len; i++) {
    const u = i / (len - 1);
    out.push({ deg, beats: r[i % r.length] });
    const up = u < 0.55 ? 0.72 : 0.28;                  // 前半は昇り、後半は降りる
    const jump = rng() < 0.22 ? (rng() < 0.5 ? 2 : 3) : 1;
    deg += (rng() < up ? 1 : -1) * jump;
    deg = Math.max(-2, Math.min(span, deg));
  }
  out[out.length - 1].deg = 0;                          // 終わりは主音へ寄せる
  return out;
}

export function composeMusic(work, seedIn) {
  const seed = (seedIn === undefined ? work.seed : seedIn) | 0;
  const rng = makeRng(seed * 2246822519 + 7);

  // ---- 1本ぶんの素性を種から選ぶ --------------------------------------
  // **音色・メロディ・編成・リズム・調・和音・伴奏を、一つとして固定しない**
  // （依頼者の指定）。動かさないのは根（対比）・型（ソナタ形式）・
  // 6分ちょうど・一つの種・原色の面・コマ打ちだけ。
  const mode = MODES[Math.floor(rng() * MODES.length)];
  const SC = mode.sc;
  const met = METERS[Math.floor(rng() * METERS.length)];
  const prg = makeProg(rng);
  const band = makeBand(rng);
  // 速さ。八分を1拍に取る拍子（6/8・7/8）は、そのぶん速い数字になる
  const tempo = Math.round(between(rng, met.half ? 108 : 48, met.half ? 168 : 92));
  const beat = 60 / tempo;
  const bar = beat * met.beats;
  const tonic = 38 + Math.floor(rng() * 22);            // 主音（調）
  // 伴奏（分散和音）の形。**ここも組み立てる。**
  // 固定だと、和音が動いても伴奏の形が同じで「同じ曲」に聞こえる。
  const arp = (() => {
    const len = 3 + Math.floor(rng() * 6);              // 3〜8
    const out = [rng() < 0.6 ? 0 : 2];
    for (let i = 1; i < len; i++) {
      let x; let g = 0;
      do { x = Math.floor(rng() * 5); g++; } while (x === out[out.length - 1] && g < 12);
      out.push(x);
    }
    return out;
  })();
  const arpOct = pick(rng, [0, 12, 12, -12]);           // 竪琴の高さ
  // 太鼓の打ちかた（拍のどこを打つか。拍子の中に収める）
  const beatsOf = (n) => Array.from({ length: n }, (_, i) => i);
  const DRUMS = [
    [0, met.beats / 2], [0, met.beats - 1], [0, 1, met.beats / 2],
    [0, met.beats * 0.25, met.beats * 0.5, met.beats * 0.75],
    beatsOf(met.beats), [0, met.beats / 3, met.beats * 2 / 3],
  ];
  const drum = DRUMS[Math.floor(rng() * DRUMS.length)].filter((x) => x < met.beats);
  // 低音の歩き。**何拍目をどの音で踏むか**を組み立てる（型から選ばない）
  const bassPat = (() => {
    const n = Math.max(2, Math.min(met.beats, 2 + Math.floor(rng() * 3)));
    const slots = [];
    for (let i = 0; i < n; i++) slots.push((met.beats / n) * i);
    // 段（0=根音 2=三度 4=五度 7=オクターヴ上の根音）
    return slots.map((at, i) => ({ at, step: i === 0 ? 0 : pick(rng, [4, 4, 2, 7]) }));
  })();
  const bassWalk = bassPat.length;
  // 音色（同じ楽器の別の個体くらいの幅で振る）
  const tone = makeTone(rng);
  // **展開部で何が厚みを作るかを替える。** ここを固定すると、
  // どの作品も同じ場所で同じ楽器が入ってきて、山の形が同じに聞こえる。
  const DEVC = ['太鼓と聲', '太鼓', '聲', '弦の厚み', '太鼓と弦'];
  const devColor = DEVC[Math.floor(rng() * DEVC.length)];
  const useBell = rng() < 0.68;            // 部の変わり目の鐘。無い作品もある
  const notes = [];
  const add = (t, d, midi, v, voice) => {
    if (t >= 0 && d > 0.02 && midi > 12 && midi < 108) notes.push({ t, d, midi, v, voice });
  };

  const tuneA = makeTune(rng, 7 + Math.floor(rng() * 2), 7);
  const tuneB = makeTune(rng, 5 + Math.floor(rng() * 3), 5);

  // 1小節ぶんを置く。ch は音階の度（0=主和音）。o.voicing で楽器を入れ替える
  function putBar(t, ch, opt) {
    const o = opt || {};
    const tri = triadOn(SC, ch, { major: o.major, sus: o.sus });
    const root = tri[0];
    const vv = o.v === undefined ? 0.6 : o.v;
    const V = o.voicing || {};
    // 持続 — 弦（3）か聲（6）
    if (o.pad !== false) {
      const pv = V.pad === undefined ? 3 : V.pad;
      for (let i = 0; i < tri.length; i++) {
        add(t, bar * 1.02, tonic + 24 + tri[i], vv * (pv === 6 ? 0.9 : 0.2), pv);
      }
      // 聲が入る部では、弦も薄く重ねて土台を残す
      if (V.choir) for (const x of [tri[0], tri[2] === undefined ? tri[0] : tri[2]]) {
        add(t, bar * 1.02, tonic + 36 + x, vv * 0.75, 6);
      }
    }
    // 低音 — 弓（2）か弾（7）。歩きかたも1本ごとに替える
    if (o.bass !== false) {
      const bv = V.bass === undefined ? 2 : V.bass;
      // 組み立てた歩き（bassPat）を踏む。段は音階から引くので、どの音階でも収まる
      for (let i = 0; i < bassPat.length; i++) {
        const q = bassPat[i];
        const nx = bassPat[i + 1] ? bassPat[i + 1].at : met.beats;
        const d = beat * (nx - q.at);
        const pitch = tonic + root + (q.step === 7 ? 12 : degOf(SC, ch + q.step) - degOf(SC, ch));
        add(t + beat * q.at, bv === 7 ? Math.min(d, beat * 0.6) : d * 0.92,
          pitch, vv * (bv === 7 ? 0.6 : 0.48), bv);
      }
    }
    // 分散和音（竪琴）— **ここが止まらないので、長い景でも音が動く**
    // 形（arp）は1本ごとに選ぶ。固定だと和音が動いても伴奏が同じに聞こえる
    const div = o.div || met.div;
    for (let i = 0; i < div; i++) {
      const k = arp[i % arp.length];
      const oc = (i % 4 === 3) ? Math.abs(arpOct) : 0;
      add(t + (bar / div) * i, bar / div * 1.6,
        tonic + 36 + (arpOct < 0 ? -12 : 0) + degOf(SC, ch + k * 2) + oc,
        vv * (i % 2 ? 0.16 : 0.24), 1);
    }
    // 太鼓。打つ場所も1本ごとに替える
    if (V.drum) {
      for (let i = 0; i < drum.length; i++) {
        if (i > 0 && V.drum < 2 && i > 1) break;        // 弱いうちは2つまで
        const st = drum[i];
        add(t + beat * st, 0.3, tonic - 12 + root + (i % 2 && V.drum > 1 ? tri[2] - tri[0] : 0),
          vv * (st === 0 ? (V.drum > 1 ? 1 : 0.8) : 0.5), 5);
      }
    }
    return tri;
  }

  // 旋律を置く（和音の上に乗せ、強拍は和音の音へ寄せる）
  function putTune(t, tune, ch, opt) {
    const o = opt || {};
    const tri = triadOn(SC, ch, {});
    let cur = t;
    for (const n of tune) {
      const d = n.beats * beat * (o.stretch || 1);
      let p = tonic + 48 + (o.oct || 0) * 12 + degOf(SC, n.deg + (o.shift || 0));
      // 強拍は和音の音に寄せる（外れたままだと濁る）
      if (((cur - t) / beat) % 2 < 0.01) {
        let best = p, bd = 99;
        for (const c of tri) {
          for (let oc = -12; oc <= 24; oc += 12) {
            const cand = tonic + 48 + c + oc;
            const dd = Math.abs(cand - p);
            if (dd < bd) { bd = dd; best = cand; }
          }
        }
        if (bd <= 2) p = best;
      }
      add(cur, d * (o.mel === 8 ? 1.05 : 0.95), p, (o.v === undefined ? 0.75 : o.v), o.mel === undefined ? 0 : o.mel);
      if (o.dbl) add(cur, d * 0.9, p + 12, (o.v === undefined ? 0.5 : o.v) * 0.45, o.dbl);
      cur += d;
    }
    return cur - t;
  }

  // ---- 部ごとに敷く ----
  const sec = work.movements;
  // 編成。**部ごとに楽器が入れ替わる**（mel=主旋律 bass=低音 pad=持続）
  const plan = [
    { i: 0, prog: prg.intro, v: 0.58, div: Math.round(met.div * 0.5), tune: null },
    { i: 1, prog: prg.expoA, v: 0.7, div: met.div, tune: tuneA },
    { i: 2, prog: prg.devel, v: 0.85, div: met.div * 2, tune: 'frag' },
    { i: 3, prog: prg.expoA, v: 0.72, div: met.div, tune: tuneA },   // ＝提示A（帰ってきた合図）
    { i: 4, prog: prg.coda, v: 0.4, div: Math.round(met.div * 0.5), tune: 'end' },
  ];
  // 編成は選んだ組から引く（部ごとに主旋律・低音・持続が入れ替わる）
  for (const pl of plan) {
    pl.vo = { mel: band.mel[pl.i], bass: band.bass[pl.i], pad: band.pad[pl.i] };
  }

  for (const pl of plan) {
    const m = sec[pl.i];
    if (!m) continue;
    const t0 = m.start, t1 = m.start + m.dur;
    let t = t0, k = 0;
    // 提示部と再現部は、途中で第二主題へ移る
    const bMark = (pl.i === 1) ? t0 + m.dur * 0.58 : (pl.i === 3) ? t0 + m.dur * 0.5 : Infinity;
    let inB = false, tuneAt = t0;
    while (t < t1 - bar * 0.4) {
      if (!inB && t >= bMark) {
        inB = true; k = 0; tuneAt = t;
      }
      const prog = inB ? (pl.i === 1 ? prg.expoB : prg.recapB) : pl.prog;
      const ch = prog[k % prog.length];
      // 強さは部の中でも動かす（展開部は登り、終部は消える）
      const u = (t - t0) / Math.max(1, m.dur);
      let v = pl.v;
      if (pl.i === 2) v = pl.v * (0.55 + 0.75 * Math.min(1, u * 1.25));
      if (pl.i === 4) v = pl.v * (1 - u * 0.75);
      if (pl.i === 0) v = pl.v * (0.72 + u * 0.45);
      // 編成を組む。展開部は途中で太鼓が入り、後半で聲が重なる
      const V = Object.assign({}, pl.vo);
      if (inB && pl.i === 1) { V.mel = 8; V.bass = 7; }      // 第二主題で弦と弾く低音へ
      if (inB && pl.i === 3) { V.mel = 8; V.dbl = 0; }       // 再現の第二主題は弦＋オルゴール
      if (pl.i === 2) {
        const wantDrum = devColor.indexOf('太鼓') >= 0;
        const wantChoir = devColor.indexOf('聲') >= 0;
        const wantStr = devColor.indexOf('弦') >= 0;
        if (wantDrum && u > 0.18) V.drum = u > 0.62 ? 2 : 1;
        if (wantChoir && u > 0.55) V.choir = 1;
        if (wantChoir && u > 0.78) V.pad = 6;
        if (wantStr && u > 0.45) V.pad = 3;
        if (wantStr && u > 0.7) V.dbl = 3;
      }
      putBar(t, ch, {
        v, div: Math.max(3, Math.round(inB ? pl.div * 0.75 : pl.div)),
        fifth: k % 2 === 1, voicing: V,
        // 終部の終わりから2つめは宙に浮かせ、最後は長三和音で解決させる
        sus: pl.i === 4 && k === prog.length - 2,
        major: pl.i === 4 && k === prog.length - 1,
      });

      // 旋律
      if (pl.tune === 'frag') {
        // 展開部：主題の頭だけを取り出して、小節ごとに音階を1つずつ上げる
        if (k % 2 === 0) {
          const frag = (k % 4 === 0 ? tuneA : tuneB).slice(0, 3);
          putTune(t, frag, ch, { shift: (k % 6) - 2, v: v * 0.9, stretch: 0.85, mel: V.mel });
        }
      } else if (pl.tune === 'end') {
        if (k === 0) putTune(t, tuneA.slice(0, 3), ch, { stretch: 1.9, v: 0.55 });
        // 終わりの直前、オルゴールが独りで主題の頭を鳴らす
        if (k === prog.length - 2) putTune(t + bar * 0.5, tuneA.slice(0, 4), ch, { stretch: 1.5, v: 0.6, mel: 0 });
        if (k === prog.length - 1) {
          // 最後の和音を長く伸ばす（終わったことが分かるように）
          // **最後だけ長三和音へ寄せる**（ピカルディ）。どの音階でも解決に聞こえる
          const tri = triadOn(SC, ch, { major: 1 });
          for (const x of tri) {
            add(t, Math.max(4, t1 - t), tonic + 24 + x, 0.3, 3);
            add(t, Math.max(4, t1 - t), tonic + 36 + x, 0.18, 3);
            add(t, Math.max(4, t1 - t), tonic + 36 + x, 0.7, 6);   // 聲
          }
          add(t, 6, tonic + 48 + tri[0], 0.5, 4);
        }
      } else if (pl.tune) {
        const tn = inB ? tuneB : pl.tune;
        // 2小節にひとつ、頭から旋律を流す（息継ぎを作る）
        if (t >= tuneAt) {
          const used = putTune(t, tn, ch, {
            v: v * 0.95, stretch: inB ? 1.3 : 1, mel: V.mel, dbl: V.dbl,
          });
          tuneAt = t + Math.max(used, bar * 2) + bar * (rng() < 0.5 ? 0 : 1);
        }
      }
      t += bar;
      k++;
    }
    // 部の変わり目に鐘を1つ（構造を耳に知らせる）
    if (useBell && pl.i > 0 && pl.i < 4) add(t0, 5, tonic + 60 + degOf(SC, pl.prog[0]), 0.3, 4);
  }

  notes.sort((a, b) => a.t - b.t);
  return {
    tempo, tonic, bar, beat, notes, tuneA, tuneB,
    // **素性を返す。** 下見・記録・Suno の prompt がここを読むので、
    // 種を替えたときに嘘にならない（耳で書いた文にしないこと）
    mode: mode.name, meter: met.name, beats: met.beats,
    prog: prg.name, band: band.name, tone, devColor, bell: useBell ? 1 : 0,
    arp: arp.join(''), drum: drum.map((x) => +x.toFixed(2)).join(','),
    bass: bassPat.map((q) => q.at + ':' + q.step).join(' '), bassWalk,
  };
}
