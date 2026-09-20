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
import { PALETTES, hueGap, lumOf, hsOf, colorsOf } from './paint.js';
import { layerColor } from './layer.js';
import { NAMES, MOTIFS } from './motif.js';

export const REST = 3.0;

// **尺は6分ちょうど（360秒）。**
// 依頼者:「Suno の制限で6分までしか作れないようだから、映像もちょうど6分にして」。
// 部ごとの長さは種ごとに ±10% 振れたままで、**全体だけを一度伸縮させて**合わせる。
export const TOTAL = 360;

// 題名。**作品の中では一度も出さない**（画面に文字を置かない）。
// 出るのは頁を開いたときの一行と、書き出したファイルの名前だけ。
//
// 「無銘」→「通過」→「Passage」と改めた。
//   ・無銘 … 依頼者「逃げの感じがする」。名づけないことを名にするのは、
//            名づけから降りているだけだった
//   ・通過 … 主語のない動作を名にした。意味は正しいが日本語だった
//   ・Passage … 依頼者「全世界に向けて発表したいから、タイトルは英語がいい」
//
// **Passage** は三つの意味がそのまま作品に当たっている。
//   1. 通り抜けること — 序の形（管）の中を球が通っていく。層が断をまたいで渡る
//   2. 楽曲の一節 — この作品はソナタ形式で、主題が出ていって帰ってくる
//   3. 通路そのもの — 管
// 形容詞も主張も主題も入っていない（→ CHANNEL.md「画面の中と題名は売らない」）。
//
// **題名を変えるのはここ1行と、`art/index.html` の2箇所だけ。**
export const TITLE = 'Passage';

// ---- 基軸の数値 -------------------------------------------------------
export const LAWS = {
  // 型 — 構造（この版で足したもの）
  sections: 5,
  minTotal: 359.9, maxTotal: 360.1, // 6分ちょうど（Suno が6分までのため）
  minThemeA: 4,                     // 第一主題が現れる回数（序・提示・展開・再現）
  minThemeB: 3,
  minRecall: 5,                     // 再現部が提示部から引き写す景の数
  devEventShare: 0.9,               // 展開部で「事」が起きている景の割合
  minOwnEvents: 6,                  // 図に固有の事（椅子に座る・壺が割れる…）の数
  // 断
  minCutsPerMin: 20,
  minLenRatio: 30,
  openCuts: 3, openWindow: 10,
  // 貌 — **選別する。** 全部入れると、何を見せたい作品なのか分からなくなる
  maxSameShare: 0.42,
  minMotifs: 4, maxMotifs: 6,       // 1本に出す図は4〜6。14全部は入れない
  // 余白 — 疎な景（図が小さく、大きな空きの中にある景）
  minQuietShare: 0.16,
  minRest: 5,                       // ための景（疎で2.5秒以上）
  layer: 1,                         // 断をまたいで続く層が1つあること
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
// 問いの図（序・終むき）。いまは序を管で固定しているので、
// 小結・挿話の候補として残してある（管が抜けた残りから選ばれる）
const ASKING = [12, 9, 2, 6, 11];

// **序の形は「管」で固定する。** 依頼者:
//   「最初のアイデアのパイプの中を球が動いてるやつが、
//     最初のモチーフのほうがよかったな」
// 管は、中を球が通っていくのが見えるのに、**どこから来てどこへ行くのか、
// 何のための管なのかが一切分からない。** 問いを置く役にこれ以上のものがない。
// 序で置いた形は終で帰ってくるので、作品は管で開いて管で閉じる。
const OPENING = 12;

const COUNT = {
  0: [90, 420], 1: [1, 6], 2: [1, 1], 3: [1, 1], 4: [2, 6], 5: [1, 1],
  6: [2, 9], 7: [1, 12], 8: [1, 11], 9: [16, 44], 10: [4, 16], 11: [1, 4],
  12: [2, 9], 13: [1, 11],
};
// **数は下の方から取る。** 上限まで振ると画面が埋まって余白が消える。
// u=0 で下限、u=1 で上限。ふだんは 0.42 までしか使わず、
// 上限を使うのは展開部の頂点だけ（そこだけ埋まるから頂点に見える）。
const cnt = (rng, m, u = 0.42) =>
  Math.max(1, Math.round(between(rng, COUNT[m][0], COUNT[m][0] + (COUNT[m][1] - COUNT[m][0]) * u)));

// ---- 主題 -------------------------------------------------------------
// 主題＝「図・色・置きかた・打ちかた」の組。これが作品の顔になる。
//
// 主題は**図を1つ持つ**（`ms` は組で持てる作りにしてあるが、1本では1つ）。
// 主題が図を2つ以上持つと、帰ってきたときに同じ主題だと分からない。
// 図を増やすより、同じ図に**別のことを起こす**方が展開になる（法「事」）。
function makeTheme(rng, ms, pal, kind) {
  return {
    ms: ms.slice(), k: 0, m: ms[0], pal, inv: false, shade: 0,
    hand: kind === 1 ? 0 : pick(rng, [0, 0, 1, 2, 3]),
    // **地は一色寄りにする。** 割った地が多いと画面が常に埋まって、余白が消える
    gk: pick(rng, [0, 0, 0, 1, 1, 2, 3, 5]),
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
    // 余白。zoom<1 で図を小さくし、vx/vy で空きの中に寄せる
    zoom: 1, vx: 0, vy: 0, sparse: 0,
    // 層（断をまたいで続くもの）。中身は post-pass で入れる
    lay: 0, lyW: 1, lyT0: 0, lyD: 1, lyA: 0.5, lyB: 0.5, lyDir: 1, lyAlt: 0,
  }, th, over || {});
}

// 白に近い色／赤い色（禁「白地に赤い円」に使う）
const nearWhite = (h) => { const x = hsOf(h); return x.v > 0.9 && x.s < 0.12; };
const isRed = (h) => { const x = hsOf(h); return x.s > 0.6 && x.v > 0.6 && (x.h < 0.05 || x.h > 0.95); };

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

  // **図は選ぶ。1本に5つだけ。**
  //   I 序の形／A 第一主題／B 第二主題／C 小結／E 挿話（展開部だけ）
  //
  // 一度「14全部を1本に出す」に振ったが、依頼者に言われた——
  //
  //   「無理して全部詰め込んじゃったって感じになってて面白みなくなっちゃった。
  //    適度に使わないものは選別していい。全部入れなくていいよ」
  //
  // その通りで、**詰め込みは構成ではない。** 5つに絞ると、
  // 一つひとつが何度も帰ってくるので、帰ってきたことが分かる（それが型）。
  // 選ばれなかった図はその種では出ない。種を変えれば別の5つが出る。
  const left = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const take = (from, k) => {
    const out = [];
    for (let i = 0; i < k; i++) {
      const cand = from.filter((m) => left.includes(m));
      const m = cand.length ? pick(rng, cand) : pick(rng, left);
      out.push(m);
      left.splice(left.indexOf(m), 1);
    }
    return out;
  };
  const msI = take([OPENING], 1);          // 序（＝終）の形は固定
  const msA = take(MOVING, 1);
  const msB = take(STILL, 1);
  const msC = take(left.slice(), 1);
  const msE = take(left.slice(), 1);

  const A = makeTheme(rng, msA, home, 1);     // 第一主題（動・主調）
  const B = makeTheme(rng, msB, dom, 2);      // 第二主題（静・属調）
  const I = makeTheme(rng, msI, home, 2);     // 序の形（問い）
  const C = makeTheme(rng, msC, dom, 1);      // 小結主題
  const E = makeTheme(rng, msE, far[0], 1);   // 挿話（展開部だけ）

  const shots = [];
  let t = 0;
  const put = (th, dur, over, sec, theme, w) => {
    const s = shotFrom(th, dur, over);
    // 図は主題の組から順に取る（順番が決まっているから再現部で同じ並びが戻る）
    if (!over || over.m === undefined) s.m = th.ms[(th.k++) % th.ms.length];
    if (!over || over.n === undefined) s.n = cnt(rng, s.m);
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
    // **地の色が近い断を作らない。**
    // 余白を入れたら画面の大半が地になったので、地の色が前の景と近いだけで
    // 切れ目がほとんど見えなくなった（紅→桃の断が、実測で 8.7% しか変わらなかった。
    // 図は椅子から傘へ全部入れ替わっていたのに、地がどちらも赤系だった）。
    // 調（配色）は動かさず、反転と面の割り当てで地を替える。
    if (prev && !s.lock) {
      const near = (x, y) => hueGap(x, y) < 0.22 && Math.abs(lumOf(x) - lumOf(y)) < 0.22;
      const pg = colorsOf(prev).g;
      if (near(pg, colorsOf(s).g)) {
        s.inv = !s.inv;
        for (let g = 0; g < 3 && near(pg, colorsOf(s).g); g++) s.shade = (s.shade + 1) % 3;
      }
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
    hand: rng() < 0.55 ? th.hand : pick(rng, [0, 1, 2, 3]),
    inv: rng() < 0.5,
    shade: pick(rng, [0, 0, 0, 1, 1, 2]),
    gk: rng() < 0.5 ? th.gk : pick(rng, [0, 1, 1, 2, 3, 5]),
    gx: between(rng, 0.2, 0.8), gy: between(rng, 0.2, 0.8),
    ga: between(rng, 0, Math.PI), g2: rng() < 0.5,
    mv: rng() < 0.5 ? th.mv : pick(rng, [0, 1, 2, 3, 4]),
    k1: rng(), k2: rng(),
  }, extra || {});

  // **余白の景。** 図を小さくして、大きな空きの中にひとつ置く。
  //
  // これは「手を抜いた静止画」ではない。名前のある形が広い空きの中に
  // 小さく置かれると、形の輪郭がいちばん強く立つ。埋めるほど弱くなる。
  // 依頼者:「余白を大事にしてください。余白ってやつね、
  //          これアートにおいてすごく大事な概念だから」
  //
  // 置きかたは3つ決めてある。地は一色、図は下限の数、位置は端へ寄せる。
  const air = (th, extra) => Object.assign(vary(th, {
    gk: pick(rng, [0, 0, 0, 2]),
    hand: pick(rng, [0, 1, 1]),
    n: cnt(rng, th.ms[0], 0.04),
    // **小さくしすぎないこと。** 0.38 まで縮めたとき、実測で
    // 「画面に色が1つしかない」（図が画面の1%）に落ちた景が出た。
    // 余白は「形が小さく、しかし確かに在る」ことで効く。無いのは余白ではない
    zoom: between(rng, 0.46, 0.66),
    vx: between(rng, -0.22, 0.22), vy: between(rng, -0.15, 0.13),
    mv: pick(rng, [0, 1, 2]), mvA: between(rng, 0.2, 0.5),
    sparse: 1,
  }), extra || {});

  const D = (base) => Math.round(base * between(rng, 0.9, 1.12));

  // ---- 序（問いを置く） ----
  // 冒頭で止まらせないために、短い断片を3つ打ってから長く溜める
  const sec0 = D(30);
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
    // ためる。**ここが最初の余白。** 図を小さく、空きを大きく置く
    put(I, between(rng, 4.0, 5.0), air(I, { mv: pick(rng, [1, 2]) }), 0, 0, 0.7);
    // 第一主題の予感（一瞬だけ見せて、すぐ消す）
    put(A, 0.35, vary(A, { p0: 0.3, p1: 0.34 }), 0, 1, 0.8).flash = 1;
    // 余りは2〜3枚に割る。**1枚に押し込むと15秒の静止になる**（実際になった）
    while (end - t > 6.5) put(I, between(rng, 3.0, 5.0), air(I, { mv: pick(rng, [1, 2]) }), 0, 0, 0.6);
    if (end - t > 1.6) put(I, end - t - 0.8, vary(I, { mv: pick(rng, [1, 2, 3]) }), 0, 0, 0.6);
    put(C, Math.max(0.4, end - t), vary(C, { p0: 0.2, p1: 0.26 }), 0, 2, 0.4);
  }

  // ---- 提示部 ----
  const sec1 = D(96);
  {
    const end = t + sec1;
    // 第一主題の群（主調）
    const aEnd = t + sec1 * 0.42;
    const expA = [];
    while (t < aEnd - 0.3) {
      const d = Math.min(aEnd - t, between(rng, 1.1, 4.2));
      expA.push(put(A, d, vary(A), 1, 1, 0.6));
    }
    // 第一主題を出しきったら、一度**余白で息を置く**。
    // ここで置かないと、推移の加速が「ずっと速い」に聞こえる
    put(A, between(rng, 2.6, 4.2), air(A), 1, 1, 0.45);
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
    // 第二主題は静かな主題なので、**ひとつ飛びに余白で置く。**
    // 静かな主題を埋まった画面で見せると、静かさが伝わらない
    const bEnd = t + sec1 * 0.32;
    const expB = [];
    let bi = 0;
    while (t < bEnd - 0.3) {
      const dd = Math.min(bEnd - t, between(rng, 3.0, 8.5));
      const over = (bi++ % 2 === 0) ? air(B) : vary(B, { inv: rng() < 0.3 });
      expB.push(put(B, dd, over, 1, 2, 0.6));
    }
    // 小結（小結主題 C）。手前に余白をひとつ入れて、提示部を閉じる
    put(B, between(rng, 2.4, 3.6), air(B), 1, 2, 0.45);
    put(A, between(rng, 0.5, 1.0), vary(A, { p0: 0.5, p1: 0.56 }), 1, 1, 0.4);
    put(C, Math.max(0.5, end - t), vary(C, { hand: 1, ev: 1, evAt: 0.22 }), 1, 2, 0.5);
    shots.expA = expA; shots.expB = expB;
  }

  // ---- 展開部（断片・遠い調・いちばん速い） ----
  // **速く切るだけでは展開にならない。** 波ごとに図に起きる事を決めて、
  // 断のたびに事を一段ずつ進める（`evAt` が 0→1 へ上がっていく）。
  // 観る側には「同じものが、切るたびに壊れていく」ように見える。
  const sec2 = D(100);
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
      // **細切れにしすぎない。** 0.2秒まで刻んだとき、依頼者に
      // 「ぐちゃぐちゃになってよく分かんなくなっちゃってる」と言われた。
      // 速いことは大事だが、1枚が何なのか分かる長さは残す
      const fast = mix2(0.95, 0.44, w / (waves - 1));
      const evK = pick(rng, evSets[w]);
      const wave = [];
      while (t < wEnd - 2.6) {
        const q3 = rng();
        // 挿話（E）を混ぜる。展開部は新しい材料を持ち込む場所
        const th = q3 < 0.32 ? A : q3 < 0.56 ? B : q3 < 0.74 ? C : E;
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
      // 着地（波のあとに一度ためる）。事が終わった姿を、余白の中で見せる。
      // **展開部でも息を置く。** ずっと詰めると、速さが速さに聞こえなくなる
      if (!last) {
        const th2 = pick(rng, [E, C, A, B]);
        // **事を振り切った姿で余白にしないこと。** 事が 0.82 まで進んだ図を
        // さらに小さくすると、画面から図が消える（実測で2景が空になった）。
        // 着地は「事のあとの姿がまだ読める」ところで止める
        put(th2, Math.min(end - t, between(rng, 2.8, 4.6)),
          air(th2, {
            pal: pick(rng, far), ev: evK, evAt: between(rng, 0.52, 0.68),
            zoom: between(rng, 0.72, 0.9),
          }), 2, 1, 0.5);
      }
      // 第一波のあとに**挿話**を置く。ここだけは新しい材料（E）が
      // ゆっくり出て、自分のことをする（固有の事）。
      // 頭と終わりに余白を置いて、挿話が「別の場所」だと分かるようにする
      if (w === 0) {
        const epEnd = Math.min(end - 6, t + between(rng, 20, 28));
        put(E, between(rng, 2.2, 3.4), air(E, { pal: pick(rng, far) }), 2, 2, 0.5);
        while (t < epEnd - 1.0) {
          put(E, Math.min(epEnd - t, between(rng, 1.6, 3.6)),
            vary(E, { pal: pick(rng, far), ev: 11, ev0: 0.06, ev1: 0.94 }), 2, 2, 0.6);
        }
      }
    }
    // 頂点。作品でいちばん強い一撃をここに置く（＝すべての景が同格ではない）
    const climax = put(A, Math.min(end - t, between(rng, 5.0, 7.5)),
      vary(A, {
        pal: pick(rng, far), n: cnt(rng, A.ms[0], 1), mv: 1, mvA: 1, fps: 12, inv: true,
        ev: 1, ev0: 0.12, ev1: 0.92, evAt: -1,      // 頂点では崩れきる
      }), 2, 1, 1.0);
    climax.flash = 2;
    // 崩れ（ほぼ空へ）。頂点のあとは必ず余白にする——ここが効く
    put(B, Math.max(0.6, end - t),
      air(B, { pal: pick(rng, far), hand: 1, ev: 3, evAt: 0.6, zoom: between(rng, 0.7, 0.88) }),
      2, 2, 0.3).empty = 1;
  }

  // ---- 再現部（同じ姿で帰る） ----
  const sec3 = D(96);
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
        m: src.m, n: src.n, hand: src.hand, gk: src.gk, gx: src.gx, gy: src.gy, ga: src.ga,
        gn: src.gn, g2: src.g2, ox: src.ox, oy: src.oy, k1: src.k1, k2: src.k2,
        k3: src.k3, odd: src.odd, inv: src.inv, shade: src.shade, mv: src.mv, mvA: src.mvA,
        fps: src.fps, pal: home, lock: 1,
        // **余白も引き写す。** 図の大きさと置き場所が戻らないと「同じ姿」にならない
        zoom: src.zoom, vx: src.vx, vy: src.vy, sparse: src.sparse,
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
    // 第二主題へ渡る前に、**主調の余白をひとつ置く。**
    // 組み上がりきったものを、空きの中で一度見せてから静かな主題へ移る
    put(A, between(rng, 2.6, 4.0), air(A, { pal: home, lock: 1 }), 3, 1, 0.5);
    // 第二主題：**主調で**帰る。これがソナタの解決で、終わった感じの出どころ
    const srcB = shots.expB || [];
    let j = 0;
    while (t < end - 1.2 && srcB.length) {
      const src = srcB[j++ % srcB.length];
      const d = Math.min(end - t, src.dur * between(rng, 1.0, 1.35));
      const s = put(B, d, {
        m: src.m, n: src.n, hand: src.hand, gk: src.gk, gx: src.gx, gy: src.gy, ga: src.ga,
        gn: src.gn, g2: src.g2, ox: src.ox, oy: src.oy, k1: src.k1, k2: src.k2,
        k3: src.k3, odd: src.odd, inv: false, shade: src.shade, mv: src.mv, mvA: src.mvA,
        zoom: src.zoom, vx: src.vx, vy: src.vy, sparse: src.sparse,
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
  const sec4 = D(46);
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
      put(I, between(rng, 3.0, 5.5), air(I, {
        pal: home, lock: 1, mv: pick(rng, [1, 2]), ev: 11, ev0: 0.1, ev1: 0.9,
      }), 4, 0, 0.6);
    }
    // **最後の一枚は、いちばん大きな余白。** 図は小さく、地は一色
    const rest = clamp2(end - t - 1.0, 4, 12);
    const last = put(I, rest, {
      pal: home, inv: false, hand: 1, mv: pick(rng, [0, 1]), mvA: 0.3, lock: 1,
      n: cnt(rng, I.ms[0], 0.04), gk: 0, ox: I.ox, oy: I.oy, fps: 8,
      zoom: between(rng, 0.36, 0.52), vx: between(rng, -0.2, 0.2), vy: between(rng, -0.1, 0.1),
      sparse: 1,
    }, 4, 0, 0.9);
    last.turn = 1; last.tp1 = 0.62; last.tc1 = home;   // 最後は主調のまま静まる
    last.empty = 1;
    while (end - t > 5) put(I, between(rng, 2.0, 4.0), air(I, { pal: home, lock: 1 }), 4, 0, 0.4);
    if (t < end) put(I, end - t, air(I, { pal: home, lock: 1, mv: 0 }), 4, 0, 0.4);
  }

  // ---- 尺を6分ちょうどに合わせる ----
  // 部ごとの割合（±10%の振れ）はそのままに、**全体を一度だけ伸縮させる。**
  // 景の長短の関係も、事の進みかたも、層の時計も、比のまま保たれる。
  // 端数は最後の景で吸って、合計をぴったり TOTAL にする。
  // **ここは層の時計（lyD）と音（composeMusic が movements を読む）より前に置くこと。**
  {
    const k = TOTAL / t;
    let acc = 0;
    for (const s of shots) { s.dur *= k; s.start = acc; acc += s.dur; }
    const last = shots[shots.length - 1];
    if (last) last.dur += TOTAL - acc;
    t = TOTAL;
  }

  // **長い景で画面を止めない。** 5秒以上の景に「動かない」を許すと、
  // 図が静止しているものだったとき 0.5秒で 0.16% しか動かず、
  // 実測で「静止画に見える」に落ちる（実際に落ちた）。
  // 動かない景を許さないだけでなく、**動く量にも下限を置く。**
  // 寄りが 8秒で 19% しか無いと、面で描いた絵では画素がほとんど変わらない
  // （実測 0.18%／0.5秒）。長い景ほど大きく動かす。
  // 下限は **4秒**（実測の「長い景」の線と同じ）。5秒にしていたとき、
  // 4.5秒の梯の景が 0.79%／0.5秒で「静止画に見える」に落ちた。
  for (const s of shots) {
    if (s.dur < 4) continue;
    if (s.mv === 0) s.mv = pick(rng, [1, 2, 4]);
    // 揺れ（mv 3）は地が付いてこないので面がほとんど変わらない。
    // 長い景では寄り・流し・傾きに替える。
    if (s.mv === 3) s.mv = pick(rng, [1, 2, 4]);
    s.mvA = Math.max(s.mvA, 0.8);
    // **地も一緒に動かす。** 図だけ流すと、面積の大半を占める地が
    // 止まったままなので画面が固まって見える（実測 0.66%／0.5秒）。
    s.gmv = 1;
  }
  // ---- 層（断をまたいで続くもの） ----
  // **景は切れる。層は切れない。** 水位・日・塵・歩のどれかを1つ選び、
  // 作品の頭から終わりまで**同じ時計**で動かす（時計は絶対時刻）。
  // 断のたびに絵が全部入れ替わっても、そこだけは続いているので、
  // 6分が「6分の1本」としてつながる。依頼者の求め:
  //   「シーンとかカットをまたいでるようなレイヤーがあってもいいんじゃないか」
  {
    const lay = 1 + Math.floor(rng() * 4);
    const lyA = rng(), lyB = rng(), lyDir = rng() < 0.5 ? -1 : 1;
    for (const s of shots) {
      s.lay = lay; s.lyT0 = 0; s.lyD = t;
      s.lyA = lyA; s.lyB = lyB; s.lyDir = lyDir;
      // 展開部のいちばん細かい断だけ細くする（画面が混むので）。
      // **消さない。** 消すと「そこだけ別の作品」になる
      s.lyW = (s.sec === 2 && s.dur < 1.0) ? 0.5 : 1;
      // **日（円）の層のときは、地の円をやめる。** 円が2つ重なると
      // どちらが続いているものなのか分からなくなる（実際にそう見えた）
      if (lay === 2 && s.gk === 3) s.gk = 0;
    }
  }
  // ---- 禁：白に近い地に、赤い円を置かない ----
  // 白・黒・赤は対比が最強なので配色に入れてある。円は地の割りの1つで、
  // 「日」（円が渡っていく）は層の1つ。この3つが重なると
  // **生成りの地に赤い丸＝日の丸**になる（実測 17,290景に41景・100種のうち28種）。
  //
  // 狙っていない型が乗ると、あとの全部がそれについての論評として読まれる。
  // 三度目の失敗が「型を読み当てられた時点で冷める」だったので、
  // **意図していない型が乗ることは、この作品では不具合である。**
  // 円も赤も残す。重なりだけを外す。
  for (const s of shots) {
    const c = colorsOf(s);
    if (!nearWhite(c.g)) continue;
    if (s.gk === 3 && isRed(s.g2 ? c.a : c.i)) {
      s.g2 = !s.g2;                                   // 円を図の色で置く
      if (isRed(s.g2 ? c.a : c.i)) s.gk = pick(rng, [0, 1, 2, 5]);   // それでも赤なら円をやめる
    }
    if (s.lay === 2 && isRed(layerColor(c, 0))) s.lyAlt = 1;         // 日を2番目の色で置く
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
    title: TITLE + ' ' + String(((seed | 0) % 1000 + 1000) % 1000).padStart(3, '0'),
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
  // 貌 — **数を絞ること自体が法。** 少なすぎても多すぎても落ちる
  const share = {};
  for (const s of S) share[s.m] = (share[s.m] || 0) + s.dur;
  const kinds = Object.keys(share).length;
  if (kinds < LAWS.minMotifs) bad.push(`貌: 図が ${kinds} 種しかない（${LAWS.minMotifs} 以上）`);
  if (kinds > LAWS.maxMotifs) bad.push(`貌: 図が ${kinds} 種ある（${LAWS.maxMotifs} 以下に絞る）`);
  for (const k in share) {
    const r = share[k] / work.total;
    if (r > LAWS.maxSameShare) bad.push(`貌: 「${NAMES[k]}」が全体の ${(r * 100) | 0}%（${(LAWS.maxSameShare * 100) | 0}% 以下）`);
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
  // 間・余白・異
  if (!S.some((s) => s.dur >= LAWS.minHold)) bad.push(`間: ${LAWS.minHold}秒以上の景が無い`);
  if (S.filter((s) => s.empty).length < LAWS.minEmpty) bad.push('間: 空の景が無い');
  // 余白 — **枚数ではなく尺で見る。** 展開部は枚数が多いので、
  // 枚数で割ると「息をしている時間」が見えない（実測で 10% に見えた）
  const qs = S.filter((s) => s.sparse).reduce((a, s) => a + s.dur, 0) / work.total;
  if (qs < LAWS.minQuietShare) bad.push(`余白: 疎な景が ${(qs * 100) | 0}%（${(LAWS.minQuietShare * 100) | 0}% 以上）`);
  const rests = S.filter((s) => s.sparse && s.dur >= 2.5).length;
  if (rests < LAWS.minRest) bad.push(`余白: ための景が ${rests} 枚しかない（${LAWS.minRest} 以上）`);
  // 層 — 断をまたいで続くものが1つ通っていること
  const lays = new Set(S.map((s) => s.lay | 0));
  if (lays.size !== 1 || lays.has(0)) bad.push(`層: 断をまたぐ層が通っていない（${[...lays].join('/')}）`);
  if (S.some((s) => Math.abs((s.lyD || 0) - work.total) > 0.01)) bad.push('層: 層の時計が作品全体になっていない');
  if (S.filter((s) => s.odd).length < LAWS.minOdd) bad.push('異: 違和感が足りない');
  if (new Set(S.map((s) => s.hand)).size < LAWS.minHands) bad.push('異: 塗りかたが足りない');
  // 禁：白に近い地に赤い円（日の丸）を置かない
  for (const s of S) {
    const c = colorsOf(s);
    if (!nearWhite(c.g)) continue;
    if (s.gk === 3 && isRed(s.g2 ? c.a : c.i)) bad.push(`禁: ${s.start.toFixed(1)}秒 白地に赤い円（地の円）`);
    if (s.lay === 2 && isRed(layerColor(c, s.lyAlt))) bad.push(`禁: ${s.start.toFixed(1)}秒 白地に赤い円（層の日）`);
  }
  // 安全
  for (let i = 1; i < S.length; i++) {
    if (S[i].flash && S[i - 1].flash && S[i].start - S[i - 1].start < 1 / LAWS.maxFlashPerSec) {
      bad.push(`安全: ${S[i].start.toFixed(1)}秒で閃光が毎秒${LAWS.maxFlashPerSec}回を超える`);
    }
  }
  return bad;
}

export { NAMES, MOTIFS };
