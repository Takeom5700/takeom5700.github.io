// 下見。ある種の世界を1枚に並べて、公開するかどうかを決めるための関門。
//
//   node art/tools/preview.mjs 7                  # 種7を下見する
//   node art/tools/preview.mjs 7 --size 960x540   # 大きく見る
//
// 種は無限にあるが、**見ていない世界を公開するのは手抜き**なので、
// YouTube に上げる前に必ずここを通す。絵と一緒に基軸の実測も出る。
//
// 出るもの:
//   - 楽章ごとの1枚を縦に並べた PNG（そのまま thumbnail の候補にもなる）
//   - 闇と尺の実測、および判定

import fs from 'node:fs';
import path from 'node:path';
import { open } from './browser.mjs';
import { decode, encode } from './png.mjs';
import { analyse, stack, OK } from './metrics.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);
const SEED = parseInt(argv.find((a) => !a.startsWith('--')) || '0', 10);
const SIZE = flag('size', '640x360');
const ACC = parseInt(flag('frames', '10'), 10);
const STEPS = parseInt(flag('steps', '120'), 10);
const [W, H] = SIZE.split('x').map((v) => parseInt(v, 10));
const OUT = flag('out', `mumei-${String(SEED).padStart(3, '0')}.png`);

const page = await open(`export=1&seed=${SEED}&w=${W}&h=${H}&frames=${ACC}&steps=${STEPS}`, {
  software: has('sw'),
  size: Math.min(W, 1600) + ',' + Math.min(H, 900),
});
const meta = page.meta;

console.log(`${meta.title}（種 ${SEED}）  ${(meta.total / 60).toFixed(1)}分  ${meta.movements.length}楽章`);
console.log(`描画: ${page.software ? 'ソフトウェア（遅い）' : 'GPU'}   ${W}×${H} / 蓄積${ACC}枚 / ${STEPS}歩`);
console.log('');
console.log('楽章      時刻   闇:中央値 上位1% |  尺:細部  構造  | 異:空らしさ 彩度 | 判定');

const imgs = [];
let fail = 0;
for (const m of meta.movements) {
  const t = m.start + m.dur * 0.55;
  // 絵は頁から直接バイナリで受け取る（base64 を通すと大きい絵で詰まる）
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate(`window.__mumei.push(${t})`);
  const a = analyse(buf);
  imgs.push(a.img);
  if (!a.okDark || !a.okScale || !a.okOther) fail++;
  console.log(
    `${m.name.padEnd(4)} ${String(Math.round(t)).padStart(6)}s  ` +
    `${a.median.toFixed(4).padStart(8)} ${a.p99.toFixed(3).padStart(6)} | ` +
    `${a.fine.toFixed(4).padStart(7)} ${a.coarse.toFixed(4).padStart(6)} | ` +
    `${a.skyRamp.toFixed(2).padStart(9)} ${a.chroma.toFixed(2).padStart(5)} | ` +
    `${a.okDark ? '闇○' : '闇×'} ${a.okScale ? '尺○' : '尺×'} ${a.okOther ? '異○' : '異×'}`
  );
}
page.close();

fs.writeFileSync(OUT, encode(stack(imgs)));
console.log('');
console.log(`${OUT}  ${(fs.statSync(OUT).size / 1e6).toFixed(1)}MB  ${imgs[0].w}×${imgs.reduce((a, i) => a + i.h, 0)}`);
if (fail) {
  console.log(`\n${fail}楽章が基軸に届いていない。この種は公開しないこと。`);
  process.exit(1);
}
console.log('\nこの種は基軸を満たしている。絵を見て、納得できたら書き出す:');
console.log(`  node art/tools/export.mjs 無銘-${String(SEED).padStart(3, '0')}.mp4 --seed ${SEED}`);
