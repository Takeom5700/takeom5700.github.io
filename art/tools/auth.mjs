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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// **自分の場所は `fileURLToPath` で取る。** `new URL(import.meta.url).pathname` は
// Windows で `/C:/Users/...` を返し、`path.resolve` が `\C:\Users\...` にする。
const HERE = path.dirname(fileURLToPath(import.meta.url));

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
//
// **Windows で `cmd /c start` に URL を渡さないこと。**
// cmd は `&` をコマンドの区切りとして読むので、**URL が最初の `&` で切られる。**
// 許可の URL は `?client_id=…&redirect_uri=…&response_type=code&…` なので、
// `client_id` だけが届いて Google が
// 「Required parameter is missing: response_type / エラー 400: invalid_request」
// を返す（持ち主のパソコンで実際にこれが出た）。
// `%2F` のような百分率も cmd が変数展開の記号として触る。
//
// だから `rundll32 url.dll,FileProtocolHandler <url>` を使う。
// これは引数をそのまま受け取って既定のブラウザへ渡すので、
// **cmd の解釈が一切入らない**（`&` も `%` も無事に届く）。
const open = (url) => {
  const cmd = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
    p.on('error', () => { /* 下の控えの頁を開いてもらう */ });
    p.unref();
  } catch (e) { /* 同じ */ }
};

// **控えを1枚置く。** 端末から長い URL を写すのは現実的でないので、
// 押すだけで飛べる頁をファイルに書いて、その場所を知らせる。
// ブラウザが開かない・開いた URL が変だったときは、これを開けばよい。
const writeFallback = (url) => {
  try {
    const f = path.join(HERE, '.auth-link.html');
    fs.writeFileSync(f, '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">'
      + '<title>YouTube の許可</title>'
      + '<style>body{font-family:sans-serif;max-width:700px;margin:80px auto;padding:0 20px;'
      + 'line-height:1.9}a{font-size:20px}code{background:#eee;padding:2px 6px}</style></head><body>'
      + '<h1>YouTube への許可</h1>'
      + '<p>下を押すと Google の同意画面が開きます。'
      + '<strong>「チャンネルを選択」が出たら primaries（@yama-ha-i-zo）を選んでください。</strong></p>'
      + `<p><a href="${url.replace(/&/g, '&amp;')}">許可の画面へ進む</a></p>`
      + '<p>「このアプリは Google で確認されていません」と出たら、'
      + '<strong>「詳細」→「Primaries（安全ではないページ）に移動」</strong>で進めます。</p>'
      + '<p>終わったら、この頁は閉じてよいです。</p>'
      + '</body></html>', 'utf8');
    return f;
  } catch (e) { return null; }
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
//
// **口が塞がっていたら次の口へ移ること。** 前回の許可取りが途中で終わると
// その process が口を掴んだまま残り（窓を×で閉じても node は生きている）、
// 次に動かしたとき `EADDRINUSE 127.0.0.1:8731` で落ちる。
// これは持ち主のパソコンで実際に起きて、「テスターに足したのに通らない」
// ように見えていた（原因は許可の側ではなく、こちらの口の取り合いだった）。
// デスクトップアプリの鍵なら loopback の**どの口でも**Google が受けるので、
// 塞がっていたら黙って隣へ移る。
const PORT0 = parseInt(flag('port', '8731'), 10);
let PORT = PORT0;
srv.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE' && PORT < PORT0 + 20) {
    PORT++;
    console.log(`  口 ${PORT - 1} は塞がっていたので ${PORT} を使います`);
    setTimeout(() => srv.listen(PORT, '127.0.0.1'), 60);
    return;
  }
  console.error('');
  console.error('受け口を立てられませんでした: ' + (e && e.message));
  console.error('開いている cmd の窓を全部閉じてから、もう一度動かしてください。');
  process.exit(1);
});
srv.on('listening', () => {
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
  const fb = writeFallback(url);
  if (fb) {
    console.log('**開かなかったら、このファイルをダブルクリックしてください**');
    console.log('  ' + fb);
    console.log('（押すだけで同意画面へ飛べる控えです。端末から長い URL を');
    console.log('  写す必要はありません）');
  } else {
    console.log('開かなければ、この URL を自分で開いてください:');
    console.log(url);
  }
  console.log('');
  console.log('待っています…（やめるときは Ctrl+C）');
  open(url);
});
srv.listen(PORT, '127.0.0.1');

// OAuth クライアントに入れる「承認済みのリダイレクト URI」
// デスクトップアプリなら loopback は自動で許されるので、登録は要らない。
