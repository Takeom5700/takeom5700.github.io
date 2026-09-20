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
      store.comments.push({
        id: it.id,
        video: v.id,
        videoTitle: v.title,
        at: s.publishedAt,
        by: s.authorDisplayName,       // 記録には残すが、**作風の書付には名前を書かない**
        text: (s.textOriginal || '').slice(0, 1200),
        likes: s.likeCount || 0,
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
