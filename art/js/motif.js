// 図（motif）— 形の語彙。
//
// **第一版との一番大きな違いがここにある。**
// 第一版は「密度場が閾値を超えた場所」しか描かなかった。形を置くことを
// 自分で禁じていた。結果、何も名指せない画面になり、依頼者から
// 「技術のインスタレーション」と言われた。禁を解いて、名前のある形を置く。
//
// 置いていいもの: 眼・手・獣・面・群・樹・波・火・雨・輪・裂・衆。
// どれも**物語ではない**。筋も台詞も無い。ただ「何かが居る」だけ。
// 心は、名前の付かないものより、名前の付くものに強く反応する。
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

// ---- 眼 ---------------------------------------------------------------
// 最初の景はたいていこれ。人は眼に最も速く反応する。
function eyeShape(cx, cy, rx, ry, open, seed) {
  const M = 14, pts = [];
  for (let j = 0; j <= M; j++) {
    const u = j / M;
    pts.push([cx - rx + 2 * rx * u, cy - ry * open * Math.sin(Math.PI * u)]);
  }
  for (let j = M; j >= 0; j--) {
    const u = j / M;
    pts.push([cx - rx + 2 * rx * u, cy + ry * open * 0.82 * Math.sin(Math.PI * u)]);
  }
  return wob(pts, rx * 0.022, seed);
}

function eye(ctx, S, E) {
  const { ink, col, sh } = E;
  const n = sh.n;
  const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cw = S.w / cols, ch = S.h / rows;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const cx = n === 1 ? S.w * (0.5 + sh.ox * 0.16) : cw * (c + 0.5) + nz(E.fix + i * 17) * cw * 0.1;
    const cy = n === 1 ? S.h * (0.5 + sh.oy * 0.14) : ch * (r + 0.5) + nz(E.fix + i * 31) * ch * 0.1;
    const rx = (n === 1 ? S.w * 0.36 : cw * 0.42) * (0.82 + nz01(E.fix + i * 7) * 0.36);
    const ry = rx * 0.54;

    // 瞬き。時間の上でばらけさせる。開閉は段で（途中の形を出さない）
    const bt = nz01(E.fix + i * 53) * 7 + E.p * (4 + sh.k1 * 9);
    const cyc = bt - Math.floor(bt);
    const open = cyc < 0.055 ? 0.08 : cyc < 0.085 ? 0.55 : 1;

    const pts = eyeShape(cx, cy, rx, ry, open, E.seed + i * 91);
    ink.body(() => path(ctx, pts));
    if (open < 0.5) continue;

    // 虹彩と瞳。瞳は段で開く（じわっと開くと退屈になる）
    ctx.save();
    ctx.beginPath(); path(ctx, pts); ctx.clip();
    const gx = step(snz(E.p * (2 + sh.k2 * 6) + i, E.fix), 3) * rx * 0.34;
    const gy = step(snz(E.p * 2.3 + i + 9, E.fix), 3) * ry * 0.22;
    const ir = ry * 0.98;
    ctx.fillStyle = col.g;
    ctx.beginPath(); path(ctx, blob(cx + gx, cy + gy, new Array(26).fill(ir), E.seed + i, 0.03)); ctx.fill();
    ctx.fillStyle = col.a;
    ctx.beginPath(); path(ctx, blob(cx + gx, cy + gy, new Array(26).fill(ir * 0.86), E.seed + i * 3, 0.05)); ctx.fill();
    // 虹彩の筋
    ctx.fillStyle = col.g;
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * TAU + nz(E.fix + i + k) * 0.1;
      brush(ctx, [
        [cx + gx + Math.cos(a) * ir * 0.3, cy + gy + Math.sin(a) * ir * 0.3],
        [cx + gx + Math.cos(a) * ir * 0.9, cy + gy + Math.sin(a) * ir * 0.9],
      ], E.lw * 0.7, E.seed + k * 17, true);
    }
    const dil = 0.22 + 0.5 * snap(E.p, sh.k3, 0.02) * (1 - sh.k1 * 0.4);
    ctx.fillStyle = col.g;
    ctx.beginPath(); path(ctx, blob(cx + gx, cy + gy, new Array(20).fill(ir * dil), E.seed + i * 5, 0.06)); ctx.fill();
    ctx.fillStyle = col.l;
    ctx.beginPath(); ctx.arc(cx + gx - ir * 0.3, cy + gy - ir * 0.34, ir * 0.13, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

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

// ---- 手 ---------------------------------------------------------------
// 掌を正面から。指は上の縁から生える。握ると段で一気に折れる。
function hand(ctx, S, E) {
  const { ink, col, sh } = E;
  const cx = S.w * (0.5 + sh.ox * 0.18), cy = S.h * (0.6 + sh.oy * 0.1);
  const R = S.h * (0.17 + sh.k1 * 0.13);
  // 握る／開く。途中の形を出さない（段で切り替える）
  const grip = sh.k2 > 0.5 ? snap(E.p, sh.k3, 0.02) : 1 - snap(E.p, sh.k3, 0.02);
  const curl = mix(0.04, 0.78, grip);

  const finger = (bx, by, ang, len, w, seed) => {
    let a = ang, x = bx, y = by;
    const pts = [[x, y]];
    for (let j = 0; j < 3; j++) {
      a += curl * 0.7 + snz(j * 2 + seed * 0.01, seed) * 0.06;
      x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3;
      pts.push([x, y]);
    }
    brush(ctx, pts, w, seed, false);
    ctx.beginPath(); ctx.arc(pts[3][0], pts[3][1], w * 0.48, 0, TAU); ctx.fill();
    return pts[3];
  };

  ink.body(() => {
    // 掌。角の丸い四角
    const pts = [];
    const hw = R * 0.66, hh = R * 0.74;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const c = Math.cos(a), si = Math.sin(a);
      const k = 1 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(si), 4), 0.25);
      pts.push([cx + c * hw * k, cy + si * hh * k]);
    }
    path(ctx, wob(pts, R * 0.02, E.seed));
  });

  ctx.save();
  ctx.fillStyle = col.i;
  // 腕（枠の下へ抜ける）
  brush(ctx, [[cx, cy + R * 0.4], [cx + sh.ox * R * 0.4, S.h + R]], R * 1.05, E.seed + 7, false);
  // 四本指。長さを変える（同じ長さに並べると櫛になる）
  const L = [0.92, 1.12, 1.06, 0.84];
  for (let i = 0; i < 4; i++) {
    const bx = cx + (i - 1.5) * R * 0.39, by = cy - R * 0.66;
    finger(bx, by, -Math.PI / 2 + (i - 1.5) * 0.08, R * L[i], R * (0.23 - i * 0.012), E.seed + i * 71);
  }
  // 親指
  finger(cx - R * 0.66, cy + R * 0.16, -Math.PI * 0.82, R * 0.78, R * 0.27, E.seed + 41);
  ctx.restore();

  // 掌の筋（異＝少しだけ人間くさいもの）
  if (sh.odd) {
    ctx.save(); ctx.fillStyle = col.a;
    for (let i = 0; i < 3; i++) {
      const pts = [];
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pts.push([cx - R * 0.5 + R * 1.0 * u, cy - R * 0.3 + i * R * 0.3 + Math.sin(u * 3 + i) * R * 0.13]);
      }
      brush(ctx, wob(pts, R * 0.015, E.seed + i), R * 0.04, E.seed + i * 9, true);
    }
    ctx.restore();
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

// ---- 樹 ---------------------------------------------------------------
// 伸びる。根・枝・稲妻・血管、向きと太さで別物になる。
function branch(ctx, S, E) {
  const { col, sh } = E;
  const grow = Math.pow(E.p, 0.45);
  const up = sh.k1 > 0.5 ? -1 : 1;
  const x0 = S.w * (0.5 + sh.ox * 0.3), y0 = up < 0 ? S.h * 1.02 : -S.h * 0.02;
  ctx.fillStyle = col.i;
  const maxD = 8;
  const stack = [[x0, y0, up < 0 ? -Math.PI / 2 : Math.PI / 2, S.h * (0.2 + sh.k2 * 0.16), S.h * 0.035, 0]];
  let guard = 0;
  while (stack.length && guard++ < 3000) {
    const [x, y, a, len, w, d] = stack.pop();
    const birth = d / maxD;
    if (birth > grow) continue;
    const part = clamp((grow - birth) * maxD * 1.6, 0, 1);
    const pts = [];
    const seg = 5;
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * part;
      pts.push([x + Math.cos(a) * len * u + snz(u * 3 + d, E.seed + d * 7) * w * 1.4,
                y + Math.sin(a) * len * u + snz(u * 3 + d + 11, E.seed + d * 7) * w * 1.4]);
    }
    if (pts.length > 1) brush(ctx, pts, w, E.seed + d * 31 + Math.floor(x), false);
    if (d >= maxD || part < 0.99) continue;
    const ex = pts[pts.length - 1][0], ey = pts[pts.length - 1][1];
    const kids = 2 + (nz01(E.fix + d * 17 + Math.floor(x * 0.1)) > 0.72 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const spread = (0.35 + sh.k3 * 0.75);
      const na = a + (k - (kids - 1) / 2) * spread + nz(E.fix + d * 13 + k * 7 + Math.floor(x)) * 0.3;
      stack.push([ex, ey, na, len * (0.68 + nz01(E.fix + d + k) * 0.16), w * 0.68, d + 1]);
    }
  }
  // 先端の実（差し色）
  if (sh.odd) {
    ctx.fillStyle = col.a;
    for (let i = 0; i < 40; i++) {
      const a2 = nz01(E.fix + i * 29) * TAU;
      const rr = S.h * (0.2 + nz01(E.fix + i * 7) * 0.5) * grow;
      ctx.beginPath();
      ctx.arc(x0 + Math.cos(a2) * rr * 1.3, y0 + Math.sin(a2) * rr * (up < 0 ? 1 : 1) * (up < 0 ? -1 : 1) * -1 * -1, S.h * 0.012, 0, TAU);
      ctx.fill();
    }
  }
}

// ---- 面 ---------------------------------------------------------------
// 仮面。左右対称にして、片側だけ刻む（＝法「異」）。
function mask(ctx, S, E) {
  const { ink, col, sh } = E;
  const cx = S.w * (0.5 + sh.ox * 0.1), cy = S.h * (0.5 + sh.oy * 0.08);
  const R = S.h * (0.3 + sh.k1 * 0.16);
  ink.body(() => {
    const rs = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      rs.push(R * (0.78 + 0.34 * Math.abs(Math.cos(a)) - 0.22 * Math.max(0, Math.sin(a))));
    }
    path(ctx, blob(cx, cy, rs, E.seed, 0.03));
  });
  ctx.save();
  // 眼窩
  const open = sh.k2;
  for (const s of [-1, 1]) {
    const ex = cx + s * R * 0.42, ey = cy - R * 0.16;
    ctx.fillStyle = col.g;
    ctx.beginPath(); path(ctx, eyeShape(ex, ey, R * 0.26, R * 0.19, 1, E.seed + s * 11)); ctx.fill();
    ctx.fillStyle = col.a;
    ctx.beginPath();
    ctx.arc(ex + s * R * 0.03, ey, R * 0.085 * (0.6 + open * 0.9), 0, TAU); ctx.fill();
  }
  // 鼻梁
  ctx.fillStyle = col.g;
  brush(ctx, [[cx, cy - R * 0.1], [cx + R * 0.03, cy + R * 0.24]], R * 0.09, E.seed + 3, true);
  // 口。段で開く（叫び）
  const mo = mix(0.04, 0.42, snap(E.p, sh.k3, 0.02));
  ctx.fillStyle = col.g;
  const mp = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    mp.push([cx + Math.cos(a) * R * 0.3, cy + R * 0.46 + Math.sin(a) * R * mo]);
  }
  ctx.beginPath(); path(ctx, wob(mp, R * 0.012, E.seed + 5)); ctx.fill();
  if (mo > 0.2) {
    ctx.fillStyle = col.l;
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6;
      ctx.fillRect(cx - R * 0.26 + R * 0.52 * u - R * 0.03, cy + R * (0.46 - mo * 0.95), R * 0.06, R * mo * 0.4);
    }
  }
  // 眉（片方だけ上げる＝異）
  ctx.fillStyle = col.g;
  for (const s of [-1, 1]) {
    const lift = s > 0 && sh.odd ? R * 0.1 : 0;
    const pts = [];
    for (let j = 0; j <= 5; j++) {
      const u = j / 5;
      pts.push([cx + s * R * (0.16 + u * 0.46), cy - R * 0.44 - lift - Math.sin(u * Math.PI) * R * 0.07]);
    }
    brush(ctx, pts, R * 0.07, E.seed + s * 17, true);
  }
  ctx.restore();
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

// ---- 火 ---------------------------------------------------------------
function flame(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const k = sh.n;
  const base = S.h * (1.02 + sh.oy * 0.1);
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? col.i : col.a;
    for (let i = 0; i < k; i++) {
      const x = S.w * ((i + 0.5) / k + nz(E.fix + i * 7) * 0.04);
      const hgt = S.h * (0.55 + nz01(E.fix + i * 11) * 0.75) * (0.68 + 0.32 * Math.sin(tq * 5 + i))
        * (pass === 0 ? 1 : 0.55) * (0.6 + sh.k1 * 0.7);
      const w = S.w / k * (pass === 0 ? 0.62 : 0.3);
      const pts = [];
      const N = 12;
      for (let j = 0; j <= N; j++) {
        const u = j / N;
        const taper = Math.pow(1 - u, 0.5);
        pts.push([x - w * 0.5 * taper + snz(u * 3 + tq * 7 + i, E.seed + i) * w * 1.1 * u * (1 - u * 0.75),
                  base - hgt * u]);
      }
      for (let j = N; j >= 0; j--) {
        const u = j / N;
        const taper = Math.pow(1 - u, 0.5);
        pts.push([x + w * 0.5 * taper + snz(u * 3 + tq * 7 + i + 17, E.seed + i) * w * 1.1 * u * (1 - u * 0.75),
                  base - hgt * u]);
      }
      ctx.beginPath(); path(ctx, pts); ctx.fill();
    }
  }
  // 火の粉
  ctx.fillStyle = col.l;
  for (let i = 0; i < 90; i++) {
    const t2 = (tq * 0.35 + nz01(E.fix + i * 13)) % 1;
    const x = S.w * nz01(E.fix + i * 3) + snz(tq * 2 + i, E.fix) * S.w * 0.06;
    const y = base - t2 * S.h * 1.15;
    ctx.beginPath(); ctx.arc(x, y, S.h * 0.004 * (1 - t2) * 2.5, 0, TAU); ctx.fill();
  }
}

// ---- 雨 ---------------------------------------------------------------
function rain(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  // 途中で向きが変わる（予測不可能性）
  const flip = snap(E.p, sh.k3, 0.02);
  const ang = mix(-0.28 + sh.k1 * 0.5, 0.9 - sh.k1 * 1.6, flip);
  const ca = Math.sin(ang), sa = Math.cos(ang);
  const n = sh.n;
  const sp = S.h * (1.2 + sh.k2 * 2.6);
  ctx.fillStyle = col.i;
  for (let i = 0; i < n; i++) {
    const len = S.h * (0.05 + nz01(E.fix + i * 7) * 0.18);
    const off = nz01(E.fix + i * 3) * (S.h * 2);
    const d = (off + tq * sp * (0.7 + nz01(E.fix + i * 11) * 0.7)) % (S.h * 2.2) - S.h * 0.6;
    const x0 = nz01(E.fix + i * 5) * S.w * 1.6 - S.w * 0.3 - ca * d;
    const y0 = -S.h * 0.2 + sa * d;
    brush(ctx, [[x0, y0], [x0 + ca * len, y0 + sa * len]], E.lw * (0.5 + nz01(E.fix + i) * 1.6), E.seed + i * 7, false);
  }
  if (sh.odd) {    // 一本だけ逆向きに落ちる
    ctx.fillStyle = col.a;
    const d = (tq * sp * 0.6) % (S.h * 2.2);
    brush(ctx, [[S.w * 0.5, S.h * 1.2 - d], [S.w * 0.5 - ca * S.h * 0.25, S.h * 1.2 - d - sa * S.h * 0.25]], E.lw * 3, E.seed, false);
  }
}

// ---- 輪 ---------------------------------------------------------------
// 天体。段で回る。一つだけ切れている。
function rings(ctx, S, E) {
  const { col, sh } = E;
  const tq = E.f / E.fps;
  const cx = S.w * (0.5 + sh.ox * 0.2), cy = S.h * (0.5 + sh.oy * 0.2);
  const k = sh.n;
  for (let i = 0; i < k; i++) {
    const u = (i + 1) / k;
    const R = S.h * (0.06 + u * (0.42 + sh.k1 * 0.24));
    const ecc = 1 + nz(E.fix + i * 7) * 0.22;
    const rot = step(tq * (0.05 + nz01(E.fix + i * 3) * 0.3) * (i % 2 ? -1 : 1), 24) * TAU;
    const gap = (sh.odd && i === k - 2) ? 0.22 : 0;
    const N = 60, pts = [];
    for (let j = 0; j <= N; j++) {
      const a = rot + (j / N) * TAU * (1 - gap);
      pts.push([cx + Math.cos(a) * R * ecc, cy + Math.sin(a) * R / ecc]);
    }
    ctx.fillStyle = i === k - 1 ? col.a : col.i;
    brush(ctx, wob(pts, R * 0.012, E.seed + i * 13), E.lw * (0.8 + nz01(E.fix + i) * 2.4), E.seed + i * 29, false);
    // 軌道上の点
    const a2 = rot * (1.7 + i) + i;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a2) * R * ecc, cy + Math.sin(a2) * R / ecc, S.h * (0.008 + u * 0.02), 0, TAU);
    ctx.fillStyle = col.l; ctx.fill();
  }
  // 中心の塊
  ctx.fillStyle = col.a;
  ctx.beginPath();
  path(ctx, blob(cx, cy, new Array(20).fill(S.h * (0.03 + sh.k2 * 0.09)), E.seed, 0.08));
  ctx.fill();
}

// ---- 裂 ---------------------------------------------------------------
// 画面を割る。割った向こう側は別の色になる。一番強い「対比」。
//
// 折れ線は中点変位で作る（滑らかな雑音で揺らすと、ただの地平線になる。
// 実際に一度それで「山の稜線」にしか見えなくなった）。
function fracture(a, b, depth, amp, seed) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      let dx = q[0] - p[0], dy = q[1] - p[1];
      const L = Math.hypot(dx, dy) || 1;
      const off = nz(seed + d * 977 + i * 131) * amp * Math.pow(0.56, d);
      next.push([mx - dy / L * off, my + dx / L * off], q);
    }
    pts = next;
  }
  return pts;
}

function crack(ctx, S, E) {
  const { col, sh } = E;
  // 早く割り切る。景の 1/4 で向こう側が出る（割れる瞬間そのものが断になる）
  const grow = clamp(Math.pow(E.p, 0.22) * 1.4, 0, 1);
  const vert = sh.k2 > 0.5;
  // 端は枠の内側に収める。**外に出すと「割った向こう側」が消えて、
  // 画面が一色になる**（実測で 305秒の景が一色になった）。
  const a = vert ? [S.w * (0.5 + sh.ox * 0.26), -S.h * 0.05] : [-S.w * 0.05, S.h * (0.5 + sh.oy * 0.26)];
  const b = vert ? [S.w * (0.5 + sh.oy * 0.26), S.h * 1.05] : [S.w * 1.05, S.h * (0.5 + sh.ox * 0.26)];
  const all = fracture(a, b, 6, S.h * (0.28 + sh.k1 * 0.3), E.fix);
  const pts = all.slice(0, Math.max(2, Math.ceil(all.length * grow)));

  // 向こう側を塗る。割れ切った時点で画面の半分が別の色になる（＝断）
  if (grow > 0.995) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    if (vert) { ctx.lineTo(-S.w, S.h * 1.1); ctx.lineTo(-S.w, -S.h * 0.1); }
    else { ctx.lineTo(S.w * 1.1, -S.h); ctx.lineTo(-S.w * 0.1, -S.h); }
    ctx.closePath();
    ctx.fillStyle = col.a; ctx.fill();
    ctx.restore();
  }
  // 割れたあとは**口が開き続ける**。ここを止めると、18秒の景が静止画になる
  // （実測で 0.57%／0.5秒しか動かず、法「動」に落ちた）。
  const opening = grow > 0.995 ? (E.p - 0.26) / 0.74 : 0;
  if (opening > 0) {
    ctx.fillStyle = col.l;
    brush(ctx, pts, S.h * (0.012 + opening * 0.14 * (0.4 + sh.k3)), E.seed + 5, false);
  }
  ctx.fillStyle = col.i;
  brush(ctx, pts, S.h * (0.008 + sh.k1 * 0.03), E.seed, false);

  // 枝分かれ
  const stepN = Math.max(2, Math.floor(pts.length / 14));
  for (let i = stepN; i < pts.length - 1; i += stepN) {
    if (nz01(E.fix + i * 17) > 0.62) continue;
    const dx = pts[i + 1][0] - pts[i - 1][0], dy = pts[i + 1][1] - pts[i - 1][1];
    const base = Math.atan2(dy, dx);
    const side = nz01(E.fix + i * 7) > 0.5 ? 1 : -1;
    const ang = base + side * (0.7 + nz01(E.fix + i * 3) * 0.7);
    const len = S.h * (0.06 + nz01(E.fix + i * 5) * 0.3) * grow;
    const sub = fracture(pts[i], [pts[i][0] + Math.cos(ang) * len, pts[i][1] + Math.sin(ang) * len],
      3, len * 0.22, E.fix + i * 31);
    brush(ctx, sub, S.h * 0.007, E.seed + i * 13, true);
  }
  // 破片が飛ぶ
  if (sh.odd && grow > 0.5) {
    ctx.fillStyle = col.l;
    for (let i = 0; i < 40; i++) {
      const p = pts[Math.floor(nz01(E.fix + i * 3) * (pts.length - 1))];
      const d = (E.p - 0.5) * S.h * 0.9;
      ctx.beginPath();
      ctx.arc(p[0] + nz(E.fix + i * 11) * S.h * 0.12, p[1] + nz(E.fix + i * 5) * d, S.h * 0.009, 0, TAU);
      ctx.fill();
    }
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
export const NAMES = ['眼', '群', '手', '獣', '樹', '面', '波', '火', '雨', '輪', '裂', '衆'];
export const MOTIFS = [eye, swarm, hand, beast, branch, mask, wave, flame, rain, rings, crack, crowd];
