// 種ごとに「何が違っているか」を数える。**ワンパターンを機械に見せる道具。**
//
//   node art/tools/variety.mjs 40      # 種0〜39を並べて、要素ごとの異なりを数える
//   node art/tools/variety.mjs 40 --list   # 1種ずつ全部出す
//
// 依頼者の求め:
//   「音色、メロディ、編成、リズム、調、和音、伴奏、など音楽要素は
//     一つとして同じものにならないようにして」
//   「毎回違うものにするけれど、根底の哲学は一貫してそうだなと
//     なんとなく思わせられるようにすることが大切」
//
// **だから測るのは2つ。**
//   1. 要素ごとの異なり（多いほどよい）
//   2. **全部まとめて同じ組み合わせの数（0 でなければならない）**
//
// check-axis.mjs が「法を守っているか」を見るのに対し、こちらは
// 「毎回ちゃんと違うか」を見る。**音を触ったら必ず通すこと。**

import { composeWork } from '../js/score.js';
import { composeMusic } from '../js/music.js';
import { NAMES } from '../js/motif.js';
import { LAYER_NAMES } from '../js/layer.js';

const argv = process.argv.slice(2);
const N = parseInt(argv.find((a) => /^\d+$/.test(a)) || '40', 10);
const LIST = argv.includes('--list');

const rows = [];
for (let s = 0; s < N; s++) {
  const w = composeWork(s);
  const m = composeMusic(w);
  const ms = [...new Set(w.shots.map((x) => x.m))];
  rows.push({
    seed: s,
    図: [...new Set(w.shots.filter((x) => x.form).map((x) => x.form.name))].join(''),
    図の寸法: JSON.stringify([...new Map(w.shots.filter((x) => x.form)
      .map((x) => [x.form.key, x.form.P])).values()]),
    序: w.shots[0].form ? w.shots[0].form.name : NAMES[w.shots[0].m],
    尺: w.total.toFixed(0),
    層: LAYER_NAMES[(w.shots.find((x) => x.lay) || {}).lay || 0],
    調: m.tonic + m.mode,
    音階: m.mode,
    拍子: m.meter,
    速さ: m.tempo,
    和音: m.prog,
    編成: m.band,
    伴奏: m.arp,
    低音: m.bass,
    太鼓: m.drum,
    音色: JSON.stringify(m.tone),
    音色の系: m.tone.name,
    展開: m.devColor,
    鐘: m.bell,
    旋律: JSON.stringify(m.tuneA) + JSON.stringify(m.tuneB),
    景: w.shots.length,
    音: m.notes.length,
  });
}

if (LIST) {
  for (const r of rows) {
    console.log(` 種${String(r.seed).padStart(4)} 図${r.図} 序${r.序} 層${r.層.padEnd(3)}`
      + ` ${String(r.調).padEnd(9)} ${r.拍子.padEnd(4)} ${String(r.速さ).padStart(3)}`
      + ` 和音${r.和音} 音色${r.音色の系} 展開${r.展開}`);
  }
  console.log('');
}

// 3つめは**持っている選択肢の数**。0 は「組み立てるので上限なし」。
// **選択肢が7しか無いものに「40通り」を求めるのは不正。**
// 測るべきは「持っている選択肢を使い切っているか」。
const KEYS = [
  ['図', '図の組（名）', 0], ['図の寸法', '図の寸法', 0],
  ['序', '序（＝終）の形', 7], ['層', '層', 4], ['尺', '尺', 0],
  ['調', '調（主音＋音階）', 0], ['音階', '音階', 10], ['拍子', '拍子', 8],
  ['速さ', '速さ', 0], ['和音', '和音の進行', 0], ['編成', '編成', 0],
  ['伴奏', '伴奏の形', 0], ['低音', '低音の歩き', 0], ['太鼓', '太鼓のリズム', 0],
  ['旋律', 'メロディ', 0], ['音色', '音色（中身）', 0], ['音色の系', '音色の系', 5],
  ['展開', '展開部の厚み', 5], ['鐘', '鐘の有無', 2],
];
console.log(`種 0〜${N - 1} を並べて、要素ごとの異なりを数える`);
console.log('');
let weak = 0;
for (const [k, label, pool] of KEYS) {
  const u = new Set(rows.map((r) => String(r[k]))).size;
  const cap = pool ? Math.min(N, pool) : N;      // 出られる上限
  const rate = u / cap;
  const mark = rate >= 0.8 ? '○' : rate >= 0.5 ? '△' : '×';
  if (mark === '×') weak++;
  console.log(`  ${label.padEnd(18, '　')} ${String(u).padStart(4)} 通り / ${String(cap).padStart(3)}`
    + `${pool ? '（持っている選択肢 ' + pool + '）' : '（組み立て）'}  ${mark}`);
}
console.log('');
const sig = rows.map((r) => KEYS.map(([k]) => r[k]).join('|'));
const dup = N - new Set(sig).size;
console.log(`全部まとめて同じ組み合わせ: ${dup} 件  ${dup === 0 ? '○' : '× ワンパターンが出ている'}`);
console.log(`景の数 ${Math.min(...rows.map((r) => r.景))}〜${Math.max(...rows.map((r) => r.景))}`
  + `   音符 ${Math.min(...rows.map((r) => r.音))}〜${Math.max(...rows.map((r) => r.音))}`);
console.log('');
if (dup > 0) { console.log('同じ組み合わせがある。生成の側（makeProg/makeBand/makeTone）を広げること。'); process.exit(1); }
if (weak > 0) { console.log(`ほとんど振れていない要素が ${weak} 件ある（×）。`); process.exit(1); }
console.log('毎回違う。根（十法・ソナタ形式・6分・原色の面）は check-axis.mjs が見る。');
