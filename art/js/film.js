// 映写（film）— 譜を時計で引いて、1枚の絵にする。
//
// ここに美の判断は置かない。置いてあるのは「どう段で動かすか」だけ。
// 何を描くかは motif.js、どの順かは score.js にある。
//
// 段で動かす理由: なめらかに動かすと CG になる。
// 絵は 8／12／24 コマで打ち、そのコマの時刻でだけ図を描く。
// 24fps で書き出しても、12コマ打ちの景は 2枚ずつ同じ絵になる。
// これが「早期アニメーション」の呼吸で、同時に**時間の上のコントラスト**にもなる
// （速い景と遅い景が、同じ秒数でも別の速さに見える）。

import { shotAt } from './score.js';
import { MOTIFS, NAMES, ownEvent } from './motif.js';
import { PIXEL, evTransform, evOverlay, evComposite } from './event.js';
import { drawLayer, layerPhase } from './layer.js';
import { colorsOf, ground, makeInk, makeGrain, nz, nz01, snz, clamp, TAU } from './paint.js';

// 作品の枠は 1600×900 の論理座標。出力の大きさによらず同じ構図になる。
export const STAGE = { w: 1600, h: 900 };

// 画面そのものの動き（寄り・流し・揺れ・傾き）。すべて段で刻む。
// **段の数は景の長さから決める。** 固定の段数にすると、長い景では
// 0.5秒のあいだ一度も段が変わらず、実測で「静止画に見える」に落ちる
// （8.2秒の景が 0.5秒で 0.17% しか動かなかった）。0.3秒に一度は必ず動かす。
function camera(g, S, sh, p, seed = 0) {
  const NS = Math.max(8, Math.min(72, Math.round(sh.dur / 0.3)));
  const q = (v, n) => Math.round(v * n) / n;
  g.translate(S.w / 2, S.h / 2);
  if (sh.mv === 1) g.scale(1 + q(p, NS) * sh.mvA * 0.55, 1 + q(p, NS) * sh.mvA * 0.55);
  else if (sh.mv === 2) g.translate(q(p, NS) * sh.mvA * S.w * 0.28 * (sh.ox > 0 ? 1 : -1), 0);
  else if (sh.mv === 3) g.translate(nz(seed + 3) * sh.mvA * S.h * 0.035, nz(seed + 5) * sh.mvA * S.h * 0.035);
  else if (sh.mv === 4) g.rotate(q(p, NS) * sh.mvA * 0.26 * (sh.oy > 0 ? 1 : -1));
  g.translate(-S.w / 2, -S.h / 2);
}

export function createFilm(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return null;
  const grain = makeGrain((w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  });
  const st = { w: 0, h: 0, dpr: 1, shot: 0, name: '', fps: 0, ms: 0 };

  // 事（崩・組・溶・殖・落）のための板。図だけをここに描いてから、
  // 割ったり落としたりする。地は本体に描くので巻き込まれない。
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  function resize(w, h, dpr) {
    const d = Math.min(dpr || 1, 2);
    canvas.width = Math.max(2, Math.round(w * d));
    canvas.height = Math.max(2, Math.round(h * d));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    buf.width = canvas.width; buf.height = canvas.height;
    st.w = canvas.width; st.h = canvas.height; st.dpr = d;
  }

  // 事がどこまで進んだか。
  //   evAt >= 0 … その段で止めて、少しだけ進める
  //               （展開部で、断ごとに事が一段ずつ進むようにするため）
  //   evAt <  0 … 景の中で ev0〜ev1 のあいだに起きる
  function evPhase(sh, p) {
    if (!sh.ev) return 0;
    if (sh.evAt !== undefined && sh.evAt >= 0) return clamp(sh.evAt + p * 0.12, 0, 1);
    const a = sh.ev0 === undefined ? 0.12 : sh.ev0;
    const b = sh.ev1 === undefined ? 0.95 : sh.ev1;
    return clamp((p - a) / Math.max(0.05, b - a), 0, 1);
  }

  function draw(work, t) {
    const i = shotAt(work, Math.max(0, Math.min(t, work.total - 1e-4)));
    // **絶対時刻も渡す。** 層（断をまたいで続くもの）は景のローカル時間では
    // 切れてしまうので、作品の頭からの時刻で動かす
    drawShot(work.shots[i], Math.max(0, t - work.shots[i].start), t);
    st.shot = i;
  }

  function drawShot(sh, local, abs) {
    const t0 = performance.now();
    const S = STAGE;
    const p = clamp(local / sh.dur, 0, 1);
    // 断片（展開部）— 図の位相のうち p0〜p1 の窓だけを見せる。
    // 主題を切り刻んで出すための仕掛けで、窓は譜の側が決める。
    const p0 = sh.p0 === undefined ? 0 : sh.p0, p1 = sh.p1 === undefined ? 1 : sh.p1;
    const pm = p0 + (p1 - p0) * p;
    // 窓ごとに時刻をずらす（同じ断片が毎回同じ絵にならないように）
    const f = Math.floor((local + p0 * 17) * sh.fps);
    const fix = sh.id * 104729 + 11;
    const seed = sh.id * 7919 + (sh.boil ? f * 37 : 0);

    // 色。景の中でも段で入れ替える（溶かさない＝グラデーションにしない）
    let pal = sh.pal;
    if (sh.turn >= 1 && p > sh.tp1) pal = sh.tc1;
    if (sh.turn >= 2 && p > sh.tp2) pal = sh.tc2;
    // **shade（面の割り当て）を必ず渡すこと。** 渡し忘れていて、
    // 譜が「shade を替えたから色が変わった」と思っているのに
    // 画面は1画素も変わっていなかった。法「同じ主題が続く断では
    // shade か inv を必ず替える」が画面の側で死んでいたので、
    // 版を重ねても弱い断が消えなかった（実測 8.7% → 5.3% → 5.4%）。
    let col = colorsOf({ pal, inv: sh.inv, shade: sh.shade });
    if (sh.flash && f < sh.flash) col = { name: col.name, g: col.i, i: col.g, a: col.l, l: col.a, raw: col.raw };

    const sx = st.w / S.w, sy = st.h / S.h;
    const ep = evPhase(sh, p);
    const pix = PIXEL[sh.ev | 0] === 1;

    // 地は必ず本体に描く（割れるのは図だけ）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col.g;
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.save();
    ctx.scale(sx, sy);
    // フィルムの横揺れ（ゲートウィーブ）。1〜2画素でも絵が生きる
    const weave = sh.boil ? 2.2 : 0;
    ctx.translate(nz(seed + 7) * weave, nz(seed + 13) * weave);
    // **長い景では地も一緒に動かす。** 地を釘で止めたまま図だけ流すと、
    // 面積の大半（斜めに割った地）が固まったままなので、画面が止まって見える。
    // 実測で 4.5秒の梯の景が 0.5秒に 0.66% しか変わらず「静止画」に落ちた。
    // 地は必ず col.g で全面を塗ってから形を置くので、動かしても穴は開かない。
    if (sh.gmv) camera(ctx, S, sh, p, seed);
    ground(ctx, S, sh, col, fix);
    ctx.restore();

    // 層（図の後ろに出るもの：水位・日）。
    // **景の動きを掛けない。** 層だけが動かない平面なので、
    // カットとカメラがその周りで動いていることが分かる。
    const lu = layerPhase(sh, abs === undefined ? sh.start + local : abs);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(sx, sy);
    drawLayer(ctx, S, sh, col, lu, f, false);
    ctx.restore();

    // 図を描く先。画素を触る事のときだけ別の板へ
    const g = pix ? bctx : ctx;
    if (pix) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, st.w, st.h);
    }
    g.save();
    if (pix) g.setTransform(1, 0, 0, 1, 0, 0);
    g.scale(sx, sy);
    g.translate(nz(seed + 7) * weave, nz(seed + 13) * weave);

    // 画面そのものの動き（中身は camera()）
    g.save();
    camera(g, S, sh, p, seed);
    // 余白 — 図を小さくして空きの中に寄せる。**地には掛けない**
    // （地まで縮めると枠の中に枠ができて、ただの額縁になる）
    if (sh.zoom && sh.zoom !== 1) {
      g.translate(S.w / 2, S.h / 2);
      g.scale(sh.zoom, sh.zoom);
      g.translate(-S.w / 2, -S.h / 2);
    }
    if (sh.vx || sh.vy) g.translate((sh.vx || 0) * S.w, (sh.vy || 0) * S.h);
    // 事の変形（逃・芽）は図の直前に掛ける
    evTransform(g, S, sh, ep);

    const E = {
      p: pm, f, fps: sh.fps, seed, fix, sh, col,
      lw: S.h * 0.0062 * (1 + sh.k1 * 0.8),
      ink: null, S, ep,
      own: sh.ev === 11,          // 固 — 図ごとの固有の事
    };
    E.ink = makeInk(g, S, sh, col, E);
    (MOTIFS[sh.m] || MOTIFS[0])(g, S, E);
    // 固有の事は、図と同じ座標で重ねて描く（人が椅子に座れる位置になる）
    if (E.own) ownEvent(g, S, E);
    g.restore();
    // 事の描き足し（侵・喰・来）は画面の座標で置く
    if (sh.ev && !pix) evOverlay(g, S, E, ep);
    g.restore();

    if (pix) evComposite(ctx, buf, st.w, st.h, sh, ep, seed);

    // 層（図の前に出るもの：塵・歩）。事で割られる板より後に置くので、
    // **図が崩れても層は崩れない**（層は景の出来事の外にある）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(sx, sy);
    drawLayer(ctx, S, sh, col, lu, f, true);
    ctx.restore();

    // 粒は出力の画素の上で打つ（解像度が変わっても同じ粗さ）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    grain(ctx, { w: st.w, h: st.h }, sh.grain, f + sh.id);

    st.name = NAMES[sh.m]; st.fps = sh.fps;
    st.ms = performance.now() - t0;
  }

  return { ctx, canvas, st, resize, draw, drawShot };
}
