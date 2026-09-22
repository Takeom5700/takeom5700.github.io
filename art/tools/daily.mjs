// 毎日1本作る。note の記事から着想を得て、6分ちょうどの作品を焼き、
// 1日1つのフォルダに「作品・音楽だけ・テキスト（題名と説明文）」を置く。
//
//   node art/tools/daily.mjs --out "C:\\Users\\User\\Desktop\\Claude Art Project"
//   node art/tools/daily.mjs --out ./out --dry-run        # 焼かずに、何を作るかだけ見る
//   node art/tools/daily.mjs --out ./out --seed 42 --title Interval   # 手で決める
//   node art/tools/daily.mjs --out ./out --upload         # YouTube まで上げる
//
// **この道具は持ち主のパソコンで動かすもの。**
// Claude Code のコンテナからは note.com も YouTube も遮断されていて動かない
// （占いの自動更新と同じ事情。CLAUDE.md を見よ）。
//
// 記事から何を受け取るか:
//   記事の URL から種（seed）を決める。種が変われば図・配色・層・事が全部変わる。
//   **記事の意味を読み取って図を選ぶのは機械にはできない。**
//   そこまでやるなら Claude Code を挟んで `--title` と `--seed` を渡す
//   （`art/DAILY.md` の「二つの動かしかた」を見よ）。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);

const OUT = flag('out', process.platform === 'win32'
  ? path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'Desktop', 'Claude Art Project')
  : './out');
const FEED = flag('feed', 'https://note.com/alert_zinnia5671/rss');
const SIZE = flag('size', '2560x1440');
const VBR = flag('bitrate', '24000000');
const DRY = has('dry-run');
// 予定実行（タスクスケジューラ）から叩かれたとき、その日ぶんが既にあれば何もしない。
// 取りこぼしを拾う設定（StartWhenAvailable）を入れてあるので、
// 遅れて起きた日に2本焼いてしまわないための歯止め。
const ONCE = has('skip-if-done');

// 題名の候補。**主語のない動作か、物の名前だけ。**
// 形容詞・主張・主題を入れない（`art/CHANNEL.md` の線）。
// 使った題名は state に記録して、二度使わない。
const TITLES = [
  'Passage', 'Interval', 'Drift', 'Threshold', 'Relay', 'Current', 'Lapse',
  'Tide', 'Vessel', 'Column', 'Signal', 'Remainder', 'Transfer', 'Orbit',
  'Descent', 'Ledger', 'Vertex', 'Aperture', 'Cadence', 'Pivot', 'Sediment',
  'Beacon', 'Conduit', 'Ember', 'Fold', 'Grain', 'Hinge', 'Lattice',
  'Margin', 'Notch', 'Parcel', 'Quiver', 'Rung', 'Spindle', 'Tessera',
  'Undertow', 'Vault', 'Wane', 'Yield', 'Zenith',
];

// 決まった数（同じ記事からは必ず同じ作品が出る）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const log = (...a) => console.log(...a);
const run = (args, opt = {}) => new Promise((ok, ng) => {
  const p = spawn(process.execPath, args, { stdio: 'inherit', ...opt });
  p.on('exit', (c) => (c === 0 ? ok() : ng(new Error(args[0] + ' が ' + c + ' で終わった'))));
  p.on('error', ng);
});

// ---- 記事を1つ選ぶ -------------------------------------------------------
// RSS には有料記事も並ぶ。**有料記事は使わない**ので、記事の頁を引いて
// 値段が付いていないかを確かめる（確かめられなければ使わない。
// 勝手に有料記事を題材にしてしまう方が事故が大きい）。
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const pick = (tag) => {
      const r = new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>');
      const g = b.match(r);
      return g ? g[1].trim() : '';
    };
    items.push({
      title: pick('title'),
      link: pick('link'),
      date: pick('pubDate'),
      body: pick('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
  return items;
}

async function looksFree(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (daily.mjs)' } });
    if (!res.ok) return { free: false, why: 'HTTP ' + res.status };
    const html = await res.text();
    if (/"isPriced"\s*:\s*true/.test(html)) return { free: false, why: '有料（isPriced）' };
    if (/この続きをみるには|購入手続きへ|記事を購入する/.test(html)) return { free: false, why: '有料（本文に購入の案内）' };
    if (/"isPriced"\s*:\s*false/.test(html)) return { free: true, why: 'isPriced:false' };
    return { free: true, why: '有料の印が見つからない' };
  } catch (e) {
    return { free: false, why: '頁を引けなかった（' + e.message + '）' };
  }
}

// ---- 記録（同じ記事・同じ種・同じ題名を二度使わない） ---------------------
function loadState(dir) {
  const p = path.join(dir, '.state.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { works: [] }; }
}
function saveState(dir, st) {
  fs.writeFileSync(path.join(dir, '.state.json'), JSON.stringify(st, null, 2));
}

// ---- 本番 ---------------------------------------------------------------
// PowerShell は `%USERPROFILE%` を展開しない（cmd の書き方）。
// そのまま渡されると `%USERPROFILE%` という名前のフォルダが本当に出来てしまうので、
// 作る前に気づかせる。**PowerShell では `$env:USERPROFILE` か、--out を省く。**
if (/%[A-Za-z_][A-Za-z0-9_]*%/.test(OUT)) {
  console.error('置場に展開されていない変数が入っています: ' + OUT);
  console.error('PowerShell なら --out "$env:USERPROFILE\\Desktop\\Claude Art Project"、');
  console.error('または --out を省いてください（既定でデスクトップの Claude Art Project になります）。');
  process.exit(2);
}
// --dry-run では何も作らない（下見のつもりでフォルダが増えないように）
if (!DRY) fs.mkdirSync(OUT, { recursive: true });
const state = loadState(OUT);
const usedLinks = new Set(state.works.map((w) => w.link));
const usedSeeds = new Set(state.works.map((w) => w.seed));
const usedTitles = new Set(state.works.map((w) => w.title));

if (ONCE) {
  const today0 = new Date().toISOString().slice(0, 10);
  if (state.works.some((w) => w.date === today0)) {
    log(`${today0} のぶんはもう作ってあります（${state.works.filter((w) => w.date === today0).length}本）。何もしません。`);
    process.exit(0);
  }
}

let article = null;
if (!has('no-feed')) {
  log('note を読みます: ' + FEED);
  let xml = '';
  try {
    const res = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (daily.mjs)' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    xml = await res.text();
  } catch (e) {
    console.error('note を読めませんでした: ' + e.message);
    console.error('（このコンテナからは note.com が遮断されています。持ち主のパソコンで動かしてください）');
    if (flag('seed', null) === null) process.exit(2);
  }
  const items = xml ? parseRss(xml) : [];
  log(`記事 ${items.length} 件`);
  for (const it of items) {
    if (usedLinks.has(it.link)) continue;
    const f = await looksFree(it.link);
    if (!f.free) { log(`  見送り: ${it.title}（${f.why}）`); continue; }
    article = it; break;
  }
  if (!article && items.length) log('新しい無料記事が見つかりませんでした');
}

// 種と題名。記事があれば記事から、無ければ引数か日付から決める。
// **URL だけでなく題と本文も混ぜる。** URL だけだと、記事の中身が変わっても
// （書き直し・別の記事が同じ体裁）同じ種になり得る。題と本文を混ぜておけば、
// 違う記事からは必ず違う世界が出る。
const key = article
  ? (article.link + '|' + article.title + '|' + article.body.slice(0, 2000))
  : (flag('key', null) || new Date().toISOString().slice(0, 10));
let seed = parseInt(flag('seed', ''), 10);
if (!Number.isFinite(seed)) {
  seed = hash(key) % 1000;
  for (let g = 0; g < 1000 && usedSeeds.has(seed); g++) seed = (seed + 1) % 1000;
}
let title = flag('title', '');
if (!title) {
  const free = TITLES.filter((t) => !usedTitles.has(t));
  const pool = free.length ? free : TITLES;
  title = pool[hash(key + 'title') % pool.length];
}
// ---- 記事から指示書を組む ---------------------------------------------
// **種は記事のハッシュでしかない。** ハッシュは中身を読んでいないので、
// 「記事から着想を得た」とは言えない。記事の言葉から出す要素を決める
// （`art/js/brief.js`）。依頼者「作品にどのような要素を出すかは、
// インプットしたnote記事の内容から着想を得るようにしてね」。
//
// **直前の作品で出た図は、次の作品では出さない。**
// 台帳の `形` は5つの組をまとめて見るので、1つだけ同じでも通ってしまう
// （骨格は14しかなく1本に5つ使うので、素直に引くと次の日も平均1.8個が再登場する）。
// 依頼者「椅子のモチーフは以前見た。初回で2回連続は仕組みの不備」。
// だから直前の1本ぶんは候補から外し、その前の1本ぶんは重みを落とす。
// 「二度と出さない」にはしない（3日で骨格が尽きる。**偶然また出るのは許す**）。
const formsOf = (w) => String((w && w.materials && w.materials.形) || '')
  .split(' ').map((x) => x.split(':')[1]).filter(Boolean);
const recorded = state.works.filter((w) => w.materials);
let avoid = formsOf(recorded[recorded.length - 1]);
let soften = formsOf(recorded[recorded.length - 2]);
// **置場に素材の記録が無いうちは、台帳の `recentForms` を見る。**
// この仕組みを入れる前に焼いた作品には素材が記録されていないので、
// そのままだと「避ける図」が空のまま1本目が焼かれる
// ——つまり**直しても最初の1本だけは同じ図が出得る**。
// 台帳（`art/works/ledger.json`）の `recentForms` に持ち主が見た図を
// 入れてあるので、記録が無いときはそちらを使う。
// **焼いたあとは必ずここを書き換える**ので、次の日からは記録の側が効く。
if (!avoid.length && !has('no-ledger')) {
  try {
    const F = await import('./fresh.mjs');
    const l = F.load();
    if (Array.isArray(l.recentForms)) avoid = l.recentForms.slice();
    const last = l.works[l.works.length - 1];
    if (last) soften = formsOf(last);
  } catch (e) { /* 台帳が読めなくても進む */ }
}
if (avoid.length) log(`直前に出た図は避けます: ${avoid.join(' ')}`);

let brief = null;
if (article) {
  const { briefFromText } = await import('../js/brief.js');
  brief = briefFromText({ title: article.title, body: article.body }, seed, { avoid, soften });
}

// ---- 台帳を見て、素材がかぶらない種に決め直す -------------------------
// **ここが繋がっていなかった。** `fresh.mjs` の台帳（形・配色・楽器・旋律・
// 和音・伴奏・低音・音色・題名を1つでも過去と同じなら落とす）は作ってあったのに、
// 毎日の道からは**一度も呼ばれていなかった**。だから同じ椅子の図が2日続いても
// 誰も止めなかった（依頼者「初回で2回連続は仕組みの不備」——そのとおりだった）。
//
// 台帳は2か所に持つ。`art/works/ledger.json`（リポジトリ）と、
// 置場の `.state.json`。**毎朝の `git stash` でリポジトリ側の書き込みが
// 棚上げされて消えるため**、置場の側だけは必ず残るようにしてある。
// 照合はこの2つを合わせて行う。
let materials = null;
let freshWarn = null;
// **手で `--seed` を指定したときは動かさない**（下見・焼き直しのため）。
const SEED_GIVEN = flag('seed', null) !== null;
if (!has('no-ledger') && !SEED_GIVEN) {
  const F = await import('./fresh.mjs');
  const ledger = F.load();
  const past = [
    ...ledger.works,
    ...state.works.filter((w) => w.materials).map((w) => ({ date: w.date, materials: w.materials })),
  ];
  const got = F.pickFresh(brief, seed, past);
  if (got && !got.hit.length) {
    if (got.seed !== seed) log(`種を ${seed} → ${got.seed} に寄せました（素材が過去とかぶらない最初の種）`);
    seed = got.seed;
    materials = got.materials;
  } else if (got) {
    // **素材が尽きたということなので、逃げずに知らせる。**
    seed = got.seed;
    materials = got.materials;
    freshWarn = got.hit.map((h) => `${h.key}（${h.date} の種${h.seed}と同じ）`);
    log('');
    log('**素材が足りません。** 240通り当てても、過去とかぶらない組が出ませんでした。');
    for (const w of freshWarn) log('  かぶり: ' + w);
    log('  足す場所は `node art/tools/fresh.mjs --stock` が指します。');
    log('');
  }
  // 種が動いたので、指示書を**新しい種で組み直す**（読む場所・直接さ・図が種に依る）
  if (article) {
    const { briefFromText } = await import('../js/brief.js');
    brief = briefFromText({ title: article.title, body: article.body }, seed, { avoid, soften });
  }
}

const briefArg = brief
  ? Buffer.from(JSON.stringify(brief), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  : null;

const tag = String(((seed % 1000) + 1000) % 1000).padStart(3, '0');
const today = new Date().toISOString().slice(0, 10);
const folder = path.join(OUT, `${today} ${title} ${tag}`);

log('');
log(`題名: ${title} ${tag}`);
log(`種  : ${seed}`);
log(`記事: ${article ? article.title + ' / ' + article.link : '（無し）'}`);
log(`置場: ${folder}`);
if (brief) {
  const { FORM_KEYS } = await import('../js/form.js');
  const { LAYER_NAMES } = await import('../js/layer.js');
  log('');
  log('記事から決めた要素:');
  log(`  読んだ語: ${brief.from.words.join('・') || '（当たらず。種で振った）'}`);
  log(`  形      : ${brief.forms.map((i) => FORM_KEYS[i]).join(' ')}`);
  log(`  序の形  : ${FORM_KEYS[brief.opening]}`);
  log(`  層      : ${LAYER_NAMES[brief.layer]}`);
  log(`  尺      : ${brief.total}秒（記事 ${brief.from.文字数}字）`);
  log(`  時間の印象: 速さ${brief.pace} 揺れ${brief.sway} 刻み${brief.subdiv} 繰り返し${brief.ostinato}`);
  log(`  寄る拍子: ${Object.entries(brief.meterW).sort((a, b) => b[1] - a[1])
    .slice(0, 3).map(([k, v]) => `${k}(${v.toFixed(2)})`).join(' ')}／一文 ${brief.from.一文の長さ}字`);
}
log('');

// ---- 説明文（YouTube にそのまま貼れる形） --------------------------------
// `art/CHANNEL.md` の書式。**1〜2行目だけ言葉を置く**（機械に棚を教えるため）。
// 売り文句は入れない。記事への案内は「記録」の側に置いてあるので、
// 貼りたいときだけ自分で足すこと。
const desc = [
  'Generative film. One seed, one world, six minutes.',
  'Made entirely from code — no footage, no images, no stock. Music from the same seed.',
  '',
  `${title} ${tag}`,
  'I II III IV V',
  `6:00  seed ${seed}`,
].join('\n');

const memo = [
  '',
  '— ここから下は記録（説明欄には貼らない）—',
  `作った日: ${today}`,
  `種: ${seed}`,
  article ? `着想: ${article.title}` : '着想: （記事なし）',
  article ? `記事: ${article.link}` : '',
  brief ? `記事から決めた要素: 形 ${brief.forms.join(',')} / 序 ${brief.opening} / 層 ${brief.layer} / 尺 ${brief.total}秒` : '',
  brief ? `読んだ語: ${brief.from.words.join('・')}` : '',
  'タグ: generative art, algorithmic art, abstract animation, experimental animation,',
  '      visual music, procedural art, creative coding, motion art',
].filter(Boolean).join('\n');

if (DRY) { log('--dry-run なのでここで止めます。'); log(desc); process.exit(0); }

fs.mkdirSync(folder, { recursive: true });
const film = path.join(folder, `${title}-${tag}.webm`);
const music = path.join(folder, `${title}-${tag}-music.wav`);
const text = path.join(folder, `${title}-${tag}.txt`);

fs.writeFileSync(text, `${title} ${tag}\n\n${desc}\n${memo}\n`);
log('テキストを書きました: ' + text);

// **音楽が先。** 実時間の録画中に別の重い処理を走らせるとコマが落ちる。
log('音楽を焼きます（実時間より速い）…');
await run([path.join(HERE, 'record.mjs'), music, '--seed', String(seed), '--music',
  ...(briefArg ? ['--brief', briefArg] : [])]);

log('映像を録ります（6分かかります）…');
await run([path.join(HERE, 'record.mjs'), film, '--seed', String(seed),
  '--size', SIZE, '--bitrate', VBR, ...(briefArg ? ['--brief', briefArg] : [])]);

// **焼けたら台帳に書く。** 書かないと明日また同じ素材が出る。
// 置場（`.state.json`）とリポジトリ（`art/works/ledger.json`）の両方へ書く。
state.works.push({ date: today, title, seed, link: article ? article.link : null,
  article: article ? article.title : null, folder, materials });
saveState(OUT, state);
if (materials && !has('no-ledger')) {
  try {
    const F = await import('./fresh.mjs');
    const l = F.load();
    l.works.push({ date: today, article: article ? article.title : null, materials });
    // **直前に出た図を覚えておく。** 次の1本ではここに入っている図を出さない。
    l.recentForms = formsOf({ materials });
    F.save(l);
    log(`台帳に書きました（ぜんぶで ${l.works.length} 本）／次は ${l.recentForms.join(' ')} を避けます`);
  } catch (e) {
    log('台帳に書けませんでした（置場の記録は残っています）: ' + e.message);
  }
}
log('');
log('できました: ' + folder);

if (has('upload')) {
  log('YouTube へ上げます…');
  await run([path.join(HERE, 'upload.mjs'), film, '--title', `${title} ${tag}`,
    '--desc-file', text, '--privacy', flag('privacy', 'private')]);
  // **上げた印を置く。** 毎朝の投稿は `win/upload-latest.ps1` が
  // 「印の無いフォルダ」を拾う作りなので、印を置かないと二度上げになる。
  fs.writeFileSync(path.join(folder, '.uploaded'), new Date().toISOString());
}
