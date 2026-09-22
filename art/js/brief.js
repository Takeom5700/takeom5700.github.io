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
  const pool = FORM_KEYS.map((k, i) => ({ i, p: Math.pow(w[k] + 0.06, heat) }));
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
      読んだ場所: focus,
      直接さ: Math.round(direct * 100) / 100,
      文字数: len, 文の数: stops, 一文の長さ: Math.round(per),
    },
    forms,
    opening: forms[Math.floor(rng() * forms.length)],
    layer,
    total,
    tempoBias: fast ? 1 : -1,                            // 速さの向き
    beatsBias: fast ? 1 : dense > 2 ? 0 : -1,            // 拍の多さの向き
    devColor: dense > 2.2 ? '太鼓と聲' : fast ? '太鼓' : per > 90 ? '弦の厚み' : null,
  };
}
