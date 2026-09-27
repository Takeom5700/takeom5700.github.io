// Windows 側の道具が壊れていないか見る。**中身が空のまま push するのを止める番。**
//
//   node art/tools/check-win.mjs
//
// なぜ要るのか（2026-09-22 に実際に壊した）:
//   `.ps1` に BOM を付け直すとき
//
//       io.open(p, 'w').write(io.open(p).read())
//
//   と入れ子で書いた。**`open(p, 'w')` は先にファイルを空にする**ので、
//   読む前に中身が消え、**3バイト（BOM だけ）のファイルが出来上がった。**
//   しかもそれを気づかずコミットして push した。`daily.ps1` がその
//   `upload-latest.ps1` を呼んでいたので、**毎朝の投稿が黙って何もしない**
//   状態になっていた（エラーも出ない。空の台本を読んで正常終了する）。
//
// 見るのは3つ。どれも「黙って壊れる」種類のものだけを選んである。
//   1. `.ps1` に UTF-8 の BOM があるか（無いと PowerShell 5.1 が日本語を化かす）
//   2. `.ps1` に中身があるか（空でも PowerShell は正常終了するので気づけない）
//   3. `.bat` が ASCII だけか（cmd が日本語の行を読み損なってコメントを実行する）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WIN = path.join(HERE, 'win');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const MIN = 200;                       // これより小さい .ps1 は中身が無いとみなす

let bad = 0;
const names = fs.readdirSync(WIN).sort();

console.log('Windows 側の道具を見ます: ' + WIN);
console.log('');

for (const n of names) {
  const p = path.join(WIN, n);
  const b = fs.readFileSync(p);
  if (n.endsWith('.ps1')) {
    const hasBom = b.subarray(0, 3).equals(BOM);
    const size = b.length - (hasBom ? 3 : 0);
    const why = [];
    if (!hasBom) why.push('BOM が無い（PowerShell 5.1 が日本語を化かす）');
    if (size < MIN) why.push(`中身が ${size} バイトしか無い（空のまま push した疑い）`);
    if (why.length) { bad++; console.log(`  × ${n}  ${why.join(' / ')}`); }
    else console.log(`  ○ ${n}  ${b.length} バイト`);
  } else if (n.endsWith('.bat')) {
    const nonAscii = [...b].findIndex((x) => x > 0x7f);
    const why = [];
    if (nonAscii >= 0) why.push(`${nonAscii} バイト目に ASCII でない文字がある（cmd が読み損なう）`);
    if (b.length < 50) why.push(`中身が ${b.length} バイトしか無い`);
    if (why.length) { bad++; console.log(`  × ${n}  ${why.join(' / ')}`); }
    else console.log(`  ○ ${n}  ${b.length} バイト`);
  }
}

// `.bat` と `.ps1` が対で在ること（片方だけ足すと、押しても何も起きない）
console.log('');
for (const n of names.filter((x) => x.endsWith('.bat'))) {
  const sib = n.replace(/\.bat$/, '.ps1');
  if (!names.includes(sib)) { bad++; console.log(`  × ${n} に対する ${sib} が無い`); }
}
for (const n of names.filter((x) => x.endsWith('.ps1'))) {
  const sib = n.replace(/\.ps1$/, '.bat');
  if (!names.includes(sib)) { bad++; console.log(`  × ${n} に対する ${sib} が無い`); }
}

console.log('');
if (bad) { console.error(`壊れている道具が ${bad} 件ある。**この状態で push しないこと。**`); process.exit(1); }
console.log('Windows 側の道具は壊れていない。');
