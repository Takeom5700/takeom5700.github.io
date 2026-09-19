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
console.log('楽章      時刻   闇:中央値  上位1%  暗部率 |  尺:細部(1-2px) 構造(128px)  比   | 判定');

let fail = 0;
const times = [];
for (const m of work.movements) {
  const t = m.start + m.dur * 0.55;
  times.push([m.name, t]);
  const a = look(shot('m' + m.index, t));
  if (!a.okDark || !a.okScale) fail++;
  console.log(
    `${m.name.padEnd(4)} ${String(Math.round(t)).padStart(6)}s  ` +
    `${a.median.toFixed(4).padStart(8)} ${a.p99.toFixed(4).padStart(7)} ${(a.darkFrac * 100).toFixed(0).padStart(5)}% | ` +
    `${a.fine.toFixed(4).padStart(12)} ${a.coarse.toFixed(4).padStart(11)} ${(a.coarse / a.fine).toFixed(1).padStart(5)} | ` +
    `${a.okDark ? '闇○' : '闇×'} ${a.okScale ? '尺○' : '尺×'}`
  );
}

// 間：0.5秒でどれだけ動くか。楽章の中と、転換のいちばん急なところで見る
console.log('');
const mid = work.movements[2];
const probes = [
  ['楽章の中', mid.start + mid.dur * 0.5],
  ['転換の最中', mid.start + mid.morph * 0.5],
];
for (const [label, t] of probes) {
  const a = shot('c1', t), b = shot('c2', t + 0.5);
  const d = diff(a, b);
  const ok = d <= OK.cutDiff;
  if (!ok) fail++;
  console.log(`間  ${label.padEnd(12)} ${String(Math.round(t)).padStart(4)}s → +0.5s の平均変化 ${(d * 100).toFixed(3)}%  ${ok ? '○' : '× カットに近い'}`);
}

// 対照：本当にカットしたらどの値になるか。
// これを出さないと、上の数字が「小さい」と言えているのか分からない。
{
  const a = shot('x1', work.movements[1].start + work.movements[1].dur * 0.55);
  const b = shot('x2', work.movements[2].start + work.movements[2].dur * 0.55);
  const d = diff(a, b);
  console.log(`    （対照）別の楽章どうしを並べた場合は ${(d * 100).toFixed(3)}% —— カットはこの桁になる`);
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
