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
import { analyse, meanAbsDiff, cutChange, OK } from './metrics.mjs';

const SEED = parseInt(process.argv[2] || '0', 10);
const has = (n) => process.argv.includes('--' + n);
const flag = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const W = 480, H = 270;

const BRIEF = flag('brief', '');
const page = await open(`export=1&seed=${SEED}&w=${W}&h=${H}`
  + `${BRIEF ? '&brief=' + BRIEF : ''}`, { software: has('sw'), size: `${W},${H}` });
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
  const d = cutChange(await shoot(s.start - 1 / 96), await shoot(s.start + 1 / 96)).change;
  cutMin = Math.min(cutMin, d); cutSum += d;
  console.log(`  ${String(s.start.toFixed(1)).padStart(6)}s → ${s.name}  ${(d * 100).toFixed(1).padStart(5)}%  ${d >= OK.cutJump ? '○' : '×'}`);
  if (d < OK.cutJump) fail++;
}
console.log(`  平均 ${(cutSum / Math.min(8, picks.length) * 100).toFixed(1)}%（${OK.cutJump * 100}% 以上が合格）`);

// ---- 動 ----------------------------------------------------------------
// **長い景を全部見ること。** 頭から5枚しか見ていなかったので、4〜5秒の景ばかりが
// 当たり、10秒を超える景がずっと測られていなかった（**長い景の 14% が
// 静止画に見えていた。実測 134枚**）。一色の面の映像では、カメラの振幅を
// 上げてもこれは消えない——寄りも流しも、平らな面の中では縁の細い帯しか
// 動かさない。動いて見せるのは**色の段**である（score.js の `stepColors`）。
//
// **1枚も許さないのは間違い。** 法「間」がためを要求している以上、
// 静かな長い景は必ず混ざる（対比の弱い景を 15% まで通すのと同じ理屈）。
// だから1枚ずつ落とすのではなく、**枚数で見る。**
console.log('');
console.log('動（同じ景の中で 0.5 秒に動く量）');
{
  const all = shots.filter((s) => s.dur > 4);
  const rows = [];
  for (const s of all) {
    for (const f of (s.dur > 8 ? [0.3, 0.7] : [0.3])) {
      const t = s.start + s.dur * f;
      const d = meanAbsDiff(await shoot(t), await shoot(t + 0.5));
      rows.push({ s, d });
    }
  }
  const still = rows.filter((r) => r.d < OK.moveHalf);
  // 静かな方から5枚だけ並べる（全部並べると読めない）
  for (const r of rows.slice().sort((x, y) => x.d - y.d).slice(0, 5)) {
    console.log(`  ${r.s.name} ${r.s.dur.toFixed(1)}s ${r.s.fps}コマ mv${r.s.mv}`
      + `  ${(r.d * 100).toFixed(2).padStart(6)}%  ${r.d >= OK.moveHalf ? '○' : '× 静止画に見える'}`);
  }
  // 枚数が少ない作品もあるので、1枚は必ず通す（対比の弱い景と同じ扱い）
  const cap = Math.max(1, Math.ceil(rows.length * 0.15));
  console.log(`  4秒を超える景 ${rows.length} 枚のうち 静止画に見える ${still.length} 枚`
    + `（${cap} 枚まで合格）  ${still.length <= cap ? '○' : '×'}`);
  if (still.length > cap) fail++;
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
  // **余白の景は別の基準で見る。** 図を小さく置いた景は、
  // 区画ごとの散らばり（tileVar）が低いのが当たり前で、そこが余白の効きである。
  // 見るのは「形がちゃんと在るか（cover）」と「色が立っているか（poster）」だけ。
  const ok = s.empty ? true
    : s.sparse ? (a.posterSmall >= OK.poster && a.cover >= 0.004 && a.cover <= 0.4)
    : a.okContrast;
  if (!ok) weak++;
  console.log(`  ${String(Math.round(s.start)).padStart(5)}s ${s.name}${s.sparse ? '余' : '　'}  ${a.poster.toFixed(2)}  ${a.tileVar.toFixed(2)}  ${a.chroma.toFixed(2)}  ${a.cover.toFixed(2)}  ${ok ? '○' : '×'}`);
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
    sum += cutChange(await shoot(head[i].start - 1 / 96), await shoot(head[i].start + 1 / 96)).change;
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
