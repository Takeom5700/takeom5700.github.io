// 決定論的な擬似乱数（xorshift32）。
// AI が盤面を複製して先読みするため、乱数は必ず state に載せて持ち運ぶ。
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return {
    get seed() { return s; },
    set seed(v) { s = v >>> 0; },
  };
}

export function nextInt(rngState) {
  let x = rngState.s >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  rngState.s = x;
  return x;
}

// 0 以上 n 未満の整数
export function rnd(rngState, n) {
  if (n <= 1) return 0;
  return nextInt(rngState) % n;
}

// 0 以上 1 未満の実数
export function rndF(rngState) {
  return nextInt(rngState) / 4294967296;
}

export function pick(rngState, arr) {
  if (!arr || arr.length === 0) return null;
  return arr[rnd(rngState, arr.length)];
}

export function shuffle(rngState, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(rngState, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
