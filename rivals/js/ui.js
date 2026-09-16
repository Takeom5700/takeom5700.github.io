// ============================================================
//  バトル画面
//  操作の可否はすべて engine.legalActions() から引くので、
//  画面とルールがずれることがない。
// ============================================================
import { CARDS, CLASSES, TENSION_SKILLS } from './cards.js';
import { createGame, FRONT, BACK, LEADER_HP } from './engine.js';
import { createAiController, AI_TYPES, AI_LEVELS } from './ai.js';
import { cardTint, kwBadges, subLabel, showTip, hideTip, gem, heroSkillLines } from './view.js';
import { artSvg, leaderSvg } from './art.js';
import { SFX } from './audio.js';

let game = null, myPi = 0, aiPi = 1, ai = null, conf = null;
let sel = null;            // 選択中のもの
let busy = false;          // 演出・AI思考中は操作を止める
let onFinish = null;       // 決着時に呼ぶ（main.js が戦績を記録する）

const $ = (id) => document.getElementById(id);
const el = {};
function cacheEls() {
  el.stage = $('stage'); el.board = $('board'); el.vs = $('vs-bar');
  el.enemyStrip = $('enemy-strip'); el.myStrip = $('my-strip');
  el.hand = $('my-hand'); el.hint = $('hint');
  el.overlay = $('overlay'); el.overlayBox = $('overlay-box');
  el.logPanel = $('log-panel'); el.logInner = $('log-inner');
  el.rotate = $('rotate-hint');
}

// 原作と同じ横画面。1280x720 のステージを画面に合わせて拡大縮小する。
const STAGE_W = 1280, STAGE_H = 720;
let rotateDismissed = false, forceRotate = false;
function fitStage() {
  if (!el.stage) return;
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = h > w;
  // 端末の回転がロックされている人向けに、盤面ごと90度回して大きく表示できる
  const rot = forceRotate && portrait;
  const s = rot ? Math.min(h / STAGE_W, w / STAGE_H) : Math.min(w / STAGE_W, h / STAGE_H);
  el.stage.style.transform = `translate(-50%,-50%) rotate(${rot ? 90 : 0}deg) scale(${s})`;
  if (el.rotate) el.rotate.hidden = !(portrait && w < 820) || rotateDismissed;
}

// ------------------------------------------------------------
//  開始
// ------------------------------------------------------------
export function startBattle(config, finishCb) {
  cacheEls();
  conf = config; onFinish = finishCb;
  myPi = config.playerFirst ? 0 : 1;
  aiPi = 1 - myPi;
  game = createGame({
    seed: (Math.random() * 1e9) >>> 0,
    first: 0,
    players: myPi === 0
      ? [{ name: 'あなた', cls: config.myClass, deck: [...config.myDeck] },
         { name: config.oppName, cls: config.oppClass, deck: [...config.oppDeck] }]
      : [{ name: config.oppName, cls: config.oppClass, deck: [...config.oppDeck] },
         { name: 'あなた', cls: config.myClass, deck: [...config.myDeck] }],
  });
  ai = createAiController(config.aiType, config.aiLevel);
  sel = null; busy = false;
  el.overlay.hidden = true;
  el.logPanel.hidden = true;
  bindOnce();
  fitStage();
  game.drainEvents();
  render();
  if (game.active === aiPi) runAiTurn();
}

let bound = false;
function bindOnce() {
  if (bound) return; bound = true;
  $('btn-end').onclick = () => { if (!busy && game.active === myPi) { clearSel(); doApply({ type: 'end' }); } };
  $('btn-log').onclick = () => { el.logPanel.hidden = !el.logPanel.hidden; renderLog(); };
  $('btn-quit').onclick = () => { if (!busy) confirmQuit(); };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.unit,.slot,.hcard,.lead,.btn-tension,.btn-hero,.overlay')) clearSel();
  });
  const ro = $('rot-ok');
  if (ro) ro.onclick = (e) => { e.stopPropagation(); rotateDismissed = true; el.rotate.hidden = true; };
  const rr = $('rot-turn');
  if (rr) rr.onclick = (e) => { e.stopPropagation(); forceRotate = !forceRotate; fitStage(); };
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', () => setTimeout(fitStage, 120));
}

// ------------------------------------------------------------
//  描画
// ------------------------------------------------------------
function render() {
  if (!game) return;
  hideTip();
  renderStrip(el.enemyStrip, aiPi, false);
  renderStrip(el.myStrip, myPi, true);
  renderBoard();
  renderHand();
  renderVs();
  const mine = game.active === myPi;
  $('btn-end').disabled = !mine || busy;
  applyHighlights();
}

function renderVs() {
  const me = game.p(myPi), op = game.p(aiPi);
  const mine = game.active === myPi;
  el.vs.innerHTML = `
    <span class="vs-side ${mine ? 'on' : ''}">${me.name}</span>
    <span class="vs-mid">VS</span>
    <span class="vs-side vs-side--r ${mine ? '' : 'on'}">${op.name}</span>
    <span class="vs-turn">${game.s.winner !== null ? '決着' : `${mine ? 'あなた' : '相手'}のターン ${game.s.turn}`}</span>`;
}

function renderStrip(root, pi, isMe) {
  const p = game.p(pi);
  const sk = TENSION_SKILLS[p.cls];
  const hero = p.hero ? CARDS[p.hero.cardId] : null;
  const hsk = game.heroSkill(pi);
  const canTension = isMe && p.tension >= 3 && game.active === myPi && game.s.winner === null;
  const canHero = isMe && hsk && !p.hero.usedThisTurn && p.mp >= hsk.cost
                  && game.active === myPi && game.s.winner === null;
  const C = 2 * Math.PI * 46;
  const frac = Math.min(1, p.tension / 3);
  const hpPct = Math.max(0, Math.min(100, p.hp / p.maxHp * 100));

  root.className = 'lead ' + (isMe ? 'lead--me' : 'lead--enemy')
                 + (isMe && game.active === myPi ? ' is-active' : '');
  root.dataset.pi = pi;
  root.innerHTML = `
    <div class="ld-portrait" title="テンション ${p.tension}/3">
      <svg class="ten-ring ${p.tension >= 3 ? 'full' : ''}" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ten-bg" cx="50" cy="50" r="46"/>
        <circle class="ten-fg" cx="50" cy="50" r="46" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>
      </svg>
      <div class="ld-face">${leaderSvg(p.cls)}</div>
      <div class="ld-ten">${p.tension}/3</div>
    </div>
    <div class="ld-info">
      <div class="ld-name">${p.name}<small>${CLASSES[p.cls].name}</small>${!isMe && conf.oppTag ? `<span class="ld-tag">${conf.oppTag}</span>` : ''}</div>
      <div class="hp-bar"><i style="width:${hpPct}%"></i><b>HP ${Math.max(0, p.hp)}</b></div>
      <div class="ld-row">
        <span class="ld-mp"><i class="mp-ico"></i>MP <b>${p.mp}</b>/${p.maxMp}</span>
        <span class="ld-deck"><i class="deck-ico"></i>${p.deck.length}</span>
        <span class="ld-hand">手札${p.hand.length}</span>
        ${p.weapon ? `<span class="ld-weapon">${p.weapon.name} ${p.weapon.atk}/${p.weapon.dur}</span>` : ''}
      </div>
      ${hero ? `<div class="ld-hero" data-hero="${pi}">英雄 ${hero.name}・Lv${p.hero.level + 1}</div>` : ''}
    </div>
    ${isMe ? `<div class="ld-btns">
      <button class="btn-tension" ${canTension ? '' : 'disabled'} title="${sk.name}：${sk.text}">テンション<small>${sk.name}</small></button>
      ${hero ? `<button class="btn-hero" ${canHero ? '' : 'disabled'}
          title="${hsk.name}（${hsk.cost}MP）：${hsk.text}">${hsk.name}<small>${hsk.cost}MP</small></button>` : ''}
    </div>` : ''}`;
  if (isMe) {
    const b = root.querySelector('.btn-tension');
    if (b) b.onclick = (e) => { e.stopPropagation(); selectTension(); };
    const h = root.querySelector('.btn-hero');
    if (h) h.onclick = (e) => { e.stopPropagation(); selectHero(); };
  }
  const hb = root.querySelector('.ld-hero');
  if (hb && hero) {
    hb.onmouseenter = (ev) => showTip(hero, ev.clientX, ev.currentTarget.getBoundingClientRect().top,
      `<div style="margin-top:4px">${heroSkillLines(hero, p.hero.level)}</div>`);
    hb.onmouseleave = hideTip;
  }
  root.onclick = (e) => { e.stopPropagation(); onLeaderClick(pi); };
}

// 盤面：自後列・自前列 ║ 敵前列・敵後列 の4列×3段
function renderBoard() {
  for (const colEl of el.board.querySelectorAll('.bcol')) {
    const pi = colEl.dataset.owner === 'me' ? myPi : aiPi;
    const col = Number(colEl.dataset.col);
    colEl.innerHTML = '';
    for (let lane = 0; lane < 3; lane++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.pi = pi; slot.dataset.lane = lane; slot.dataset.col = col;
      const u = game.slotOccupant(pi, lane, col);
      if (u) slot.appendChild(u.isDungeon ? dungeonEl(u) : unitEl(u));
      slot.onclick = (e) => { e.stopPropagation(); onSlotClick(pi, lane, col, u); };
      colEl.appendChild(slot);
    }
  }
}

function dungeonEl(d) {
  const c = CARDS[d.cardId];
  const n = document.createElement('div');
  n.className = 'unit is-dungeon';
  n.dataset.uid = d.uid;
  const pct = Math.min(100, Math.round(d.dur / d.goal * 100));
  n.innerHTML = `
    <div class="u-medal" style="--uc:${cardTint(c.cls)}">${artSvg(c)}</div>
    <div class="u-name">${c.name}</div>
    <div class="dg-bar"><i style="width:${pct}%"></i></div>
    <div class="dg-num">${d.dur}/${d.goal}</div>`;
  n.onmouseenter = (e) => showTip(c, e.clientX, e.currentTarget.getBoundingClientRect().top,
    `<div style="margin-top:4px;color:#cdb49e">耐久値 ${d.dur}／${d.goal}（踏破すると効果が起きて消える）</div>`);
  n.onmouseleave = hideTip;
  return n;
}

function unitEl(u) {
  const c = CARDS[u.cardId];
  const n = document.createElement('div');
  const hp = game.hpOf(u), maxHp = game.maxHpOf(u);
  n.className = 'unit' + (u.frozen > 0 ? ' is-frozen' : '') + (game.hasKw(u, 'ステルス') ? ' is-stealth' : '');
  n.dataset.uid = u.uid;
  n.innerHTML = `
    <div class="u-medal" style="--uc:${cardTint(c.cls)}">
      ${artSvg(c)}
      <span class="u-kw">${kwBadges(u.silenced ? [] : u.kw)}</span>
    </div>
    <span class="gem gem-atk u-atk">${game.atkOf(u)}</span>
    <span class="gem gem-hp u-hp ${hp < maxHp ? 'hurt' : ''}">${hp}</span>
    <div class="u-name">${c.name}</div>`;
  n.onmouseenter = (e) => showTip(c, e.clientX, e.currentTarget.getBoundingClientRect().top, unitExtra(u));
  n.onmouseleave = hideTip;
  return n;
}

function unitExtra(u) {
  const bits = [];
  if (u.frozen > 0) bits.push(`行動不能（あと${u.frozen}ターン）`);
  if (u.attacksLeft > 0 && u.pi === myPi) bits.push(`攻撃できる（残り${u.attacksLeft}回）`);
  if (u.pi === myPi && u.attacksLeft === 0 && u.frozen === 0) bits.push('このターンはもう攻撃できない');
  return bits.length ? `<div style="margin-top:4px;color:#cdb49e">${bits.join('<br>')}</div>` : '';
}

function renderHand() {
  const p = game.p(myPi);
  el.hand.innerHTML = '';
  const n = p.hand.length;
  p.hand.forEach((inst, i) => {
    const c = CARDS[inst.cardId];
    const cost = game.effectiveCost(myPi, inst);
    const playable = game.active === myPi && !busy && playActions(inst.iid).length > 0;
    const d = document.createElement('div');
    d.className = 'hcard' + (playable ? '' : ' cant');
    d.dataset.iid = inst.iid;
    d.style.setProperty('--uc', cardTint(c.cls));
    // 扇状に少しずつ傾ける
    const t = n > 1 ? (i / (n - 1) - 0.5) : 0;
    d.style.setProperty('--rot', (t * Math.min(14, n * 2)).toFixed(2) + 'deg');
    d.style.setProperty('--lift', (Math.abs(t) * Math.min(18, n * 2.5)).toFixed(1) + 'px');
    let stats = '';
    if (c.type === 'unit') stats = gem('atk', c.atk) + gem('hp', c.hp);
    else if (c.type === 'weapon') stats = gem('atk', c.wAtk) + gem('hp', c.wDur);
    else if (c.type === 'dungeon') stats = '<span></span>' + gem('atk', c.goal);
    const badge = c.type === 'hero' ? '英雄' : c.type === 'dungeon' ? '迷宮' : c.sub || '';
    d.innerHTML = `
      <div class="gem gem-mp h-cost ${cost < c.cost ? 'gem-cheap' : ''}">${cost}</div>
      ${badge ? `<span class="h-badge">${badge}</span>` : ''}
      <div class="h-art">${artSvg(c)}</div>
      <div class="h-name">${c.name}</div>
      <div class="h-stats">${stats}</div>`;
    d.onclick = (e) => { e.stopPropagation(); onHandClick(inst.iid); };
    d.onmouseenter = (e) => { const r = e.currentTarget.getBoundingClientRect(); showTip(c, r.left + r.width / 2, r.top); };
    d.onmouseleave = hideTip;
    el.hand.appendChild(d);
  });
}

function renderLog() {
  if (el.logPanel.hidden) return;
  el.logInner.innerHTML = game.s.log.slice(-160).map(t =>
    `<div class="${t.startsWith('—') ? 'lg-turn' : ''}">${t}</div>`).join('');
  el.logPanel.scrollTop = el.logPanel.scrollHeight;
}

// ------------------------------------------------------------
//  選択とハイライト
// ------------------------------------------------------------
function myActions() { return game.legalActions(myPi, { compact: false }); }
function playActions(iid) { return myActions().filter(a => a.type === 'play' && a.iid === iid); }

function clearSel() { sel = null; hint(null); applyHighlights(); }

function hint(text) {
  if (!text) { el.hint.hidden = true; return; }
  el.hint.textContent = text; el.hint.hidden = false;
}

// いま選んでいるものから、実行できる行動の候補を出す
function candidates() {
  if (!sel) return [];
  if (sel.type === 'hand') {
    let a = playActions(sel.iid);
    if (sel.choice != null) a = a.filter(x => x.choice === sel.choice);
    if (sel.slot) a = a.filter(x => x.slot && x.slot.lane === sel.slot.lane && x.slot.col === sel.slot.col);
    return a;
  }
  if (sel.type === 'unit') return myActions().filter(a => a.type === 'attack' && a.from.k === 'u' && a.from.uid === sel.uid);
  if (sel.type === 'leader') return myActions().filter(a => a.type === 'attack' && a.from.k === 'l');
  if (sel.type === 'tension') return myActions().filter(a => a.type === 'tension');
  if (sel.type === 'hero') return myActions().filter(a => a.type === 'hero');
  return [];
}

function applyHighlights() {
  document.querySelectorAll('.unit,.slot,.hcard,.lead').forEach(n => {
    n.classList.remove('is-target', 'is-drop', 'is-sel', 'can-act');
  });
  if (game.s.winner !== null) return;

  // 行動できる自分のユニット・リーダー
  if (game.active === myPi && !busy && !sel) {
    for (const a of myActions()) {
      if (a.type !== 'attack') continue;
      if (a.from.k === 'u') {
        const n = document.querySelector(`.unit[data-uid="${a.from.uid}"]`);
        if (n) n.classList.add('can-act');
      }
    }
  }
  if (!sel) return;

  if (sel.type === 'hand') {
    const h = document.querySelector(`.hcard[data-iid="${sel.iid}"]`);
    if (h) h.classList.add('is-sel');
  } else if (sel.type === 'unit') {
    const n = document.querySelector(`.unit[data-uid="${sel.uid}"]`);
    if (n) n.classList.add('is-sel');
  } else if (sel.type === 'leader') {
    el.myStrip.classList.add('is-sel');
  }

  const cands = candidates();
  const needSlot = sel.type === 'hand' && !sel.slot && cands.some(a => a.slot);
  if (needSlot) {
    for (const a of cands) {
      if (!a.slot) continue;
      const n = document.querySelector(`.slot[data-pi="${myPi}"][data-lane="${a.slot.lane}"][data-col="${a.slot.col}"]`);
      if (n) n.classList.add('is-drop');
    }
    return;
  }
  for (const a of cands) {
    const t = a.type === 'attack' ? a.to : a.target;
    if (!t) continue;
    if (t.k === 'u') {
      const n = document.querySelector(`.unit[data-uid="${t.uid}"]`);
      if (n) n.classList.add('is-target');
    } else {
      (t.pi === myPi ? el.myStrip : el.enemyStrip).classList.add('is-target');
    }
  }
}

// ------------------------------------------------------------
//  クリック処理
// ------------------------------------------------------------
function onHandClick(iid) {
  if (busy || game.active !== myPi || game.s.winner !== null) return;
  if (sel && sel.type === 'hand' && sel.iid === iid) { clearSel(); return; }
  const acts = playActions(iid);
  const inst = game.p(myPi).hand.find(h => h.iid === iid);
  if (!inst) return;
  const c = CARDS[inst.cardId];
  if (!acts.length) {
    const cost = game.effectiveCost(myPi, inst);
    hint(cost > game.p(myPi).mp ? 'MPが足りません'
       : c.type === 'unit' && !game.emptySlots(myPi).length ? '場がいっぱいです' : 'いま使える対象がありません');
    setTimeout(() => { if (!sel) hint(null); }, 1600);
    return;
  }
  SFX.tap();
  sel = { type: 'hand', iid, choice: null, slot: null };
  // 「選択」カードと、必中モードのタロットは、先に効果を選ぶ
  if (c.choose) { askChoice(c, c.choose, '選択', (i) => { sel.choice = i; afterHandSelect(c); }); return; }
  if (c.divine && game.p(myPi).hitMode) { askChoice(c, c.divine, '占い（必中モード）', (i) => { sel.choice = i; afterHandSelect(c); }); return; }
  afterHandSelect(c);
}

function afterHandSelect(c) {
  const cands = candidates();
  if (!cands.length) { clearSel(); return; }
  if ((c.type === 'unit' || c.type === 'dungeon') && cands.some(a => a.slot)) {
    hint(c.type === 'dungeon' ? 'ダンジョンを置くマスを選んでください' : '置く場所を選んでください');
    applyHighlights(); return;
  }
  if (cands.some(a => a.target)) { hint('対象を選んでください'); applyHighlights(); return; }
  const plain = cands.find(a => !a.target) || cands[0];
  clearSelKeepBusy(); doApply(plain);
}
function clearSelKeepBusy() { sel = null; hint(null); }

function onSlotClick(pi, lane, col, u) {
  if (busy || game.active !== myPi || game.s.winner !== null) return;
  // 対象としてクリックされた場合
  if (u && tryTarget({ k: 'u', uid: u.uid })) return;
  // 自分のユニットを攻撃者として選ぶ
  if (u && u.pi === myPi && !sel) {
    const acts = myActions().filter(a => a.type === 'attack' && a.from.k === 'u' && a.from.uid === u.uid);
    if (acts.length) { SFX.tap(); sel = { type: 'unit', uid: u.uid }; hint('攻撃する相手を選んでください'); applyHighlights(); return; }
    if (game.canUnitAttack(u)) { hint('攻撃できる相手がいません'); setTimeout(() => hint(null), 1500); }
    else if (u.frozen > 0) { hint('このユニットは行動不能です'); setTimeout(() => hint(null), 1500); }
    else if (u.summonedTurn === game.s.turn) { hint('召喚したターンは攻撃できません（速攻を除く）'); setTimeout(() => hint(null), 2000); }
    else { hint('このターンはもう攻撃できません'); setTimeout(() => hint(null), 1500); }
    return;
  }
  // ユニットカードの置き場所
  if (sel && sel.type === 'hand' && !u) {
    const cands = candidates().filter(a => a.slot && a.slot.lane === lane && a.slot.col === col && pi === myPi);
    if (!cands.length) { clearSel(); return; }
    sel.slot = { lane, col };
    const withTarget = cands.filter(a => a.target);
    if (withTarget.length) { hint('対象を選んでください（選ばない場合はもう一度マスを押す）'); applyHighlights();
      const plain = cands.find(a => !a.target);
      if (plain) sel.skipTargetAction = plain;
      return; }
    clearSelKeepBusy(); doApply(cands[0]); return;
  }
  // 対象を選ばずに召喚時効果を飛ばす
  if (sel && sel.type === 'hand' && sel.slot && sel.slot.lane === lane && sel.slot.col === col && sel.skipTargetAction) {
    const a = sel.skipTargetAction; clearSelKeepBusy(); doApply(a); return;
  }
  clearSel();
}

function onLeaderClick(pi) {
  if (busy || game.active !== myPi || game.s.winner !== null) return;
  if (tryTarget({ k: 'l', pi })) return;
  if (pi === myPi && !sel) {
    const acts = myActions().filter(a => a.type === 'attack' && a.from.k === 'l');
    if (acts.length) { SFX.tap(); sel = { type: 'leader' }; hint('攻撃する相手を選んでください'); applyHighlights(); }
    else if (game.p(myPi).weapon) { hint('攻撃できる相手がいません'); setTimeout(() => hint(null), 1500); }
    return;
  }
  clearSel();
}

function tryTarget(ref) {
  if (!sel) return false;
  const cands = candidates();
  const hit = cands.find(a => {
    const t = a.type === 'attack' ? a.to : a.target;
    return t && t.k === ref.k && (ref.k === 'u' ? t.uid === ref.uid : t.pi === ref.pi);
  });
  if (!hit) return false;
  clearSelKeepBusy();
  doApply(hit);
  return true;
}

function selectHero() {
  if (busy || game.active !== myPi) return;
  const acts = myActions().filter(a => a.type === 'hero');
  if (!acts.length) return;
  SFX.tap();
  if (acts.length === 1 && !acts[0].target) { doApply(acts[0]); return; }
  sel = { type: 'hero' };
  hint('ヒーロースキルの対象を選んでください');
  applyHighlights();
}

function selectTension() {
  if (busy || game.active !== myPi) return;
  const acts = myActions().filter(a => a.type === 'tension');
  if (!acts.length) return;
  SFX.tap();
  if (acts.length === 1 && !acts[0].target) { doApply(acts[0]); return; }
  sel = { type: 'tension' };
  hint('テンションスキルの対象を選んでください');
  applyHighlights();
}

// 効果を選ばせる（選択カード／必中モードのタロット）
function askChoice(card, opts, title, cb) {
  const marks = ['①', '②', '③', '④'];
  el.overlayBox.innerHTML = `<h3>${title}</h3><p>${card.name} — 効果を選べます</p>
    <div class="choice-list">
      ${opts.map((o, i) => `<button data-i="${i}"><b>${marks[i]}</b>${o.text}</button>`).join('')}
    </div>
    <div class="overlay-btns"><button class="btn" data-i="-1">やめる</button></div>`;
  hideTip();
  el.overlay.hidden = false;
  el.overlayBox.querySelectorAll('button').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      el.overlay.hidden = true;
      const i = Number(b.dataset.i);
      if (i < 0) { clearSel(); return; }
      cb(i);
    };
  });
}

// ------------------------------------------------------------
//  行動の適用と演出
// ------------------------------------------------------------
async function doApply(action) {
  if (busy || !game || game.s.winner !== null) return;
  busy = true;
  const before = capturePositions();
  const ok = game.apply(action);
  const evs = game.drainEvents();
  if (!ok) { busy = false; render(); return; }
  render();
  await playEvents(evs, before);
  renderLog();
  busy = false;
  render();
  if (game.s.winner !== null) { finish(); return; }
  if (game.active === aiPi) runAiTurn();
}

// ステージ内の座標（画面座標ではない）。こうしておくと拡大・回転しても演出がズレない。
function stagePos(node) {
  let x = 0, y = 0, n = node;
  while (n && n !== el.stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
}
function capturePositions() {
  const map = { units: {}, leaders: {} };
  document.querySelectorAll('.unit[data-uid]').forEach(n => { map.units[n.dataset.uid] = stagePos(n); });
  map.leaders[aiPi] = stagePos(el.enemyStrip);
  map.leaders[myPi] = stagePos(el.myStrip);
  return map;
}
function posOf(ref, before) {
  if (ref.k === 'l') return stagePos(ref.pi === myPi ? el.myStrip : el.enemyStrip);
  const n = document.querySelector(`.unit[data-uid="${ref.uid}"]`);
  if (n) return stagePos(n);
  return before.units[ref.uid] || null;
}

function float(text, cls, pos) {
  if (!pos || !el.stage) return;
  const d = document.createElement('div');
  d.className = 'float ' + cls; d.textContent = text;
  d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
  el.stage.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function slashAt(pos) {
  if (!pos || !el.stage) return;
  const d = document.createElement('div');
  d.className = 'slash';
  d.innerHTML = `<svg viewBox="0 0 100 100">
    <path d="M12 74 C34 58 62 40 88 22" stroke="rgba(255,255,255,.95)" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M12 74 C34 58 62 40 88 22" stroke="rgba(255,210,140,.85)" stroke-width="15" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M22 30 C40 46 60 62 80 78" stroke="rgba(255,255,255,.7)" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`;
  d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
  el.stage.appendChild(d);
  setTimeout(() => d.remove(), 460);
}
function burstAt(pos) {
  if (!pos || !el.stage) return;
  const d = document.createElement('div');
  d.className = 'burst';
  d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
  el.stage.appendChild(d);
  setTimeout(() => d.remove(), 540);
}
function screenFlash() {
  if (!el.stage) return;
  const d = document.createElement('div');
  d.className = 'flash';
  el.stage.appendChild(d);
  setTimeout(() => d.remove(), 600);
}

function shake(ref) {
  if (ref.k === 'l') { (ref.pi === myPi ? el.myStrip : el.enemyStrip).animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 260 }); return; }
  const n = document.querySelector(`.unit[data-uid="${ref.uid}"]`);
  if (n) { n.classList.remove('is-hit'); void n.offsetWidth; n.classList.add('is-hit'); }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function playEvents(evs, before) {
  const heavy = evs.filter(e => ['dmg', 'heal', 'death', 'summon', 'attack', 'tensionSkill', 'divine'].includes(e.t));
  const step = heavy.length > 12 ? 60 : heavy.length > 6 ? 110 : 170;
  for (const e of evs) {
    switch (e.t) {
      case 'attack': SFX.attack(); slashAt(posOf(e.to, before)); await wait(step * 0.75); break;
      case 'dmg':
        float('-' + e.amount, 'dmg', posOf(e.ref, before)); shake(e.ref); SFX.hit();
        await wait(step); break;
      case 'heal':
        float('+' + e.amount, 'heal', posOf(e.ref, before)); SFX.heal(); await wait(step * 0.8); break;
      case 'buff': {
        const p = posOf(e.ref, before);
        if (e.atk || e.hp) float(`${e.atk >= 0 ? '+' : ''}${e.atk}/${e.hp >= 0 ? '+' : ''}${e.hp}`, 'buff', p);
        await wait(step * 0.5); break;
      }
      case 'summon': SFX.summon(); await wait(step * 0.7); break;
      case 'death': SFX.death(); await wait(step * 0.7); break;
      case 'tensionSkill': SFX.tension(); screenFlash(); await wait(440); break;
      case 'heroSkill': SFX.tension(); await wait(340); break;
      case 'heroLevel': SFX.win(); screenFlash(); await wait(540); break;
      case 'hero': SFX.summon(); await wait(320); break;
      case 'dungeon': await wait(step * 0.5); break;
      case 'clear': SFX.tension(); screenFlash(); await wait(500); break;
      case 'divine': await wait(360); break;
      case 'turn': SFX.turn(); break;
      case 'freeze': await wait(step * 0.5); break;
      case 'play': {
        const card = CARDS[e.cardId];
        if (card && card.type === 'spell') burstAt({ x: STAGE_W / 2, y: 330 });
        SFX.play(); break;
      }
    }
  }
}

// ------------------------------------------------------------
//  コンピューターのターン
// ------------------------------------------------------------
async function runAiTurn() {
  if (!game || game.s.winner !== null) return;
  busy = true; render();
  await wait(520);
  let guard = 0;
  while (game.active === aiPi && game.s.winner === null && guard++ < 80) {
    let action = null;
    try { action = ai.nextAction(game, aiPi); } catch (err) { console.error(err); action = null; }
    if (!action) { action = { type: 'end' }; ai.reset(); }
    const before = capturePositions();
    const ok = game.apply(action);
    const evs = game.drainEvents();
    render();
    await playEvents(evs, before);
    renderLog();
    if (!ok) { game.apply({ type: 'end' }); ai.reset(); render(); break; }
    if (action.type === 'end') break;
    await wait(300);
  }
  busy = false;
  render();
  if (game.s.winner !== null) finish();
  else { SFX.turn(); hint('あなたのターンです'); setTimeout(() => hint(null), 1200); }
}

// ------------------------------------------------------------
//  決着
// ------------------------------------------------------------
function confirmQuit() {
  el.overlayBox.innerHTML = `<h3>投了しますか</h3><p>この対戦は負けとして記録されます。</p>
    <div class="overlay-btns">
      <button class="btn" id="q-no">つづける</button>
      <button class="btn btn-danger" id="q-yes">投了する</button>
    </div>`;
  hideTip();
  el.overlay.hidden = false;
  $('q-no').onclick = (e) => { e.stopPropagation(); el.overlay.hidden = true; };
  $('q-yes').onclick = (e) => { e.stopPropagation(); el.overlay.hidden = true; game.s.winner = aiPi; finish(); };
}

function finish() {
  const w = game.s.winner;
  const win = w === myPi, draw = w === 'draw';
  if (win) SFX.win(); else if (!draw) SFX.lose();
  const me = game.p(myPi), op = game.p(aiPi);
  el.overlayBox.innerHTML = `
    <h3 class="${win ? 'win' : 'lose'}">${draw ? '相打ち' : win ? '勝利！' : '敗北…'}</h3>
    <p>${game.s.turn}ターンで決着。<br>
      あなた HP ${Math.max(0, me.hp)} ／ ${conf.oppName} HP ${Math.max(0, op.hp)}<br>
      <span style="font-size:.8rem">${AI_LEVELS[conf.aiLevel].name}・${AI_TYPES[conf.aiType].name}・${conf.oppDeckName}</span></p>
    <div class="overlay-btns">
      <button class="btn btn-primary" id="o-again">もう一度</button>
      <button class="btn" id="o-change">相手を変える</button>
      <button class="btn btn-ghost" id="o-title">タイトルへ</button>
    </div>`;
  hideTip();
  el.overlay.hidden = false;
  if (onFinish) onFinish({ win, draw, turns: game.s.turn, conf });
  $('o-again').onclick = (e) => { e.stopPropagation(); el.overlay.hidden = true; startBattle(conf, onFinish); };
  $('o-change').onclick = (e) => { e.stopPropagation(); el.overlay.hidden = true; location.hash = '#opponent'; };
  $('o-title').onclick = (e) => { e.stopPropagation(); el.overlay.hidden = true; location.hash = '#title'; };
}

export function abortBattle() { game = null; busy = false; sel = null; }
