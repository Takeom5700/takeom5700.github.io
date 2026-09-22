// YouTube の鍵（refresh token）を取る。**一度だけ、ブラウザで許可するだけ。**
//
//   node art/tools/auth.mjs --id <クライアントID> --secret <クライアントの秘密>
//   node art/tools/auth.mjs           # 環境変数 YT_CLIENT_ID / YT_CLIENT_SECRET から
//
// これまでは Google の OAuth Playground を手で操作して、出てきた文字列を
// 手で `setx` に貼る手順だった。**貼り間違えと、チャンネルの選び間違えが起きる。**
// この道具は自分で受け口（http://127.0.0.1:ポート）を立てて、
// ブラウザを開き、返ってきた合言葉を自分で交換し、
// **投稿先が合っているかまで確かめる。**
//
// **Google Cloud のプロジェクトと OAuth クライアントは、持ち主が作るしかない。**
// あれは持ち主の Google アカウントでブラウザから操作するもので、
// 鍵が無い側（Claude）からは作れない。`art/DAILY.md` に画面の順番がある。
//
// 出てくるもの: YT_REFRESH_TOKEN。`--setx` を付けると Windows の環境変数に入れる。

import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);

const ID = flag('id', process.env.YT_CLIENT_ID || '');
const SECRET = flag('secret', process.env.YT_CLIENT_SECRET || '');
// 出したいチャンネル。既定は依頼者の指定（表示名 primaries）
const WANT = flag('channel', process.env.YT_CHANNEL || '@yama-ha-i-zo');

if (!ID || !SECRET) {
  console.error('クライアントIDと秘密が要ります。');
  console.error('  node art/tools/auth.mjs --id <...> --secret <...>');
  console.error('');
  console.error('作りかた（持ち主のブラウザでしかできない）:');
  console.error('  1. https://console.cloud.google.com/ でプロジェクトを作る');
  console.error('  2. 「API とサービス」→ YouTube Data API v3 を有効化');
  console.error('  3. 「OAuth 同意画面」を作り、**「本番」に上げる**');
  console.error('     （テストのままだと、この鍵は7日で切れる）');
  console.error('  4. 「認証情報」→ OAuth クライアント ID → **デスクトップアプリ**');
  console.error('  5. 出てきたIDと秘密を、この道具に渡す');
  process.exit(2);
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

// PKCE（合言葉の引き換えを横取りされないようにする）
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(12).toString('hex');

// ブラウザを開く。**開けなくても落とさないこと。**
// `spawn` の失敗は非同期の 'error' イベントで来るので、try/catch では捕まらない
// （xdg-open が無い端末で「Unhandled 'error' event」で落ちた）。
// 開けなければ URL を出すだけでよく、手で開いてもらえば足りる。
const open = (url) => {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
    p.on('error', () => { /* 上の URL を手で開いてもらう */ });
    p.unref();
  } catch (e) { /* 同じ */ }
};

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  const back = (msg) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<meta charset="utf-8"><body style="font:16px/1.7 system-ui;padding:3em">'
      + msg + '<p>この頁は閉じてよいです。</p></body>');
  };
  if (err) { back('許可されませんでした: ' + err); finish(null, err); return; }
  if (u.searchParams.get('state') !== state) { back('state が合いません'); finish(null, 'state'); return; }
  if (!code) { res.writeHead(400); res.end(); return; }
  back('受け取りました。端末に戻ってください。');
  finish(code, null);
});

let done = false;
async function finish(code, err) {
  if (done) return;
  done = true;
  srv.close();
  if (!code) { console.error('\n取れませんでした: ' + err); process.exit(1); }

  // 合言葉を引き換える
  const port = srv.address() ? srv.address().port : PORT;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: ID, client_secret: SECRET,
      redirect_uri: `http://127.0.0.1:${PORT}`,
      grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.refresh_token) {
    console.error('\n合言葉を引き換えられませんでした: ' + JSON.stringify(j));
    if (!j.refresh_token && res.ok) {
      console.error('（refresh token が返っていません。一度許可を取り消してからやり直す:');
      console.error('  https://myaccount.google.com/permissions ）');
    }
    process.exit(1);
  }

  // **投稿先を確かめる。** ここで間違いに気づけるのが、この道具のいちばんの値打ち
  let who = null;
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { authorization: 'Bearer ' + j.access_token } });
    const c = await r.json();
    if (c.items && c.items.length) {
      who = { id: c.items[0].id, title: c.items[0].snippet.title,
        handle: c.items[0].snippet.customUrl || '' };
    }
  } catch (e) { /* 確かめられないだけ */ }

  console.log('');
  if (who) {
    console.log(`投稿先: ${who.title}  ${who.handle}  ${who.id}`);
    const want = WANT.toLowerCase().replace(/^@/, '');
    const ok = who.id.toLowerCase() === want
      || who.handle.toLowerCase().replace(/^@/, '') === want
      || who.title.toLowerCase() === want;
    if (!ok) {
      console.error('');
      console.error(`**違うチャンネルです。** 出したいのは ${WANT} でした。`);
      console.error('許可を取り消して、もう一度この道具を動かし、');
      console.error('「チャンネルを選択」の画面で正しい方を選んでください:');
      console.error('  https://myaccount.google.com/permissions');
      console.error('');
      console.error('（この鍵は使わないこと。環境変数には入れません）');
      process.exit(1);
    }
    console.log('出したいチャンネルと合っています。');
  } else {
    console.log('投稿先を確かめられませんでした（youtube.readonly が許可されていない）。');
  }

  console.log('');
  console.log('YT_REFRESH_TOKEN=' + j.refresh_token);
  console.log('');
  if (has('setx') && process.platform === 'win32') {
    const put = (k, v) => new Promise((ok2) => {
      const p = spawn('cmd', ['/c', 'setx', k, v], { stdio: 'ignore' });
      p.on('exit', () => ok2());
    });
    await put('YT_CLIENT_ID', ID);
    await put('YT_CLIENT_SECRET', SECRET);
    await put('YT_REFRESH_TOKEN', j.refresh_token);
    await put('YT_CHANNEL', WANT);
    console.log('環境変数に入れました（YT_CLIENT_ID / YT_CLIENT_SECRET /');
    console.log('YT_REFRESH_TOKEN / YT_CHANNEL）。**端末を開き直すと効きます。**');
  } else {
    console.log('環境変数に入れる（Windows・端末を開き直すと効く）:');
    console.log(`  setx YT_CLIENT_ID "${ID}"`);
    console.log('  setx YT_CLIENT_SECRET "***"');
    console.log('  setx YT_REFRESH_TOKEN "***"');
    console.log(`  setx YT_CHANNEL "${WANT}"`);
    console.log('（--setx を付けて動かせば、これを自分でやります）');
  }
  process.exit(0);
}

// 受け口を立てる。**Google は loopback の口を許している**ので、
// ここに返してもらう（手で文字列を貼る手順が消える）
const PORT = parseInt(flag('port', '8731'), 10);
srv.listen(PORT, '127.0.0.1', () => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: ID,
    redirect_uri: `http://127.0.0.1:${PORT}`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',                       // 毎回 refresh token を返させる
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  console.log('ブラウザを開きます。**「チャンネルを選択」が出たら ' + WANT + ' を選んでください。**');
  console.log('');
  console.log('開かなければ、この URL を自分で開いてください:');
  console.log(url);
  console.log('');
  console.log('待っています…（やめるときは Ctrl+C）');
  open(url);
});

// OAuth クライアントに入れる「承認済みのリダイレクト URI」
// デスクトップアプリなら loopback は自動で許されるので、登録は要らない。
