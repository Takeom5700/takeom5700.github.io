// 焼いた絵を基軸で測る目。
// 実測（measure.mjs）と下見（preview.mjs）が共有する。
// 同じ計算を二度書くと、必ず片方だけ直して意味が食い違う。

import { decode, luma } from './png.mjs';

// 合格の線。実測してから余裕を見て決めた値。
export const OK = {
  darkMedian: 0.13,   // 闇：線形輝度の中央値がこれ以下
  lightP99:   0.030,  // 闇：上位1%はこれ以上（暗いだけの絵は闇ではない）
  fineBand:   0.0035, // 尺：1〜2画素の細部エネルギー
  coarseBand: 0.010,  // 尺：128画素規模の構造エネルギー

  // 間：カットが無いこと。**速いことと切れていることは別。**
  // カットは Δt をいくら小さくしても差が消えない。運動は消える。
  // だから 1/96秒 という極小の間隔で測る（実測でカットは27%、運動は2%前後）。
  cutTiny:    0.030,
  // 動：静止画に見えないこと。0.5秒でこれ以上動く
  moveHalf:   0.015,

  // 異：自然物（とくに空）に見えないこと
  skyRamp:    0.60,   // 縦方向の輝度勾配の直線性。空は 0.9 を超える
  minChroma:  0.18,   // 彩度。大気で描くと灰青1色に寄って 0.1 を切る
};

// 見た目の明暗（sRGB のまま）。帯のエネルギーは目に映る量で測る
export function srgbLuma(img) {
  const { w, h, ch, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += ch) {
    out[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  return out;
}

// 多重解像度。各段の「その段でしか説明できない量」の RMS。
// out[0] が 1〜2画素、out[k] が 2^(k+1) 画素の構造。
export function bands(v, w, h) {
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

// 空らしさ。行ごとの平均輝度が上から下へ単調に変わるほど 1 に近づく。
// 空と雲の写真はここが 0.9 を超える。**この作品はそこを弾く。**
export function skyRamp(v, w, h) {
  const row = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += v[y * w + x];
    row[y] = s / w;
  }
  let mx = 0, my = 0;
  for (let y = 0; y < h; y++) { mx += y; my += row[y]; }
  mx /= h; my /= h;
  let sxy = 0, sxx = 0, syy = 0;
  for (let y = 0; y < h; y++) {
    const dx = y - mx, dy = row[y] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return syy < 1e-12 ? 0 : Math.abs(sxy / Math.sqrt(sxx * syy));
}

// 彩度の平均。明るい画素だけを見る（黒い画素の彩度は意味が無い）
export function chroma(img) {
  const { w, h, ch, data } = img;
  let sum = 0, n = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += ch) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = Math.max(r, g, b);
    if (mx < 24) continue;            // 暗すぎる画素は数えない
    sum += (mx - Math.min(r, g, b)) / mx;
    n++;
  }
  return n ? sum / n : 0;
}

export function analyse(buf) {
  const img = decode(buf);
  const lin = Array.from(luma(img)).sort((a, b) => a - b);
  const b = bands(srgbLuma(img), img.w, img.h);
  const r = {
    img,
    median: lin[lin.length >> 1],
    p99: lin[Math.floor(lin.length * 0.99)],
    darkFrac: lin.filter((v) => v < 0.02).length / lin.length,
    fine: b[0],
    coarse: b[Math.min(6, b.length - 1)],
    bands: b,
  };
  const sl = srgbLuma(img);
  r.skyRamp = skyRamp(sl, img.w, img.h);
  r.chroma = chroma(img);
  r.okDark = r.median <= OK.darkMedian && r.p99 >= OK.lightP99;
  r.okScale = r.fine >= OK.fineBand && r.coarse >= OK.coarseBand;
  r.okOther = r.skyRamp <= OK.skyRamp && r.chroma >= OK.minChroma;
  return r;
}

export function meanAbsDiff(bufA, bufB) {
  const x = srgbLuma(decode(bufA)), y = srgbLuma(decode(bufB));
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

// 同じ大きさの絵を縦に並べて1枚にする（下見用）
export function stack(imgs, gap = 6) {
  const W = imgs[0].w;
  const H = imgs.reduce((a, im) => a + im.h, 0) + gap * (imgs.length - 1);
  const out = Buffer.alloc(W * H * 3);
  let oy = 0;
  for (const im of imgs) {
    for (let y = 0; y < im.h; y++) {
      for (let x = 0; x < W; x++) {
        const s = (y * im.w + Math.min(x, im.w - 1)) * im.ch;
        const d = ((oy + y) * W + x) * 3;
        out[d] = im.data[s]; out[d + 1] = im.data[s + 1]; out[d + 2] = im.data[s + 2];
      }
    }
    oy += im.h + gap;
  }
  return { w: W, h: H, ch: 3, data: out };
}
