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

import { makeRng, between, pick } from './rng.js';

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6], s: [0, 5, 7] };
// 和音（主音からの半音数と種類）
const CH = {
  i: [0, 'm'], I: [0, 'M'], ii: [2, 'd'], III: [3, 'M'], iv: [5, 'm'],
  v: [7, 'm'], V: [7, 'M'], VI: [8, 'M'], VII: [10, 'M'], isus: [0, 's'],
};

// 部ごとの和声。**再現部は提示部と同じ進行に戻る**（ここが帰ってきた合図）。
const PROG = {
  intro: ['i', 'VI', 'III', 'VII'],            // 解決しない＝問い
  expoA: ['i', 'VII', 'VI', 'V'],
  trans: ['iv', 'VII', 'III', 'VI'],
  expoB: ['III', 'VII', 'VI', 'III'],          // 属調（平行長調）＝明るい
  devel: ['iv', 'ii', 'VII', 'III', 'VI', 'ii', 'v', 'V'],
  recapA: ['i', 'VII', 'VI', 'V'],             // ＝ expoA
  recapB: ['i', 'v', 'VI', 'i'],               // 第二主題を**主調で**
  coda: ['i', 'iv', 'isus', 'I'],              // 最後だけ長三和音（ピカルディ）
};

function scaleAt(deg) {
  const oct = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
  return MINOR[i] + oct * 12;
}

// 旋律の種。隣へ動くのを主にして、たまに跳ぶ。山を1つ作る。
function makeTune(rng, len, span) {
  const rhythms = [[1, 1, 2], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2], [2, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [1.5, 0.5, 2]];
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
  const tempo = Math.round(between(rng, 54, 70));       // 四分音符／分
  const beat = 60 / tempo;
  const bar = beat * 4;
  const tonic = 45 + Math.floor(rng() * 12);            // A2 あたり
  const notes = [];
  const add = (t, d, midi, v, voice) => {
    if (t >= 0 && d > 0.02 && midi > 12 && midi < 108) notes.push({ t, d, midi, v, voice });
  };

  const tuneA = makeTune(rng, 7 + Math.floor(rng() * 2), 7);
  const tuneB = makeTune(rng, 5 + Math.floor(rng() * 3), 5);

  // 1小節ぶんを置く
  function putBar(t, ch, opt) {
    const [root, q] = CH[ch];
    const tri = TRIAD[q].map((x) => root + x);
    const o = opt || {};
    const vv = o.v === undefined ? 0.6 : o.v;
    // 持続（弦）— 和音を小節いっぱい
    if (o.pad !== false) {
      for (let i = 0; i < tri.length; i++) {
        add(t, bar * 1.02, tonic + 24 + tri[i], vv * 0.2, 3);
      }
    }
    // 低音（弓）
    if (o.bass !== false) {
      add(t, bar * 0.55, tonic + root, vv * 0.5, 2);
      add(t + bar * 0.5, bar * 0.5, tonic + root + (o.fifth ? 7 : 12), vv * 0.38, 2);
    }
    // 分散和音（竪琴）— **ここが止まらないので、長い景でも音が動く**
    const div = o.div || 8;
    const pat = [0, 1, 2, 1, 2, 1, 0, 1];
    for (let i = 0; i < div; i++) {
      const k = pat[i % pat.length];
      const oc = (i % 4 === 3) ? 12 : 0;
      add(t + (bar / div) * i, bar / div * 1.6,
        tonic + 36 + tri[k % tri.length] + oc, vv * (i % 2 ? 0.16 : 0.24), 1);
    }
    return tri;
  }

  // 旋律を置く（和音の上に乗せ、強拍は和音の音へ寄せる）
  function putTune(t, tune, ch, opt) {
    const o = opt || {};
    const [root, q] = CH[ch];
    const tri = TRIAD[q].map((x) => root + x);
    let cur = t;
    for (const n of tune) {
      const d = n.beats * beat * (o.stretch || 1);
      let p = tonic + 48 + (o.oct || 0) * 12 + scaleAt(n.deg + (o.shift || 0));
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
      add(cur, d * 0.95, p, (o.v === undefined ? 0.75 : o.v), 0);
      cur += d;
    }
    return cur - t;
  }

  // ---- 部ごとに敷く ----
  const sec = work.movements;
  const plan = [
    { i: 0, prog: PROG.intro, v: 0.58, div: 4, tune: null },
    { i: 1, prog: PROG.expoA, v: 0.7, div: 8, tune: tuneA },
    { i: 2, prog: PROG.devel, v: 0.85, div: 16, tune: 'frag' },
    { i: 3, prog: PROG.recapA, v: 0.72, div: 8, tune: tuneA },
    { i: 4, prog: PROG.coda, v: 0.4, div: 4, tune: 'end' },
  ];

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
      const prog = inB ? (pl.i === 1 ? PROG.expoB : PROG.recapB) : pl.prog;
      const ch = prog[k % prog.length];
      // 強さは部の中でも動かす（展開部は登り、終部は消える）
      const u = (t - t0) / Math.max(1, m.dur);
      let v = pl.v;
      if (pl.i === 2) v = pl.v * (0.55 + 0.75 * Math.min(1, u * 1.25));
      if (pl.i === 4) v = pl.v * (1 - u * 0.75);
      if (pl.i === 0) v = pl.v * (0.72 + u * 0.45);
      putBar(t, ch, { v, div: inB ? Math.max(6, pl.div * 0.75) : pl.div, fifth: k % 2 === 1 });

      // 旋律
      if (pl.tune === 'frag') {
        // 展開部：主題の頭だけを取り出して、小節ごとに音階を1つずつ上げる
        if (k % 2 === 0) {
          const frag = (k % 4 === 0 ? tuneA : tuneB).slice(0, 3);
          putTune(t, frag, ch, { shift: (k % 6) - 2, v: v * 0.9, stretch: 0.85 });
        }
      } else if (pl.tune === 'end') {
        if (k === 0) putTune(t, tuneA.slice(0, 3), ch, { stretch: 1.9, v: 0.55 });
        if (k === prog.length - 1) {
          // 最後の和音を長く伸ばす（終わったことが分かるように）
          const [root, q] = CH[ch];
          for (const x of TRIAD[q]) {
            add(t, Math.max(4, t1 - t), tonic + 24 + root + x, 0.3, 3);
            add(t, Math.max(4, t1 - t), tonic + 36 + root + x, 0.18, 3);
          }
          add(t, 6, tonic + 48 + root, 0.5, 4);
        }
      } else if (pl.tune) {
        const tn = inB ? tuneB : pl.tune;
        // 2小節にひとつ、頭から旋律を流す（息継ぎを作る）
        if (t >= tuneAt) {
          const used = putTune(t, tn, ch, { v: v * 0.95, oct: inB ? 0 : 0, stretch: inB ? 1.3 : 1 });
          tuneAt = t + Math.max(used, bar * 2) + bar * (rng() < 0.5 ? 0 : 1);
        }
      }
      t += bar;
      k++;
    }
    // 部の変わり目に鐘を1つ（構造を耳に知らせる）
    if (pl.i > 0 && pl.i < 4) add(t0, 5, tonic + 60 + CH[pl.prog[0]][0], 0.3, 4);
  }

  notes.sort((a, b) => a.t - b.t);
  return { tempo, tonic, bar, beat, notes, tuneA, tuneB };
}
