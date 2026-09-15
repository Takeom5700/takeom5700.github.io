// ============================================================
//  ゲームエンジン
//  盤面は 3段（上・中・下）× 2列（前列・後列）＝ 6マス。
//   ・ブロック : 同じ段の前列にユニットがいると、後列は攻撃できない
//   ・ウォール : 3段すべてに敵ユニットがいると、リーダーを攻撃できない
//   ・におうだち: 前列にいるあいだ、敵はそれを優先して攻撃しなければならない
//   ・貫通      : 攻撃対象の後ろのユニットにもダメージ（反撃は受けない）
//  状態(state)は素のデータのみで構成し、AI が構造化クローンして先読みできる。
// ============================================================

import { CARDS, TENSION_SKILLS, CLASSES } from './cards.js';
import { rnd, rndF, pick, shuffle } from './rng.js';

export const LANES = 3;
export const FRONT = 0, BACK = 1;
export const MAX_HAND = 10;
export const MAX_MP = 10;
export const LEADER_HP = 25;

export const slotIndex = (lane, col) => lane * 2 + col;

// ------------------------------------------------------------
//  初期化
// ------------------------------------------------------------
function newPlayer(pi, conf) {
  return {
    pi,
    name: conf.name,
    cls: conf.cls,
    leaderName: CLASSES[conf.cls].leader,
    hp: LEADER_HP, maxHp: LEADER_HP,
    mp: 0, natural: 0, bonusMp: 0, maxMp: 0,
    tension: 0,
    deck: [], hand: [], grave: [], field: new Array(LANES * 2).fill(null),
    weapon: null,
    hero: null,            // {cardId, level, uses, usedThisTurn} 英雄と共闘中の状態
    leaderBuffAtk: 0, leaderKw: [], leaderAttacksLeft: 0, leaderAttacksMax: 1,
    spellPower: 0, hitMode: false, fatigue: 0,
    stats: { played: 0, damageDealt: 0 },
  };
}

export function createGame(conf) {
  const state = {
    rng: { s: (conf.seed >>> 0) || 12345 },
    turn: 0,
    active: conf.first ?? 0,
    winner: null,
    uidSeq: 1, iidSeq: 1,
    players: [newPlayer(0, conf.players[0]), newPlayer(1, conf.players[1])],
    events: [],
    log: [],
  };
  const g = new Game(state);
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    p.deck = conf.players[i].deck.map(id => g.mkInst(id));
    shuffle(state.rng, p.deck);
  }
  const first = state.active;
  g.drawSilent(first, 3);
  g.drawSilent(1 - first, 4);
  // 「デッキに入れていると必ず初手に来る」カード（ロトの血を引く者など）
  for (let i = 0; i < 2; i++) g.pullOpeningCards(i);
  // 後攻ボーナス：テンションゲージ2段階＋まほうのせいすい
  state.players[1 - first].tension = 2;
  state.players[1 - first].hand.push(g.mkInst('sp_seisui'));
  g.beginTurn(first, true);
  return g;
}

// ------------------------------------------------------------
//  Game
// ------------------------------------------------------------
export class Game {
  constructor(state) { this.s = state; this.silent = false; }

  clone() {
    const g = new Game(JSON.parse(JSON.stringify({ ...this.s, events: [], log: [] })));
    g.silent = true;
    return g;
  }

  // --- ログ・演出イベント
  ev(e) { if (!this.silent) this.s.events.push(e); }
  say(text) { if (!this.silent) { this.s.log.push(text); this.s.events.push({ t: 'log', text }); } }

  // --- 乱数
  rnd(n) { return rnd(this.s.rng, n); }
  chance(p) { return rndF(this.s.rng) < p; }
  pick(a) { return pick(this.s.rng, a); }

  // --- 参照ヘルパー
  p(i) { return this.s.players[i]; }
  get active() { return this.s.active; }
  card(inst) { return CARDS[inst.cardId]; }
  mkInst(cardId) { return { iid: this.s.iidSeq++, cardId, costMod: 0 }; }

  ref(u) { return { k: 'u', uid: u.uid }; }
  leaderRef(pi) { return { k: 'l', pi }; }

  unitByUid(uid) {
    for (const p of this.s.players) for (const u of p.field) if (u && u.uid === uid) return u;
    return null;
  }
  unitOf(ref) { return ref && ref.k === 'u' ? this.unitByUid(ref.uid) : null; }
  // ダンジョンはマスを占有するが「ユニット」ではない。
  // ブロック・ウォール・攻撃の判定はユニットだけを見る。
  slotOccupant(pi, lane, col) { return this.p(pi).field[slotIndex(lane, col)]; }
  slotUnit(pi, lane, col) {
    const o = this.p(pi).field[slotIndex(lane, col)];
    return o && !o.isDungeon ? o : null;
  }
  occupantsOf(pi) { return this.p(pi).field.filter(Boolean); }
  dungeonsOf(pi) { return this.p(pi).field.filter(o => o && o.isDungeon); }
  unitsOf(pi) { return this.p(pi).field.filter(o => o && !o.isDungeon); }
  allyUnits(pi) { return this.unitsOf(pi); }
  enemyUnits(pi) { return this.unitsOf(1 - pi); }
  allUnits() { return [...this.unitsOf(0), ...this.unitsOf(1)]; }
  heroOf(pi) { const h = this.p(pi).hero; return h ? CARDS[h.cardId] : null; }
  heroSkill(pi) {
    const h = this.p(pi).hero; if (!h) return null;
    const c = CARDS[h.cardId];
    return c.skills[Math.min(h.level, c.skills.length - 1)];
  }
  rowUnits(pi, col) { return [0, 1, 2].map(l => this.slotUnit(pi, l, col)).filter(Boolean); }
  emptySlots(pi) {
    const out = [];
    for (let l = 0; l < LANES; l++) for (let c = 0; c < 2; c++) if (!this.slotOccupant(pi, l, c)) out.push({ lane: l, col: c });
    return out;
  }
  allyChars(pi) { return [this.leaderRef(pi), ...this.unitsOf(pi).map(u => this.ref(u))]; }
  enemyChars(pi) { return [this.leaderRef(1 - pi), ...this.unitsOf(1 - pi).map(u => this.ref(u))]; }
  randEnemyUnit(pi) { const u = this.pick(this.enemyUnits(pi).filter(x => !this.hasKw(x, 'ステルス'))); return u ? this.ref(u) : null; }
  randAllyUnit(pi) { const u = this.pick(this.allyUnits(pi)); return u ? this.ref(u) : null; }
  randEnemyChar(pi) {
    const list = [this.leaderRef(1 - pi), ...this.enemyUnits(pi).filter(x => !this.hasKw(x, 'ステルス')).map(u => this.ref(u))];
    return this.pick(list);
  }
  hpLost(pi) { return this.p(pi).maxHp - this.p(pi).hp; }
  hasWeapon(pi) { return !!this.p(pi).weapon; }

  // --- ユニットの実数値
  atkOf(u) { return Math.max(0, u.baseAtk + u.buffAtk); }
  maxHpOf(u) { return Math.max(1, u.baseHp + u.buffHp); }
  hpOf(u) { return this.maxHpOf(u) - u.dmg; }
  hasKw(u, k) { return !u.silenced && u.kw.includes(k); }
  attacksMaxOf(u) { return this.hasKw(u, '２回攻撃') ? 2 : 1; }

  spellPowerOf(pi) {
    let sp = this.p(pi).spellPower;
    for (const u of this.unitsOf(pi)) {
      const c = CARDS[u.cardId];
      if (c.aura && c.aura.spellPower && !u.silenced) sp += c.aura.spellPower;
    }
    return sp;
  }

  effectiveCost(pi, inst) {
    const c = CARDS[inst.cardId];
    let cost = c.costCalc ? c.costCalc(this, pi) : c.cost;
    cost += (inst.costMod || 0);
    return Math.max(0, cost);
  }

  // ------------------------------------------------------------
  //  ターン進行
  // ------------------------------------------------------------
  beginTurn(pi, isFirstEver) {
    const p = this.p(pi);
    this.s.active = pi;
    this.s.turn++;
    p.natural = Math.min(MAX_MP, p.natural + 1);
    p.maxMp = Math.min(MAX_MP, p.natural + p.bonusMp);
    p.mp = p.maxMp;
    p.leaderBuffAtk = 0;
    p.leaderKw = [];
    p.leaderAttacksLeft = p.weapon ? this.weaponAttacks(p) : 0;
    p.spellPower = 0;
    p.hitMode = false;
    if (p.hero) p.hero.usedThisTurn = false;
    for (const u of this.unitsOf(pi)) {
      if (u.frozen > 0) { u.frozen--; u.attacksLeft = 0; }
      else u.attacksLeft = this.attacksMaxOf(u);
      u.dreamUsed = false;
    }
    this.ev({ t: 'turn', pi, turn: this.s.turn });
    this.say(`— ${p.name} のターン（${this.s.turn}）—`);
    this.broadcast(pi, 'turnStart');
    if (!isFirstEver) this.draw(pi, 1);
    else this.draw(pi, 1);
    this.cleanup();
  }

  weaponAttacks(p) {
    if (!p.weapon) return 1;
    return (p.weapon.kw || []).includes('２回攻撃') ? 2 : 1;
  }

  endTurn(pi) {
    if (this.s.winner !== null) return;
    this.broadcast(pi, 'turnEnd');
    this.cleanup();
    if (this.s.winner !== null) return;
    this.beginTurn(1 - pi);
  }

  // 自分の場のもの（ユニットとダンジョン）にトリガを配る
  broadcast(pi, hook, ...args) {
    for (const u of this.occupantsOf(pi).slice()) {
      if (u.silenced) continue;
      const c = CARDS[u.cardId];
      if (c[hook] && this.unitByUid(u.uid)) c[hook](this, u, ...args);
    }
  }

  // ------------------------------------------------------------
  //  基本操作（カードの効果から呼ばれる）
  // ------------------------------------------------------------
  draw(pi, n = 1) {
    for (let i = 0; i < n; i++) {
      const p = this.p(pi);
      if (p.deck.length === 0) {
        p.fatigue++;
        this.say(`${p.name} はデッキ切れ！ ${p.fatigue}ダメージ`);
        this.dmg(this.leaderRef(pi), p.fatigue, { fatigue: true });
        continue;
      }
      const inst = p.deck.shift();
      if (p.hand.length >= MAX_HAND) { this.say(`手札がいっぱい。${CARDS[inst.cardId].name} は失われた`); p.grave.push(inst.cardId); continue; }
      p.hand.push(inst);
      this.ev({ t: 'draw', pi, iid: inst.iid });
    }
  }
  drawSilent(pi, n) { const p = this.p(pi); for (let i = 0; i < n && p.deck.length; i++) p.hand.push(p.deck.shift()); }

  // 初手に必ず来るカードを山札から手札へ移す
  pullOpeningCards(pi) {
    const p = this.p(pi);
    for (let i = p.deck.length - 1; i >= 0; i--) {
      if (!CARDS[p.deck[i].cardId].opening) continue;
      if (p.hand.length >= MAX_HAND) break;
      if (p.hand.some(h => CARDS[h.cardId].opening)) break;
      p.hand.push(p.deck.splice(i, 1)[0]);
    }
  }

  // デッキから条件に合うカードを1枚引く
  drawFiltered(pi, filter, after) {
    const p = this.p(pi);
    const idx = p.deck.findIndex(inst => filter(CARDS[inst.cardId]));
    if (idx < 0) { if (after) after(null); return null; }
    const inst = p.deck.splice(idx, 1)[0];
    if (p.hand.length >= MAX_HAND) { p.grave.push(inst.cardId); if (after) after(null); return null; }
    p.hand.push(inst);
    this.ev({ t: 'draw', pi, iid: inst.iid });
    if (after) after(inst);
    return inst;
  }

  // カードプールからランダムに手札に加える
  addRandomFromPool(pi, filter, n = 1) {
    const pool = Object.values(CARDS).filter(c => !c.token && filter(c));
    for (let i = 0; i < n; i++) {
      const c = this.pick(pool);
      if (!c) return;
      this.addCard(pi, c.id);
    }
  }
  addCard(pi, cardId) {
    const p = this.p(pi);
    if (p.hand.length >= MAX_HAND) return null;
    const inst = this.mkInst(cardId);
    p.hand.push(inst);
    this.ev({ t: 'draw', pi, iid: inst.iid });
    return inst;
  }

  gainMp(pi, n) { this.p(pi).mp += n; this.ev({ t: 'mp', pi }); }
  gainMaxMp(pi, n) {
    const p = this.p(pi);
    p.bonusMp += n;
    const before = p.maxMp;
    p.maxMp = Math.min(MAX_MP, p.natural + p.bonusMp);
    p.mp += Math.max(0, p.maxMp - before);
    this.ev({ t: 'mp', pi });
  }
  tension(pi, n = 1) {
    const p = this.p(pi);
    p.tension = Math.min(3, p.tension + n);
    this.ev({ t: 'tension', pi });
    this.say(`${p.name} テンションアップ！（${p.tension}/3）`);
  }
  spellPower(pi, n) { this.p(pi).spellPower += n; }
  setHitMode(pi, v) { this.p(pi).hitMode = v; if (v) this.say(`${this.p(pi).name} は必中モードになった`); }
  leaderAtkBuff(pi, n) { this.p(pi).leaderBuffAtk += n; if (this.p(pi).leaderAttacksLeft <= 0) this.p(pi).leaderAttacksLeft = 1; }
  leaderGrant(pi, kw) { if (!this.p(pi).leaderKw.includes(kw)) this.p(pi).leaderKw.push(kw); }
  weaponBuff(pi, n) { const w = this.p(pi).weapon; if (w) w.atk += n; }

  leaderAtk(pi) {
    const p = this.p(pi);
    return (p.weapon ? p.weapon.atk : 0) + p.leaderBuffAtk;
  }

  dmg(ref, amount, src = {}) {
    if (amount <= 0 || this.s.winner !== null) return 0;
    let amt = amount;
    if (src.spell) amt += this.spellPowerOf(src.pi ?? this.s.active);
    if (ref.k === 'l') {
      const p = this.p(ref.pi);
      p.hp -= amt;
      this.ev({ t: 'dmg', ref, amount: amt });
      this.say(`${p.name} に ${amt} ダメージ（残りHP ${Math.max(0, p.hp)}）`);
      this.checkWin();
      return amt;
    }
    const u = this.unitOf(ref);
    if (!u) return 0;
    if (this.hasKw(u, 'メタルボディ')) amt = Math.min(amt, 1);
    u.dmg += amt;
    this.ev({ t: 'dmg', ref, amount: amt });
    this.say(`${CARDS[u.cardId].name} に ${amt} ダメージ`);
    return amt;
  }

  heal(ref, amount) {
    if (amount <= 0) return;
    if (ref.k === 'l') {
      const p = this.p(ref.pi);
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      if (p.hp > before) { this.ev({ t: 'heal', ref, amount: p.hp - before }); this.broadcast(ref.pi, 'onAllyHeal'); }
      return;
    }
    const u = this.unitOf(ref);
    if (!u || u.dmg === 0) return;
    const healed = Math.min(u.dmg, amount);
    u.dmg -= healed;
    this.ev({ t: 'heal', ref, amount: healed });
    this.broadcast(u.pi, 'onAllyHeal');
  }

  buff(ref, atk, hp) {
    const u = this.unitOf(ref);
    if (!u) return;
    u.buffAtk += atk;
    u.buffHp += hp;
    if (hp < 0) u.dmg = Math.min(u.dmg, Math.max(0, this.maxHpOf(u) - 1));
    this.ev({ t: 'buff', ref, atk, hp });
  }

  grantKw(ref, kw) {
    const u = this.unitOf(ref);
    if (!u || u.kw.includes(kw)) return;
    u.kw.push(kw);
    if (kw === '速攻' && u.summonedTurn === this.s.turn && u.attacksLeft === 0) u.attacksLeft = this.attacksMaxOf(u);
    this.ev({ t: 'buff', ref, atk: 0, hp: 0 });
  }
  removeKw(ref, kw) {
    const u = this.unitOf(ref);
    if (!u) return;
    u.kw = u.kw.filter(k => k !== kw);
  }
  freeze(ref, turns = 1) {
    const u = this.unitOf(ref);
    if (!u) return;
    u.frozen = Math.max(u.frozen, turns);
    u.attacksLeft = 0;
    this.ev({ t: 'freeze', ref });
  }
  silence(ref) {
    const u = this.unitOf(ref);
    if (!u) return;
    u.silenced = true; u.kw = [];
  }
  refreshAttack(u) {
    const live = this.unitByUid(u.uid);
    if (live) live.attacksLeft = Math.max(live.attacksLeft, 1);
  }

  destroy(ref) {
    const u = this.unitOf(ref);
    if (!u) return;
    u.dmg = this.maxHpOf(u) + 999;
    this.cleanup();
  }

  bounce(ref) {
    const u = this.unitOf(ref);
    if (!u) return;
    const p = this.p(u.pi);
    p.field[slotIndex(u.lane, u.col)] = null;
    if (p.hand.length < MAX_HAND) p.hand.push(this.mkInst(u.cardId));
    this.ev({ t: 'bounce', uid: u.uid });
  }

  transform(u, newCardId) {
    const live = this.unitByUid(u.uid);
    if (!live) return;
    const c = CARDS[newCardId];
    live.cardId = newCardId;
    live.baseAtk = c.atk; live.baseHp = c.hp; live.dmg = 0;
    live.buffAtk = 0; live.buffHp = 0;
    live.kw = [...c.kw];
    this.ev({ t: 'transform', uid: live.uid });
    this.say(`${c.name} に変身した！`);
  }

  summon(pi, cardId, slot) {
    const p = this.p(pi);
    let s = slot;
    if (!s) {
      const empties = this.emptySlots(pi);
      if (!empties.length) return null;
      // 空きは前列優先で詰める
      s = empties.sort((a, b) => a.col - b.col || a.lane - b.lane)[0];
    }
    if (this.slotOccupant(pi, s.lane, s.col)) return null;
    const c = CARDS[cardId];
    const u = {
      uid: this.s.uidSeq++, cardId, pi, lane: s.lane, col: s.col,
      baseAtk: c.atk, baseHp: c.hp, buffAtk: 0, buffHp: 0, dmg: 0,
      kw: [...c.kw], attacksLeft: 0, summonedTurn: this.s.turn,
      frozen: 0, silenced: false, dreamUsed: false,
    };
    u.attacksLeft = u.kw.includes('速攻') ? this.attacksMaxOf(u) : 0;
    p.field[slotIndex(s.lane, s.col)] = u;
    this.ev({ t: 'summon', uid: u.uid, pi });
    this.say(`${p.name} は ${c.name} を召喚した`);
    this.broadcast(pi, 'onAllySummon', u);
    return u;
  }

  // ------------------------------------------------------------
  //  ダンジョン（マスを占有し、条件で耐久値がたまり、達すると踏破して消える）
  // ------------------------------------------------------------
  placeDungeon(pi, cardId, slot) {
    const c = CARDS[cardId];
    let s = slot;
    if (!s) { const e = this.emptySlots(pi); if (!e.length) return null; s = e[0]; }
    if (this.slotOccupant(pi, s.lane, s.col)) return null;
    const d = {
      uid: this.s.uidSeq++, cardId, pi, lane: s.lane, col: s.col,
      isDungeon: true, dur: 0, goal: c.goal, silenced: false, kw: [],
      baseAtk: 0, baseHp: 1, buffAtk: 0, buffHp: 0, dmg: 0,
      attacksLeft: 0, frozen: 0, summonedTurn: this.s.turn,
    };
    this.p(pi).field[slotIndex(s.lane, s.col)] = d;
    this.ev({ t: 'summon', uid: d.uid, pi });
    this.say(`${this.p(pi).name} は ${c.name} を設置した（踏破まで ${c.goal}）`);
    return d;
  }

  // 耐久値をためる。踏破したら効果を出してマスを空ける。
  dungeonProgress(d, n = 1) {
    const live = this.unitByUid(d.uid);
    if (!live || !live.isDungeon) return;
    live.dur += n;
    this.ev({ t: 'dungeon', uid: live.uid, dur: live.dur, goal: live.goal });
    if (live.dur < live.goal) return;
    const c = CARDS[live.cardId];
    const spot = { lane: live.lane, col: live.col };
    this.p(live.pi).field[slotIndex(live.lane, live.col)] = null;
    this.ev({ t: 'clear', uid: live.uid, pi: live.pi });
    this.say(`${c.name} を踏破した！`);
    if (c.clear) c.clear(this, { pi: live.pi, ...spot });
  }

  // ------------------------------------------------------------
  //  英雄（共闘するとヒーロースキルが1ターンに1度使える。使うほど強くなる）
  // ------------------------------------------------------------
  setHero(pi, cardId) {
    const p = this.p(pi);
    p.hero = { cardId, level: 0, uses: 0, usedThisTurn: false };
    this.ev({ t: 'hero', pi });
    this.say(`${p.name} は ${CARDS[cardId].name} と共闘を始めた`);
  }

  useHeroSkill(pi, opts = {}) {
    if (this.s.winner !== null || this.s.active !== pi) return false;
    const p = this.p(pi);
    const sk = this.heroSkill(pi);
    if (!sk || p.hero.usedThisTurn || p.mp < sk.cost) return false;
    let target = opts.target || null;
    if (sk.target) {
      const legal = this.targetsFor(pi, sk.target);
      if (!legal.length) return false;
      if (!target || !legal.some(r => this.sameRef(r, target))) return false;
    }
    p.mp -= sk.cost;
    p.hero.usedThisTurn = true;
    this.ev({ t: 'heroSkill', pi });
    this.say(`${p.name} のヒーロースキル『${sk.name}』！`);
    sk.run(this, { pi, target });
    // 使うほどレベルが上がる
    p.hero.uses++;
    const hc = CARDS[p.hero.cardId];
    const cur = hc.skills[p.hero.level];
    if (cur && cur.upTo && p.hero.uses >= cur.upTo && p.hero.level < hc.skills.length - 1) {
      p.hero.level++; p.hero.uses = 0;
      const next = hc.skills[p.hero.level];
      this.ev({ t: 'heroLevel', pi });
      this.say(`ヒーロースキルがレベルアップ！『${next.name}』が使えるようになった`);
    }
    this.cleanup();
    return true;
  }

  resurrect(pi, n) {
    const p = this.p(pi);
    const pool = p.grave.filter(id => CARDS[id].type === 'unit');
    for (let i = 0; i < n; i++) {
      const id = this.pick(pool);
      if (!id) return;
      if (!this.emptySlots(pi).length) return;
      pool.splice(pool.indexOf(id), 1);
      p.grave.splice(p.grave.indexOf(id), 1);
      this.summon(pi, id);
    }
  }

  // 死亡処理（連鎖するので安定するまで回す）
  cleanup() {
    for (let guard = 0; guard < 30; guard++) {
      const dead = [];
      for (const p of this.s.players) {
        for (let i = 0; i < p.field.length; i++) {
          const u = p.field[i];
          if (u && !u.isDungeon && this.hpOf(u) <= 0) { p.field[i] = null; dead.push(u); }
        }
      }
      if (!dead.length) break;
      for (const u of dead) {
        this.p(u.pi).grave.push(u.cardId);
        this.ev({ t: 'death', uid: u.uid, pi: u.pi });
        this.say(`${CARDS[u.cardId].name} は倒れた`);
      }
      for (const u of dead) {
        const c = CARDS[u.cardId];
        if (c.death && !u.silenced) c.death(this, u);
        this.broadcast(u.pi, 'onAllyDeath', u);
      }
    }
    this.checkWin();
  }

  checkWin() {
    if (this.s.winner !== null) return;
    const d0 = this.p(0).hp <= 0, d1 = this.p(1).hp <= 0;
    if (d0 && d1) this.s.winner = 'draw';
    else if (d0) this.s.winner = 1;
    else if (d1) this.s.winner = 0;
    if (this.s.winner !== null) this.ev({ t: 'gameover', winner: this.s.winner });
  }

  // ------------------------------------------------------------
  //  攻撃の可否（ブロック・ウォール・におうだち）
  // ------------------------------------------------------------
  // attacker を渡すと「アンチステルス」を考慮する（省略時はステルスを見られない）
  attackTargets(pi, attacker) {
    const opp = 1 - pi;
    const seeStealth = !!(attacker && !attacker.isLeader && this.hasKw(attacker, 'アンチステルス'));
    const visible = this.unitsOf(opp).filter(u => seeStealth || !this.hasKw(u, 'ステルス'));
    const taunts = visible.filter(u => u.col === FRONT && this.hasKw(u, 'におうだち'));
    if (taunts.length) return taunts.map(u => this.ref(u));
    const out = [];
    for (const u of visible) {
      if (u.col === BACK && this.slotUnit(opp, u.lane, FRONT)) continue; // ブロック
      out.push(this.ref(u));
    }
    const wall = [0, 1, 2].every(l => this.slotUnit(opp, l, FRONT) || this.slotUnit(opp, l, BACK));
    if (!wall) out.push(this.leaderRef(opp));
    return out;
  }

  canUnitAttack(u) {
    return u && u.attacksLeft > 0 && this.atkOf(u) > 0 && u.frozen === 0;
  }
  canLeaderAttack(pi) {
    const p = this.p(pi);
    return p.leaderAttacksLeft > 0 && this.leaderAtk(pi) > 0;
  }

  sameRef(a, b) {
    if (!a || !b) return false;
    return a.k === b.k && (a.k === 'u' ? a.uid === b.uid : a.pi === b.pi);
  }

  // ------------------------------------------------------------
  //  攻撃の実行
  // ------------------------------------------------------------
  performAttack(pi, attackerRef, targetRef) {
    if (this.s.winner !== null) return false;
    const isLeader = attackerRef.k === 'l';
    const a = isLeader ? null : this.unitOf(attackerRef);
    if (!isLeader && (!a || a.isDungeon)) return false;
    const legal = this.attackTargets(pi, a);
    if (!legal.some(r => this.sameRef(r, targetRef))) return false;

    if (isLeader ? !this.canLeaderAttack(pi) : !this.canUnitAttack(a)) return false;

    const atk = isLeader ? this.leaderAtk(pi) : this.atkOf(a);
    const pierce = isLeader ? this.p(pi).leaderKw.includes('貫通') : this.hasKw(a, '貫通');

    if (isLeader) {
      const p = this.p(pi);
      p.leaderAttacksLeft--;
      this.say(`${p.name} が攻撃！`);
    } else {
      a.attacksLeft--;
      if (this.hasKw(a, 'ステルス')) this.removeKw(attackerRef, 'ステルス');
      this.say(`${CARDS[a.cardId].name} が攻撃！`);
      const ca = CARDS[a.cardId];
      if (ca.onAttack && !a.silenced) ca.onAttack(this, a, targetRef);
    }
    this.ev({ t: 'attack', from: attackerRef, to: targetRef });

    const defender = this.unitOf(targetRef);
    const counter = defender ? this.atkOf(defender) : 0;
    const defSlot = defender ? { pi: defender.pi, lane: defender.lane, col: defender.col } : null;

    this.dmg(targetRef, atk, { pi });
    if (pierce && defSlot && defSlot.col === FRONT) {
      const behind = this.slotUnit(defSlot.pi, defSlot.lane, BACK);
      if (behind) { this.say('貫通！'); this.dmg(this.ref(behind), atk, { pi }); }
    }
    if (counter > 0) this.dmg(attackerRef, counter, { pi: 1 - pi, counter: true });

    if (isLeader) {
      const p = this.p(pi);
      if (p.weapon) {
        p.weapon.dur--;
        if (p.weapon.dur <= 0) { this.say(`${p.weapon.name} は壊れた`); p.weapon = null; p.leaderAttacksLeft = 0; }
      }
    } else {
      const live = this.unitByUid(a.uid);
      const ca = CARDS[a.cardId];
      if (live && ca.afterAttack && !live.silenced) ca.afterAttack(this, live, targetRef);
    }
    this.cleanup();
    return true;
  }

  // ------------------------------------------------------------
  //  カードを使う
  // ------------------------------------------------------------
  needsTargetFor(pi, inst, choiceIdx) {
    const c = CARDS[inst.cardId];
    if (c.choose) return choiceIdx != null ? (c.choose[choiceIdx].target || null) : null;
    if (c.divine) {
      const p = this.p(pi);
      if (p.hitMode && choiceIdx != null) return c.divine[choiceIdx].target || null;
      return null; // 占いは解決時にランダム決定
    }
    return c.target || null;
  }

  targetsFor(pi, spec) {
    if (!spec) return [];
    const out = [];
    const addUnits = (owner) => {
      for (const u of this.unitsOf(owner)) {
        if (owner !== pi && this.hasKw(u, 'ステルス')) continue;
        out.push(this.ref(u));
      }
    };
    if (spec.side === 'ally' || spec.side === 'any') addUnits(pi);
    if (spec.side === 'enemy' || spec.side === 'any') addUnits(1 - pi);
    if (spec.kind === 'char') {
      if (spec.side === 'ally' || spec.side === 'any') out.push(this.leaderRef(pi));
      if (spec.side === 'enemy' || spec.side === 'any') out.push(this.leaderRef(1 - pi));
    }
    return spec.filter ? out.filter(r => spec.filter(this, r, pi)) : out;
  }

  playCard(pi, iid, opts = {}) {
    if (this.s.winner !== null || this.s.active !== pi) return false;
    const p = this.p(pi);
    const idx = p.hand.findIndex(h => h.iid === iid);
    if (idx < 0) return false;
    const inst = p.hand[idx];
    const c = CARDS[inst.cardId];
    const cost = this.effectiveCost(pi, inst);
    if (p.mp < cost) return false;

    if (c.type === 'unit' || c.type === 'dungeon') {
      const slot = opts.slot;
      if (!slot || this.slotOccupant(pi, slot.lane, slot.col)) return false;
    }
    const spec = this.needsTargetFor(pi, inst, opts.choice);
    let target = opts.target || null;
    if (spec) {
      const legal = this.targetsFor(pi, spec);
      if (target && !legal.some(r => this.sameRef(r, target))) return false;
      if (!target && legal.length > 0 && !c.targetOptional) return false;
      if (!target && c.targetOptional) target = null;
    }

    p.hand.splice(idx, 1);
    p.mp -= cost;
    p.stats.played++;
    this.ev({ t: 'play', pi, cardId: c.id });
    this.say(`${p.name} は ${c.name} を使った`);

    const ctx = { pi, target, slot: opts.slot, choice: opts.choice };

    if (c.type === 'unit') {
      const u = this.summon(pi, c.id, opts.slot);
      if (u && c.summon) c.summon(this, u, ctx);
    } else if (c.type === 'dungeon') {
      const d = this.placeDungeon(pi, c.id, opts.slot);
      if (d && c.summon) c.summon(this, d, ctx);
    } else if (c.type === 'hero') {
      this.setHero(pi, c.id);
      if (c.summon) c.summon(this, null, ctx);
      p.grave.push(c.id);
    } else if (c.type === 'weapon') {
      p.weapon = { name: c.name, cardId: c.id, atk: c.wAtk, dur: c.wDur, kw: c.wKw || [] };
      p.leaderAttacksLeft = this.weaponAttacks(p);
      this.ev({ t: 'weapon', pi });
      if (c.summon) c.summon(this, null, ctx);
    } else {
      if (c.choose) this.resolveChoose(pi, c, ctx);
      else if (c.divine) this.resolveDivine(pi, c, ctx);
      else if (c.play) c.play(this, ctx);
      if (c.sub === '道具' && target) {
        const tu = this.unitOf(target);
        if (tu) { const tc = CARDS[tu.cardId]; if (tc.onItemTarget && !tu.silenced) tc.onItemTarget(this, tu); }
      }
      p.grave.push(c.id);
      this.broadcast(pi, 'onAllySpell', c);
    }
    this.cleanup();
    return true;
  }

  // 「選択」：占いと違い、必ず自分で選ぶ
  resolveChoose(pi, c, ctx) {
    const idx = ctx.choice != null ? ctx.choice : this.rnd(c.choose.length);
    const opt = c.choose[idx];
    this.say(`選択 → ${opt.text}`);
    this.ev({ t: 'divine', pi, idx });
    let target = ctx.target;
    if (opt.target && !target) target = this.pick(this.targetsFor(pi, opt.target));
    if (opt.target && !target) return;
    opt.run(this, { ...ctx, target });
  }

  resolveDivine(pi, c, ctx) {
    const p = this.p(pi);
    let idx;
    if (p.hitMode && ctx.choice != null) { idx = ctx.choice; p.hitMode = false; }
    else idx = this.rnd(2);
    const opt = c.divine[idx];
    this.say(`占い… ${idx === 0 ? '①' : '②'} ${opt.text}`);
    this.ev({ t: 'divine', pi, idx });
    let target = ctx.target;
    if (opt.target && !target) {
      const legal = this.targetsFor(pi, opt.target);
      target = this.pick(legal);
    }
    if (opt.target && !target) return;
    opt.run(this, { ...ctx, target });
  }

  useTension(pi, opts = {}) {
    if (this.s.winner !== null || this.s.active !== pi) return false;
    const p = this.p(pi);
    if (p.tension < 3) return false;
    const sk = TENSION_SKILLS[p.cls];
    let target = opts.target || null;
    if (sk.target) {
      const legal = this.targetsFor(pi, sk.target);
      if (!legal.length) return false;
      if (!target || !legal.some(r => this.sameRef(r, target))) return false;
    }
    p.tension = 0;
    this.ev({ t: 'tensionSkill', pi });
    this.say(`${p.name} のテンションスキル『${sk.name}』！`);
    sk.run(this, pi, { pi, target });
    this.broadcast(pi, 'onTensionSkill');
    this.cleanup();
    return true;
  }

  // ------------------------------------------------------------
  //  行動の列挙（AI 用・UI の可否判定にも使う）
  // ------------------------------------------------------------
  legalActions(pi, opt = {}) {
    const out = [];
    if (this.s.winner !== null || this.s.active !== pi) return out;
    const p = this.p(pi);

    // 攻撃（アンチステルスがあるかどうかで対象が変わるので、攻撃者ごとに引く）
    for (const u of this.unitsOf(pi)) {
      if (!this.canUnitAttack(u)) continue;
      for (const t of this.attackTargets(pi, u)) out.push({ type: 'attack', from: this.ref(u), to: t });
    }
    if (this.canLeaderAttack(pi)) {
      for (const t of this.attackTargets(pi, null)) out.push({ type: 'attack', from: this.leaderRef(pi), to: t });
    }

    // 英雄スキル（1ターンに1度）
    const sk = this.heroSkill(pi);
    if (sk && !p.hero.usedThisTurn && sk.cost <= p.mp) {
      if (sk.target) {
        for (const t of this.targetsFor(pi, sk.target)) out.push({ type: 'hero', target: t });
      } else out.push({ type: 'hero' });
    }

    // テンションスキル
    if (p.tension >= 3) {
      const sk = TENSION_SKILLS[p.cls];
      if (sk.target) {
        for (const t of this.targetsFor(pi, sk.target)) out.push({ type: 'tension', target: t });
      } else out.push({ type: 'tension' });
    }

    // カード
    const slots = this.emptySlots(pi);
    for (const inst of p.hand) {
      const c = CARDS[inst.cardId];
      const cost = this.effectiveCost(pi, inst);
      if (cost > p.mp) continue;
      if (c.type === 'unit' || c.type === 'dungeon') {
        if (!slots.length) continue;
        const useSlots = opt.compact ? this.compactSlots(pi, slots) : slots;
        const targets = c.target ? this.targetsFor(pi, c.target) : [];
        for (const s of useSlots) {
          if (c.target && targets.length) { for (const t of targets) out.push({ type: 'play', iid: inst.iid, slot: s, target: t }); }
          if (!c.target || !targets.length || c.targetOptional) out.push({ type: 'play', iid: inst.iid, slot: s });
        }
      } else if (c.choose) {
        c.choose.forEach((o, i) => {
          const ts = o.target ? this.targetsFor(pi, o.target) : [];
          if (o.target && ts.length) ts.forEach(t => out.push({ type: 'play', iid: inst.iid, choice: i, target: t }));
          else if (!o.target) out.push({ type: 'play', iid: inst.iid, choice: i });
        });
      } else if (c.divine) {
        if (p.hitMode) {
          c.divine.forEach((opt2, i) => {
            const ts = opt2.target ? this.targetsFor(pi, opt2.target) : [];
            if (opt2.target && ts.length) ts.forEach(t => out.push({ type: 'play', iid: inst.iid, choice: i, target: t }));
            else if (!opt2.target) out.push({ type: 'play', iid: inst.iid, choice: i });
          });
        } else out.push({ type: 'play', iid: inst.iid });
      } else {
        const targets = c.target ? this.targetsFor(pi, c.target) : [];
        if (c.target && targets.length) targets.forEach(t => out.push({ type: 'play', iid: inst.iid, target: t }));
        if (!c.target || (!targets.length && c.targetOptional)) out.push({ type: 'play', iid: inst.iid });
      }
    }
    out.push({ type: 'end' });
    return out;
  }

  // AI の分岐爆発を抑える。ただし「意味の違う置き方」は残す：
  // 前列/後列 × 同じ段の相方が埋まっているか、の4種類を代表させる。
  compactSlots(pi, slots) {
    const seen = new Set();
    const out = [];
    for (const s of slots) {
      const partner = this.slotUnit(pi, s.lane, 1 - s.col) ? 1 : 0;
      const key = s.col + ':' + partner;
      if (seen.has(key)) continue;
      seen.add(key); out.push(s);
    }
    return out;
  }

  apply(a) {
    const pi = this.s.active;
    switch (a.type) {
      case 'play':   return this.playCard(pi, a.iid, { slot: a.slot, target: a.target, choice: a.choice });
      case 'attack': return this.performAttack(pi, a.from, a.to);
      case 'tension':return this.useTension(pi, { target: a.target });
      case 'hero':   return this.useHeroSkill(pi, { target: a.target });
      case 'end':    this.endTurn(pi); return true;
    }
    return false;
  }

  drainEvents() { const e = this.s.events; this.s.events = []; return e; }
}
