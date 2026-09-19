// 図（motif）を1つずつ並べて見るための道具。**作品ではない。**
// 形を詰めているあいだ、12 の図が実際にどう写るかを1枚で確かめる。
//
//   node art/tools/sheet.mjs                 # 12の図を既定の条件で
//   node art/tools/sheet.mjs --hand 2        # 塗りかたを変えて
//   node art/tools/sheet.mjs --m 3 --vary p  # 獣だけ、時間で並べる

import fs from 'node:fs';
import { open } from './browser.mjs';
import { encode } from './png.mjs';
import { decode } from './png.mjs';
import { grid, analyse } from './metrics.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);
const SIZE = flag('size', '480x270');
const [W, H] = SIZE.split('x').map((v) => parseInt(v, 10));
const OUT = flag('out', 'motifs.png');
const N = [12, 260, 1, 4, 1, 1, 1, 7, 200, 6, 1, 1];
const NAMES = ['眼', '群', '手', '獣', '樹', '面', '波', '火', '雨', '輪', '裂', '衆'];

const page = await open(`export=1&seed=0&w=${W}&h=${H}`, { software: has('sw'), size: `${W},${H}` });
const imgs = [];
const shoot = async () => {
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate('window.__mumei.send()');
  return buf;
};

const only = has('m') ? parseInt(flag('m', '0'), 10) : null;
const list = only === null
  ? NAMES.map((_, m) => ({ m, p: parseFloat(flag('p', '0.6')), over: {} }))
  : [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95].map((p) => ({ m: only, p, over: {} }));

console.log('図  色の幅 画面内 彩度  図の量 細部   構造');
for (const it of list) {
  const over = Object.assign({
    n: N[it.m],
    hand: parseInt(flag('hand', '0'), 10),
    pal: parseInt(flag('pal', String(it.m % 12)), 10),
    gk: parseInt(flag('gk', '1'), 10),
  }, it.over);
  await page.evaluate(`window.__mumei.demo(${it.m}, ${it.p}, ${JSON.stringify(over)})`);
  const buf = await shoot();
  const a = analyse(buf);
  imgs.push(a.img);
  console.log(`${NAMES[it.m]}  ${a.poster.toFixed(2).padStart(5)} ${a.tileVar.toFixed(2).padStart(6)} ` +
    `${a.chroma.toFixed(2).padStart(5)} ${a.cover.toFixed(2).padStart(6)} ${a.fine.toFixed(4).padStart(7)} ${a.coarse.toFixed(4).padStart(7)}`);
}
page.close();
fs.writeFileSync(OUT, encode(grid(imgs, 4)));
console.log(`\n${OUT}`);
