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
import { MOTIFS, NAMES } from './motif.js';
import { colorsOf, ground, makeInk, makeGrain, nz, nz01, snz, clamp, TAU } from './paint.js';

// 作品の枠は 1600×900 の論理座標。出力の大きさによらず同じ構図になる。
export const STAGE = { w: 1600, h: 900 };

export function createFilm(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return null;
  const grain = makeGrain((w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  });
  const st = { w: 0, h: 0, dpr: 1, shot: 0, name: '', fps: 0, ms: 0 };

  function resize(w, h, dpr) {
    const d = Math.min(dpr || 1, 2);
    canvas.width = Math.max(2, Math.round(w * d));
    canvas.height = Math.max(2, Math.round(h * d));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    st.w = canvas.width; st.h = canvas.height; st.dpr = d;
  }

  function draw(work, t) {
    const i = shotAt(work, Math.max(0, Math.min(t, work.total - 1e-4)));
    drawShot(work.shots[i], Math.max(0, t - work.shots[i].start));
    st.shot = i;
  }

  function drawShot(sh, local) {
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
    let col = colorsOf({ pal, inv: sh.inv });
    if (sh.flash && f < sh.flash) col = { name: col.name, g: col.i, i: col.g, a: col.l, l: col.a, raw: col.raw };

    const sx = st.w / S.w, sy = st.h / S.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col.g;
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.save();
    ctx.scale(sx, sy);

    // フィルムの横揺れ（ゲートウィーブ）。1〜2画素でも絵が生きる
    const weave = sh.boil ? 2.2 : 0;
    ctx.translate(nz(seed + 7) * weave, nz(seed + 13) * weave);

    ground(ctx, S, sh, col, fix);

    // 画面そのものの動き。すべて段で刻む
    ctx.save();
    const q = (v, n) => Math.round(v * n) / n;
    ctx.translate(S.w / 2, S.h / 2);
    if (sh.mv === 1) ctx.scale(1 + q(p, 20) * sh.mvA * 0.55, 1 + q(p, 20) * sh.mvA * 0.55);
    else if (sh.mv === 2) ctx.translate(q(p, 16) * sh.mvA * S.w * 0.28 * (sh.ox > 0 ? 1 : -1), 0);
    else if (sh.mv === 3) ctx.translate(nz(seed + 3) * sh.mvA * S.h * 0.035, nz(seed + 5) * sh.mvA * S.h * 0.035);
    else if (sh.mv === 4) ctx.rotate(q(p, 14) * sh.mvA * 0.26 * (sh.oy > 0 ? 1 : -1));
    ctx.translate(-S.w / 2, -S.h / 2);

    const E = {
      p: pm, f, fps: sh.fps, seed, fix, sh, col,
      lw: S.h * 0.0062 * (1 + sh.k1 * 0.8),
      ink: null, S,
    };
    E.ink = makeInk(ctx, S, sh, col, E);
    (MOTIFS[sh.m] || MOTIFS[0])(ctx, S, E);
    ctx.restore();
    ctx.restore();

    // 粒は出力の画素の上で打つ（解像度が変わっても同じ粗さ）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    grain(ctx, { w: st.w, h: st.h }, sh.grain, f + sh.id);

    st.name = NAMES[sh.m]; st.fps = sh.fps;
    st.ms = performance.now() - t0;
  }

  return { ctx, canvas, st, resize, draw, drawShot };
}
