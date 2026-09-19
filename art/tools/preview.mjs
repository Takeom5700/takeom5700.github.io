// 下見。ある種の世界を1枚に並べて、公開するかどうかを決めるための関門。
//
//   node art/tools/preview.mjs 7                 # 種7を下見する
//   node art/tools/preview.mjs 7 --open          # 冒頭10秒だけを並べる
//   node art/tools/preview.mjs 7 --n 16          # 16景ぶん
//
// 種は無限にあるが、**見ていない世界を公開するのは手抜き**なので、
// YouTube に上げる前に必ずここを通す。絵と一緒に実測も出る。

import fs from 'node:fs';
import { open } from './browser.mjs';
import { encode } from './png.mjs';
import { analyse, grid, meanAbsDiff, OK } from './metrics.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);
const SEED = parseInt(argv.find((a) => !a.startsWith('--')) || '0', 10);
const SIZE = flag('size', '480x270');
const N = parseInt(flag('n', '12'), 10);
const [W, H] = SIZE.split('x').map((v) => parseInt(v, 10));
const OUT = flag('out', `mumei-${String(SEED).padStart(3, '0')}.png`);

const page = await open(`export=1&seed=${SEED}&w=${W}&h=${H}`, {
  software: has('sw'),
  size: Math.min(W, 1600) + ',' + Math.min(H, 900),
});
const meta = page.meta;
// 譜の中身を引いて、どの時刻を見るか決める
const shots = JSON.parse(await page.evaluate(
  'JSON.stringify(window.__mumei.list ? window.__mumei.list() : [])'));

console.log(`${meta.title}（種 ${SEED}）  ${(meta.total / 60).toFixed(1)}分  ${meta.shots}景  ${meta.movements.length}楽章`);
console.log(`描画: ${page.software ? 'ソフトウェア' : 'GPU'}   ${W}×${H}`);
console.log(meta.movements.map((m) => `${m.name}${m.dur}s/${m.shots}景`).join('  '));
console.log('');

// 見る景を選ぶ。--open なら冒頭だけ、ふだんは全体から等間隔
let picks = [];
if (has('open')) {
  picks = shots.filter((s) => s.start < 10).slice(0, N);
} else {
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N * meta.total;
    let best = shots[0];
    for (const s of shots) if (s.start <= t) best = s; else break;
    if (!picks.includes(best)) picks.push(best);
  }
}

console.log('時刻   図  長さ  コマ 塗 | 色の幅 画面内 彩度 図の量 面 | 細部  構造 | 判定');
const imgs = [];
let fail = 0, vivid = 0;
const shoot = async (t) => {
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate(`window.__mumei.push(${t})`);
  return buf;
};
for (const s of picks) {
  const t = s.start + Math.min(s.dur * 0.55, s.dur - 1e-3);
  const buf = await shoot(t);
  const a = analyse(buf);
  imgs.push(a.img);
  if (!(a.okContrast || s.empty)) fail++;
  if (a.okColor) vivid++;
  console.log(
    `${String(Math.round(s.start)).padStart(4)}s ${s.name}  ${s.dur.toFixed(2).padStart(5)} ` +
    `${String(s.fps).padStart(3)} ${['塗', '線', '刻', '点'][s.hand]} |` +
    `${a.poster.toFixed(2).padStart(6)} ${a.tileVar.toFixed(2).padStart(6)} ${a.chroma.toFixed(2).padStart(5)} ${a.cover.toFixed(2).padStart(6)} ${a.flat.toFixed(2).padStart(4)} |` +
    `${a.fine.toFixed(4).padStart(7)}${a.coarse.toFixed(4).padStart(7)} | ` +
    `${a.okContrast ? '対比○' : '対比×'} ${a.okColor ? '彩○' : '彩×'}`
  );
}

// 断の実測。切れ目の前後で絵がどれだけ変わるか（＝切って見えるか）
const cuts = shots.filter((s) => s.start > 1 && s.start < meta.total - 1).slice(0, 6);
let cutMin = 1;
for (const s of cuts.filter((_, i) => i % 2 === 0).slice(0, 3)) {
  const a = await shoot(s.start - 0.02), b = await shoot(s.start + 0.02);
  const d = meanAbsDiff(a, b);
  cutMin = Math.min(cutMin, d);
  console.log(`断 ${s.start.toFixed(1)}秒: ${(d * 100).toFixed(1)}% 変化`);
}
// 動の実測。同じ景の中で 0.5 秒に何%動くか
const longShot = shots.filter((s) => s.dur > 6)[0];
let move = 0;
if (longShot) {
  const a = await shoot(longShot.start + 1), b = await shoot(longShot.start + 1.5);
  move = meanAbsDiff(a, b);
  console.log(`動 ${longShot.name}の長い景: 0.5秒で ${(move * 100).toFixed(1)}% 変化`);
}
page.close();

fs.writeFileSync(OUT, encode(grid(imgs, 3)));
console.log('');
console.log(`${OUT}  ${(fs.statSync(OUT).size / 1e6).toFixed(2)}MB`);
const vs = vivid / Math.max(1, picks.length);
if (vs < OK.vividShare) { console.log(`彩が足りない（原色の景が ${(vs * 100) | 0}%）`); fail++; }
else console.log(`彩 原色の景: ${(vs * 100) | 0}%`);
if (cutMin < OK.cutJump) { console.log(`断が弱い（最小 ${(cutMin * 100).toFixed(1)}%）`); fail++; }
if (longShot && move < OK.moveHalf) { console.log(`動が足りない（${(move * 100).toFixed(1)}%）`); fail++; }
if (fail) {
  console.log(`\n${fail}件が基軸に届いていない。この種は公開しないこと。`);
  process.exit(1);
}
console.log('\nこの種は基軸を満たしている。絵を見て、納得できたら書き出す:');
console.log(`  node art/tools/export.mjs 無銘-${String(SEED).padStart(3, '0')}.mp4 --seed ${SEED}`);
