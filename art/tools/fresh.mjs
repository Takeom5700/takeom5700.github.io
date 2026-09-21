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

function load() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return { works: [] }; }
}
function save(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

// ---- その作品が使った素材を並べる ------------------------------------
// **一つでも過去と同じなら落とす。** ここに並べるものは「毎回新しくする」約束。
export function materialsOf(seed) {
  const w = composeWork(seed);
  const m = composeMusic(w);
  const forms = [...new Map(w.shots.filter((x) => x.form).map((x) => [x.form.key, x.form])).values()];
  return {
    seed: seed | 0,
    題名: w.title,
    尺: w.total.toFixed(0),
    形: forms.map((f) => f.name + ':' + f.key).sort().join(' '),
    形の寸法: forms.map((f) => f.key + JSON.stringify(f.P)).sort().join(' '),
    序の形: w.shots[0].form ? w.shots[0].form.name + ':' + w.shots[0].form.key : '?',
    配色: [...new Set(w.shots.map((s) => s.pal))].sort((a, b) => a - b).join(','),
    層: LAYER_NAMES[(w.shots.find((x) => x.lay) || {}).lay || 0],
    調: m.tonic + m.mode,
    拍子: m.meter,
    速さ: String(m.tempo),
    和音: m.prog,
    編成: m.band,
    楽器: (m.tone.voices || []).join('・'),
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
const HARD = ['形', '形の寸法', '配色', '楽器', '旋律', '音色', '和音', '伴奏', '低音', '題名'];
const SOFT = ['尺', '序の形', '層', '調', '拍子', '速さ', '編成', '太鼓'];

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
const ledger = load();

if (has('list')) {
  console.log(`台帳: ${ledger.works.length} 本`);
  for (const w of ledger.works) {
    console.log(` ${w.date}  種${String(w.materials.seed).padStart(5)}  ${w.materials.題名}`
      + `  ${w.materials.尺}秒  形 ${w.materials.形}`);
  }
  process.exit(0);
}

const seed = parseInt(flag('seed', ''), 10);
if (!Number.isFinite(seed)) {
  console.error('使い方: node art/tools/fresh.mjs --seed 186 [--record]');
  console.error('        node art/tools/fresh.mjs --list');
  process.exit(2);
}

const cur = materialsOf(seed);
console.log(`種${seed}「${cur.題名}」${cur.尺}秒`);
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
