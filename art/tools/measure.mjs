import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { composeWork } from '../js/compose.js';
import { analyse, meanAbsDiff, OK } from './metrics.mjs';

const SEED = parseInt(process.argv[2] || '0', 10);
const SIZE = '512x288';
const FRAMES = 12, STEPS = 140;
const OVER = 'grain:0';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mumei-'));
const HERE = path.dirname(new URL(import.meta.url).pathname);

function shot(name, t, over = OVER) {
  const out = path.join(DIR, name + '.png');
  execFileSync(path.join(HERE, 'capture.sh'),
    [out, String(t), SIZE, String(FRAMES), String(STEPS), String(SEED), over],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

const look = (f) => analyse(fs.readFileSync(f));
const diff = (a, b) => meanAbsDiff(fs.readFileSync(a), fs.readFileSync(b));

const work = composeWork(SEED);
console.log(`${work.title}（種 ${SEED}）を ${SIZE} / 蓄積${FRAMES}枚 / ${STEPS}歩で測る`);
console.log('');
console.log('楽章      時刻   闇:中央値 上位1% |  尺:細部  構造  | 異:空らしさ 彩度 | 判定');

let fail = 0;
const times = [];
for (const m of work.movements) {
  const t = m.start + m.dur * 0.55;
  times.push([m.name, t]);
  const a = look(shot('m' + m.index, t));
  if (!a.okDark || !a.okScale || !a.okOther) fail++;
  console.log(
    `${m.name.padEnd(4)} ${String(Math.round(t)).padStart(6)}s  ` +
    `${a.median.toFixed(4).padStart(8)} ${a.p99.toFixed(3).padStart(6)} | ` +
    `${a.fine.toFixed(4).padStart(7)} ${a.coarse.toFixed(4).padStart(6)} | ` +
    `${a.skyRamp.toFixed(2).padStart(9)} ${a.chroma.toFixed(2).padStart(5)} | ` +
    `${a.okDark ? '闇○' : '闇×'} ${a.okScale ? '尺○' : '尺×'} ${a.okOther ? '異○' : '異×'}`
  );
}

// 間と動。**速いことと切れていることは別。**
// カットは Δt をいくら小さくしても差が消えない。運動は消える。
// だから極小の間隔（1/96秒）でカットを見て、0.5秒で「動いているか」を見る。
console.log('');
for (const [name, t] of times) {
  const a = shot('a', t);
  const tiny = diff(a, shot('b', t + 1 / 96));
  const half = diff(a, shot('c', t + 0.5));
  const okCut = tiny <= OK.cutTiny;
  const okMove = half >= OK.moveHalf;
  if (!okCut || !okMove) fail++;
  console.log(
    `間/動 ${name.padEnd(3)} ${String(Math.round(t)).padStart(4)}s  ` +
    `1/96秒差 ${(tiny * 100).toFixed(2).padStart(5)}%（カットなら桁が変わる）  ` +
    `0.5秒差 ${(half * 100).toFixed(2).padStart(5)}%  ` +
    `${okCut ? '間○' : '間×'} ${okMove ? '動○' : '動× 静止画に見える'}`
  );
}

// 対照：本当にカットしたらどの値になるか。
// これを出さないと、上の数字が「小さい」と言えているのか分からない。
{
  const a = shot('x1', work.movements[1].start + work.movements[1].dur * 0.55);
  const b = shot('x2', work.movements[3].start + work.movements[3].dur * 0.55);
  console.log(`\n（対照）別の楽章どうしを並べた場合は ${(diff(a, b) * 100).toFixed(2)}% —— カットはこの桁になる`);
}

// 種：同じ引数なら同じ絵
const d1 = shot('d1', times[1][1]), d2 = shot('d2', times[1][1]);
const same = fs.readFileSync(d1).equals(fs.readFileSync(d2));
if (!same) fail++;
console.log(`種  同じ引数の再現  ${same ? '一致（バイト単位）' : '×  一致しない'}`);

fs.rmSync(DIR, { recursive: true, force: true });
console.log('');
if (fail) { console.error(`基軸に届いていない項目が ${fail} 件ある`); process.exit(1); }
console.log('焼いた絵は基軸を満たしている。');
