// X（旧 Twitter）へ、その日の1本を紹介する投稿を1つ出す。
//
//   node art/tools/x.mjs --whoami                       … 鍵が誰を指しているか見る
//   node art/tools/x.mjs --folder "<作品のフォルダ>"       … その1本を投稿する
//   node art/tools/x.mjs --latest --out "<置場>"          … まだ出していない古い順に1本
//   node art/tools/x.mjs --folder ... --dry-run          … 文だけ見る（投げない・鍵も要らない）
//   node art/tools/x.mjs --folder ... --no-image         … 文だけ投稿する
//
// **この道具も持ち主のパソコンで動かすもの。**
// Claude Code のコンテナからは x.com が見えない（note.com・googleapis.com と同じ）。
// だから**署名は RFC の検算用データで確かめてある**（`node art/tools/oauth1.mjs --test`）。
//
// 先に一度だけ用意するもの（`art/X.md` に手順がある）:
//   X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET … 開発者ページで発行
//   X_HANDLE … 出す先のハンドル（`@` は付けても付けなくてもよい）
//
// **X_HANDLE が無いときは投げない。** YouTube で踏んだ穴と同じ形——
// 個人のアカウントの鍵で許可を出すと、そちらへ公開で出てしまう。
// 消せはするが「出た」ことは消えない。だから**既定を「出さない」側に置く。**
//
// 何を出すか（`art/CHANNEL.md` の線をそのまま守る）:
//   ・**静止画＋リンク。** 動画は上げない。切り刻んで60秒にするのも禁
//     （「別surfaceに出したいなら静止画を使う」——それは作品の一部を正しく写している）
//   ・**形容詞を書かない**（Relaxing / Beautiful / 4K / 作業用）
//   ・**登録・フォローを頼まない。** 事実だけ置く

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authHeader } from './oauth1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const DRY = has('dry-run');

// ---- 一行（毎日ちがう。全部「事実」で、主張を書かない）-------------------
// **これが投稿の肝。** 形容詞で煽らずに気になってもらうには、
// この作品の作りかたそのものを言うのがいちばん強い（どれも本当のことなので、
// 確かめようとした人がもう一本見る）。
//
// **主張を混ぜないこと。** 「美しい」「癒される」を一つ入れた時点で、
// このチャンネルは他の何万のチャンネルと同じ棚に落ちる。
const LINES = [
  'Nothing here was filmed, and nothing was drawn.',
  'The picture and the music come from the same number.',
  'Run the number again and this returns identical, down to the byte.',
  'Change one digit and this world is gone.',
  'It ends. It does not loop.',
  'No words appear on screen at any point.',
  'Made once. It will not be remade.',
  'Something was read before this was built.',
  'This did not exist yesterday.',
  'Not a recording — the sound is assembled as it plays.',
  'One number decided every frame and every note.',
  'What you write is read. Some of it ends up inside the next one.',
];

// ---- 投稿の文を組む ------------------------------------------------------
// **280字に収めること。** 収まらなかったら一行を落とす（リンクは落とさない）。
// X はリンクを 23字として数えるので、そのぶんを見て測る。
export function postText(w, avoid) {
  // **直前に使った一行を外す。** 種から引くだけだと 12通りのうちから毎回引くので、
  // **2日続けて同じ一行になる**（実測 13日のうち2回）。図で踏んだのと同じ穴なので
  // 同じ直しかたをする——直近に出たものを候補から外し、無ければ隣へずらす。
  // **「二度と出さない」にはしない**（12日で尽きる）。偶然また出るのは許す。
  const skip = new Set(avoid || []);
  let i = ((w.seed | 0) + (w.day | 0)) % LINES.length;
  for (let n = 0; n < LINES.length && skip.has(i); n++) i = (i + 1) % LINES.length;
  const line = LINES[i];
  postText.lastIndex = i;                 // 呼んだ側が印に書けるように返す
  const link = w.videoId ? `https://youtu.be/${w.videoId}` : '';
  const len = (s) => s.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
  // **`filter(Boolean)` を使わないこと。** 空文字が落ちて**空行が全部消える**
  // （実際に消えて、題名と本文とリンクが詰まった1塊になった）。
  // 落としたいのは「無い行」だけなので、null と undefined だけを見る。
  const put = (parts) => parts.filter((x) => x !== null && x !== undefined).join('\n');
  const full = put([
    `${w.title} ${w.tag}`,
    '',
    line,
    '',
    w.mins ? `${w.mins} · seed ${w.seed}` : `seed ${w.seed}`,
    link,
  ]);
  if (len(full) <= 280) return full;
  // 入らなければ一行を落とす。**リンクと題名は落とさない**
  return put([`${w.title} ${w.tag}`, '', w.mins ? `${w.mins} · seed ${w.seed}` : `seed ${w.seed}`, link]);
}

// ---- 作品のフォルダを読む ------------------------------------------------
// **画面の文字から拾わないこと**（書式を変えた日に黙って壊れる。台帳と同じ理屈）。
// 種は `.txt` の記録の行から、動画の番号は `upload.mjs --id-file` が書いた
// `.videoid` から取る。
function readWork(folder) {
  const names = fs.readdirSync(folder);
  const txt = names.find((n) => n.endsWith('.txt'));
  if (!txt) throw new Error('テキストが見つかりません: ' + folder);
  const raw = fs.readFileSync(path.join(folder, txt), 'utf8');
  const head = raw.split('\n')[0].trim();                 // 「Passage 004」
  const m = head.match(/^(\S+)\s+(\S+)$/);
  const seed = parseInt((raw.match(/^種:\s*(\d+)/m) || [])[1], 10);
  const vid = names.includes('.videoid')
    ? fs.readFileSync(path.join(folder, '.videoid'), 'utf8').trim() : '';
  const film = names.find((n) => n.endsWith('.webm') || n.endsWith('.mp4'));
  return {
    folder, title: m ? m[1] : head, tag: m ? m[2] : '',
    seed: Number.isFinite(seed) ? seed : 0,
    videoId: vid, film: film ? path.join(folder, film) : '',
    // 尺は台帳から引くのが本筋。無いときはテキストの `6:12  seed 186` の行から拾う
    mins: (raw.match(/^(\d+:\d{2})\s+seed\s+\d+/m) || [])[1] || '',
    still: path.join(folder, `${head.replace(/\s+/g, '-')}-still.png`),
    posted: path.join(folder, '.posted-x'),
  };
}

// ---- 直近に使った一行 ---------------------------------------------------
// **印（`.posted-x`）に書いておいて、隣のフォルダから読む。**
// 新しい置き場所を作らないこと（台帳が2か所にあるだけで既にややこしい）。
// 毎朝の `git stash` でも消えない——ここは置場（デスクトップ）の側にある。
export function recentLines(folder, n = 3) {
  try {
    const parent = path.dirname(folder);
    const rows = [];
    for (const d of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const f = path.join(parent, d.name, '.posted-x');
      if (!fs.existsSync(f)) continue;
      const m = fs.readFileSync(f, 'utf8').match(/line=(\d+)/);
      if (m) rows.push([fs.statSync(f).mtimeMs, parseInt(m[1], 10)]);
    }
    return rows.sort((a, b) => b[0] - a[0]).slice(0, n).map((r) => r[1]);
  } catch (e) { return []; }
}

// 台帳から指示書と尺を引く（**指示書が無いと別の絵が焼ける**——図は指示書が選ぶ）
function fromLedger(w) {
  try {
    const p = path.join(HERE, '..', 'works', 'ledger.json');
    const l = JSON.parse(fs.readFileSync(p, 'utf8'));
    const hit = (l.works || []).filter((x) => x.seed === w.seed && (!w.tag || x.tag === w.tag)).pop();
    if (hit) return { brief: hit.brief || '', total: hit.total || 0 };
  } catch (e) { /* 台帳が無くても投稿はできる */ }
  return { brief: '', total: 0 };
}

// ---- 静止画を1枚焼く ----------------------------------------------------
// **作品のフレームそのものを使う。** 文字も矢印も枠も乗せない（`art/CHANNEL.md`）。
// 焼く時刻は展開部の頂点あたり（尺の 0.52）。尺は作品ごとに違うので割合で取る。
async function bakeStill(w, brief, total) {
  const { open } = await import('./browser.mjs');
  const W = 1600, H = 900;
  const t = Math.max(5, (total || 360) * 0.52);
  const q = `export=1&seed=${w.seed}&w=${W}&h=${H}${brief ? '&brief=' + brief : ''}`;
  const page = await open(q, { size: `${W},${H}` });
  let buf = null;
  page.setSink((b) => { buf = b; });
  await page.evaluate(`window.__mumei.push(${t})`);
  page.close();
  if (!buf || !buf.length) throw new Error('静止画が焼けませんでした（頁が絵を返さなかった）');
  fs.writeFileSync(w.still, Buffer.from(buf));
  return w.still;
}

// ---- 鍵 ----------------------------------------------------------------
function keys() {
  const k = {
    key: process.env.X_API_KEY, secret: process.env.X_API_SECRET,
    token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET,
  };
  if (!k.key || !k.secret || !k.token || !k.tokenSecret) {
    console.error('X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET を環境変数に入れてください。');
    console.error('入れかたは art/X.md（Windows は art\\tools\\win\\setup-x.bat）。');
    process.exit(2);
  }
  return k;
}

async function call(method, url, k, body, type) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: authHeader(method, url, k, null),
      ...(type ? { 'content-type': type } : {}),
    },
    body: body || undefined,
  });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* 文のまま返す */ }
  return { ok: res.ok, status: res.status, json: j, text };
}

async function whoami(k) {
  const r = await call('GET', 'https://api.x.com/2/users/me', k);
  if (!r.ok || !r.json || !r.json.data) return null;
  return r.json.data;                     // { id, name, username }
}

// 静止画を上げる。**multipart で送ること**——本文を署名に混ぜないので、
// 署名は URL と oauth_* だけで決まる（form-urlencoded にすると本文も混ぜる決まりで、
// base64 の塊を署名の土台に入れることになる。間違えやすいし無駄）。
async function upMedia(k, file) {
  const bytes = fs.readFileSync(file);
  const url = 'https://upload.x.com/1.1/media/upload.json';
  const b = '----primaries' + crypto.randomBytes(12).toString('hex');
  const head = Buffer.from(
    `--${b}\r\nContent-Disposition: form-data; name="media"; filename="${path.basename(file)}"\r\n`
    + 'Content-Type: image/png\r\n\r\n', 'utf8');
  const tail = Buffer.from(`\r\n--${b}--\r\n`, 'utf8');
  const r = await call('POST', url, k, Buffer.concat([head, bytes, tail]),
    `multipart/form-data; boundary=${b}`);
  if (!r.ok) throw new Error(`静止画を上げられませんでした（${r.status}）: ${r.text.slice(0, 300)}`);
  const id = r.json && (r.json.media_id_string || r.json.media_id);
  if (!id) throw new Error('静止画の番号が返りませんでした: ' + r.text.slice(0, 300));
  return String(id);
}

async function tweet(k, text, mediaId) {
  const payload = { text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) };
  const r = await call('POST', 'https://api.x.com/2/tweets', k,
    JSON.stringify(payload), 'application/json');
  if (!r.ok) throw new Error(`投稿できませんでした（${r.status}）: ${r.text.slice(0, 400)}`);
  return r.json && r.json.data ? r.json.data.id : '';
}

// ---- ここから本体 ------------------------------------------------------
// **`import` されただけで下が走ってはいけない**（`fresh.mjs` と同じ穴）。
// 走ると引数が無くて `process.exit(2)` し、文の組み立てを試そうとした側が落ちる
// （実際に落ちた）。`postText` は検査から呼ぶので、ここで仕切る。
const IS_MAIN = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (IS_MAIN) {
const WANT = (process.env.X_HANDLE || '').replace(/^@/, '').toLowerCase();

if (has('whoami')) {
  const me = await whoami(keys());
  if (!me) { console.error('鍵が通りませんでした（発行し直してください）。'); process.exit(1); }
  console.log(`投稿先: @${me.username}  ${me.name}  ${me.id}`);
  if (WANT && me.username.toLowerCase() !== WANT) {
    console.error(`止まる設定です。X_HANDLE は "@${WANT}" ですが、いまの鍵は上を指しています。`);
    process.exit(1);
  }
  if (!WANT) console.log('X_HANDLE が空です。**このままでは投稿しません**（取り違え防止）。');
  process.exit(0);
}

// どの作品を出すか
let folder = flag('folder', '');
if (!folder && has('latest')) {
  const out = flag('out', process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'Desktop', 'Claude Art Project')
    : './out');
  const dirs = fs.readdirSync(out, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => path.join(out, d.name))
    .filter((p) => fs.existsSync(path.join(p, '.videoid')) && !fs.existsSync(path.join(p, '.posted-x')))
    .sort();
  if (!dirs.length) { console.log('出すものがありません（上げ済みで、まだ X に出していない作品が無い）。'); process.exit(0); }
  folder = dirs[0];
}
if (!folder) {
  console.error('使い方: node art/tools/x.mjs --folder "<作品のフォルダ>"   （--latest --out "<置場>" でも可）');
  console.error('        node art/tools/x.mjs --whoami');
  process.exit(2);
}

const w = readWork(folder);
const { brief, total } = fromLedger(w);
if (total) w.mins = `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`;
w.day = Math.floor(Date.now() / 86400000);
const text = postText(w, recentLines(folder));

console.log(`作品: ${w.title} ${w.tag}  種 ${w.seed}${w.videoId ? '  動画 ' + w.videoId : '  （動画の番号がまだ無い）'}`);
console.log('');
console.log(text.split('\n').map((l) => '  ' + l).join('\n'));
console.log('');
console.log(`${text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length} / 280 字`);

// **静止画だけ焼いて止められるようにしておく。** サムネイルにも使うし、
// 鍵の要らないところ（このコンテナ）で焼き口を確かめられる唯一の道になる。
if (has('still')) {
  const f = await bakeStill(w, brief, total);
  console.log('');
  console.log('静止画: ' + f + '  ' + fs.statSync(f).size + ' bytes');
  process.exit(0);
}

if (DRY) { console.log(''); console.log('--dry-run なので投げていません。'); process.exit(0); }

if (fs.existsSync(w.posted)) {
  console.log('この作品はもう X に出してあります（' + fs.readFileSync(w.posted, 'utf8').trim() + '）。');
  process.exit(0);
}
if (!w.videoId) {
  console.error('動画の番号（.videoid）がありません。YouTube へ上げたあとに出してください。');
  process.exit(1);
}

const k = keys();
const me = await whoami(k);
if (!me) { console.error('鍵が通りませんでした（発行し直してください）。'); process.exit(1); }
console.log(`投稿先: @${me.username}  ${me.name}`);
// **既定を「出さない」側に置く。** 公開の投稿は取り消せても、出たことは消えない
if (!WANT) {
  console.error('X_HANDLE が空です。取り違えが怖いので投稿しません。');
  console.error('  出す先のハンドルを X_HANDLE に入れてください（art\\tools\\win\\setup-x.bat）。');
  process.exit(1);
}
if (me.username.toLowerCase() !== WANT) {
  console.error(`止めました。X_HANDLE は "@${WANT}" ですが、いまの鍵は @${me.username} を指しています。`);
  process.exit(1);
}

let mediaId = '';
if (!has('no-image')) {
  try {
    if (!fs.existsSync(w.still)) {
      console.log('静止画を焼きます…');
      await bakeStill(w, brief, total);
    }
    console.log('静止画を上げます: ' + path.basename(w.still));
    mediaId = await upMedia(k, w.still);
  } catch (e) {
    // **静止画が使えない枠でも、投稿そのものは通す。** 出ない日を作らない
    console.log('静止画は付けられませんでした（文だけで出します）: ' + e.message);
  }
}

const id = await tweet(k, text, mediaId);
fs.writeFileSync(w.posted, `${new Date().toISOString()} ${id} line=${postText.lastIndex}\n`);
console.log('');
console.log(`出しました: https://x.com/${me.username}/status/${id}`);
}
