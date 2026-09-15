// ============================================================
//  コンピューター対戦相手
//
//  難易度は「読みの深さ」だけでなく「何を理解しているか」で分けている。
//   かんたん  : 盤面の形が分からない。手も雑に選ぶ
//   ふつう    : 良い交換は分かるが、前列後列の使い分けが分からない
//   むずかしい: ブロック・ウォール・におうだちを理解し、返しの打点も数える
//   げきむず  : さらに「自分のターンを終えたあと相手が何をするか」まで読む
//
//  タイプは評価の重み（顔を殴るか、盤面を取るか、手札を貯めるか）。
// ============================================================

import { CARDS } from './cards.js';
import { FRONT, BACK, LEADER_HP } from './engine.js';

export const AI_TYPES = {
  aggro:    { name: 'アグロ',       desc: '序盤から顔面を殴り、押し切る',
              w: { face: 2.6, myHp: 0.7, board: 1.35, hand: 1.0, mana: 1.3, wall: 0.3, guard: 0.5 } },
  midrange: { name: 'ミッドレンジ', desc: '盤面を取りながら削り切る',
              w: { face: 1.7, myHp: 1.2, board: 1.8, hand: 1.5, mana: 1.0, wall: 0.9, guard: 0.9 } },
  control:  { name: 'コントロール', desc: '受け切ってから大型で勝つ',
              w: { face: 0.7, myHp: 2.4, board: 2.0, hand: 2.3, mana: 0.9, wall: 2.0, guard: 1.8 } },
  combo:    { name: 'コンボ',       desc: '手札を貯め、一気に決める',
              w: { face: 1.0, myHp: 1.7, board: 1.3, hand: 2.8, mana: 0.6, wall: 1.3, guard: 1.1 } },
  tempo:    { name: 'テンポ',       desc: '毎ターンMPを使い切り、主導権を渡さない',
              w: { face: 2.2, myHp: 1.0, board: 1.7, hand: 1.0, mana: 2.2, wall: 0.6, guard: 0.7 } },
};

// depth は「1ターンに組み立てる手順の長さ」でもある。浅いAIはMPを余らせる。
// blunder は1手ごとに最善手を捨ててでたらめな手を打つ確率。
export const AI_LEVELS = {
  easy:   { name: 'かんたん',   beam: 1,  depth: 3,  blunder: 0.30, shape: false, foresight: false,
            desc: '手なりで動く。マナも余らせる' },
  normal: { name: 'ふつう',     beam: 3,  depth: 7,  blunder: 0.08, shape: false, foresight: false,
            desc: '良い交換は分かるが、前列後列の使い分けが甘い' },
  hard:   { name: 'むずかしい', beam: 8,  depth: 16, blunder: 0,    shape: true,  foresight: true,
            desc: 'ブロック・ウォールを理解し、返しの打点も数える' },
  // wide（全マスを探索）は枝が増えすぎて逆に弱くなったので使わない。
  // 代わりに「相手の返し」を読む候補数を増やしてある。
  master: { name: 'げきむず',   beam: 14, depth: 24, blunder: 0,    shape: true,  foresight: true,
            reply: 6, desc: '自分のターンを終えたあと、相手が何をするかまで読む' },
};

// ------------------------------------------------------------
//  ユニット1体の価値
// ------------------------------------------------------------
function unitValue(g, u, shape) {
  const atk = g.atkOf(u), hp = g.hpOf(u);
  let v = atk * 1.15 + hp * 1.0 + 1.0;
  if (g.hasKw(u, 'におうだち')) v += shape ? (u.col === FRONT ? 2.6 : 0.4) : 1.6;
  if (g.hasKw(u, 'ステルス')) v += 1.8;
  if (g.hasKw(u, '貫通')) v += 1.0;
  if (g.hasKw(u, '速攻')) v += 0.5;
  if (g.hasKw(u, 'メタルボディ')) v += 3.0;
  if (g.hasKw(u, '２回攻撃')) v += atk * 0.6;
  if (u.frozen > 0) v -= 1.6;
  return v;
}

// 盤面の「かたち」。ブロック・ウォールを理解しているAIだけが見る。
function shapeScore(g, pi, w) {
  let s = 0, lanes = 0;
  for (let l = 0; l < 3; l++) {
    const f = g.slotUnit(pi, l, FRONT), b = g.slotUnit(pi, l, BACK);
    if (f || b) lanes++;
    if (b && f) s += 1.3 * w.guard;   // 後列がブロックで守られている
    if (b && !f) s -= 0.6 * w.guard;  // 後列が裸
  }
  if (lanes === 3) s += 3.5 * w.wall; // ウォール成立
  else s += lanes * 0.35 * w.wall;
  return s;
}

// 相手が次のターンにリーダーへ通せる打点。
// におうだち・ウォールを考慮して「本当に顔に届く分」だけ数える。
function reachableFaceDamage(g, pi) {
  const opp = 1 - pi;
  const wall = [0, 1, 2].every(l => g.slotUnit(pi, l, FRONT) || g.slotUnit(pi, l, BACK));
  if (wall) return 0;
  const taunts = g.unitsOf(pi).filter(u => u.col === FRONT && g.hasKw(u, 'におうだち'));
  if (taunts.length) return 0;
  let t = 0;
  for (const u of g.unitsOf(opp)) if (u.frozen === 0) t += g.atkOf(u);
  if (g.p(opp).weapon) t += g.p(opp).weapon.atk;
  return t;
}

export function evaluate(g, pi, prof, level) {
  const w = prof.w;
  if (g.s.winner === pi) return 1e6;
  if (g.s.winner === 1 - pi) return -1e6;
  if (g.s.winner === 'draw') return -5e5;

  const me = g.p(pi), op = g.p(1 - pi);
  const shape = !!(level && level.shape);
  let s = 0;

  s += (LEADER_HP - op.hp) * w.face;
  s -= (LEADER_HP - me.hp) * w.myHp;

  for (const u of g.unitsOf(pi)) s += unitValue(g, u, shape) * w.board;
  for (const u of g.unitsOf(1 - pi)) s -= unitValue(g, u, shape) * w.board;

  if (shape) {
    s += shapeScore(g, pi, w);
    s -= shapeScore(g, 1 - pi, w) * 0.7;
  }

  s += me.hand.length * w.hand;
  s -= me.mp * w.mana * 1.4;
  s += me.tension * 0.8;

  // 英雄：共闘しているだけで毎ターンの手数が増える。レベルが上がるほど強い。
  s += heroValue(g, pi) - heroValue(g, 1 - pi) * 0.8;
  // ダンジョン：踏破に近いほど価値がある。マスを1つ潰している分は差し引く。
  s += dungeonValue(g, pi) - dungeonValue(g, 1 - pi) * 0.8;
  if (me.weapon) s += me.weapon.atk * me.weapon.dur * 0.35;
  s -= Math.max(0, 6 - me.deck.length) * 1.6;

  if (level && level.foresight) {
    const face = reachableFaceDamage(g, pi);
    if (me.hp - face <= 0) s -= 45;
    else if (me.hp - face <= 5) s -= 9;
    // 自分が相手の顔に届くかどうかも価値
    const myReach = reachableFaceDamage(g, 1 - pi);
    if (op.hp - myReach <= 0) s += 25;
  }
  return s;
}

function heroValue(g, pi) {
  const h = g.p(pi).hero;
  if (!h) return 0;
  const sk = g.heroSkill(pi);
  return 4 + h.level * 3 + (sk && !h.usedThisTurn ? 1.5 : 0);
}

function dungeonValue(g, pi) {
  let v = 0;
  for (const d of g.dungeonsOf(pi)) {
    v += 1.5 + (d.dur / Math.max(1, d.goal)) * 6;   // 踏破が近いほど価値が上がる
    v -= 2.0;                                        // マスを1つ使っている
  }
  return v;
}

// ------------------------------------------------------------
//  行動の絞り込み
// ------------------------------------------------------------
function quickScore(g, pi, a) {
  if (a.type === 'attack') {
    const atk = a.from.k === 'l' ? g.leaderAtk(pi) : (g.unitOf(a.from) ? g.atkOf(g.unitOf(a.from)) : 0);
    if (a.to.k === 'l') return 7 + atk * 0.4;
    const d = g.unitOf(a.to);
    if (!d) return 0;
    const kills = atk >= g.hpOf(d);
    const survives = a.from.k === 'l' || g.hpOf(g.unitOf(a.from)) > g.atkOf(d);
    return (kills ? 10 : 2) + (survives ? 4 : 0) + g.atkOf(d) * 0.4;
  }
  if (a.type === 'tension') return 9;
  if (a.type === 'hero') return 8;
  if (a.type === 'play') {
    const inst = g.p(pi).hand.find(h => h.iid === a.iid);
    return inst ? 6 + CARDS[inst.cardId].cost * 0.4 : 0;
  }
  return 0;
}

function pruneActions(g, pi, acts, level) {
  const out = acts.filter(a => a.type !== 'end');
  const cap = level.wide ? 26 : 18;
  if (out.length <= cap) return out;
  const scored = out.map(a => ({ a, q: quickScore(g, pi, a) }));
  scored.sort((x, y) => y.q - x.q);
  return scored.slice(0, cap).map(x => x.a);
}

// ------------------------------------------------------------
//  相手の返しまで読む（げきむず専用）
// ------------------------------------------------------------
const REPLY_LEVEL = { beam: 2, depth: 10, noise: 0, shape: true, foresight: false };

function opponentReplyScore(g, pi, prof) {
  const g2 = g.clone();
  g2.apply({ type: 'end' });
  if (g2.s.winner !== null) return evaluate(g2, pi, prof, REPLY_LEVEL);
  const opp = 1 - pi;
  const oppProf = AI_TYPES.midrange;
  const acts = search(g2, opp, oppProf, REPLY_LEVEL).acts;
  for (const a of acts) { if (!g2.apply(a)) break; }
  return evaluate(g2, pi, prof, REPLY_LEVEL);
}

// ------------------------------------------------------------
//  ビームサーチ本体
// ------------------------------------------------------------
function search(game, pi, prof, level) {
  let beam = [{ g: game.clone(), acts: [], score: evaluate(game, pi, prof, level) }];
  let best = { acts: [], score: beam[0].score, g: beam[0].g };
  const leaves = [best];

  for (let d = 0; d < level.depth; d++) {
    const next = [];
    for (const node of beam) {
      if (node.g.s.winner !== null) continue;
      const raw = node.g.legalActions(pi, { compact: !level.wide });
      for (const a of pruneActions(node.g, pi, raw, level)) {
        const g2 = node.g.clone();
        if (!g2.apply(a)) continue;
        next.push({ g: g2, acts: [...node.acts, a], score: evaluate(g2, pi, prof, level) });
      }
    }
    if (!next.length) break;
    next.sort((x, y) => y.score - x.score);
    if (next[0].score > best.score) best = next[0];
    leaves.push(...next.slice(0, Math.max(2, level.beam)));
    beam = next.slice(0, level.beam);
    if (next[0].score >= 1e6) return { acts: next[0].acts, score: next[0].score, leaves };
  }
  return { acts: best.acts, score: best.score, leaves };
}

export function planTurn(game, pi, typeKey, levelKey) {
  const prof = AI_TYPES[typeKey] || AI_TYPES.midrange;
  const level = AI_LEVELS[levelKey] || AI_LEVELS.normal;

  const res = search(game, pi, prof, level);
  let acts = res.acts;

  // げきむず：候補のうち上位いくつかについて「相手の返し」まで読んで選び直す
  if (level.reply && res.score < 1e6) {
    const seen = new Set();
    const cands = [];
    for (const lf of res.leaves.sort((a, b) => b.score - a.score)) {
      const key = JSON.stringify(lf.acts);
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push(lf);
      if (cands.length >= level.reply) break;
    }
    let bestC = null;
    for (const c of cands) {
      const sc = opponentReplyScore(c.g, pi, prof);
      if (!bestC || sc > bestC.sc) bestC = { sc, acts: c.acts };
    }
    if (bestC) acts = bestC.acts;
  }

  return acts;
}

// ------------------------------------------------------------
//  実ゲームへの適用（乱数で計画がずれたら組み直す）
// ------------------------------------------------------------
export function createAiController(typeKey, levelKey) {
  let queue = [];
  let plannedTurn = -1;
  let replans = 0;
  const level = AI_LEVELS[levelKey] || AI_LEVELS.normal;
  return {
    type: typeKey, level: levelKey,
    reset() { queue = []; plannedTurn = -1; replans = 0; },
    // 次の1手。null を返したらターン終了。
    // 手順はターンの最初に一度だけ組み立てる。途中で乱数がずれて
    // 手が打てなくなったときだけ組み直す（浅いAIは手順が短く、MPが余る）。
    nextAction(game, pi) {
      if (game.s.winner !== null) return null;
      if (plannedTurn !== game.s.turn) {
        plannedTurn = game.s.turn;
        replans = 0;
        queue = planTurn(game, pi, typeKey, levelKey);
      }
      while (queue.length) {
        const a = queue.shift();
        if (isStillLegal(game, pi, a)) {
          if (level.blunder && Math.random() < level.blunder) {
            const raw = game.legalActions(pi, { compact: true }).filter(x => x.type !== 'end');
            if (raw.length) { queue = []; replans++; return raw[Math.floor(Math.random() * raw.length)]; }
          }
          return a;
        }
        if (replans++ > 6) return null;
        queue = planTurn(game, pi, typeKey, levelKey);
      }
      return null;
    },
  };
}

function isStillLegal(game, pi, a) {
  return game.legalActions(pi, { compact: false }).some(b => sameAction(a, b));
}
function sameAction(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'play') return a.iid === b.iid
    && JSON.stringify(a.slot || null) === JSON.stringify(b.slot || null)
    && JSON.stringify(a.target || null) === JSON.stringify(b.target || null)
    && (a.choice ?? null) === (b.choice ?? null);
  if (a.type === 'attack') return JSON.stringify(a.from) === JSON.stringify(b.from) && JSON.stringify(a.to) === JSON.stringify(b.to);
  if (a.type === 'tension') return JSON.stringify(a.target || null) === JSON.stringify(b.target || null);
  return true;
}
