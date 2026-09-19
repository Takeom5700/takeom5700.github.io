// 図（motif）— 形の語彙。
//
// **第一版との一番大きな違いがここにある。**
// 第一版は「密度場が閾値を超えた場所」しか描かなかった。形を置くことを
// 自分で禁じていた。結果、何も名指せない画面になり、依頼者から
// 「技術のインスタレーション」と言われた。禁を解いて、名前のある形を置く。
//
// 置いていいもの: 群・獣・菌・波・紋・衆・梯・椅・傘・糸・綿・階・管・器。
// どれも**物語ではない**。筋も台詞も無い。ただ「何かが居る」だけ。
// 心は、名前の付かないものより、名前の付くものに強く反応する。
//
// **眼・面（怖い顔）・裂（稲妻）・火・雨はここから外した。**
// 依頼者の指摘: 「使い古されたホラー要素、オカルトやフリーメイソンの
// 都市伝説系でありがちなモチーフ。ああ怖い系やりたいのね、と思われて
// その時点で冷める。怖くない。意外性がない。短絡的で浅い」——その通りだった。
// 怖がらせに行くと、観る側は**型を読み当てて安心する。**
// いま置いているのは、梯子・椅子・傘・壺・階段・管のような、
// 怖がらせに来ていないのに理由が分からないものへ寄せてある。
//
// 各図は (ctx, S, E) だけを受け取る。E は film.js が組む:
//   E.p    その景の中の位置（0〜1）
//   E.f    その景の中のコマ番号（コマ打ちなので飛び飛び）
//   E.seed 毎コマ変わる番号（線を沸かせる）
//   E.fix  その景のあいだ変わらない番号（配置を決める）
//   E.ink  塗る道具（paint.js）
//   E.col  色
//   E.sh   譜の数値

import { nz, nz01, snz, TAU, clamp, mix, wob, brush, path, blob } from './paint.js';

// 段で動かすための道具。なめらかに動かすと CG になる。
const step = (v, n) => Math.round(v * n) / n;
// 0〜1 を「ためて一気に」変える（グラデーション禁止の担保）
function snap(p, at, w) { return clamp((p - at) / w, 0, 1) > 0.5 ? 1 : 0; }

// ---- 群 ---------------------------------------------------------------
// 数の暴力。1つでは何でもないものが、300 あると意味を持つ。
function swarm(ctx, S, E) {
  const { col, sh } = E;
  const n = sh.n;
  const tq = E.f / E.fps;
  const cx = S.w * (0.5 + sh.ox * 0.25), cy = S.h * (0.5 + sh.oy * 0.25);
  // 収束（p→1 で一点へ）か発散（逆）か
  const g = sh.k1 > 0.5 ? 1 - E.p : E.p;
  const spread = mix(1.05, 0.12, g * g);
  ctx.fillStyle = col.i;
  for (let i = 0; i < n; i++) {
    const a = nz01(E.fix + i * 3) * TAU + tq * (0.25 + nz01(E.fix + i * 11) * 0.9) * (sh.k2 * 2 - 1);
    const rr = (0.12 + nz01(E.fix + i * 7) * 0.9) * S.h * 0.52 * spread;
    const dx = snz(tq * 1.7 + i * 0.6, E.fix) * S.h * 0.06;
    const dy = snz(tq * 1.9 + i * 0.6 + 40, E.fix) * S.h * 0.06;
    const x = cx + Math.cos(a) * rr * 1.5 + dx, y = cy + Math.sin(a) * rr + dy;
    if (x < -60 || x > S.w + 60 || y < -60 || y > S.h + 60) continue;
    const s = S.h * (0.008 + nz01(E.fix + i * 13) * 0.024) * (n > 200 ? 0.8 : 1.4);
    // 羽ばたき（コマ打ちなので段になる）
    const w = 0.35 + 0.65 * Math.abs(Math.sin((tq * 6 + nz01(E.fix + i * 5) * 6) * Math.PI));
    const va = a + Math.PI / 2;
    const ca = Math.cos(va), sa = Math.sin(va);
    ctx.beginPath();
    ctx.moveTo(x + ca * s * 2.1, y + sa * s * 2.1);
    ctx.lineTo(x - ca * s + sa * s * 2.4 * w, y - sa * s - ca * s * 2.4 * w);
    ctx.lineTo(x - ca * s * 0.3, y - sa * s * 0.3);
    ctx.lineTo(x - ca * s - sa * s * 2.4 * w, y - sa * s + ca * s * 2.4 * w);
    ctx.closePath(); ctx.fill();
  }
  // 群れの中に1つだけ大きいものを置く（法「異」）
  if (sh.odd) {
    const x = S.w * (0.2 + nz01(E.fix + 7) * 0.6), y = S.h * (0.2 + nz01(E.fix + 13) * 0.6);
    const s = S.h * 0.09;
    ctx.fillStyle = col.a;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.6);
    ctx.lineTo(x + s * 2.2, y + s * 0.9); ctx.lineTo(x, y + s * 0.2); ctx.lineTo(x - s * 2.2, y + s * 0.9);
    ctx.closePath(); ctx.fill();
  }
}

// ---- 獣 ---------------------------------------------------------------
// 走る四つ足。輪郭だけ。何の獣かは決めない。
// **足が同じ地面に着くこと**が要。着かないと塊が浮いているだけに見える。
function beastOne(ctx, x, gy, s, ph, seed, E, color) {
  ctx.fillStyle = color;
  const by = gy - s * 2.3;                      // 胴の中心
  // 四肢を先に（胴の下に隠れる付け根をきれいにする）
  for (let i = 0; i < 4; i++) {
    const back = i < 2;
    const bx = x + (back ? -s * 1.0 : s * 0.95);
    const pp = ph + [0, 0.45, 0.22, 0.7][i];
    const sw = Math.sin(pp * TAU), lift = Math.max(0, Math.cos(pp * TAU));
    const kx = bx + sw * s * 0.5, ky = by + s * 1.1;
    const fx = kx + sw * s * 0.75, fy = gy - lift * s * 0.75;
    brush(ctx, [[bx, by + s * 0.3], [kx, ky], [fx, fy]], s * 0.34, seed + i * 13, false);
    ctx.beginPath(); ctx.arc(fx, fy, s * 0.17, 0, TAU); ctx.fill();
  }
  // 尾
  const tp = [];
  for (let j = 0; j <= 5; j++) {
    const u = j / 5;
    tp.push([x - s * 1.5 - u * s * 1.5, by - s * 0.25 - Math.sin(ph * TAU + u * 2.4) * s * 0.7 * u]);
  }
  brush(ctx, tp, s * 0.3, seed + 21, true);
  // 胴
  ctx.beginPath();
  path(ctx, blob(x, by, [s * 1.65, s * 1.5, s * 0.85, s * 0.8, s * 1.55, s * 1.6, s * 0.9, s * 0.82], seed, 0.07));
  ctx.fill();
  // 首と頭（前へ突き出す）
  const hx = x + s * 2.25, hy = by - s * 0.85 + Math.sin(ph * TAU) * s * 0.12;
  brush(ctx, [[x + s * 0.8, by - s * 0.3], [hx - s * 0.35, hy + s * 0.25]], s * 0.8, seed + 3, false);
  ctx.beginPath();
  path(ctx, blob(hx, hy, [s * 0.72, s * 0.5, s * 0.42, s * 0.5, s * 0.62, s * 0.66], seed + 5, 0.08));
  ctx.fill();
  // 鼻づら
  brush(ctx, [[hx + s * 0.2, hy + s * 0.1], [hx + s * 1.0, hy + s * 0.3]], s * 0.42, seed + 9, false);
  // 耳
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.2, hy - s * 0.45); ctx.lineTo(hx - s * 0.02, hy - s * 1.25);
  ctx.lineTo(hx + s * 0.3, hy - s * 0.42); ctx.closePath(); ctx.fill();
}

function beast(ctx, S, E) {
  const { col, sh } = E;
  const n = Math.min(sh.n, 6);
  const tq = E.f / E.fps;
  const gy = S.h * (0.74 + sh.oy * 0.14);
  const run = sh.k2 > 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const s = S.h * (0.055 + sh.k1 * 0.11) * (n === 1 ? 1.5 : 0.6 + nz01(E.fix + i * 7) * 0.8);
    const u = n === 1 ? 0.5 : (i + 0.5) / n;
    const x = ((u + tq * 0.055 * run + nz01(E.fix + i * 3) * 0.06) % 1.35 - 0.16) * S.w;
    beastOne(ctx, x, gy - nz01(E.fix + i * 11) * S.h * 0.06, s,
      tq * (2.2 + sh.k3 * 3) + nz01(E.fix + i), E.seed + i * 131, E,
      (sh.odd && i === n - 1) ? col.a : col.i);
  }
  // 地面（足が着いていることを見せる）
  if (sh.odd) {
    ctx.fillStyle = col.i;
    const pts = [];
    for (let j = 0; j <= 20; j++) pts.push([j / 20 * S.w, gy + snz(j * 0.6, E.fix) * S.h * 0.008]);
    brush(ctx, pts, S.h * 0.008, E.seed + 3, false);
  }
}

// ---- 菌 ---------------------------------------------------------------
// 珊瑚・菌糸・根。枝分かれするが、先は丸い。木には見せない
// （木にすると「自然の風景」になって、読んだ時点で消費される）。
function coral(ctx, S, E) {
  const { col, sh } = E;
  const grow = Math.pow(E.p, 0.4);
  const up = sh.k1 > 0.5 ? -1 : 1;
  const baseY = up < 0 ? S.h * 1.04 : -S.h * 0.04;
  const roots = 2 + Math.floor(sh.k2 * 4);
  ctx.fillStyle = col.i;
  const maxD = 7;
  const stack = [];
  for (let r = 0; r < roots; r++) {
    const x0 = S.w * ((r + 0.5) / roots + nz(E.fix + r * 17) * 0.22 + sh.ox * 0.1);
    stack.push([x0, baseY, up < 0 ? -Math.PI / 2 : Math.PI / 2,
      S.h * (0.13 + sh.k3 * 0.13) * (0.7 + nz01(E.fix + r * 29) * 0.7),
      S.h * (0.028 + sh.k1 * 0.022) * (0.75 + nz01(E.fix + r * 5) * 0.6), 0, r]);
  }
  let guard = 0;
  while (stack.length && guard++ < 2600) {
    const [x, y, a, len, w, d, r] = stack.pop();
    const birth = d / maxD;
    if (birth > grow) continue;
    const part = clamp((grow - birth) * maxD * 1.7, 0, 1);
    const pts = [];
    for (let j = 0; j <= 5; j++) {
      const u = (j / 5) * part;
      // 曲げる。まっすぐ伸ばすと枝になってしまう
      const bend = Math.sin(u * 2.2 + d) * 0.3;
      pts.push([x + Math.cos(a + bend) * len * u + snz(u * 2 + d, E.seed + d * 7) * w,
                y + Math.sin(a + bend) * len * u + snz(u * 2 + d + 9, E.seed + d * 7) * w]);
    }
    if (pts.length > 1) brush(ctx, pts, w, E.seed + d * 31 + r * 7, false);
    const ex = pts[pts.length - 1][0], ey = pts[pts.length - 1][1];
    // 先端の玉（これがあると木ではなく生きものに見える）
    ctx.beginPath(); ctx.arc(ex, ey, w * 0.62, 0, TAU); ctx.fill();
    if (d >= maxD || part < 0.99) continue;
    const kids = 2 + (nz01(E.fix + d * 17 + r * 31) > 0.7 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const na = a + (k - (kids - 1) / 2) * (0.5 + sh.k3 * 0.6) + nz(E.fix + d * 13 + k * 7 + r) * 0.28;
      stack.push([ex, ey, na, len * (0.72 + nz01(E.fix + d + k + r) * 0.14), w * 0.7, d + 1, r]);
    }
  }
  // 先端が色づく
  if (sh.odd) {
    ctx.fillStyle = col.a;
    for (let i = 0; i < 70; i++) {
      const r = Math.floor(nz01(E.fix + i * 29) * roots);
      const x0 = S.w * ((r + 0.5) / roots + nz(E.fix + r * 17) * 0.22 + sh.ox * 0.1);
      const a2 = -Math.PI / 2 + nz(E.fix + i * 7) * 1.5;
      const rr = S.h * (0.2 + nz01(E.fix + i * 11) * 0.45) * grow;
      ctx.beginPath();
      ctx.arc(x0 + Math.cos(a2) * rr, baseY + Math.sin(a2) * rr * -up * -1, S.h * 0.013, 0, TAU);
      ctx.fill();
    }
  }
}

// ---- 紋 ---------------------------------------------------------------
// 水面の輪。いくつかの中心から広がり、重なったところで干渉する。
// **長い景でも止まらない**（外へ広がり続ける）。
function ripple(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const k = Math.max(2, Math.min(sh.n, 6));
  const maxR = S.h * (0.55 + sh.k1 * 0.75);
  const gap = maxR / (5 + Math.floor(sh.k2 * 5));
  for (let c = 0; c < k; c++) {
    const cx = S.w * (0.16 + nz01(E.fix + c * 31) * 0.68 + sh.ox * 0.08);
    const cy = S.h * (0.16 + nz01(E.fix + c * 17) * 0.68 + sh.oy * 0.08);
    const sp = gap * (0.24 + nz01(E.fix + c * 7) * 0.3);   // 1秒に進む距離
    const ph = nz01(E.fix + c * 13);
    for (let i = 0; i < 14; i++) {
      const r = ((tq * sp + (i + ph) * gap) % maxR);
      if (r < gap * 0.12) continue;
      const fade = 1 - r / maxR;
      const N = 40, pts = [];
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * TAU;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (0.88 + sh.k3 * 0.24)]);
      }
      ctx.fillStyle = (c % 2 && sh.odd) ? col.a : col.i;
      brush(ctx, wob(pts, r * 0.02, E.seed + c * 101 + i), E.lw * (0.4 + fade * 2.4), E.seed + i * 29, false);
    }
    // 落ちた点
    ctx.fillStyle = col.l;
    ctx.beginPath(); ctx.arc(cx, cy, S.h * 0.012, 0, TAU); ctx.fill();
  }
}

// ---- 梯 ---------------------------------------------------------------
// 梯子。どこへも通じていない。見た人が理由を探す形。
function ladder(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(1, Math.min(sh.n, 10));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const dep = nz01(E.fix + i * 23);                       // 奥行き
    const sc = 0.45 + dep * (0.9 + sh.k1 * 0.9);
    const x = S.w * (u + nz(E.fix + i * 7) * 0.12 + sh.ox * 0.06);
    const yb = S.h * (0.72 + dep * 0.32 + sh.oy * 0.1);
    const len = S.h * (0.7 + nz01(E.fix + i * 11) * 0.7) * sc;
    const w = S.h * 0.085 * sc;
    const tilt = nz(E.fix + i * 5) * (0.1 + sh.k2 * 0.4) + Math.sin(tq * 0.7 + i) * 0.012;
    const ca = Math.sin(tilt), sa = -Math.cos(tilt);
    const lw = S.h * 0.013 * sc;
    ctx.fillStyle = (sh.odd && i === n - 1) ? col.a : col.i;
    // 二本の親柱
    for (const s of [-1, 1]) {
      const bx = x + s * w * 0.5, by = yb;
      brush(ctx, [[bx, by], [bx + ca * len, by + sa * len]], lw, E.seed + i * 13 + s, false);
    }
    // 踏み桟
    const rungs = Math.max(3, Math.round(len / (S.h * 0.085 * sc)));
    for (let r = 1; r < rungs; r++) {
      const t2 = r / rungs;
      const px = x + ca * len * t2, py = yb + sa * len * t2;
      brush(ctx, [[px - w * 0.5, py], [px + w * 0.5, py]], lw * 0.85, E.seed + i * 31 + r, false);
    }
  }
}

// ---- 椅 ---------------------------------------------------------------
// 椅子。人が居ないことを、いちばん強く言う形。
function chairOne(ctx, x, y, s, rot, seed, lw) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  const sw = s * 1.2, bh = s * 1.35;
  // 座面は面で置く（線だけだと骨組みに見えて椅子として読めない）
  ctx.beginPath();
  ctx.moveTo(-sw * 0.56, 0); ctx.lineTo(sw * 0.56, 0);
  ctx.lineTo(sw * 0.5, s * 0.17); ctx.lineTo(-sw * 0.5, s * 0.17);
  ctx.closePath(); ctx.fill();
  // 背もたれ：枠＋縦桟
  brush(ctx, [[-sw * 0.5, 0], [-sw * 0.44, -bh]], lw * 2.0, seed + 1, false);
  brush(ctx, [[sw * 0.5, 0], [sw * 0.44, -bh]], lw * 2.0, seed + 2, false);
  brush(ctx, [[-sw * 0.44, -bh], [sw * 0.44, -bh]], lw * 2.4, seed + 3, false);
  for (let i = 1; i <= 2; i++) {
    const xx = -sw * 0.44 + (sw * 0.88) * (i / 3);
    brush(ctx, [[xx, -bh * 0.08], [xx, -bh * 0.96]], lw * 1.5, seed + 10 + i, false);
  }
  // 脚
  for (const s2 of [-1, 1]) {
    brush(ctx, [[s2 * sw * 0.5, s * 0.1], [s2 * sw * 0.54, s * 1.05]], lw * 2.0, seed + 20 + s2, false);
    brush(ctx, [[s2 * sw * 0.24, s * 0.14], [s2 * sw * 0.2, s * 1.0]], lw * 1.7, seed + 30 + s2, false);
  }
  // 貫
  brush(ctx, [[-sw * 0.52, s * 0.62], [sw * 0.52, s * 0.62]], lw * 1.3, seed + 40, false);
  ctx.restore();
}

function chair(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(1, Math.min(sh.n, 16));
  const big = n === 1;
  for (let i = 0; i < n; i++) {
    const dep = big ? 1 : nz01(E.fix + i * 19);
    const s = S.h * (big ? 0.3 + sh.k1 * 0.16 : 0.05 + dep * dep * (0.14 + sh.k1 * 0.16));
    const x = big ? S.w * (0.5 + sh.ox * 0.2)
      : S.w * (0.06 + nz01(E.fix + i * 7) * 0.88);
    const y = big ? S.h * (0.72 + sh.oy * 0.1)
      : S.h * (0.42 + dep * 0.52) + Math.sin(tq * 0.9 + i) * S.h * 0.004;
    // 1脚だけ倒れている
    const tipped = sh.odd && i === Math.floor(nz01(E.fix + 3) * n);
    const rot = tipped ? Math.PI * 0.42 : nz(E.fix + i * 11) * (0.04 + sh.k2 * 0.3);
    ctx.fillStyle = tipped ? col.a : col.i;
    chairOne(ctx, x, y, s, rot, E.seed + i * 131, Math.max(S.h * 0.004, s * 0.055));
  }
}

// ---- 傘 ---------------------------------------------------------------
// 傘。開いた扇と、骨の放射。落ちているのか浮いているのか決めない。
// **縁をぼかすと、きのこにしか見えなくなる**（一度そうなった）。
// 骨の先を角として立て、柄をまっすぐ長く出すと傘として読める。
function umbrella(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(1, Math.min(sh.n, 14));
  for (let i = 0; i < n; i++) {
    const dep = n === 1 ? 1 : nz01(E.fix + i * 23);
    const R = S.h * (n === 1 ? 0.3 + sh.k1 * 0.12 : 0.07 + dep * (0.1 + sh.k1 * 0.14));
    const ph = tq * (0.22 + sh.k2 * 0.5) + nz01(E.fix + i * 7) * 6;
    const open = 0.45 + 0.55 * Math.abs(Math.sin(ph));      // 開閉
    const drift = ((tq * (0.04 + nz01(E.fix + i * 5) * 0.09) + nz01(E.fix + i * 3)) % 1.25) - 0.12;
    const x = S.w * (n === 1 ? 0.5 + sh.ox * 0.2 : nz01(E.fix + i * 11) * 1.06 - 0.03);
    const y = S.h * (n === 1 ? 0.44 + sh.oy * 0.12 : (sh.k3 > 0.5 ? drift : 1.12 - drift));
    const rot = nz(E.fix + i * 13) * 0.7 + Math.sin(tq * 0.8 + i) * 0.09;
    const ribs = 7;
    const c2 = (sh.odd && i === 0) ? col.a : col.i;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    // 天蓋。骨の先が角になるように、直線で折れた扇にする
    const rx = R * open, ry = R * 0.62;
    const tips = [];
    for (let j = 0; j <= ribs; j++) {
      const a2 = Math.PI + (j / ribs) * Math.PI;
      tips.push([Math.cos(a2) * rx, Math.sin(a2) * ry]);
    }
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(tips[0][0], tips[0][1]);
    for (let j = 1; j <= ribs; j++) {
      // 骨と骨のあいだは布がたわむ
      const m = [(tips[j - 1][0] + tips[j][0]) / 2, (tips[j - 1][1] + tips[j][1]) / 2];
      ctx.quadraticCurveTo(m[0] * 1.06, m[1] * 1.16, tips[j][0], tips[j][1]);
    }
    ctx.lineTo(rx, 0); ctx.lineTo(-rx, 0);
    ctx.closePath(); ctx.fill();
    // 骨
    ctx.fillStyle = col.g;
    for (let j = 1; j < ribs; j++) {
      brush(ctx, [[0, -ry * 0.05], [tips[j][0] * 0.97, tips[j][1] * 0.97]], R * 0.022, E.seed + i * 7 + j, false);
    }
    // 柄（まっすぐ長く）と曲がり手
    ctx.fillStyle = c2;
    brush(ctx, [[0, -ry * 0.9], [0, R * 1.15]], R * 0.045, E.seed + i, false);
    const hook = [];
    for (let j = 0; j <= 6; j++) {
      const a2 = (j / 6) * Math.PI;
      hook.push([-Math.sin(a2) * R * 0.17, R * 1.15 + (1 - Math.cos(a2)) * R * 0.17]);
    }
    brush(ctx, hook, R * 0.045, E.seed + i + 5, false);
    // 石突き
    ctx.beginPath(); ctx.arc(0, -ry * 0.95, R * 0.045, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---- 糸 ---------------------------------------------------------------
// 織り。縦糸と横糸。途中でほどける。
function thread(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(8, Math.min(sh.n, 60));
  const x0 = S.w * 0.08, x1 = S.w * 0.92;
  const y0 = -S.h * 0.05, y1 = S.h * 1.05;
  const lw = S.h * (0.004 + sh.k1 * 0.008);
  // ほどけ始める高さ
  const un = mix(1.15, 0.28, clamp(E.p * 1.25, 0, 1)) - sh.k2 * 0.15;
  ctx.fillStyle = col.i;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const x = mix(x0, x1, u);
    const pts = [];
    for (let j = 0; j <= 16; j++) {
      const v = j / 16;
      const y = mix(y0, y1, v);
      if (v < un) {
        pts.push([x + Math.sin(v * 40 + i) * lw * 1.2, y]);
      } else {
        // ほどけた先は垂れて絡む
        const t2 = (v - un) / Math.max(0.02, 1 - un);
        pts.push([x + snz(t2 * 2.4 + i * 0.7 + tq * 0.35, E.fix + i) * S.w * 0.1 * t2,
                  y + t2 * t2 * S.h * 0.06]);
      }
    }
    brush(ctx, pts, lw, E.seed + i * 13, false);
  }
  // 横糸（織れている範囲だけ）
  const rows = Math.round(un * 26);
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / 26;
    const y = mix(y0, y1, v);
    const pts = [];
    for (let j = 0; j <= 20; j++) {
      const u = j / 20;
      pts.push([mix(x0, x1, u), y + Math.sin(u * n * Math.PI) * lw * 1.1]);
    }
    ctx.fillStyle = (sh.odd && r % 7 === 3) ? col.a : col.i;
    brush(ctx, pts, lw * 1.1, E.seed + r * 31, false);
  }
}

// ---- 綿 ---------------------------------------------------------------
// 冠毛。飛んでいく種。中心の粒から細い糸が放射する。
// **横位置を進み具合と結びつけないこと。** 結びつけると、進んだ種が
// 全部枠の外へ出て、画面がほぼ空になる（実測で図の量 1% になった）。
function seedDrift(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  // **少なく、大きく。** 小さく沢山置くと綿ではなく紙吹雪になる（実際になった）
  const n = Math.max(3, Math.min(sh.n, 18));
  const wind = (sh.k2 * 2 - 1);
  for (let i = 0; i < n; i++) {
    const sp = 0.035 + nz01(E.fix + i * 7) * 0.1;
    const prog = (nz01(E.fix + i * 3) + tq * sp) % 1.2;
    let u = nz01(E.fix + i * 11) + wind * prog * 0.3;
    u = ((u % 1.1) + 1.1) % 1.1 - 0.05;                 // 横は巻き戻す
    const x = S.w * u + snz(tq * 0.5 + i, E.fix) * S.w * 0.04;
    const y = S.h * (1.08 - prog * 1.2) + snz(tq * 0.6 + i + 7, E.fix) * S.h * 0.04;
    const r = S.h * (0.1 + nz01(E.fix + i * 13) * 0.13) * (0.7 + sh.k1 * 0.6);
    const rot = tq * (0.25 + nz01(E.fix + i * 5) * 0.5) + i;
    ctx.fillStyle = (sh.odd && i % 13 === 0) ? col.a : col.i;
    const arms = 11;
    for (let a2 = 0; a2 < arms; a2++) {
      const th = rot + (a2 / arms) * TAU;
      brush(ctx, [[x, y], [x + Math.cos(th) * r, y + Math.sin(th) * r]], r * 0.2, E.seed + i * 7 + a2, true);
      ctx.beginPath(); ctx.arc(x + Math.cos(th) * r, y + Math.sin(th) * r, r * 0.14, 0, TAU); ctx.fill();
    }
    brush(ctx, [[x, y], [x, y + r * 1.05]], r * 0.22, E.seed + i, true);
    ctx.beginPath(); ctx.arc(x, y + r * 1.05, r * 0.16, 0, TAU); ctx.fill();
  }
}

// ---- 階 ---------------------------------------------------------------
// 階段。上がっているのか下りているのか決めない。
// **面（シルエット）で置くこと。** 段板を線で積むと図面にしか見えない。
function stairs(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const flights = Math.max(1, Math.min(sh.n, 4));
  for (let f = 0; f < flights; f++) {
    const dir = (nz01(E.fix + f * 41) > 0.5) ? 1 : -1;
    const steps = 6 + Math.floor(sh.k1 * 10);
    const w = S.w * (0.3 + nz01(E.fix + f * 17) * 0.4);
    const hgt = S.h * (0.3 + nz01(E.fix + f * 7) * 0.45);
    const bx = S.w * (0.08 + nz01(E.fix + f * 11) * 0.7 + sh.ox * 0.06);
    const by = S.h * (0.42 + nz01(E.fix + f * 23) * 0.5 + sh.oy * 0.08);
    const sw = w / steps, sh2 = hgt / steps;
    const grow = clamp(E.p * 1.5 + 0.25, 0, 1);
    const k = Math.max(2, Math.round(steps * grow));
    ctx.fillStyle = (sh.odd && f === flights - 1) ? col.a : col.i;
    // 段を1本の折れ線として作り、下端まで落として閉じる
    const pts = [[bx, by]];
    for (let i = 0; i < k; i++) {
      const y = by - i * sh2 + Math.sin(tq * 0.7 + f + i * 0.3) * S.h * 0.0015;
      pts.push([bx + dir * i * sw, y]);
      pts.push([bx + dir * (i + 1) * sw, y]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1] + sh2 * 2.2);
    ctx.lineTo(bx, by + sh2 * 2.2);
    ctx.closePath(); ctx.fill();
    // 踏み面の鼻（段を読ませる）
    ctx.fillStyle = col.g;
    for (let i = 1; i < k; i++) {
      const y = by - i * sh2;
      brush(ctx, [[bx + dir * (i - 0.05) * sw, y], [bx + dir * (i + 1) * sw, y]], S.h * 0.004, E.seed + f * 13 + i, false);
    }
  }
}

// ---- 管 ---------------------------------------------------------------
// 管。直角に折れて、継手で繋がる。中身は見えない。
function pipe(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(2, Math.min(sh.n, 10));
  for (let i = 0; i < n; i++) {
    const w = S.h * (0.018 + nz01(E.fix + i * 19) * 0.05) * (0.6 + sh.k1);
    let x = nz01(E.fix + i * 7) < 0.5 ? -S.w * 0.05 : S.w * nz01(E.fix + i * 3);
    let y = S.h * nz01(E.fix + i * 11);
    let dir = Math.floor(nz01(E.fix + i * 5) * 4);     // 0右 1下 2左 3上
    const pts = [[x, y]];
    const segs = 4 + Math.floor(nz01(E.fix + i * 13) * 5);
    for (let s = 0; s < segs; s++) {
      const len = S.h * (0.12 + nz01(E.fix + i * 29 + s * 7) * 0.5);
      if (dir === 0) x += len; else if (dir === 1) y += len;
      else if (dir === 2) x -= len; else y -= len;
      pts.push([x, y]);
      dir = (dir + (nz01(E.fix + i * 31 + s) > 0.5 ? 1 : 3)) % 4;
    }
    ctx.fillStyle = (sh.odd && i === n - 1) ? col.a : col.i;
    // 本体
    for (let s = 0; s < pts.length - 1; s++) {
      brush(ctx, [pts[s], pts[s + 1]], w, E.seed + i * 17 + s, false);
    }
    // 継手（角に輪）
    for (let s = 1; s < pts.length - 1; s++) {
      ctx.beginPath(); ctx.arc(pts[s][0], pts[s][1], w * 0.78, 0, TAU); ctx.fill();
    }
    // 中を通っていくもの
    ctx.fillStyle = col.l;
    for (let k = 0; k < 3; k++) {
      const u = ((tq * (0.1 + sh.k2 * 0.25) + k / 3 + nz01(E.fix + i)) % 1) * (pts.length - 1);
      const s = Math.min(pts.length - 2, Math.floor(u)), t2 = u - s;
      ctx.beginPath();
      ctx.arc(mix(pts[s][0], pts[s + 1][0], t2), mix(pts[s][1], pts[s + 1][1], t2), w * 0.3, 0, TAU);
      ctx.fill();
    }
  }
}

// ---- 器 ---------------------------------------------------------------
// 壺。並べただけ。何も入っていないし、何にも使われない。
function vessel(ctx, S, E) {
  const { ink, col, sh } = E;
  const tq = E.f / E.fps;
  const n = Math.max(1, Math.min(sh.n, 12));
  const gy = S.h * (0.76 + sh.oy * 0.14);
  // 棚の線
  ctx.fillStyle = col.i;
  {
    const pts = [];
    for (let j = 0; j <= 20; j++) pts.push([j / 20 * S.w, gy + snz(j * 0.5, E.fix) * S.h * 0.004]);
    brush(ctx, pts, S.h * 0.007, E.seed + 3, false);
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const H = S.h * (n === 1 ? 0.42 + sh.k1 * 0.2 : 0.1 + nz01(E.fix + i * 7) * (0.18 + sh.k1 * 0.22));
    const x = S.w * (n === 1 ? 0.5 + sh.ox * 0.2 : u + nz(E.fix + i * 11) * 0.03);
    const wob2 = Math.sin(tq * 0.9 + i) * S.h * 0.003;
    // 輪郭は高さの関数。口・肩・胴・高台
    const neck = 0.16 + nz01(E.fix + i * 13) * 0.3;
    const belly = 0.3 + nz01(E.fix + i * 17) * 0.36;
    const pts = [];
    const M = 22;
    for (let j = 0; j <= M; j++) {
      const v = j / M;
      const r = H * (0.1 + neck * Math.exp(-Math.pow((v - 0.03) * 5, 2))
        + belly * Math.sin(Math.pow(v, 0.8) * Math.PI) * (0.5 + v * 0.7));
      pts.push([x - r, gy + wob2 - H * (1 - v)]);
    }
    for (let j = M; j >= 0; j--) {
      const v = j / M;
      const r = H * (0.1 + neck * Math.exp(-Math.pow((v - 0.03) * 5, 2))
        + belly * Math.sin(Math.pow(v, 0.8) * Math.PI) * (0.5 + v * 0.7));
      pts.push([x + r, gy + wob2 - H * (1 - v)]);
    }
    const c2 = (sh.odd && i === Math.floor(nz01(E.fix + 5) * n)) ? col.a : col.i;
    ink.body(() => path(ctx, wob(pts, H * 0.008, E.seed + i * 31)), c2);
  }
}

// ---- 波 ---------------------------------------------------------------
function waveLayer(ctx, S, E, y0, sc, color, phase, seed) {
  const { sh } = E;
  ctx.fillStyle = color;
  const pts = [];
  const N = 44;
  for (let j = 0; j <= N; j++) {
    const u = j / N;
    const x = u * S.w * 1.2 - S.w * 0.1;
    // 頂点でせり上がる
    const crest = Math.exp(-Math.pow((u - (0.35 + sh.ox * 0.25)) * 3.1, 2));
    const y = y0 - crest * S.h * 0.42 * sc
      + Math.sin(u * 9 + phase) * S.h * 0.03 * sc
      + snz(u * 6 + phase, seed) * S.h * 0.014;
    pts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(S.w * 1.1, S.h * 1.1); ctx.lineTo(-S.w * 0.1, S.h * 1.1);
  ctx.closePath(); ctx.fill();
  return pts;
}

function wave(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const ph = tq * (1.1 + sh.k1 * 2.6);
  waveLayer(ctx, S, E, S.h * 1.02, 1.25, col.a, ph * 0.7, E.seed + 1);
  const crest = waveLayer(ctx, S, E, S.h * 1.06, 0.95, col.i, ph, E.seed + 2);
  waveLayer(ctx, S, E, S.h * 1.16, 0.6, col.g, ph * 1.4 + 2, E.seed + 3);
  // 頂から前へ垂れる爪（これが無いと、ただの丘に見える）
  ctx.fillStyle = col.l;
  {
    let top = crest[0];
    for (const c of crest) if (c[1] < top[1]) top = c;
    for (let i = 0; i < 7; i++) {
      const bx = top[0] + (i - 3) * S.h * 0.075 + snz(ph + i, E.fix) * S.h * 0.02;
      const hgt = S.h * (0.08 + nz01(E.fix + i * 7) * 0.16);
      const pts2 = [];
      for (let j = 0; j <= 5; j++) {
        const u = j / 5;
        pts2.push([bx + u * S.h * (0.1 + nz01(E.fix + i) * 0.1) + Math.sin(u * 2.2) * S.h * 0.03,
                   top[1] + S.h * 0.02 - hgt * Math.sin(u * 1.9)]);
      }
      brush(ctx, pts2, S.h * 0.028, E.seed + i * 29, true);
    }
  }
  // 飛沫
  ctx.fillStyle = col.l;
  for (let i = 0; i < 140; i++) {
    const j = Math.min(crest.length - 1, Math.floor(nz01(E.fix + i * 3) * crest.length));
    const c = crest[j];
    const r = S.h * (0.004 + nz01(E.seed + i * 7) * 0.012);
    const dx = snz(tq * 3 + i, E.fix) * S.h * 0.09;
    const dy = -Math.abs(snz(tq * 3 + i + 5, E.fix)) * S.h * 0.14;
    ctx.beginPath(); ctx.arc(c[0] + dx, c[1] + dy, r, 0, TAU); ctx.fill();
  }
}

// ---- 衆 ---------------------------------------------------------------
// 立ち並ぶ小さな人型。一人だけ違う。尺度の対比を作るための図。
function crowd(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const rows = 4 + Math.floor(sh.k1 * 5);
  const horizon = S.h * (0.28 + sh.oy * 0.16);
  const oddRow = Math.floor(nz01(E.fix + 3) * rows), oddCol = Math.floor(nz01(E.fix + 7) * 9);
  for (let r = 0; r < rows; r++) {
    const u = (r + 1) / rows;
    const y = horizon + Math.pow(u, 1.7) * (S.h - horizon) * 1.02;
    const s = S.h * 0.02 + Math.pow(u, 1.9) * S.h * (0.1 + sh.k2 * 0.2);
    const cnt = Math.max(2, Math.round(S.w / (s * 2.6)));
    for (let c = 0; c < cnt; c++) {
      const x = (c + 0.5) * (S.w / cnt) + snz(tq * 0.8 + r * 3 + c, E.fix) * s * 0.4;
      const odd = sh.odd && r === oddRow && c === oddCol % cnt;
      ctx.fillStyle = odd ? col.a : col.i;
      const bob = Math.sin(tq * 3 + r + c) * s * 0.06;
      // 頭
      ctx.beginPath(); ctx.arc(x, y - s * 1.5 + bob, s * 0.34, 0, TAU); ctx.fill();
      // 胴
      ctx.beginPath();
      ctx.moveTo(x - s * 0.38, y + bob); ctx.lineTo(x - s * 0.24, y - s * 1.12 + bob);
      ctx.lineTo(x + s * 0.24, y - s * 1.12 + bob); ctx.lineTo(x + s * 0.38, y + bob);
      ctx.closePath(); ctx.fill();
      // 一人だけ手を上げている
      if (odd) {
        brush(ctx, [[x - s * 0.2, y - s * 1.0 + bob], [x - s * 0.8, y - s * 2.1 + bob]], s * 0.16, E.seed + c, false);
        brush(ctx, [[x + s * 0.2, y - s * 1.0 + bob], [x + s * 0.8, y - s * 2.1 + bob]], s * 0.16, E.seed + c + 1, false);
      }
    }
  }
}

// 名前の並びは譜（score.js）と検査（check-axis）が共有する。
// **この順番を変えると、過去の種の作品が変わる。** 足すのは末尾だけ。

// 名前の並びは譜（score.js）と検査（check-axis）が共有する。
// **この順番を変えると、過去の種の作品が変わる。** 足すのは末尾だけ。
export const NAMES = ['群', '獣', '菌', '波', '紋', '衆', '梯', '椅', '傘', '糸', '綿', '階', '管', '器'];
export const MOTIFS = [swarm, beast, coral, wave, ripple, crowd, ladder, chair, umbrella, thread, seedDrift, stairs, pipe, vessel];
