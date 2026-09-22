// 実時間で録る。**映像と音楽を1本に入れた webm** を作る道具。
//
//   node art/tools/record.mjs Passage-004.webm --seed 4
//   node art/tools/record.mjs Passage-004.webm --seed 4 --no-audio   # 映像だけ
//   node art/tools/record.mjs Passage-004.wav  --seed 4 --music      # 音楽だけ（48kHz ステレオ）
//   node art/tools/record.mjs a.wav --seed 4 --music --to 90     # 頭の90秒だけ（聴き比べ用）
//   node art/tools/record.mjs Passage-004.wav  --seed 4 --music --rate 32000 --mono
//
// export.mjs は絵を1枚ずつ焼いて ffmpeg に流すので速いが、
// **この環境の ffmpeg には音声encoderが無い**ので音を混ぜられない。
// こちらは頁の中の MediaRecorder に録らせるので、絵と音が1本にまとまる。
// 代わりに**作品の長さぶん実時間がかかる**（6分）。
//
// 頁の V / S と同じ道を通っているので、頁で保存したものと中身が一致する。

import fs from 'node:fs';
import path from 'node:path';
import { open } from './browser.mjs';

const argv = process.argv.slice(2);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) {
  console.error('使い方: node art/tools/record.mjs 出力.webm [--seed 0] [--size 1280x720] [--bitrate 2000000] [--audio-bitrate 192000] [--no-audio] [--music]');
  process.exit(2);
}
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);
const SEED = parseInt(flag('seed', '0'), 10);
const [W, H] = flag('size', '1280x720').split('x').map((v) => parseInt(v, 10));
const MUSIC = has('music');

const VBR = parseInt(flag('bitrate', '0'), 10);
const ABR = parseInt(flag('audio-bitrate', '0'), 10);
// 指示書（記事から決めた要素）。base64url のまま頁へ渡す
const BRIEF = flag('brief', '');
const page = await open(`auto=1&seed=${SEED}&w=${W}&h=${H}`
  + `${VBR ? '&vbr=' + VBR : ''}${ABR ? '&abr=' + ABR : ''}`
  + `${BRIEF ? '&brief=' + BRIEF : ''}`, {
  software: has('sw'),
  size: `${W},${H}`,
  api: 'save',
});
const meta = JSON.parse(await page.evaluate('JSON.stringify(window.__save.meta())'));
console.log(`${meta.title}（種 ${SEED}）  ${(meta.total / 60).toFixed(1)}分`);

const fd = fs.openSync(out, 'w');
let got = 0;
page.setSink((buf) => { fs.writeSync(fd, buf); got += buf.length; });

if (MUSIC) {
  console.log('音楽を焼いています…（実時間より速い）');
  // --mono は**送れる大きさに収めるため**の逃げ道（音の作りは変えない）
  // `--from` / `--to` で途中だけ焼ける（聴き比べ用）
  const AF = parseFloat(flag('from', '0'));
  const AT = flag('to', null);
  await page.evaluate(`window.__save.music(${parseInt(flag('rate', '48000'), 10)}, ${has('mono')}, `
    + `${AF}, ${AT === null ? 'null' : parseFloat(AT)})`);
} else {
  console.log(`録っています…（${(meta.total / 60).toFixed(1)}分かかります）`);
  await page.evaluate(`window.__save.film(${has('no-audio') ? 'false' : 'true'}); 'started'`);
  const LIMIT = parseFloat(flag('seconds', '0'));   // 試すとき用（0 なら最後まで）
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await page.evaluate('String(window.__saveSunk)');
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r  ${el.toFixed(0)}秒 / ${meta.total.toFixed(0)}秒   `);
    if (st === 'true') break;
    if (st === 'fail') { console.error('\nこの端末では録れない'); process.exit(1); }
    if (LIMIT && el > LIMIT) await page.evaluate('window.__save.stop()');
    if (el > meta.total + 180) { console.error('\n終わらない'); process.exit(1); }
  }
  console.log('');
}
fs.closeSync(fd);
page.close();
console.log(`${out}  ${(got / 1e6).toFixed(1)}MB`);
