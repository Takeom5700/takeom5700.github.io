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
const has = (n) => argv.includes('--' + n);
const file = argv.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
if (!file && !has('whoami')) {
  console.error('使い方: node art/tools/upload.mjs 作品.webm --title "Passage 004" [--desc-file 作品.txt] [--privacy private|unlisted|public]');
  console.error('        node art/tools/upload.mjs --whoami   … いまの鍵がどのチャンネルを指しているか見る');
  process.exit(2);
}
const TITLE = flag('title', file ? path.basename(file, path.extname(file)) : '');
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

// **投稿先はチャンネル名で決まらない。鍵（refresh token）が持ち主を決める。**
// だから「どのチャンネルに上がるか」は、許可を出したときに選んだチャンネルで決まる。
// Google アカウントに複数チャンネルがあるなら、許可の画面で
// **@yama-ha-i-zo を選ぶこと**（personal の方を選ぶと、そこに上がってしまう）。
//
// 取り違えを防ぐため、上げる前に「いまの鍵が誰か」を必ず確かめる。
// **既定で見張りを入れてある。** `YT_CHANNEL` を設定し忘れても、
// 鍵が別のチャンネルを指していたら上げずに止まる
// （設定し忘れたときこそ、別のチャンネルに上がって困る）。
// 別のチャンネルへ出したいときだけ `YT_CHANNEL` を上書きする。
const CHANNEL_DEFAULT = '@yama-ha-i-zo';   // 依頼者の指定（2026-09-22）
const WANT = process.env.YT_CHANNEL || CHANNEL_DEFAULT;

// ---- 合言葉を取り直す ----------------------------------------------------
async function accessToken() {
  let res;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ID, client_secret: SECRET,
        refresh_token: REFRESH, grant_type: 'refresh_token',
      }),
    });
  } catch (e) {
    console.error('Google に繋がりませんでした: ' + e.message);
    console.error('（このコンテナからは遮断されています。持ち主のパソコンで動かしてください）');
    process.exit(2);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('合言葉を取れませんでした: ' + (j.error_description || j.error || res.status));
    console.error('YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN を確かめてください。');
    console.error('（同意画面が「テスト」のままだと refresh token は7日で切れます → 「本番」に上げる）');
    process.exit(2);
  }
  return j.access_token;
}

// いまの鍵が指しているチャンネルを見る。
// `youtube.readonly` を許可していないと引けないので、引けなければ警告だけにする
// （上げる許可（youtube.upload）だけでも投稿はできる）。
async function whoami(token) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { authorization: 'Bearer ' + token } });
  const j = await res.json();
  if (!res.ok || !j.items || !j.items.length) return null;
  const c = j.items[0];
  return { id: c.id, title: c.snippet.title, handle: c.snippet.customUrl || '' };
}

// ---- 上げる（resumable。大きい本体は一度の PUT で流す） -------------------
const token = await accessToken();

const me = await whoami(token);   // 先に「誰の鍵か」を確かめる
if (me) {
  console.log(`投稿先: ${me.title}  ${me.handle}  ${me.id}`);
  if (WANT) {
    const want = WANT.toLowerCase().replace(/^@/, '');
    const ok = me.id.toLowerCase() === want
      || me.handle.toLowerCase().replace(/^@/, '') === want
      || me.title.toLowerCase() === want;
    if (!ok) {
      console.error(`止めました。YT_CHANNEL は "${WANT}" ですが、いまの鍵は上のチャンネルを指しています。`);
        console.error(`許可を出し直して、そのとき ${WANT} のチャンネルを選んでください（art/DAILY.md）。`);
      process.exit(1);
    }
  }
} else {
  console.log('投稿先: 確かめられません（youtube.readonly を許可していない鍵です）。');
  console.log(`  → 出したいのは ${WANT} です。`);
  console.log('  → 取り違えが怖いので、最初の1本は上げたあとに YouTube Studio で確かめてください。');
}
if (has('whoami')) process.exit(0);
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
