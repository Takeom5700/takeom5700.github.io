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

// 重み付きで1つ引く。**有限の表から均等に選ぶのをやめるための道具。**
// 記事から出した重みを渡すと、記事の印象に寄った方が出やすくなる。
// ただし重み 0 の項も `+0` ではなく素の重みで残す（0 を渡せば出ない）ので、
// 「記事が言っていない選択肢も、種が違えば出る」ようにするには
// 呼ぶ側で下駄（0.04 程度）を履かせること。
export function wpick(rng, arr, ws) {
  let sum = 0;
  for (const w of ws) sum += Math.max(0, w);
  if (!(sum > 0)) return arr[Math.floor(rng() * arr.length) % arr.length];
  let r = rng() * sum;
  for (let i = 0; i < arr.length; i++) { r -= Math.max(0, ws[i]); if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

// 文字列 → 種
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) | 0;
  }
  return h | 0;
}
