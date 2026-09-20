// 種（seed）から決まる乱数。
// 同じ種なら必ず同じ世界になる。これは基軸「五・種」の土台で、
// 作品を「一点もの」ではなく「種＋譜」にするための最低条件。
// Math.random() をこの外で呼ばないこと（呼んだ瞬間に再現性が死ぬ）。

export function makeRng(seed) {
  let s = (seed | 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s |= 0;
    return (s >>> 0) / 4294967296;
  };
}

// 範囲つき
export function between(rng, a, b) { return a + (b - a) * rng(); }

// 中央 v から ±amt（相対）だけ揺らす。譜の変奏に使う
export function jitter(rng, v, amt) { return v * (1 + (rng() * 2 - 1) * amt); }

// 配列から1つ
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

// 文字列 → 種
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) | 0;
  }
  return h | 0;
}
