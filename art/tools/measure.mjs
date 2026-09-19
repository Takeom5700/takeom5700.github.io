// 焼いた絵を測る。**「そう書いたか」ではなく「そう見えるか」を見る。**
//
//   node art/tools/measure.mjs [種]
//
// check-axis.mjs は譜しか見られない。譜が正しくても、
// 絵が壁紙で、切っても絵が変わらなければ、それは退屈な映像である。
// ここで測るのは4つ。
//
//   断 … 切れ目をまたいで、絵がどれだけ変わるか（変わらない断は断ではない）
//   動 … 同じ景の中で、0.5秒でどれだけ動くか（静止画に見えないか）
//   対比 … 1枚の中に、違う性格の区画があるか（tileVar）
//   種 … 同じ引数なら同じ絵か

import { open } from './browser.mjs';
import { analyse, meanAbsDiff, OK } from './metrics.mjs';

const SEED = parseInt(process.argv[2] || '0', 10);
const has = (n) => process.argv.includes('--' + n);
const W = 480, H = 270;

const page = await open(`export=1&seed=${SEED}&w=${W}&h=${H}`, { software: has('sw'), size: `${W},${H}` });
const meta = page.meta;
const shots = JSON.parse(await page.evaluate('JSON.stringify(window.__mumei.list())'));
const shoot = async (t) => {
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate(`window.__mumei.push(${t})`);
  return buf;
};

console.log(`${meta.title}（種 ${SEED}）を ${W}×${H} で測る  ${meta.shots}景 / ${(meta.total / 60).toFixed(1)}分`);
let fail = 0;

// ---- 断 ----------------------------------------------------------------
// 切れ目の 1/96 秒前後を測る。**この作品ではここが大きいほど正しい。**
// （第一版は逆で、ここが小さいことを法にしていた。それが退屈の原因だった。）
console.log('');
console.log('断（切れ目をまたぐ変化。大きいほど切れている）');
const picks = [];
for (let i = 1; i < shots.length; i += Math.max(1, Math.floor(shots.length / 8))) picks.push(shots[i]);
let cutMin = 1, cutSum = 0;
for (const s of picks.slice(0, 8)) {
  const d = meanAbsDiff(await shoot(s.start - 1 / 96), await shoot(s.start + 1 / 96));
  cutMin = Math.min(cutMin, d); cutSum += d;
  console.log(`  ${String(s.start.toFixed(1)).padStart(6)}s → ${s.name}  ${(d * 100).toFixed(1).padStart(5)}%  ${d >= OK.cutJump ? '○' : '×'}`);
  if (d < OK.cutJump) fail++;
}
console.log(`  平均 ${(cutSum / Math.min(8, picks.length) * 100).toFixed(1)}%（${OK.cutJump * 100}% 以上が合格）`);

// ---- 動 ----------------------------------------------------------------
console.log('');
console.log('動（同じ景の中で 0.5 秒に動く量）');
const longs = shots.filter((s) => s.dur > 4).slice(0, 5);
for (const s of longs) {
  const t = s.start + s.dur * 0.3;
  const d = meanAbsDiff(await shoot(t), await shoot(t + 0.5));
  console.log(`  ${s.name} ${s.dur.toFixed(1)}s ${s.fps}コマ  ${(d * 100).toFixed(2).padStart(5)}%  ${d >= OK.moveHalf ? '○' : '× 静止画に見える'}`);
  if (d < OK.moveHalf) fail++;
}

// ---- 対比（1枚の中） ----------------------------------------------------
console.log('');
console.log('対比（1枚の中）  色の幅 区画のばらつき 彩度 図の量');
let vivid = 0, n = 0, weak = 0;
for (let i = 0; i < 10; i++) {
  const s = shots[Math.floor((i + 0.5) / 10 * shots.length)];
  const a = analyse(await shoot(s.start + s.dur * 0.5));
  n++;
  if (a.okColor) vivid++;
  const ok = a.okContrast || s.empty;
  if (!ok) weak++;
  console.log(`  ${String(Math.round(s.start)).padStart(5)}s ${s.name}  ${a.poster.toFixed(2)}  ${a.tileVar.toFixed(2)}  ${a.chroma.toFixed(2)}  ${a.cover.toFixed(2)}  ${ok ? '○' : '×'}`);
}
// 静かな景は法「間」が要求しているので、1〜2割までは通す
if (weak > Math.max(1, Math.ceil(n * 0.15))) { console.log(`  対比の弱い景が ${weak}/${n}`); fail++; }
const vs = vivid / n;
console.log(`  原色の景: ${(vs * 100) | 0}%（${OK.vividShare * 100}% 以上が合格）`);
if (vs < OK.vividShare) fail++;

// ---- 冒頭10秒 ----------------------------------------------------------
{
  const head = shots.filter((s) => s.start < 10);
  let sum = 0;
  for (let i = 1; i < head.length; i++) {
    sum += meanAbsDiff(await shoot(head[i].start - 1 / 96), await shoot(head[i].start + 1 / 96));
  }
  console.log('');
  console.log(`冒頭10秒: ${head.length}景 / 断のたびに平均 ${(sum / Math.max(1, head.length - 1) * 100).toFixed(0)}% 変わる`);
  if (head.length < 4) fail++;
}

// ---- 種 ----------------------------------------------------------------
{
  const a = await shoot(61.234), b = await shoot(61.234);
  const same = Buffer.from(a).equals(Buffer.from(b));
  console.log(`種: 同じ引数の再現  ${same ? '一致（バイト単位）' : '×  一致しない'}`);
  if (!same) fail++;
}

page.close();
console.log('');
if (fail) { console.error(`基軸に届いていない項目が ${fail} 件ある`); process.exit(1); }
console.log('焼いた絵は基軸を満たしている。');
