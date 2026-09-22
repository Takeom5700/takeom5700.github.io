// 指示書（brief）— **記事の内容から、その日の作品に出る要素を決める。**
//
// 依頼者:
//   「作品にどのような要素を出すかは、インプットしたnote記事の内容から
//     着想を得るようにしてね」
//
// **種（seed）は記事のハッシュでしかなかった。** ハッシュは中身を読んでいないので、
// 「記事から着想を得た」とは言えない（記事が変われば違う作品にはなるが、
// その記事だからその作品になった、という関係が無い）。
// ここは**記事の言葉を読んで、出す要素を選ぶ**。
//
// **「記事を絵で説明しない」は法ではなく、作品ごとの度合い（直接さ）。**
// 依頼者:
//   「記事を絵で説明しないという線、これ守っても守らなくてもどっちでもいいよ。
//     でも説明的にはならない方がいいっていうのはアートとしてはあるよな。
//     それは時によって」
// だから `直接さ`（0〜1）を作品ごとに振る。
//   低い … 記事の語からほとんど離れる（何が起きるかだけを薄く受け取る）
//   高い … 記事がいちばん強く言っていることを、そのまま形にする
// **どちらも許す。** ただし画面に文字を出さない・固有名詞を出さないという線は
// 哲学の側なので動かさない（読む人によって別の作品になるため）。
//
// **同じ記事から、いくつも全く別の作品が出ること。**
// 依頼者「同じ記事であってもいくつも全く新しい別のものができるっていうぐらいの
// ことを、作ろうと思えばできるような仕組みにしていてね」。
// だから語の重みから**選び取る（サンプリングする）**。重い順に上から5つ取ると、
// 同じ記事から毎回同じ5つしか出ない（一対一になる）。
// 種を変えれば**同じ記事の別の読み**が出る（一対多）。
//
// 使いかた:
//   const b = briefFromText({ title, body }, seed);   // 種ごとに別の読み
//   composeWork(seed, b);
//   node art/tools/readings.mjs --title ... --body ...   # 同じ記事の読みを並べる
//
// **これは機械の読みなので粗い。** Claude が記事を実際に読んで書く指示書の方が
// 本命で、その場合は同じ形の物を手で組んで渡す（`art/DAILY-PROMPT.md`）。

import { makeRng } from './rng.js';
import { FORM_KEYS } from './form.js';
import { LAYER_NAMES } from './layer.js';

// ---- 語 → 起きること ---------------------------------------------------
// 左の語が本文にあると、右の骨格が重くなる。
// **物の名前ではなく「起きること」で引くこと。**
// 「町」という語で町を描いてしまうと、記事の説明になる。
// 「減っていく」で柵（列から一つ倒れる）を引くのが正しい。
const WORD_FORMS = [
  // 減る・崩れる・消える → 列から一つ倒れる／崩れる
  [['減', '消え', '失', '崩', '壊', '滅', '離れ', '去', '抜け', '欠け', '空洞', '廃'], { fence: 3, tower: 2, vessel: 1 }],
  // 沈む・満ちる・流れる → 波・器
  [['沈', '満ち', '流れ', '溢', '浸', '水', '海', '波', '雨', '涙', '溶け'], { wave: 3, vessel: 2, well: 2, thread: 1 }],
  // 積む・登る・上がる → 階・櫓
  [['積', '登', '上が', '昇', '伸び', '育', '成長', '段', '重ね', '築'], { stair: 3, tower: 3, lamp: 1 }],
  // 待つ・座る・留まる → 台
  [['待', '座', '留ま', '止ま', '残', '居', '休', '眠', '静'], { seat: 3, lamp: 1, window: 1 }],
  // 通る・越える・移る → 門・橋
  [['通', '越え', '渡', '移', '過ぎ', '道', '橋', '門', '境', '出口', '入口', '往'], { gate: 3, stair: 1, sail: 1 }],
  // 群れる・増える・散る → 群
  [['群', '増え', '散', 'collective', '大勢', '無数', '粒', '砂', '雪', '塵'], { swarm: 3, thread: 1 }],
  // 見る・覗く・隔てる → 窓
  [['見', '覗', '眺め', '隔て', '窓', '画面', '向こう', '外', '内'], { window: 3, gate: 1 }],
  // 守る・覆う・隠す → 傘
  [['守', '覆', '隠', '庇', '傘', '影', '陰', '屋根', '包'], { canopyTree: 3, window: 1 }],
  // 運ぶ・進む・風 → 帆
  [['運', '進', '風', '帆', '旗', '船', '揺れ', '翻'], { sail: 3, wave: 1 }],
  // 汲む・掘る・深い → 井
  [['汲', '掘', '深', '井', '穴', '底', '源', '地下'], { well: 3, vessel: 1 }],
  // 割れる・注ぐ・容れる → 器
  [['割', '注', '容れ', '入れ', '器', '壺', '杯', '中身', '空っぽ'], { vessel: 3, well: 1 }],
  // つながる・解ける・細い → 糸
  [['繋', 'つなが', '結', '解け', '糸', '線', '細', '垂れ', '絡'], { thread: 3, swarm: 1 }],
  // 照らす・示す・標 → 標
  [['照ら', '示', '標', '灯', '光', '合図', '目印', '柱'], { lamp: 3, tower: 1 }],
];

// ---- 語 → 時間の印象 --------------------------------------------------
// **BPM・拍子・リズムも記事から決める。**
// 依頼者「BPMテンポや拍子やリズムも毎回noteの記事から得た印象に従って
// 変わるようにして」。
// 速さは「文の長さ」だけでは足りない（短い文でも静かな記事がある）。
// **急ぐ語・留まる語を数えて、そこから速さの印象を作る。**
const WORD_FAST = ['急', '走', '駆け', '一気', '瞬', '慌', '追わ', '追い', '加速',
  '騒', '押し寄せ', '次々', 'どんどん', '崩れ落ち', '飛び', '叫'];
const WORD_SLOW = ['静', '待', '沈', 'ゆっくり', 'じっと', '長い', '延々', '澱',
  '留ま', '止ま', '眠', '黙', '佇', 'horizon', '果て', '遠い'];
// 揺れ（拍を崩す感じ）を作る語
const WORD_UNEVEN = ['歪', 'ずれ', 'よろ', 'つまず', 'ばらばら', '不意', '突然',
  '迷', '乱', '斜め', 'いびつ', '半端'];

// 語 → 層（断をまたいで続くもの）
const WORD_LAYER = [
  [['水', '沈', '満ち', '浸', '海', '潮', '溢'], 1],   // 水位
  [['日', '朝', '夜', '時間', '年', '月', '光', '影'], 2],   // 日
  [['塵', '散', '粒', '砂', '雪', '埃', '消え'], 3],   // 塵
  [['歩', '人', '誰', '行', '来', '旅', '街', '町'], 4],   // 歩
];

const countHits = (text, words) => words.reduce((n, w) => n + (text.split(w).length - 1), 0);

// ---- 指示書を組む -----------------------------------------------------
// `opts.avoid` … **直前の1本で使った骨格のキー。** ここに入っているものは
//                 候補そのものから外す（14 のうち5つを外しても9つ残る）。
// `opts.soften` … **その前の1本で使った骨格。** 重みを 1/25 に落とすだけ。
//
// **重みに掛けるだけでは効かない。** 最初は `avoid` に 0.04 を掛けていたが、
// 重みは `Math.pow(w + 0.06, heat)`（heat は最大 3.15）で尖らせてあるので、
// 記事が強く言っている骨格は 200 倍以上に膨らむ。そこに 0.04 を掛けても
// 一度も出ていない骨格より桁で大きく、**5つのうち4つがそのまま再登場した**
// （実測）。だから直前のぶんは候補から外す。
//
// **台帳の `形` は5つの組をまとめて見るので、1つだけ同じでも通ってしまう。**
// 依頼者「椅子のモチーフは以前見た。将来的に偶然また出てくるのならばいいが、
// 初回で2回連続は仕組みの不備である可能性が高い」——そのとおりで、
// 骨格は14しかなく1本に5つ使うから、素直に引くと**次の日も平均1.8個が再登場する**。
// 「二度と出さない」だと3日で骨格が尽きるので、**近いうちは出さない**を法にする。
export function briefFromText(article, seed, opts) {
  const title = (article && article.title) || '';
  const body = (article && article.body) || '';
  const avoid = new Set((opts && opts.avoid) || []);
  const soften = new Set((opts && opts.soften) || []);
  const rng = makeRng((seed | 0) * 2246822519 + 917);

  // **どこを読むか**も種で替える。同じ記事でも読む場所が変われば別の作品になる。
  const focus = ['題名', '前半', '後半', '全体'][Math.floor(rng() * 4)];
  const half = Math.floor(body.length / 2);
  const part = focus === '題名' ? title
    : focus === '前半' ? body.slice(0, half)
      : focus === '後半' ? body.slice(half)
        : body;
  const text = title + '\n' + part;

  // **直接さ**（0〜1）。高いほど記事がいちばん強く言っていることをそのまま形にし、
  // 低いほど語から離れる。説明的にするかどうかは、その作品ごとの判断。
  const direct = rng();
  // 重みの尖らせ方。直接さが高いと重い骨格に集中し、低いとほぼ均等に散る
  const heat = 0.35 + direct * 2.8;

  // 骨格の重み
  const w = {};
  for (const k of FORM_KEYS) w[k] = 0;
  const hitWords = [];
  for (const [words, gain] of WORD_FORMS) {
    const n = countHits(text, words);
    if (!n) continue;
    for (const ww of words) if (text.includes(ww)) hitWords.push(ww);
    for (const [k, g] of Object.entries(gain)) w[k] += n * g;
  }
  // 当たらなかったときは種で振る（記事が短い・英語だけ、などの日）
  const any = Object.values(w).some((v) => v > 0);
  if (!any) for (const k of FORM_KEYS) w[k] = rng();
  // **重い順に上から5つ取らないこと。** それをすると同じ記事から毎回同じ5つしか
  // 出ず、記事と作品が一対一になる（依頼者の求めは一対多）。
  // 重みを確からしさに変えて、そこから5つ**引く**（重複なし）。
  // 直前のぶんを外す。**ただし候補が5つを切ったら外すのをやめる**
  // （骨格は14しかないので、外しすぎると引けなくなる）。
  const banned = FORM_KEYS.length - avoid.size >= 6 ? avoid : new Set();
  const pool = FORM_KEYS
    .map((k, i) => ({ i, k, p: Math.pow(w[k] + 0.06, heat) * (soften.has(k) ? 0.04 : 1) }))
    .filter((x) => !banned.has(x.k));
  const forms = [];
  for (let n = 0; n < 5 && pool.length; n++) {
    const sum = pool.reduce((a, b) => a + b.p, 0);
    let r = rng() * sum;
    let k = 0;
    while (k < pool.length - 1 && (r -= pool[k].p) > 0) k++;
    forms.push(pool[k].i);
    pool.splice(k, 1);
  }

  // 層。こちらも「いちばん多い語」で決め打ちにせず、重みから引く
  const lw = [0, 0, 0, 0, 0];
  for (const [words, idx] of WORD_LAYER) lw[idx] += countHits(text, words);
  const lpool = [1, 2, 3, 4].map((i) => ({ i, p: Math.pow(lw[i] + 0.25, heat) }));
  const lsum = lpool.reduce((a, b) => a + b.p, 0);
  let lr = rng() * lsum, li = 0;
  while (li < lpool.length - 1 && (lr -= lpool[li].p) > 0) li++;
  const layer = lpool[li].i;

  // 尺は記事の長さを土台に、種で振る（同じ記事でも長い版と短い版が作れる）
  const len = body.length + title.length;
  const base = Math.max(270, Math.min(540, 270 + len * 0.12));
  const total = Math.round(Math.max(270, Math.min(540, base * (0.8 + rng() * 0.45))));

  // ---- 時間の印象（BPM・拍子・リズム）--------------------------------
  // 数えるもの: 一文の長さ／句読点の密度／文の長さのばらつき／
  //             疑問と感嘆／急ぐ語と留まる語／揺れの語／語の繰り返し
  const sentences = text.split(/[。！？.!?\n]+/).map((x) => x.trim()).filter((x) => x.length > 1);
  const stops = Math.max(1, sentences.length);
  const per = len / stops;                               // 一文の長さ
  const dense = (text.match(/[、,]/g) || []).length / stops;   // 一文あたりの読点
  // 文の長さのばらつき（同じ長さで続く記事は規則的、乱れる記事は不規則）
  const mean = sentences.reduce((a, b) => a + b.length, 0) / stops;
  const varr = Math.sqrt(sentences.reduce((a, b) => a + (b.length - mean) ** 2, 0) / stops) / Math.max(1, mean);
  const bangs = (text.match(/[！？!?]/g) || []).length / stops;
  const fastHits = countHits(text, WORD_FAST);
  const slowHits = countHits(text, WORD_SLOW);
  const unevenHits = countHits(text, WORD_UNEVEN);
  // 語の繰り返し（同じ語が何度も出る記事は、音も同じ形を繰り返す方が合う）
  //
  // **記事の長さで動く素性を作らないこと。** 最初は「2回以上出た3文字の割合」を
  // 全文で数えていた。これは長い記事なら必ず被るので、同じ文章を4回つないだだけで
  // 0.024 → 0.976 に跳ねた（＝長さの代理でしかなく、繰り返しを測っていない）。
  // その結果この素性がどの記事でも振り切れ、拍子は 4/4 に固定された。
  // いまは **120個ずつの窓で測って平均する**（＝その場の繰り返し具合）。
  // 長さを4倍しても値は動かず、同じ言い回しを近くで繰り返す記事だけ上がる。
  const grams = [];
  for (let i = 0; i + 2 < part.length; i += 1) {
    const g = part.slice(i, i + 3);
    if (/^[\u3040-\u30ff\u4e00-\u9fff]{3}$/.test(g)) grams.push(g);
  }
  const GW = 120;
  let racc = 0, rn = 0;
  for (let o = 0; o < grams.length; o += GW) {
    const c = grams.slice(o, o + GW);
    if (c.length < 40) continue;
    racc += 1 - new Set(c).size / c.length;
    rn++;
  }
  const repeat = rn ? racc / rn
    : (grams.length ? 1 - new Set(grams).size / grams.length : 0);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // 語の当たりも**一文あたりに直してから使う**（そのままだと長い記事ほど振り切れる）
  const fastR = fastHits / stops, slowR = slowHits / stops, unevenR = unevenHits / stops;
  // **速さの印象**（0=遅い 1=速い）。短い文は速く、急ぐ語で上げ、留まる語で下げる
  const pace = clamp01(
    0.5
    + (40 - Math.min(120, per)) / 110            // 一文が短いほど速い
    + (fastR - slowR) * 0.45
    + bangs * 0.2,
  );
  // **揺れ**（0=まっすぐ 1=崩れる）。文の長さがばらつく記事・揺れの語で上がる
  // 日本語の散文は文の長さのばらつき（変動係数）が 0.3〜1.0 に入るので、
  // 0.30 を地として引く（引かないと、どの記事も「崩れている」側に寄る）。
  const sway = clamp01((varr - 0.30) * 1.15 + unevenR * 0.55 + bangs * 0.12);
  // **刻みの細かさ**（0=大きく 1=細かく）。読点が多い記事は細かい
  // 読点の密度は 0.3〜7 まで振れるので、頭を抑えてから混ぜる
  const subdiv = clamp01(Math.min(1, dense / 3.2) * 0.85 + pace * 0.15);
  // **同じ形の繰り返し**（0=変える 1=繰り返す）
  const ostinato = clamp01(0.30 + repeat * 2.6 + (0.60 - varr) * 0.8);

  // **拍子は「重みを足す」のではなく「いちばん近い拍子」で選ぶ。**
  //
  // 最初は拍子ごとに `0.4 + ostinato * 1.6 + ...` と足し算で書いていた。
  // これは**項の数と係数の大きさで勝ち負けが決まる**ので、いちばん太い項を持つ
  // 拍子（4/4）が、記事の中身と関係なく全記事で勝った。
  //
  // だから拍子の側に「こういう記事の拍子である」という座標を持たせて、
  // 記事の座標との**距離**で重みを出す。勝つのはいちばん近い拍子で、
  // 項の数には依存しない。下駄（0.05）を履かせてあるので、
  // **同じ記事でも種が違えば遠い拍子が出ることがある**（一対多を残すため）。
  const HERE = { pace, sway, subdiv, ostinato };
  const METER_AT = {
    '4/4':  { pace: 0.50, sway: 0.12, subdiv: 0.30, ostinato: 0.80 },  // 規則的・淡々
    '2/2':  { pace: 0.75, sway: 0.18, subdiv: 0.20, ostinato: 0.70 },  // 大きく2つ・速い
    '3/4':  { pace: 0.32, sway: 0.30, subdiv: 0.42, ostinato: 0.38 },  // 歌う・ゆるい
    '6/8':  { pace: 0.62, sway: 0.28, subdiv: 0.78, ostinato: 0.48 },  // 流れる
    '9/8':  { pace: 0.45, sway: 0.52, subdiv: 0.86, ostinato: 0.30 },  // 流れて崩れる
    '12/8': { pace: 0.28, sway: 0.22, subdiv: 0.92, ostinato: 0.60 },  // 大河
    '5/4':  { pace: 0.44, sway: 0.86, subdiv: 0.38, ostinato: 0.15 },  // 崩れる・引っかかる
    '7/8':  { pace: 0.78, sway: 0.82, subdiv: 0.55, ostinato: 0.20 },  // 急いで崩れる
  };
  const meterW = {};
  for (const [k, at] of Object.entries(METER_AT)) {
    let d2 = 0;
    for (const f of ['pace', 'sway', 'subdiv', 'ostinato']) d2 += (HERE[f] - at[f]) ** 2;
    const d = Math.sqrt(d2);                             // 0（一致）〜2（真逆）
    meterW[k] = 0.05 + Math.pow(Math.max(0, 1 - d / 1.05), 3);
  }

  return {
    from: {                                              // 何を読んで決めたか（記録用）
      words: [...new Set(hitWords)].slice(0, 12),
      読んだ場所: focus,
      直接さ: Math.round(direct * 100) / 100,
      文字数: len, 文の数: stops, 一文の長さ: Math.round(per),
      読点の密度: Math.round(dense * 100) / 100,
      文の長さのばらつき: Math.round(varr * 100) / 100,
      急ぐ語: fastHits, 留まる語: slowHits, 揺れの語: unevenHits,
      繰り返し窓: rn,
      語の繰り返し: Math.round(repeat * 100) / 100,
      避けた形: [...avoid], 薄めた形: [...soften],
    },
    forms,
    opening: forms[Math.floor(rng() * forms.length)],
    layer,
    total,
    // ---- 時間（記事の印象そのまま）----
    pace: Math.round(pace * 100) / 100,
    sway: Math.round(sway * 100) / 100,
    subdiv: Math.round(subdiv * 100) / 100,
    ostinato: Math.round(ostinato * 100) / 100,
    meterW,
    devColor: dense > 2.2 ? '太鼓と聲' : pace > 0.62 ? '太鼓'
      : per > 90 ? '弦の厚み' : sway > 0.6 ? '太鼓と弦' : null,
  };
}
