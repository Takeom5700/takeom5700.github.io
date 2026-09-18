// 譜（score）。作品はここにしか書かれていない。
//
// 中身は数だけ。関数も DOM も持たない。描き手（render.js）は
// この数を受け取るだけで、何を美しいとするかの判断を持たない。
// 逆にここは、どう描かれるかを知らない。
//
// 基軸（art/README.md の五法）をこのファイルが物理的に守る:
//   法 … 楽章は「同じ式のパラメータ」しか差し替えない。形を直接置く欄が無い。
//   尺 … detailFade / far が必ず 2桁以上離れる（近景の塵と遠景の塊が同じ絵に入る）。
//   間 … 楽章長 72秒以上、転換は溶解（morph）のみ。カットを書く欄が無い。
//   闇 … 露出と環境光の上限を持つ。
//   種 … すべて seed から決まる。
// checkWork() がこれを機械で検査する（art/tools/check-axis.mjs）。

import { makeRng, between, jitter, pick } from './rng.js';
import { finestWavelength } from './law.js';

export const LAWS = {
  minMovementSec: 72,     // 間：一楽章の最短
  minMorphSec: 10,        // 間：転換の最短（これ未満はカットとみなす）
  maxMorphRatio: 0.45,    // 転換が楽章の半分を超えないこと
  minMovements: 4,
  maxAmbient: 0.45,       // 闇：環境光の上限（本当の検査は書き出したフレームで行う）
  maxExposure: 1.8,       // 闇：露出の上限
  minScaleRatio: 150,     // 尺：視程 / 一番細かい波長 の比（同じ絵に何桁入るか）
  maxCamSpeed: 26,        // 間：視点の最大速度（world unit/秒）
  maxAngRate: 0.02,       // 間：最大旋回速度（rad/秒）≒ 1.1度/秒
};

// ---- 場と光のパラメータ（すべて shader の uniform に入る）----------------
// 数値は1つずつ、vec3 は長さ3の配列。lerp はこの形だけを見て混ぜる。
const BASE = {
  // 場（密度場の式）
  scale:      0.00025,   // world → 場 の周波数。1/scale が場の周期
  offset:     [0, 0, 0], // 場のどの領域を使うか
  thresh:     0.52,      // ここを超えた分だけが物質になる
  density:    2.4,
  ridge:      0.0,       // 0=丸い塊 1=削られた襞（稜線）
  warp:       1.9,       // 定義域の折り曲げ量（渦と繊維はここから出る）
  warpScale:  1.40,      // 折り曲げに使う周波数（塊と同じくらいにすると襞になる）
  flow:       [0, 0, 0], // 場そのものの流れ（場単位/秒）
  slab:       [-400, 900], // 物質が居られる高さの帯
  slabSoft:   420,       // 帯の縁のぼけ
  wallMix:    0,         // 0=水平の層 1=垂直の壁
  wallTight:  0.012,     // 塊の縁のぼけ（1/これ = world unit）
  wallX:      0,         // 塊の縁の位置。視点が塊の中に入らないよう main.js が打つ
  wallSide:   -1,        // 塊がある側（-1 = x の小さい側）
  dust:       1.0,       // 近景の微粒子の量（尺のための項）
  detailFade: 2200,      // 襞（中間octave）が半分になる距離。遠くまで残す
  dustFade:   170,       // 粒（最細octave）が半分になる距離。近くだけに出す

  // 光
  sunDir:     [-0.40, 0.11, -0.91],
  sunColor:   [4.4, 3.1, 2.2],
  ext:        [0.90, 1.05, 1.38], // 波長ごとの減衰。影が青く、透過が橙になる源
  albedo:     [0.93, 0.95, 0.98],
  ambient:    [0.105, 0.140, 0.205],
  shadow:     1.0,
  phaseG:     0.72,      // 前方散乱の強さ
  powder:     1.6,
  skyLo:      [0.055, 0.080, 0.140],  // 地平。遠くの塊はここを背にして影になる
  skyHi:      [0.013, 0.022, 0.052],  // 天頂
  sunGlow:    1.0,

  // 裂（線状の光源。密度をくり抜いて、そこから光が出る）
  riftAmp:    0,
  riftColor:  [6.0, 3.1, 1.5],
  riftAxis:   1,          // 0=x軸 1=y軸（垂直） 2=z軸（消点へ）
  riftPos:    [0, 0],
  riftTight:  0.0075,
  riftClear:  0.9,        // 裂の中の物質をどれだけ払うか
  riftWobble: 0,          // 軸に沿った蛇行の幅（world unit）

  // 視
  exposure:   1.0,
  vignette:   0.86,
  grain:      0.013,

  // 行程（レイマーチ）
  step0:      1.9,       // 最初の一歩（world unit）。近景の細かさを決める
  far:        1800,      // ここまで進んだら空に溶ける
};

const BASE_CAM = {
  speedF:    7.0,     // 前進（world unit/秒）
  speedS:    0,       // 横滑り
  yTarget:   40,      // この高さへゆっくり引かれる
  yPull:     0.010,
  yawRate:   0,
  yawWobble: 0.0045,  // 旋回のゆらぎ振幅（rad/秒）
  yawFreq:   0.011,
  pitchTarget: -0.02,
  pitchPull: 0.05,
  yawOffset:  0,      // 視線だけを回す（進む向きは変えない）。構図のためにある
  pitchOffset: 0,
  rollAmp:   0.018,
  rollFreq:  0.0061,
  fov:       62,
};

const BASE_AUDIO = {
  tone:     36.71,  // 基音（Hz）D1
  spectrum: 0.34,   // 上部倍音の量
  wind:     420,    // 風（帯域雑音）の中心周波数
  windAmt:  0.17,
  sub:      0.55,
  shimmer:  0,
  level:    0.85,
};

// ---- 楽章の原型 ---------------------------------------------------------
// 5つとも同じ密度場。違うのはパラメータだけ。
// 「別の世界」に見えるが、一つの法の別の解でしかない。
export const ARCHETYPES = [
  {
    key: 'jin', name: '塵', dur: 96, morph: 16,
    note: '希薄な媒質。逆光の前方散乱だけがある。まだ何も形になっていない',
    params: {
      thresh: 0.620, density: 7.0, warp: 2.4, scale: 0.00026, ridge: 0.36,
      slab: [-500, 1100], slabSoft: 620, dust: 1.35, detailFade: 2600, dustFade: 300,
      sunDir: [-0.760, 0.115, -0.640], sunColor: [4.8, 3.4, 2.3],
      ext: [0.72, 0.88, 1.24], ambient: [0.095, 0.125, 0.190],
      phaseG: 0.65, sunGlow: 1.25, exposure: 1.05, far: 2600,
      skyLo: [0.030, 0.042, 0.078], skyHi: [0.006, 0.010, 0.028],
    },
    cam: { speedF: 7.4, yTarget: 60, yawWobble: 0.0038, fov: 64 },
    audio: { tone: 36.71, spectrum: 0.22, wind: 520, windAmt: 0.20, sub: 0.45, level: 0.72 },
  },
  {
    key: 'heki', name: '壁', dur: 108, morph: 18,
    note: '垂直の塊。上も下も端も画面に入らない。全体は決して見えない',
    params: {
      thresh: 0.630, density: 8.0, warp: 2.60, warpScale: 1.10, scale: 0.00035,
      wallMix: 0.94, wallTight: 0.020, slab: [-2600, 420], slabSoft: 420,
      dust: 1.15, detailFade: 2400, dustFade: 420, ridge: 0.60,
      sunDir: [0.452, 0.300, -0.840], sunColor: [5.6, 4.0, 2.8],
      ext: [0.95, 1.05, 1.30], ambient: [0.052, 0.070, 0.112],
      phaseG: 0.62, shadow: 1.25, exposure: 0.95, far: 1700, step0: 1.6,
    },
    cam: {
      speedF: 6.2, speedS: 0, yTarget: 120, yPull: 0.006,
      yawWobble: 0.0026, yawFreq: 0.008, pitchTarget: 0.020, rollAmp: 0.012, fov: 58,
      yawOffset: -0.78, pitchOffset: 0.040,
    },
    audio: { tone: 32.70, spectrum: 0.42, wind: 260, windAmt: 0.13, sub: 0.72, level: 0.92 },
  },
  {
    key: 'chou', name: '潮', dur: 96, morph: 16,
    note: '物質が面を作る。水平線が生まれ、光がそれを横切る',
    params: {
      thresh: 0.600, density: 8.5, warp: 2.00, scale: 0.00024, ridge: 0.42,
      slab: [-900, 90], slabSoft: 120, flow: [0.00085, 0, 0.00040],
      dust: 0.85, detailFade: 2200, dustFade: 260,
      sunDir: [0.438, 0.061, -0.897], sunColor: [5.6, 3.4, 2.1],
      ext: [0.80, 1.02, 1.52], ambient: [0.100, 0.130, 0.195],
      phaseG: 0.78, shadow: 1.1, sunGlow: 1.5, exposure: 0.92, far: 2000,
    },
    cam: {
      speedF: 8.2, yTarget: 150, yPull: 0.009, yawWobble: 0.0040,
      pitchTarget: -0.048, rollAmp: 0.020, fov: 66,
    },
    audio: { tone: 38.89, spectrum: 0.36, wind: 380, windAmt: 0.24, sub: 0.60, level: 0.88 },
  },
  {
    key: 'retsu', name: '裂', dur: 120, morph: 20,
    note: '太陽が落ちる。垂直の裂け目だけが光源になる。全体の頂点',
    params: {
      thresh: 0.615, density: 8.5, warp: 2.3, scale: 0.00022, ridge: 0.55,
      slab: [-1400, 1400], slabSoft: 700, dust: 1.1, detailFade: 2000, dustFade: 320,
      sunDir: [-0.24, -0.05, -0.969], sunColor: [0.30, 0.26, 0.34],
      ext: [1.05, 1.12, 1.28], ambient: [0.030, 0.036, 0.058],
      phaseG: 0.55, shadow: 1.5,
      skyLo: [0.016, 0.019, 0.034], skyHi: [0.004, 0.005, 0.014], sunGlow: 0.2,
      riftAmp: 0.78, riftColor: [7.4, 3.4, 1.3], riftAxis: 1, riftPos: [0, 0],
      riftTight: 0.021, riftClear: 0.96, riftWobble: 62,
      exposure: 1.02, vignette: 0.94, far: 1600, step0: 1.7,
    },
    cam: {
      speedF: 3.4, yTarget: 90, yPull: 0.007, yawWobble: 0.0018, yawFreq: 0.006,
      pitchTarget: 0.012, rollAmp: 0.009, fov: 60,
    },
    audio: { tone: 27.50, spectrum: 0.58, wind: 180, windAmt: 0.11, sub: 1.0, shimmer: 0.75, level: 1.0 },
  },
  {
    key: 'jin2', name: '燼', dur: 84, morph: 18,
    note: '物質が解ける。最後に残るのは近くの粒子だけ。解決はしない',
    params: {
      thresh: 0.645, density: 6.8, warp: 2.9, scale: 0.00040, ridge: 0.46,
      slab: [-700, 1200], slabSoft: 700, dust: 2.9, detailFade: 1400, dustFade: 520,
      sunDir: [-0.809, 0.156, -0.566], sunColor: [2.4, 1.8, 1.4],
      ext: [0.70, 0.82, 1.10], ambient: [0.055, 0.070, 0.105],
      phaseG: 0.74, sunGlow: 0.55,
      skyLo: [0.028, 0.036, 0.062], skyHi: [0.006, 0.009, 0.022],
      exposure: 1.10, vignette: 0.90, far: 1500,
    },
    cam: { speedF: 1.6, yTarget: 70, yawWobble: 0.0022, pitchTarget: -0.01, rollAmp: 0.010, fov: 68 },
    audio: { tone: 32.70, spectrum: 0.18, wind: 700, windAmt: 0.14, sub: 0.30, level: 0.58 },
  },
];

export const FADE_IN = 9;    // 開幕の暗転からの立ち上がり（秒）
export const FADE_OUT = 22;  // 終幕へ向かう落ち（秒）
export const REST = 7;       // 作品と作品のあいだの無（秒）

function merge(base, over) {
  const out = {};
  for (const k in base) out[k] = Array.isArray(base[k]) ? base[k].slice() : base[k];
  if (over) for (const k in over) {
    if (!(k in base)) throw new Error('未知のパラメータ: ' + k);
    out[k] = Array.isArray(over[k]) ? over[k].slice() : over[k];
  }
  return out;
}

// ---- 種から作品を組む ---------------------------------------------------
// seed=0 は基準の作品（無銘 一番）。それ以外は同じ法の別の解。
export function composeWork(seed) {
  const s = seed | 0;
  const rng = makeRng(s * 2654435761 + 12345);
  const canon = s === 0;

  // 楽章の並び。基準作品は 塵→壁→潮→裂→燼。
  // 変奏では真ん中3つを入れ替える（始まりは希薄、終わりは解け、頂点は裂のまま）
  let order = [0, 1, 2, 3, 4];
  if (!canon) {
    const mid = [1, 2];
    if (rng() < 0.5) mid.reverse();
    order = [0, mid[0], mid[1], 3, 4];
    // 1/3 の確率で「潮」を二度通る（同じ法の反復と差異）
    if (rng() < 0.34) order = [0, mid[0], 2, 3, 4];
  }

  const movements = order.map((ai, i) => {
    const a = ARCHETYPES[ai];
    const params = merge(BASE, a.params);
    const cam = merge(BASE_CAM, a.cam);
    const audio = merge(BASE_AUDIO, a.audio);

    if (!canon) {
      // 変奏。法を壊さない幅でしか触らない
      params.thresh   = clamp(jitter(rng, params.thresh, 0.045), 0.52, 0.78);
      params.ridge    = clamp(jitter(rng, params.ridge + 0.04, 0.45), 0.0, 0.92);
      params.density  = clamp(jitter(rng, params.density, 0.22), 1.5, 13.0);
      params.warp     = clamp(jitter(rng, params.warp, 0.22), 0.7, 3.4);
      params.scale    = clamp(jitter(rng, params.scale, 0.20), 0.00012, 0.00042);
      params.phaseG   = clamp(jitter(rng, params.phaseG, 0.10), 0.35, 0.90);
      params.offset   = [between(rng, 0, 64), between(rng, 0, 64), between(rng, 0, 64)];
      // 光の向きは球面上でゆらす（高度は低いまま＝逆光を保つ）
      const az = between(rng, -1.15, 1.15), el = between(rng, -0.06, 0.34);
      params.sunDir   = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
      // 色温度。減衰の波長依存だけを動かす（＝同じ物質の別の厚み）
      const warm = between(rng, 0.55, 1.45);
      params.ext = [params.ext[0] * (1.28 - 0.28 * warm), params.ext[1], params.ext[2] * (0.72 + 0.34 * warm)];
      params.sunColor = params.sunColor.map((v, k) => v * (k === 0 ? 0.88 + 0.26 * warm : k === 1 ? 1.0 : 1.18 - 0.24 * warm));
      params.dust     = clamp(jitter(rng, params.dust, 0.25), 0.5, 2.2);
      cam.speedF      = clamp(jitter(rng, cam.speedF, 0.24), 1.2, LAWS.maxCamSpeed * 0.7);
      cam.yawWobble   = clamp(jitter(rng, cam.yawWobble, 0.35), 0.0008, LAWS.maxAngRate * 0.45);
      cam.yawFreq     = jitter(rng, cam.yawFreq, 0.3);
      cam.fov         = clamp(jitter(rng, cam.fov, 0.07), 52, 72);
      if (params.riftAmp > 0) {
        params.riftAxis  = pick(rng, [1, 1, 2, 0]);
        params.riftTight = clamp(jitter(rng, params.riftTight, 0.3), 0.003, 0.02);
        params.riftColor = params.riftColor.map((v, k) => clamp(jitter(rng, v, k === 2 ? 0.55 : 0.2), 0.4, 9));
      }
      audio.tone = pick(rng, [27.50, 30.87, 32.70, 34.65, 36.71, 38.89, 41.20]);
    }

    const dur   = canon ? a.dur   : Math.round(clamp(jitter(rng, a.dur, 0.16), LAWS.minMovementSec + 4, 190));
    const morph = canon ? a.morph : Math.round(clamp(jitter(rng, a.morph, 0.2), LAWS.minMorphSec + 2, dur * 0.4));

    return { key: a.key, name: a.name, note: a.note, index: i, dur, morph: i === 0 ? 0 : morph, params, cam, audio };
  });

  // 裂の軸は作品を通して1つ。楽章ごとに違うと、転換の途中で
  // 光の向きが切り替わってしまう（＝カット）。軸は溶けない値なので、
  // 最初から全楽章で同じにしておく。
  const axis = (movements.find((m) => m.params.riftAmp > 0) || movements[0]).params.riftAxis | 0;
  for (const m of movements) m.params.riftAxis = axis;

  let t = 0;
  for (const m of movements) { m.start = t; t += m.dur; }

  return {
    seed: s,
    id: canon ? 'mumei-1' : 'mumei-' + (s >>> 0).toString(36),
    title: canon ? '無銘 一番' : '無銘 ' + (s >>> 0).toString(36),
    movements,
    total: t,
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }

function lerp(a, b, u) {
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * u);
  return a + (b - a) * u;
}
function lerpSet(a, b, u) {
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k], u);
  return out;
}

// ---- 譜を時刻で解く -----------------------------------------------------
// カットは構造上ありえない。楽章の切り替わりは必ず溶解になる。
export function resolve(work, t) {
  const ms = work.movements;
  let i = ms.length - 1;
  for (let k = 0; k < ms.length; k++) {
    if (t < ms[k].start + ms[k].dur) { i = k; break; }
  }
  const m = ms[i];
  const local = t - m.start;
  let params = m.params, cam = m.cam, audio = m.audio, u = 1;
  if (i > 0 && m.morph > 0 && local < m.morph) {
    const prev = ms[i - 1];
    u = smooth(local / m.morph);
    params = lerpSet(prev.params, m.params, u);
    cam    = lerpSet(prev.cam,    m.cam,    u);
    audio  = lerpSet(prev.audio,  m.audio,  u);
    // 整数のまま扱う欄は混ぜない（軸は溶けない。裂の光量で溶かす）
    params.riftAxis = u < 0.5 ? prev.params.riftAxis : m.params.riftAxis;
  }
  // 開幕と終幕の暗転。作品は始まりも終わりも黒から出て黒へ帰る
  let env = 1;
  if (t < FADE_IN) env = smooth(t / FADE_IN);
  const rem = work.total - t;
  if (rem < FADE_OUT) env = Math.min(env, smooth(Math.max(rem, 0) / FADE_OUT));
  return { params, cam, audio, env, movement: i, local, morphU: u, name: m.name };
}

// ---- 視点：固定歩幅で積む（決定性）--------------------------------------
// 位置は時刻の純粋な関数ではなく積分なので、必ず同じ歩幅で積む。
// こうしないと静止画の書き出しと再生で絵が変わる。
export const CAM_DT = 1 / 60;

export function makeCamera() {
  return { x: 0, y: 40, z: 0, yaw: 0, pitch: -0.02, steps: 0 };
}

export function stepCamera(c, cp, t) {
  const yaw = c.yaw + (cp.yawRate + cp.yawWobble * Math.sin(2 * Math.PI * cp.yawFreq * t)) * CAM_DT;
  const pitch = c.pitch + (cp.pitchTarget - c.pitch) * cp.pitchPull * CAM_DT;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp2 = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = sy * cp2, fy = sp, fz = -cy * cp2;
  const rx = cy, rz = sy;
  c.x += (fx * cp.speedF + rx * cp.speedS) * CAM_DT;
  c.y += (fy * cp.speedF + (cp.yTarget - c.y) * cp.yPull) * CAM_DT;
  c.z += (fz * cp.speedF + rz * cp.speedS) * CAM_DT;
  c.yaw = yaw; c.pitch = pitch; c.steps++;
  return c;
}

// 時刻 t の視点を 0 から積んで出す（静止画の書き出し用）
export function cameraAt(work, t) {
  const c = makeCamera();
  const n = Math.max(0, Math.floor(t / CAM_DT));
  for (let i = 0; i < n; i++) {
    const r = resolve(work, i * CAM_DT);
    stepCamera(c, r.cam, i * CAM_DT);
  }
  return c;
}

// ---- 五法の検査 ---------------------------------------------------------
// 譜の側で機械的に確かめられる分だけをここで見る。
// 実際の絵（闇の量・尺の同居）は書き出したフレームを tools/measure.mjs が測る。
export function checkWork(work) {
  const bad = [];
  const ms = work.movements;
  if (ms.length < LAWS.minMovements) bad.push(`楽章が ${ms.length} 個しかない（最低 ${LAWS.minMovements}）`);

  ms.forEach((m, i) => {
    const at = `${work.id} 第${i + 1}楽章「${m.name}」`;
    // 間
    if (m.dur < LAWS.minMovementSec) bad.push(`${at}: 間 — ${m.dur}秒は短すぎる（最低 ${LAWS.minMovementSec}秒）`);
    if (i > 0) {
      if (m.morph < LAWS.minMorphSec) bad.push(`${at}: 間 — 転換 ${m.morph}秒はカットに近い（最低 ${LAWS.minMorphSec}秒）`);
      if (m.morph > m.dur * LAWS.maxMorphRatio) bad.push(`${at}: 間 — 転換 ${m.morph}秒が楽章 ${m.dur}秒に対して長すぎる`);
    }
    if (m.cam.speedF > LAWS.maxCamSpeed) bad.push(`${at}: 間 — 視点が速すぎる（${m.cam.speedF.toFixed(1)} > ${LAWS.maxCamSpeed}）`);
    const ang = Math.abs(m.cam.yawRate) + Math.abs(m.cam.yawWobble);
    if (ang > LAWS.maxAngRate) bad.push(`${at}: 間 — 旋回が速すぎる（${ang.toFixed(4)} > ${LAWS.maxAngRate}）`);
    // 闇
    if (m.params.exposure > LAWS.maxExposure) bad.push(`${at}: 闇 — 露出 ${m.params.exposure} が上限 ${LAWS.maxExposure} を超える`);
    const amb = Math.max(...m.params.ambient);
    if (amb > LAWS.maxAmbient) bad.push(`${at}: 闇 — 環境光 ${amb.toFixed(3)} が上限 ${LAWS.maxAmbient} を超える`);
    if (m.params.vignette < 0.5) bad.push(`${at}: 闇 — 周辺の落ち ${m.params.vignette} が浅い`);
    // 尺：一番細かい波長と視程が何桁離れているか
    const finest = finestWavelength(m.params.scale);
    const ratio = m.params.far / finest;
    if (ratio < LAWS.minScaleRatio) {
      bad.push(`${at}: 尺 — 一番細かい波長 ${finest.toFixed(1)} と視程 ${m.params.far} の比が ${ratio.toFixed(0)}（最低 ${LAWS.minScaleRatio}）`);
    }
    if (m.params.dustFade < 80) bad.push(`${at}: 尺 — 粒が近すぎて見えない（dustFade ${m.params.dustFade}）`);
    if (m.params.detailFade < m.params.far * 0.5) bad.push(`${at}: 尺 — 襞が遠景に届かない（detailFade ${m.params.detailFade} < 視程の半分）`);
    const tile = 1 / m.params.scale;
    if (tile < m.params.far) bad.push(`${at}: 法 — 場の周期 ${tile.toFixed(0)} が視程 ${m.params.far} より短い（繰り返しが見える）`);
    if (m.params.dust <= 0) bad.push(`${at}: 尺 — 近景の粒子が無い`);
    // 法（形を直接置いていないこと＝未知の欄が無いこと）は merge() が例外で守る
  });

  // 間：裂の軸が楽章で変わっていないこと（変わると転換の途中で切り替わる）
  const axes = new Set(ms.map((m) => m.params.riftAxis | 0));
  if (axes.size > 1) bad.push(`${work.id}: 間 — 裂の軸が楽章で違う（${[...axes].join(',')}）。転換の途中で切り替わってカットになる`);

  // 種
  const again = composeWork(work.seed);
  if (JSON.stringify(again) !== JSON.stringify(work)) bad.push(`${work.id}: 種 — 同じ種から同じ譜が出ない（決定性が壊れている）`);

  return bad;
}
