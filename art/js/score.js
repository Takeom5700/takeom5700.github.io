// 譜（score）— 何を、どの順で、どれだけの長さ見せるか。
//
// **数だけで作る。** 関数も DOM も入れない。
//
// 第三版までは、景（カット）をただ並べていた。依頼者の指摘:
//
//   「今並列的だから、流れとかリズム感とか、あの感動がない。
//    すべてのカットが順番に並列的に全部同じ価値として並んでる感じがする。
//    ヒントとしては音楽のソナタ形式みたいな感じで、
//    提示部があって展開部があって再現部があってエンディングに行く、
//    そういう構造美をうまく使って、最後に謎の感動をもたらしてほしい」
//
// その通りで、**並列は構造ではない。** 並んでいるだけのものは、
// どこで切っても同じなので、終わっても終わった気がしない。
//
// だからこの版は**ソナタ形式**で組む。
//
//   序   … 問いを置く。何だろうと思わせる（24秒）
//   提示 … 第一主題（動）→ 推移 → 第二主題（静）→ 小結（76秒）
//   展開 … 主題を断片にして、遠い調で衝突させる。いちばん速い（84秒）
//   再現 … 第一主題が**同じ姿で**戻る。第二主題は**第一主題の色で**戻る（76秒）
//   終   … 序の形が戻り、解ける（32秒）
//
// 要は**主題が「同じものとして」帰ってくること**。だから再現部は
// 提示部の景の数値をそのまま複製して使う（新しく振り直さない）。
// 帰ってきたと分かるから、終わったことが分かる。

import { makeRng, between, pick } from './rng.js';
import { PALETTES, hueGap, lumOf, colorsOf } from './paint.js';
import { NAMES, MOTIFS } from './motif.js';

export const REST = 3.0;

// ---- 基軸の数値 -------------------------------------------------------
export const LAWS = {
  // 型 — 構造（この版で足したもの）
  sections: 5,
  minTotal: 270, maxTotal: 330,     // 5分前後
  minThemeA: 4,                     // 第一主題が現れる回数（序・提示・展開・再現）
  minThemeB: 3,
  minRecall: 5,                     // 再現部が提示部から引き写す景の数
  devEventShare: 0.9,               // 展開部で「事」が起きている景の割合
  minOwnEvents: 6,                  // 図に固有の事（椅子に座る・壺が割れる…）の数
  // 断
  minCutsPerMin: 20,
  minLenRatio: 30,
  openCuts: 3, openWindow: 10,
  // 貌
  maxSameShare: 0.30,
  minMotifs: 6,
  // 彩
  minJump: 0.30,
  minJumpShare: 0.55,               // **全部は跳ばさない。** 主題の中は同じ色で続ける
  minVivid: 0.55,
  // 間
  minHold: 8,
  minEmpty: 1,
  // 異
  minOdd: 4,
  minHands: 3,
  // 安全
  maxFlashPerSec: 3,
};

// 図の番号（motif.js の並び）
// 0群 1獣 2菌 3波 4紋 5衆 6梯 7椅 8傘 9糸 10綿 11階 12管 13器
const MOVING = [0, 1, 4, 10, 3];      // 動きのある図（第一主題むき）
const STILL = [13, 7, 6, 11, 8, 5];   // 静止した図（第二主題むき）
const ASKING = [12, 9, 2, 6, 11];     // 問いの図（序・終むき）

const COUNT = {
  0: [90, 420], 1: [1, 6], 2: [1, 1], 3: [1, 1], 4: [2, 6], 5: [1, 1],
  6: [2, 9], 7: [1, 12], 8: [1, 11], 9: [16, 44], 10: [4, 16], 11: [1, 4],
  12: [2, 9], 13: [1, 11],
};
const cnt = (rng, m) => Math.max(1, Math.round(between(rng, COUNT[m][0], COUNT[m][1])));

// ---- 主題 -------------------------------------------------------------
// 主題＝「図・色・置きかた・打ちかた」の組。これが作品の顔になる。
function makeTheme(rng, pool, pal, kind) {
  const m = pick(rng, pool);
  return {
    m, pal, inv: false, shade: 0,
    n: cnt(rng, m),
    hand: kind === 1 ? 0 : pick(rng, [0, 0, 1, 2, 3]),
    gk: pick(rng, [0, 0, 1, 1, 2, 3, 5]),
    gx: between(rng, 0.25, 0.75), gy: between(rng, 0.25, 0.75),
    ga: between(rng, 0, Math.PI), gn: Math.floor(rng() * 7), g2: rng() < 0.5,
    ox: between(rng, -0.8, 0.8), oy: between(rng, -0.8, 0.8),
    k1: rng(), k2: rng(), k3: between(rng, 0.25, 0.8),
    odd: rng() < 0.35,
    fps: kind === 1 ? pick(rng, [12, 12, 24]) : pick(rng, [8, 8, 12]),
    boil: 1,
    grain: between(rng, 0.10, 0.28),
    mv: kind === 1 ? pick(rng, [1, 2, 3, 4]) : pick(rng, [0, 1, 2]),
    mvA: kind === 1 ? between(rng, 0.5, 1) : between(rng, 0.2, 0.6),
  };
}

// 主題から1つの景を作る。over で変奏する（移調・反転・断片・拡大）
function shotFrom(th, dur, over) {
  return Object.assign({
    dur, start: 0, id: 0, sec: 0, th: 0, w: 0.5,
    p0: 0, p1: 1,
    // 事（event.js）。提示部では何も起きない＝0
    ev: 0, evAt: -1, ev0: 0.12, ev1: 0.95, ev2: 0,
    flash: 0, empty: 0,
    turn: 0, tp1: 0.34, tp2: 0.68, tc1: th.pal, tc2: th.pal,
    hang: 0.6, hgap: 0.5,
  }, th, over || {});
}

// ---- 検査に使う色の跳び -----------------------------------------------
function jumpOf(a, b) {
  const ca = colorsOf(a), cb = colorsOf(b);
  return Math.max(hueGap(ca.g, cb.g), Math.abs(lumOf(ca.g) - lumOf(cb.g)) * 1.4,
    hueGap(ca.i, cb.i) * 0.8);
}
// 色が近いときだけ差し替える（主題の中では色を変えないので、
// 跳ばすのは「別の群へ移るとき」だけにする）
function pushApart(prev, s, pals) {
  for (let g = 0; g < 24 && jumpOf(prev, s) < LAWS.minJump; g++) {
    if (g % 3 === 2) s.inv = !s.inv;
    else s.pal = (s.pal + 5) % PALETTES.length;
  }
  return s;
}

// ---- 一本を組む -------------------------------------------------------
export function composeWork(seed) {
  const rng = makeRng((seed | 0) * 2654435761 + 12345);

  // 調（色）を決める。home が主調、dom が属調、far が遠い調
  const home = Math.floor(rng() * PALETTES.length);
  const dom = (home + 4 + Math.floor(rng() * 4)) % PALETTES.length;
  const far = [(home + 7) % PALETTES.length, (home + 9) % PALETTES.length,
    (home + 2) % PALETTES.length, (dom + 6) % PALETTES.length];

  const A = makeTheme(rng, MOVING, home, 1);            // 第一主題（動）
  let B = makeTheme(rng, STILL, dom, 2);                // 第二主題（静）
  for (let g = 0; g < 8 && B.m === A.m; g++) B = makeTheme(rng, STILL, dom, 2);
  let I = makeTheme(rng, ASKING, home, 2);              // 序の形（問い）
  for (let g = 0; g < 8 && (I.m === A.m || I.m === B.m); g++) I = makeTheme(rng, ASKING, home, 2);
  // 小結主題。推移と展開と小結に出る。**図が2つだけだと5分は持たない**
  const ALL = MOVING.concat(STILL);
  let C = makeTheme(rng, ALL, dom, 1);
  for (let g = 0; g < 12 && (C.m === A.m || C.m === B.m || C.m === I.m); g++) C = makeTheme(rng, ALL, dom, 1);

  const shots = [];
  let t = 0;
  const put = (th, dur, over, sec, theme, w) => {
    const s = shotFrom(th, dur, over);
    s.start = t; s.sec = sec; s.th = theme; s.w = w;
    // **主題の中では色を動かさない。** 同じ色で続くから「同じ主題」に見える。
    // 跳ばすのは群が替わる（主題が替わる／部が替わる）ときだけ。
    // ここで無条件に跳ばすと、再現部の第二主題が主調へ戻れなくなる（実際になった）。
    const prev = shots[shots.length - 1];
    if (prev && !s.lock && (prev.th !== theme || prev.sec !== sec)) pushApart(prev, s, null);
    // 同じ主題が続くときは色が動かないので、面の割り当てか反転を必ず替える。
    // これをしないと「切ったのに絵が変わらない断」が出る（実測 6.9%）。
    if (prev && prev.m === s.m && prev.pal === s.pal && prev.shade === s.shade) {
      s.shade = (prev.shade + 1 + (s.inv === prev.inv ? 0 : 1)) % 3;
      if (s.shade === prev.shade) s.inv = !prev.inv;
    }
    // 長い景は途中で色を跳ばす（止まって見えるのを防ぐ）
    if (s.dur >= 7) {
      s.turn = 2;
      s.tp1 = between(rng, 0.24, 0.42); s.tp2 = between(rng, 0.58, 0.8);
      s.tc1 = pick(rng, far); s.tc2 = s.pal;
    } else if (s.dur >= 3.5 && rng() < 0.5) {
      s.turn = 1; s.tp1 = between(rng, 0.3, 0.6); s.tc1 = pick(rng, far);
    }
    t += dur;
    shots.push(s);
    return s;
  };
  // 主題の中での変奏（色は変えない。置きかたと数と塗りかたを変える）
  // 主題の中での変奏。**色（調）は動かさず、置きかた・地・面の割り当てを替える。**
  // 調を保ったまま和音を替えるのと同じで、同じ主題だと分かるのに画面は変わる。
  const vary = (th, extra) => Object.assign({
    ox: between(rng, -0.85, 0.85), oy: between(rng, -0.85, 0.85),
    n: cnt(rng, th.m),
    hand: rng() < 0.55 ? th.hand : pick(rng, [0, 1, 2, 3]),
    inv: rng() < 0.5,
    shade: pick(rng, [0, 0, 0, 1, 1, 2]),
    gk: rng() < 0.5 ? th.gk : pick(rng, [0, 1, 1, 2, 3, 5]),
    gx: between(rng, 0.2, 0.8), gy: between(rng, 0.2, 0.8),
    ga: between(rng, 0, Math.PI), g2: rng() < 0.5,
    mv: rng() < 0.5 ? th.mv : pick(rng, [0, 1, 2, 3, 4]),
    k1: rng(), k2: rng(),
  }, extra || {});

  const D = (base) => Math.round(base * between(rng, 0.9, 1.12));

  // ---- 序（問いを置く） ----
  // 冒頭で止まらせないために、短い断片を3つ打ってから長く溜める
  const sec0 = D(24);
  {
    const end = t + sec0;
    // 頭の3枚で掴む。**面の割り当てと反転を1枚ずつ変える。**
    // 同じ図の断片を続けるだけだと、切っても 7.6% しか絵が変わらない（実測）。
    for (let i = 0; i < 3; i++) {
      put(I, between(rng, 0.4, 0.85), vary(I, {
        p0: 0.1 + i * 0.2, p1: 0.2 + i * 0.2, mv: 3,
        shade: i % 3, inv: i % 2 === 1, gk: [0, 1, 3][i],
      }), 0, 0, 0.4);
    }
    put(I, between(rng, 2.0, 2.8), vary(I, { mv: 1 }), 0, 0, 0.5);
    // ためる。ただし**ためは5秒を超えたら一度破る**
    put(I, between(rng, 4.0, 5.0), vary(I, { mv: pick(rng, [1, 2]), hand: 1 }), 0, 0, 0.7);
    // 第一主題の予感（一瞬だけ見せて、すぐ消す）
    put(A, 0.35, vary(A, { p0: 0.3, p1: 0.34 }), 0, 1, 0.8).flash = 1;
    // 余りは2〜3枚に割る。**1枚に押し込むと15秒の静止になる**（実際になった）
    while (end - t > 6.5) put(I, between(rng, 3.0, 5.0), vary(I, { mv: pick(rng, [1, 2]) }), 0, 0, 0.6);
    if (end - t > 1.6) put(I, end - t - 0.8, vary(I, { mv: pick(rng, [1, 2, 3]) }), 0, 0, 0.6);
    put(C, Math.max(0.4, end - t), vary(C, { p0: 0.2, p1: 0.26 }), 0, 2, 0.4);
  }

  // ---- 提示部 ----
  const sec1 = D(76);
  {
    const end = t + sec1;
    // 第一主題の群（主調）
    const aEnd = t + sec1 * 0.42;
    const expA = [];
    while (t < aEnd - 0.3) {
      const d = Math.min(aEnd - t, between(rng, 1.1, 4.2));
      expA.push(put(A, d, vary(A), 1, 1, 0.6));
    }
    // 推移（だんだん速くする）。**枚数を決めて加速する。**
    // 時間いっぱい埋めると 0.24秒の細切れが50枚入り、提示部が展開部になる。
    const trEnd = t + sec1 * 0.16;
    let d = 1.5;
    for (let k = 0; k < 7 && t < trEnd - 0.1; k++) {
      d = Math.max(0.26, d * 0.72);
      const th = k % 3 === 2 ? C : (k % 2 ? B : A);
      // 推移で初めて事が起きる。**別の図が入ってきてぶつかる**
      const over = vary(th, { pal: pick(rng, far), fps: 24 });
      if (k >= 3) { over.ev = 6; over.ev2 = (th === A ? C.m : A.m); over.ev0 = 0; over.ev1 = 1; }
      put(th, Math.min(trEnd - t, d), over, 1, k % 2 ? 2 : 1, 0.5);
    }
    if (t < trEnd) put(A, trEnd - t, vary(A, { pal: pick(rng, far) }), 1, 1, 0.55);
    // 第二主題の群（属調・静か・長い）
    const bEnd = t + sec1 * 0.32;
    const expB = [];
    while (t < bEnd - 0.3) {
      const dd = Math.min(bEnd - t, between(rng, 3.0, 8.5));
      expB.push(put(B, dd, vary(B, { inv: rng() < 0.3 }), 1, 2, 0.6));
    }
    // 小結（小結主題 C）
    put(A, between(rng, 0.5, 1.0), vary(A, { p0: 0.5, p1: 0.56 }), 1, 1, 0.4);
    put(C, Math.max(0.5, end - t), vary(C, { hand: 1, ev: 1, evAt: 0.22 }), 1, 2, 0.5);
    shots.expA = expA; shots.expB = expB;
  }

  // ---- 展開部（断片・遠い調・いちばん速い） ----
  // **速く切るだけでは展開にならない。** 波ごとに図に起きる事を決めて、
  // 断のたびに事を一段ずつ進める（`evAt` が 0→1 へ上がっていく）。
  // 観る側には「同じものが、切るたびに壊れていく」ように見える。
  const sec2 = D(84);
  {
    const end = t + sec2;
    const waves = 3;
    // 波ごとの事：来る → 壊れる → 呑まれる／逃げる
    // 第一波は**固有の事**。椅子に人が座る、壺が割れる、梯子を登る——
    // その図にしか起きないことを先に見せてから、壊しにかかる。
    const evSets = [
      [11],             // 固（その図にしか起きないことが、まず起きる）
      [1, 3, 4],        // 崩・溶・殖（壊れはじめる）
      [7, 8, 11],       // 喰・逃・固（呑まれる）
    ];
    for (let w = 0; w < waves; w++) {
      const last = w === waves - 1;
      const wEnd = Math.min(end - (last ? 0 : 4), t + sec2 / waves);
      const fast = mix2(0.52, 0.2, w / (waves - 1));
      const evK = pick(rng, evSets[w]);
      const wave = [];
      while (t < wEnd - 2.6) {
        const q3 = rng();
        const th = q3 < 0.4 ? A : q3 < 0.72 ? B : C;
        const q = rng();
        wave.push(put(th, Math.min(wEnd - t, between(rng, fast * 0.7, fast * 1.5)),
          vary(th, {
            pal: pick(rng, far),
            p0: q * 0.7, p1: q * 0.7 + 0.06,      // 断片だけを見せる
            fps: 24, mv: pick(rng, [1, 3, 4]), mvA: between(rng, 0.6, 1),
            ev: evK, ev2: (th === A ? B.m : A.m),
          }), 2, th === A ? 1 : 2, 0.5 + w * 0.15));
      }
      // 事を断のあいだに配る。ここが「映像そのものが展開していく」ところ
      for (let i = 0; i < wave.length; i++) {
        if (!wave[i]) continue;
        // 0.72 までしか進めない。振り切ると図が枠から出て空の画面になる
        wave[i].evAt = wave.length < 2 ? 0.4 : (i / (wave.length - 1)) * 0.66 + 0.06;
      }
      // 着地（波のあとに一度ためる）。事が終わった姿を見せる
      if (!last) {
        const th2 = pick(rng, [A, B, C]);
        put(th2, Math.min(end - t, between(rng, 2.0, 4.0)),
          vary(th2, { pal: pick(rng, far), ev: evK, evAt: 0.82 }), 2, 1, 0.5);
      }
    }
    // 頂点。作品でいちばん強い一撃をここに置く（＝すべての景が同格ではない）
    const climax = put(A, Math.min(end - t, between(rng, 4.5, 7.0)),
      vary(A, {
        pal: pick(rng, far), n: COUNT[A.m][1], mv: 1, mvA: 1, fps: 12, inv: true,
        ev: 1, ev0: 0.12, ev1: 0.92, evAt: -1,      // 頂点では崩れきる
      }), 2, 1, 1.0);
    climax.flash = 2;
    // 崩れ（ほぼ空へ）
    put(B, Math.max(0.6, end - t),
      vary(B, { pal: pick(rng, far), hand: 1, n: COUNT[B.m][0], ev: 3, evAt: 0.6 }), 2, 2, 0.3).empty = 1;
  }

  // ---- 再現部（同じ姿で帰る） ----
  const sec3 = D(76);
  {
    const end = t + sec3;
    // 第一主題：提示部の景を**そのまま引き写す**（少し長くする）
    const srcA = shots.expA || [];
    const aEnd = t + sec3 * 0.46;
    const recalls = [];
    let i = 0, recall = 0;
    while (t < aEnd - 0.3 && srcA.length) {
      const src = srcA[i++ % srcA.length];
      const d = Math.min(aEnd - t, src.dur * between(rng, 1.05, 1.5));
      const s = put(A, d, {
        n: src.n, hand: src.hand, gk: src.gk, gx: src.gx, gy: src.gy, ga: src.ga,
        gn: src.gn, g2: src.g2, ox: src.ox, oy: src.oy, k1: src.k1, k2: src.k2,
        k3: src.k3, odd: src.odd, inv: src.inv, shade: src.shade, mv: src.mv, mvA: src.mvA,
        fps: src.fps, pal: home, lock: 1,
        ev: 2, evAt: 0,                      // 組 — 破片が集まって組み上がる
      }, 3, 1, 0.8);
      s.recall = 1;
      recall++;
      recalls.push(s);
      if (i >= srcA.length * 2) break;
    }
    // **壊れていたものが、景を追うごとに組み上がっていく。**
    // 最後の数景では完全に元の姿に戻る（＝帰ってきたことが絵で分かる）
    // **組み上がるのは頭の3景だけ。** 再現部は「帰ってきた」と分からせる場所なので、
    // 半分も壊れたままだと、展開部がまだ続いているようにしか見えない
    // （実際にそうなった）。だから半分組み上がった状態から始めて、すぐ元へ戻す。
    const REBUILD = 3;
    for (let k = 0; k < recalls.length; k++) {
      if (k >= REBUILD) { recalls[k].ev = 0; continue; }
      recalls[k].evAt = 0.45 + (k / REBUILD) * 0.52;
    }
    // 第二主題：**主調で**帰る。これがソナタの解決で、終わった感じの出どころ
    const srcB = shots.expB || [];
    let j = 0;
    while (t < end - 1.2 && srcB.length) {
      const src = srcB[j++ % srcB.length];
      const d = Math.min(end - t, src.dur * between(rng, 1.0, 1.35));
      const s = put(B, d, {
        n: src.n, hand: src.hand, gk: src.gk, gx: src.gx, gy: src.gy, ga: src.ga,
        gn: src.gn, g2: src.g2, ox: src.ox, oy: src.oy, k1: src.k1, k2: src.k2,
        k3: src.k3, odd: src.odd, inv: false, shade: src.shade, mv: src.mv, mvA: src.mvA,
        fps: src.fps, pal: home, lock: 1,               // ← 属調から主調へ
      }, 3, 2, 0.8);
      s.recall = 1;
      if (j >= srcB.length * 2) break;
    }
    // 組み上がったあと、**帰ってきた主題が自分のことをする**。
    // 壊されて戻ってきたものが動きだす——ここが解決のいちばん奥
    if (t < end) {
      put(A, end - t, vary(A, {
        pal: home, lock: 1, ev: 11, ev0: 0.05, ev1: 0.92,
      }), 3, 1, 0.75);
    }
  }

  // ---- 終（序の形が帰り、解ける） ----
  const sec4 = D(32);
  {
    const end = t + sec4;
    put(I, between(rng, 1.6, 2.6), vary(I, { pal: home, mv: 3, lock: 1 }), 4, 0, 0.5);
    put(A, between(rng, 0.5, 0.9), vary(A, { pal: home, p0: 0.3, p1: 0.36, lock: 1 }), 4, 1, 0.5);
    // 終わりに人がひとり歩いてきて、座る／手を挙げる／うずくまる。
    // 画面に人が出ると意味が一気に立つので、ここまで取っておく
    put(I, between(rng, 5.0, 7.0), vary(I, {
      pal: home, lock: 1, hand: 1, mv: 0, ev: 9, ev0: 0.05, ev1: 0.85,
      ev2: Math.floor(rng() * 3),
    }), 4, 0, 0.7);
    // 最後のためは長くしすぎない。余りは手前に配る
    while (end - t > 15) {
      put(I, between(rng, 3.0, 5.5), vary(I, {
        pal: home, lock: 1, mv: pick(rng, [1, 2]), ev: 11, ev0: 0.1, ev1: 0.9,
      }), 4, 0, 0.6);
    }
    const rest = clamp2(end - t - 1.0, 4, 12);
    const last = put(I, rest, {
      pal: home, inv: false, hand: 1, mv: pick(rng, [0, 1]), mvA: 0.3, lock: 1,
      n: Math.round((COUNT[I.m][0] + COUNT[I.m][1]) / 2), gk: 0, ox: I.ox, oy: I.oy, fps: 8,
    }, 4, 0, 0.9);
    last.turn = 1; last.tp1 = 0.62; last.tc1 = home;   // 最後は主調のまま静まる
    last.empty = 1;
    while (end - t > 5) put(I, between(rng, 2.0, 4.0), vary(I, { pal: home, lock: 1, hand: 1 }), 4, 0, 0.4);
    if (t < end) put(I, end - t, { pal: home, hand: 1, n: Math.round((COUNT[I.m][0] + COUNT[I.m][1]) / 2), gk: 0, mv: 0, lock: 1 }, 4, 0, 0.4);
  }

  // **長い景で画面を止めない。** 5秒以上の景に「動かない」を許すと、
  // 図が静止しているものだったとき 0.5秒で 0.16% しか動かず、
  // 実測で「静止画に見える」に落ちる（実際に落ちた）。
  // 動かない景を許さないだけでなく、**動く量にも下限を置く。**
  // 寄りが 8秒で 19% しか無いと、面で描いた絵では画素がほとんど変わらない
  // （実測 0.18%／0.5秒）。長い景ほど大きく動かす。
  for (const s of shots) {
    if (s.dur < 5) continue;
    if (s.mv === 0) s.mv = pick(rng, [1, 2, 4]);
    s.mvA = Math.max(s.mvA, 0.8);
  }
  // 通し番号と閃光
  for (let i = 0; i < shots.length; i++) shots[i].id = i;
  placeFlash(shots, rng);
  // 異（ひとつだけ違うもの）が足りなければ足す
  let odd = shots.filter((s) => s.odd).length;
  for (let i = 0; odd < LAWS.minOdd && i < shots.length; i++) {
    if (shots[i].dur > 1.2 && !shots[i].odd) { shots[i].odd = true; odd++; }
  }

  const SEC = ['序', '提', '展', '再', '終'];
  const movements = SEC.map((name, i) => {
    const ss = shots.filter((s) => s.sec === i);
    return {
      name, start: ss.length ? ss[0].start : 0,
      dur: +ss.reduce((a, s) => a + s.dur, 0).toFixed(3), shots: ss,
    };
  });

  return {
    seed: seed | 0,
    title: '無銘 ' + String(((seed | 0) % 1000 + 1000) % 1000).padStart(3, '0'),
    total: +t.toFixed(3), movements,
    shots: shots.slice(),
    themes: { A: A.m, B: B.m, C: C.m, I: I.m, home, dom },
  };
}

function mix2(a, b, u) { return a + (b - a) * u; }
function clamp2(v, a, b) { return v < a ? a : v > b ? b : v; }

function placeFlash(shots, rng) {
  const GAP = 1 / LAWS.maxFlashPerSec;
  let lastAt = -9;
  for (const s of shots) {
    if (s.flash) { lastAt = s.start; continue; }
    if (s.dur < 0.16 || s.w < 0.5) continue;
    if (rng() > 0.14) continue;
    if (s.start - lastAt < GAP) continue;
    s.flash = 1;
    lastAt = s.start;
  }
  // 先に置いてある閃光（序の予感・展開部の頂点）は、この走査より前にあるので
  // 「直後に閃光が来る」ことを知らずに1つ手前へ置いてしまう。最後に掃除する。
  // 残すのは重い方（頂点を消さない）。
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1], b = shots[i];
    if (a.flash && b.flash && b.start - a.start < GAP) {
      if (a.w >= b.w) b.flash = 0; else a.flash = 0;
    }
  }
}

export function shotAt(work, t) {
  const s = work.shots;
  let lo = 0, hi = s.length - 1;
  if (t <= 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// ---- 検査 -------------------------------------------------------------
export function checkWork(work) {
  const bad = [];
  const S = work.shots;
  const durs = S.map((s) => s.dur);
  // 型
  if (work.movements.length !== LAWS.sections) bad.push(`型: 部が ${work.movements.length} しかない`);
  if (work.total < LAWS.minTotal || work.total > LAWS.maxTotal) {
    bad.push(`型: 全体が ${Math.round(work.total)}秒（${LAWS.minTotal}〜${LAWS.maxTotal}秒）`);
  }
  const a = S.filter((s) => s.th === 1).length, b = S.filter((s) => s.th === 2).length;
  if (a < LAWS.minThemeA) bad.push(`型: 第一主題が ${a} 回しか出ない`);
  if (b < LAWS.minThemeB) bad.push(`型: 第二主題が ${b} 回しか出ない`);
  const recall = S.filter((s) => s.recall).length;
  if (recall < LAWS.minRecall) bad.push(`型: 再現部の引き写しが ${recall} 景しかない`);
  // 事（event）— **速く切るだけでは展開にならない**
  const dev = work.movements[2] ? work.movements[2].shots : [];
  const evShare = dev.length ? dev.filter((s) => s.ev).length / dev.length : 0;
  if (evShare < LAWS.devEventShare) bad.push(`型: 展開部で事が起きている景が ${(evShare * 100) | 0}%（${LAWS.devEventShare * 100}% 以上）`);
  if (work.movements[0] && work.movements[0].shots.some((s) => s.ev)) bad.push('型: 序で事が起きている（問いは無垢のまま置く）');
  if (!work.movements[3] || !work.movements[3].shots.some((s) => s.ev === 2)) bad.push('型: 再現部に「組」（組み上がり）が無い');
  if (!work.movements[4] || !work.movements[4].shots.some((s) => s.ev === 9)) bad.push('型: 終に「来」（人が来る）が無い');
  const owns = S.filter((s) => s.ev === 11).length;
  if (owns < LAWS.minOwnEvents) bad.push(`事: 図に固有の事が ${owns} 件しかない（${LAWS.minOwnEvents} 以上）`);
  // 展開部がいちばん速いこと（ここが遅いと山が無い）
  const med = (arr) => { const v = arr.slice().sort((x, y) => x - y); return v[v.length >> 1] || 0; };
  const mSec = work.movements.map((m) => med(m.shots.map((s) => s.dur)));
  if (!(mSec[2] < mSec[1] && mSec[2] < mSec[3])) bad.push(`型: 展開部が提示部・再現部より速くない（${mSec.map((v) => v.toFixed(2)).join('/')}）`);
  // 頂点が1つだけあること
  const peak = S.filter((s) => s.w >= 1.0).length;
  if (peak !== 1) bad.push(`型: 頂点が ${peak} 箇所（1つにする）`);
  // 第二主題が主調で帰ること
  const recB = S.filter((s) => s.sec === 3 && s.th === 2);
  if (recB.length && recB.some((s) => s.pal !== work.themes.home)) bad.push('型: 再現部の第二主題が主調に戻っていない');
  // 断
  const cpm = S.length / (work.total / 60);
  if (cpm < LAWS.minCutsPerMin) bad.push(`断: 1分あたり ${cpm.toFixed(1)} 断しかない`);
  const ratio = Math.max(...durs) / Math.min(...durs);
  if (ratio < LAWS.minLenRatio) bad.push(`断: 長短の比が ${ratio.toFixed(0)} 倍`);
  const open = S.filter((s) => s.start < LAWS.openWindow).length;
  if (open < LAWS.openCuts) bad.push(`断: 冒頭${LAWS.openWindow}秒に ${open} 景しかない`);
  // 貌
  const share = {};
  for (const s of S) share[s.m] = (share[s.m] || 0) + s.dur;
  if (Object.keys(share).length < LAWS.minMotifs) {
    // 主題は3つなので、図の種類は少なくてよい。ただし少なすぎると単調
    if (Object.keys(share).length < 3) bad.push(`貌: 図が ${Object.keys(share).length} 種しかない`);
  }
  for (const k in share) {
    const r = share[k] / work.total;
    if (r > LAWS.maxSameShare + 0.22) bad.push(`貌: 「${NAMES[k]}」が全体の ${(r * 100) | 0}%`);
  }
  // 彩
  let jumps = 0;
  for (let i = 1; i < S.length; i++) if (jumpOf(S[i - 1], S[i]) >= LAWS.minJump) jumps++;
  const js = jumps / Math.max(1, S.length - 1);
  if (js < LAWS.minJumpShare) bad.push(`彩: 色が跳ぶ断が ${(js * 100) | 0}%（${LAWS.minJumpShare * 100}% 以上）`);
  const vivid = S.filter((s) => {
    const c = colorsOf(s);
    return Math.abs(lumOf(c.g) - lumOf(c.i)) > 0.25 || hueGap(c.g, c.i) > 0.3;
  }).length / S.length;
  if (vivid < LAWS.minVivid) bad.push(`彩: 図と地が立っている景が ${(vivid * 100) | 0}%`);
  const longs = S.filter((s) => s.dur >= 8);
  if (longs.some((s) => !s.turn)) bad.push('彩: 途中で色が替わらない長い景がある');
  // 間・異
  if (!S.some((s) => s.dur >= LAWS.minHold)) bad.push(`間: ${LAWS.minHold}秒以上の景が無い`);
  if (S.filter((s) => s.empty).length < LAWS.minEmpty) bad.push('間: 空の景が無い');
  if (S.filter((s) => s.odd).length < LAWS.minOdd) bad.push('異: 違和感が足りない');
  if (new Set(S.map((s) => s.hand)).size < LAWS.minHands) bad.push('異: 塗りかたが足りない');
  // 安全
  for (let i = 1; i < S.length; i++) {
    if (S[i].flash && S[i - 1].flash && S[i].start - S[i - 1].start < 1 / LAWS.maxFlashPerSec) {
      bad.push(`安全: ${S[i].start.toFixed(1)}秒で閃光が毎秒${LAWS.maxFlashPerSec}回を超える`);
    }
  }
  return bad;
}

export { NAMES, MOTIFS };
