// 台帳を合わせる。**毎朝の `git stash` で台帳の書き込みが消えるのを防ぐ道具。**
//
//   node art/tools/ledger-merge.mjs <脇へ置いた台帳のパス>
//
// 毎朝の自動実行は、手元の直しかけを `git stash` してから `git pull` する
// （そうしないと「Your local changes would be overwritten by merge」で止まる）。
// ところが **pop していないので、前の晩に書いた台帳もそのまま棚上げされて消える。**
// 台帳が育たないので「1つでも同じなら落とす」が永久に効かず、
// 同じ図が何日も続いた（依頼者「椅子のモチーフは以前見た」——実際にそうなった）。
//
// `git stash pop` で丸ごと戻すと、道具の書き換えまで戻って衝突する。
// 台帳は**追記しかしない**ので、脇に取っておいた写しと突き合わせて足すだけでよい。
// 同じものは (date, seed) で1件に寄せる。**何度実行しても同じ結果になる。**

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(HERE, '..', 'works', 'ledger.json');
const SAVED = process.argv[2];

if (!SAVED) {
  console.error('使い方: node art/tools/ledger-merge.mjs <脇へ置いた台帳のパス>');
  process.exit(2);
}

const read = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { works: [] }; }
};

const now = read(LEDGER);
const saved = read(SAVED);
const seen = new Set();
const out = [];
for (const w of [...now.works, ...saved.works]) {
  if (!w || !w.materials) continue;
  const k = String(w.date) + '|' + String(w.materials.seed) + '|' + String(w.materials.題名);
  if (seen.has(k)) continue;
  seen.add(k);
  out.push(w);
}
out.sort((a, b) => String(a.date).localeCompare(String(b.date)));

const before = now.works.length;
if (out.length === before) {
  console.log(`台帳はそのままです（${before} 本）`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify({ ...now, works: out }, null, 2));
console.log(`台帳を合わせました: ${before} 本 → ${out.length} 本`);
