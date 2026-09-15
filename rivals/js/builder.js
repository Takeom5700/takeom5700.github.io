// ============================================================
//  デッキ編集とカード図鑑
// ============================================================
import { CARDS, COLLECTIBLE, CLASSES, PLAYABLE_CLASSES, maxCopies } from './cards.js';
import { PRESET_DECKS, validateDeck, decksForClass } from './decks.js';
import { poolCardHtml, showTip, hideTip, cardTint, gem } from './view.js';
import { load, update } from './storage.js';
import { SFX } from './audio.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
//  デッキ編集
// ------------------------------------------------------------
let cur = null;   // {id, cls, name, cards:[]}
let filter = { text: '', cost: null, type: null };

export function initBuilder() {
  const clsSel = $('b-class');
  clsSel.innerHTML = PLAYABLE_CLASSES.map(c => `<option value="${c}">${CLASSES[c].name}（${CLASSES[c].leader}）</option>`).join('');
  clsSel.onchange = () => { loadDeckList(clsSel.value); pickDeck(deckOptions(clsSel.value)[0]); };

  $('b-deck').onchange = () => {
    const opts = deckOptions($('b-class').value);
    pickDeck(opts.find(o => o.key === $('b-deck').value) || opts[0]);
  };
  $('b-name').oninput = () => { if (cur) cur.name = $('b-name').value; };
  $('b-new').onclick = () => { cur = { id: 'u' + Date.now(), cls: $('b-class').value, name: '新しいデッキ', cards: [] }; renderDeck(); msg(''); };
  $('b-copy').onclick = () => { if (!cur) return; cur = { id: 'u' + Date.now(), cls: cur.cls, name: cur.name + 'のコピー', cards: [...cur.cards] }; renderDeck(); msg('複製しました。保存を押すと残ります', 'ok'); };
  $('b-clear').onclick = () => { if (cur) { cur.cards = []; renderDeck(); } };
  $('b-save').onclick = saveDeck;
  $('b-delete').onclick = deleteDeck;

  $('b-search').oninput = (e) => { filter.text = e.target.value.trim(); renderPool(); };
  $('b-cost-chips').innerHTML = ['すべて', '0-1', '2', '3', '4', '5', '6', '7+'].map((t, i) =>
    `<button class="chip ${i === 0 ? 'is-on' : ''}" data-cost="${i === 0 ? '' : t}">${t}</button>`).join('');
  $('b-type-chips').innerHTML = [['', 'すべて'], ['unit', 'ユニット'], ['spell', '特技'], ['weapon', '武器'],
    ['hero', '英雄'], ['dungeon', 'ダンジョン'], ['武術', '武術'], ['道具', '道具'], ['タロット', 'タロット']].map(([v, t], i) =>
    `<button class="chip ${i === 0 ? 'is-on' : ''}" data-type="${v}">${t}</button>`).join('');
  chipRow($('b-cost-chips'), (v) => { filter.cost = v || null; renderPool(); }, 'cost');
  chipRow($('b-type-chips'), (v) => { filter.type = v || null; renderPool(); }, 'type');

  loadDeckList(PLAYABLE_CLASSES[0]);
  pickDeck(deckOptions(PLAYABLE_CLASSES[0])[0]);
}

function chipRow(root, cb, attr) {
  root.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => {
      root.querySelectorAll('.chip').forEach(x => x.classList.remove('is-on'));
      b.classList.add('is-on'); cb(b.dataset[attr]);
    };
  });
}

function deckOptions(cls) {
  const mine = load().decks.filter(d => d.cls === cls).map(d => ({ key: 'u:' + d.id, label: '★ ' + d.name, deck: d, custom: true }));
  const pre = decksForClass(cls).map(d => ({ key: 'p:' + d.id, label: d.name, deck: d, custom: false }));
  return [...mine, ...pre];
}
function loadDeckList(cls) {
  const opts = deckOptions(cls);
  $('b-deck').innerHTML = opts.map(o => `<option value="${o.key}">${o.label}</option>`).join('');
}
function pickDeck(opt) {
  if (!opt) { cur = { id: 'u' + Date.now(), cls: $('b-class').value, name: '新しいデッキ', cards: [] }; renderDeck(); return; }
  $('b-deck').value = opt.key;
  cur = opt.custom
    ? { id: opt.deck.id, cls: opt.deck.cls, name: opt.deck.name, cards: [...opt.deck.cards] }
    : { id: 'u' + Date.now(), cls: opt.deck.cls, name: opt.deck.name + '（編集中）', cards: [...opt.deck.cards], fromPreset: true };
  $('b-delete').disabled = !opt.custom;
  renderDeck(); msg(opt.custom ? '' : 'プリセットを土台にしています。保存すると自分のデッキとして増えます');
}

function countOf(id) { return cur.cards.filter(c => c === id).length; }

function addCard(id) {
  const c = CARDS[id];
  if (!cur) return;
  if (cur.cards.length >= 30) { msg('30枚を超えています', 'ng'); return; }
  if (countOf(id) >= maxCopies(c)) { msg(`${c.name} は${maxCopies(c)}枚までです`, 'ng'); return; }
  if (c.cls !== 'neutral' && c.cls !== cur.cls) { msg('別の職業のカードは入れられません', 'ng'); return; }
  cur.cards.push(id); SFX.tap(); renderDeck(); msg('');
}
function removeCard(id) {
  const i = cur.cards.lastIndexOf(id);
  if (i >= 0) { cur.cards.splice(i, 1); SFX.tap(); renderDeck(); msg(''); }
}

function renderDeck() {
  if (!cur) return;
  $('b-class').value = cur.cls;
  $('b-name').value = cur.name;
  $('b-count').textContent = cur.cards.length;
  $('b-count').style.color = cur.cards.length === 30 ? 'var(--ok)' : 'var(--kin)';

  // マナカーブ
  const buckets = new Array(8).fill(0);
  cur.cards.forEach(id => { const c = CARDS[id]; buckets[Math.min(7, c.cost)]++; });
  const mx = Math.max(1, ...buckets);
  $('b-curve').innerHTML = buckets.map((n, i) =>
    `<div style="height:${Math.max(3, n / mx * 100)}%" title="${i === 7 ? '7+' : i}コスト ${n}枚"><span>${i === 7 ? '7+' : i}</span></div>`).join('');

  // 枚数入りリスト
  const uniq = [...new Set(cur.cards)].sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name, 'ja'));
  $('b-list').innerHTML = uniq.map(id => {
    const c = CARDS[id];
    return `<div class="b-row" data-id="${id}" style="--rc:${cardTint(c.cls)}">
      ${gem('mp', c.cost)}<span class="r-name">${c.name}</span><span class="r-n">×${countOf(id)}</span></div>`;
  }).join('') || '<p style="font-size:.78rem;color:var(--washi-sub);padding:8px">右からカードを選んで追加してください</p>';
  $('b-list').querySelectorAll('.b-row').forEach(r => {
    r.onclick = () => removeCard(r.dataset.id);
    r.onmouseenter = (e) => showTip(CARDS[r.dataset.id], e.clientX, e.currentTarget.getBoundingClientRect().top);
    r.onmouseleave = hideTip;
  });
  renderPool();
}

function matchFilter(c) {
  if (filter.text) {
    const t = filter.text.toLowerCase();
    if (!(c.name.toLowerCase().includes(t) || (c.text || '').toLowerCase().includes(t))) return false;
  }
  if (filter.cost) {
    const n = c.cost;
    if (filter.cost === '0-1' && n > 1) return false;
    if (filter.cost === '7+' && n < 7) return false;
    if (!['0-1', '7+'].includes(filter.cost) && n !== Number(filter.cost)) return false;
  }
  if (filter.type) {
    if (['unit', 'spell', 'weapon', 'hero', 'dungeon'].includes(filter.type)) { if (c.type !== filter.type) return false; }
    else if (c.sub !== filter.type) return false;
  }
  return true;
}

function renderPool() {
  if (!cur) return;
  const pool = COLLECTIBLE.map(id => CARDS[id])
    .filter(c => (c.cls === 'neutral' || c.cls === cur.cls) && matchFilter(c))
    .sort((a, b) => a.cost - b.cost || a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name, 'ja'));
  $('b-pool').innerHTML = pool.map(c => {
    const n = countOf(c.id);
    const full = n >= maxCopies(c);
    return poolCardHtml(c, n).replace('class="pcard"', `class="pcard${full ? ' dimmed' : ''}"`);
  }).join('');
  $('b-pool').querySelectorAll('.pcard').forEach(n => {
    n.onclick = () => addCard(n.dataset.id);
    n.onmouseenter = (e) => showTip(CARDS[n.dataset.id], e.clientX, e.currentTarget.getBoundingClientRect().top);
    n.onmouseleave = hideTip;
  });
}

function msg(t, kind) { const m = $('b-msg'); m.textContent = t || ''; m.className = 'b-msg ' + (kind || ''); }

function saveDeck() {
  if (!cur) return;
  const errs = validateDeck(cur.cls, cur.cards);
  if (errs.length) { msg(errs[0], 'ng'); return; }
  cur.name = ($('b-name').value || '').trim() || '名もなきデッキ';
  update(d => {
    const i = d.decks.findIndex(x => x.id === cur.id);
    const rec = { id: cur.id, cls: cur.cls, name: cur.name, cards: [...cur.cards] };
    if (i >= 0) d.decks[i] = rec; else d.decks.push(rec);
  });
  delete cur.fromPreset;
  loadDeckList(cur.cls);
  $('b-deck').value = 'u:' + cur.id;
  $('b-delete').disabled = false;
  msg('保存しました', 'ok');
}
function deleteDeck() {
  if (!cur) return;
  update(d => { d.decks = d.decks.filter(x => x.id !== cur.id); });
  loadDeckList(cur.cls);
  pickDeck(deckOptions(cur.cls)[0]);
  msg('削除しました', 'ok');
}

// ------------------------------------------------------------
//  カード図鑑
// ------------------------------------------------------------
let colFilter = { text: '', cls: '' };
export function initCollection() {
  $('c-class-chips').innerHTML = [['', 'すべて'], ['neutral', 'ニュートラル'],
    ...PLAYABLE_CLASSES.map(c => [c, CLASSES[c].name])]
    .map(([v, t], i) => `<button class="chip ${i === 0 ? 'is-on' : ''}" data-cls="${v}">${t}</button>`).join('');
  chipRow($('c-class-chips'), (v) => { colFilter.cls = v || ''; renderCollection(); }, 'cls');
  $('c-search').oninput = (e) => { colFilter.text = e.target.value.trim().toLowerCase(); renderCollection(); };
  renderCollection();
}
function renderCollection() {
  const list = COLLECTIBLE.map(id => CARDS[id])
    .filter(c => (!colFilter.cls || c.cls === colFilter.cls) &&
      (!colFilter.text || c.name.toLowerCase().includes(colFilter.text) || (c.text || '').toLowerCase().includes(colFilter.text)))
    .sort((a, b) => a.cls.localeCompare(b.cls) || a.cost - b.cost || a.name.localeCompare(b.name, 'ja'));
  $('c-pool').innerHTML = list.map(c => poolCardHtml(c)).join('') ||
    '<p style="color:var(--washi-sub);padding:20px">見つかりませんでした</p>';
  $('c-pool').querySelectorAll('.pcard').forEach(n => {
    n.onmouseenter = (e) => showTip(CARDS[n.dataset.id], e.clientX, e.currentTarget.getBoundingClientRect().top);
    n.onmouseleave = hideTip;
    n.onclick = (e) => showTip(CARDS[n.dataset.id], e.clientX, e.currentTarget.getBoundingClientRect().top);
  });
}
