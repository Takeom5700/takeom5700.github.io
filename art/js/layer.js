// 層（layer）— **断で切れないもの。**
//
// 景（カット）は切れる。切れることが法「断」だった。
// けれど切れるものだけで6分を組むと、切れ目の数だけ作品が分かれて見える。
// 依頼者の指摘:
//
//   「シーンとかカットをまたいでるようなレイヤーがあってもいいんじゃないかな」
//
// そこで**作品の頭から終わりまで、同じ時計で動き続けるもの**を1つ通す。
// 水位が上がる／日が渡る／塵が流れる／人が歩いていく——どれも、
// 断のたびに絵が全部入れ替わっても、**そこだけは続いている。**
//
// 大事なのは3つ。
//
//   1. **時計は作品の絶対時刻。** 景のローカル時間では切れてしまう。
//      `sh.lyT0` と `sh.lyD` に「層の時計」が入っている（譜が渡す）。
//   2. **景の動き（寄り・流し）を掛けない。** 層だけが動かない平面なので、
//      カットとカメラがその周りで動いていることが分かる。
//   3. **細く・小さく置く。** 余白を食う層は、余白の法と喧嘩する。
//
// ここに美の判断は置かない（形と数だけ）。何を通すかは score.js が決める。

import { nz, nz01, snz, brush, path, blob, clamp, lumOf, hueGap, TAU } from './paint.js';
import { humanOn } from './motif.js';

export const LAYER_NAMES = ['無', '水位', '日', '塵', '歩'];
// 図の前に描くか（塵と歩は前、水位と日は後ろ）
export const LAYER_FRONT = [0, 0, 0, 1, 1];

// 層の色。**地から遠く、かつ図の色とも違う色を選ぶ。**
// 差し色を決め打ちすると、地の割りに差し色を使っている景で層が消える
// （人を差し色で描いて赤の上に赤になった、あの穴と同じ）。
// 図と同じ色にしてもいけない。層が図の一部に見えて、
// 「カットをまたいで続いているもの」だと分からなくなる（実際にそう見えた）。
export function layerColor(col) {
  const cands = [col.a, col.l, col.i];
  let best = cands[0], score = -1;
  for (const c of cands) {
    const fromG = Math.abs(lumOf(col.g) - lumOf(c)) * 1.3 + hueGap(col.g, c);
    const fromI = Math.abs(lumOf(col.i) - lumOf(c)) * 0.9 + hueGap(col.i, c);
    const d = fromG + fromI;
    if (d > score) { score = d; best = c; }
  }
  return best;
}

// 進みぐあい。端でためて中ほどで動く（機械の等速に見せない）
function ease(u) { return u * u * (3 - 2 * u); }

export function drawLayer(ctx, S, sh, col, u, f, front) {
  const k = sh.lay | 0;
  if (!k || !sh.lyW) return;
  if (!!LAYER_FRONT[k] !== !!front) return;
  const c = layerColor(col);
  const w = sh.lyW;
  const dir = sh.lyDir < 0 ? -1 : 1;
  const p = clamp(u, 0, 1);
  const seed = Math.floor(f * 0.5) * 13 + 7;   // 層も沸く（コマ打ちの呼吸）

  ctx.save();
  ctx.fillStyle = c;

  if (k === 1) {
    // 水位 — 一本の線が、作品を通して上がる（または下がる）。
    // 塗り潰さない（面で塗ると地と喧嘩して、余白が消える）
    const y0 = dir > 0 ? 0.86 : 0.24, y1 = dir > 0 ? 0.26 : 0.84;
    const y = S.h * (y0 + (y1 - y0) * ease(p) * (0.6 + sh.lyA * 0.5));
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      pts.push([i / 26 * S.w * 1.02 - S.w * 0.01,
        y + snz(i * 0.42 + p * 3, seed) * S.h * 0.008]);
    }
    brush(ctx, pts, S.h * 0.006 * (0.7 + sh.lyB * 0.8) * w, seed + 3, false);
  } else if (k === 2) {
    // 日 — 大きな円が、作品を通して渡る。図の後ろに出る
    const x = S.w * (dir > 0 ? 0.08 + 0.86 * ease(p) : 0.92 - 0.86 * ease(p));
    const y = S.h * (0.74 - Math.sin(p * Math.PI) * (0.36 + sh.lyA * 0.22));
    const r = S.h * (0.11 + sh.lyB * 0.11);
    ctx.beginPath();
    path(ctx, blob(x, y, new Array(40).fill(r * (0.9 + 0.2 * w)), seed, 0.014));
    ctx.fill();
  } else if (k === 3) {
    // 塵 — 粒が同じ向きに流れ続ける。図の前に出る
    const n = 22 + Math.floor(sh.lyA * 14);
    for (let i = 0; i < n; i++) {
      const sp = 0.6 + nz01(i * 71 + 5) * 0.9;
      let x = nz01(i * 37 + 11) + dir * p * sp * 1.4;
      x = ((x % 1) + 1) % 1;
      const y = nz01(i * 53 + 23) * 0.94 + snz(p * 4 + i, seed) * 0.02;
      const rr = S.h * (0.0035 + nz01(i * 17 + 3) * 0.0075) * (0.7 + w * 0.6);
      ctx.beginPath();
      ctx.arc(x * S.w, y * S.h, rr, 0, TAU);
      ctx.fill();
    }
  } else if (k === 4) {
    // 歩 — ひとりが、作品を通して横切っていく。
    // **小さく置く。** 大きく置くと主役になって、図の邪魔をする
    const x = S.w * (dir > 0 ? -0.04 + 1.08 * ease(p) : 1.04 - 1.08 * ease(p));
    const gy = S.h * (0.74 + sh.lyA * 0.16);
    const hs = S.h * (0.055 + sh.lyB * 0.045) * (0.8 + w * 0.3);
    // 層の色で描く（図と同じ色にすると図の一部に見える）
    humonWalk(ctx, { g: col.g, i: c, a: col.a, l: col.l }, x, gy, hs, f, dir, seed);
  }
  ctx.restore();
}

// 歩く人。`humanOn` は図の色で描いて地の色で縁を取るので、どの地でも消えない
function humonWalk(ctx, col, x, gy, hs, f, dir, seed) {
  ctx.save();
  if (dir < 0) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
  humanOn(ctx, col, x, gy, hs, (f % 24) * 0.6 + 1, 0, seed);
  ctx.restore();
}

// 層の進みぐあい（絶対時刻から）。**景のローカル時間を使わないこと。**
export function layerPhase(sh, t) {
  const d = sh.lyD || 1;
  return clamp(((t - (sh.lyT0 || 0)) / d), 0, 1);
}
