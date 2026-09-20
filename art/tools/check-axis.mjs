// 譜（score）を基軸で検査する。
//
//   node art/tools/check-axis.mjs [調べる種の数]
//
// 見るのは「譜の側で機械的に確かめられる分」だけ。
// **実際の絵が壁紙になっていないかは measure.mjs が焼いて測る。**
// ここを通っても絵が退屈なことはあり得る（一度そうなった）。

import { composeWork, checkWork, LAWS, NAMES } from '../js/score.js';
import { LAYER_NAMES } from '../js/layer.js';

const N = parseInt(process.argv[2] || '400', 10);
let bad = 0;
const stat = {
  cpm: [], ratio: [], open: [], maxShare: [], kinds: [], hold: [], flash: [], turn: [],
  quiet: [], rests: [],
};
const layCount = {};

for (let seed = 0; seed < N; seed++) {
  const w = composeWork(seed);
  const v = checkWork(w);
  if (v.length) { bad++; console.error(`種 ${seed}: ` + v.join(' / ')); }
  const d = w.shots.map((s) => s.dur);
  const share = {};
  for (const s of w.shots) share[s.m] = (share[s.m] || 0) + s.dur;
  stat.cpm.push(w.shots.length / (w.total / 60));
  stat.ratio.push(Math.max(...d) / Math.min(...d));
  stat.open.push(w.shots.filter((s) => s.start < 10).length);
  stat.maxShare.push(Math.max(...Object.values(share)) / w.total);
  stat.kinds.push(Object.keys(share).length);
  stat.quiet.push(w.shots.filter((x) => x.sparse).reduce((a, x) => a + x.dur, 0) / w.total);
  stat.rests.push(w.shots.filter((x) => x.sparse && x.dur >= 2.5).length);
  const lay = w.shots[0] ? (w.shots[0].lay | 0) : 0;
  layCount[lay] = (layCount[lay] || 0) + 1;
  stat.hold.push(w.shots.filter((s) => s.dur >= LAWS.minHold).length);
  stat.flash.push(w.shots.filter((s) => s.flash).length);
  stat.turn.push(w.shots.filter((s) => s.turn).length);
}

const agg = (a) => ({
  min: Math.min(...a), max: Math.max(...a),
  avg: a.reduce((x, y) => x + y, 0) / a.length,
});
const row = (name, a, f = (v) => v.toFixed(1)) => {
  const g = agg(a);
  console.log(`  ${name.padEnd(22)} 最小 ${f(g.min).padStart(7)}  平均 ${f(g.avg).padStart(7)}  最大 ${f(g.max).padStart(7)}`);
};

console.log(`種 0〜${N - 1} を検査`);
console.log(`  違反のある譜: ${bad} / ${N}`);
console.log('');
console.log('断（切る）');
row('1分あたりの断', stat.cpm);
row('長短の比（倍）', stat.ratio, (v) => v.toFixed(0));
row(`冒頭${LAWS.openWindow}秒の景の数`, stat.open, (v) => v.toFixed(0));
console.log('間（ためる）');
row(`${LAWS.minHold}秒以上の景`, stat.hold, (v) => v.toFixed(0));
console.log('貌（図）— 選別する');
row('1本に出る図の数', stat.kinds, (v) => v.toFixed(0));
row('同じ図の最大占有率', stat.maxShare, (v) => (v * 100).toFixed(0) + '%');
console.log('余白（空ける）');
row('疎な景の尺の割合', stat.quiet, (v) => (v * 100).toFixed(0) + '%');
row('ための景の数', stat.rests, (v) => v.toFixed(0));
console.log('層（断をまたいで続く）');
console.log('  ' + Object.entries(layCount).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${LAYER_NAMES[k] || k} ${n}本`).join('  '));
console.log('彩（色を跳ばす）');
row('景の中で色が替わる数', stat.turn, (v) => v.toFixed(0));
row('閃光の数', stat.flash, (v) => v.toFixed(0));

// 図の使われ方（1本ぶん）
{
  const w = composeWork(0);
  const share = {};
  for (const s of w.shots) share[s.m] = (share[s.m] || 0) + s.dur;
  console.log('');
  console.log('  種0の図の内訳: ' + Object.entries(share).sort((a, b) => b[1] - a[1])
    .map(([m, d]) => `${NAMES[m]}${((d / w.total) * 100) | 0}%`).join(' '));
  console.log('  種0の楽章: ' + w.movements.map((m) => `${m.name}${m.dur}s/${m.shots.length}景`).join(' '));
}

// 種：同じ引数なら必ず同じ譜
{
  const a = JSON.stringify(composeWork(7)), b = JSON.stringify(composeWork(7));
  if (a !== b) { bad++; console.error('種: 同じ種から違う譜が出た'); }
  else console.log('  種: 同じ種から同じ譜が出る（一致）');
}

if (bad) { console.error(`\n基軸に反する譜がある（${bad}件）`); process.exit(1); }
console.log('\n譜は基軸を守っている。絵の側は measure.mjs で測ること。');
