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

// --dev … 展開部の連続する景を並べる（事が一段ずつ進むのを見る）
if (argv.includes('--dev')) {
  const dev = shots.filter((s) => s.sec === 2);
  const from = Math.floor(dev.length * parseFloat(flag('at', '0.3')));
  const pick = dev.slice(from, from + K * 2);
  const EV = ['無', '崩', '組', '溶', '殖', '落', '侵', '喰', '逃', '来', '芽', '固'];
  const OWN = ['墜', '狩', '花', '呑', '滴', '離', '登', '座', '翻', '解', '芽', '昇', '漏', '割'];
  console.log(`展開部 ${dev.length}景  ${from}番目から ${pick.length}景`);
  console.log(pick.map((s) => `${s.name}${s.ev === 11 ? OWN[s.m] : EV[s.ev | 0]}${(s.evAt >= 0 ? s.evAt.toFixed(2) : '-')}`).join(' '));
  const im = [];
  for (const s of pick) im.push(analyse(await shoot(s.start + s.dur * 0.6)).img);
  page.close();
  fs.writeFileSync(OUT, encode(grid(im, K)));
  console.log(OUT);
  process.exit(0);
}

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
