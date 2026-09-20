// 事（event）— 図に起きること。
//
// **この版で足した層。** 依頼者の指摘:
//
//   「展開部は基本的に前半に出てきたものの使い回しが映ってるだけなので
//    そこはつまらない。切り替わりや色を速くしただけのパターンになっていて、
//    まだワンパターンだという印象は払拭できていない。
//    椅子が並んでいるところなら、椅子そのものが変化していくとか、
//    誰か謎の男が出てきて座り出すとか、椅子から連想できる展開がある。
//    **カット割りの工夫だけでは展開は作りきれない。**
//    意味的（セマンティック）に映像そのものが展開していくといい」
//
// その通りで、速く切ることは「量の変化」でしかない。
// 展開とは**同じものが別のことになる**ことなので、図に事を起こす層を置いた。
//
//   崩 … ばらばらに割れて落ちる      組 … 破片が飛んできて組み上がる
//   溶 … 垂れて流れ落ちる            殖 … 画面の中で増えて入れ子になる
//   落 … 枠の外へ落ちていく          侵 … 別の図が入ってきてぶつかる
//   喰 … 大きな顎が閉じて呑み込む    逃 … 一点から逃げ散る
//   来 … 人が歩いてきて、座る／手を挙げる／うずくまる
//   芽 … 形そのものが伸び縮みして別の姿になる
//
// **部ごとに意味がある。** 提示部では何も起きない（無垢な姿を見せる）。
// 展開部で壊され・襲われ・呑まれ、再現部で**組み上がって**帰ってくる。
// 壊れたものが組み上がるから、帰ってきたことが効く。

import { nz, nz01, snz, TAU, clamp, mix, brush, path } from './paint.js';
import { MOTIFS, humanOn } from './motif.js';

export const EV_NAMES = ['無', '崩', '組', '溶', '殖', '落', '侵', '喰', '逃', '来', '芽', '固'];
// 11「固」は**図ごとの固有の事**で、motif.js の ownEvent が描く。
// 汎用の事はここ（event.js）、固有の事はあちら（motif.js）。
//   椅子に人が座る・壺が割れて中身が出る・梯子を登る・波が人を呑む——
//   それはその図でしか起きないので、図の側が知っているべき。
// 画素を触る事（図を一度別の板に描いてから、割ったり動かしたりする）
export const PIXEL = [0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];

// ---- 描く前に掛ける変形（逃・芽） --------------------------------------
export function evTransform(ctx, S, sh, ep) {
  const ev = sh.ev | 0;
  if (ev === 8) {                       // 逃 — 一点から逃げ散る
    // **振り切ると図が枠の外へ出て、画面が空になる。**
    // 余白の法を入れて図の数を下限から取るようにしたら、
    // 「1匹だけの獣が逃げて画面から消える」景が実際に出た（実測 poster 0.00）。
    // だから伸びは 2.2 倍までにして、中心を**図の置き場所と同じ**にする。
    // 図はその場で迫ってきて、枠からは出ない。
    const k = 1 + ep * ep * (0.6 + sh.mvA * 0.6);
    const cx = S.w * (0.5 + sh.ox * 0.25), cy = S.h * (0.5 + sh.oy * 0.25);
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  } else if (ev === 10) {               // 芽 — 縦横が別々に伸び縮みして姿が変わる
    const q = Math.round(ep * 12) / 12;
    const kx = 1 + Math.sin(q * Math.PI * 2) * (0.35 + sh.mvA * 0.5);
    const ky = 1 + Math.sin(q * Math.PI * 2 + 2.1) * (0.45 + sh.mvA * 0.6);
    ctx.translate(S.w / 2, S.h); ctx.scale(kx, ky); ctx.translate(-S.w / 2, -S.h);
  }
}

// 人は motif.js が持っている（図の側からも「座る」「登る」で使うため）。

// ---- 図の上に描き足す事（侵・喰・来） -----------------------------------
export function evOverlay(ctx, S, E, ep) {
  const sh = E.sh, col = E.col, ev = sh.ev | 0;

  if (ev === 6) {                       // 侵 — 別の図が入ってくる
    const m2 = (sh.ev2 | 0) % MOTIFS.length;
    const side = sh.ox > 0 ? -1 : 1;
    const k = 0.55 + sh.mvA * 0.5;
    ctx.save();
    ctx.translate(S.w * 0.5 + side * S.w * (1.15 - ep * 1.15), S.h * (0.12 + sh.oy * 0.1));
    ctx.rotate(side * (0.25 - ep * 0.2));
    ctx.scale(k, k);
    ctx.translate(-S.w * 0.5, 0);
    const E2 = Object.assign({}, E, {
      col: { name: col.name, g: col.g, i: col.a, a: col.i, l: col.l, raw: col.raw },
      sh: Object.assign({}, sh, { ev: 0, m: m2, hand: 0, odd: false }),
      seed: E.seed + 9001, fix: E.fix + 7717,
    });
    E2.ink = E.ink;
    MOTIFS[m2](ctx, S, E2);
    ctx.restore();

  } else if (ev === 7) {                // 喰 — 顎が閉じて呑み込む
    const close = Math.pow(ep, 0.8);
    const side = sh.ox > 0 ? 1 : -1;
    const cx = S.w * (0.5 - side * (0.75 - close * 0.75));
    const R = S.h * (1.15 + sh.mvA * 0.5);
    const gap = mix(0.62, 0.02, close);
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      const pts = [];
      for (let j = 0; j <= 26; j++) {
        const a = -Math.PI * 0.5 + (j / 26) * Math.PI;
        const rr = R * (0.85 + 0.25 * Math.cos(a * 2));
        pts.push([cx + side * Math.cos(a) * rr * -1,
                  S.h * 0.5 + s2 * (S.h * gap + Math.sin(a) * rr * 0.55)]);
      }
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(cx - side * R * 2, S.h * 0.5 + s2 * S.h * 2);
      ctx.lineTo(cx - side * R * 2, S.h * 0.5);
      ctx.closePath();
      ctx.fillStyle = col.g; ctx.fill();
      // 牙
      ctx.fillStyle = col.i;
      for (let k = 2; k < 24; k += 3) {
        const p = pts[k];
        brush(ctx, [[p[0], p[1]], [p[0] + side * S.h * 0.05, p[1] - s2 * S.h * 0.09]], S.h * 0.022, E.seed + k * 7 + s2, true);
      }
      ctx.fillStyle = col.i;
      brush(ctx, pts, S.h * 0.012, E.seed + s2 * 31, false);
    }

  } else if (ev === 9) {                // 来 — 人が歩いてきて、何かをする
    const walkEnd = 0.55;
    const arrive = clamp(ep / walkEnd, 0, 1);
    const after = clamp((ep - walkEnd) / (1 - walkEnd), 0, 1);
    const side = sh.ox > 0 ? 1 : -1;
    const tx = S.w * (0.5 - sh.ox * 0.22);
    const x = mix(S.w * (0.5 + side * 0.68), tx, arrive);
    const gy = S.h * (0.82 + sh.oy * 0.08);
    const s = S.h * (0.13 + sh.k1 * 0.12);
    const act = after < 0.25 ? 0 : (sh.ev2 % 3) + 1;
    ctx.save();
    if (side > 0) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
    humanOn(ctx, col, x, gy, s, arrive < 1 ? arrive * 6 : 0, act, E.seed + 313);
    ctx.restore();
  }
}

// ---- 画素を触る事（崩・組・溶・殖・落） ---------------------------------
// 図だけを別の板に描いておいて、その板を割ったり落としたりする。
// **どの図にも同じように効く**ので、図の数だけ実装を書かなくて済む。
export function evComposite(ctx, buf, W, H, sh, ep, seed) {
  const ev = sh.ev | 0;
  if (ev === 5) {                       // 落 — まるごと枠の外へ
    const q = Math.round(ep * 16) / 16;
    ctx.save();
    ctx.translate(W * 0.5 + nz(seed) * W * 0.05 * q, H * 0.5 + q * q * H * 1.5);
    ctx.rotate(nz(seed + 3) * q * 0.7);
    ctx.drawImage(buf, -W * 0.5, -H * 0.5);
    ctx.restore();
    return;
  }
  if (ev === 4) {                       // 殖 — 段で増える
    const n = 1 + Math.floor(ep * 3.999);
    const w = W / n, h = H / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.drawImage(buf, i * w, j * h, w, h);
      }
    }
    return;
  }
  const GX = 8, GY = 5;
  const tw = W / GX, th = H / GY;
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const k = i + j * GX;
      const lag = nz01(seed + k * 37) * 0.45;
      let t = clamp((ep - lag) / (1 - lag + 1e-3), 0, 1);
      if (ev === 2) t = 1 - t;           // 組 — 逆回し（破片が集まって組み上がる）
      let dx = 0, dy = 0, rot = 0;
      // **全部を飛ばさない。** 4枚に1枚はその場に残す。
      // 全部動かすと、事が進んだ時点で画面がほぼ空になる（実際になった）。
      if (nz01(seed + k * 77) < 0.26) t *= 0.22;
      if (ev === 3) {                    // 溶 — 垂れる（枠の中に残る程度に）
        dy = t * t * H * (0.3 + nz01(seed + k * 11) * 0.55);
      } else {                           // 崩・組
        const ang = nz(seed + k * 13) * 1.2 + (i / GX - 0.5) * 2.4;
        dx = Math.sin(ang) * t * W * (0.18 + nz01(seed + k * 7) * 0.32);
        dy = t * t * H * (0.5 + nz01(seed + k * 5) * 0.6) - t * H * 0.1;
        rot = nz(seed + k * 3) * t * 1.3;
      }
      if (t > 0.999 && ev !== 3) continue;
      ctx.save();
      ctx.translate(i * tw + tw / 2 + dx, j * th + th / 2 + dy);
      ctx.rotate(rot);
      ctx.drawImage(buf, i * tw, j * th, tw, th, -tw / 2, -th / 2, tw, th);
      ctx.restore();
    }
  }
}
