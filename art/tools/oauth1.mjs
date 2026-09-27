// OAuth 1.0a の署名（HMAC-SHA1）。**X（旧 Twitter）へ投稿するのに使う。**
//
// なぜ 1.0a なのか。X は OAuth 2.0 も持っているが、そちらは YouTube と同じ
// ブラウザの受け渡し（受け口を立てて、許可を押して、refresh token を貰う）が要る。
// **あれで半日溶かした**（`art/tools/auth.mjs` の穴の一覧を見よ）。
// 1.0a なら**自分のアカウント用の鍵を開発者ページで4つ発行するだけ**で、
// ブラウザの往復が一度も要らない。持ち主の手数がいちばん少ない。
//
// **署名は自分で組む。** 外から持ってこない（`art/` の外に依存を作らない線）。
// node の crypto だけで足りる。
//
// **ここは x.com へ届かない環境では実走できない。** だから
// **RFC 5849 §3.4.1 の検算用データで確かめる**（`--test`）。
// 実走できないものを「たぶん合っている」で出さないこと。
//
//   node art/tools/oauth1.mjs --test
//
// 署名の組みかたで間違えやすいところ（どれも実際に踏まれている）:
//   1. 符号化は **RFC3986**。`encodeURIComponent` は `!*'()` を残すので直す
//   2. 並べるのは **符号化したあと**の文字列（前に並べると順が変わる）
//   3. 同じ名前の引数は**値でも並べる**
//   4. 本文を署名に混ぜるのは **`application/x-www-form-urlencoded` のときだけ**。
//      JSON と multipart のときは混ぜない（混ぜると必ず 401 になる）
//   5. 鍵は `秘密&トークンの秘密`。**トークンが無くても `&` は残す**

import crypto from 'node:crypto';

// RFC3986。`encodeURIComponent` が残す4文字を直す
export function enc(s) {
  return encodeURIComponent(String(s))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// 引数を「符号化してから並べて」繋ぐ
function normalize(params) {
  const pairs = [];
  for (const [k, v] of params) pairs.push([enc(k), enc(v)]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1
    : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => k + '=' + v).join('&');
}

// 署名の土台。**url から query を外して、引数の側へ移すこと**
export function baseString(method, url, params) {
  const u = new URL(url);
  const clean = u.origin.toLowerCase() + u.pathname;
  const all = [...params];
  for (const [k, v] of u.searchParams) all.push([k, v]);
  return [method.toUpperCase(), enc(clean), enc(normalize(all))].join('&');
}

export function sign(method, url, params, consumerSecret, tokenSecret) {
  const key = enc(consumerSecret) + '&' + enc(tokenSecret || '');
  return crypto.createHmac('sha1', key).update(baseString(method, url, params)).digest('base64');
}

// Authorization ヘッダを作る。
//   keys  … { key, secret, token, tokenSecret }
//   form  … 本文が form-urlencoded のときだけ、その引数を渡す（JSON では渡さない）
export function authHeader(method, url, keys, form, fixed) {
  const o = [
    ['oauth_consumer_key', keys.key],
    ['oauth_nonce', (fixed && fixed.nonce) || crypto.randomBytes(16).toString('hex')],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', String((fixed && fixed.timestamp) || Math.floor(Date.now() / 1000))],
    ['oauth_token', keys.token],
    ['oauth_version', '1.0'],
  ];
  const signed = sign(method, url, [...o, ...(form || [])], keys.secret, keys.tokenSecret);
  const items = [...o, ['oauth_signature', signed]]
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`);
  return 'OAuth ' + items.join(', ');
}

// ---- 検算（RFC 5849 §3.4.1.1 の例）-------------------------------------
if (process.argv.includes('--test')) {
  let bad = 0;
  const ok = (name, got, want) => {
    const pass = got === want;
    if (!pass) bad++;
    console.log(`  ${pass ? '○' : '×'} ${name}`);
    if (!pass) { console.log(`      出た: ${got}`); console.log(`      欲しい: ${want}`); }
  };
  console.log('OAuth 1.0a の署名を RFC 5849 の例で確かめます');
  console.log('');

  // 符号化（RFC 5849 §3.6 の表）
  ok('符号化 空白', enc(' '), '%20');
  ok('符号化 記号', enc("!*'()"), '%21%2A%27%28%29');
  ok('符号化 残すもの', enc("-._~"), '-._~');
  ok('符号化 非 ASCII', enc('あ'), '%E3%81%82');

  // §3.4.1.1 の例。本文が form-urlencoded なので、本文の引数も混ぜる
  const url = 'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b';
  const oauth = [
    ['oauth_consumer_key', '9djdj82h48djs9d2'],
    ['oauth_token', 'kkk9d7dh3k39sjv7'],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', '137131201'],
    ['oauth_nonce', '7d8f3e4a'],
  ];
  const form = [['c2', ''], ['a3', '2 q']];
  const want = 'POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3D2%2520q'
    + '%26a3%3Da%26b5%3D%253D%25253D%26c%2540%3D%26c2%3D%26oauth_consumer_key'
    + '%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a%26oauth_signature_method%3DHMAC'
    + '-SHA1%26oauth_timestamp%3D137131201%26oauth_token%3Dkkk9d7dh3k39sjv7';
  ok('署名の土台', baseString('POST', url, [...oauth, ...form]), want);

  // **署名そのものは2段に分けて確かめる。**
  // 上で作った土台は RFC 5849 §3.4.1.1 に載っている文字列と一字一句同じ
  // （組み立てで間違えるのはここで、実際に間違えるのもここ）。
  // 残るのは HMAC-SHA1 だけなので、そちらは **RFC 2202 の検算用データ**で見る。
  // こうすれば「x.com に投げてみないと分からない」部分が残らない。
  //
  // **覚えている定数を答えとして書かないこと。** 最初 §3.1 の別の例に載っている
  // `bYT5CMsG…` を答えにして落ちた（引数も秘密も違う例のもの）。
  const hm = (key, data) => crypto.createHmac('sha1', key).update(data).digest('hex');
  ok('HMAC-SHA1 (RFC 2202 1)', hm(Buffer.alloc(20, 0x0b), 'Hi There'),
    'b617318655057264e28bc0b6fb378c8ef146be00');
  ok('HMAC-SHA1 (RFC 2202 2)', hm('Jefe', 'what do ya want for nothing?'),
    'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
  ok('署名（土台＋鍵から）', sign('POST', url, [...oauth, ...form], 'j49sk3j29djd', 'dh893hdasih9'),
    crypto.createHmac('sha1', 'j49sk3j29djd&dh893hdasih9').update(want).digest('base64'));
  ok('鍵はトークンが無くても & を残す',
    sign('GET', 'https://x.test/a', [['oauth_consumer_key', 'k']], 'cs', ''),
    crypto.createHmac('sha1', 'cs&').update(baseString('GET', 'https://x.test/a',
      [['oauth_consumer_key', 'k']])).digest('base64'));

  // ヘッダの形（順・引用・符号化）
  const h = authHeader('POST', 'https://api.x.com/2/tweets',
    { key: 'ck', secret: 'cs', token: 'tk', tokenSecret: 'ts' }, null,
    { nonce: 'abc', timestamp: 1700000000 });
  ok('ヘッダの頭', h.slice(0, 6), 'OAuth ');
  ok('ヘッダに版', /oauth_version="1\.0"/.test(h), true);
  ok('ヘッダに署名', /oauth_signature="[^"]+"/.test(h), true);
  ok('ヘッダに秘密を出さない', h.includes('cs') || h.includes('ts'), false);

  console.log('');
  if (bad) { console.error(`${bad} 件ちがいます。`); process.exit(1); }
  console.log('署名は RFC の例と一致しました。');
}
