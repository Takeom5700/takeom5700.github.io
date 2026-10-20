// 過去に使った素材を使わせない台帳。**「毎回1から」を機械に守らせる道具。**
//
//   node art/tools/fresh.mjs --seed 186            # 今日のぶんが新しいか見る
//   node art/tools/fresh.mjs --seed 186 --record   # 通ったら台帳に書く
//   node art/tools/fresh.mjs --list                # 台帳の中身
//
// 依頼者:
//   「毎回1から全く違うものを作って、過去の素材の使い回しはしないこと」
//   「とにかく毎日全て1から作り直してね」
//
// **素材と哲学を分ける。**
//   素材 … 形・配色・楽器・調・拍子・和音の進行・伴奏・旋律・層・尺・題名
//           → これは毎回新しくする。台帳が過去のものを覚えていて、拒む
//   哲学 … 対比・流れ・型を持つこと・原色の面・コマ打ち・一つの種・
//           画面に文字を出さない・怖がらせに行かない
//           → これは変えない。**変えてはいけないものは台帳に載せない**
//
// 台帳は `art/works/ledger.json`。中身は「過去の作品が何を使ったか」だけ。
// **落ちたら種を変えるのではなく、素材を新しく作ること**（形を足す・配色を足す）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWork } from '../js/score.js';
import { composeMusic } from '../js/music.js';
import { LAYER_NAMES } from '../js/layer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(HERE, '..', 'works', 'ledger.json');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes('--' + n);

export function load() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return { works: [] }; }
}
export function save(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}
export const LEDGER_PATH = LEDGER;

// ---- かぶらない種を探す（毎日の道が呼ぶ）------------------------------
// **「種を変えて逃げない」は人への戒めで、機械の手順ではない。**
// 素材は毎日新しく作り続けているので（配色・楽器・和音・伴奏・低音・旋律・
// 音色はすべて生成）、種を動かせば必ず新しい素材の組が出る。
// ここが探すのは「**その指示書のまま**、素材が1つもかぶらない種」。
// 何十本探しても見つからないときは、素材そのものが尽きたということなので、
// 逃げずに `--stock` が指す場所を足す（呼ぶ側が警告を出す）。
export function pickFresh(brief, start, past, tries = 240) {
  const from = ((start | 0) % 1000 + 1000) % 1000;
  let best = null;
  for (let i = 0; i < tries; i++) {
    const seed = (from + i) % 1000;
    const cur = materialsOf(seed, brief);
    const hit = collide(cur, past);
    if (!hit.length) return { seed, materials: cur, hit: [], tried: i + 1 };
    if (!best || hit.length < best.hit.length) best = { seed, materials: cur, hit, tried: i + 1 };
  }
  return best;
}

// ---- その作品が使った素材を並べる ------------------------------------
// **一つでも過去と同じなら落とす。** ここに並べるものは「毎回新しくする」約束。
// **指示書（brief）を必ず渡すこと。**
// これを渡さないと、台帳は「記事なしの作品」を見て判定することになる。
// 実際に焼かれるのは `composeWork(seed, brief)` の方（形は指示書が選ぶ）なので、
// 渡さないまま照合していたあいだ、**台帳は毎日まったく別の作品を見ていた**
// ——だから同じ椅子が2日続いても落ちなかった（実際に続いた）。
export function materialsOf(seed, brief) {
  const w = composeWork(seed, brief || undefined);
  const m = composeMusic(w);
  const forms = [...new Map(w.shots.filter((x) => x.form).map((x) => [x.form.key, x.form])).values()];
  return {
    seed: seed | 0,
    題名: w.title,
    尺: w.total.toFixed(0),
    形: forms.map((f) => f.name + ':' + f.key).sort().join(' '),
    形の寸法: forms.map((f) => f.key + JSON.stringify(f.P)).sort().join(' '),
    序の形: w.shots[0].form ? w.shots[0].form.name + ':' + w.shots[0].form.key : '?',
    // **作った色そのものを記録する。** 番号（0〜7）を記録していて、
    // どの作品も同じ「0,1,2,…」になり、配色が300本のうち253本を塞いでいた。
    // 配色は作品ごとに作っているので、色で見れば必ず新しい（実測でそうなった）。
    配色: (w.pals || []).map((p) => p.g + p.i + p.a + p.l).join(' '),
    層: LAYER_NAMES[(w.shots.find((x) => x.lay) || {}).lay || 0],
    調: m.tonic + m.mode,
    拍子: m.meter,
    作法: m.method,
    速さ: String(m.tempo),
    和音: m.prog,
    編成: m.band,
    // 名前だけでなく**処方の中身まで**指紋に入れる（音色そのものが素材）
    楽器: (m.tone.voices || []).map((v) => (v && v.n) || v).join('・'),
    楽器の中身: JSON.stringify(m.tone.voices || []),
    伴奏: m.arp,
    低音: m.bass,
    太鼓: m.drum,
    旋律: JSON.stringify(m.tuneA) + JSON.stringify(m.tuneB),
    音色: JSON.stringify(m.tone).replace(/"voices":\[[^\]]*\],?/, ''),
  };
}

// **素材と組み合わせを分ける。**
//
// 素材（HARD）… 見た人・聴いた人が「前に見た／聴いた」と分かるもの。
//   形そのもの・配色・楽器の処方・旋律・音色・和音の進行・伴奏・低音・題名。
//   **1つでも過去と同じなら落とす。** 逃げ道は「素材を新しく作る」だけ。
//
// 組み合わせ（SOFT）… 4種しかない層、8種しかない拍子のように、**選び方**でしかないもの。
//   同じものが再び出ても「使い回し」には見えない。ただし**全部同じなら落とす**
//   （同じ骨組みの作品が二度出ることになる）。
//   ここに素材を混ぜないこと。混ぜると「層が4種しかないので4日目から必ず落ちる」
//   という、素材を新しくしても直らない落ち方になる。
const HARD_KEYS = ['形', '形の寸法', '配色', '楽器', '楽器の中身', '旋律', '音色', '和音', '伴奏', '低音', '題名'];
const HARD = HARD_KEYS;
// **作法（和音／音階／対位）は3つしかないので、必ずこちら側。**
// 素材の側に入れると「3日目から必ず落ちて、素材を新しくしても直らない」
// 落ち方になる（層が4種・拍子が8種のときと同じ）。
const SOFT = ['尺', '序の形', '層', '調', '拍子', '速さ', '編成', '太鼓', '作法'];

export function collide(cur, past) {
  const hit = [];
  for (const k of HARD) {
    for (const p of past) {
      if (p.materials && p.materials[k] !== undefined && p.materials[k] === cur[k]) {
        hit.push({ key: k, value: cur[k], seed: p.materials.seed, date: p.date, hard: true });
        break;
      }
    }
  }
  // 組み合わせが**丸ごと**同じ作品があれば、それも落とす
  for (const p of past) {
    if (!p.materials) continue;
    if (SOFT.every((k) => p.materials[k] === cur[k])) {
      hit.push({ key: '組み合わせ（' + SOFT.join('・') + '）が丸ごと', value: '同じ',
        seed: p.materials.seed, date: p.date, hard: false });
      break;
    }
  }
  return hit;
}

// ---- 本番 -------------------------------------------------------------
// **道具としても部品としても使う。** `daily.mjs` が `pickFresh` を呼ぶので、
// `import` されただけで下の手続きが走ってはいけない
// （走ると `--seed` が無くて `process.exit(2)` し、呼んだ側が落ちる。実際に落ちた）。
const IS_MAIN = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (IS_MAIN) {
const ledger = load();

if (has('list')) {
  console.log(`台帳: ${ledger.works.length} 本`);
  for (const w of ledger.works) {
    console.log(` ${w.date}  種${String(w.materials.seed).padStart(5)}  ${w.materials.題名}`
      + `  ${w.materials.尺}秒  形 ${w.materials.形}`);
  }
  process.exit(0);
}

// ---- 素材の残量 -------------------------------------------------------
// **いつ素材を足すべきかを機械に言わせる。** 依頼者「素材は作り続けてよ、
// 毎回作り続けてってことね」。残りが細ってきたら足す合図。
if (has('stock')) {
  const N = parseInt(flag('n', '400'), 10);
  const seen = {};
  for (const k of HARD_KEYS) seen[k] = new Set();
  for (const p of ledger.works) {
    for (const k of HARD_KEYS) if (p.materials && p.materials[k] !== undefined) seen[k].add(p.materials[k]);
  }
  let ok = 0;
  const why = {};
  for (let i = 0; i < N; i++) {
    const c = materialsOf(i);
    let bad = null;
    for (const k of HARD_KEYS) if (seen[k].has(c[k])) { bad = k; break; }
    if (bad) { why[bad] = (why[bad] || 0) + 1; continue; }
    for (const k of HARD_KEYS) seen[k].add(c[k]);
    ok++;
  }
  console.log(`台帳: ${ledger.works.length} 本`);
  console.log(`種 0〜${N - 1} を当てて、素材が一切かぶらない作品: ${ok} 本`);
  console.log('');
  const rows = Object.entries(why).sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    console.log('作れなくしている素材（多い順）:');
    for (const [k, n] of rows) console.log(`  ${k.padEnd(8, '　')} ${n} 本ぶんを塞いでいる`);
    console.log('');
    console.log('ここを増やすのがいちばん効く:');
    const WHERE = {
      形: 'art/js/form.js に骨格を足す（add-motif / motif-smith）',
      形の寸法: 'art/js/form.js の makeForm に振る幅を足す',
      配色: 'art/js/paint.js の makePalette（すでに作る方式。作る幅を広げる）',
      楽器: 'art/js/sound.js の INSTRUMENTS に処方を足す',
      旋律: 'art/js/music.js の makeTune に刻みの型を足す',
      音色: 'art/js/music.js の makeTone に振る幅を足す',
      和音: 'art/js/music.js の makeProg（すでに組む方式）',
      伴奏: 'art/js/music.js の伴奏の組み立て（長さの幅を足す）',
      低音: 'art/js/music.js の低音の組み立て（踏む場所の幅を足す）',
      題名: 'art/tools/daily.mjs の TITLES に足す',
    };
    for (const [k] of rows.slice(0, 3)) console.log(`  ${k} … ${WHERE[k] || '（生成の側を広げる）'}`);
  } else {
    console.log('いまの素材でしばらく足りている。');
  }
  process.exit(0);
}

const seed = parseInt(flag('seed', ''), 10);
if (!Number.isFinite(seed)) {
  console.error('使い方: node art/tools/fresh.mjs --seed 186 [--record] [--brief <base64url>]');
  console.error('        node art/tools/fresh.mjs --list     … 台帳の中身');
  console.error('        node art/tools/fresh.mjs --stock    … 素材の残量と、足すべき場所');
  process.exit(2);
}

// 指示書は base64url の JSON（`daily.mjs` が渡すのと同じ形）
let CLI_BRIEF = null;
{
  const b = flag('brief', '');
  if (b) {
    try {
      CLI_BRIEF = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    } catch (e) { console.error('--brief が読めません: ' + e.message); process.exit(2); }
  }
}

const cur = materialsOf(seed, CLI_BRIEF);
console.log(`種${seed}「${cur.題名}」${cur.尺}秒${CLI_BRIEF ? '（指示書あり）' : ''}`);
for (const [k, v] of Object.entries(cur)) {
  if (k === 'seed') continue;
  console.log(`  ${k.padEnd(6, '　')} ${String(v).slice(0, 96)}`);
}
console.log('');

const hit = collide(cur, ledger.works);
if (hit.length) {
  console.log(`**過去の素材を使い回している: ${hit.length} 件**`);
  for (const h of hit) {
    console.log(`  ${h.key}「${String(h.value).slice(0, 60)}」`
      + ` … ${h.date} の種${h.seed} と同じ`);
  }
  console.log('');
  console.log('**種を変えて逃げないこと。** 素材そのものを新しく作る:');
  console.log('  形   … art/js/form.js に骨格を足す（add-motif / motif-smith）');
  console.log('  配色 … art/js/paint.js の PALETTES に足す');
  console.log('  楽器 … art/js/sound.js の INSTRUMENTS に処方を足す');
  console.log('  音階・拍子 … art/js/music.js の MODES / METERS に足す');
  process.exit(1);
}

console.log('過去に使った素材は1つも入っていない。');
if (has('record')) {
  ledger.works.push({
    date: flag('date', new Date().toISOString().slice(0, 10)),
    article: flag('article', '') || null,
    materials: cur,
  });
  save(ledger);
  console.log(`台帳に書いた（ぜんぶで ${ledger.works.length} 本）: ${LEDGER}`);
} else {
  console.log('（--record を付けると台帳に書く。焼き上がって出したあとに書くこと）');
}
}
