// 譜（score）を基軸で検査する。
//
//   node art/tools/check-axis.mjs [調べる種の数]
//
// 見るのは「譜の側で機械的に確かめられる分」だけ。
// 実際の絵の暗さ・尺度の同居・カットの無さは measure.mjs が
// 書き出したフレームを測って確かめる。
//
// 変奏（seed != 0）は自動生成なので、ここを通らない譜が出るようなら
// compose.js の揺らし幅が広すぎるということ。

import { composeWork, checkWork, LAWS, resolve, cameraAt, CAM_DT } from '../js/compose.js';

const N = parseInt(process.argv[2] || '400', 10);
let bad = 0, worst = null;

for (let seed = 0; seed < N; seed++) {
  const w = composeWork(seed);
  const v = checkWork(w);
  if (v.length) { bad++; if (!worst) worst = v; console.error(v.join('\n')); }
}

// 譜を時間で解いたとき、パラメータが飛ばない（＝カットが無い）ことを確かめる。
// 溶解しかないので、隣り合う時刻の差は必ず小さいはず。
// 「0.25秒で、その値が作品全体で動く幅の何割が動いたか」を見る。
// 値そのものに対する比で見ると、0 をまたぐ欄（riftWobble など）で
// いつでも 100% になってしまい、何も測れない。
function continuity(seed) {
  const w = composeWork(seed);
  const DT = 0.25;
  const series = [];
  for (let t = 0; t <= w.total; t += DT) series.push(resolve(w, t).params);
  const keys = [];
  for (const k in series[0]) {
    const n = Array.isArray(series[0][k]) ? series[0][k].length : 1;
    for (let i = 0; i < n; i++) keys.push([k, n > 1 ? i : -1]);
  }
  let maxJump = 0, at = 0, key = '';
  for (const [k, i] of keys) {
    const get = (p) => (i < 0 ? p[k] : p[k][i]);
    let lo = Infinity, hi = -Infinity;
    for (const p of series) { const v = get(p); if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo;
    if (span <= 1e-9) continue;   // 動かない欄は見る必要がない
    for (let n = 1; n < series.length; n++) {
      const rel = Math.abs(get(series[n]) - get(series[n - 1])) / span;
      if (rel > maxJump) { maxJump = rel; at = n * DT; key = k + (i < 0 ? '' : '[' + i + ']'); }
    }
  }
  return { maxJump, at, key };
}

// 視点が決定的に積まれること（同じ時刻から必ず同じ位置が出る）
function determinism(seed) {
  const w = composeWork(seed);
  const a = cameraAt(w, 123.5), b = cameraAt(w, 123.5);
  const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const steps = Math.floor(123.5 / CAM_DT);
  return { d, steps };
}

console.log(`種 0〜${N - 1} を検査`);
console.log(`  違反のある譜: ${bad} / ${N}`);

for (const seed of [0, 1, 7, 99]) {
  const c = continuity(seed);
  const det = determinism(seed);
  const w = composeWork(seed);
  const ok = c.maxJump < 0.06 && det.d === 0;
  console.log(
    `  種 ${String(seed).padStart(3)} ${w.title.padEnd(10)} ` +
    `${(w.total / 60).toFixed(1)}分 ${w.movements.length}楽章  ` +
    `0.25秒あたりの最大変化 ${(c.maxJump * 100).toFixed(2)}% (${c.key} @${c.at}s)  ` +
    `視点の再現 ${det.d === 0 ? '一致' : 'ずれ ' + det.d}  ${ok ? '○' : '×'}`
  );
  if (!ok) bad++;
}

console.log(`  一楽章の最短 ${LAWS.minMovementSec}秒 / 転換の最短 ${LAWS.minMorphSec}秒 / 尺の比 ${LAWS.minScaleRatio}倍以上`);

if (bad) { console.error(`\n基軸に反する譜がある（${bad}件）`); process.exit(1); }
console.log('\n譜は基軸を守っている。');
