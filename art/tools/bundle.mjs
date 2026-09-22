// 頁を1枚の HTML にまとめる。
//
//   node art/tools/bundle.mjs out.html
//
// 依頼者にすぐ見てもらうための道具。ES モジュールのまま置くと
// http で配らないと動かないので、依存の順に並べて1枚に畳む。
// **作品の一部ではない**（公開しているのは art/index.html のほう）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// **`new URL(import.meta.url).pathname` を使わないこと。**
// Windows では `/C:/Users/...` と頭に `/` が付き、path.resolve が
// `\C:\Users\...` を返す。そこから配ろうとすると全部 404 になり、
// 頁が真っ白のまま「頁が口を出さなかった」で落ちる（実際に落ちた）。
const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../js');
const OUT = process.argv[2] || 'mumei.html';

// 依存の順。ここを間違えると「定義より先に使う」で落ちる
const ORDER = ['rng.js', 'paint.js', 'motif.js', 'event.js', 'score.js', 'music.js', 'sound.js', 'film.js', 'main.js'];

const code = ORDER.map((f) => {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  return '// ==== ' + f + ' ====\n' + src
    .split('\n')
    .filter((l) => !/^import\s.*from\s+'\.\/.*';\s*$/.test(l))   // 相対 import を落とす
    .filter((l) => !/^export\s*\{[^}]*\}\s*;\s*$/.test(l))       // 再エクスポートを落とす
    .map((l) => l.replace(/^export\s+(function|const|let|class)\s/, '$1 '))
    .join('\n');
}).join('\n\n');

const css = fs.readFileSync(path.resolve(HERE, '../css/style.css'), 'utf8')
  .replace(/#back[\s\S]*?\n}\n/g, '')          // 帰り道は1枚版には要らない
  .replace(/body\.(idle|running)[^\n]*#back[^\n]*\n/g, '');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Passage</title>
<style>
${css}
</style>
</head>
<body>
<canvas id="stage"></canvas>
<div id="veil"></div>
<div id="hint">
  <span class="mark">PASSAGE</span>
  <span class="act">触れて始める</span>
  <span class="sub">音が出ます　F で全画面　N で次の種</span>
</div>
<div id="hud"></div>
<script>
(function(){
${code}
})();
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log(`${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
