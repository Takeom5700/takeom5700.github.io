// 頁を1回だけ開いて、外から焼かせるための最小の足場。
// 書き出し（export.mjs）と下見（preview.mjs）が共有する。
//
// 外部の道具は入れない方針なので、CDP を自前で叩いている
// （Node 22 に WebSocket が入っているので依存は要らない）。
// 毎フレームごとにブラウザを立ち上げ直さないぶん、場のテクスチャを
// 作り直さずに済んで速い。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import http from 'node:http';

// **`new URL(import.meta.url).pathname` を使わないこと。**
// Windows では `/C:/Users/...` と頭に `/` が付き、path.resolve が
// `\C:\Users\...` を返す。そこから配ろうとすると全部 404 になり、
// 頁が真っ白のまま「頁が口を出さなかった」で落ちる（実際に落ちた）。
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
// Chrome の場所。`CHROME` で指すのが確実。
// 指定が無ければ、その OS のよくある場所を順に探す（Windows でも動くように）。
const CHROME = process.env.CHROME || findChrome();
function findChrome() {
  const cands = process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  for (const c of cands) { try { if (c && fs.existsSync(c)) return c; } catch (e) { /* 次へ */ } }
  return cands[0];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ES モジュールは file:// から読めないので、自分で配る。
// あわせて、頁から絵と音をバイナリで受け取る口（POST /__sink）を持つ。
// CDP 経由で base64 文字列として返すと 1MB あたりで詰まるので、
// 大きいものは必ずこちらを通す（33%の水増しも無い）。
function serve(getSink) {
  return new Promise((resolve) => {
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
    };
    const srv = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/__sink')) {
        const parts = [];
        req.on('data', (c) => parts.push(c));
        req.on('end', async () => {
          const sink = getSink();
          try {
            if (sink) await sink(Buffer.concat(parts));
            res.writeHead(204); res.end();
          } catch (e) {
            res.writeHead(500); res.end(String(e && e.message));
          }
        });
        return;
      }
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, ng) => {
    ws.onopen = ok;
    ws.onerror = () => ng(new Error('CDP に繋がらない'));
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    clearTimeout(w.timer);
    if (msg.error) w.ng(new Error(msg.error.message));
    else w.ok(msg.result);
  };
  // 繋がりが切れたら待っている全部を失敗させる。
  // これをしないと、返事が来ない状態が「永久に待つ」になる（実際に詰まった）。
  const abort = (why) => {
    for (const [, w] of waiting) { clearTimeout(w.timer); w.ng(new Error(why)); }
    waiting.clear();
  };
  ws.onclose = () => abort('CDP が切れた');
  ws.onerror = () => abort('CDP が壊れた');
  const send = (method, params, timeoutMs = 900000) => new Promise((ok, ng) => {
    const n = ++id;
    const timer = setTimeout(() => { waiting.delete(n); ng(new Error(method + ' が返ってこない')); }, timeoutMs);
    waiting.set(n, { ok, ng, timer });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('頁側で例外: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function launch(url, software, size) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumei-chrome-'));
  const gl = software
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--user-data-dir=' + dir,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    // 実時間で録るとき（tools/record.mjs）に rAF を絞られないようにする
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=' + (size || '1280,720'),
    ...gl, url,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  // Chrome が実際に使った番号を書き出すので、それを読む
  const portFile = path.join(dir, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(portFile)) {
      const v = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
      if (v > 0) { port = v; break; }
    }
    await sleep(100);
  }
  if (!port) { proc.kill(); throw new Error('Chrome が起動しなかった'); }

  for (let i = 0; i < 150; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) return { proc, dir, port, page };
    await sleep(100);
  }
  proc.kill();
  throw new Error('頁の target が見つからない');
}

// 作品の頁を開いて、window.__mumei が出るまで待つ。
// GPU で WebGL2 が取れなければソフトウェア描画に自動で落ちる
// （この環境には GPU が無いので、必ず2回目で通る）。
export async function open(query, opt = {}) {
  let sink = null;
  const srv = await serve(() => sink);
  const port = srv.address().port;
  const url = `http://127.0.0.1:${port}/art/index.html?${query}`;
  const modes = opt.software ? [true] : [false, true];
  for (const software of modes) {
    const ch = await launch(url, software, opt.size);
    const cdp = await connect(ch.page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable', {});
    // 書き出しの口（__mumei）か、録りの口（__save）が出るまで待つ。
    // 再生の頁（?auto=1）には __mumei が無いので、両方を見る。
    const want = opt.api === 'save' ? 'window.__save ? 1 : null' : 'window.__mumei ? window.__mumei.meta : null';
    let meta = null;
    for (let i = 0; i < 160; i++) {
      meta = await cdp.evaluate(want).catch(() => null);
      if (meta) break;
      await sleep(100);
    }
    if (meta) {
      return {
        meta, software, evaluate: cdp.evaluate,
        // 次に頁から届くバイナリの受け取り先を差し替える
        setSink(fn) { sink = fn; },
        close() {
          cdp.close();
          try { ch.proc.kill(); } catch {}
          try { fs.rmSync(ch.dir, { recursive: true, force: true }); } catch {}
          srv.close();
        },
      };
    }
    cdp.close();
    try { ch.proc.kill(); } catch {}
    try { fs.rmSync(ch.dir, { recursive: true, force: true }); } catch {}
    if (!software && opt.onFallback) opt.onFallback();
  }
  srv.close();
  throw new Error('頁が口を出さなかった（読み込みに失敗している）');
}
