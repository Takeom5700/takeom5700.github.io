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
  maxExposure: 1.8,       // 闇：露出の上限
  minScaleRatio: 150,     // 尺：視程 / 一番細かい波長 の比（同じ絵に何桁入るか）
  maxCamSpeed: 90,        // 間：視点の最大速度（world unit/秒）。カットでなければ速くてよい
  maxAngRate: 0.06,       // 間：最大旋回速度（rad/秒）。視点がぐるぐる回らないため
  minMotion: 1.6,         // 動：運動源の合計。これ未満だと静止画に見える
  minColorGap: 0.20,      // 異：同じ絵の中の2色の隔たり（色度のL1距離）
};

// ---- 場と光のパラメータ（すべて shader の uniform に入る）----------------
// 数値は1つずつ、vec3 は長さ3の配列。lerp はこの形だけを見て混ぜる。
const BASE = {
  // 場
  scale:      0.00070,   // world → 場 の周波数。1/scale が場の周期
  offset:     [0, 0, 0],
  thresh:     0.630,     // ここを超えた分だけが物質になる
  density:    26.0,   // 発光する媒質は不透明でないと、奥の光まで足し合わさって白くなる
  ridge:      0.50,      // 0=丸い塊 1=削られた襞（稜線）
  warp:       2.0,
  warpScale:  0.90,
  warpSpin:   0.055,     // 折り曲げが巻き替わる速さ（rad/秒）＝沸き

  // 世界の運動。**カメラではなく場が動く。**
  // 視点が這うだけの絵は静止画に見える（実際にそう見えた）。
  spin:       0.012,     // 全体の回転（rad/秒）
  shear:      0.055,     // 内側ほど速い差動回転（ねじれ）
  boil:       0.0035,    // 場の中身が入れ替わる速さ

  // 形。殻・格子・管。**層と崖（＝地平線と風景）は捨てた。**
  shell:      0,         // 球の膜
  shellR:     260,
  shellV:     0,         // 膜が広がる速さ（world unit/秒）
  shellW:     110,
  lattice:    0,         // 立方格子の稜
  latticeK:   0.013,
  latticeW:   0.26,
  tube:       0,         // z軸（進行方向）まわりの筒
  tubeR:      280,
  tubeW:      140,

  // 大きな構図。格子を低い周波数の場で切り抜く。
  // これが無いと画面が均一な壁紙になって、変化しても退屈になる
  mask:       0.95,
  maskScale:  0.00075,   // 1/これ が周期。440unit ほどの塊になる
  maskT:      0.560,     // 切り抜く閾値。高いほど空隙が広い
  maskW:      0.075,     // 縁のぼけ
  maskDrift:  0.0016,    // 構図そのものがゆっくり流れる

  // 発光。**光は外から来ない。物質が自分で光る。**
  // 太陽と空で照らすと、どう作っても風景写真になる。
  emit:       8.0,
  emitShell:  0.680,     // 場のこの値のところだけ光る（膜と繊維になる）
  emitW:      0.022,     // 光る層の厚み。薄いほど膜・繊維になる。厚いと霧になる
  scatter:    0.35,      // 物質が光を拾って散らす量
  emitA:      [0.30, 0.85, 1.50],
  emitB:      [1.45, 0.35, 1.00],
  hueLo:      0.50,      // 2色の振り分け（場の値で色が変わる）
  hueHi:      0.74,
  ext:        [0.95, 1.00, 1.10],
  voidTone:   [0, 0, 0], // 背景。空も太陽も無い

  // 衝撃波。世界を走り抜ける事象
  frontColor:  [2.2, 1.5, 0.8],
  frontV:      0,        // 走る速さ（world unit/秒）
  frontPeriod: 0,        // 何秒ごとに起き直すか（30秒前後。拍には遅すぎる）
  frontW:      70,
  frontAmp:    0,

  // 視
  exposure:   1.0,
  vignette:   0.70,
  grain:      0.012,

  // 行程（レイマーチ）
  step0:      1.6,       // 最初の一歩（world unit）。近景の細かさを決める
  far:        1200,      // ここまで進んだら虚無に溶ける

  // 尺のための項
  rough:      1.6,       // 高い周波数の支配。上げると膜がレースに割れる
  dust:       1.0,
  detailFade: 900,
  dustFade:   260,
};

const BASE_CAM = {
  speedF:    34,
  speedS:    0,
  yTarget:   0,
  yPull:     0.008,
  yawRate:   0,
  yawWobble: 0.0040,
  yawFreq:   0.011,
  pitchTarget: 0,
  pitchPull: 0.05,
  yawOffset:  0,
  pitchOffset: 0,
  rollAmp:   0.050,
  rollFreq:  0.018,
  fov:       70,
};

const BASE_AUDIO = {
  tone:     36.71,
  spectrum: 0.34,
  wind:     420,
  windAmt:  0.17,
  sub:      0.55,
  shimmer:  0,
  level:    0.85,
};

// ---- 楽章の原型 ---------------------------------------------------------
// 5つとも同じ密度場。違うのはパラメータだけ。
// **どれも「天候」ではなく事象。** 2秒見れば何かが動いていると分かる。
export const ARCHETYPES = [
  {
    key: 'kaku', name: '核', dur: 84, morph: 16,
    note: '立方格子の稜が発光する。空隙が支配的で、そこを高速で抜ける',
    params: {
      lattice: 1.0, latticeK: 0.0115, latticeW: 0.30, rough: 2.6,
      thresh: 0.600, density: 24.0, ridge: 0.60, warp: 1.6, warpSpin: 0.085,
      spin: 0.016, shear: 0.030, boil: 0.0060,
      emit: 7.0, emitShell: 0.648, emitW: 0.034,
      emitA: [0.22, 0.90, 1.60], emitB: [0.85, 0.30, 1.70],
      hueLo: 0.52, hueHi: 0.72,
      ext: [1.05, 1.00, 0.95], far: 1200,
    },
    // 粗い格子から細かい格子へ。冷たい色が温度を上げていく
    drift: {
      latticeK: 0.0260, latticeW: 0.20, rough: 3.6, thresh: 0.628,
      emit: 9.0, emitShell: 0.668, emitW: 0.024,
      emitA: [0.85, 0.30, 1.70], emitB: [1.50, 0.70, 0.25],
    },
    cam: { speedF: 52, yawWobble: 0.0035, rollAmp: 0.040, rollFreq: 0.017, fov: 74 },
    camDrift: { speedF: 24, rollAmp: 0.110 },
    audio: { tone: 36.71, spectrum: 0.44, wind: 560, windAmt: 0.16, sub: 0.55, level: 0.86 },
  },
  {
    key: 'nen', name: '捻', dur: 96, morph: 18,
    note: '同じ格子が差動回転で捻れる。稜が螺旋に千切れながら流れる',
    params: {
      lattice: 1.0, latticeK: 0.0085, latticeW: 0.34, rough: 3.6,
      thresh: 0.616, density: 34.0, ridge: 0.46, warp: 2.4, warpSpin: 0.105,
      spin: 0.022, shear: 0.120, boil: 0.0050,
      emit: 8.5, emitShell: 0.664, emitW: 0.028,
      emitA: [1.55, 0.50, 0.18], emitB: [0.20, 0.60, 1.65],
      hueLo: 0.52, hueHi: 0.76,
      ext: [0.90, 1.00, 1.20], far: 1200,
    },
    // 捻れが進んで稜が完全に千切れ、繊維になる
    drift: {
      shear: 0.230, spin: 0.040, latticeK: 0.0175, latticeW: 0.22,
      rough: 5.0, thresh: 0.640, emitW: 0.020, emit: 10.0,
      emitA: [0.20, 0.60, 1.65], emitB: [1.55, 0.50, 0.18],
    },
    cam: { speedF: 34, yawWobble: 0.0022, rollAmp: 0.150, rollFreq: 0.013, pitchOffset: 0.22, fov: 78 },
    camDrift: { speedF: 12, rollAmp: 0.040, pitchOffset: -0.18 },
    audio: { tone: 32.70, spectrum: 0.38, wind: 300, windAmt: 0.20, sub: 0.70, level: 0.92 },
  },
  {
    key: 'baku', name: '爆', dur: 108, morph: 20,
    note: '衝撃波が格子を走り抜ける。31秒ごとに起き直す。全体の頂点',
    params: {
      lattice: 0.96, latticeK: 0.0155, latticeW: 0.30, rough: 3.2,
      thresh: 0.618, density: 30.0, ridge: 0.54, warp: 2.6, warpSpin: 0.130,
      spin: 0.012, shear: 0.060, boil: 0.0085,
      emit: 8.0, emitShell: 0.664, emitW: 0.028,
      emitA: [1.70, 0.85, 0.20], emitB: [1.30, 0.18, 0.70],
      hueLo: 0.52, hueHi: 0.72,
      frontV: 62, frontPeriod: 31, frontW: 58, frontAmp: 3.4,
      frontColor: [3.2, 2.0, 0.9],
      ext: [0.85, 1.00, 1.25], exposure: 0.72, far: 1300,
    },
    // 衝撃波が速く・広くなり、格子が吹き飛んで疎になる
    drift: {
      frontV: 118, frontW: 130, frontAmp: 5.0, latticeK: 0.0075, latticeW: 0.22,
      thresh: 0.648, density: 20.0, rough: 4.4, emit: 9.5, emitW: 0.024,
      emitA: [1.30, 0.18, 0.70], emitB: [1.70, 0.85, 0.20],
      exposure: 0.90,
    },
    cam: { speedF: 16, yawWobble: 0.0030, rollAmp: 0.060, fov: 74 },
    camDrift: { speedF: 40 },
    audio: { tone: 27.50, spectrum: 0.58, wind: 190, windAmt: 0.12, sub: 1.0, shimmer: 0.75, level: 1.0 },
  },
  {
    key: 'mou', name: '網', dur: 90, morph: 18,
    note: '格子が細かく砕けて海綿になる。休みなく編み替わる',
    params: {
      lattice: 0.96, latticeK: 0.0235, latticeW: 0.24, rough: 3.4,
      thresh: 0.634, density: 28.0, ridge: 0.80, warp: 2.9, warpSpin: 0.165,
      spin: 0.009, shear: 0.024, boil: 0.0125,
      emit: 5.6, emitShell: 0.666, emitW: 0.022,
      emitA: [0.15, 1.30, 0.95], emitB: [1.55, 0.75, 0.12],
      hueLo: 0.600, hueHi: 0.688,
      ext: [1.00, 0.95, 1.05], dust: 1.5, dustFade: 420, far: 1100,
    },
    // 海綿が編み替わりながら粗くなり、空隙が開いていく
    drift: {
      latticeK: 0.0090, latticeW: 0.34, rough: 2.4, thresh: 0.608,
      boil: 0.0035, warpSpin: 0.060, emit: 4.6, emitW: 0.030,
      emitA: [1.55, 0.75, 0.12], emitB: [0.15, 1.30, 0.95],
    },
    cam: { speedF: 28, yawWobble: 0.0040, rollAmp: 0.050, fov: 72 },
    camDrift: { speedF: 46 },
    audio: { tone: 38.89, spectrum: 0.46, wind: 420, windAmt: 0.24, sub: 0.60, level: 0.90 },
  },
  {
    key: 'shou', name: '消', dur: 78, morph: 18,
    note: '稜が細くなって点になり、消えていく。解決はしない',
    params: {
      lattice: 0.98, latticeK: 0.0105, latticeW: 0.17, rough: 4.0,
      thresh: 0.648, density: 16.0, ridge: 0.62, warp: 3.2, warpSpin: 0.070,
      spin: 0.006, shear: 0.016, boil: 0.0048,
      emit: 7.0, emitShell: 0.696, emitW: 0.022,
      emitA: [0.95, 1.00, 1.15], emitB: [1.20, 0.55, 0.30],
      hueLo: 0.60, hueHi: 0.74,
      ext: [0.80, 0.85, 0.95], dust: 2.2, dustFade: 520,
      exposure: 1.10, far: 1000,
    },
    // 点まで細って、最後は数個の残り火だけになる
    drift: {
      latticeW: 0.075, thresh: 0.668, emit: 4.5, emitW: 0.018,
      density: 9.0, rough: 5.2, warpSpin: 0.030,
      emitA: [1.20, 0.55, 0.30], emitB: [0.95, 1.00, 1.15],
      exposure: 1.25,
    },
    cam: { speedF: 11, yawWobble: 0.0020, rollAmp: 0.030, fov: 76 },
    camDrift: { speedF: 4 },
    audio: { tone: 32.70, spectrum: 0.20, wind: 700, windAmt: 0.14, sub: 0.30, level: 0.58 },
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
      params.thresh   = clamp(jitter(rng, params.thresh, 0.030), 0.58, 0.70);
      params.ridge    = clamp(jitter(rng, params.ridge, 0.35), 0.0, 0.92);
      params.density  = clamp(jitter(rng, params.density, 0.25), 8.0, 70.0);
      params.warp     = clamp(jitter(rng, params.warp, 0.22), 0.8, 3.6);
      params.offset   = [between(rng, 0, 64), between(rng, 0, 64), between(rng, 0, 64)];

      // 運動は落とさない。速さは振るが、止まる方へは振らない
      params.spin     = jitter(rng, params.spin, 0.5) * (rng() < 0.5 ? -1 : 1);
      params.shear    = jitter(rng, params.shear, 0.4) * (rng() < 0.35 ? -1 : 1);
      params.boil     = Math.abs(jitter(rng, params.boil, 0.4));
      params.warpSpin = Math.abs(jitter(rng, params.warpSpin, 0.35));

      // 発光する層の位置と厚み。ここが絵の性格をいちばん変える
      params.emitShell = clamp(jitter(rng, params.emitShell, 0.025), params.thresh + 0.03, 0.78);
      params.emitW     = clamp(jitter(rng, params.emitW, 0.30), 0.014, 0.040);
      params.emit      = clamp(jitter(rng, params.emit, 0.25), 3.5, 14.0);

      // 色。**2色の隔たりを運に任せない。**
      // 色相環の上で A を任意に置き、B は必ず 0.28〜0.72周ずらす。
      // こうしないと変奏のたびに2色が寄って、単色＝自然物に見える絵が出る。
      const hueRGB = (h, sat) => {
        const c = [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(6.2832 * (h + o)));
        return c.map((x) => clamp(0.5 + (x - 0.5) * sat, 0.03, 1.0));
      };
      const hA = rng(), hB = hA + between(rng, 0.28, 0.72);
      const briA = between(rng, 1.3, 2.0), briB = between(rng, 1.1, 1.8);
      params.emitA = hueRGB(hA, between(rng, 1.3, 1.9)).map((x) => x * briA);
      params.emitB = hueRGB(hB, between(rng, 1.3, 1.9)).map((x) => x * briB);
      if (params.frontAmp > 0) {
        params.frontColor = hueRGB(hA + between(rng, -0.12, 0.12), 1.7).map((x) => x * between(rng, 2.0, 3.2));
      }
      params.ext   = params.ext.map((v) => clamp(jitter(rng, v, 0.18), 0.6, 1.5));

      // 形。閉じ込めの重みは原型を保ちつつ寸法だけ振る
      params.latticeK = clamp(jitter(rng, params.latticeK, 0.30), 0.006, 0.030);
      params.latticeW = clamp(jitter(rng, params.latticeW, 0.25), 0.14, 0.44);
      params.tubeR    = clamp(jitter(rng, params.tubeR, 0.30), 120, 520);
      params.tubeW    = clamp(jitter(rng, params.tubeW, 0.30), 60, 260);
      params.shellV   = jitter(rng, params.shellV, 0.35);
      if (params.frontAmp > 0) {
        params.frontV      = clamp(jitter(rng, params.frontV, 0.30), 22, 130);
        params.frontPeriod = clamp(jitter(rng, params.frontPeriod, 0.25), 18, 55);
        params.frontW      = clamp(jitter(rng, params.frontW, 0.30), 40, 190);
      }

      params.dust     = clamp(jitter(rng, params.dust, 0.25), 0.5, 2.6);
      params.rough    = clamp(jitter(rng, params.rough, 0.30), 1.2, 6.0);
      params.mask      = clamp(jitter(rng, params.mask, 0.15), 0.55, 1.0);
      params.maskScale = clamp(jitter(rng, params.maskScale, 0.35), 0.00045, 0.0016);
      params.maskT     = clamp(jitter(rng, params.maskT, 0.10), 0.44, 0.62);
      cam.speedF      = clamp(jitter(rng, cam.speedF, 0.25), 4, LAWS.maxCamSpeed * 0.8);
      cam.yawWobble   = clamp(jitter(rng, cam.yawWobble, 0.35), 0.0008, LAWS.maxAngRate * 0.4);
      cam.yawFreq     = jitter(rng, cam.yawFreq, 0.3);
      cam.rollAmp     = clamp(jitter(rng, cam.rollAmp, 0.4), 0.01, 0.16);
      cam.fov         = clamp(jitter(rng, cam.fov, 0.07), 60, 86);
      audio.tone = pick(rng, [27.50, 30.87, 32.70, 34.65, 36.71, 38.89, 41.20]);

      // 動の下限を構造で保証する。揺らした結果が足りなければ、
      // 沸きと巻き替わりを上げて必ず満たす（運に任せない）。
      let guard = 0;
      while (motionScore({ params, cam }) < LAWS.minMotion * 1.08 && guard++ < 48) {
        params.boil *= 1.12;
        params.warpSpin *= 1.12;
      }
    }

    const dur   = canon ? a.dur   : Math.round(clamp(jitter(rng, a.dur, 0.16), LAWS.minMovementSec + 4, 190));
    const morph = canon ? a.morph : Math.round(clamp(jitter(rng, a.morph, 0.2), LAWS.minMorphSec + 2, dur * 0.4));

    // 楽章の中でもパラメータは進み続ける。**定常の区間を作らない。**
    // ここが無いと、動いてはいるが変化しない絵になる（実際にそうなった。
    // 60秒後の画面が3秒後と統計的に同じで、退屈だと言われた）。
    const drift = a.drift || {};
    const camDrift = a.camDrift || {};
    const audioDrift = a.audioDrift || {};
    const paramsEnd = merge(params, drift);
    const camEnd = merge(cam, camDrift);
    const audioEnd = merge(audio, audioDrift);
    if (!canon) {
      // 変奏でも必ず旅をさせる。終わりの状態を種から作る
      paramsEnd.latticeK = clamp(jitter(rng, params.latticeK, 0.55), 0.006, 0.034);
      paramsEnd.thresh   = clamp(jitter(rng, params.thresh, 0.045), 0.58, 0.70);
      paramsEnd.emitShell = clamp(jitter(rng, paramsEnd.emitShell, 0.035), paramsEnd.thresh + 0.03, 0.78);
      paramsEnd.emitW    = clamp(jitter(rng, params.emitW, 0.45), 0.014, 0.040);
      paramsEnd.emit     = clamp(jitter(rng, params.emit, 0.35), 3.5, 14.0);
      paramsEnd.rough    = clamp(jitter(rng, params.rough, 0.40), 1.2, 6.0);
      paramsEnd.emitA    = params.emitB.slice();   // 2色が入れ替わっていく
      paramsEnd.emitB    = params.emitA.slice();
      camEnd.speedF      = clamp(jitter(rng, cam.speedF, 0.45), 4, LAWS.maxCamSpeed * 0.8);
    }

    return {
      key: a.key, name: a.name, note: a.note, index: i, dur,
      morph: i === 0 ? 0 : morph,
      params, cam, audio, paramsEnd, camEnd, audioEnd,
    };
  });

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

// 運動源の合計。どれか1つが強いか、複数が中くらいにあれば通る。
// **視点の速さだけでは足りない**ようにしてある（場が動くことが要）。
export function motionScore(m) {
  const p = m.params, c = m.cam;
  return Math.min(c.speedF / 45, 1.0)
       + Math.abs(p.spin) / 0.020
       + Math.abs(p.shear) / 0.090
       + Math.abs(p.boil) / 0.006
       + Math.abs(p.warpSpin) / 0.070
       + Math.abs(p.shellV) / 8
       + (p.frontAmp > 0 ? 1.2 : 0);
}

// 2色の隔たり。明るさを割り落とした色度（どの色みか）だけで見る。
// 生のRGBのままベクトル角で測ると、どちらも青が強いだけで「近い」と
// 判定されてしまう（シアンとマゼンタが近いことになる）。
function colorGap(a, b) {
  const chroma = (v) => { const sum = v[0] + v[1] + v[2] || 1; return v.map((x) => x / sum); };
  const x = chroma(a), y = chroma(b);
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}
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

  // 楽章の中の旅。**線形に進める。** ease を掛けると両端で速度が落ちて
  // 「同じ画面が続く」区間ができてしまう。ここは一定速度でよい。
  const g = Math.max(0, Math.min(1, local / m.dur));
  let params = lerpSet(m.params, m.paramsEnd, g);
  let cam    = lerpSet(m.cam,    m.camEnd,    g);
  let audio  = lerpSet(m.audio,  m.audioEnd,  g);

  // 楽章の継ぎ目は、前の楽章の**終わりの状態**から溶かす。
  // これで作品全体が、切れ目のない一本の軌跡になる。
  let u = 1;
  if (i > 0 && m.morph > 0 && local < m.morph) {
    const prev = ms[i - 1];
    u = smooth(local / m.morph);
    params = lerpSet(prev.paramsEnd, params, u);
    cam    = lerpSet(prev.camEnd,    cam,    u);
    audio  = lerpSet(prev.audioEnd,  audio,  u);
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
    // 動：何が動いているか。**遅さは法だが、停滞は法ではない。**
    // 視点が這うだけで場が止まっていると、絵は静止画に見える（実際に見えた）。
    const mv = motionScore(m);
    if (mv < LAWS.minMotion) {
      bad.push(`${at}: 動 — 運動源が足りない（${mv.toFixed(2)} < ${LAWS.minMotion}）。場が止まっていると静止画に見える`);
    }
    // 闇
    if (m.params.exposure > LAWS.maxExposure) bad.push(`${at}: 闇 — 露出 ${m.params.exposure} が上限 ${LAWS.maxExposure} を超える`);
    if (m.params.vignette < 0.4) bad.push(`${at}: 闇 — 周辺の落ち ${m.params.vignette} が浅い`);
    // 異：発光する層が閾値より上にあること。
    // 下にあると場の全体が光って、膜ではなく霧になる（＝また雲に見える）
    if (m.params.emitShell <= m.params.thresh) {
      bad.push(`${at}: 異 — 光る層 ${m.params.emitShell} が閾値 ${m.params.thresh} より下。物質全体が光って霧になる`);
    }
    // 異：同じ絵の中に違う色相が2つあること（1色だと必ず自然物に見える）
    const hueGap = colorGap(m.params.emitA, m.params.emitB);
    if (hueGap < LAWS.minColorGap) {
      bad.push(`${at}: 異 — 2色が近すぎる（隔たり ${hueGap.toFixed(2)}）。単色は自然物に見える`);
    }
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

  // 種
  const again = composeWork(work.seed);
  if (JSON.stringify(again) !== JSON.stringify(work)) bad.push(`${work.id}: 種 — 同じ種から同じ譜が出ない（決定性が壊れている）`);

  return bad;
}
