// 焼いた絵を基軸で測る目。
// 実測（measure.mjs）と下見（preview.mjs）が共有する。
//
// **「そう書いたか」は score.js の checkWork が見る。ここは「そう見えるか」を見る。**
// 譜がいくら正しくても、絵が壁紙なら退屈なので、絵の側で測る必要がある。
//
// この版で一番大事な数値は tileVar（画面内の性格の散らばり）。
// 画面を 6×4 に割って「細部の量」と「明るさ」を区画ごとに測り、
// その散らばりを見る。**均一な壁紙はここが 0 に近づく。**
// 依頼者が3回言った「同じ画面が続く」の、1枚の中の側の正体がこれ。

import { decode, luma } from './png.mjs';

export const OK = {
  poster:    0.35,   // 対比：画面に載っている色どうしの隔たり（面で見る）
  cover:     0.02,   // 対比：地以外が占める割合（線だけの景もあるので低め）
  chroma:    0.30,   // 彩：原色で置いているか（灰色に寄ると落ちる）
  // ただし彩度は**1枚ずつでは見ない。** 白黒＋赤のような組は彩度が低くても
  // 対比は最強なので、1枚で弾くと組を1つ失う。本全体の割合で見る。
  vividShare: 0.65,
  tileVar:   0.28,   // 対比：区画ごとの性格の散らばり（壁紙だと 0 に寄る）
  fine:      0.004,  // 尺：1〜2画素の細部
  coarse:    0.020,  // 尺：128画素規模の構造
  cutJump:   0.12,   // 断：切れ目をまたいだときの変化
  moveHalf:  0.008,  // 動：同じ景の中で 0.5 秒に動く量
};

export function srgbLuma(img) {
  const { w, h, ch, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += ch) {
    out[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  return out;
}

// 多重解像度。out[0] が 1〜2画素、out[k] が 2^(k+1) 画素の構造。
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

// 画面内の性格の散らばり。区画ごとの「細部の量」と「明るさ」を測り、
// それぞれの変動係数の大きい方を返す。均一な画面ほど 0 に近い。
export function tileVar(v, w, h, cols = 6, rows = 4) {
  const det = [], lum = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * w / cols), x1 = Math.floor((c + 1) * w / cols);
      const y0 = Math.floor(r * h / rows), y1 = Math.floor((r + 1) * h / rows);
      let s = 0, n = 0, d = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const a = v[y * w + x];
          s += a; n++;
          if (x + 1 < x1) d += Math.abs(a - v[y * w + x + 1]);
          if (y + 1 < y1) d += Math.abs(a - v[(y + 1) * w + x]);
        }
      }
      lum.push(s / Math.max(1, n));
      det.push(d / Math.max(1, n));
    }
  }
  const cv = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    if (m < 1e-9) return 0;
    const s = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
    return s / m;
  };
  return Math.max(cv(det), cv(lum));
}

// 彩度の平均。暗すぎる画素は数えない（黒の彩度は意味が無い）
export function chroma(img) {
  const { w, h, ch, data } = img;
  let sum = 0, n = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += ch) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = Math.max(r, g, b);
    if (mx < 24) continue;
    sum += (mx - Math.min(r, g, b)) / mx;
    n++;
  }
  return n ? sum / n : 0;
}

// 面で見たときの色。**明暗の幅では、この絵は測れない。**
// 原色の面で作っているので、図が画面の3%しか無くても対比は強い。
// 逆に明暗だけ見ると「一色に見える」と誤判定する（実際に誤判定した）。
// だから「載っている色どうしがどれだけ離れているか」で測る。
//   flat   … 上位3色が占める割合。高いほど面で置けている
//   poster … 2%以上を占める色どうしの、いちばん遠い隔たり
//   cover  … 地以外が占める割合
export function posterize(img) {
  const { w, h, ch, data } = img;
  const hist = new Map();
  const N = w * h;
  for (let i = 0, p = 0; i < N; i++, p += ch) {
    const k = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const ent = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const flat = ent.slice(0, 3).reduce((a, b) => a + b[1], 0) / N;
  // 0.6% でも拾う。線だけの景では、図が画面の 1% しか占めないことがある
  // （2% で切っていたら、赤地に黒い雨の画面を「一色」と誤判定した）
  const big = ent.filter((e) => e[1] / N >= 0.006).slice(0, 8)
    .map((e) => [((e[0] >> 8) & 15) / 15, ((e[0] >> 4) & 15) / 15, (e[0] & 15) / 15]);
  let poster = 0;
  for (let i = 0; i < big.length; i++) {
    for (let j = i + 1; j < big.length; j++) {
      const d = Math.sqrt((big[i][0] - big[j][0]) ** 2 + (big[i][1] - big[j][1]) ** 2 + (big[i][2] - big[j][2]) ** 2) / Math.sqrt(3);
      if (d > poster) poster = d;
    }
  }
  return { flat, poster, cover: 1 - ent[0][1] / N };
}

export function analyse(buf) {
  const img = decode(buf);
  const sl = srgbLuma(img);
  const sorted = Array.from(sl).sort((a, b) => a - b);
  const b = bands(sl, img.w, img.h);
  const r = {
    img,
    p5: sorted[Math.floor(sorted.length * 0.05)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    median: sorted[sorted.length >> 1],
    fine: b[0],
    coarse: b[Math.min(6, b.length - 1)],
    bands: b,
    tileVar: tileVar(sl, img.w, img.h),
    chroma: chroma(img),
  };
  Object.assign(r, posterize(img));
  r.lumRange = r.p95 - r.p5;
  r.okContrast = r.poster >= OK.poster && r.tileVar >= OK.tileVar && r.cover >= OK.cover;
  r.okColor = r.chroma >= OK.chroma;
  r.okScale = r.fine >= OK.fine && r.coarse >= OK.coarse;
  return r;
}

export function meanAbsDiff(bufA, bufB) {
  const x = srgbLuma(decode(bufA)), y = srgbLuma(decode(bufB));
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

// 同じ大きさの絵を格子に並べて1枚にする（下見用）
export function grid(imgs, cols = 3, gap = 8) {
  const w = imgs[0].w, h = imgs[0].h;
  const rows = Math.ceil(imgs.length / cols);
  const W = cols * w + gap * (cols - 1), H = rows * h + gap * (rows - 1);
  const out = Buffer.alloc(W * H * 3);
  imgs.forEach((im, i) => {
    const ox = (i % cols) * (w + gap), oy = Math.floor(i / cols) * (h + gap);
    for (let y = 0; y < Math.min(h, im.h); y++) {
      for (let x = 0; x < Math.min(w, im.w); x++) {
        const s = (y * im.w + x) * im.ch, d = ((oy + y) * W + ox + x) * 3;
        out[d] = im.data[s]; out[d + 1] = im.data[s + 1]; out[d + 2] = im.data[s + 2];
      }
    }
  });
  return { w: W, h: H, ch: 3, data: out };
}

export function stack(imgs, gap = 6) { return grid(imgs, 1, gap); }
