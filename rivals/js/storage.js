// localStorage の読み書き（壊れていても落ちないようにする）
const KEY = 'dqr-rivals-v1';
const DEFAULT = { decks: [], records: { win: 0, lose: 0, draw: 0, byLevel: {} }, settings: { sound: true }, last: {} };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const d = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...d,
      records: { ...DEFAULT.records, ...(d.records || {}) },
      settings: { ...DEFAULT.settings, ...(d.settings || {}) } };
  } catch (e) { return structuredClone(DEFAULT); }
}
export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても続行 */ }
}
export function update(fn) { const d = load(); fn(d); save(d); return d; }
