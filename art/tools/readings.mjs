// **同じ記事の、いくつもの読み**を並べる道具。
//
//   node art/tools/readings.mjs --title "人が減っていく町" --body-file kiji.txt --n 8
//   node art/tools/readings.mjs --title "..." --body "..." --n 6
//   node art/tools/readings.mjs --rss https://note.com/alert_zinnia5671/rss --n 6
//
// 依頼者:
//   「同じ記事であってもいくつも全く新しい別のものができるっていうぐらいのことを、
//     作ろうと思えばできるような仕組みにしていてね」
//
// 記事1本から読みを N 通り出して並べる。**選んでから焼く。**
// 気に入った読みの種を `daily.mjs --seed <種>` に渡せば、その読みで焼ける。
//
// 「直接さ」は**記事をそのまま形にする度合い**。
//   低い … 語から離れる（説明にならない。抽象の側）
//   高い … 記事がいちばん強く言っていることをそのまま形にする
// **どちらも許す**（依頼者「説明的にはならない方がいいというのはあるが、時によって」）。

import fs from 'node:fs';
import { briefFromText } from '../js/brief.js';
import { FORM_KEYS } from '../js/form.js';
import { LAYER_NAMES } from '../js/layer.js';
import { composeWork } from '../js/score.js';
import { composeMusic } from '../js/music.js';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const N = parseInt(flag('n', '8'), 10);
const FROM = parseInt(flag('from', '1'), 10);

let title = flag('title', '');
let body = flag('body', '');
const bf = flag('body-file', '');
if (bf) body = fs.readFileSync(bf, 'utf8');

const rss = flag('rss', '');
if (rss) {
  const xml = await (await fetch(rss, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const m = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (m) {
    const pick = (t) => {
      const g = m[1].match(new RegExp('<' + t + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + t + '>'));
      return g ? g[1].trim() : '';
    };
    title = title || pick('title');
    body = body || pick('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
if (!title && !body) {
  console.error('使い方: node art/tools/readings.mjs --title "..." --body-file kiji.txt [--n 8]');
  process.exit(2);
}

console.log(`記事「${title}」${body.length}字`);
console.log(`読みを ${N} 通り出す（種 ${FROM}〜${FROM + N - 1}）`);
console.log('');
console.log('  種   直接さ 読む所 形                                        層    尺   調          拍子  楽器');
const sigs = new Set();
for (let i = 0; i < N; i++) {
  const seed = FROM + i;
  const b = briefFromText({ title, body }, seed);
  const w = composeWork(seed, b);
  const m = composeMusic(w);
  sigs.add(b.forms.join(',') + '|' + b.layer + '|' + b.total + '|' + m.mode + m.meter);
  console.log(` ${String(seed).padStart(4)}  ${String(b.from.直接さ).padEnd(5)} ${b.from.読んだ場所.padEnd(3)}`
    + ` ${b.forms.map((k) => FORM_KEYS[k]).join(' ').padEnd(42)}`
    + ` ${LAYER_NAMES[b.layer].padEnd(3)} ${(w.total / 60).toFixed(1)}分`
    + ` ${(m.tonic + m.mode).padEnd(10)} ${m.meter.padEnd(5)} ${m.tone.voices.slice(0, 3).join('・')}`);
}
console.log('');
console.log(`別物になった読み: ${sigs.size} / ${N}`);
console.log('');
console.log('気に入った読みで焼く:');
console.log('  node art/tools/daily.mjs --seed <その種> --key "<記事のURL>" --no-feed');
console.log('下見だけ見る:');
console.log('  node art/tools/preview.mjs <その種>');
