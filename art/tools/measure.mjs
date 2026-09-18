// 書き出したフレームを基軸で測る。
//
//   node art/tools/measure.mjs            # 譜 seed=0 の全楽章
//   node art/tools/measure.mjs 3          # 種を指定
//
// 譜の側の検査（check-axis.mjs）は「そう書いたか」しか見られない。
// 闇の量・尺度の同居・カットの無さは、実際に焼いた絵でしか測れない。
// ここがその実測。
//
// 粒（grain）は切って測る。粒は高周波の雑音なので、入れたままだと
// 「尺」の細部エネルギーを底上げして、測定が意味を失う。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { decode, luma } from './png.mjs';
import { composeWork, resolve } from '../js/compose.js';

const SEED = parseInt(process.argv[2] || '0', 10);
const SIZE = '512x288';
const FRAMES = 12, STEPS = 140;
const OVER = 'grain:0';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mumei-'));
const HERE = path.dirname(new URL(import.meta.url).pathname);

// 合格の線。実測してから余裕を見て決めた値。
const OK = {
  darkMedian: 0.13,   // 闇：線形輝度の中央値がこれ以下
  lightP99:   0.030,  // 闇：上位1%はこれ以上（暗いだけの絵は闇ではない）
  fineBand:   0.0035, // 尺：1〜2画素の細部エネルギー
  coarseBand: 0.010,  // 尺：128画素規模の構造エネルギー
  cutDiff:    0.050,  // 間：0.5秒でこれ以上動いたらカットとみなす
};

function shot(name, t, over = OVER) {
  const out = path.join(DIR, name + '.png');
  execFileSync(path.join(HERE, 'capture.sh'),
    [out, String(t), SIZE, String(FRAMES), String(STEPS), String(SEED), over],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

// 多重解像度。各段の「その段でしか説明できない量」の RMS。
// out[0] が 1〜2画素、out[k] が 2^(k+1) 画素の構造。
function bands(v, w, h) {
  let cur = v, cw = w, ch = h;
  const out = [];
  while (cw >= 2 && ch >= 2) {
    const nw = cw >> 1, nh = ch >> 1;
    const next = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        next[y * nw + x] = (cur[2 * y * cw + 2 * x] + cur[2 * y * cw + 2 * x + 1]
                          + cur[(2 * y + 1) * cw + 2 * x] + cur[(2 * y + 1) * cw + 2 * x + 1]) / 4;
      }
    }
    let s2 = 0;
    for (let y = 0; y < nh * 2; y++) {
      for (let x = 0; x < nw * 2; x++) {
        const d = cur[y * cw + x] - next[(y >> 1) * nw + (x >> 1)];
        s2 += d * d;
      }
    }
    out.push(Math.sqrt(s2 / (nw * nh * 4)));
    cur = next; cw = nw; ch = nh;
  }
  return out;
}

// 見た目の明暗（sRGB のまま）。帯のエネルギーは目に映る量で測る
function srgbLuma(img) {
  const { w, h, ch, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += ch) {
    out[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  return out;
}

function analyse(file) {
  const img = decode(fs.readFileSync(file));
  const lin = Array.from(luma(img)).sort((a, b) => a - b);
  const sl = srgbLuma(img);
  const b = bands(sl, img.w, img.h);
  return {
    img,
    median: lin[lin.length >> 1],
    p99: lin[Math.floor(lin.length * 0.99)],
    darkFrac: lin.filter((v) => v < 0.02).length / lin.length,
    fine: b[0],
    coarse: b[Math.min(6, b.length - 1)],
    bands: b,
  };
}

function meanAbsDiff(a, b) {
  const x = srgbLuma(decode(fs.readFileSync(a))), y = srgbLuma(decode(fs.readFileSync(b)));
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

const work = composeWork(SEED);
console.log(`${work.title}（種 ${SEED}）を ${SIZE} / 蓄積${FRAMES}枚 / ${STEPS}歩で測る`);
console.log('');
console.log('楽章      時刻   闇:中央値  上位1%  暗部率 |  尺:細部(1-2px) 構造(128px)  比   | 判定');

let fail = 0;
const times = [];
for (const m of work.movements) {
  const t = m.start + m.dur * 0.55;
  times.push([m.name, t]);
  const a = analyse(shot('m' + m.index, t));
  const okDark = a.median <= OK.darkMedian && a.p99 >= OK.lightP99;
  const okScale = a.fine >= OK.fineBand && a.coarse >= OK.coarseBand;
  if (!okDark || !okScale) fail++;
  console.log(
    `${m.name.padEnd(4)} ${String(Math.round(t)).padStart(6)}s  ` +
    `${a.median.toFixed(4).padStart(8)} ${a.p99.toFixed(4).padStart(7)} ${(a.darkFrac * 100).toFixed(0).padStart(5)}% | ` +
    `${a.fine.toFixed(4).padStart(12)} ${a.coarse.toFixed(4).padStart(11)} ${(a.coarse / a.fine).toFixed(1).padStart(5)} | ` +
    `${okDark ? '闇○' : '闇×'} ${okScale ? '尺○' : '尺×'}`
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
  const d = meanAbsDiff(a, b);
  const ok = d <= OK.cutDiff;
  if (!ok) fail++;
  console.log(`間  ${label.padEnd(12)} ${String(Math.round(t)).padStart(4)}s → +0.5s の平均変化 ${(d * 100).toFixed(3)}%  ${ok ? '○' : '× カットに近い'}`);
}

// 対照：本当にカットしたらどの値になるか。
// これを出さないと、上の数字が「小さい」と言えているのか分からない。
{
  const a = shot('x1', work.movements[1].start + work.movements[1].dur * 0.55);
  const b = shot('x2', work.movements[2].start + work.movements[2].dur * 0.55);
  const d = meanAbsDiff(a, b);
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
