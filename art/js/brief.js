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
// **記事を絵で説明しない、という線は守る。**
// 受け取るのは「何が起きるか」（沈む・剥がれる・列が崩れる・一つだけ残る）で、
// 「何について書かれているか」（主題・固有名詞・結論）は受け取らない。
// だから語から選ぶのは**骨格・層・速さ・厚み**だけで、
// 記事の題名を題名にしたり、文字を画面に出したりはしない。
//
// 使いかた:
//   const b = briefFromText({ title, body }, seed);
//   composeWork(seed, b);
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

// 語 → 層（断をまたいで続くもの）
const WORD_LAYER = [
  [['水', '沈', '満ち', '浸', '海', '潮', '溢'], 1],   // 水位
  [['日', '朝', '夜', '時間', '年', '月', '光', '影'], 2],   // 日
  [['塵', '散', '粒', '砂', '雪', '埃', '消え'], 3],   // 塵
  [['歩', '人', '誰', '行', '来', '旅', '街', '町'], 4],   // 歩
];

const countHits = (text, words) => words.reduce((n, w) => n + (text.split(w).length - 1), 0);

// ---- 指示書を組む -----------------------------------------------------
export function briefFromText(article, seed) {
  const title = (article && article.title) || '';
  const body = (article && article.body) || '';
  const text = title + '\n' + title + '\n' + body;      // 題名は2回読む（重くする）
  const rng = makeRng((seed | 0) * 2246822519 + 917);

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
  // 同点は種で割る（毎回同じ順にならないように）
  const order = FORM_KEYS
    .map((k, i) => ({ i, k, v: w[k] + rng() * 0.4 }))
    .sort((a, b) => b.v - a.v);
  const forms = order.slice(0, 5).map((x) => x.i);

  // 層
  let layer = 0;
  let best = 0;
  for (const [words, idx] of WORD_LAYER) {
    const n = countHits(text, words);
    if (n > best) { best = n; layer = idx; }
  }
  if (!layer) layer = 1 + Math.floor(rng() * (LAYER_NAMES.length - 1));

  // 尺は記事の長さから（長い記事＝長い作品）。270〜540秒に収める
  const len = body.length + title.length;
  const total = Math.round(Math.max(270, Math.min(540, 270 + len * 0.12)));

  // 文の調子から音の向きを決める。
  //   句点が多い（短く切る文）＝速い・拍が多い
  //   句点が少ない（長く続く文）＝遅い・拍が少ない
  const stops = (text.match(/[。！？.!?]/g) || []).length;
  const per = stops ? len / stops : 60;                  // 1文の長さ
  const fast = per < 40;
  const dense = (text.match(/[、,]/g) || []).length / Math.max(1, stops);

  return {
    from: {                                              // 何を読んで決めたか（記録用）
      words: [...new Set(hitWords)].slice(0, 12),
      文字数: len, 文の数: stops, 一文の長さ: Math.round(per),
    },
    forms,
    opening: forms[Math.floor(rng() * Math.min(3, forms.length))],
    layer,
    total,
    tempoBias: fast ? 1 : -1,                            // 速さの向き
    beatsBias: fast ? 1 : dense > 2 ? 0 : -1,            // 拍の多さの向き
    devColor: dense > 2.2 ? '太鼓と聲' : fast ? '太鼓' : per > 90 ? '弦の厚み' : null,
  };
}
