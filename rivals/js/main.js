// ============================================================
//  画面の切り替えと設定。ここがアプリの入口。
// ============================================================
import { CARDS, COLLECTIBLE, CLASSES, PLAYABLE_CLASSES, TENSION_SKILLS, KEYWORD_TEXT } from './cards.js';
import { PRESET_DECKS, decksForClass } from './decks.js';
import { AI_TYPES, AI_LEVELS } from './ai.js';
import { startBattle, abortBattle } from './ui.js';
import { initBuilder, initCollection } from './builder.js';
import { load, update } from './storage.js';
import { hideTip } from './view.js';
import { leaderSvg, artSvg } from './art.js';
import { setSound, SFX } from './audio.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'leader', 'opponent', 'battle', 'builder', 'collection', 'rules'];

let pick = { myClass: null, myDeck: null, level: 'normal', type: 'midrange', oppDeckId: null, first: 'random' };
let builderReady = false, collectionReady = false;

// ------------------------------------------------------------
//  ルーティング
// ------------------------------------------------------------
function show(name) {
  if (!SCREENS.includes(name)) name = 'title';
  for (const s of SCREENS) $('screen-' + s).classList.toggle('is-active', s === name);
  window.scrollTo(0, 0);
  if (name !== 'battle') abortBattle();
  if (name === 'title') renderTitle();
  if (name === 'leader') renderLeaders();
  if (name === 'opponent') renderOpponent();
  if (name === 'builder' && !builderReady) { initBuilder(); builderReady = true; }
  if (name === 'collection' && !collectionReady) { initCollection(); collectionReady = true; }
  if (name === 'rules') renderRules();
}
function go(name) { location.hash = '#' + name; }
window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'title'));

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) { SFX.tap(); go(b.dataset.go); }
});
// 吹き出しは、その対象から離れたら必ず消す（スマホでは hover が効かないため）
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.pcard,.b-row,.hcard,.unit')) hideTip();
}, true);
window.addEventListener('scroll', hideTip, true);

// ------------------------------------------------------------
//  タイトル
// ------------------------------------------------------------
let crestDone = false;
function renderTitle() {
  if (!crestDone) {
    crestDone = true;
    const host = document.querySelector('.title-crest');
    if (host) host.innerHTML = artSvg(CARDS.slime);
  }
  const d = load();
  const r = d.records;
  const total = r.win + r.lose + r.draw;
  $('title-record').innerHTML = total
    ? `戦績 ${r.win}勝 ${r.lose}敗${r.draw ? ` ${r.draw}分` : ''}（勝率 ${Math.round(r.win / Math.max(1, r.win + r.lose) * 100)}%）` +
      (Object.keys(r.byLevel || {}).length
        ? '<br><span style="font-size:.76rem;color:var(--washi-sub)">' +
          Object.entries(r.byLevel).map(([k, v]) => `${(AI_LEVELS[k] || {}).name || k} ${v.win}勝${v.lose}敗`).join('　') + '</span>'
        : '')
    : 'まだ対戦していません';
}

// ------------------------------------------------------------
//  自分のリーダー選択
// ------------------------------------------------------------
function renderLeaders() {
  const d = load();
  if (!pick.myClass) pick.myClass = d.last.myClass || PLAYABLE_CLASSES[0];
  $('leader-grid').innerHTML = PLAYABLE_CLASSES.map(c => {
    const sk = TENSION_SKILLS[c];
    return `<div class="leader-card ${c === pick.myClass ? 'is-on' : ''}" data-cls="${c}">
      <div class="lc-portrait">${leaderSvg(c)}</div>
      <div class="lc-cls">${CLASSES[c].name}</div>
      <div class="lc-name">${CLASSES[c].leader}</div>
      <div class="lc-skill"><b>${sk.name}</b>${sk.text}</div>
    </div>`;
  }).join('');
  $('leader-grid').querySelectorAll('.leader-card').forEach(n => {
    n.onclick = () => { SFX.tap(); pick.myClass = n.dataset.cls; pick.myDeck = null; renderLeaders(); };
  });
  renderDeckChoice();
}

function allDecksFor(cls) {
  const mine = load().decks.filter(d => d.cls === cls).map(d => ({ ...d, custom: true, type: 'midrange', desc: '自作デッキ' }));
  return [...mine, ...decksForClass(cls)];
}

function renderDeckChoice() {
  const list = allDecksFor(pick.myClass);
  if (!pick.myDeck || !list.some(d => d.id === pick.myDeck)) pick.myDeck = list[0] ? list[0].id : null;
  $('deck-choice').innerHTML = list.map(d => `
    <div class="deck-opt ${d.id === pick.myDeck ? 'is-on' : ''}" data-id="${d.id}">
      <b>${d.name}</b>${d.custom ? '<span class="tag">自作</span>' : ''}
      <p>${d.desc || ''}</p>
    </div>`).join('') || '<p style="color:var(--washi-sub)">この職業のデッキがありません</p>';
  $('deck-choice').querySelectorAll('.deck-opt').forEach(n => {
    n.onclick = () => { SFX.tap(); pick.myDeck = n.dataset.id; renderDeckChoice(); };
  });
  $('to-opponent').disabled = !pick.myDeck;
}
$('to-opponent').onclick = () => {
  update(d => { d.last.myClass = pick.myClass; d.last.myDeck = pick.myDeck; });
  go('opponent');
};

// ------------------------------------------------------------
//  相手選択
// ------------------------------------------------------------
function renderOpponent() {
  $('level-row').innerHTML = Object.entries(AI_LEVELS).map(([k, v]) =>
    `<button class="opt ${k === pick.level ? 'is-on' : ''}" data-k="${k}"><b>${v.name}</b><small>${v.desc || ''}</small></button>`).join('');
  $('type-row').innerHTML = Object.entries(AI_TYPES).map(([k, v]) =>
    `<button class="opt ${k === pick.type ? 'is-on' : ''}" data-k="${k}"><b>${v.name}</b><small>${v.desc}</small></button>`).join('');

  const decks = [{ id: '', name: 'おまかせ', desc: '毎回ランダムに選ばれる', cls: null }, ...PRESET_DECKS];
  if (!decks.some(d => d.id === (pick.oppDeckId ?? ''))) pick.oppDeckId = '';
  $('opp-deck-row').innerHTML = decks.map(d =>
    `<button class="opt ${d.id === (pick.oppDeckId || '') ? 'is-on' : ''}" data-k="${d.id}">
      <b>${d.cls ? CLASSES[d.cls].name + '／' : ''}${d.name}</b><small>${d.desc || ''}</small></button>`).join('');

  $('first-row').innerHTML = [['random', 'ランダム', '毎回決め直す'], ['me', '先攻', 'あなたが先に動く'], ['opp', '後攻', '手札4枚＋テンション2＋せいすい']]
    .map(([k, n, s]) => `<button class="opt ${k === pick.first ? 'is-on' : ''}" data-k="${k}"><b>${n}</b><small>${s}</small></button>`).join('');

  wire('level-row', k => pick.level = k);
  wire('type-row', k => pick.type = k);
  wire('opp-deck-row', k => pick.oppDeckId = k);
  wire('first-row', k => pick.first = k);
}
function wire(id, set) {
  $(id).querySelectorAll('.opt').forEach(n => {
    n.onclick = () => {
      SFX.tap();
      $(id).querySelectorAll('.opt').forEach(x => x.classList.remove('is-on'));
      n.classList.add('is-on'); set(n.dataset.k);
    };
  });
}

$('start-battle').onclick = () => {
  const myList = allDecksFor(pick.myClass);
  const my = myList.find(d => d.id === pick.myDeck) || myList[0];
  if (!my) { alert('デッキがありません'); return; }
  const oppPool = pick.oppDeckId ? PRESET_DECKS.filter(d => d.id === pick.oppDeckId) : PRESET_DECKS;
  const opp = oppPool[Math.floor(Math.random() * oppPool.length)];
  const first = pick.first === 'random' ? Math.random() < 0.5 : pick.first === 'me';
  go('battle');
  startBattle({
    myClass: pick.myClass, myDeck: my.cards, myDeckName: my.name,
    oppClass: opp.cls, oppDeck: opp.cards, oppDeckName: opp.name,
    oppName: CLASSES[opp.cls].leader,
    oppTag: `${AI_LEVELS[pick.level].name}・${AI_TYPES[pick.type].name}`,
    aiType: pick.type, aiLevel: pick.level, playerFirst: first,
  }, onBattleEnd);
};

function onBattleEnd(res) {
  update(d => {
    const r = d.records;
    if (res.draw) r.draw++; else if (res.win) r.win++; else r.lose++;
    const lv = res.conf.aiLevel;
    r.byLevel[lv] = r.byLevel[lv] || { win: 0, lose: 0 };
    if (!res.draw) { if (res.win) r.byLevel[lv].win++; else r.byLevel[lv].lose++; }
  });
}

// ------------------------------------------------------------
//  あそびかた
// ------------------------------------------------------------
let rulesReady = false;
function renderRules() {
  if (rulesReady) return; rulesReady = true;
  const cell = (on, t) => `<div class="dcell ${on ? 'on' : ''}">${t || ''}</div>`;
  const kwRows = Object.entries(KEYWORD_TEXT).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  const heroRows = COLLECTIBLE.map(id => CARDS[id]).filter(c => c.type === 'hero')
    .map(c => `<tr><th>${c.name}<br><small style="color:var(--washi-sub)">${CLASSES[c.cls].name}・${c.cost}コスト</small></th>
      <td>${c.skills.map((sk, i) => `<b style="color:#9fd8ff">Lv${i + 1} ${sk.name}</b>（${sk.cost}MP）${sk.text}`).join('<br>')}</td></tr>`).join('');
  const dungeonRows = COLLECTIBLE.map(id => CARDS[id]).filter(c => c.type === 'dungeon')
    .map(c => `<tr><th>${c.name}<br><small style="color:var(--washi-sub)">${CLASSES[c.cls].name}・${c.cost}コスト</small></th>
      <td>${c.text}</td></tr>`).join('');
  const skRows = PLAYABLE_CLASSES.map(c => {
    const s = TENSION_SKILLS[c];
    return `<tr><th>${CLASSES[c].name}<br><small style="color:var(--washi-sub)">${CLASSES[c].leader}</small></th>
      <td><b style="color:var(--kin)">${s.name}</b><br>${s.text}</td></tr>`;
  }).join('');

  $('rules-body').innerHTML = `
    <h3>勝ち方</h3>
    <p>相手リーダーのHP（25）を0にすれば勝ちです。デッキは30枚。山札が尽きたあとにカードを引くと、
       引くたびに増えるダメージを自分が受けます。</p>

    <h3>ターンの流れ</h3>
    <ul>
      <li>MPの上限が1増える（最大10）。MPは毎ターン全回復します。</li>
      <li>カードを1枚引く。手札は10枚まで。</li>
      <li>カードを使い、ユニットで攻撃し、ターンを終える。</li>
      <li>先攻は手札3枚。後攻は手札4枚＋テンション2段階＋「まほうのせいすい」（MP+1）。</li>
    </ul>

    <h3>盤面は3段2列</h3>
    <p>自分の場は<b>上段・中段・下段</b>の3段、それぞれに<b>前列</b>と<b>後列</b>があります（6マス）。
       どこに置くかがこのゲームのいちばん大事なところです。</p>
    <div class="diagram">
      <div class="drow"><span class="dlabel">後列</span>${cell(0)}${cell(1, '魔')}${cell(0)}</div>
      <div class="drow"><span class="dlabel">前列</span>${cell(1, '壁')}${cell(1, '兵')}${cell(0)}</div>
    </div>
    <p>この形なら、中段の「魔」は前にいる「兵」に守られていて攻撃されません（ブロック）。
       下段は空いているので、リーダーは攻撃されます（ウォール未成立）。</p>

    <h3>3つの決まりごと</h3>
    <table>
      <tr><th>ブロック</th><td>同じ段の前列にユニットがいるとき、その後ろの後列ユニットは攻撃できない。</td></tr>
      <tr><th>ウォール</th><td>3段すべてに敵ユニットがいるとき、敵リーダーを攻撃できない。</td></tr>
      <tr><th>におうだち</th><td>前列に「におうだち」がいるとき、敵はそれしか攻撃できない。後列では効果がない。</td></tr>
    </table>

    <h3>特性</h3>
    <table>${kwRows}</table>

    <h3>テンションスキル</h3>
    <p>「ためる」などでテンションゲージを3段階まで溜めると、リーダー固有のスキルが撃てます。
       使うとゲージは0に戻ります。MPは消費しません。</p>
    <table>${skRows}</table>

    <h3>英雄（ヒーローカード）</h3>
    <p>英雄カードを使うと、そのターンから<b>共闘</b>が始まります。共闘中は
       <b>1ターンに1度だけヒーロースキル</b>が使えます（MPを消費します）。
       スキルは<b>使うほどレベルが上がって強くなります</b>。
       リーダー帯の青いボタンがヒーロースキルです。</p>
    <table>${heroRows}</table>
    <p>「ロトの血を引く者」は、デッキに入れておくと<b>必ず初手に来ます</b>。</p>

    <h3>ダンジョン</h3>
    <p>ダンジョンは場のマスを1つ使って置かれます。決まった条件を満たすたびに<b>耐久値</b>がたまり、
       目標に届くと<b>踏破</b>して効果が起き、そのまま消えます。</p>
    <ul>
      <li>ユニットではないので、<b>攻撃もしないし攻撃もされません</b>。</li>
      <li>ブロックにもウォールにも数えません。マスを1つ使う代わりに、後で大きな見返りがあります。</li>
    </ul>
    <table>${dungeonRows}</table>

    <h3>選択</h3>
    <p>「選択」と書かれたカードは、使うときに<b>2つの効果から自分で1つ選びます</b>。
       占い師のタロットがランダムなのに対して、こちらは必ず選べます。</p>

    <h3>テンションリンク</h3>
    <p>「テンションリンク」を持つユニットは、<b>味方がテンションスキルを使ったとき</b>に追加の効果を出します。
       テンションをためる意味が増えます。</p>

    <h3>操作</h3>
    <ul>
      <li>手札を押す → ユニットは置くマス、特技は対象を選びます。</li>
      <li>金色に光っている自分のユニットを押す → 攻撃できる相手が赤く光ります。</li>
      <li>武器を装備しているとリーダー自身も攻撃できます（自分のリーダー帯を押す）。</li>
      <li>召喚したターンは攻撃できません（「速攻」を除く）。</li>
      <li>占い師のタロットは①②のどちらかがランダムで出ます。「銀のタロット」などで必中モードにすると自分で選べます。</li>
    </ul>

    <h3>このゲームについて</h3>
    <p>2017年11月から2021年7月5日まで遊べたカードゲーム（後期は『ドラゴンクエストライバルズ エース』）の
       ルールを、公開されている情報と記憶をもとに再現したものです。
       英雄・ダンジョン・選択は、サービス終了時点の版にあった仕組みです。
       カードの数値や効果は原作と完全には一致しません。画像・音声は一切使っておらず、
       すべてブラウザの中だけで動きます。通信対戦はありません。</p>`;
}

// ------------------------------------------------------------
//  起動
// ------------------------------------------------------------
setSound(load().settings.sound !== false);
show(location.hash.slice(1) || 'title');
