// 法（law）。この世界のすべてはこの一つの式から出る。
//
// 形を一つも直接置いていない。雲も壁も海面も裂け目も、
// 「密度場 field() が閾値を超えた場所」でしかない。楽章はこの式の
// パラメータを差し替えるだけで、モデルも図形もキーフレームも無い。
// それが基軸「一・法」の意味。必然に見えるものだけが人を圧倒する。
//
// 場は3Dテクスチャ（周波数4/8/16/32 を RGBA に詰めたもの）1回のフェッチで
// 4オクターブ取れる。近景ではさらに2回フェッチして 256倍細かいところまで
// 出す。これが基軸「二・尺」——同じ絵の中に 2unit の粒と 1800unit の塊が
// 同居する（およそ3桁）。

// 場の作りは1か所で決める。ここの数と render.js のテクスチャ、
// compose.js の「尺」の検査が食い違うと、静かに壊れる。
export const NOISE_FREQ = [3, 6, 12, 24];  // RGBA に詰める周波数
export const MID_MUL = 8;                  // 中間オクターブの座標倍率
export const ULTRA_MUL = 61;               // 最細オクターブの座標倍率

// 場の散らばり（標準偏差）をどの種でもこの値に揃える。
// 低周波チャンネルの格子点は 3³=27 個しかないので、種によって
// 場の平均と散らばりが数%〜十数%ずれる。揃えないと、同じ thresh が
// 種によって「霧」にも「空」にもなり、譜が種をまたいで通用しない。
// 値は種0の ridge=0 での実測（0.1205）。ここを動かすと全楽章の
// thresh の意味が変わる。
export const FIELD_SD = 0.120;

// この場が表現できる一番細かい波長（world unit）。基軸「二・尺」の検査に使う
export function finestWavelength(scale) {
  return 1 / (NOISE_FREQ[3] * ULTRA_MUL * scale);
}

export const VERT = `#version 300 es
void main(){
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// 場の素。本体（FRAG_FIELD）と統計測定（FRAG_STAT）で共有する。
// 同じ式を二度書くと必ず片方だけ直して壊れる。
export const FIELD_PRELUDE = `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// GLSL の smoothstep は edge0 >= edge1 のとき仕様上未定義。
// 上下どちらの向きにも使いたいので自前で持つ
float sstep(float a, float b, float x){
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// 4オクターブ = テクスチャ1回。重みの和は 1
float fbm4(vec4 n){ return n.x*0.53333 + n.y*0.26667 + n.z*0.13333 + n.w*0.06667; }

// 稜線つき。丸い塊（ridge=0）から、削られた襞（ridge=1）まで連続に変える。
// 谷を折り返して二乗するので、尖りと平坦が同時に出る。
// ここは正規化していない生の値（平均も分散も ridge で動く）。
float fbm4raw(vec4 n, float ridge){
  if (ridge < 0.001) return fbm4(n);
  vec4 r = 1.0 - abs(n * 2.0 - 1.0);
  vec4 v = mix(n, r * r, ridge);
  return v.x*0.53333 + v.y*0.26667 + v.z*0.13333 + v.w*0.06667;
}
`;

// 場の平均と散らばりを測るための小さなシェーダ。
// ridge を上げると平均が 0.5 から大きくずれるので、実測して打ち消す。
// これをやらないと ridge を上げた瞬間に空間が物質で埋まる。
export const FRAG_STAT = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform float uRidge;
uniform vec2 uRes;
out vec4 outColor;
${FIELD_PRELUDE}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 p = vec3(uv * 13.37, hash12(gl_FragCoord.xy * 1.7) * 7.77);
  // 0..2 を 0..1 に収めて返す（8bit で読み戻すため。飽和させない）
  outColor = vec4(fbm4raw(texture(uNoise, p), uRidge) * 0.5, 0.0, 0.0, 1.0);
}`;

export const FRAG_FIELD = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform vec2  uRes;
uniform float uTime;
uniform float uFrame;
uniform sampler3D uNoise;

uniform vec3  uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalfFov;

// 場
uniform float uScale, uThresh, uDensity, uRidge, uRidgeMean, uRidgeGain;
uniform vec3  uOffset;
uniform float uWarp, uWarpScale, uWarpSpin;
uniform float uDust, uDetailFade, uDustFade, uRough;

// 場そのものの運動。カメラではなく世界が動く
uniform float uSpin;    // 全体の回転（rad/秒）
uniform float uShear;   // 内側ほど速い差動回転（ねじれ）
uniform float uBoil;    // 場の中身が入れ替わる速さ（沸き）

// 事象の中心。**その楽章に入る時点の視点から打つ**（main.js）。
// 世界の原点に固定すると、視点が遠くへ行ったあと事象が画面に入らない。
// 形（閉じ込め）。どれも自然界に対応物が無い
uniform float uShell, uShellR, uShellV, uShellW;
uniform float uLattice, uLatticeK, uLatticeW;
uniform float uTube, uTubeR, uTubeW;
// 大きな構図。**格子は周期的なので、そのままでは画面が均一な壁紙になる。**
// 低い周波数の場で格子を切り抜くと、巨大な空隙と塊ができて
// 図と地（見るものと背景）が生まれる。ここが無いと、どれだけ
// 細部を作り込んでも「同じ画面がずっと続く」絵になる（実際にそうなった）。
uniform float uMask, uMaskScale, uMaskT, uMaskW, uMaskDrift;

// 発光。光は外から来ない。物質が自分で光る
uniform float uEmit, uEmitShell, uEmitW, uScatter;
uniform vec3  uEmitA, uEmitB, uExt, uVoidTone;
uniform float uHueLo, uHueHi;

// 衝撃波
uniform vec3  uEventC, uFrontColor;
uniform float uFrontV, uFrontPeriod, uFrontW, uFrontAmp;
uniform float uLocal;   // 楽章に入ってからの秒数。事象の時刻はこれで決まる

// 行程
uniform float uStep0, uStepMul, uFar;
uniform int   uSteps;

out vec4 outColor;

// 減衰の単位。uExt=1.0, 密度1.0 で「100 world unit で光学的厚み1」になる
const float EXT_UNIT = 0.010;
// 発光の単位。**発光は歩むたびに足されるので、単位を入れないと必ず白飛びする。**
// uEmit=2.4 の膜（厚さ50unitほど）を通ると最終の色が 2 前後になる値。
const float EMIT_UNIT = 0.010;
${FIELD_PRELUDE}
// 実測した平均と散らばりで戻す。ridge と種を変えても thresh の意味が動かない
float fbm4r(vec4 n, float ridge){
  return (fbm4raw(n, ridge) - uRidgeMean) * uRidgeGain + 0.5;
}

float sq(float x){ return x * x; }
float med3(vec3 v){ return max(min(v.x, v.y), min(max(v.x, v.y), v.z)); }

// --- 場の座標 -----------------------------------------------------------
// ここに世界の運動が入る。カメラを動かすのではなく場を動かす。
// 視点が這うだけだと、絵は静止画に見える（実際に見えた）。
vec3 fieldCoord(vec3 wp){
  // z軸（＝進む向き）まわりの回転。内側ほど速くすると、ねじれが目に見える。
  // 管の軸・進行方向・ねじれの軸を全部 z に揃えてあるので、
  // 筒の中を進むと壁がねじれながら流れていく。
  float r = length(wp.xy);
  float a = uTime * (uSpin + uShear / (1.0 + r * 0.004));
  float ca = cos(a), sa = sin(a);
  vec3 p = vec3(ca * wp.x - sa * wp.y, sa * wp.x + ca * wp.y, wp.z);
  vec3 q = p * uScale + uOffset;
  q.z += uTime * uBoil;
  return q;
}

// 折り曲げ。標本を取る座標そのものを時間で回すので、
// 渦が平行移動するのではなく巻き替わる（＝沸く）。
vec3 warpAt(vec3 q){
  float a = uTime * uWarpSpin;
  float ca = cos(a), sa = sin(a);
  vec3 wq = vec3(ca * q.x - sa * q.y, sa * q.x + ca * q.y, q.z) * uWarpScale + 0.41;
  return (texture(uNoise, wq).xyz * 2.0 - 1.0) * (uWarp * 0.05);
}

// 場の値。**uRough を上げると高い周波数が支配する。**
// 低域が支配していると、膜が1〜2枚の大きな面になって画面を塞ぐ。
// 高域を上げると同じ膜が細かいレースに割れて、隙間から黒が見える。
// 全体の散らばりは norm で一定に保つので、thresh の意味は動かない。
float fieldAt(vec3 q, float mid, float ultra){
  float a = 0.34 * uRough * mid;
  float b = 0.28 * uRough * uDust * ultra;
  float v = fbm4r(texture(uNoise, q), uRidge) - 0.5;
  if (a > 0.004) v += (fbm4r(texture(uNoise, q*${MID_MUL}.0  + 0.173), uRidge) - 0.5) * a;
  if (b > 0.004) v += (fbm4r(texture(uNoise, q*${ULTRA_MUL}.0 + 0.629), uRidge) - 0.5) * b;
  return 0.5 + v * inversesqrt(1.0 + a * a + b * b);
}

// --- 物質が居られる場所 --------------------------------------------------
// 殻・格子・管。層と崖（＝地平線と風景）はもう無い。
// 重みは譜が溶かすので、格子から殻へ連続に変わる。
float confine(vec3 wp){
  float acc = 0.0, w = 0.0;
  if (uShell > 0.001){
    // 膨らむ膜。uShellV を入れると、殻そのものが広がっていく
    float d = abs(length(wp - uEventC) - (uShellR + uShellV * uLocal));
    acc += uShell * exp(-sq(d / uShellW));
    w += uShell;
  }
  if (uLattice > 0.001){
    // 格子は世界軸から傾けてある。軸に揃っていると、視線が回廊を
    // 真っ直ぐ見下ろす形になって中央対称の「消点」構図に固定され、
    // 画面の真ん中に水平の帯が出る（実際に出た）。
    // 三方向の周期のうち「2つが格子面に近い」ところ＝立方格子の稜
    vec3 lp = mat3(0.8138, -0.4698, 0.3420,
                   0.5000,  0.8660, 0.0000,
                  -0.2962,  0.1710, 0.9397) * wp;
    vec3 sn = abs(sin(lp * uLatticeK));
    acc += uLattice * sstep(1.0 - uLatticeW, 1.0, 1.0 - med3(sn));
    w += uLattice;
  }
  if (uTube > 0.001){
    // 軸は z（＝進む向き）。横の位置は事象の中心に合わせる。
    // 世界の原点に固定すると、視点が横へ流れたあと筒の壁の中に埋まる。
    float d = abs(length(wp.xy - uEventC.xy) - uTubeR);
    acc += uTube * exp(-sq(d / uTubeW));
    w += uTube;
  }
  float c = acc + max(1.0 - w, 0.0);

  if (uMask > 0.001){
    vec3 mq = wp * uMaskScale + vec3(0.77, 0.31, uMaskDrift * uTime);
    float mf = fbm4r(texture(uNoise, mq), 0.0);
    c *= mix(1.0, sstep(uMaskT - uMaskW, uMaskT + uMaskW, mf), uMask);
  }
  return c;
}

void main(){
  // 副画素の揺らぎ（R2列）。蓄積と合わせて解像を稼ぐ
  vec2 j = fract(vec2(0.7548776662, 0.5698402910) * uFrame) - 0.5;
  vec2 uv = (gl_FragCoord.xy + j) / uRes;
  vec2 ndc = uv * 2.0 - 1.0;
  ndc.x *= uRes.x / uRes.y;

  vec3 rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanHalfFov) + uCamUp * (ndc.y * uTanHalfFov));
  vec3 ro = uCamPos;

  vec3 col = vec3(0.0);
  vec3 T = vec3(1.0);

  float so = hash12(gl_FragCoord.xy + vec2(uFrame * 7.13, uFrame * 3.71));
  float t = uStep0 * (0.2 + so);
  float ds = uStep0;

  for (int i = 0; i < 256; i++){
    if (i >= uSteps || t > uFar) break;
    if (T.r + T.g + T.b < 0.010) break;

    vec3 p = ro + rd * t;
    float mid = uDetailFade / (uDetailFade + t);
    float ultra = uDustFade / (uDustFade + t);

    float conf = confine(p);
    if (conf > 0.002){
      vec3 q = fieldCoord(p);
      float f = fieldAt(q + warpAt(q), mid, ultra);

      // 発光は「場の値がある層を横切る場所」だけ。塊ではなく膜と繊維になる。
      // 太陽で照らすと必ず風景に見えるので、光は内側から出す。
      float dv = (f - uEmitShell) / uEmitW;
      float shellE = exp(-sq(dv));
      vec3 hue = mix(uEmitA, uEmitB, sstep(uHueLo, uHueHi, f));
      // 広がりの項は薄く。ここを厚くすると光が空間全体に溜まって
      // 膜ではなく乳白色の霧になる（実際にそうなった）。
      vec3 emit = hue * (shellE + 0.07 * exp(-sq(dv) * 0.30)) * uEmit * conf;

      // 衝撃波。高速で膨らむ球面が世界を走り抜ける。
      // **物質を照らす形にする。** 衝撃波それ自体が空隙で光ると、
      // 球面が巨大な立体角を覆って画面が白く潰れる（実際に潰れた）。
      // 物質に掛けるぶんには、空隙は黒のまま保たれ、
      // 「明るさの波が格子を走り抜ける」絵になる。
      // uFrontPeriod ごとに起き直すが、周期は30秒前後なので
      // 拍としては数えられない（禁「拍を作らない」は守っている）。
      if (uFrontAmp > 0.0){
        float ph = uFrontPeriod > 0.0 ? mod(uLocal, uFrontPeriod) : uLocal;
        float fd = (length(p - uEventC) - ph * uFrontV) / uFrontW;
        float b = exp(-sq(fd)) * conf;
        emit = emit * (1.0 + uFrontAmp * b) + uFrontColor * (uFrontAmp * b * 0.30);
      }

      col += T * emit * EMIT_UNIT * ds;

      float d = max(f - uThresh, 0.0) * uDensity * conf;
      if (d > 0.0001){
        vec3 stepT = exp(-uExt * EXT_UNIT * d * ds);
        col += T * emit * uScatter * d * EMIT_UNIT * ds;   // 物質が光を拾って散らす
        T *= stepT;
      }
    }
    t += ds;
    ds *= uStepMul;
  }

  col += T * uVoidTone;   // 背景は虚無。空も太陽も無い

#ifdef LDR
  col = col / (1.0 + col);
#endif
  outColor = vec4(col, 1.0);
}`;

export const FRAG_ACCUM = `#version 300 es
precision highp float;
uniform sampler2D uCur, uHist;
uniform vec2 uRes;
uniform float uMix;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uCur, uv).rgb;
  vec3 h = texture(uHist, uv).rgb;
  outColor = vec4(mix(h, c, uMix), 1.0);
}`;

// 整色。露出→ACES→周辺の落ち→粒子→8bitへ
export const FRAG_GRADE = `#version 300 es
precision highp float;
uniform sampler2D uHDR;
uniform vec2 uRes, uSrcRes;
uniform float uExposure, uVignette, uGrain, uEnv, uGrainSeed;
out vec4 outColor;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uHDR, uv).rgb;
#ifdef LDR
  c = c / max(1.0 - c, 0.0025);
#endif
  c *= uExposure * uEnv;

  float r = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  c *= mix(1.0, smoothstep(1.28, 0.20, r * 1.55), uVignette);

  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));

  float g = hash12(gl_FragCoord.xy + uGrainSeed) - 0.5;
  c += g * uGrain * (0.35 + 0.65 * (1.0 - dot(c, vec3(0.333))));
  outColor = vec4(max(c, 0.0), 1.0);
}`;
