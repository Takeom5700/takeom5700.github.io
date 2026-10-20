// 棚（`art/works/index.html`）が読む台帳に、YouTube の番号を書き足す。
//
//   node art/tools/shelf.mjs "C:\Users\User\Desktop\Claude Art Project"
//   node art/tools/shelf.mjs --list
//
// 棚は「種＋指示書」からその場で作品を再生するので、**映像ファイルは要らない**
// （1本 641MB なので GitHub Pages には置けない。1ファイル100MBの上限がある）。
// ただし「落として持ち歩きたい」ときの行き先は YouTube なので、
// 上げた動画の番号だけは台帳に入れておく。
//
// 番号の出どころは、作品のフォルダに置かれる `.videoid`
// （`upload.mjs --id-file` が書き、`win/upload-latest.ps1` が渡している）。
// **画面の文字を拾わない。** 書式を変えた日に黙って壊れるので。
//
// 何度実行しても同じ結果になる（すでに入っている番号は上書きしない）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(HERE, '..', 'works', 'ledger.json');

const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
const OUT = argv.find((x) => !x.startsWith('--')) || '';

const load = () => {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return { works: [] }; }
};

const ledger = load();

if (has('list')) {
  console.log(`棚: ${ledger.works.length} 本`);
  for (const w of ledger.works) {
    const m = w.materials || {};
    console.log(`  ${w.date}  種${String(w.seed ?? m.seed).padStart(4)}  `
      + `${(w.title || m.題名 || '?').padEnd(12)} ${m.尺 || '?'}秒  `
      + `${w.brief ? '指示書○' : '指示書×'} ${w.youtube ? 'YT○' : 'YT×'}`);
  }
  process.exit(0);
}

if (!OUT) {
  console.error('使い方: node art/tools/shelf.mjs <作品の置場>');
  console.error('        node art/tools/shelf.mjs --list');
  process.exit(2);
}
if (!fs.existsSync(OUT)) {
  console.error('置場が見つかりません: ' + OUT);
  process.exit(1);
}

// 置場のフォルダを見て、`.videoid` を拾う。
// フォルダ名は「日付 題名 番号」なので、そこから種（番号）を取って台帳と突き合わせる。
let added = 0;
for (const name of fs.readdirSync(OUT)) {
  const dir = path.join(OUT, name);
  let st;
  try { st = fs.statSync(dir); } catch (e) { continue; }
  if (!st.isDirectory()) continue;
  const idFile = path.join(dir, '.videoid');
  if (!fs.existsSync(idFile)) continue;
  const id = fs.readFileSync(idFile, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) continue;
  // 「2026-09-22 Zenith 683」→ 日付・題名・番号
  const m = /^(\d{4}-\d{2}-\d{2})\s+(.+)\s+(\d{1,4})$/.exec(name);
  if (!m) continue;
  const [, date, title, tag] = m;
  const seed = parseInt(tag, 10);
  const hit = ledger.works.find((w) => {
    const s = w.seed ?? (w.materials && w.materials.seed);
    return s === seed && (w.date === date || (w.title || '') === title);
  });
  if (!hit) continue;
  if (hit.youtube === id) continue;        // すでに入っている（冪等）
  hit.youtube = id;
  added++;
  console.log(`  ${date} ${title} ${tag} → ${id}`);
}

if (!added) { console.log('書き足すものはありませんでした。'); process.exit(0); }
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
console.log(`台帳に YouTube の番号を ${added} 件書きました。`);
