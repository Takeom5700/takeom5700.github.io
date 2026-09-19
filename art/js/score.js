// 譜（score）— 何を、どの順で、どれだけの長さ見せるか。
//
// **数だけで作る。** 関数も DOM も入れない（入れると1本だけ手で足す道が開き、
// 「同じ法から無限に出る」が嘘になる）。ここが基軸「一・法」の担保。
//
// 第一版との決定的な違い: **カットする。**
// 第一版は「カット禁止・全パラメータを溶かして転換する」と決めていた。
// その結果、依頼者に3回「同じ画面が続いていて退屈」と言われた。
// 溶かす変化＝グラデーションは、時間の上のコントラストを消す装置だった。
// だからこの版は、切る。景（shot）を並べ、間に何も置かない。

import { makeRng, between, pick } from './rng.js';
import { PALETTES, hueGap, lumOf, colorsOf } from './paint.js';
import { NAMES, MOTIFS } from './motif.js';

// 作品と作品のあいだの無（秒）
export const REST = 3.0;

// ---- 基軸の数値（ここが「法」の全部） --------------------------------
export const LAWS = {
  // 断 — 切る
  minCutsPerMin: 9,        // 1分あたりの断の数
  minLenRatio: 30,         // 一番長い景 ÷ 一番短い景
  openCuts: 4,             // 冒頭10秒に最低これだけ断がある
  openWindow: 10,
  // 貌 — 名前のある形
  maxSameShare: 0.26,      // 同じ図が占めてよい時間の割合
  minMotifs: 8,            // 1本で使う図の種類
  // 彩 — 原色を跳ばす
  minJump: 0.30,           // 隣り合う景の色の飛び（色相差 or 明暗差）
  minVivid: 0.55,          // 彩度の高い景の割合
  minInvert: 1,            // 楽章ごとの反転の数
  // 間 — 断の逆。ためが無いと断は効かない
  minHold: 9,              // 楽章ごとに、これ以上の長さの景が1つ要る
  minEmpty: 1,             // 楽章ごとの「ほぼ空」の景
  // 異 — 違和感
  minOdd: 2,               // 楽章ごとの「ひとつだけ違う」
  minHands: 3,             // 1本で使う塗りかたの種類
  // 安全 — 閃光は毎秒3回を超えない（生理的な害を出さないための上限）
  maxFlashPerSec: 3,
};

// ---- 楽章の型 ---------------------------------------------------------
// dur は秒。pool は motif.js の番号。w は句（phrase）の出やすさ。
const ARCH = [
  { name: '兆', dur: 72,  pool: [0, 10, 9, 8],   w: { burst: 4, run: 3, beat: 2, hold: 2 }, fpsHi: 1 },
  { name: '殖', dur: 96,  pool: [1, 4, 11, 8],   w: { burst: 2, run: 4, beat: 3, hold: 3 }, fpsHi: 0 },
  { name: '獣', dur: 84,  pool: [3, 2, 5, 1],    w: { burst: 5, run: 3, beat: 4, hold: 1 }, fpsHi: 1 },
  { name: '裂', dur: 72,  pool: [10, 7, 6, 5],   w: { burst: 5, run: 2, beat: 3, hold: 2 }, fpsHi: 1 },
  { name: '燼', dur: 96,  pool: [7, 0, 9, 2],    w: { burst: 1, run: 2, beat: 1, hold: 5 }, fpsHi: 0 },
];

// 図ごとの「数」の幅。群は数百、眼は1〜12。
const COUNT = {
  0: [1, 12], 1: [70, 420], 2: [1, 1], 3: [1, 7], 4: [1, 1], 5: [1, 1],
  6: [1, 1], 7: [3, 11], 8: [80, 320], 9: [3, 9], 10: [1, 1], 11: [1, 1],
};

function mkShot(rng, arch, dur, prev, mi, id, pals) {
  // 図。直前と同じにはしない（同じ画面が続く＝退屈の正体）
  let m = pick(rng, arch.pool);
  for (let g = 0; g < 8 && prev && m === prev.m; g++) m = pick(rng, arch.pool);
  const c = COUNT[m];
  const short = dur < 0.8;

  // 色。隣と跳ばす（あとで repairColor が仕上げる）
  let pal = pick(rng, pals);
  const inv = rng() < 0.36;

  const sh = {
    id, m, dur,
    n: Math.max(1, Math.round(between(rng, c[0], c[1]))),
    hand: short ? 0 : (rng() < 0.52 ? 0 : 1 + Math.floor(rng() * 3)),
    pal, inv,
    // 地。縞は効きが強すぎるので出にくくしてある（テストパターンに見える）
    gk: pick(rng, [0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5]),
    gx: between(rng, 0.2, 0.8), gy: between(rng, 0.2, 0.8),
    ga: between(rng, 0, Math.PI), gn: Math.floor(rng() * 7), g2: rng() < 0.5,
    // 図の置き場所と癖
    ox: between(rng, -1, 1), oy: between(rng, -1, 1),
    k1: rng(), k2: rng(), k3: between(rng, 0.25, 0.8),
    odd: rng() < 0.3,
    // コマ打ち。滑らかにしない
    fps: short ? 24 : pick(rng, arch.fpsHi ? [12, 12, 8, 24] : [12, 8, 12, 12]),
    boil: rng() < 0.82 ? 1 : 0,
    grain: between(rng, 0.10, 0.30),
    // 画面そのものの動き（段で動く）
    mv: Math.floor(rng() * 5), mvA: between(rng, 0.2, 1),
    // 頭の数コマだけ反転させる（断をさらに強く打つ）
    flash: 0,
    // 景の中での色替え。**長い景がいちばん退屈になる**ので、
    // 途中で色を段で入れ替える（溶かさない）。ここが第三版の要。
    turn: 0, tp1: 0.34, tp2: 0.68, tc1: pal, tc2: pal,
    hang: between(rng, 0, Math.PI), hgap: rng(),
    // 音
    au: {
      hit: short ? 1 + Math.floor(rng() * 3) : (rng() < 0.6 ? 1 + Math.floor(rng() * 3) : 0),
      root: Math.floor(rng() * 12),
      chord: Math.floor(rng() * 4),
      level: between(rng, 0.5, 1),
      silent: 0,
    },
    empty: 0,
  };
  return sh;
}

// 句（phrase）を並べて楽章を組む。
// burst=速い断の束／run=中くらい／beat=二つの図を交互に打つ／hold=ためる。
function buildMovement(arch, rng, mi, start, opening) {
  const shots = [];
  const pals = [];
  {
    const a = Math.floor(rng() * PALETTES.length);
    pals.push(a, (a + 3 + Math.floor(rng() * 4)) % PALETTES.length,
      (a + 7 + Math.floor(rng() * 3)) % PALETTES.length);
  }
  let t = 0, id = 0, holds = 0, lastKind = '';
  const add = (d, prevOverride) => {
    const dur = Math.min(d, arch.dur - t);
    if (dur < 0.12) return null;
    const s = mkShot(rng, arch, dur, shots[shots.length - 1] || prevOverride, mi, id++, pals);
    s.start = start + t;
    t += dur;
    shots.push(s);
    return s;
  };

  // 口火。作品の頭は必ず速い断で始める（冒頭10秒で見るのをやめられる）
  if (opening) {
    for (let i = 0; i < 6; i++) add(between(rng, 0.20, 0.42));
    add(between(rng, 1.4, 2.4));
    for (let i = 0; i < 4; i++) add(between(rng, 0.22, 0.5));
  }

  const kinds = [];
  for (const k in arch.w) for (let i = 0; i < arch.w[k]; i++) kinds.push(k);

  while (arch.dur - t > 0.25) {
    const left = arch.dur - t;
    let kind = pick(rng, kinds);
    if (kind === 'hold' && (left < LAWS.minHold + 2 || lastKind === 'hold')) kind = 'run';
    // 楽章に「ため」が1つも無いまま終わらせない。
    // 余りが「ため」1本ぶんを割る前に必ず取る（束で一気に使い切ると間に合わない）
    if (holds === 0 && left <= LAWS.minHold + 16) kind = 'hold';
    if (left < 2.2) kind = 'run';
    lastKind = kind;

    if (kind === 'burst') {
      const k = 3 + Math.floor(rng() * 5);
      for (let i = 0; i < k && arch.dur - t > 0.15; i++) add(between(rng, 0.17, 0.46));
    } else if (kind === 'run') {
      const k = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < k && arch.dur - t > 0.15; i++) add(between(rng, 0.7, 2.6));
    } else if (kind === 'beat') {
      // 二つの図を交互に。拍を作る（第一版はこれを自分で禁じていた）
      const k = 4 + Math.floor(rng() * 5);
      const d = between(rng, 0.28, 0.75);
      const a = pick(rng, arch.pool);
      let b = pick(rng, arch.pool);
      for (let g = 0; g < 6 && b === a; g++) b = pick(rng, arch.pool);
      const pa = pick(rng, pals), pb = pick(rng, pals);
      for (let i = 0; i < k && arch.dur - t > 0.15; i++) {
        const s = add(d);
        if (!s) break;
        s.m = i % 2 ? b : a;
        s.pal = i % 2 ? pb : pa;
        s.inv = i % 2 === 1;
        s.n = Math.max(1, Math.round(between(rng, COUNT[s.m][0], COUNT[s.m][1])));
        s.au.hit = 2 - (i % 2);
      }
    } else {
      const d = Math.min(left, between(rng, LAWS.minHold + 1, LAWS.minHold + 13));
      const s = add(d);
      if (s) {
        holds++;
        s.fps = pick(rng, [8, 12]);
        // ためる景ほど、途中で色を跳ばす
        s.turn = 2;
        s.mv = pick(rng, [1, 2, 1, 2, 4, 0]);   // 長い景ほど画面を動かす
        s.mvA = between(rng, 0.5, 1);
        s.au.hit = rng() < 0.4 ? 1 : 0;
      }
    }
  }
  // 端数は最後の景に足す（黒を挟まない）
  if (shots.length) {
    const lastShot = shots[shots.length - 1];
    lastShot.dur += arch.dur - t;
  }

  // 色替えの行き先を決める。長い景には必ず入れる
  for (const s of shots) {
    if (s.dur >= 8) s.turn = Math.max(s.turn, 2);
    else if (s.dur >= 3.5 && rng() < 0.6) s.turn = Math.max(s.turn, 1);
    if (!s.turn) continue;
    s.tp1 = between(rng, 0.22, 0.45);
    s.tp2 = between(rng, 0.55, 0.82);
    s.tc1 = pick(rng, pals);
    s.tc2 = pick(rng, pals);
  }

  // 間 — 「ほぼ空」の景を1つ作る。断は、何も無い時間があって初めて効く
  const cand = shots.filter((s) => s.dur > 2.5).sort((a, b) => b.dur - a.dur);
  for (let i = 0; i < LAWS.minEmpty && i < cand.length; i++) {
    const s = cand[cand.length - 1 - i] || cand[0];
    s.empty = 1;
    s.n = Math.max(1, Math.round(COUNT[s.m][0]));
    s.gk = 0;
    s.hand = 1;
  }
  // 異 — ひとつだけ違うものを、楽章に最低2つ置く
  let odd = shots.filter((s) => s.odd).length;
  for (let i = 0; odd < LAWS.minOdd && i < shots.length; i++) {
    if (shots[i].dur > 1.2 && !shots[i].odd) { shots[i].odd = true; odd++; }
  }
  return { name: arch.name, start, dur: arch.dur, shots, pals, pool: arch.pool };
}

// 隣り合う景の色が近いと、切っても切ったように見えない。
// 色相か明暗のどちらかが必ず跳ぶまで、色を差し替える（決定的な繰り返し）。
function jumpOf(a, b) {
  const ca = colorsOf(a), cb = colorsOf(b);
  return Math.max(hueGap(ca.g, cb.g), Math.abs(lumOf(ca.g) - lumOf(cb.g)) * 1.4,
    hueGap(ca.i, cb.i) * 0.8);
}
function repairColor(shots) {
  for (let i = 1; i < shots.length; i++) {
    let g = 0;
    while (jumpOf(shots[i - 1], shots[i]) < LAWS.minJump && g < 40) {
      if (g % 3 === 2) shots[i].inv = !shots[i].inv;
      else shots[i].pal = (shots[i].pal + 5) % PALETTES.length;
      g++;
    }
    // 景の中の色替えも、替えた先が近いと替えたことにならない
    for (const k of ['tc1', 'tc2']) {
      if (!shots[i].turn) continue;
      let h = 0;
      while (jumpOf({ pal: shots[i].pal, inv: shots[i].inv }, { pal: shots[i][k], inv: shots[i].inv }) < LAWS.minJump && h < 24) {
        shots[i][k] = (shots[i][k] + 5) % PALETTES.length;
        h++;
      }
    }
  }
}

// 閃光（頭の数コマの反転）を置く。ただし毎秒 maxFlashPerSec を超えない。
function placeFlash(shots, rng) {
  let lastAt = -9;
  for (const s of shots) {
    if (s.dur < 0.16) continue;
    if (rng() > 0.18) continue;
    if (s.start - lastAt < 1 / LAWS.maxFlashPerSec) continue;
    s.flash = 1 + Math.floor(rng() * 2);
    lastAt = s.start;
  }
}

export function composeWork(seed) {
  const rng = makeRng((seed | 0) * 2654435761 + 12345);
  const movements = [];
  let t = 0;
  // 楽章の順は固定（兆→殖→獣→裂→燼）。長さだけ種で揺らす
  for (let i = 0; i < ARCH.length; i++) {
    const a = Object.assign({}, ARCH[i]);
    a.dur = Math.round(a.dur * between(rng, 0.85, 1.18));
    movements.push(buildMovement(a, rng, i, t, i === 0));
    t += a.dur;
  }
  const shots = [];
  for (const m of movements) for (const s of m.shots) shots.push(s);
  // 通し番号（描画の乱数の素になる）
  for (let i = 0; i < shots.length; i++) shots[i].id = i;
  // 句を組んだあとに図が隣り合ってしまうことがある（beat が上書きするため）。
  // 同じ図が続くと、切っても切ったように見えない＝退屈の正体なので潰す。
  for (const mv of movements) {
    for (let i = 0; i < mv.shots.length; i++) {
      const prev = i > 0 ? mv.shots[i - 1] : null;
      const before = prev || (movements[movements.indexOf(mv) - 1] || { shots: [] }).shots.slice(-1)[0];
      if (!before || before.m !== mv.shots[i].m) continue;
      for (const cand of mv.pool) {
        const next = mv.shots[i + 1];
        if (cand !== before.m && (!next || cand !== next.m)) { mv.shots[i].m = cand; break; }
      }
      const c = COUNT[mv.shots[i].m];
      mv.shots[i].n = Math.max(1, Math.round((c[0] + c[1]) / 2));
    }
  }
  repairColor(shots);
  placeFlash(shots, rng);

  return {
    seed: seed | 0,
    title: '無銘 ' + String(((seed | 0) % 1000 + 1000) % 1000).padStart(3, '0'),
    total: t,
    movements: movements.map((m) => ({ name: m.name, start: m.start, dur: m.dur, shots: m.shots })),
    shots,
  };
}

// 時刻から景を引く（二分探索）
export function shotAt(work, t) {
  const s = work.shots;
  let lo = 0, hi = s.length - 1;
  if (t <= 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// ---- 検査（六法） -----------------------------------------------------
// 「そう書いたか」しか見られない。絵の側は tools/measure.mjs が測る。
export function checkWork(work) {
  const bad = [];
  const S = work.shots;
  const durs = S.map((s) => s.dur);
  // 断
  const cpm = S.length / (work.total / 60);
  if (cpm < LAWS.minCutsPerMin) bad.push(`断: 1分あたり ${cpm.toFixed(1)} 断しかない（${LAWS.minCutsPerMin} 以上）`);
  const ratio = Math.max(...durs) / Math.min(...durs);
  if (ratio < LAWS.minLenRatio) bad.push(`断: 長短の比が ${ratio.toFixed(0)} 倍（${LAWS.minLenRatio} 倍以上）`);
  const open = S.filter((s) => s.start < LAWS.openWindow).length;
  if (open < LAWS.openCuts) bad.push(`断: 冒頭${LAWS.openWindow}秒に ${open} 景しかない（${LAWS.openCuts} 以上）`);
  // 貌
  const share = {};
  for (const s of S) share[s.m] = (share[s.m] || 0) + s.dur;
  const kinds = Object.keys(share).length;
  if (kinds < LAWS.minMotifs) bad.push(`貌: 図が ${kinds} 種しかない（${LAWS.minMotifs} 以上）`);
  for (const k in share) {
    const r = share[k] / work.total;
    if (r > LAWS.maxSameShare) bad.push(`貌: 「${NAMES[k]}」が全体の ${(r * 100) | 0}%（${LAWS.maxSameShare * 100}% 以下）`);
  }
  for (let i = 1; i < S.length; i++) if (S[i].m === S[i - 1].m) bad.push(`貌: ${S[i].start.toFixed(1)}秒で同じ図が続いている`);
  // 彩
  let low = 0;
  for (let i = 1; i < S.length; i++) if (jumpOf(S[i - 1], S[i]) < LAWS.minJump) low++;
  if (low) bad.push(`彩: 色が跳んでいない断が ${low} 箇所`);
  const vivid = S.filter((s) => {
    const c = colorsOf(s);
    return Math.abs(lumOf(c.g) - lumOf(c.i)) > 0.25 || hueGap(c.g, c.i) > 0.3;
  }).length / S.length;
  if (vivid < LAWS.minVivid) bad.push(`彩: 図と地が立っている景が ${(vivid * 100) | 0}%（${LAWS.minVivid * 100}% 以上）`);
  // 彩（景の中）— 長い景は途中で色を跳ばす。ここが無いと長い景＝同じ画面になる
  const longs = S.filter((s) => s.dur >= 8);
  const turned = longs.filter((s) => s.turn >= 1).length;
  if (longs.length && turned < longs.length) bad.push(`彩: 長い景 ${longs.length - turned} 本で途中の色替えが無い`);
  // 間・異
  for (const m of work.movements) {
    if (!m.shots.some((s) => s.dur >= LAWS.minHold)) bad.push(`間: 楽章「${m.name}」に ${LAWS.minHold} 秒以上の景が無い`);
    if (m.shots.filter((s) => s.empty).length < LAWS.minEmpty) bad.push(`間: 楽章「${m.name}」に空の景が無い`);
    if (m.shots.filter((s) => s.odd).length < LAWS.minOdd) bad.push(`異: 楽章「${m.name}」の違和感が足りない`);
    if (m.shots.filter((s) => s.inv).length < LAWS.minInvert) bad.push(`彩: 楽章「${m.name}」に反転が無い`);
  }
  const hands = new Set(S.map((s) => s.hand));
  if (hands.size < LAWS.minHands) bad.push(`異: 塗りかたが ${hands.size} 種しかない（${LAWS.minHands} 以上）`);
  // 安全
  for (let i = 1; i < S.length; i++) {
    if (S[i].flash && S[i - 1].flash && S[i].start - S[i - 1].start < 1 / LAWS.maxFlashPerSec) {
      bad.push(`安全: ${S[i].start.toFixed(1)}秒で閃光が毎秒${LAWS.maxFlashPerSec}回を超える`);
    }
  }
  return bad;
}

export { NAMES, MOTIFS };
