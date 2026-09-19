// 型（ソナタ形式）を1枚で見る道具。
//
//   node art/tools/form.mjs 4
//
// 上段＝提示部の第一主題、下段＝再現部で帰ってきた同じ景。
// **同じ構図が帰ってきているか**を目で確かめるためにある
// （checkWork は「引き写した」としか言えない。絵で見ないと分からない）。

import fs from 'node:fs';
import { open } from './browser.mjs';
import { encode } from './png.mjs';
import { grid, analyse } from './metrics.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const SEED = parseInt(argv.find((a) => !a.startsWith('--')) || '0', 10);
const [W, H] = flag('size', '400x225').split('x').map((v) => parseInt(v, 10));
const OUT = flag('out', `form-${String(SEED).padStart(3, '0')}.png`);
const K = parseInt(flag('n', '4'), 10);

const page = await open(`export=1&seed=${SEED}&w=${W}&h=${H}`, { size: `${W},${H}` });
const shots = JSON.parse(await page.evaluate('JSON.stringify(window.__mumei.list())'));
const shoot = async (t) => {
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate(`window.__mumei.push(${t})`);
  return buf;
};

const expo = shots.filter((s) => s.sec === 1 && s.th === 1);
const recap = shots.filter((s) => s.sec === 3 && s.th === 1 && s.recall);
const n = Math.min(K, expo.length, recap.length);
console.log(`${page.meta.title}（種 ${SEED}）  提示部の第一主題 ${expo.length}景 → 再現部 ${recap.length}景`);

const imgs = [];
for (const s of expo.slice(0, n)) imgs.push(analyse(await shoot(s.start + s.dur * 0.5)).img);
for (const s of recap.slice(0, n)) imgs.push(analyse(await shoot(s.start + s.dur * 0.5)).img);
page.close();

fs.writeFileSync(OUT, encode(grid(imgs, n)));
console.log(`${OUT}   上段=提示部 / 下段=再現部（同じ構図が主調で帰る）`);
