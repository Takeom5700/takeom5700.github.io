// ============================================================
//  プリセットデッキ
//  1デッキ30枚 / 同名カードは3枚まで（レジェンドは1枚まで）
// ============================================================
import { CARDS, maxCopies } from './cards.js';

const D = (...pairs) => {
  const out = [];
  for (const [id, n] of pairs) for (let i = 0; i < n; i++) out.push(id);
  return out;
};

export const PRESET_DECKS = [
  // ---------------- 戦士 ----------------
  { id:'w_aggro', cls:'warrior', type:'aggro', name:'速攻戦士',
    desc:'軽い武器と小型ユニットで序盤から押し込む。',
    cards: D(['w_dou_no_tsurugi',3],['w_chikaratame',2],['baby_panther',3],['dracky',1],
             ['w_heishi',3],['sasoribachi',2],['killer_panther',3],['arakure',3],['w_kusanagi',2],
             ['w_hatajirushi',2],['w_hayabusa',2],['w_yuukan',1],['w_arakure_yobi',2],['w_terry',1]) },
  { id:'w_mid', cls:'warrior', type:'midrange', name:'武器戦士',
    desc:'武器を繋いで盤面を取り、テンションスキルで一気に詰める。',
    cards: D(['w_dou_no_tsurugi',2],['w_heishi',3],['w_kajiya',3],['w_kusanagi',2],['w_hagane',2],
             ['w_konshin',3],['w_majin',2],['w_bianca',2],['samayou_yoroi',2],['w_goldman',2],
             ['w_dragon_killer',2],['ryuukihei',2],['golem',1],['w_gringham',1],['w_terry',1]) },

  // ---------------- 魔法使い ----------------
  { id:'m_burn', cls:'mage', type:'tempo', name:'バーン魔法使い',
    desc:'特技で盤面を空けながら、顔まで焼き切る。',
    cards: D(['m_mera',3],['m_gira',3],['m_merami',3],['m_hyado',2],['m_io',2],
             ['m_babysatan',3],['m_mahoutsukai',3],['m_hell_ghost',2],['m_silver_devil',2],
             ['dracky',2],['killer_panther',2],['m_merazoma',2],['m_jessica',1]) },
  { id:'m_control', cls:'mage', type:'control', name:'コントロール魔法使い',
    desc:'全体除去で盤面を流し、大型で押し切る。',
    cards: D(['m_mera',2],['m_hyado',2],['m_io',3],['m_rukani',2],['m_begirama',2],
             ['m_iora',2],['m_mahyado',2],['m_babysatan',2],['oonamekuji',2],['gargoyle',2],
             ['devil_armor',2],['m_balzack',2],['m_merazoma',2],['m_ionazun',1],['zoma',1],['m_madante',1]) },

  // ---------------- 僧侶 ----------------
  { id:'p_control', cls:'priest', type:'control', name:'回復僧侶',
    desc:'におうだちと回復で受け切り、ザオリクの蘇生で押し返す。',
    cards: D(['p_seisui',2],['p_sister',3],['p_hoimi',2],['oonamekuji',2],['p_souryo',3],
             ['p_zaki',2],['p_behoimi',2],['gargoyle',2],['p_seirei',2],['p_maribel',2],
             ['akuma_no_kishi',2],['p_zaoriku',2],['p_god_rider',2],['bostroll',1],['p_kukule',1]) },
  { id:'p_mid', cls:'priest', type:'midrange', name:'におうだち僧侶',
    desc:'固い壁で受けながら、貫通の大型で押し返す。',
    cards: D(['p_sister',3],['p_seisui',2],['oonamekuji',2],['obake_kinoko',2],['p_souryo',2],
             ['p_rahiho',2],['p_zaki',2],['samayou_yoroi',3],['p_seirei',2],['p_maribel',2],
             ['keith_dragon',2],['akuma_no_kishi',2],['killer_machine',2],['p_god_rider',1],['p_kukule',1]) },

  // ---------------- 武闘家 ----------------
  { id:'a_aggro', cls:'martial', type:'aggro', name:'速攻武闘家',
    desc:'武術カードで盤面を空け、速攻ユニットで殴り続ける。',
    cards: D(['a_tiger_claw',3],['a_tameru',2],['a_seiken',3],['a_budouka',3],['baby_panther',3],
             ['a_kiryu',3],['killer_panther',3],['a_kamaitachi',2],['a_shinkuha',2],['a_brey',2],
             ['a_bakuretsu',2],['a_miracle_moon',1],['a_alena',1]) },
  { id:'a_combo', cls:'martial', type:'combo', name:'連撃武闘家',
    desc:'武術カードを貯め、マーニャとアリーナで一気に決める。',
    cards: D(['a_tiger_claw',3],['a_tameru',3],['a_seiken',3],['a_budouka',2],['a_cliff',3],
             ['a_brey',2],['a_manya',3],['a_kamaitachi',2],['a_mawashigeri',2],['a_shinkuha',2],
             ['a_kenja',2],['a_issen',2],['a_alena',1]) },

  // ---------------- 商人 ----------------
  { id:'r_buff', cls:'merchant', type:'midrange', name:'道具商人',
    desc:'つちわらしを道具で育て、1体で盤面を制圧する。',
    cards: D(['r_chikara_tane',3],['r_mamori_tane',3],['r_tsuchiwarashi',3],['r_shonin',3],['r_scara',2],
             ['r_fushigi_kinomi',2],['r_inochi_kinomi',2],['r_metal_hunter',2],['r_hayabusa_tsume',2],
             ['r_ikazuchi',2],['r_baikiruto',2],['r_slime_tsumuri',2],['r_ojiisan',1],['r_torneko',1]) },
  { id:'r_value', cls:'merchant', type:'midrange', name:'よくばり商人',
    desc:'手堅く盤面を作り、道具でひと押しする。',
    cards: D(['r_shonin',3],['r_chikara_tane',2],['ookiduchi',2],['r_slime_tsumuri',2],['chimera',2],
             ['r_metal_hunter',2],['r_ikazuchi',3],['samayou_yoroi',3],['r_fushigi_kinomi',2],
             ['r_bakudaniwa',3],['r_hayabusa_tsume',2],['killer_machine',2],['r_gold_golem',1],['r_torneko',1]) },

  // ---------------- 魔剣士 ----------------
  { id:'d_ramp', cls:'darkknight', type:'combo', name:'ランプ魔剣士',
    desc:'自分のHPを削ってMPを伸ばし、大型を早出しする。',
    cards: D(['d_jaen',3],['d_maryoku_uzu',3],['d_mage_matango',3],['d_ikenie',2],['d_maken',2],
             ['d_jigoku_yoroi',2],['d_evil_priest',2],['d_silver_devil',2],['d_kingleo',2],
             ['d_hell_battler',2],['gigantes',2],['atlas',2],['d_deathpisaro',1],['zoma',1],['sidoh',1]) },
  { id:'d_aggro', cls:'darkknight', type:'tempo', name:'テンポ魔剣士',
    desc:'速攻と貫通で盤面を無視して押し切る。',
    cards: D(['d_jaen',2],['d_silver_devil',3],['baby_panther',2],['d_maken',3],['d_yamiharai',2],
             ['d_death_stalker',3],['d_mage_matango',3],['killer_panther',3],['d_kingleo',2],
             ['keith_dragon',2],['d_hell_battler',2],['d_shinoinanaki',2],['d_deathpisaro',1]) },

  // ---------------- 占い師 ----------------
  { id:'f_tarot', cls:'fortune', type:'control', name:'タロット占い師',
    desc:'占いで盤面を掃除し、必中モードで確実に決める。',
    cards: D(['f_silver_tarot',3],['f_fool',3],['f_moon',2],['f_star',2],['f_devil',2],
             ['f_uranaishi',3],['f_kaeru',2],['f_esther',2],['f_death',2],['f_tower',2],
             ['f_sun',2],['f_judge',1],['f_ohgami',2],['f_world',1],['f_minea',1]) },
  { id:'f_tempo', cls:'fortune', type:'tempo', name:'テンポ占い師',
    desc:'軽いタロットを回してユニットを育てる。',
    cards: D(['f_silver_tarot',2],['f_fool',3],['f_moon',3],['f_kaeru',3],['f_uranaishi',3],
             ['f_star',2],['f_devil',2],['f_ryu_gakusha',2],['f_esther',2],['killer_panther',2],
             ['f_tower',2],['f_wheel',2],['f_ohgami',1],['f_minea',1]) },
];

// デッキの正当性チェック（30枚・枚数上限・職業）
export function validateDeck(cls, cards) {
  const errs = [];
  if (cards.length !== 30) errs.push(`30枚にしてください（現在 ${cards.length}枚）`);
  const count = {};
  for (const id of cards) {
    const c = CARDS[id];
    if (!c) { errs.push(`不明なカード: ${id}`); continue; }
    if (c.token) errs.push(`${c.name} はデッキに入れられません`);
    if (c.cls !== 'neutral' && c.cls !== cls) errs.push(`${c.name} は${cls}のデッキに入れられません`);
    count[id] = (count[id] || 0) + 1;
  }
  for (const id in count) {
    const c = CARDS[id];
    if (c && count[id] > maxCopies(c)) errs.push(`${c.name} は${maxCopies(c)}枚までです`);
  }
  return errs;
}

export function decksForClass(cls) { return PRESET_DECKS.filter(d => d.cls === cls); }
