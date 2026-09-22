// 手（paint）— 描き方の語彙。
//
// ここには「何を描くか」は無い。あるのは**どう描くか**だけ。
// 形は motif.js、順番は score.js、進行は film.js が持つ。
//
// この版の要点は3つある。第一版（体積レイマーチ）を捨てた理由でもある。
//
//   1. 線は必ず揺れる。定規で引いた線は、見た瞬間に機械が描いたと分かる。
//      `wob()` が座標を毎フレーム別の乱数でずらし、`brush()` が
//      太さを変えながら塗る。これが「AI感・IT感」を殺す一番効く道具。
//   2. 絵は飛び飛びの時刻で描く（コマ打ち）。12コマ／8コマ。
//      なめらかに動かすと CG になる。段で動かすと絵になる。
//   3. 色は混ぜない。原色を面で置く。グラデーションを禁じている
//      （基軸「彩」。溶かした瞬間に退屈になる、と依頼者に3回言われた）。

// ---- 決まった乱数（座標の揺れ・粒） ----------------------------------
// rng.js の乱数は「譜を組む」ための流れ。こちらは「同じ入力なら同じ値」が
// 要る場所（描画）に使う。番号を渡すと -1〜1 が返る。
// **必ず Math.imul で混ぜること。** 素朴に n*n*15731 と書くと、
// n が 2^26 あたりを超えた時点で倍精度の桁が足りなくなり、
// ハッシュが潰れて同じ値ばかり返す。実際にそれをやって、
// 線の揺れも雨の配置も死んでいた（＝定規で引いた絵になっていた）。
export function nz(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}
export function nz01(n) { return (nz(n) + 1) * 0.5; }
// 番号の並びを滑らかにつないだもの（揺れが尖りすぎないように）
export function snz(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = nz(i * 1973 + seed), b = nz((i + 1) * 1973 + seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, u) => a + (b - a) * u;

// ---- 色 ---------------------------------------------------------------
// 混色しない。面で置く原色の組を手で選んである。
// 「地・図・差し色・光」の4つで1組。図と地を入れ替えると反転になる。
export const PALETTES = [
  { n: '朱',   g: '#0a0a0c', i: '#ff2d0a', a: '#ffc400', l: '#fff2df' },
  { n: '藍',   g: '#0d1a8c', i: '#ff3366', a: '#00e0c8', l: '#ffe9b0' },
  { n: '菜',   g: '#ffd400', i: '#2a0a5e', a: '#ff2d8a', l: '#ffffff' },
  { n: '苔',   g: '#04140c', i: '#00ff88', a: '#ff0055', l: '#d9ffe9' },
  { n: '墨',   g: '#f2efe6', i: '#0a0a0a', a: '#e02020', l: '#ffffff' },
  { n: '橙',   g: '#ff5a00', i: '#001a5e', a: '#00d0ff', l: '#fff0cc' },
  { n: '桃',   g: '#ff2f92', i: '#062b2b', a: '#7cff00', l: '#ffffff' },
  { n: '菫',   g: '#2a0044', i: '#ff9e00', a: '#00b3ff', l: '#ffd9f2' },
  { n: '緋',   g: '#e6120f', i: '#fbf7ef', a: '#12121a', l: '#ffd21f' },
  { n: '深',   g: '#00060f', i: '#2a7cff', a: '#ff4d00', l: '#cfe8ff' },
  { n: '土',   g: '#c8a06a', i: '#241206', a: '#e04a00', l: '#fff3d6' },
  { n: '極',   g: '#0b0b0b', i: '#ff00a8', a: '#00ffd0', l: '#ffe600' },
];

// ---- その作品のための配色を作る ---------------------------------------
// **配色も棚から選ばない。** 12組から選んでいたので、1000種のうち素材が
// 一切かぶらない作品は122本しかなかった（いちばんの制約が配色だった）。
// 依頼者「毎回1から全く違うものを作って、過去の素材の使い回しはしないこと」。
//
// **ただし「原色を面で置く」は哲学なので動かさない。**
// だから作るのは「彩度を振り切った色相を、離して2〜3つ」＋「黒に近い／白に近い一色」。
// 濁った中間色は作らない（混色しない、という線）。
function rawPalette(rng) {
  const H = () => rng();
  // 色相を大きく離して取る（近い色を並べると断が消える）
  const h0 = H();
  const gap = 0.24 + rng() * 0.2;
  const h1 = (h0 + gap + (rng() < 0.5 ? 0 : 0.5)) % 1;
  const h2 = (h1 + gap * (0.8 + rng() * 0.6)) % 1;
  // 彩度と明度は振り切る（原色）。黒に近い／白に近いを1つ混ぜる
  const vivid = (h, v) => hsv2hex(h, 0.92 + rng() * 0.08, v);
  const dark = hsv2hex(h0, 0.5 + rng() * 0.45, 0.06 + rng() * 0.08);
  const light = hsv2hex(h1, 0.02 + rng() * 0.1, 0.95 + rng() * 0.05);
  const bright = [vivid(h0, 0.95 + rng() * 0.05), vivid(h1, 0.9 + rng() * 0.1),
    vivid(h2, 0.88 + rng() * 0.12)];
  // 地は「暗い／明るい／原色」のどれか。図は地から遠いものを取る
  const kind = Math.floor(rng() * 3);
  const g = kind === 0 ? dark : kind === 1 ? light : bright[0];
  const rest = kind === 2 ? [bright[1], bright[2], dark, light] : bright.concat([kind === 0 ? light : dark]);
  const i = rest[0], a = rest[1], l = rest[2] || light;
  return { n: '生', g, i, a, l };
}

// **どの `shade`／`inv` でも図と地が立っていること**を確かめてから返す。
// 法「彩」は `|明度の差| > 0.25 または 色相の隔たり > 0.3` を要求している。
// 確かめずに返していて、種138 が「図と地が立っている景が 50%」で落ちた。
// **作る側で保証すること**（譜の側で振り直すと、主題の中で色が動いてしまう）。
export function makePalette(rng) {
  for (let g = 0; g < 40; g++) {
    const p = rawPalette(rng);
    let ok = true;
    for (const sh of [0, 1, 2]) {
      for (const inv of [false, true]) {
        const c = colorsOf({ pal: 0, shade: sh, inv, pals: [p] });
        if (!(Math.abs(lumOf(c.g) - lumOf(c.i)) > 0.3 || hueGap(c.g, c.i) > 0.36)) { ok = false; break; }
      }
      if (!ok) break;
    }
    // **白に近い色と赤を同じ組に入れない。** 層「日」の円がその赤を拾うと、
    // 生成りの地に赤い丸＝日の丸になる（狙っていない型が乗る。禁）。
    // 譜の側に後始末をさせると、層を作品の頭から終わりまで同じに保てない。
    // **作る側で起きないようにするのが正しい。**
    if (ok) {
      const slots = [p.g, p.i, p.a, p.l];
      const white = slots.some((h) => { const x = hsOf(h); return x.v > 0.9 && x.s < 0.12; });
      const red = slots.some((h) => {
        const x = hsOf(h);
        return x.s > 0.55 && x.v > 0.55 && (x.h < 0.055 || x.h > 0.945);
      });
      if (white && red) ok = false;
    }
    if (ok) return p;
  }
  // 40回で決まらなければ、確実に立つ組を返す（黒地・原色の図）
  return { n: '生', g: '#08080c', i: '#ff2d0a', a: '#ffd400', l: '#f6f2ea' };
}
function hsv2hex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    const x = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(Math.max(0, Math.min(1, x)) * 255);
  };
  const [r, g, b] = [f(5), f(3), f(1)];
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function hex2rgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
// 色相（0〜1）と彩度。譜の検査（法「彩」）が使う
export function hsOf(h) {
  const [r, g, b] = hex2rgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d > 1e-6) {
    if (mx === r) hue = ((g - b) / d + 6) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue /= 6;
  }
  return { h: hue, s: mx < 1e-6 ? 0 : d / mx, v: mx };
}
export function hueGap(a, b) {
  const d = Math.abs(hsOf(a).h - hsOf(b).h) % 1;
  return Math.min(d, 1 - d) * 2;   // 0〜1（1 が正反対）
}
export function lumOf(h) {
  const [r, g, b] = hex2rgb(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// 景（shot）の色。
//   inv   … 図と地を入れ替える
//   shade … 同じ組のまま、どの色を地にするかを替える
//           （調を変えずに和音だけ替えるのと同じこと。
//            主題の中で色を保ったまま、画面だけ変えられる）
// **その作品の配色表**。譜（score.js）が作品ごとに作って渡す。
// 渡されていなければ手で選んだ12組を引く（過去の種と下見のため）。
let WORK_PALETTES = null;
export function setPalettes(list) { WORK_PALETTES = (list && list.length) ? list : null; }
export function palettes() { return WORK_PALETTES || PALETTES; }

export function colorsOf(shot) {
  const P = (shot && shot.pals) ? shot.pals : palettes();
  const p = P[shot.pal % P.length];
  const sh = shot.shade | 0;
  let g = p.g, i = p.i, a = p.a, l = p.l;
  if (sh === 1) { g = p.a; i = p.g; a = p.i; }
  else if (sh === 2) { g = p.l; i = p.g; a = p.i; l = p.a; }
  if (shot.inv) { const t = g; g = i; i = t; }
  return { name: p.n, g, i, a, l, raw: p };
}

// ---- 線と形 -----------------------------------------------------------
// 点列を揺らす。seed を毎コマ変えると線が沸く（boil）。
export function wob(pts, amp, seed) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    out[i] = [
      pts[i][0] + snz(i * 0.7, seed) * amp,
      pts[i][1] + snz(i * 0.7 + 31.7, seed) * amp,
    ];
  }
  return out;
}

// 太さの変わる線を「塗り」で描く。ctx.stroke() の均一な線は機械の線に見える。
export function brush(ctx, pts, w, seed, taper = true) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const u = n > 1 ? i / (n - 1) : 0.5;
    const k = taper ? Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.45) : 1;
    const ww = w * 0.5 * k * (0.82 + 0.36 * nz01(seed + i * 13));
    L.push([pts[i][0] - dy * ww, pts[i][1] + dx * ww]);
    R.push([pts[i][0] + dy * ww, pts[i][1] - dx * ww]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

// 点列から滑らかな閉じた道を作る（中点を通る二次曲線でつなぐ）
export function path(ctx, pts, closed = true) {
  const n = pts.length;
  if (n < 2) return;
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  if (closed) ctx.closePath();
}

// 中心から半径の列で作る、揺れた閉曲線（卵・塊・雲・炎の根）
export function blob(cx, cy, rs, seed, amp) {
  const n = rs.length, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = rs[i] * (1 + snz(i * 0.9, seed) * amp);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ---- 地（背景） -------------------------------------------------------
// グラデーションを使わない。面で割る。
export function ground(ctx, S, shot, col, seed) {
  const k = shot.gk;
  ctx.fillStyle = col.g;
  ctx.fillRect(0, 0, S.w, S.h);
  if (k === 0) return;                       // 一色
  ctx.fillStyle = shot.g2 ? col.a : col.i;
  if (k === 1) {                             // 斜めに割る
    const a = shot.ga, ca = Math.cos(a), sa = Math.sin(a);
    const cx = S.w * shot.gx, cy = S.h * shot.gy, D = S.w + S.h;
    ctx.beginPath();
    ctx.moveTo(cx - ca * D, cy - sa * D);
    ctx.lineTo(cx + ca * D, cy + sa * D);
    ctx.lineTo(cx + ca * D - sa * D, cy + sa * D + ca * D);
    ctx.lineTo(cx - ca * D - sa * D, cy - sa * D + ca * D);
    ctx.closePath(); ctx.fill();
  } else if (k === 2) {                      // 地平の帯
    const y = S.h * shot.gy, hgt = S.h * (0.06 + 0.3 * shot.gx);
    ctx.fillRect(0, y, S.w, hgt);
  } else if (k === 3) {                      // 円（日・月・穴）
    ctx.beginPath();
    const pts = blob(S.w * shot.gx, S.h * shot.gy, new Array(48).fill(S.h * (0.14 + 0.36 * shot.ga / TAU)), seed, 0.012);
    path(ctx, pts); ctx.fill();
  } else if (k === 4) {                      // 太い縞（幅は不揃いにする。
    // 等間隔に割るとテストパターンに見えて、一気に「IT の画面」になる）
    const n = 3 + (shot.gn % 5);
    let x = 0;
    for (let i = 0; i < n * 2; i++) {
      const w = S.w / n * (0.35 + nz01(seed + i * 37) * 0.9);
      if (i % 2 === 0) ctx.fillRect(x, 0, w, S.h);
      x += w;
      if (x > S.w) break;
    }
  } else if (k === 5) {                      // 隅の楔
    ctx.beginPath();
    ctx.moveTo(0, S.h * shot.gy); ctx.lineTo(S.w * shot.gx, 0);
    ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(S.w, S.h * (1 - shot.gy)); ctx.lineTo(S.w * (1 - shot.gx), S.h);
    ctx.lineTo(S.w, S.h); ctx.closePath(); ctx.fill();
  }
}

// ---- 塗りかた（手） ---------------------------------------------------
// 同じ形でも、塗るか・線だけか・刻むか・点で打つかで別の絵になる。
// これが「同一時刻の画面内コントラスト」の一番安い作り方。
function hatchClip(ctx, S, color, ang, gap, seed, w) {
  ctx.save(); ctx.clip();
  ctx.fillStyle = color;
  const ca = Math.cos(ang), sa = Math.sin(ang), D = (S.w + S.h) * 1.2;
  const n = Math.ceil(D / gap);
  for (let i = -n; i <= n; i++) {
    const ox = -sa * i * gap + S.w / 2, oy = ca * i * gap + S.h / 2;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const u = (j / 8 - 0.5) * D;
      pts.push([ox + ca * u + snz(j * 0.8, seed + i * 7) * w * 0.9,
                oy + sa * u + snz(j * 0.8 + 11, seed + i * 7) * w * 0.9]);
    }
    brush(ctx, pts, w, seed + i * 101, false);
  }
  ctx.restore();
}
function stippleClip(ctx, S, color, dens, seed, r) {
  ctx.save(); ctx.clip();
  ctx.fillStyle = color;
  const n = Math.floor(dens);
  for (let i = 0; i < n; i++) {
    const x = nz01(seed + i * 3 + 1) * S.w, y = nz01(seed + i * 7 + 5) * S.h;
    const rr = r * (0.4 + nz01(seed + i * 11) * 1.3);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// 図を置く道具。motif.js はこれしか触らない。
export function makeInk(ctx, S, shot, col, E) {
  const hand = shot.hand;
  const lw = E.lw;
  // 縁取り。**引き直してから縁を取ること。**
  // Canvas の「いまの path」は save/restore では戻らないので、
  // 刻む・点で打つの中で beginPath されると、そのあとの stroke は
  // 刻み線や点を縁取ってしまい、**形の輪郭が1本も出ない**（実際に出ていなかった。
  // 壺を点で打った景が、輪郭を失って赤い点の塊になっていた）。
  function outline(pathFn, c, w) {
    ctx.beginPath(); pathFn();
    ctx.save(); ctx.clip();
    ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke();
    ctx.restore();
  }
  function body(pathFn, color) {
    const c = color || col.i;
    ctx.save();
    ctx.beginPath(); pathFn();
    if (hand === 1) {                       // 線だけ
      ctx.fillStyle = c;
      ctx.save(); ctx.clip();
      // 輪郭を内側から塗り潰さずに縁取る（clip の縁を太らせる）
      ctx.lineWidth = lw * 2.4; ctx.strokeStyle = c; ctx.stroke();
      ctx.restore();
    } else if (hand === 2) {                // 刻む（銅版画）
      hatchClip(ctx, S, c, shot.hang, lw * (2.4 + shot.hgap * 5), E.seed, lw * 0.5);
      outline(pathFn, c, lw * 2.2);
    } else if (hand === 3) {                // 点で打つ
      stippleClip(ctx, S, c, 2600, E.seed, lw * 0.9);
      outline(pathFn, c, lw * 1.8);
    } else {                                // 塗る
      ctx.fillStyle = c; ctx.fill();
    }
    ctx.restore();
  }
  function solid(pathFn, color) {
    ctx.save(); ctx.beginPath(); pathFn();
    ctx.fillStyle = color || col.a; ctx.fill(); ctx.restore();
  }
  function line(pts, w, color) {
    ctx.save(); ctx.fillStyle = color || col.i;
    brush(ctx, pts, w, E.seed + Math.floor(pts[0][0]), true);
    ctx.restore();
  }
  return { body, solid, line, lw };
}

// ---- 粒（紙のざらつき） -----------------------------------------------
// 小さな板を何枚か焼いておいて、コマごとに取り替えて敷く。
// 毎フレーム全画素に雑音を書くと重い。板を回すだけなら只同然で、
// しかも**毎コマ変わる＝沸く**ので、止まっている画でも生きて見える。
export function makeGrain(make, n = 6, size = 180) {
  const tiles = [];
  for (let k = 0; k < n; k++) {
    const c = make(size, size);
    const g = c.getContext('2d');
    const im = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = nz01(k * 99991 + i * 7 + 13);
      const a = v > 0.62 ? (v - 0.62) * 300 : 0;
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v > 0.8 ? 255 : 0;
      im.data[i * 4 + 3] = a;
    }
    g.putImageData(im, 0, 0);
    tiles.push(c);
  }
  return function grain(ctx, S, amount, frame) {
    if (amount <= 0) return;
    const t = tiles[((frame % n) + n) % n];
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = 'overlay';
    const p = ctx.createPattern(t, 'repeat');
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, S.w, S.h);
    ctx.restore();
  };
}
