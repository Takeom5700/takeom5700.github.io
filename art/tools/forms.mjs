// 組んだ形を1つずつ並べて見る道具。**作品ではない。**
// form.js が「名前のある物」を組めているかを、自分の目で確かめるために使う。
//
//   node art/tools/forms.mjs              # 14の骨格を既定の寸法で
//   node art/tools/forms.mjs --seed 7     # 種7 が組んだ寸法で
//   node art/tools/forms.mjs --ev         # 固有の事つきで

import fs from 'node:fs';
import { open } from './browser.mjs';
import { encode } from './png.mjs';
import { grid, analyse } from './metrics.mjs';
import { makeForm, FORM_KEYS, RANGE } from '../js/form.js';
import { makeRng } from '../js/rng.js';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);
const [W, H] = flag('size', '480x270').split('x').map((v) => parseInt(v, 10));
const OUT = flag('out', 'forms.png');
const SEED = parseInt(flag('seed', '0'), 10);

const page = await open(`export=1&seed=0&w=${W}&h=${H}`, { software: has('sw'), size: `${W},${H}` });
const shoot = async () => { let b = null; page.setSink((x) => { b = x; }); await page.evaluate('window.__mumei.send()'); return b; };

const imgs = [];
console.log('形    名  数  色の幅 図の量 細部');
for (let k = 0; k < FORM_KEYS.length; k++) {
  const rng = makeRng(SEED * 7919 + k * 104729 + 11);
  const F = makeForm(rng, k);
  const n = Math.min((RANGE[F.key] || [1, 6])[1], 1 + Math.floor(rng() * 4));
  const over = { n, pal: k % 12, gk: 1, hand: 0, ev: has('ev') ? 11 : 0, evAt: 0.6 };
  await page.evaluate(`window.__mumei.demoForm(${JSON.stringify(F)}, 0.6, ${JSON.stringify(over)})`);
  const buf = await shoot();
  const a = analyse(buf);
  imgs.push(a.img);
  console.log(`${F.key.padEnd(11)} ${F.name}  ${String(n).padStart(2)}  ${a.poster.toFixed(2)}  ${a.cover.toFixed(2)}  ${a.fine.toFixed(4)}`);
}
page.close();
fs.writeFileSync(OUT, encode(grid(imgs, 4)));
console.log(`\n${OUT}`);
