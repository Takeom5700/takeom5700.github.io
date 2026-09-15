// カードの見た目まわりの共通部品（バトル・図鑑・デッキ編集で共用）
import { CARDS, CLASSES, KEYWORD_TEXT, maxCopies } from './cards.js';
import { artSvg } from './art.js';

export const TYPE_LABEL = { unit: 'ユニット', spell: '特技', weapon: '武器', hero: '英雄', dungeon: 'ダンジョン' };

export function classColor(cls) { return (CLASSES[cls] || CLASSES.neutral).color; }

// カードの地の色（職業色を夜に沈めたもの）
export function cardTint(cls) {
  const hex = classColor(cls);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const mix = (v) => Math.round(v * 0.42 + 26);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// 絵がないので、名前の頭文字を紋として使う
export function monogram(card) {
  const n = card.name;
  const skip = 'のとがをにへでだ・';
  for (const ch of n) if (!skip.includes(ch)) return ch;
  return n[0] || '？';
}

export function kwBadges(kws) {
  const map = { 'におうだち': 'taunt', 'ステルス': 'stealth', '貫通': 'pierce', '速攻': 'rush',
                'メタルボディ': 'metal', '２回攻撃': 'rush', 'テンションリンク': 'link', 'アンチステルス': 'link' };
  const short = { 'におうだち': '壁', 'ステルス': '隠', '貫通': '貫', '速攻': '速', 'メタルボディ': '鉄',
                  '２回攻撃': '２', 'テンションリンク': 'テ', 'アンチステルス': '見' };
  return kws.filter(k => map[k]).map(k => `<span class="kwb ${map[k]}" title="${k}">${short[k]}</span>`).join('');
}

// 攻撃力・HPなどの宝石
export function gem(kind, value, cls = '') {
  return `<span class="gem gem-${kind} ${cls}">${value}</span>`;
}

export function subLabel(card) {
  const t = TYPE_LABEL[card.type] || '';
  return card.sub ? `${card.sub}・${t}` : t;
}

// 図鑑・デッキ編集で使う大きめのカード
export function poolCardHtml(card, count) {
  let stats = '';
  if (card.type === 'unit') stats = gem('atk', card.atk) + gem('hp', card.hp);
  else if (card.type === 'weapon') stats = gem('atk', card.wAtk) + gem('hp', card.wDur);
  else if (card.type === 'dungeon') stats = `<span></span>` + gem('atk', card.goal);
  const kw = card.kw.length ? `<div class="p-sub">${card.kw.join('／')}</div>` : '';
  return `<div class="pcard" style="--uc:${cardTint(card.cls)}" data-id="${card.id}">
    <div class="gem gem-mp p-cost">${card.cost}</div>
    <div class="p-rar ${card.rarity}">${card.rarity}</div>
    <div class="p-art">${artSvg(card)}</div>
    <div class="p-plate">${card.name}</div>
    <div class="p-sub">${(CLASSES[card.cls] || {}).name || ''}・${subLabel(card)}</div>
    ${kw}
    <div class="p-text">${card.text || '—'}</div>
    ${stats ? `<div class="p-stats">${stats}</div>` : ''}
    ${count ? `<div class="p-have">×${count}</div>` : ''}
  </div>`;
}

// 吹き出し（カードの詳細）
const tipEl = () => document.getElementById('tip');
export function heroSkillLines(card, level = -1) {
  if (!card.skills) return '';
  return card.skills.map((sk, i) => {
    const on = i === level;
    return `<div class="${on ? 't-sk on' : 't-sk'}">Lv${i + 1} <b>${sk.name}</b>（${sk.cost}MP）${sk.text}` +
      (sk.upTo ? `<span class="t-up">／${sk.upTo}回使うと次へ</span>` : '') + '</div>';
  }).join('');
}

export function showTip(card, x, y, extra = '') {
  const el = tipEl(); if (!el) return;
  const kwLines = card.kw.filter(k => KEYWORD_TEXT[k])
    .map(k => `<div class="t-kw">${k}：${KEYWORD_TEXT[k]}</div>`).join('')
    + heroSkillLines(card);
  el.innerHTML = `<b>${card.name}</b>
    <div>${card.cost}コスト・${(CLASSES[card.cls] || {}).name || ''}・${subLabel(card)}${card.rarity === 'LEG' ? '・レジェンド（1枚まで）' : ''}</div>
    ${card.text ? `<div style="margin-top:4px">${card.text}</div>` : ''}
    ${kwLines}${extra}`;
  el.hidden = false;
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
  const top = y - r.height - 14 < 8 ? y + 20 : y - r.height - 14;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
export function hideTip() { const el = tipEl(); if (el) el.hidden = true; }

export { maxCopies };
