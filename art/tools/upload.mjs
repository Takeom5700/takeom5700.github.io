// YouTube へ上げる（YouTube Data API v3 / resumable upload）。
//
//   node art/tools/upload.mjs 作品.webm --title "Passage 004" --desc-file 作品.txt
//   node art/tools/upload.mjs 作品.webm --title "Passage 004" --privacy public
//
// **この道具も持ち主のパソコンで動かすもの。**
// Claude Code のコンテナからは googleapis.com が遮断されている（403）。
//
// 先に一度だけ用意するもの（`art/DAILY.md` に手順がある）:
//   YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN  … 環境変数
//
// **審査を通すまで、API から上げた動画は必ず非公開になる。**
// これは YouTube 側の決まりで、こちらでは外せない。
// 審査（YouTube API Services audit）を申請して通ると public にできる。
// それまでは `--privacy private` のまま上げて、手で公開すること。
//
// 1本あたり 1600 quota、既定の上限は1日 10,000。**1日6本まで。**

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
if (!file) {
  console.error('使い方: node art/tools/upload.mjs 作品.webm --title "Passage 004" [--desc-file 作品.txt] [--privacy private|unlisted|public]');
  process.exit(2);
}
const TITLE = flag('title', path.basename(file, path.extname(file)));
const PRIVACY = flag('privacy', 'private');
const CAT = flag('category', '1');            // 1 = Film & Animation

const ID = process.env.YT_CLIENT_ID, SECRET = process.env.YT_CLIENT_SECRET;
const REFRESH = process.env.YT_REFRESH_TOKEN;
if (!ID || !SECRET || !REFRESH) {
  console.error('YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN を環境変数に入れてください。');
  console.error('作りかたは art/DAILY.md の「YouTube に自動で上げる」を見てください。');
  process.exit(2);
}

// 説明文。daily.mjs が書いたテキストから「記録」より上だけを使う
let desc = flag('desc', '');
const df = flag('desc-file', '');
if (!desc && df && fs.existsSync(df)) {
  const raw = fs.readFileSync(df, 'utf8');
  desc = raw.split('— ここから下は記録')[0].split('\n').slice(2).join('\n').trim();
}

const TAGS = (flag('tags', 'generative art,algorithmic art,abstract animation,experimental animation,visual music,procedural art,creative coding,motion art')).split(',');

// ---- 合言葉を取り直す ----------------------------------------------------
async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ID, client_secret: SECRET,
      refresh_token: REFRESH, grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('合言葉を取れませんでした: ' + JSON.stringify(j));
  return j.access_token;
}

// ---- 上げる（resumable。大きい本体は一度の PUT で流す） -------------------
const token = await accessToken();
const size = fs.statSync(file).size;
const meta = {
  snippet: { title: TITLE, description: desc, tags: TAGS, categoryId: CAT },
  status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false, license: 'youtube' },
};

const start = await fetch(
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
  {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(size),
      'x-upload-content-type': 'video/*',
    },
    body: JSON.stringify(meta),
  });
if (!start.ok) {
  console.error('受け口を作れませんでした: ' + start.status + ' ' + (await start.text()));
  process.exit(1);
}
const where = start.headers.get('location');
console.log(`上げます: ${path.basename(file)}  ${(size / 1e6).toFixed(1)}MB`);

const put = await fetch(where, {
  method: 'PUT',
  headers: { 'content-type': 'video/*', 'content-length': String(size) },
  body: fs.createReadStream(file),
  duplex: 'half',
});
const out = await put.json().catch(() => ({}));
if (!put.ok) {
  console.error('上げられませんでした: ' + put.status + ' ' + JSON.stringify(out));
  process.exit(1);
}
console.log('できました: https://www.youtube.com/watch?v=' + out.id);
console.log('公開の状態: ' + (out.status ? out.status.privacyStatus : '不明'));
if (out.status && out.status.uploadStatus === 'rejected') {
  console.error('※ YouTube に弾かれています: ' + JSON.stringify(out.status));
}
