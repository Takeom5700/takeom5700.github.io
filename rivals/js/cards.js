// ============================================================
//  カードデータベース
//  ドラゴンクエストライバルズのカードを再現したもの。
//  数値・効果は記憶と公開情報からの再構成で、原作と完全一致ではない。
// ============================================================

export const CLASSES = {
  neutral:   { name: 'ニュートラル', leader: null,       color: '#b9a48c' },
  warrior:   { name: '戦士',        leader: 'テリー',   color: '#d64b3f' },
  mage:      { name: '魔法使い',    leader: 'ゼシカ',   color: '#8e5cd9' },
  priest:    { name: '僧侶',        leader: 'ククール', color: '#4fb3d9' },
  martial:   { name: '武闘家',      leader: 'アリーナ', color: '#e08b2e' },
  merchant:  { name: '商人',        leader: 'トルネコ', color: '#3fa86a' },
  darkknight:{ name: '魔剣士',      leader: 'ピサロ',   color: '#a33b6e' },
  fortune:   { name: '占い師',      leader: 'ミネア',   color: '#c9a227' },
};

export const PLAYABLE_CLASSES = ['warrior', 'mage', 'priest', 'martial', 'merchant', 'darkknight', 'fortune'];

// テンションスキル（各リーダー固有・テンションMAXで発動）
export const TENSION_SKILLS = {
  warrior: {
    name: '稲妻の加護',
    text: 'このターン中、味方リーダーは攻撃力+3と貫通を得る',
    run(g, pi) { g.leaderAtkBuff(pi, 3); g.leaderGrant(pi, '貫通'); },
  },
  mage: {
    name: '紅蓮の火球',
    text: '敵ユニット1体に3ダメージを与える',
    target: { side: 'enemy', kind: 'unit' },
    run(g, pi, ctx) { g.dmg(ctx.target, 3, { spell: true, pi }); },
  },
  priest: {
    name: 'いやしの波動',
    text: '味方キャラすべてのHPを3回復する',
    run(g, pi) { g.allyChars(pi).forEach(r => g.heal(r, 3)); },
  },
  martial: {
    name: 'おてんば姫',
    text: 'カードを1枚引き、武術カードを1枚手札に加える',
    run(g, pi) { g.draw(pi, 1); g.addRandomFromPool(pi, c => c.sub === '武術', 1); },
  },
  merchant: {
    name: 'お宝発見',
    text: 'ランダムな道具カードを3枚手札に加える',
    run(g, pi) { g.addRandomFromPool(pi, c => c.sub === '道具', 3); },
  },
  darkknight: {
    name: '魔族の騎士',
    text: '3/2のピサロナイトを召喚する',
    run(g, pi) { g.summon(pi, 'pisaro_knight'); },
  },
  fortune: {
    name: '水晶占い',
    text: 'デッキから特技カードを1枚引き、そのカードのコストを-1する',
    run(g, pi) { g.drawFiltered(pi, c => c.type === 'spell', card => { if (card) card.costMod = (card.costMod || 0) - 1; }); },
  },
};

export const KEYWORD_TEXT = {
  'におうだち': '前列にいるあいだ、敵はこのユニットを優先して攻撃しなければならない',
  'ステルス':   '自身が攻撃するまで、敵の攻撃や効果の対象にならない',
  '貫通':       '攻撃時、攻撃対象の後ろにいるユニットにもダメージを与える（反撃は受けない）',
  '速攻':       '召喚したターンから攻撃できる',
  '２回攻撃':   '1ターンに2回攻撃できる',
  'メタルボディ': '受けるダメージが1になる',
  'アンチステルス': 'ステルスのユニットも攻撃できる',
  'テンションリンク': '味方がテンションスキルを使ったときに発動する',
};

export const CARDS = {};
const C = (def) => {
  if (CARDS[def.id]) throw new Error('duplicate card id: ' + def.id);
  def.kw = def.kw || [];
  def.rarity = def.rarity || 'N';
  def.cls = def.cls || 'neutral';
  CARDS[def.id] = def;
  return def;
};

// 便利なターゲット指定
const T_ENEMY_UNIT = { side: 'enemy', kind: 'unit' };
const T_ALLY_UNIT  = { side: 'ally',  kind: 'unit' };
const T_ANY_UNIT   = { side: 'any',   kind: 'unit' };
const T_ALLY_CHAR  = { side: 'ally',  kind: 'char' };
const T_ANY_CHAR   = { side: 'any',   kind: 'char' };
const T_ENEMY_CHAR = { side: 'enemy', kind: 'char' };

// ============================================================
//  中立ユニット
// ============================================================

C({ id:'slime', name:'スライム', cost:1, type:'unit', atk:1, hp:2, text:'' });
C({ id:'dracky', name:'ドラキー', cost:1, type:'unit', atk:2, hp:1, text:'' });
C({ id:'slime_beth', name:'スライムベス', cost:1, type:'unit', atk:1, hp:1,
    text:'召喚時：味方リーダーのHPを1回復する',
    summon(g, self){ g.heal(g.leaderRef(self.pi), 1); } });
C({ id:'baby_panther', name:'ベビーパンサー', cost:1, type:'unit', atk:2, hp:1, kw:['速攻'],
    text:'速攻' });
C({ id:'oomedama', name:'おおめだま', cost:1, type:'unit', atk:0, hp:3, kw:['におうだち'],
    text:'におうだち' });
C({ id:'candle', name:'おばけキャンドル', cost:1, type:'unit', atk:1, hp:1, rarity:'R',
    text:'召喚時：敵ユニット1体に1ダメージを与える',
    target:T_ENEMY_UNIT, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) g.dmg(ctx.target, 1, { pi:self.pi }); } });

C({ id:'ookiduchi', name:'おおきづち', cost:2, type:'unit', atk:2, hp:2, text:'' });
C({ id:'healslime', name:'ホイミスライム', cost:2, type:'unit', atk:1, hp:3,
    text:'召喚時：味方キャラ1体のHPを3回復する',
    target:T_ALLY_CHAR, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) g.heal(ctx.target, 3); } });
C({ id:'metal_slime', name:'メタルスライム', cost:2, type:'unit', atk:1, hp:2, rarity:'R',
    kw:['メタルボディ'], text:'メタルボディ' });
C({ id:'oonamekuji', name:'おおなめくじ', cost:2, type:'unit', atk:1, hp:4, kw:['におうだち'],
    text:'におうだち' });
C({ id:'madhand', name:'マドハンド', cost:2, type:'unit', atk:1, hp:1, rarity:'R',
    text:'死亡時：マドハンドを2体召喚する',
    death(g, self){ g.summon(self.pi, 'madhand_token'); g.summon(self.pi, 'madhand_token'); } });
C({ id:'madhand_token', name:'マドハンド', cost:1, type:'unit', atk:1, hp:1, token:true, text:'' });
C({ id:'mummy', name:'ミイラおとこ', cost:2, type:'unit', atk:2, hp:2,
    text:'死亡時：ランダムな敵ユニット1体に2ダメージを与える',
    death(g, self){ const t = g.randEnemyUnit(self.pi); if (t) g.dmg(t, 2, { pi:self.pi }); } });
C({ id:'mage_dracky', name:'メイジドラキー', cost:2, type:'unit', atk:1, hp:2,
    text:'召喚時：ランダムな敵ユニット1体に1ダメージを与える',
    summon(g, self){ const t = g.randEnemyUnit(self.pi); if (t) g.dmg(t, 1, { pi:self.pi }); } });
C({ id:'sasoribachi', name:'さそりばち', cost:2, type:'unit', atk:3, hp:1, text:'' });
C({ id:'kusattashitai', name:'くさったしたい', cost:2, type:'unit', atk:3, hp:3, rarity:'R',
    text:'ターン終了時：味方リーダーに1ダメージ',
    turnEnd(g, self){ g.dmg(g.leaderRef(self.pi), 1, { pi:self.pi, noTrigger:true }); } });
C({ id:'shibirekurage', name:'しびれくらげ', cost:2, type:'unit', atk:1, hp:3,
    text:'召喚時：敵ユニット1体を行動不能にする',
    target:T_ENEMY_UNIT, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) g.freeze(ctx.target); } });

C({ id:'killer_panther', name:'キラーパンサー', cost:3, type:'unit', atk:3, hp:2, kw:['速攻'],
    rarity:'R', text:'速攻' });
C({ id:'chimera', name:'キメラ', cost:3, type:'unit', atk:3, hp:2, text:'' });
C({ id:'arakure', name:'あらくれ', cost:3, type:'unit', atk:4, hp:2, text:'' });
C({ id:'obake_kinoko', name:'おばけキノコ', cost:3, type:'unit', atk:2, hp:4, kw:['におうだち'],
    text:'におうだち' });
C({ id:'gargoyle', name:'ガーゴイル', cost:3, type:'unit', atk:2, hp:5, kw:['におうだち'], text:'におうだち' });
C({ id:'dokuyazukin', name:'どくやずきん', cost:3, type:'unit', atk:3, hp:2, kw:['ステルス'],
    rarity:'R', text:'ステルス' });
C({ id:'youjutsushi', name:'ようじゅつし', cost:3, type:'unit', atk:2, hp:3,
    text:'召喚時：敵ユニット1体に2ダメージを与える',
    target:T_ENEMY_UNIT, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) g.dmg(ctx.target, 2, { pi:self.pi }); } });
C({ id:'mimic', name:'ミミック', cost:3, type:'unit', atk:3, hp:3, rarity:'R',
    text:'死亡時：敵リーダーに2ダメージを与える',
    death(g, self){ g.dmg(g.leaderRef(1-self.pi), 2, { pi:self.pi }); } });
C({ id:'hell_condor', name:'ヘルコンドル', cost:3, type:'unit', atk:3, hp:2, kw:['速攻'], text:'速攻' });
C({ id:'doronuba', name:'ドロヌーバ', cost:3, type:'unit', atk:1, hp:6, kw:['におうだち'], text:'におうだち' });

C({ id:'samayou_yoroi', name:'さまようよろい', cost:4, type:'unit', atk:3, hp:5, kw:['におうだち'],
    text:'におうだち' });
C({ id:'slime_knight', name:'スライムナイト', cost:4, type:'unit', atk:3, hp:4, rarity:'R',
    text:'召喚時：味方ユニット1体に+1/+1を与える',
    target:T_ALLY_UNIT, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) g.buff(ctx.target, 1, 1); } });
C({ id:'hagure_metal', name:'はぐれメタル', cost:4, type:'unit', atk:2, hp:2, rarity:'SR',
    kw:['メタルボディ'], text:'メタルボディ／死亡時：カードを1枚引く',
    death(g, self){ g.draw(self.pi, 1); } });
C({ id:'ryuukihei', name:'りゅうき兵', cost:4, type:'unit', atk:4, hp:4, text:'' });
C({ id:'devil_armor', name:'デビルアーマー', cost:4, type:'unit', atk:2, hp:6, kw:['におうだち'], text:'におうだち' });
C({ id:'behoma_slime', name:'ベホマスライム', cost:4, type:'unit', atk:2, hp:4,
    text:'召喚時：味方キャラすべてのHPを2回復する',
    summon(g, self){ g.allyChars(self.pi).forEach(r => g.heal(r, 2)); } });
C({ id:'hitokuibako', name:'ひとくいばこ', cost:4, type:'unit', atk:4, hp:3,
    text:'召喚時：カードを1枚引く', summon(g, self){ g.draw(self.pi, 1); } });

C({ id:'dragon', name:'ドラゴン', cost:5, type:'unit', atk:5, hp:5, rarity:'R', text:'' });
C({ id:'keith_dragon', name:'キースドラゴン', cost:5, type:'unit', atk:5, hp:4, kw:['貫通'],
    rarity:'R', text:'貫通' });
C({ id:'akuma_no_kishi', name:'あくまのきし', cost:5, type:'unit', atk:5, hp:4, kw:['におうだち'],
    text:'におうだち' });
C({ id:'jigoku_no_hasami', name:'じごくのハサミ', cost:5, type:'unit', atk:4, hp:5, kw:['におうだち'], text:'におうだち' });
C({ id:'metal_hunter', name:'メタルハンター', cost:5, type:'unit', atk:4, hp:5, text:'' });
C({ id:'shinigami_kizoku', name:'しにがみきぞく', cost:5, type:'unit', atk:4, hp:4,
    text:'死亡時：味方リーダーのHPを4回復する',
    death(g, self){ g.heal(g.leaderRef(self.pi), 4); } });

C({ id:'golem', name:'ゴーレム', cost:6, type:'unit', atk:6, hp:6, kw:['におうだち'], rarity:'R',
    text:'におうだち' });
C({ id:'killer_machine', name:'キラーマシン', cost:6, type:'unit', atk:6, hp:5, kw:['貫通'],
    rarity:'SR', text:'貫通' });
C({ id:'metal_king', name:'メタルキング', cost:6, type:'unit', atk:3, hp:6, kw:['メタルボディ'],
    rarity:'SR', text:'メタルボディ' });
C({ id:'bostroll', name:'ボストロール', cost:6, type:'unit', atk:5, hp:7, kw:['におうだち'], text:'におうだち' });

C({ id:'great_dragon', name:'グレイトドラゴン', cost:7, type:'unit', atk:7, hp:6, rarity:'SR',
    text:'召喚時：敵の前列のユニットすべてに3ダメージを与える',
    summon(g, self){ g.rowUnits(1-self.pi, 0).forEach(u => g.dmg(g.ref(u), 3, { pi:self.pi })); } });
C({ id:'yamata', name:'やまたのおろち', cost:7, type:'unit', atk:6, hp:6, kw:['貫通'], rarity:'SR',
    text:'貫通' });
C({ id:'gigantes', name:'ギガンテス', cost:7, type:'unit', atk:8, hp:6, text:'' });
C({ id:'bazuzu', name:'バズズ', cost:7, type:'unit', atk:6, hp:6,
    text:'召喚時：ランダムな敵ユニット2体に3ダメージを与える',
    summon(g, self){ for (let i=0;i<2;i++){ const t=g.randEnemyUnit(self.pi); if(t) g.dmg(t,3,{pi:self.pi}); } } });
C({ id:'belial', name:'ベリアル', cost:8, type:'unit', atk:7, hp:7, rarity:'R',
    text:'召喚時：敵リーダーに3ダメージを与える',
    summon(g, self){ g.dmg(g.leaderRef(1-self.pi), 3, { pi:self.pi }); } });
C({ id:'atlas', name:'アトラス', cost:8, type:'unit', atk:8, hp:8, kw:['におうだち'], rarity:'SR',
    text:'におうだち' });
C({ id:'baramos', name:'バラモス', cost:8, type:'unit', atk:6, hp:6, rarity:'LEG',
    text:'召喚時：敵ユニットすべてに3ダメージを与える',
    summon(g, self){ g.enemyUnits(self.pi).forEach(u => g.dmg(g.ref(u), 3, { pi:self.pi })); } });
C({ id:'estark', name:'エスターク', cost:9, type:'unit', atk:7, hp:7, rarity:'LEG',
    text:'このカードのコストは、味方リーダーが失ったHPの分だけ下がる',
    costCalc(g, pi){ return Math.max(1, 9 - g.hpLost(pi)); } });
C({ id:'mildrath', name:'ミルドラース', cost:9, type:'unit', atk:7, hp:9, rarity:'LEG',
    text:'ターン終了時：敵リーダーに2ダメージを与える',
    turnEnd(g, self){ g.dmg(g.leaderRef(1-self.pi), 2, { pi:self.pi }); } });
C({ id:'ryuuou', name:'りゅうおう', cost:10, type:'unit', atk:6, hp:6, rarity:'LEG',
    text:'召喚時：竜王（8/8・貫通）に変身する',
    summon(g, self){ g.transform(self, 'ryuuou_true'); } });
C({ id:'ryuuou_true', name:'竜王', cost:10, type:'unit', atk:8, hp:8, kw:['貫通'], token:true, text:'貫通' });
C({ id:'sidoh', name:'シドー', cost:10, type:'unit', atk:9, hp:9, rarity:'LEG',
    text:'召喚時：このユニット以外の場のユニットをすべて破壊する',
    summon(g, self){ g.allUnits().filter(u => u.uid !== self.uid).forEach(u => g.destroy(g.ref(u))); } });
C({ id:'zoma', name:'ゾーマ', cost:10, type:'unit', atk:8, hp:8, rarity:'LEG',
    text:'召喚時：敵ユニットすべてに5ダメージを与える',
    summon(g, self){ g.enemyUnits(self.pi).forEach(u => g.dmg(g.ref(u), 5, { pi:self.pi })); } });
C({ id:'dark_dream', name:'ダークドレアム', cost:10, type:'unit', atk:9, hp:9, rarity:'LEG',
    text:'攻撃後：もう一度だけ行動できる',
    afterAttack(g, self){ if (!self.dreamUsed) { self.dreamUsed = true; g.refreshAttack(self); } } });

// ============================================================
//  戦士（テリー） — 武器で殴り、盤面を制圧する
// ============================================================
const W = 'warrior';
C({ id:'w_dou_no_tsurugi', name:'どうのつるぎ', cost:2, type:'weapon', cls:W, wAtk:2, wDur:2, text:'' });
C({ id:'w_kusanagi', name:'くさなぎのけん', cost:3, type:'weapon', cls:W, wAtk:2, wDur:3, rarity:'R',
    text:'装備時：味方ユニットすべてに+1/+0を与える',
    summon(g, self, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 1, 0)); } });
C({ id:'w_hagane', name:'はがねのつるぎ', cost:4, type:'weapon', cls:W, wAtk:3, wDur:3, text:'' });
C({ id:'w_hayabusa', name:'はやぶさの剣', cost:4, type:'weapon', cls:W, wAtk:2, wDur:3, rarity:'SR',
    wKw:['２回攻撃'], text:'リーダーは1ターンに2回攻撃できる' });
C({ id:'w_dragon_killer', name:'ドラゴンキラー', cost:5, type:'weapon', cls:W, wAtk:4, wDur:2, rarity:'R', text:'' });
C({ id:'w_gringham', name:'グリンガムのムチ', cost:7, type:'weapon', cls:W, wAtk:4, wDur:4, rarity:'LEG',
    wKw:['貫通'], text:'リーダーの攻撃は貫通を持つ' });

C({ id:'w_chikaratame', name:'ちからため', cost:1, type:'spell', cls:W,
    text:'テンションアップ。カードを1枚引く',
    play(g, ctx){ g.tension(ctx.pi, 1); g.draw(ctx.pi, 1); } });
C({ id:'w_konshin', name:'渾身斬り', cost:3, type:'spell', cls:W, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に4ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 4, { spell:true, pi:ctx.pi }); } });
C({ id:'w_midaregiri', name:'みだれ斬り', cost:3, type:'spell', cls:W,
    text:'ランダムな敵ユニットに2ダメージを3回与える',
    play(g, ctx){ for (let i=0;i<3;i++){ const t=g.randEnemyUnit(ctx.pi); if(t) g.dmg(t,2,{spell:true,pi:ctx.pi}); } } });
C({ id:'w_majin', name:'まじん斬り', cost:4, type:'spell', cls:W, target:T_ENEMY_UNIT, rarity:'R',
    text:'敵ユニット1体を破壊する',
    play(g, ctx){ g.destroy(ctx.target); } });
C({ id:'w_hatajirushi', name:'勇気の旗印', cost:2, type:'spell', cls:W,
    text:'味方ユニットすべてに+1/+1を与える',
    play(g, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 1, 1)); } });
C({ id:'w_arakure_yobi', name:'あらくれ呼び', cost:4, type:'spell', cls:W, rarity:'R',
    text:'4/2のあらくれを2体召喚する',
    play(g, ctx){ g.summon(ctx.pi, 'arakure'); g.summon(ctx.pi, 'arakure'); } });
C({ id:'w_kabau', name:'におうだちの構え', cost:2, type:'spell', cls:W, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+0/+3とにおうだちを与える',
    play(g, ctx){ g.buff(ctx.target, 0, 3); g.grantKw(ctx.target, 'におうだち'); } });

C({ id:'w_heishi', name:'兵士', cost:2, type:'unit', cls:W, atk:2, hp:3, kw:['におうだち'], text:'におうだち' });
C({ id:'w_bianca', name:'ビアンカ', cost:3, type:'unit', cls:W, atk:2, hp:4, rarity:'R',
    text:'召喚時：武器を装備しているなら、その武器の攻撃力+1',
    summon(g, self){ g.weaponBuff(self.pi, 1); } });
C({ id:'w_kajiya', name:'さすらいの鍛冶屋', cost:3, type:'unit', cls:W, atk:2, hp:3,
    text:'召喚時：武器カードを1枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.type === 'weapon'); } });
C({ id:'w_goldman', name:'ゴールドマン', cost:5, type:'unit', cls:W, atk:3, hp:8, kw:['におうだち'],
    rarity:'R', text:'におうだち' });
C({ id:'w_yuukan', name:'ゆうかんな兵士', cost:4, type:'unit', cls:W, atk:3, hp:4,
    text:'攻撃時：味方リーダーが武器を装備しているなら+2/+0',
    onAttack(g, self){ if (g.hasWeapon(self.pi)) g.buff(g.ref(self), 2, 0); } });
C({ id:'w_terry', name:'テリー', cost:7, type:'unit', cls:W, atk:6, hp:6, kw:['貫通','速攻'],
    rarity:'LEG', text:'貫通／速攻' });

// ============================================================
//  魔法使い（ゼシカ） — 特技で焼き切る
// ============================================================
const M = 'mage';
C({ id:'m_mera', name:'メラ', cost:1, type:'spell', cls:M, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に2ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); } });
C({ id:'m_hyado', name:'ヒャド', cost:1, type:'spell', cls:M, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に1ダメージを与え、行動不能にする',
    play(g, ctx){ g.dmg(ctx.target, 1, { spell:true, pi:ctx.pi }); g.freeze(ctx.target); } });
C({ id:'m_io', name:'イオ', cost:2, type:'spell', cls:M,
    text:'敵ユニットすべてに1ダメージを与える',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 1, { spell:true, pi:ctx.pi })); } });
C({ id:'m_rukani', name:'ルカニ', cost:1, type:'spell', cls:M, target:T_ENEMY_UNIT,
    text:'敵ユニット1体の最大HPを-2する',
    play(g, ctx){ g.buff(ctx.target, 0, -2); } });
C({ id:'m_mahotora', name:'マホトラ', cost:2, type:'spell', cls:M,
    text:'このターンのMPを2増やす',
    play(g, ctx){ g.gainMp(ctx.pi, 2); } });
C({ id:'m_gira', name:'ギラ', cost:2, type:'spell', cls:M, target:T_ANY_CHAR,
    text:'敵1体に3ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 3, { spell:true, pi:ctx.pi }); } });
C({ id:'m_merami', name:'メラミ', cost:3, type:'spell', cls:M, target:T_ANY_CHAR,
    text:'敵1体に4ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 4, { spell:true, pi:ctx.pi }); } });
C({ id:'m_begirama', name:'ベギラマ', cost:4, type:'spell', cls:M, rarity:'R',
    text:'敵の前列のユニットすべてに4ダメージを与える',
    play(g, ctx){ g.rowUnits(1-ctx.pi, 0).forEach(u => g.dmg(g.ref(u), 4, { spell:true, pi:ctx.pi })); } });
C({ id:'m_kakusei', name:'魔力かくせい', cost:2, type:'spell', cls:M, rarity:'R',
    text:'このターン、味方の特技のダメージ+2',
    play(g, ctx){ g.spellPower(ctx.pi, 2); } });
C({ id:'m_mahyado', name:'マヒャド', cost:5, type:'spell', cls:M, rarity:'R',
    text:'敵ユニットすべてに2ダメージを与え、行動不能にする',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => { const r=g.ref(u); g.dmg(r,2,{spell:true,pi:ctx.pi}); g.freeze(r); }); } });
C({ id:'m_iora', name:'イオラ', cost:5, type:'spell', cls:M, rarity:'R',
    text:'敵ユニットすべてに4ダメージを与える',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 4, { spell:true, pi:ctx.pi })); } });
C({ id:'m_merazoma', name:'メラゾーマ', cost:6, type:'spell', cls:M, target:T_ANY_CHAR, rarity:'SR',
    text:'敵1体に8ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 8, { spell:true, pi:ctx.pi }); } });
C({ id:'m_ionazun', name:'イオナズン', cost:8, type:'spell', cls:M, rarity:'SR',
    text:'敵すべてに6ダメージを与える（リーダーを含む）',
    play(g, ctx){ g.enemyChars(ctx.pi).forEach(r => g.dmg(r, 6, { spell:true, pi:ctx.pi })); } });
C({ id:'m_madante', name:'マダンテ', cost:10, type:'spell', cls:M, rarity:'LEG',
    text:'敵すべてに8ダメージを与える（リーダーを含む）',
    play(g, ctx){ g.enemyChars(ctx.pi).forEach(r => g.dmg(r, 8, { spell:true, pi:ctx.pi })); } });

C({ id:'m_babysatan', name:'ベビーサタン', cost:2, type:'unit', cls:M, atk:1, hp:3,
    text:'召喚時：特技カードを1枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.type === 'spell'); } });
C({ id:'m_mahoutsukai', name:'まほうつかい', cost:3, type:'unit', cls:M, atk:2, hp:3, rarity:'R',
    text:'味方の特技のダメージ+1',
    aura:{ spellPower:1 } });
C({ id:'m_silver_devil', name:'シルバーデビル', cost:4, type:'unit', cls:M, atk:3, hp:4,
    text:'味方が特技を使うたびに、ランダムな敵ユニット1体に1ダメージ',
    onAllySpell(g, self){ const t = g.randEnemyUnit(self.pi); if (t) g.dmg(t, 1, { pi:self.pi }); } });
C({ id:'m_hell_ghost', name:'ヘルゴースト', cost:3, type:'unit', cls:M, atk:3, hp:2, kw:['ステルス'], text:'ステルス' });
C({ id:'m_balzack', name:'バルザック', cost:6, type:'unit', cls:M, atk:5, hp:5, rarity:'R',
    text:'召喚時：敵ユニットすべてに2ダメージを与える',
    summon(g, self){ g.enemyUnits(self.pi).forEach(u => g.dmg(g.ref(u), 2, { pi:self.pi })); } });
C({ id:'m_jessica', name:'ゼシカ', cost:6, type:'unit', cls:M, atk:5, hp:5, rarity:'LEG',
    text:'味方が特技を使うたびに+2/+0',
    onAllySpell(g, self){ g.buff(g.ref(self), 2, 0); } });

// ============================================================
//  僧侶（ククール） — 回復とにおうだちで受け切る
// ============================================================
const P = 'priest';
C({ id:'p_hoimi', name:'ホイミ', cost:1, type:'spell', cls:P, target:T_ALLY_CHAR,
    text:'味方キャラ1体のHPを4回復する',
    play(g, ctx){ g.heal(ctx.target, 4); } });
C({ id:'p_behoimi', name:'ベホイミ', cost:3, type:'spell', cls:P, target:T_ALLY_CHAR,
    text:'味方キャラ1体のHPを6回復し、カードを1枚引く',
    play(g, ctx){ g.heal(ctx.target, 6); g.draw(ctx.pi, 1); } });
C({ id:'p_behoma', name:'ベホマ', cost:5, type:'spell', cls:P, target:T_ALLY_CHAR, rarity:'R',
    text:'味方キャラ1体のHPを全回復する',
    play(g, ctx){ g.heal(ctx.target, 99); } });
C({ id:'p_behomarar', name:'ベホマラー', cost:5, type:'spell', cls:P, rarity:'R',
    text:'味方キャラすべてのHPを4回復する',
    play(g, ctx){ g.allyChars(ctx.pi).forEach(r => g.heal(r, 4)); } });
C({ id:'p_zaki', name:'ザキ', cost:3, type:'spell', cls:P, rarity:'R',
    text:'ランダムな敵ユニット1体を破壊する',
    play(g, ctx){ const t = g.randEnemyUnit(ctx.pi); if (t) g.destroy(t); } });
C({ id:'p_zaraki', name:'ザラキ', cost:5, type:'spell', cls:P, rarity:'SR',
    text:'敵ユニットそれぞれを50%の確率で破壊する',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => { if (g.chance(0.5)) g.destroy(g.ref(u)); }); } });
C({ id:'p_inori', name:'聖なる祈り', cost:2, type:'spell', cls:P,
    text:'味方ユニットすべてに+0/+2を与える',
    play(g, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 0, 2)); } });
C({ id:'p_scult', name:'スクルト', cost:2, type:'spell', cls:P,
    text:'味方の前列のユニットすべてに+0/+3とにおうだちを与える',
    play(g, ctx){ g.rowUnits(ctx.pi, 0).forEach(u => { const r=g.ref(u); g.buff(r,0,3); g.grantKw(r,'におうだち'); }); } });
C({ id:'p_rahiho', name:'ラリホー', cost:2, type:'spell', cls:P, target:T_ENEMY_UNIT,
    text:'敵ユニット1体を2ターンのあいだ行動不能にする',
    play(g, ctx){ g.freeze(ctx.target, 2); } });
C({ id:'p_seisui', name:'せいすい', cost:1, type:'spell', cls:P, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に2ダメージを与え、味方リーダーのHPを2回復する',
    play(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); g.heal(g.leaderRef(ctx.pi), 2); } });

C({ id:'p_seirei', name:'聖霊の加護', cost:4, type:'spell', cls:P, rarity:'R',
    text:'味方ユニットすべてに+1/+2とにおうだちを与える',
    play(g, ctx){ g.allyUnits(ctx.pi).forEach(u => { const r=g.ref(u); g.buff(r,1,2); g.grantKw(r,'におうだち'); }); } });
C({ id:'p_zaoriku', name:'ザオリク', cost:6, type:'spell', cls:P, rarity:'SR',
    text:'味方の墓地からユニットを2体復活させる',
    play(g, ctx){ g.resurrect(ctx.pi, 2); } });
C({ id:'p_sister', name:'シスター', cost:2, type:'unit', cls:P, atk:1, hp:4, kw:['におうだち'], text:'におうだち' });
C({ id:'p_souryo', name:'僧侶', cost:3, type:'unit', cls:P, atk:2, hp:4,
    text:'ターン終了時：味方リーダーのHPを2回復する',
    turnEnd(g, self){ g.heal(g.leaderRef(self.pi), 2); } });
C({ id:'p_maribel', name:'マリベル', cost:4, type:'unit', cls:P, atk:3, hp:4, rarity:'R',
    text:'召喚時：味方キャラすべてのHPを3回復する',
    summon(g, self){ g.allyChars(self.pi).forEach(r => g.heal(r, 3)); } });
C({ id:'p_god_rider', name:'ゴッドライダー', cost:6, type:'unit', cls:P, atk:5, hp:6, kw:['におうだち'],
    rarity:'R', text:'におうだち／召喚時：味方リーダーのHPを5回復する',
    summon(g, self){ g.heal(g.leaderRef(self.pi), 5); } });
C({ id:'p_tenshi', name:'てんしのゆびわ', cost:3, type:'unit', cls:P, atk:2, hp:3,
    text:'味方キャラが回復するたびに+1/+0',
    onAllyHeal(g, self){ g.buff(g.ref(self), 1, 0); } });
C({ id:'p_kukule', name:'ククール', cost:7, type:'unit', cls:P, atk:5, hp:7, rarity:'LEG',
    text:'味方キャラが回復するたびに+1/+1',
    onAllyHeal(g, self){ g.buff(g.ref(self), 1, 1); } });

// ============================================================
//  武闘家（アリーナ） — 武術カードを連打して押し切る
// ============================================================
const A = 'martial';
C({ id:'a_tameru', name:'ためる', cost:1, type:'spell', sub:'武術', cls:A,
    text:'テンションアップ',
    play(g, ctx){ g.tension(ctx.pi, 1); } });
C({ id:'a_tiger_claw', name:'タイガークロー', cost:1, type:'spell', sub:'武術', cls:A, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に2ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); } });
C({ id:'a_seiken', name:'せいけんづき', cost:2, type:'spell', sub:'武術', cls:A, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に3ダメージを与える',
    play(g, ctx){ g.dmg(ctx.target, 3, { spell:true, pi:ctx.pi }); } });
C({ id:'a_kamaitachi', name:'かまいたち', cost:2, type:'spell', sub:'武術', cls:A,
    text:'敵の後列のユニットすべてに3ダメージを与える',
    play(g, ctx){ g.rowUnits(1-ctx.pi, 1).forEach(u => g.dmg(g.ref(u), 3, { spell:true, pi:ctx.pi })); } });
C({ id:'a_mawashigeri', name:'まわし蹴り', cost:3, type:'spell', sub:'武術', cls:A,
    text:'敵の前列のユニットすべてに3ダメージを与える',
    play(g, ctx){ g.rowUnits(1-ctx.pi, 0).forEach(u => g.dmg(g.ref(u), 3, { spell:true, pi:ctx.pi })); } });
C({ id:'a_shinkuha', name:'しんくうは', cost:3, type:'spell', sub:'武術', cls:A, rarity:'R',
    text:'敵ユニットすべてに2ダメージを与える',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 2, { spell:true, pi:ctx.pi })); } });
C({ id:'a_bakuretsu', name:'ばくれつけん', cost:4, type:'spell', sub:'武術', cls:A, rarity:'R',
    text:'ランダムな敵に2ダメージを4回与える',
    play(g, ctx){ for (let i=0;i<4;i++){ const t=g.randEnemyChar(ctx.pi); if(t) g.dmg(t,2,{spell:true,pi:ctx.pi}); } } });
C({ id:'a_issen', name:'一閃突き', cost:5, type:'spell', sub:'武術', cls:A, target:T_ENEMY_UNIT, rarity:'R',
    text:'敵ユニット1体を破壊し、カードを1枚引く',
    play(g, ctx){ g.destroy(ctx.target); g.draw(ctx.pi, 1); } });
C({ id:'a_miracle_moon', name:'ミラクルムーン', cost:4, type:'spell', sub:'武術', cls:A,
    text:'味方ユニットすべてに+2/+0と速攻を与える',
    play(g, ctx){ g.allyUnits(ctx.pi).forEach(u => { const r=g.ref(u); g.buff(r,2,0); g.grantKw(r,'速攻'); }); } });

C({ id:'a_budouka', name:'武闘家', cost:2, type:'unit', cls:A, atk:2, hp:2,
    text:'召喚時：武術カードを1枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.sub === '武術'); } });
C({ id:'a_brey', name:'ブライ', cost:3, type:'unit', cls:A, atk:2, hp:3,
    text:'味方が武術カードを使うたびに、ランダムな敵ユニットに1ダメージ',
    onAllySpell(g, self, card){ if (card.sub === '武術') { const t=g.randEnemyUnit(self.pi); if(t) g.dmg(t,1,{pi:self.pi}); } } });
C({ id:'a_kiryu', name:'きとうし', cost:3, type:'unit', cls:A, atk:2, hp:3, kw:['速攻'], text:'速攻' });
C({ id:'a_cliff', name:'クリフト', cost:4, type:'unit', cls:A, atk:3, hp:3, rarity:'R',
    text:'召喚時：武術カードを2枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.sub === '武術'); g.drawFiltered(self.pi, c => c.sub === '武術'); } });
C({ id:'a_manya', name:'マーニャ', cost:5, type:'unit', cls:A, atk:4, hp:4, rarity:'R',
    text:'味方が武術カードを使うたびに+1/+1',
    onAllySpell(g, self, card){ if (card.sub === '武術') g.buff(g.ref(self), 1, 1); } });
C({ id:'a_kenja', name:'けんじゃ', cost:5, type:'unit', cls:A, atk:4, hp:5, text:'' });
C({ id:'a_alena', name:'アリーナ', cost:6, type:'unit', cls:A, atk:5, hp:5, kw:['速攻'], rarity:'LEG',
    text:'速攻／味方が武術カードを使うたびに+1/+1し、もう一度行動できる',
    onAllySpell(g, self, card){ if (card.sub === '武術') { g.buff(g.ref(self), 1, 1); g.refreshAttack(self); } } });

// ============================================================
//  商人（トルネコ） — 道具でユニットを育てる
// ============================================================
const R = 'merchant';
C({ id:'r_chikara_tane', name:'ちからのたね', cost:1, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+2/+0を与える',
    play(g, ctx){ g.buff(ctx.target, 2, 0); } });
C({ id:'r_mamori_tane', name:'まもりのたね', cost:1, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+0/+3を与える',
    play(g, ctx){ g.buff(ctx.target, 0, 3); } });
C({ id:'r_yakusou', name:'特やくそう', cost:1, type:'spell', sub:'道具', cls:R, target:T_ALLY_CHAR,
    text:'味方キャラ1体のHPを4回復する',
    play(g, ctx){ g.heal(ctx.target, 4); } });
C({ id:'r_inochi_kinomi', name:'いのちのきのみ', cost:2, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+0/+5を与える',
    play(g, ctx){ g.buff(ctx.target, 0, 5); } });
C({ id:'r_fushigi_kinomi', name:'ふしぎなきのみ', cost:2, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+2/+2を与える',
    play(g, ctx){ g.buff(ctx.target, 2, 2); } });
C({ id:'r_scara', name:'スカラの巻物', cost:2, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+0/+2とにおうだちを与える',
    play(g, ctx){ g.buff(ctx.target, 0, 2); g.grantKw(ctx.target, 'におうだち'); } });
C({ id:'r_baikiruto', name:'バイキルトの巻物', cost:3, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT, rarity:'R',
    text:'味方ユニット1体の攻撃力を2倍にする',
    play(g, ctx){ const u = g.unitOf(ctx.target); if (u) g.buff(ctx.target, g.atkOf(u), 0); } });
C({ id:'r_sekaiju', name:'せかいじゅの葉', cost:3, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT, rarity:'R',
    text:'味方ユニット1体のHPを全回復し、+0/+2を与える',
    play(g, ctx){ g.heal(ctx.target, 99); g.buff(ctx.target, 0, 2); } });
C({ id:'r_kimera_tsubasa', name:'キメラのつばさ', cost:1, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT,
    text:'味方ユニット1体を手札に戻す',
    play(g, ctx){ g.bounce(ctx.target); } });
C({ id:'r_hayabusa_tsume', name:'はやぶさのツメ', cost:3, type:'spell', sub:'道具', cls:R, target:T_ALLY_UNIT, rarity:'R',
    text:'味方ユニット1体に２回攻撃を与える',
    play(g, ctx){ g.grantKw(ctx.target, '２回攻撃'); } });

C({ id:'r_ikazuchi', name:'いかずちの杖', cost:4, type:'spell', cls:R, target:T_ENEMY_UNIT, rarity:'R',
    text:'敵ユニット1体に4ダメージを与え、カードを1枚引く',
    play(g, ctx){ g.dmg(ctx.target, 4, { spell:true, pi:ctx.pi }); g.draw(ctx.pi, 1); } });
C({ id:'r_bakudaniwa', name:'ばくだん岩', cost:5, type:'unit', cls:R, atk:3, hp:5, rarity:'R',
    text:'死亡時：敵ユニットすべてに3ダメージを与える',
    death(g, self){ g.enemyUnits(self.pi).forEach(u => g.dmg(g.ref(u), 3, { pi:self.pi })); } });
C({ id:'r_tsuchiwarashi', name:'つちわらし', cost:2, type:'unit', cls:R, atk:1, hp:3, rarity:'R',
    text:'道具カードの効果を受けるたびに、さらに+1/+1',
    onItemTarget(g, self){ g.buff(g.ref(self), 1, 1); } });
C({ id:'r_shonin', name:'商人', cost:2, type:'unit', cls:R, atk:2, hp:2,
    text:'召喚時：道具カードを1枚手札に加える',
    summon(g, self){ g.addRandomFromPool(self.pi, c => c.sub === '道具', 1); } });
C({ id:'r_metal_hunter', name:'メタルハンター', cost:4, type:'unit', cls:R, atk:3, hp:4,
    text:'召喚時：道具カードを1枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.sub === '道具'); } });
C({ id:'r_slime_tsumuri', name:'スライムつむり', cost:3, type:'unit', cls:R, atk:1, hp:5, kw:['におうだち'],
    text:'におうだち' });
C({ id:'r_ojiisan', name:'よろず屋のおやじ', cost:4, type:'unit', cls:R, atk:3, hp:3, rarity:'R',
    text:'ターン終了時：ランダムな味方ユニット1体に+1/+1',
    turnEnd(g, self){ const u = g.randAllyUnit(self.pi); if (u) g.buff(u, 1, 1); } });
C({ id:'r_gold_golem', name:'ゴールデンゴーレム', cost:6, type:'unit', cls:R, atk:5, hp:6,
    text:'召喚時：道具カードを2枚手札に加える',
    summon(g, self){ g.addRandomFromPool(self.pi, c => c.sub === '道具', 2); } });
C({ id:'r_torneko', name:'トルネコ', cost:6, type:'unit', cls:R, atk:4, hp:6, rarity:'LEG',
    text:'ターン開始時：道具カードを1枚手札に加える',
    turnStart(g, self){ g.addRandomFromPool(self.pi, c => c.sub === '道具', 1); } });

// ============================================================
//  魔剣士（ピサロ） — MPを加速し、味方を犠牲に大型を出す
// ============================================================
const D = 'darkknight';
C({ id:'pisaro_knight', name:'ピサロナイト', cost:3, type:'unit', cls:D, atk:3, hp:2, token:true, text:'' });
C({ id:'d_jaen', name:'邪炎の雫', cost:1, type:'spell', cls:D,
    text:'味方リーダーに2ダメージを与え、このターンのMPを2増やす',
    play(g, ctx){ g.dmg(g.leaderRef(ctx.pi), 2, { pi:ctx.pi, noTrigger:true }); g.gainMp(ctx.pi, 2); } });
C({ id:'d_maryoku_uzu', name:'魔力の渦', cost:2, type:'spell', cls:D, rarity:'R',
    text:'MPの上限を1増やし、カードを1枚引く',
    play(g, ctx){ g.gainMaxMp(ctx.pi, 1); g.draw(ctx.pi, 1); } });
C({ id:'d_ikenie', name:'いけにえの儀式', cost:2, type:'spell', cls:D, target:T_ALLY_UNIT,
    text:'味方ユニット1体を破壊し、カードを2枚引く',
    play(g, ctx){ g.destroy(ctx.target); g.draw(ctx.pi, 2); } });
C({ id:'d_maken', name:'魔剣の閃き', cost:3, type:'spell', cls:D, target:T_ENEMY_UNIT,
    text:'敵ユニット1体に5ダメージを与え、味方リーダーに2ダメージ',
    play(g, ctx){ g.dmg(ctx.target, 5, { spell:true, pi:ctx.pi }); g.dmg(g.leaderRef(ctx.pi), 2, { pi:ctx.pi, noTrigger:true }); } });
C({ id:'d_shinoinanaki', name:'しのいななき', cost:6, type:'spell', cls:D, rarity:'SR',
    text:'敵ユニットすべてに5ダメージを与え、味方リーダーに3ダメージ',
    play(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 5, { spell:true, pi:ctx.pi }));
                  g.dmg(g.leaderRef(ctx.pi), 3, { pi:ctx.pi, noTrigger:true }); } });
C({ id:'d_yamiharai', name:'闇の衣', cost:2, type:'spell', cls:D, target:T_ALLY_UNIT,
    text:'味方ユニット1体に+2/+2とステルスを与える',
    play(g, ctx){ g.buff(ctx.target, 2, 2); g.grantKw(ctx.target, 'ステルス'); } });

C({ id:'d_mage_matango', name:'マージマタンゴ', cost:3, type:'unit', cls:D, atk:2, hp:3,
    text:'死亡時：MPの上限を1増やす',
    death(g, self){ g.gainMaxMp(self.pi, 1); } });
C({ id:'d_jigoku_yoroi', name:'じごくのよろい', cost:4, type:'unit', cls:D, atk:3, hp:5, kw:['におうだち'],
    text:'におうだち' });
C({ id:'d_evil_priest', name:'エビルプリースト', cost:5, type:'unit', cls:D, atk:4, hp:4, rarity:'R',
    text:'召喚時：味方ユニット1体を破壊し、MPの上限を2増やす',
    target:T_ALLY_UNIT, targetOptional:true,
    summon(g, self, ctx){ if (ctx.target) { g.destroy(ctx.target); g.gainMaxMp(self.pi, 2); } } });
C({ id:'d_death_stalker', name:'デスストーカー', cost:5, type:'unit', cls:D, atk:4, hp:4, kw:['貫通','ステルス'],
    rarity:'R', text:'貫通／ステルス' });
C({ id:'d_silver_devil', name:'シルバーデビル', cost:4, type:'unit', cls:D, atk:3, hp:3, kw:['速攻'], text:'速攻' });
C({ id:'d_kingleo', name:'キングレオ', cost:7, type:'unit', cls:D, atk:7, hp:6, kw:['貫通'], rarity:'R', text:'貫通' });
C({ id:'d_hell_battler', name:'ヘルバトラー', cost:7, type:'unit', cls:D, atk:6, hp:6,
    text:'召喚時：敵リーダーに3ダメージを与える',
    summon(g, self){ g.dmg(g.leaderRef(1-self.pi), 3, { pi:self.pi }); } });
C({ id:'d_deathpisaro', name:'デスピサロ', cost:9, type:'unit', cls:D, atk:6, hp:6, kw:['貫通'], rarity:'LEG',
    text:'貫通／召喚時：このターンに死亡した味方の数だけ+2/+2。場の味方ユニットの数だけ+1/+1',
    summon(g, self){ const n = g.allyUnits(self.pi).length - 1; g.buff(g.ref(self), n, n); } });

// ============================================================
//  占い師（ミネア） — タロットの「占い」で2つの効果が抽選される
// ============================================================
const F = 'fortune';
const tarot = (def) => { def.cls = F; def.type = 'spell'; def.sub = 'タロット'; return C(def); };

tarot({ id:'f_silver_tarot', name:'銀のタロット', cost:1, sub:'タロット',
    text:'このターン、タロットの占いの効果を自分で選べるようになる（必中モード）',
    play(g, ctx){ g.setHitMode(ctx.pi, true); } });
tarot({ id:'f_fool', name:'愚者のタロット', cost:2, rarity:'N',
    text:'占い①敵ユニット1体に3ダメージ ②味方ユニット1体に+2/+2',
    divine:[
      { text:'敵ユニット1体に3ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 3, { spell:true, pi:ctx.pi }); } },
      { text:'味方ユニット1体に+2/+2を与える', target:T_ALLY_UNIT,
        run(g, ctx){ g.buff(ctx.target, 2, 2); } },
    ]});
tarot({ id:'f_moon', name:'月のタロット', cost:2,
    text:'占い①敵ユニット1体を行動不能にし2ダメージ ②敵ユニットすべての攻撃力-2',
    divine:[
      { text:'敵ユニット1体に2ダメージを与え、行動不能にする', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); g.freeze(ctx.target); } },
      { text:'敵ユニットすべての攻撃力-2', 
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), -2, 0)); } },
    ]});
tarot({ id:'f_star', name:'星のタロット', cost:3,
    text:'占い①カードを2枚引く ②味方キャラすべてのHPを3回復',
    divine:[
      { text:'カードを2枚引く', run(g, ctx){ g.draw(ctx.pi, 2); } },
      { text:'味方キャラすべてのHPを3回復する', run(g, ctx){ g.allyChars(ctx.pi).forEach(r => g.heal(r, 3)); } },
    ]});
tarot({ id:'f_devil', name:'悪魔のタロット', cost:3, rarity:'R',
    text:'占い①敵ユニット1体に5ダメージ ②敵リーダーに3ダメージを与え、味方リーダーを3回復',
    divine:[
      { text:'敵ユニット1体に5ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 5, { spell:true, pi:ctx.pi }); } },
      { text:'敵リーダーに3ダメージを与え、味方リーダーのHPを3回復する',
        run(g, ctx){ g.dmg(g.leaderRef(1-ctx.pi), 3, { spell:true, pi:ctx.pi }); g.heal(g.leaderRef(ctx.pi), 3); } },
    ]});
tarot({ id:'f_lovers', name:'恋人のタロット', cost:3, rarity:'R',
    text:'占い①味方ユニット1体に+3/+3 ②味方ユニット1体のコピーを召喚する',
    divine:[
      { text:'味方ユニット1体に+3/+3を与える', target:T_ALLY_UNIT,
        run(g, ctx){ g.buff(ctx.target, 3, 3); } },
      { text:'味方ユニット1体のコピーを召喚する', target:T_ALLY_UNIT,
        run(g, ctx){ const u = g.unitOf(ctx.target); if (u) g.summon(ctx.pi, u.cardId); } },
    ]});
tarot({ id:'f_death', name:'死神のタロット', cost:4, rarity:'R',
    text:'占い①敵ユニット1体を破壊する ②敵ユニットすべてに3ダメージ',
    divine:[
      { text:'敵ユニット1体を破壊する', target:T_ENEMY_UNIT, run(g, ctx){ g.destroy(ctx.target); } },
      { text:'敵ユニットすべてに3ダメージを与える',
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 3, { spell:true, pi:ctx.pi })); } },
    ]});
tarot({ id:'f_tower', name:'塔のタロット', cost:4,
    text:'占い①敵リーダーに5ダメージ ②敵の前列のユニットすべてを破壊する',
    divine:[
      { text:'敵リーダーに5ダメージを与える', run(g, ctx){ g.dmg(g.leaderRef(1-ctx.pi), 5, { spell:true, pi:ctx.pi }); } },
      { text:'敵の前列のユニットすべてに4ダメージを与える',
        run(g, ctx){ g.rowUnits(1-ctx.pi, 0).forEach(u => g.dmg(g.ref(u), 4, { spell:true, pi:ctx.pi })); } },
    ]});
tarot({ id:'f_sun', name:'太陽のタロット', cost:5, rarity:'SR',
    text:'占い①敵ユニットすべてに4ダメージ ②味方ユニットすべてに+2/+2',
    divine:[
      { text:'敵ユニットすべてに4ダメージを与える',
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 4, { spell:true, pi:ctx.pi })); } },
      { text:'味方ユニットすべてに+2/+2を与える',
        run(g, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 2, 2)); } },
    ]});
tarot({ id:'f_wheel', name:'運命の輪', cost:5, rarity:'R',
    text:'占い①タロットカードを3枚手札に加える ②MPの上限を2増やす',
    divine:[
      { text:'タロットカードを3枚手札に加える', run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === 'タロット' && c.id !== 'f_wheel', 3); } },
      { text:'MPの上限を2増やす', run(g, ctx){ g.gainMaxMp(ctx.pi, 2); } },
    ]});
tarot({ id:'f_judge', name:'審判のタロット', cost:6, rarity:'SR',
    text:'占い①味方の墓地からユニットを2体復活させる ②敵ユニットすべてに5ダメージ',
    divine:[
      { text:'味方の墓地からユニットを2体復活させる', run(g, ctx){ g.resurrect(ctx.pi, 2); } },
      { text:'敵ユニットすべてに5ダメージを与える',
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 5, { spell:true, pi:ctx.pi })); } },
    ]});
tarot({ id:'f_world', name:'世界のタロット', cost:7, rarity:'LEG',
    text:'占い①場のユニットをすべて破壊する ②敵リーダーに8ダメージ',
    divine:[
      { text:'場のユニットをすべて破壊する', run(g, ctx){ g.allUnits().forEach(u => g.destroy(g.ref(u))); } },
      { text:'敵リーダーに8ダメージを与える', run(g, ctx){ g.dmg(g.leaderRef(1-ctx.pi), 8, { spell:true, pi:ctx.pi }); } },
    ]});

C({ id:'f_uranaishi', name:'占い師', cost:3, type:'unit', cls:F, atk:2, hp:4,
    text:'召喚時：タロットカードを1枚引く',
    summon(g, self){ g.drawFiltered(self.pi, c => c.sub === 'タロット'); } });
C({ id:'f_kaeru', name:'カエルマン', cost:2, type:'unit', cls:F, atk:2, hp:2,
    text:'味方がタロットを使うたびに+1/+0',
    onAllySpell(g, self, card){ if (card.sub === 'タロット') g.buff(g.ref(self), 1, 0); } });
C({ id:'f_esther', name:'エステラ', cost:4, type:'unit', cls:F, atk:3, hp:4, rarity:'R',
    text:'召喚時：このターン、タロットの効果を自分で選べるようになる',
    summon(g, self){ g.setHitMode(self.pi, true); } });
C({ id:'f_ohgami', name:'大神官ハーゴン', cost:6, type:'unit', cls:F, atk:5, hp:5, rarity:'R',
    text:'味方がタロットを使うたびに、カードを1枚引く',
    onAllySpell(g, self, card){ if (card.sub === 'タロット') g.draw(self.pi, 1); } });
C({ id:'f_ryu_gakusha', name:'占星術師', cost:5, type:'unit', cls:F, atk:4, hp:5, kw:['におうだち'],
    text:'におうだち／召喚時：タロットカードを1枚手札に加える',
    summon(g, self){ g.addRandomFromPool(self.pi, c => c.sub === 'タロット', 1); } });
C({ id:'f_minea', name:'ミネア', cost:6, type:'unit', cls:F, atk:5, hp:5, rarity:'LEG',
    text:'味方がタロットを使うたびに+1/+1し、カードを1枚引く',
    onAllySpell(g, self, card){ if (card.sub === 'タロット') { g.buff(g.ref(self), 1, 1); g.draw(self.pi, 1); } } });

// ============================================================
//  英雄（ヒーローカード）
//  プレイすると「共闘」状態になり、1ターンに1度ヒーロースキルが使える。
//  使うほどスキルがレベルアップして強くなる。
//  skills[i].upTo = そのレベルで何回使えば次に上がるか
// ============================================================
const HERO_TEXT = '共闘：1ターンに1度ヒーロースキルを使える。使うほど強くなる';

C({ id:'h_loto', name:'ロトの血を引く者', cost:1, type:'hero', cls:'neutral', rarity:'LEG',
    opening:true, text:HERO_TEXT + '／デッキに入れていると必ず初手に来る',
    skills:[
      { name:'たたかう', cost:1, upTo:1, text:'敵1体に1ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 1, { pi:ctx.pi }); } },
      { name:'王女救出', cost:2, upTo:3, text:'敵1体に2ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 2, { pi:ctx.pi }); } },
      { name:'竜王一閃', cost:3, text:'敵1体に4ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 4, { pi:ctx.pi }); } },
    ]});

C({ id:'h_anlucia', name:'アンルシア', cost:5, type:'hero', cls:'neutral', rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'勇者の光', cost:1, upTo:2, text:'味方ユニット1体に+1/+1を与える', target:T_ALLY_UNIT,
        run(g, ctx){ g.buff(ctx.target, 1, 1); } },
      { name:'聖なる祈り', cost:2, upTo:3, text:'味方ユニット1体に+2/+2を与える', target:T_ALLY_UNIT,
        run(g, ctx){ g.buff(ctx.target, 2, 2); } },
      { name:'light（光の波動）', cost:3, text:'味方ユニットすべてに+2/+2を与える',
        run(g, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 2, 2)); } },
    ]});

C({ id:'h_laurasia', name:'ローレシアの王子', cost:3, type:'hero', cls:W, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'ちからをためる', cost:1, upTo:2, text:'このターン、味方リーダーは攻撃力+2を得る',
        run(g, ctx){ g.leaderAtkBuff(ctx.pi, 2); } },
      { name:'せいけんづき', cost:2, upTo:3, text:'敵ユニット1体に3ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 3, { pi:ctx.pi }); } },
      { name:'ギガブレイク', cost:3, text:'敵ユニット1体に6ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 6, { pi:ctx.pi }); } },
    ]});

C({ id:'h_samaltria', name:'サマルトリアの王子', cost:3, type:'hero', cls:P, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'ホイミ', cost:1, upTo:2, text:'味方キャラ1体のHPを3回復する', target:T_ALLY_CHAR,
        run(g, ctx){ g.heal(ctx.target, 3); } },
      { name:'ベホイミ', cost:2, upTo:3, text:'味方キャラ1体のHPを6回復する', target:T_ALLY_CHAR,
        run(g, ctx){ g.heal(ctx.target, 6); } },
      { name:'ベホマ', cost:3, text:'味方キャラ1体のHPを全回復し、カードを1枚引く', target:T_ALLY_CHAR,
        run(g, ctx){ g.heal(ctx.target, 99); g.draw(ctx.pi, 1); } },
    ]});

C({ id:'h_moonbrooke', name:'ムーンブルクの王女', cost:3, type:'hero', cls:M, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'メラ', cost:1, upTo:2, text:'敵1体に2ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); } },
      { name:'メラミ', cost:2, upTo:3, text:'敵1体に3ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 3, { spell:true, pi:ctx.pi }); } },
      { name:'メラゾーマ', cost:3, text:'敵1体に5ダメージを与える', target:T_ENEMY_CHAR,
        run(g, ctx){ g.dmg(ctx.target, 5, { spell:true, pi:ctx.pi }); } },
    ]});

C({ id:'h_rex', name:'レックス', cost:3, type:'hero', cls:A, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'タイガークロー', cost:1, upTo:2, text:'敵ユニット1体に2ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 2, { pi:ctx.pi }); } },
      { name:'ばくれつけん', cost:2, upTo:3, text:'ランダムな敵ユニットに2ダメージを2回与える',
        run(g, ctx){ for (let i=0;i<2;i++){ const t=g.randEnemyUnit(ctx.pi); if(t) g.dmg(t,2,{pi:ctx.pi}); } } },
      { name:'しんくうげり', cost:3, text:'敵ユニットすべてに3ダメージを与える',
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 3, { pi:ctx.pi })); } },
    ]});

C({ id:'h_yangus', name:'ヤンガス', cost:3, type:'hero', cls:R, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'どうぐ探し', cost:1, upTo:2, text:'道具カードを1枚手札に加える',
        run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === '道具', 1); } },
      { name:'大あばれ', cost:2, upTo:3, text:'敵ユニット1体に3ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 3, { pi:ctx.pi }); } },
      { name:'一発ギャグ', cost:3, text:'道具カードを2枚加え、味方ユニットすべてに+1/+1を与える',
        run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === '道具', 2);
                     g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 1, 1)); } },
    ]});

C({ id:'h_rosalie', name:'ロザリー', cost:3, type:'hero', cls:D, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'いのり', cost:1, upTo:2, text:'このターンのMPを1増やす',
        run(g, ctx){ g.gainMp(ctx.pi, 1); } },
      { name:'魔族の加護', cost:2, upTo:3, text:'味方ユニット1体に+2/+2を与える', target:T_ALLY_UNIT,
        run(g, ctx){ g.buff(ctx.target, 2, 2); } },
      { name:'進化の秘法', cost:3, text:'味方ユニットすべてに+2/+2と貫通を与える',
        run(g, ctx){ g.allyUnits(ctx.pi).forEach(u => { const r=g.ref(u); g.buff(r,2,2); g.grantKw(r,'貫通'); }); } },
    ]});

C({ id:'h_manya', name:'マーニャ', cost:3, type:'hero', cls:F, rarity:'LEG', text:HERO_TEXT,
    skills:[
      { name:'火炎の舞', cost:1, upTo:2, text:'敵ユニット1体に2ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 2, { spell:true, pi:ctx.pi }); } },
      { name:'タロット占い', cost:2, upTo:3, text:'タロットカードを1枚手札に加える',
        run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === 'タロット', 1); } },
      { name:'マジックバーン', cost:3, text:'敵リーダーに4ダメージを与える',
        run(g, ctx){ g.dmg(g.leaderRef(1-ctx.pi), 4, { spell:true, pi:ctx.pi }); } },
    ]});

// ============================================================
//  ダンジョン
//  マスを占有し、条件を満たすたび耐久値がたまる。
//  踏破するとその場所で効果が起き、ダンジョンは消える。
//  ユニットではないので攻撃も反撃もせず、ブロック・ウォールにも数えない。
// ============================================================
C({ id:'box_shiawase', name:'しあわせの箱', cost:5, type:'unit', atk:4, hp:4, token:true,
    text:'死亡時：カードを2枚引く', death(g, self){ g.draw(self.pi, 2); } });

C({ id:'dg_fushigi', name:'不思議のダンジョン', cost:3, type:'dungeon', cls:'neutral', goal:5, rarity:'R',
    text:'ダンジョン（耐久値5）：味方ユニットが場に出るたび耐久値+1。踏破：その場所にしあわせの箱（4/4）を出す',
    onAllySummon(g, self){ g.dungeonProgress(self, 1); },
    clear(g, spot){ g.summon(spot.pi, 'box_shiawase', { lane:spot.lane, col:spot.col }); } });

C({ id:'dg_ouke', name:'王家の墓', cost:3, type:'dungeon', cls:W, goal:3, rarity:'R',
    text:'ダンジョン（耐久値3）：味方ユニットが倒れるたび耐久値+1。踏破：4/2のあらくれを2体召喚し、味方ユニットすべてに+1/+0',
    onAllyDeath(g, self){ g.dungeonProgress(self, 1); },
    clear(g, spot){ g.summon(spot.pi, 'arakure', { lane:spot.lane, col:spot.col }); g.summon(spot.pi, 'arakure');
                    g.allyUnits(spot.pi).forEach(u => g.buff(g.ref(u), 1, 0)); } });

C({ id:'dg_meikyu', name:'魔法の迷宮', cost:3, type:'dungeon', cls:M, goal:4, rarity:'R',
    text:'ダンジョン（耐久値4）：味方が特技を使うたび耐久値+1。踏破：敵ユニットすべてに4ダメージ',
    onAllySpell(g, self){ g.dungeonProgress(self, 1); },
    clear(g, spot){ g.enemyUnits(spot.pi).forEach(u => g.dmg(g.ref(u), 4, { spell:true, pi:spot.pi })); } });

C({ id:'dg_tenku', name:'天空の城', cost:4, type:'dungeon', cls:P, goal:4, rarity:'SR',
    text:'ダンジョン（耐久値4）：味方キャラが回復するたび耐久値+1。踏破：味方キャラすべてを全回復し、味方ユニットすべてに+0/+3',
    onAllyHeal(g, self){ g.dungeonProgress(self, 1); },
    clear(g, spot){ g.allyChars(spot.pi).forEach(r => g.heal(r, 99));
                    g.allyUnits(spot.pi).forEach(u => g.buff(g.ref(u), 0, 3)); } });

C({ id:'dg_shugyo', name:'修行の間', cost:3, type:'dungeon', cls:A, goal:4, rarity:'R',
    text:'ダンジョン（耐久値4）：味方が武術カードを使うたび耐久値+1。踏破：味方ユニットすべてに+2/+2と速攻',
    onAllySpell(g, self, card){ if (card.sub === '武術') g.dungeonProgress(self, 1); },
    clear(g, spot){ g.allyUnits(spot.pi).forEach(u => { const r=g.ref(u); g.buff(r,2,2); g.grantKw(r,'速攻'); }); } });

C({ id:'dg_suiro', name:'地下水路', cost:2, type:'dungeon', cls:R, goal:4, rarity:'R',
    text:'ダンジョン（耐久値4）：味方が道具カードを使うたび耐久値+1。踏破：道具カードを3枚手札に加え、味方ユニットすべてに+1/+1',
    onAllySpell(g, self, card){ if (card.sub === '道具') g.dungeonProgress(self, 1); },
    clear(g, spot){ g.addRandomFromPool(spot.pi, c => c.sub === '道具', 3);
                    g.allyUnits(spot.pi).forEach(u => g.buff(g.ref(u), 1, 1)); } });

C({ id:'dg_ryuuou', name:'竜王の城', cost:5, type:'dungeon', cls:D, goal:4, rarity:'SR',
    text:'ダンジョン（耐久値4）：自分のターン終了時に耐久値+1。踏破：その場所に竜王（8/8・貫通）を出す',
    turnEnd(g, self){ g.dungeonProgress(self, 1); },
    clear(g, spot){ g.summon(spot.pi, 'ryuuou_true', { lane:spot.lane, col:spot.col }); } });

C({ id:'dg_honoo', name:'炎のほこら', cost:3, type:'dungeon', cls:F, goal:4, rarity:'R',
    text:'ダンジョン（耐久値4）：味方がタロットを使うたび耐久値+1。踏破：タロットを3枚手札に加え、必中モードになる',
    onAllySpell(g, self, card){ if (card.sub === 'タロット') g.dungeonProgress(self, 1); },
    clear(g, spot){ g.addRandomFromPool(spot.pi, c => c.sub === 'タロット', 3); g.setHitMode(spot.pi, true); } });

// ============================================================
//  選択カード（占いと違い、必ず自分で選ぶ）
// ============================================================
C({ id:'n_sakusen', name:'さくせん', cost:2, type:'spell', cls:'neutral',
    text:'選択：①味方ユニット1体に+2/+2 ②敵ユニット1体に3ダメージ',
    choose:[
      { text:'味方ユニット1体に+2/+2を与える', target:T_ALLY_UNIT, run(g, ctx){ g.buff(ctx.target, 2, 2); } },
      { text:'敵ユニット1体に3ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 3, { spell:true, pi:ctx.pi }); } },
    ]});
C({ id:'n_ruura', name:'ルーラ', cost:2, type:'spell', cls:'neutral',
    text:'選択：①味方ユニット1体を手札に戻す ②カードを1枚引き、このターンのMPを1増やす',
    choose:[
      { text:'味方ユニット1体を手札に戻す', target:T_ALLY_UNIT, run(g, ctx){ g.bounce(ctx.target); } },
      { text:'カードを1枚引き、このターンのMPを1増やす', run(g, ctx){ g.draw(ctx.pi, 1); g.gainMp(ctx.pi, 1); } },
    ]});
C({ id:'w_yuusha_sentaku', name:'勇者の決断', cost:4, type:'spell', cls:W, rarity:'R',
    text:'選択：①敵ユニット1体を破壊する ②味方ユニットすべてに+2/+1',
    choose:[
      { text:'敵ユニット1体を破壊する', target:T_ENEMY_UNIT, run(g, ctx){ g.destroy(ctx.target); } },
      { text:'味方ユニットすべてに+2/+1を与える',
        run(g, ctx){ g.allyUnits(ctx.pi).forEach(u => g.buff(g.ref(u), 2, 1)); } },
    ]});
C({ id:'p_seirei_michibiki', name:'精霊の導き', cost:3, type:'spell', cls:P, rarity:'R',
    text:'選択：①味方キャラ1体を8回復 ②味方ユニットすべてに+0/+2とにおうだち',
    choose:[
      { text:'味方キャラ1体のHPを8回復する', target:T_ALLY_CHAR, run(g, ctx){ g.heal(ctx.target, 8); } },
      { text:'味方ユニットすべてに+0/+2とにおうだちを与える',
        run(g, ctx){ g.allyUnits(ctx.pi).forEach(u => { const r=g.ref(u); g.buff(r,0,2); g.grantKw(r,'におうだち'); }); } },
    ]});
C({ id:'m_maryoku_sentaku', name:'魔力の選択', cost:3, type:'spell', cls:M, rarity:'R',
    text:'選択：①敵ユニット1体に5ダメージ ②敵ユニットすべてに2ダメージ',
    choose:[
      { text:'敵ユニット1体に5ダメージを与える', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 5, { spell:true, pi:ctx.pi }); } },
      { text:'敵ユニットすべてに2ダメージを与える',
        run(g, ctx){ g.enemyUnits(ctx.pi).forEach(u => g.dmg(g.ref(u), 2, { spell:true, pi:ctx.pi })); } },
    ]});
C({ id:'r_shoukon', name:'商魂', cost:3, type:'spell', cls:R,
    text:'選択：①道具カードを2枚手札に加える ②カードを2枚引く',
    choose:[
      { text:'道具カードを2枚手札に加える', run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === '道具', 2); } },
      { text:'カードを2枚引く', run(g, ctx){ g.draw(ctx.pi, 2); } },
    ]});
C({ id:'d_ankoku_keiyaku', name:'暗黒の契約', cost:3, type:'spell', cls:D, rarity:'R',
    text:'選択：①MPの上限を2増やす ②敵ユニット1体に5ダメージを与え、味方リーダーに2ダメージ',
    choose:[
      { text:'MPの上限を2増やす', run(g, ctx){ g.gainMaxMp(ctx.pi, 2); } },
      { text:'敵ユニット1体に5ダメージを与え、味方リーダーに2ダメージ', target:T_ENEMY_UNIT,
        run(g, ctx){ g.dmg(ctx.target, 5, { spell:true, pi:ctx.pi });
                     g.dmg(g.leaderRef(ctx.pi), 2, { pi:ctx.pi, noTrigger:true }); } },
    ]});
C({ id:'f_hoshiyomi', name:'星読み', cost:2, type:'spell', cls:F,
    text:'選択：①タロットカードを1枚加える ②必中モードになり、カードを1枚引く',
    choose:[
      { text:'タロットカードを1枚手札に加える', run(g, ctx){ g.addRandomFromPool(ctx.pi, c => c.sub === 'タロット', 1); } },
      { text:'必中モードになり、カードを1枚引く', run(g, ctx){ g.setHitMode(ctx.pi, true); g.draw(ctx.pi, 1); } },
    ]});
C({ id:'a_kiaidame', name:'気合ため', cost:2, type:'spell', sub:'武術', cls:A,
    text:'選択：①テンションを2段階上げる ②武術カードを2枚引く',
    choose:[
      { text:'テンションを2段階上げる', run(g, ctx){ g.tension(ctx.pi, 2); } },
      { text:'武術カードを2枚引く',
        run(g, ctx){ g.drawFiltered(ctx.pi, c => c.sub === '武術'); g.drawFiltered(ctx.pi, c => c.sub === '武術'); } },
    ]});

// ============================================================
//  テンションリンク（テンションスキルを使うと発動する）／アンチステルス
// ============================================================
C({ id:'n_mamono_tsukai', name:'まもの使い', cost:3, type:'unit', atk:2, hp:4, kw:['テンションリンク'],
    text:'テンションリンク：ランダムな敵ユニット1体に2ダメージを与える',
    onTensionSkill(g, self){ const t = g.randEnemyUnit(self.pi); if (t) g.dmg(t, 2, { pi:self.pi }); } });
C({ id:'n_dragon_rider', name:'ドラゴンライダー', cost:5, type:'unit', atk:4, hp:4, kw:['テンションリンク'],
    rarity:'R', text:'テンションリンク：+2/+2を得る',
    onTensionSkill(g, self){ g.buff(g.ref(self), 2, 2); } });
C({ id:'n_mihari_dracky', name:'みはりドラキー', cost:2, type:'unit', atk:1, hp:3, kw:['アンチステルス'],
    text:'アンチステルス' });
C({ id:'w_battle_master', name:'バトルマスター', cost:5, type:'unit', cls:W, atk:4, hp:5, kw:['テンションリンク'],
    rarity:'R', text:'テンションリンク：このターン、味方リーダーは攻撃力+2を得る',
    onTensionSkill(g, self){ g.leaderAtkBuff(self.pi, 2); } });
C({ id:'p_hagoromo', name:'天使のはごろも', cost:4, type:'unit', cls:P, atk:3, hp:4, kw:['テンションリンク'],
    text:'テンションリンク：味方キャラすべてのHPを2回復する',
    onTensionSkill(g, self){ g.allyChars(self.pi).forEach(r => g.heal(r, 2)); } });
C({ id:'m_kenja', name:'大賢者', cost:4, type:'unit', cls:M, atk:3, hp:4, kw:['テンションリンク'],
    rarity:'R', text:'テンションリンク：ランダムな敵ユニット1体に3ダメージを与える',
    onTensionSkill(g, self){ const t = g.randEnemyUnit(self.pi); if (t) g.dmg(t, 3, { spell:true, pi:self.pi }); } });

// ============================================================
//  特殊カード
// ============================================================
C({ id:'sp_seisui', name:'まほうのせいすい', cost:0, type:'spell', cls:'neutral', token:true,
    text:'このターンのMPを1増やす（後攻プレイヤーの初期手札に加わる）',
    play(g, ctx){ g.gainMp(ctx.pi, 1); } });

export const ALL_CARD_IDS = Object.keys(CARDS);
export const COLLECTIBLE = ALL_CARD_IDS.filter(id => !CARDS[id].token);

export function maxCopies(card) { return card.rarity === 'LEG' ? 1 : 3; }
