// 形（form）— **その作品のための図を、部品から組み立てる。**
//
// 第七版までは `motif.js` に手で描いた14の図があり、1本につき5つを**選んで**いた。
// 依頼者:
//   「映像のモチーフとかも使い回さないでよ。そのためにnoteの記事指定してるじゃんか。
//     全て1から作り直すんだよ」
//
// **棚から選ぶ構造そのものが間違いだった。** 選ぶかぎり、いつか必ず見たものが出る。
// だからここでは、部品（柱・梁・弧・輪・面・段・糸・粒・幹・笠・器・脚・帆・枠・歯）と
// **骨格**を持ち、作品ごとに寸法・数・向き・有無を振って**その作品の図を組む。**
//
// **ただし「名前のある形」であることは崩さない。**
// 三度目の失敗（型を読み当てられる）と二度目の失敗（技術の展示）のあいだを通るには、
// 見た人が名前を言える物でなければならない。抽象の塊は「技術の展示」に落ちる。
// だから骨格は**必ず名前を持つ物**として設計してあり、名前も一緒に返す。
//
// **固有の事も骨格が持つ。** 「意味は固有のところにしか宿らない」
// （椅子に人が座るのは椅子だから、器が割れて中身が出るのは器だから）。
// 骨格ごとに、その物にしか起きないことを1つ持たせる。
//
// 返すもの: { name, kind, draw(ctx, S, E), spot(S, E, i), own }
//   draw … 図を描く（motif.js の図と同じ呼びかた）
//   spot … 固有の事が使う場所（座面・上端・口）を図と同じ数で返す
//   own  … 固有の事を描く

import { nz, nz01, TAU, clamp, path, blob } from './paint.js';

const step = (v, n) => Math.round(v * n) / n;

// ---- 部品 ------------------------------------------------------------
// **どれも「いまの道（path）に足す」だけ。塗らない。**
// 塗るのは `E.ink.body()` が一度だけやる。
// 自分で `ctx.fill()` すると、そのときの塗り色（地の色）で塗られて**図が消える**
// し、塗りかたの手（塗る・線だけ・刻む・点で打つ）も一切効かない（実際に消えた）。

// 線を太らせて面にする（paint.js の brush と同じ形。ただし塗らない）
function pStroke(ctx, pts, w, seed) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const ww = w * 0.5 * (0.84 + 0.32 * nz01(seed + i * 13));
    L.push([pts[i][0] - dy * ww, pts[i][1] + dx * ww]);
    R.push([pts[i][0] + dy * ww, pts[i][1] - dx * ww]);
  }
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
}
// 面（角は角のまま）。**直線で引くこと**——paint.js の path() は角を丸めるので、
// 箱を渡すと卵になり、階の段は点になった（実際になった）
function pPlate(ctx, pts, seed) {
  if (pts.length < 3) return;
  const j = (v, k) => v + (seed === undefined ? 0 : (nz01(seed + k * 31) - 0.5) * 1.6);
  ctx.moveTo(j(pts[0][0], 0), j(pts[0][1], 1));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(j(pts[i][0], i * 2), j(pts[i][1], i * 2 + 1));
  ctx.closePath();
}
// 丸みのある面（器の胴・笠）だけ曲線で引く
function pCurved(ctx, pts) { path(ctx, pts); }
// 円板
function pDisc(ctx, cx, cy, r, seed) { path(ctx, blob(cx, cy, new Array(26).fill(r), seed, 0.02)); }

// 柱（縦の棒）
function post(ctx, x, y0, y1, w, seed, solid) {
  if (solid) {
    pPlate(ctx, [[x - w * 0.5, y0], [x + w * 0.5, y0], [x + w * 0.42, y1], [x - w * 0.42, y1]], seed);
  } else {
    pStroke(ctx, [[x, y0], [x, y1]], w, seed);
  }
}
// 梁（横の棒）
function beam(ctx, x0, x1, y, w, seed, solid) {
  pPlate(ctx, [[x0, y - w * 0.5], [x1, y - w * 0.5], [x1, y + w * 0.5], [x0, y + w * 0.5]], seed);
}
// 弧（橋・門の頭）
function arc(ctx, cx, cy, r, from, to, w, seed) {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const a = from + (to - from) * (i / 26);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pStroke(ctx, pts, w, seed);
}
const disc = pDisc;
const plate = pPlate;
const curved = pCurved;
// 段（階の1段）
function tread(ctx, x0, x1, y, h, seed) {
  pPlate(ctx, [[x0, y], [x1, y], [x1, y + h], [x0, y + h]], seed);
}
// 糸（垂れる線）
function thread(ctx, x, y0, y1, w, seed, sway) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    pts.push([x + Math.sin(u * 3.1 + seed * 0.7) * sway * u, y0 + (y1 - y0) * u]);
  }
  pStroke(ctx, pts, w, seed);
}
// 粒（点の群）
function grains(ctx, cx, cy, rad, n, r, seed) {
  for (let i = 0; i < n; i++) {
    const a = nz01(seed + i * 13) * TAU, d = Math.sqrt(nz01(seed + i * 29)) * rad;
    pDisc(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, seed + i);
  }
}
// 器の胴（下がふくらんで上が開く）
function bowl(ctx, cx, cy, w, h, lip, seed) {
  const pts = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const u = i / n, y = cy - h * (1 - u);
    const k = Math.sin(u * Math.PI * 0.72 + 0.28);
    pts.push([cx - w * 0.5 * (lip + (1 - lip) * k), y]);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n, y = cy - h * (1 - u);
    const k = Math.sin(u * Math.PI * 0.72 + 0.28);
    pts.push([cx + w * 0.5 * (lip + (1 - lip) * k), y]);
  }
  pCurved(ctx, pts);
}
// 笠（傘・木の冠）
function canopy(ctx, cx, cy, r, ribs, seed) {
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62]);
  }
  pCurved(ctx, pts);
  for (let i = 1; i < ribs; i++) {
    const a = Math.PI + (i / ribs) * Math.PI;
    pStroke(ctx, [[cx, cy], [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62]], r * 0.04, seed + i);
  }
}
// 枠（窓・額）
function frame(ctx, x0, y0, x1, y1, w, seed, bars) {
  beam(ctx, x0, x1, y0, w, seed + 1, true);
  beam(ctx, x0, x1, y1, w, seed + 2, true);
  post(ctx, x0, y0, y1, w, seed + 3, true);
  post(ctx, x1, y0, y1, w, seed + 4, true);
  for (let i = 1; i < bars; i++) {
    post(ctx, x0 + (x1 - x0) * (i / bars), y0, y1, w * 0.6, seed + 10 + i, true);
  }
}
// 歯（櫛・柵）
function teeth(ctx, x0, x1, y, h, n, w, seed) {
  for (let i = 0; i < n; i++) {
    post(ctx, x0 + (x1 - x0) * ((i + 0.5) / n), y, y - h, w, seed + i, true);
  }
}

// ---- 人（固有の事に出る） ----------------------------------------------
// **図の色で描き、地の色で細く縁取る。** 差し色そのままで置くと、
// 地の割りに差し色を使っている景で赤の上に赤の人が乗って完全に消える。
function human(ctx, S, E, x, y, h, pose) {
  const { col } = E;
  const lw = h * 0.1;
  const put = (fn) => { ctx.beginPath(); fn(); ctx.fill(); };
  ctx.save();
  ctx.strokeStyle = col.g; ctx.lineWidth = lw * 0.5;
  ctx.fillStyle = col.i;
  put(() => pDisc(ctx, x, y - h * 0.86, h * 0.13, E.fix + 1));
  const legs = pose === 'sit'
    ? [[[x, y - h * 0.45], [x + h * 0.26, y - h * 0.45], [x + h * 0.26, y]]]
    : pose === 'crouch'
      ? [[[x, y - h * 0.3], [x + h * 0.18, y]], [[x, y - h * 0.3], [x - h * 0.16, y]]]
      : [[[x, y - h * 0.4], [x + h * 0.12, y]], [[x, y - h * 0.4], [x - h * 0.12, y]]];
  put(() => pStroke(ctx, [[x, y - h * 0.74], [x, y - h * (pose === 'sit' ? 0.45 : 0.4)]], lw, E.fix + 2));
  for (const l of legs) put(() => pStroke(ctx, l, lw * 0.9, E.fix + 3));
  const arms = pose === 'raise'
    ? [[[x, y - h * 0.68], [x - h * 0.22, y - h * 1.0]], [[x, y - h * 0.68], [x + h * 0.22, y - h * 1.0]]]
    : [[[x, y - h * 0.68], [x - h * 0.2, y - h * 0.46]], [[x, y - h * 0.68], [x + h * 0.2, y - h * 0.46]]];
  for (const a of arms) put(() => pStroke(ctx, a, lw * 0.8, E.fix + 4));
  ctx.restore();
}

// ---- 骨格 ------------------------------------------------------------
// **必ず名前のある物。** 各骨格は寸法・数・向き・有無を引数で受ける。
// `ev` はその物にしか起きないこと。
const SKELETONS = [
  {
    key: 'tower', 名: ['櫓', '梯', '足場'], ev: 'climb',
    // 柱2本に梁を何段か渡した物。段の数と傾きで櫓にも梯にもなる
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, h = s * P.tall, lw = E.lw * P.thick;
      post(ctx, x - w * 0.5, y, y - h, lw * 2, E.fix + i * 7, true);
      post(ctx, x + w * 0.5, y, y - h, lw * 2, E.fix + i * 7 + 1, true);
      for (let k = 1; k <= P.count; k++) {
        const yy = y - h * (k / (P.count + 1));
        beam(ctx, x - w * 0.5, x + w * 0.5, yy, lw * 1.4, E.fix + i * 13 + k, true);
      }
      if (P.cap) plate(ctx, [[x - w * 0.62, y - h], [x + w * 0.62, y - h],
        [x + w * 0.5, y - h - s * 0.1], [x - w * 0.5, y - h - s * 0.1]]);
    },
    top: (P, x, y, s) => [x, y - s * P.tall * 0.92],
  },
  {
    key: 'seat', 名: ['椅', '台', '床几'], ev: 'sit',
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, lw = E.lw * P.thick;
      plate(ctx, [[x - w * 0.56, y], [x + w * 0.56, y],
        [x + w * 0.5, y + s * 0.15], [x - w * 0.5, y + s * 0.15]]);
      if (P.back) {
        const bh = s * P.tall;
        post(ctx, x - w * 0.5, y, y - bh, lw * 2, E.fix + i, true);
        post(ctx, x + w * 0.5, y, y - bh, lw * 2, E.fix + i + 1, true);
        beam(ctx, x - w * 0.46, x + w * 0.46, y - bh, lw * 2.2, E.fix + i + 2, true);
        for (let k = 1; k < P.count; k++) {
          post(ctx, x - w * 0.46 + w * 0.92 * (k / P.count), y - bh * 0.06, y - bh * 0.94, lw * 1.3, E.fix + i + 10 + k, true);
        }
      }
      for (const sg of [-1, 1]) {
        post(ctx, x + sg * w * 0.5, y + s * 0.1, y + s * 1.0, lw * 2, E.fix + i + 20 + sg, true);
        post(ctx, x + sg * w * 0.22, y + s * 0.13, y + s * 0.96, lw * 1.6, E.fix + i + 30 + sg, true);
      }
    },
    top: (P, x, y, s) => [x, y],
  },
  {
    key: 'vessel', 名: ['器', '壺', '鉢'], ev: 'break',
    draw(ctx, S, E, P, i, x, y, s) {
      bowl(ctx, x, y, s * (0.34 + P.wide * 0.2), s * (0.3 + P.tall * 0.28), P.lip, E.fix + i * 11);
      if (P.foot) plate(ctx, [[x - s * P.wide * 0.22, y], [x + s * P.wide * 0.22, y],
        [x + s * P.wide * 0.3, y + s * 0.12], [x - s * P.wide * 0.3, y + s * 0.12]]);
      if (P.count > 2) beam(ctx, x - s * P.wide * 0.5, x + s * P.wide * 0.5, y - s * P.tall * 0.92, E.lw * P.thick, E.fix + i, false);
    },
    top: (P, x, y, s) => [x, y - s * (0.3 + P.tall * 0.28) * 0.92],
  },
  {
    key: 'stair', 名: ['階', '段', '雁木'], ev: 'ascend',
    // **段は必ず面で積む。** 薄く引くと点線に見えて階段として読めなかった。
    // 1段の高さは幅の 0.5〜0.9 倍に収める（細長い段は縞になる）
    draw(ctx, S, E, P, i, x, y, s) {
      const nn = Math.max(3, Math.min(7, P.count + 2));
      const w = s * (0.7 + P.wide * 0.3), h = s * (0.55 + P.tall * 0.3);
      const sw = w / nn, sh2 = h / nn;
      const x0 = x - w * 0.5;
      for (let k = 0; k < nn; k++) {
        // 蹴上げ（縦）と踏面（横）を面で置く
        plate(ctx, [[x0 + sw * k, y - sh2 * k], [x0 + sw * (k + 1), y - sh2 * k],
          [x0 + sw * (k + 1), y - sh2 * (k + 1)], [x0 + sw * k, y - sh2 * (k + 1)]]);
        plate(ctx, [[x0 + sw * k, y - sh2 * (k + 1)], [x0 + sw * (k + 1), y - sh2 * (k + 1)],
          [x0 + sw * (k + 1), y - sh2 * (k + 1) - sh2 * 0.16], [x0 + sw * k, y - sh2 * (k + 1) - sh2 * 0.16]]);
      }
    },
    top: (P, x, y, s) => [x + s * (0.7 + P.wide * 0.3) * 0.4,
      y - s * (0.55 + P.tall * 0.3) * 0.9],
  },
  {
    key: 'lamp', 名: ['標', '街灯', '柱'], ev: 'light',
    draw(ctx, S, E, P, i, x, y, s) {
      const h = s * P.tall, lw = E.lw * P.thick;
      post(ctx, x, y, y - h, lw * 2.2, E.fix + i, true);
      disc(ctx, x, y - h - s * 0.08, s * 0.1 * P.wide, E.fix + i + 3);
      if (P.count > 1) {
        for (let k = 1; k < P.count; k++) {
          const yy = y - h * (k / P.count);
          beam(ctx, x, x + s * 0.2 * (k % 2 ? 1 : -1), yy, lw * 1.2, E.fix + i + k, true);
        }
      }
    },
    top: (P, x, y, s) => [x, y - s * P.tall],
  },
  {
    key: 'gate', 名: ['門', '橋', '拱'], ev: 'pass',
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, h = s * P.tall, lw = E.lw * P.thick;
      post(ctx, x - w * 0.5, y, y - h * 0.6, lw * 2.4, E.fix + i, true);
      post(ctx, x + w * 0.5, y, y - h * 0.6, lw * 2.4, E.fix + i + 1, true);
      arc(ctx, x, y - h * 0.6, w * 0.5, Math.PI, TAU, lw * 2.2, E.fix + i + 2);
      if (P.cap) beam(ctx, x - w * 0.62, x + w * 0.62, y - h, lw * 2.6, E.fix + i + 3, true);
      if (P.count > 2) {
        for (let k = 1; k < P.count; k++) {
          post(ctx, x - w * 0.5 + w * (k / P.count), y, y - h * 0.34, lw, E.fix + i + 10 + k, true);
        }
      }
    },
    top: (P, x, y, s) => [x, y],
  },
  {
    key: 'canopyTree', 名: ['傘', '木', '笠'], ev: 'turn',
    // **柄を必ず笠より長く取る。** 短いと笠だけの塊に見えて傘として読めない
    draw(ctx, S, E, P, i, x, y, s) {
      const h = s * (0.7 + P.tall * 0.5), lw = E.lw * P.thick;
      const r = s * (0.3 + P.wide * 0.22);
      post(ctx, x, y, y - h, lw * 1.8, E.fix + i, true);
      canopy(ctx, x, y - h, r, Math.max(4, P.count + 3), E.fix + i + 5);
      // 石突き（先の曲がり）。これがあると傘だと分かる
      if (P.foot) brush(ctx, [[x, y], [x + s * 0.12, y - s * 0.02]], lw * 1.6, E.fix + i + 9, false);
    },
    top: (P, x, y, s) => [x, y - s * (0.7 + P.tall * 0.5)],
  },
  {
    key: 'window', 名: ['窓', '枠', '格子'], ev: 'open',
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, h = s * P.tall, lw = E.lw * P.thick;
      frame(ctx, x - w * 0.5, y - h, x + w * 0.5, y, lw * 1.6, E.fix + i, P.count);
      if (P.solid) {
        for (let k = 1; k < Math.max(2, P.count - 1); k++) {
          beam(ctx, x - w * 0.5, x + w * 0.5, y - h * (k / Math.max(2, P.count - 1)), lw, E.fix + i + 30 + k, true);
        }
      }
    },
    top: (P, x, y, s) => [x, y],
  },
  {
    key: 'fence', 名: ['柵', '櫛', '列'], ev: 'fall',
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, h = s * P.tall, lw = E.lw * P.thick;
      teeth(ctx, x - w * 0.5, x + w * 0.5, y, h, Math.max(3, P.count * 2), lw * 1.6, E.fix + i);
      if (P.cap) beam(ctx, x - w * 0.5, x + w * 0.5, y - h * 0.82, lw * 1.4, E.fix + i + 40, true);
    },
    top: (P, x, y, s) => [x, y - s * P.tall],
  },
  {
    key: 'sail', 名: ['帆', '旗', '幟'], ev: 'flap',
    draw(ctx, S, E, P, i, x, y, s) {
      const h = s * P.tall, lw = E.lw * P.thick;
      post(ctx, x, y, y - h, lw * 1.8, E.fix + i, true);
      const dir = P.flip ? -1 : 1;
      const bulge = Math.sin(E.p * TAU + i) * s * 0.08 * P.wide;
      plate(ctx, [[x, y - h * 0.96], [x + dir * s * P.wide * 0.7 + bulge, y - h * 0.62],
        [x, y - h * 0.24]]);
    },
    top: (P, x, y, s) => [x, y - s * P.tall],
  },
  {
    key: 'well', 名: ['井', '筒', '桶'], ev: 'draw',
    // **胴は角のある箱。** ふくらませると卵に見えて、井戸として読めなかった
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * (0.4 + P.wide * 0.35), h = s * (0.28 + P.tall * 0.22), lw = E.lw * P.thick;
      plate(ctx, [[x - w * 0.5, y - h], [x + w * 0.5, y - h],
        [x + w * 0.46, y], [x - w * 0.46, y]]);
      // 口の縁（横一本）。これで「中が空いている筒」になる
      beam(ctx, x - w * 0.54, x + w * 0.54, y - h, lw * 1.8, E.fix + i + 50, true);
      if (P.cap) {
        const ph = s * 0.62;
        post(ctx, x - w * 0.42, y - h, y - h - ph, lw * 1.6, E.fix + i, true);
        post(ctx, x + w * 0.42, y - h, y - h - ph, lw * 1.6, E.fix + i + 1, true);
        beam(ctx, x - w * 0.54, x + w * 0.54, y - h - ph, lw * 2, E.fix + i + 2, true);
        thread(ctx, x, y - h - ph * 0.96, y - h - s * 0.1, lw, E.fix + i + 3, s * 0.02);
      }
    },
    top: (P, x, y, s) => [x, y - s * P.tall * 0.5],
  },
  {
    key: 'wave', 名: ['波', '丘', '堤'], ev: 'swallow',
    draw(ctx, S, E, P, i, x, y, s) {
      // 画面いっぱいの帯。1つで景を作る（数は1）
      const pts = [];
      const n = 48;
      const amp = S.h * 0.1 * P.tall;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        pts.push([S.w * u, y - Math.sin(u * Math.PI * P.count + E.p * TAU * 0.5) * amp]);
      }
      pts.push([S.w, S.h], [0, S.h]);
      curved(ctx, pts);
    },
    // **枠（S）は引数で受け取ること。** ここだけ外の `S` を見ていて、
    // 波（丘・堤）の作品が固有の事に入った瞬間に
    // `ReferenceError: S is not defined` で頁ごと落ちていた（実際に落ちた）。
    // 波は画面いっぱいの帯なので、中心は枠の真ん中に取る。
    top: (P, x, y, s, S) => [S.w * 0.5, y],
  },
  {
    key: 'swarm', 名: ['群', '粒', '雲'], ev: 'drop',
    draw(ctx, S, E, P, i, x, y, s) {
      grains(ctx, x, y - s * 0.3, s * P.wide * 0.6, Math.max(8, P.count * 12), s * 0.035 * P.thick, E.fix + i * 31);
    },
    top: (P, x, y, s) => [x, y - s * 0.3],
  },
  {
    key: 'thread', 名: ['糸', '簾', '雨'], ev: 'untie',
    draw(ctx, S, E, P, i, x, y, s) {
      const w = s * P.wide, h = s * P.tall, lw = E.lw * P.thick;
      const n = Math.max(4, P.count * 3);
      for (let k = 0; k < n; k++) {
        const xx = x - w * 0.5 + w * (k / (n - 1));
        thread(ctx, xx, y - h, y, lw * 0.8, E.fix + i * 17 + k, s * 0.04);
      }
      if (P.cap) beam(ctx, x - w * 0.52, x + w * 0.52, y - h, lw * 1.6, E.fix + i, true);
    },
    top: (P, x, y, s) => [x, y - s * P.tall],
  },
];

// ---- 固有の事 --------------------------------------------------------
// **その物にしか起きないこと。** 骨格が決める。
function drawOwn(ctx, S, E, F, i, x, y, s) {
  const put = (fn) => { ctx.save(); ctx.fillStyle = E.col.i; ctx.beginPath(); fn(); ctx.fill(); ctx.restore(); };
  const P = F.P, ev = SKELETONS[F.sk].ev;
  const [tx, ty] = SKELETONS[F.sk].top(P, x, y, s, S);
  const u = E.ep;
  if (ev === 'sit') human(ctx, S, E, tx, ty, s * 0.55, u > 0.5 ? 'sit' : 'walk');
  else if (ev === 'climb' || ev === 'ascend') {
    human(ctx, S, E, tx, ty + s * P.tall * (1 - clamp(u, 0, 0.9)) * 0.8, s * 0.42, 'walk');
  } else if (ev === 'break') {
    // 口から中身が出る
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      const d = u * s * 0.5 * (0.5 + nz01(E.fix + k * 7));
      put(() => pDisc(ctx, tx + Math.cos(a) * d, ty + Math.sin(a) * d - u * s * 0.2, s * 0.03, E.fix + k));
    }
  } else if (ev === 'light' || ev === 'open') {
    put(() => pDisc(ctx, tx, ty, s * 0.1 * (0.4 + u * 1.6), E.fix + i));
  } else if (ev === 'pass') {
    human(ctx, S, E, x - s * P.wide * 0.5 + s * P.wide * u, y, s * 0.4, 'walk');
  } else if (ev === 'turn' || ev === 'flap') {
    // 裏返る／はためく
    ctx.save();
    ctx.translate(tx, ty); ctx.rotate(Math.sin(u * TAU) * 0.5); ctx.translate(-tx, -ty);
    put(() => canopy(ctx, tx, ty, s * 0.3 * (1 - u * 0.4), 5, E.fix + i));
    ctx.restore();
  } else if (ev === 'fall') {
    // 列から一つだけ倒れる
    const k = Math.floor(nz01(E.fix + 5) * Math.max(3, P.count * 2));
    const w = s * P.wide;
    const xx = x - w * 0.5 + w * ((k + 0.5) / Math.max(3, P.count * 2));
    ctx.save();
    ctx.translate(xx, y); ctx.rotate(u * 1.3); ctx.translate(-xx, -y);
    put(() => post(ctx, xx, y, y - s * P.tall, E.lw * P.thick * 1.6, E.fix + k, true));
    ctx.restore();
  } else if (ev === 'draw') {
    put(() => thread(ctx, tx, ty, ty + s * P.tall * u * 0.8, E.lw, E.fix + i, s * 0.02));
    if (u > 0.6) put(() => bowl(ctx, tx, ty + s * P.tall * u * 0.8, s * 0.16, s * 0.12, 0.7, E.fix + i));
  } else if (ev === 'swallow') {
    put(() => pDisc(ctx, S.w * (0.2 + 0.6 * u), y - S.h * 0.02, s * 0.06 * (1 - u * 0.7), E.fix + i));
  } else if (ev === 'drop') {
    for (let k = 0; k < 6; k++) {
      put(() => pDisc(ctx, tx + (nz01(E.fix + k * 11) - 0.5) * s, ty + u * s * (0.6 + nz01(E.fix + k) * 0.8), s * 0.03, E.fix + k));
    }
  } else if (ev === 'untie') {
    const w = s * P.wide;
    for (let k = 0; k < 3; k++) {
      const xx = x - w * 0.4 + w * 0.4 * k;
      put(() => thread(ctx, xx, y - s * P.tall, y + u * s * 0.5, E.lw, E.fix + k, s * 0.12 * u));
    }
  } else {
    human(ctx, S, E, tx, ty, s * 0.45, 'crouch');
  }
}

// ---- 1本ぶんの図を組む -----------------------------------------------
// 骨格を選び、寸法・数・向き・有無を振る。**同じ骨格でも別の物になる。**
export function makeForm(rng, skIndex) {
  const sk = skIndex === undefined
    ? Math.floor(rng() * SKELETONS.length) : (skIndex % SKELETONS.length);
  const S0 = SKELETONS[sk];
  const P = {
    wide: 0.5 + rng() * 1.3,
    tall: 0.5 + rng() * 1.6,
    thick: 0.6 + rng() * 1.5,
    count: 1 + Math.floor(rng() * 5),
    back: rng() < 0.6,
    cap: rng() < 0.5,
    foot: rng() < 0.5,
    flip: rng() < 0.5,
    solid: rng() < 0.55,
    lip: 0.45 + rng() * 0.45,
  };
  const name = S0.名[Math.floor(rng() * S0.名.length)];
  return { sk, key: S0.key, name, ev: S0.ev, P };
}

// 何個置くか（骨格ごとの上下限）
// **物の大きさに合う数にすること。** 階を4つ置いたら、画面に細かい段が
// 斜めに散って「点線」に見えた（実際に見えた）。大きい物は少なく。
export const RANGE = {
  tower: [1, 4], seat: [1, 9], vessel: [1, 6], stair: [1, 2], lamp: [1, 8],
  gate: [1, 3], canopyTree: [1, 8], window: [1, 4], fence: [1, 2], sail: [1, 5],
  well: [1, 3], wave: [1, 1], swarm: [1, 3], thread: [1, 3],
};

// ---- 描く ------------------------------------------------------------
// `motif.js` の図と同じ呼びかた。奥ほど小さく、手前ほど大きい。
export function drawForm(ctx, S, E, F) {
  const sh = E.sh;
  const S0 = SKELETONS[F.sk];
  const n = Math.max(1, Math.min(sh.n, (RANGE[F.key] || [1, 8])[1]));
  const tq = E.f / E.fps;
  // **大きさは数から決める。** 1つなら画面の半分近く、たくさんなら小さく。
  // 奥行きの揺れは 0.8〜1.15 倍に留める。**これを掛けすぎると豆粒になる**
  // （最初に書いたとき dep*dep を掛けて、14の形が全部かすみのような点になった）。
  // **画面を担える大きさにすること。** 小さくすると余白ではなく「無い」になる。
  const base = clamp(0.95 / Math.sqrt(n), 0.18, 0.58) * (0.9 + sh.k1 * 0.25);
  for (let i = 0; i < n; i++) {
    const big = n === 1;
    const dep = big ? 1 : 0.8 + nz01(E.fix + i * 19) * 0.35;
    const s = S.h * base * dep;
    // **枠の中に収める。** 広げすぎると半分が枠外に出て、物が読めなくなった
    const x = big ? S.w * (0.5 + sh.ox * 0.18)
      : S.w * (0.5 + (((i + 0.5) / n) - 0.5) * (n === 2 ? 0.52 : 0.76)
        + (nz01(E.fix + i * 7) - 0.5) * 0.06);
    const y = big ? S.h * (0.76 + sh.oy * 0.08)
      : S.h * (0.62 + (dep - 0.95) * 0.5) + Math.sin(step(tq * 0.9 + i, 8)) * S.h * 0.004;
    // **必ず `E.ink.body()` を通す。** 自分で塗ると地の色で塗られて図が消え、
    // 塗りかたの手（塗る・線だけ・刻む・点で打つ）も効かない
    E.ink.body(() => S0.draw(ctx, S, E, F.P, i, x, y, s));
    if (E.own) drawOwn(ctx, S, E, F, i, x, y, s);
  }
}

export const FORM_KEYS = SKELETONS.map((x) => x.key);
export const FORM_COUNT = SKELETONS.length;

// ---- 役ごとに向く骨格 -------------------------------------------------
// 番号は SKELETONS の並び。**並びを変えないこと**（過去の種の作品が変わる）。
//   tower0 seat1 vessel2 stair3 lamp4 gate5 canopyTree6 window7
//   fence8 sail9 well10 wave11 swarm12 thread13
// 序（問いを置く）… 見えているのに何のためか分からない物
export const OPENING_FORMS = [10, 5, 7, 4, 2, 3, 0];   // 井・門・窓・標・器・階・櫓
// 第一主題（動）… 動きが出る物
export const MOVING_FORMS = [11, 12, 13, 9, 6];        // 波・群・糸・帆・傘
// 第二主題（静）… 据わっている物
export const STILL_FORMS = [1, 2, 0, 3, 7, 8, 10, 4, 5];
