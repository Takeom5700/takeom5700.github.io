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
  keys: [], appr: [], keyLong: [], appRate: [], soft: [], unreal: [],
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
  // 流（キーカットと、その前後の三拍）
  stat.keys.push(w.shots.filter((s) => s.key).length);
  // 縁（境目の硬さ）— 溶ける景が尺のどれだけを占めるか
  stat.soft.push(w.shots.filter((s) => s.hand === 4).reduce((a, s) => a + s.dur, 0) / w.total);
  // 実在しない図（裂・孔・反）が尺のどれだけを占めるか
  {
    const UN = ['rift', 'hollow', 'echo'];
    stat.unreal.push(w.shots.filter((s) => s.form && UN.includes(s.form.key))
      .reduce((a, s) => a + s.dur, 0) / w.total);
  }
  stat.appr.push(w.shots.filter((s) => s.flow === 1).length);
  {
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] || 1; };
    const rs = [];
    for (const mv of w.movements) {
      const k = mv.shots.find((x) => x.key);
      if (k) rs.push(k.dur / med(mv.shots.map((x) => x.dur)));
    }
    stat.keyLong.push(rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length));
    // 寄せの帯が、キーへ向かって何倍に縮むか
    const app = w.shots.filter((x) => x.flow === 1);
    stat.appRate.push(app.length >= 2 ? app[app.length - 1].dur / app[0].dur : 1);
  }
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
console.log('流（キーカットと、その前後）— **景は同格ではない**');
row('キーカットの数（部ごとに1つ）', stat.keys, (v) => v.toFixed(0));
row('キーは部の中央値の何倍', stat.keyLong, (v) => v.toFixed(2) + '倍');
row('寄せの帯の景の数', stat.appr, (v) => v.toFixed(0));
row('寄せで何倍まで縮むか', stat.appRate, (v) => v.toFixed(2) + '倍');
console.log('縁（境目の硬さ）— **溶ける縁は硬い縁があって初めて効く**');
row(`溶ける景の尺の割合（${LAWS.maxSoftShare * 100}% 以下）`, stat.soft, (v) => (v * 100).toFixed(0) + '%');
console.log(`  溶ける縁を使わない作品: ${stat.soft.filter((v) => v === 0).length} / ${N}`
  + '（幾何学的に硬いだけの作品もあってよい）');
console.log('貌（実在しない図）— 裂・孔・反');
row('実在しない図の尺の割合', stat.unreal, (v) => (v * 100).toFixed(0) + '%');
console.log(`  実在しない図が出ない作品: ${stat.unreal.filter((v) => v === 0).length} / ${N}`);
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
    // **その作品が組んだ形の名前で出す**（古い図の表を引くと嘘になる）
    .map(([m, d]) => {
      const f = (w.shots.find((x) => x.m === +m && x.form) || {}).form;
      return `${f ? f.name : NAMES[m]}${((d / w.total) * 100) | 0}%`;
    }).join(' '));
  console.log('  種0の楽章: ' + w.movements.map((m) => `${m.name}${Math.round(m.dur)}s/${m.shots.length}景`).join(' '));
}

// 種：同じ引数なら必ず同じ譜
{
  const a = JSON.stringify(composeWork(7)), b = JSON.stringify(composeWork(7));
  if (a !== b) { bad++; console.error('種: 同じ種から違う譜が出た'); }
  else console.log('  種: 同じ種から同じ譜が出る（一致）');
}

if (bad) { console.error(`\n基軸に反する譜がある（${bad}件）`); process.exit(1); }
console.log('\n譜は基軸を守っている。絵の側は measure.mjs で測ること。');
