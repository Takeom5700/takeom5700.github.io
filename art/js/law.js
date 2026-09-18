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

uniform float uScale, uThresh, uDensity, uWarp, uWarpScale, uSlabSoft;
uniform float uWallMix, uWallTight, uWallX, uWallSide, uDust, uDetailFade, uDustFade;
uniform vec3  uOffset, uFlow;
uniform vec2  uSlab;
uniform vec3  uSunDir, uSunColor, uExt, uAlbedo, uAmbient, uSkyLo, uSkyHi;
uniform float uShadow, uPhaseG, uPowder, uSunGlow, uRidge, uRidgeMean, uRidgeGain;
uniform float uRiftAmp, uRiftTight, uRiftClear, uRiftWobble;
uniform vec3  uRiftColor;
uniform int   uRiftAxis;
uniform vec2  uRiftPos;
uniform float uStep0, uStepMul, uFar;
uniform int   uSteps;

out vec4 outColor;

const float PI4 = 12.56637061;
// 減衰の単位。uExt=1.0, 密度1.0 で「100 world unit で光学的厚み1」になる。
// ここを大きくすると数十unit先が不透明になり、奥行きも細部も出ない。
const float EXT_UNIT = 0.010;
${FIELD_PRELUDE}
// 実測した平均と散らばりで戻す。こうすると ridge を動かしても
// thresh の意味（どれだけの空間が物質になるか）が変わらない。
float fbm4r(vec4 n, float ridge){
  return (fbm4raw(n, ridge) - uRidgeMean) * uRidgeGain + 0.5;
}

// --- 場 -----------------------------------------------------------------
// 返す値はだいたい [0,1]。0.5 付近が「境界」になる
float coarse(vec3 p){ return fbm4r(texture(uNoise, p), uRidge); }

// 細部は2段。中間（襞）は遠くまで残し、最細（粒）は近くだけ。
// 最細を遠くまで出すと画素より細かくなって、砂嵐にしか見えなくなる。
// 近くだけに出すから「近くの粒と遠くの塊が同じ絵に入る」が成立する。
float fine(vec3 p, float mid, float ultra){
  float f  = (fbm4r(texture(uNoise, p*${MID_MUL}.0  + 0.173), uRidge) - 0.5) * 0.34 * mid;
  if (ultra > 0.02) f += (fbm4r(texture(uNoise, p*${ULTRA_MUL}.0 + 0.629), uRidge) - 0.5) * 0.28 * uDust * ultra;
  return f;
}

// 影のための密度。中間の1オクターブだけ足す。
// 影が滑らかだと、密度に細部があっても面の明るさが滑らかになり、
// 結局「綿」に見える。細かい自己遮蔽こそが雲を雲に見せている。
float fineMid(vec3 p, float detail){
  return (fbm4r(texture(uNoise, p*${MID_MUL}.0 + 0.173), uRidge) - 0.5) * 0.34 * detail;
}

// 物質が居られる場所。層（slab）と塊（wall）の掛け算だけで決まる。
// 壁は「面からの減衰」ではなく半空間。こうしないと視点が霧の内側に入って
// 全部溶ける。半空間を場が削るから、崖の面に襞ができる。
float shapeAt(vec3 wp){
  float sea = sstep(uSlab.y, uSlab.y - uSlabSoft, wp.y)
            * sstep(uSlab.x, uSlab.x + uSlabSoft, wp.y);
  float soft = 1.0 / max(uWallTight, 1e-5);
  float wall = sstep(uWallX, uWallX + uWallSide * soft, wp.x);
  return sea * mix(1.0, wall, uWallMix);
}

// 裂け目までの距離。off は軸に沿った蛇行（真っ直ぐな棒は世界の裂け目に見えない）
float riftDist(vec3 wp, vec2 off){
  if (uRiftAxis == 0) return length(vec2(wp.y - uRiftPos.x, wp.z - uRiftPos.y) - off);
  if (uRiftAxis == 1) return length(vec2(wp.x - uRiftPos.x, wp.z - uRiftPos.y) - off);
  return length(vec2(wp.x - uRiftPos.x, wp.y - uRiftPos.y) - off);
}
float riftDist(vec3 wp){ return riftDist(wp, vec2(0.0)); }

// 軸に沿った座標
float riftAlong(vec3 wp){ return uRiftAxis == 0 ? wp.x : uRiftAxis == 1 ? wp.y : wp.z; }

// 蛇行と明暗。テクスチャ1回で横ずれ(xy)と明るさ(z)を取る
vec4 riftJitter(vec3 wp){
  return texture(uNoise, vec3(0.31, riftAlong(wp) * uScale * 12.0, 0.73));
}

// 密度。ここがこの作品のすべて
float densityAt(vec3 wp, vec3 warp, float mid, float ultra){
  float sh = shapeAt(wp);
  if (sh < 0.002) return 0.0;
  vec3 q = wp * uScale + uOffset + uFlow * uTime + warp;
  float f = coarse(q);
  // 閾値からじゅうぶん下なら細部を引く意味がない（＝塊の縁だけ細かく見る）
  if (f > uThresh - 0.20 && mid > 0.02) f += fine(q, mid, ultra);
  float d = (f - uThresh) * uDensity * sh;
  if (uRiftAmp > 0.0) d *= 1.0 - uRiftClear * exp(-riftDist(wp, (riftJitter(wp).xy - 0.5) * uRiftWobble) * uRiftTight * 1.35);
  return max(d, 0.0);
}

float densityShadow(vec3 wp, vec3 warp, float detail){
  float sh = shapeAt(wp);
  if (sh < 0.002) return 0.0;
  vec3 q = wp * uScale + uOffset + uFlow * uTime + warp;
  float f = coarse(q);
  if (detail > 0.0) f += fineMid(q, detail);
  float d = (f - uThresh) * uDensity * sh;
  if (uRiftAmp > 0.0) d *= 1.0 - uRiftClear * exp(-riftDist(wp, (riftJitter(wp).xy - 0.5) * uRiftWobble) * uRiftTight * 1.35);
  return max(d, 0.0);
}

vec3 warpAt(vec3 wp){
  vec3 q = wp * uScale + uOffset;
  return (texture(uNoise, q * uWarpScale + 0.41).xyz * 2.0 - 1.0) * (uWarp * 0.05);
}

float hg(float mu, float g){
  float g2 = g * g;
  return (1.0 - g2) / (PI4 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

vec3 skyAt(vec3 rd){
  float h = clamp(rd.y * 2.2 + 0.34, 0.0, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, h);
  float mu = max(dot(rd, uSunDir), 0.0);
  c += uSunColor * uSunGlow * (pow(mu, 1400.0) * 0.85 + pow(mu, 26.0) * 0.034 + pow(mu, 5.0) * 0.0020);
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

  vec3 EXT = uExt * EXT_UNIT;
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, uPhaseG), hg(mu, -0.28), 0.22);
  float phaseWide = hg(mu, uPhaseG * 0.28);

  vec3 col = vec3(0.0);
  vec3 T = vec3(1.0);

  float so = hash12(gl_FragCoord.xy + vec2(uFrame * 7.13, uFrame * 3.71));
  float t = uStep0 * (0.2 + so);
  // 歩幅は等比で伸ばす。倍率は「歩数がいくつでも uFar に届く」ように
  // JS が解いてから渡してくる。だから歩数を落としても構図は変わらず、
  // 遠くだけが粗くなる（近くの細部は歩数に関係なく解ける）。
  float ds = uStep0;

  for (int i = 0; i < 256; i++){
    if (i >= uSteps || t > uFar) break;
    if (T.r + T.g + T.b < 0.012) break;

    vec3 p = ro + rd * t;
    float mid = uDetailFade / (uDetailFade + t);
    float ultra = uDustFade / (uDustFade + t);

    // 裂の芯は「物質が無くても見える光」なので、密度の判定より先に足す。
    // 中に入れると、芯は物質を払ってあるぶん一度も加算されず線が描かれない。
    float halo = 0.0;
    vec2 roff = vec2(0.0);
    if (uRiftAmp > 0.0){
      vec4 rj = riftJitter(p);
      roff = (rj.xy - 0.5) * uRiftWobble;
      float dr = riftDist(p, roff);
      // 線状の光源なので、照明は指数ではなく距離の逆数で落とす。
      // 指数だと数十unit先で真っ暗になり、裂が周りの世界を照らさない。
      halo = 1.0 / (1.0 + dr * uRiftTight * 3.0);
      float core = exp(-dr * uRiftTight * 5.5) * (0.34 + 1.25 * rj.z);
      col += T * uRiftColor * uRiftAmp * core * 0.040 * ds;
    }

    vec3 warp = warpAt(p);
    float d = densityAt(p, warp, mid, ultra);

    if (d > 0.0008){
      vec3 sigma = EXT * d;
      vec3 stepT = exp(-sigma * ds);

      // 太陽への遮蔽。歩幅を倍々に伸ばして 6歩で 1600unit 先まで見る。
      // ここが短いと、数百unit の塊でも「全面が明るい綿」になって
      // 立体に見えない。塊の大きさより長く見ることが要。
      float od = 0.0;
      if (uSunColor.r + uSunColor.g + uSunColor.b > 0.25){
        float lt = 6.0;
        for (int k = 0; k < 6; k++){
          float nx = lt * 2.55;
          od += densityShadow(p + uSunDir * lt, warp, k < 3 ? mid * 0.8 : 0.0) * (nx - lt);
          lt = nx;
        }
      }
      vec3 sunT = exp(-EXT * od * uShadow);
      float powder = 1.0 - exp(-d * uPowder);
      float skyAccess = clamp((p.y - uSlab.x) / max(uSlab.y - uSlab.x, 1.0), 0.0, 1.0);

      vec3 Lin = uSunColor * sunT * phase * powder
               + uSunColor * pow(sunT, vec3(0.30)) * phaseWide * 0.095
               + uAmbient * (0.30 + 0.70 * skyAccess);

      // 周りの物質を照らすぶん
      if (uRiftAmp > 0.0) Lin += uRiftColor * uRiftAmp * halo;

      col += T * Lin * uAlbedo * (vec3(1.0) - stepT);
      T *= stepT;
    }
    t += ds;
    ds *= uStepMul;
  }

  col += T * skyAt(rd);

#ifdef LDR
  col = col / (1.0 + col);
#endif
  outColor = vec4(col, 1.0);
}`;

// 蓄積。視点が遅いからこそ成立する。前のフレームに少しだけ混ぜることで
// 歩幅の縞と粒が消え、時間が画質になる（基軸「三・間」の副産物）
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
