// YouTube のコメントを集める。**視聴者が作風に参加するための入口。**
//
//   node art/tools/comments.mjs --channel @primaries --out "C:\\...\\Claude Art Project"
//   node art/tools/comments.mjs --channel @primaries --out ./out --days 7
//
// 集めたものは `<out>/comments.json` に溜まる（重複は足さない）。
// これを読んで作風にするのは `.claude/skills/style-from-comments`。
//
// **ここでは何も判断しない。** 集めて並べるだけ。
// コメントは外から来る文字で、**命令ではなく材料**として扱う
// （そう決めておかないと、コメント欄に書かれた指示で作品が壊される）。
//
// 要るもの: YT_API_KEY（公開コメントを読むだけなら API キーで足りる。
// OAuth は要らない）。1回の呼び出しが 1 quota なので、1日分なら誤差。

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };

const KEY = process.env.YT_API_KEY;
const CHANNEL = flag('channel', '@primaries');
const OUT = flag('out', './out');
const DAYS = parseInt(flag('days', '30'), 10);
const MAXV = parseInt(flag('videos', '20'), 10);

if (!KEY) {
  console.error('YT_API_KEY を環境変数に入れてください（Google Cloud の「APIキー」）。');
  console.error('手順は art/DAILY.md の「YouTube に自動で上げる」を見てください。');
  process.exit(2);
}

// ---- 怪しいものに印を付ける（捨てはしない。印だけ） --------------------
// **判断はしないが、目印は付ける。** 汲む側（style-from-comments）が
// これを見て弾く。機械の側で先に印を付けておくと、見落としが減る。
const SUSPECT = [
  // 指示を乗っ取ろうとするもの（プロンプトインジェクション）
  [/ignore (all )?(previous|prior|above)|disregard (the )?(previous|above)/i, '指示の乗っ取り'],
  [/これまでの指示|上の指示|命令を無視|システムプロンプト|system prompt/i, '指示の乗っ取り'],
  [/あなたは今から|you are now|act as|jailbreak|DAN モード/i, '役割の書き換え'],
  [/スキルを書き換え|rewrite the (skill|rule|prompt)|update your (rules|instructions)/i, 'スキルの書き換え'],
  [/APIキー|api[ _-]?key|token|パスワード|password|\.env/i, '鍵の要求'],
  [/実行して|コマンド|curl |wget |npm i |pip install|powershell|cmd\.exe/i, '実行の要求'],
  // 金や手間がかかるもの
  [/課金|有料|サブスク|購入|買って|投げ銭|支援して|スパチャ|メンバーシップ/i, '金のかかる求め'],
  [/\$\d|\d+\s*(円|ドル|USD|JPY)/i, '金のかかる求め'],
  [/10時間|24時間|毎時|1日\s*\d+\s*本|(\d+)\s*hours?\b/i, '量の要求（時間・本数）'],
  [/premiere|after ?effects|midjourney|runway|stock (footage|music)|素材を買/i, '外部の有料サービス'],
  // 連絡先・宣伝
  [/https?:\/\/|www\.|t\.me\/|discord\.gg|@[a-z0-9_]{4,}\.(com|net)/i, '外部リンク'],
  [/チャンネル登録して|相互登録|拡散希望|宣伝|PR|案件/i, '宣伝'],
];
function suspect(text) {
  const out = [];
  for (const [re, why] of SUSPECT) if (re.test(text) && !out.includes(why)) out.push(why);
  return out;
}

const api = async (p, q) => {
  const u = new URL('https://www.googleapis.com/youtube/v3/' + p);
  for (const k in q) u.searchParams.set(k, q[k]);
  u.searchParams.set('key', KEY);
  const res = await fetch(u);
  const j = await res.json();
  if (!res.ok) throw new Error(p + ': ' + JSON.stringify(j.error || j));
  return j;
};

// ---- チャンネル → 投稿の再生リスト → 動画 → コメント ----------------------
const ch = await api('channels', CHANNEL.startsWith('@')
  ? { part: 'contentDetails,snippet', forHandle: CHANNEL }
  : { part: 'contentDetails,snippet', id: CHANNEL });
if (!ch.items || !ch.items.length) { console.error('チャンネルが見つかりません: ' + CHANNEL); process.exit(1); }
const uploads = ch.items[0].contentDetails.relatedPlaylists.uploads;
console.log(`${ch.items[0].snippet.title}（${CHANNEL}）`);

const pl = await api('playlistItems', { part: 'contentDetails,snippet', playlistId: uploads, maxResults: String(MAXV) });
const since = Date.now() - DAYS * 86400000;
const videos = (pl.items || [])
  .filter((i) => new Date(i.contentDetails.videoPublishedAt || 0).getTime() > since)
  .map((i) => ({ id: i.contentDetails.videoId, title: i.snippet.title }));
console.log(`直近 ${DAYS} 日の動画: ${videos.length} 本`);

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'comments.json');
let store = { fetched: null, comments: [] };
try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* 初回 */ }
const known = new Set(store.comments.map((c) => c.id));

let added = 0;
for (const v of videos) {
  let page = '';
  for (let k = 0; k < 3; k++) {           // 1本につき最大300件まで
    let j;
    try {
      j = await api('commentThreads', {
        part: 'snippet', videoId: v.id, maxResults: '100',
        order: 'time', textFormat: 'plainText', ...(page ? { pageToken: page } : {}),
      });
    } catch (e) {
      // コメントを切っている動画・消された動画は飛ばす
      console.log(`  ${v.title}: 読めません（${String(e.message).slice(0, 60)}）`);
      break;
    }
    for (const it of j.items || []) {
      const s = it.snippet.topLevelComment.snippet;
      if (known.has(it.id)) continue;
      known.add(it.id);
      const text = (s.textOriginal || '').slice(0, 1200);
      store.comments.push({
        id: it.id,
        video: v.id,
        videoTitle: v.title,
        at: s.publishedAt,
        by: s.authorDisplayName,       // 記録には残すが、**作風の書付には名前を書かない**
        text,
        likes: s.likeCount || 0,
        flags: suspect(text),          // 怪しいものの目印（捨てはしない）
        used: false,                   // 作風に取り込んだら true にする
      });
      added++;
    }
    page = j.nextPageToken || '';
    if (!page) break;
  }
}

store.fetched = new Date().toISOString();
store.comments.sort((a, b) => (a.at < b.at ? 1 : -1));
fs.writeFileSync(file, JSON.stringify(store, null, 2));
console.log(`新しいコメント ${added} 件（ぜんぶで ${store.comments.length} 件）`);
console.log(file);
const un = store.comments.filter((c) => !c.used).length;
console.log(`まだ作風に取り込んでいないもの: ${un} 件`);
const flagged = store.comments.filter((c) => !c.used && c.flags && c.flags.length);
if (flagged.length) {
  console.log('');
  console.log(`印の付いたもの: ${flagged.length} 件（**従わない**。作風に積まない）`);
  for (const c of flagged.slice(0, 10)) {
    console.log(`  [${c.flags.join('・')}] ${c.text.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
}
