// Suno に持っていくための音源と style prompt を作る。
//
//   node art/tools/suno.mjs 4
//   node art/tools/suno.mjs 4 --dir ./out
//
// 出るもの:
//   無銘-004-音楽.wav        全長（48kHz ステレオ）— 参照用・長さのある取り込み用
//   無銘-004-音楽-60秒.wav   いちばん性格の出ている60秒 — Suno の取り込みは短い方が通る
//   無銘-004-suno.txt        style prompt（短・長）、除外タグ、構成のメモ
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
const stem = path.join(DIR, `無銘-${tag}`);
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

console.log(`無銘 ${tag}  ${(info.total / 60).toFixed(1)}分  ${info.tempo}BPM  ${key}  音符${info.notes}`);
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

const long = [
  `${key}, ${info.tempo} BPM, 4/4.`,
  ``,
  `A melancholic minimal chamber score — the sound of something beautiful still playing`,
  `after everyone has gone. Acoustic and tonal, never synthetic or ominous.`,
  ``,
  `Instruments: ${allVoices.join(', ')}.`,
  `Music box (celesta) carries the melody; harp keeps a continuous broken-chord figure`,
  `underneath so the music never stands still; bowed strings hold slow pads;`,
  `soft timpani and wordless choir enter from the middle section onwards.`,
  ``,
  `Form (sonata): the second subject leaves in the relative major and returns in the`,
  `home minor; the opening music-box timbre comes back at the recapitulation;`,
  `the final chord is a Picardy major.`,
  ``,
  ...info.sections.map((s) => `  ${secName[s.name] || s.name} — ${Math.round(s.dur)}s — ${s.voices.join(', ')}`),
  ``,
  `Production: wide natural hall reverb, quiet dynamics with one long crescendo into`,
  `the development, no compression pumping, no side-chain, analog warmth, 24-bit clean.`,
].join('\n');

const exclude = [
  'no lyrics', 'no rap', 'no spoken word', 'no EDM', 'no dubstep', 'no trap drums',
  'no 4-on-the-floor kick', 'no distorted electric guitar', 'no brass fanfare',
  'no horror stinger', 'no dark ambient drone', 'no lo-fi hiss', 'no autotune',
].join(', ');

const structure = info.sections.map((s) =>
  `[${secName[s.name] || s.name}]\n(${Math.round(s.dur)}s — ${s.voices.join(', ')}; instrumental, no vocals except wordless choir)`
).join('\n\n');

const txt = `無銘 ${tag} — Suno 用のメモ
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
- 無銘-${tag}-音楽-60秒.wav … ${Math.round(from)}秒目から60秒。第一主題が素で出るところ。
  取り込み（Upload / Extend）に使うならこちら。
- 無銘-${tag}-音楽.wav … 全長。Cover / Remaster のように長い取り込みができる場合に。

■ 元の音がどう作られているか（伝えると近づけやすい）
- 音のファイルは1つも使っていない。全部その場の合成（WebAudio）。
- 残響は雑音を指数で減らしたものを畳み込んで作っている。
- 旋律は2つ。展開部では頭の3音だけを取り出して1音ずつ上げながら繰り返す。
- 音は映像のカットに付いていない（拍と小節で進む）。だから長いカットでも旋律が動く。
`;
fs.writeFileSync(`${stem}-suno.txt`, txt);
console.log(`\n${path.basename(stem)}-suno.txt`);
console.log('');
console.log('■ Style of Music（そのまま貼れる）');
console.log(short);
