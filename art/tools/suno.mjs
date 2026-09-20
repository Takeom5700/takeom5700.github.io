// Suno に持っていくための音源と style prompt を作る。
//
//   node art/tools/suno.mjs 4
//   node art/tools/suno.mjs 4 --dir ./out
//
// 出るもの:
//   Passage-004-音楽.wav        全長（48kHz ステレオ）— 参照用・長さのある取り込み用
//   Passage-004-音楽-60秒.wav   いちばん性格の出ている60秒 — Suno の取り込みは短い方が通る
//   Passage-004-suno.txt        style prompt（短・長）、除外タグ、構成のメモ
//
// **style prompt は譜から組む。** 耳で聞いて書くと、種を変えたときに嘘になる。
// 音色・調・速さ・部ごとの編成は `window.__mumei.musicInfo()` が譜から返す。

import fs from 'node:fs';
import path from 'node:path';
import { open } from './browser.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const SEED = parseInt(argv.find((a) => !a.startsWith('--')) || '0', 10);
const DIR = flag('dir', '.');
const tag = String(((SEED % 1000) + 1000) % 1000).padStart(3, '0');
const stem = path.join(DIR, `Passage-${tag}`);
fs.mkdirSync(DIR, { recursive: true });

const page = await open(`export=1&seed=${SEED}&w=160&h=90`, { size: '160,90' });
const info = JSON.parse(await page.evaluate('JSON.stringify(window.__mumei.musicInfo())'));

// 短調はフラットで書くのが普通（D# minor ではなく Eb minor）
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const key = NOTE[((info.tonic % 12) + 12) % 12] + ' minor';
const secName = { 序: 'Intro', 提: 'Exposition', 展: 'Development', 再: 'Recapitulation', 終: 'Coda' };
const allVoices = [...new Set(info.sections.flatMap((s) => s.voices))];

// いちばん性格の出ている60秒＝提示部の頭（第一主題が素で出るところ）
const expo = info.sections[1] || info.sections[0];
const from = Math.max(0, expo.start + 4);
const to = Math.min(info.total, from + 60);

console.log(`Passage ${tag}  ${(info.total / 60).toFixed(1)}分  ${info.tempo}BPM  ${key}  音符${info.notes}`);
for (const s of info.sections) {
  console.log(`  ${s.name} ${String(Math.round(s.dur)).padStart(3)}s  ${s.voices.join(', ')}`);
}

// ---- 音源 ----
const grab = async (a, b, out) => {
  const fd = fs.openSync(out, 'w');
  let got = 0;
  page.setSink((buf) => { fs.writeSync(fd, buf); got += buf.length; });
  const r = await page.evaluate(`window.__mumei.audio(${a}, ${b})`);
  fs.closeSync(fd);
  if (!r) { fs.rmSync(out, { force: true }); console.log(`${path.basename(out)} は焼けなかった`); return; }
  console.log(`${path.basename(out)}  ${(got / 1e6).toFixed(1)}MB  ${(b - a).toFixed(0)}秒`);
};
console.log('');
await grab(from, to, `${stem}-音楽-60秒.wav`);
if (!argv.includes('--short')) await grab(0, info.total, `${stem}-音楽.wav`);
page.close();

// ---- style prompt ----
const short = `${key}, ${info.tempo} BPM, melancholic minimal chamber score, `
  + `music box and harp over slow bowed strings, wordless choir, soft timpani, `
  + `sparse and spacious, analog hall reverb, instrumental`;

// **長い欄は 1000 文字まで。** Suno の style 欄に収まらないと切られるので、
// 入らなければ後ろから落とす（作りかたの話 → 響きの話 → 形の話 の順で捨てる）。
// 楽器名も短く書く（`bowed bass` → `bass`）。意味は変わらない。
const SHORT = {
  'bowed bass': 'bass', 'string pad': 'pad', 'wordless choir': 'choir',
  'soft timpani': 'timpani', 'strings lead': 'strings', 'pizzicato': 'pizz',
};
const shorten = (v) => SHORT[v] || v;
const sectionLines = info.sections.map((s) =>
  `${secName[s.name] || s.name} ${Math.round(s.dur)}s: ${s.voices.map(shorten).join(', ')}`);

const head = [
  `${key}, ${info.tempo} BPM, 4/4. Melancholic minimal chamber score — something`,
  `beautiful still playing after everyone has gone. Acoustic and tonal,`,
  `never synthetic or ominous.`,
  ``,
  `Music box carries the melody; harp keeps a broken-chord figure moving underneath;`,
  `bowed strings hold slow pads; timpani and wordless choir enter from the middle.`,
  ``,
  ...sectionLines,
].join('\n');
const form = `Sonata form: the second subject leaves in the relative major and returns\n`
  + `in the home minor; the music box comes back at the recapitulation;\n`
  + `the last chord is a Picardy major.`;
const prod = `Wide natural hall reverb, quiet dynamics, one long crescendo into the\n`
  + `development, no compression pumping, no side-chain.`;

let long = [head, form, prod].join('\n\n');
if (long.length > 1000) long = [head, form].join('\n\n');
if (long.length > 1000) long = head;

const exclude = [
  'no lyrics', 'no rap', 'no spoken word', 'no EDM', 'no dubstep', 'no trap drums',
  'no 4-on-the-floor kick', 'no distorted electric guitar', 'no brass fanfare',
  'no horror stinger', 'no dark ambient drone', 'no lo-fi hiss', 'no autotune',
].join(', ');

const structure = info.sections.map((s) =>
  `[${secName[s.name] || s.name}]\n(${Math.round(s.dur)}s — ${s.voices.join(', ')}; instrumental, no vocals except wordless choir)`
).join('\n\n');

const txt = `Passage ${tag} — Suno 用のメモ
=====================================
調: ${key}   速さ: ${info.tempo} BPM   長さ: ${(info.total / 60).toFixed(1)}分

■ Style of Music（短い欄に貼る）
${short}

■ Style（長い欄がある場合／説明として）
${long}

■ Exclude / Negative tags
${exclude}

■ Lyrics 欄（器楽なので構成タグだけ入れる）
${structure}

■ 音源
- Passage-${tag}-音楽-60秒.wav … ${Math.round(from)}秒目から60秒。第一主題が素で出るところ。
  取り込み（Upload / Extend）に使うならこちら。
- Passage-${tag}-音楽.wav … 全長。Cover / Remaster のように長い取り込みができる場合に。
  大きすぎて渡せないときは、器だけ小さくして焼き直せる（音の作りは変わらない）:
    node art/tools/record.mjs Passage-${tag}-音楽.wav --seed ${SEED} --music --rate 32000 --mono

■ 元の音がどう作られているか（伝えると近づけやすい）
- 音のファイルは1つも使っていない。全部その場の合成（WebAudio）。
- 残響は雑音を指数で減らしたものを畳み込んで作っている。
- 旋律は2つ。展開部では頭の3音だけを取り出して1音ずつ上げながら繰り返す。
- 音は映像のカットに付いていない（拍と小節で進む）。だから長いカットでも旋律が動く。
`;
fs.writeFileSync(`${stem}-suno.txt`, txt);
console.log(`\n${path.basename(stem)}-suno.txt`);
console.log(`長い Style 欄: ${long.length} 文字（1000 まで）`);
console.log('');
console.log('■ Style of Music（そのまま貼れる）');
console.log(short);
