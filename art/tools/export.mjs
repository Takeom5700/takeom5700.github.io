// 映像として書き出す。YouTube に上げるのはこれで作った1本。
//
//   node art/tools/export.mjs out.mp4 --from 0 --to 504 --fps 24 --size 2560x1440
//   node art/tools/export.mjs out.mp4 --seed 7          # 別の世界
//   node art/tools/export.mjs out.mp4 --to 30 --sw      # 短く試す（ソフトウェア描画）
//
// 作品はその場で計算するものとして作ってある。これは**記録**の道具。
// 同じ引数なら必ず同じ1本が出る（基軸「五・種」）。
//
// 仕組み:
//   頁を1回だけ開いて、CDP 経由で時刻を指定して1枚ずつ焼かせ、
//   PNG をそのまま ffmpeg の標準入力に流す。連番をディスクに置かないので、
//   8分半（12,000枚）でも容量を食わない。
//   音は OfflineAudioContext で先にまとめて焼いて WAV にする（画面収録は要らない）。
//
// 速さはほぼ GPU 次第。ソフトウェア描画だと1枚十数秒かかるので、
// 通しで焼くなら GPU のある機械で回すこと。

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { open } from './browser.mjs';

// ---- 引数 ---------------------------------------------------------------
const argv = process.argv.slice(2);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) {
  console.error('使い方: node art/tools/export.mjs 出力.mp4 [--from 0] [--to 504] [--fps 24] [--size 2560x1440] [--seed 0] [--frames 24] [--steps 176] [--no-audio] [--sw] [--jpeg] [--verbose]');
  process.exit(2);
}
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i < 0 ? def : argv[i + 1];
};
const has = (name) => argv.includes('--' + name);

const FROM = parseFloat(flag('from', '0'));
const TO = parseFloat(flag('to', '504'));
const FPS = parseFloat(flag('fps', '24'));
const SIZE = flag('size', '2560x1440');
const SEED = parseInt(flag('seed', '0'), 10);
const ACC = parseInt(flag('frames', '24'), 10);
const STEPS = parseInt(flag('steps', '176'), 10);
const WANT_AUDIO = !has('no-audio');
const JPEG = has('jpeg');
const [W, H] = SIZE.split('x').map((v) => parseInt(v, 10));
const N = Math.max(1, Math.round((TO - FROM) * FPS));

// ---- ffmpeg を選ぶ -------------------------------------------------------
// 手元の ffmpeg があればそちらを使う（libx264 と aac が入っている）。
// 無ければ Playwright 同梱のものに落ちるが、そちらは VP8/WebM だけで
// 音声encoderも PNG の decoder も無いので、JPEG で渡し、音は別ファイルで出す。
function pickFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg', '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'].filter(Boolean);
  for (const bin of candidates) {
    try {
      const enc = execFileSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const dec = execFileSync(bin, ['-hide_banner', '-decoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return {
        bin,
        x264: /\blibx264\b/.test(enc),
        vpx: /\blibvpx\b/.test(enc),
        aac: /\baac\b/.test(enc),
        opus: /\blibopus\b/.test(enc),
        vorbis: /\b(libvorbis|vorbis)\b/.test(enc),
        png: /^\s*V\S*\s+png\b/m.test(dec),
        mjpeg: /^\s*V\S*\s+mjpeg\b/m.test(dec),
      };
    } catch { /* 次の候補へ */ }
  }
  return null;
}

// ---- 本体 ---------------------------------------------------------------
const VERBOSE = has('verbose') || has('v');
const step = (...a) => { if (VERBOSE) console.log('·', ...a); };

const ff = pickFfmpeg();
if (!ff) { console.error('ffmpeg が見つからない'); process.exit(1); }
step('ffmpeg:', ff.bin, ff.x264 ? 'H.264' : ff.vpx ? 'VP8' : '?', ff.aac ? '+AAC' : '（音声encoder無し）',
  '／入力', ff.png ? 'PNG' : ff.mjpeg ? 'JPEG のみ' : 'なし');

const page = await open(
  `export=1&seed=${SEED}&w=${W}&h=${H}&frames=${ACC}&steps=${STEPS}`,
  {
    software: has('sw'),
    size: Math.min(W, 1600) + ',' + Math.min(H, 900),
    onFallback: () => console.log('GPU で WebGL2 が取れなかったので、ソフトウェア描画に落とす'),
  },
).catch((e) => { console.error(e.message); process.exit(1); });
const meta = page.meta;
console.log(`描画: ${page.software ? 'ソフトウェア（遅い）' : 'GPU'}`);

console.log(`${meta.title}（種 ${SEED}）  ${W}×${H} / ${FPS}fps / 蓄積${ACC}枚 / ${STEPS}歩`);
console.log(`${FROM}〜${TO}秒 = ${N}枚   楽章: ${meta.movements.map((m) => m.name).join('→')}`);

// 音を先に焼く（映像と一度に多重化するため）
let wavPath = null;
if (WANT_AUDIO) {
  process.stdout.write('音を焼いている… ');
  // 8分半ぶんで約96MB。頁から直接バイナリで受け取る
  wavPath = out.replace(/\.[^.]+$/, '') + '.wav';
  const fd = fs.openSync(wavPath, 'w');
  page.setSink((buf) => { fs.writeSync(fd, buf); });
  const info = await page.evaluate(`window.__mumei.audio(${FROM}, ${TO})`);
  fs.closeSync(fd);
  page.setSink(null);
  if (info) {
    console.log(`${info.seconds.toFixed(1)}秒 ${info.channels}ch ${(info.bytes / 1e6).toFixed(1)}MB → ${path.basename(wavPath)}`);
  } else {
    fs.rmSync(wavPath, { force: true });
    wavPath = null;
    console.log('できなかった（この端末では OfflineAudioContext が使えない）');
  }
}

// 映像の出口を決める
const canMux = wavPath && (ff.aac || ff.opus || ff.vorbis);
const useX264 = ff.x264;
const ext = useX264 ? '.mp4' : '.webm';
let video = out;
if (path.extname(out).toLowerCase() !== ext) {
  video = out.replace(/\.[^.]+$/, '') + ext;
  console.log(`この ffmpeg は ${useX264 ? 'H.264' : 'VP8'} なので ${path.basename(video)} に出す`);
}

const vArgs = useX264
  ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  : ['-c:v', 'libvpx', '-b:v', '0', '-crf', '10', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p'];
const aArgs = canMux
  ? ['-i', wavPath, '-map', '0:v', '-map', '1:a',
     ...(ff.aac ? ['-c:a', 'aac', '-b:a', '320k'] : ff.opus ? ['-c:a', 'libopus', '-b:a', '256k'] : ['-c:a', 'libvorbis', '-q:a', '8']),
     '-shortest']
  : [];

// PNG が読めない ffmpeg（Playwright 同梱など）では JPEG に落ちる。
// 暗い階調が主な作品なので、読めるなら PNG のままにしたい。
const useJpeg = JPEG || !ff.png;
if (useJpeg && !ff.mjpeg) { console.error('この ffmpeg は1枚ずつ流す絵を読めない'); process.exit(1); }
if (useJpeg && !JPEG) console.log('この ffmpeg は PNG を読めないので JPEG で渡す（暗部がわずかに荒くなる）');

// image2pipe は名前から形式を推せないので、decoder を明示する必要がある
// （省くと「入力に stream が無い」と言われて止まる）。
const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', useJpeg ? 'mjpeg' : 'png', '-i', 'pipe:0',
  ...aArgs, ...vArgs, video,
];
const enc = spawn(ff.bin, args, { stdio: ['pipe', 'inherit', 'inherit'] });
let encDied = null;
enc.on('close', (c) => { if (c !== 0) encDied = c; });
enc.stdin.on('error', () => {});   // 相手が死んだ後の EPIPE を黙らせる
const write = (buf) => new Promise((ok) => { if (enc.stdin.write(buf)) ok(); else enc.stdin.once('drain', ok); });

// 絵は頁から直接バイナリで受け取る（base64 を通すと 1MB あたりで詰まる）
const pushCall = useJpeg ? "window.__mumei.push(T, 'image/jpeg', 0.97)" : "window.__mumei.push(T)";
page.setSink((buf) => write(buf));
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  if (encDied !== null) { page.close(); console.error('\nffmpeg が ' + encDied + ' で落ちた'); process.exit(1); }
  const t = FROM + i / FPS;
  const size = await page.evaluate(pushCall.replace('T', String(t)));
  if (!size) throw new Error('絵が返ってこない');
  const done = i + 1, el = (Date.now() - t0) / 1000;
  const eta = el / done * (N - done);
  process.stdout.write(`\r  ${done}/${N}枚  ${(el / done).toFixed(1)}秒/枚  残り ${(eta / 60).toFixed(1)}分   `);
}
console.log('');
enc.stdin.end();
await new Promise((ok, ng) => enc.on('close', (c) => (c === 0 ? ok() : ng(new Error('ffmpeg が ' + c + ' で終わった')))));

page.close();

const mb = (fs.statSync(video).size / 1e6).toFixed(1);
console.log(`\n${video}  ${mb}MB  ${(N / FPS).toFixed(1)}秒`);
if (wavPath && !canMux) {
  console.log(`音は ${path.basename(wavPath)} に別で出してある（この ffmpeg に音声encoderが無い）。`);
  console.log('手元の ffmpeg があれば、これで1本にまとまる:');
  console.log(`  ffmpeg -i ${path.basename(video)} -i ${path.basename(wavPath)} -c:v copy -c:a aac -b:a 320k -shortest 完成.mp4`);
}
