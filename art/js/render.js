// 描き手（renderer）。何を美しいとするかの判断を持たない。
// 譜（compose.js）から来た数を法（law.js）に渡して焼くだけ。
//
// 三段:
//   1. 体積  … レイマーチ。内部解像度は負荷で自動に上下する
//   2. 蓄積  … 前フレームに少し混ぜる。遅い視点だから成立する画質稼ぎ
//   3. 整色  … 露出 → ACES → 周辺の落ち → 粒子
//
// 場のテクスチャ（96³ RGBA）は種から作る。RGBA に周波数 3/6/12/24 を
// 詰めてあるので、1回のフェッチで4オクターブ取れる。

import { VERT, FRAG_FIELD, FRAG_STAT, FRAG_ACCUM, FRAG_GRADE, NOISE_FREQ, FIELD_SD } from './law.js';
import { makeRng } from './rng.js';

const NOISE_N = 96;
const MAX_PIXELS = 1920 * 1080;

export function buildNoise(seed, N = NOISE_N) {
  const rng = makeRng((seed | 0) ^ 0x5bf03635);
  const data = new Uint8Array(N * N * N * 4);
  for (let c = 0; c < 4; c++) {
    const F = NOISE_FREQ[c];
    const lat = new Float32Array(F * F * F);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    // 軸ごとの重みを先に作る（内部ループから五次補間を追い出す）
    const i0 = new Int32Array(N), i1 = new Int32Array(N), wt = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = i * F / N, k = Math.floor(f);
      let t = f - k;
      wt[i] = t * t * t * (t * (t * 6 - 15) + 10);
      i0[i] = k % F; i1[i] = (k + 1) % F;
    }
    for (let z = 0; z < N; z++) {
      const z0 = i0[z] * F * F, z1 = i1[z] * F * F, tz = wt[z];
      for (let y = 0; y < N; y++) {
        const y0 = i0[y] * F, y1 = i1[y] * F, ty = wt[y];
        const b00 = z0 + y0, b01 = z0 + y1, b10 = z1 + y0, b11 = z1 + y1;
        let o = ((z * N + y) * N) * 4 + c;
        for (let x = 0; x < N; x++, o += 4) {
          const x0 = i0[x], x1 = i1[x], tx = wt[x];
          const a = lat[b00 + x0] + (lat[b00 + x1] - lat[b00 + x0]) * tx;
          const b = lat[b01 + x0] + (lat[b01 + x1] - lat[b01 + x0]) * tx;
          const cc = lat[b10 + x0] + (lat[b10 + x1] - lat[b10 + x0]) * tx;
          const d = lat[b11 + x0] + (lat[b11 + x1] - lat[b11 + x0]) * tx;
          const e = a + (b - a) * ty, f2 = cc + (d - cc) * ty;
          data[o] = (e + (f2 - e) * tz) * 255;
        }
      }
    }
  }
  return data;
}

// 歩数 N、初歩 s、到達距離 F から等比の倍率を解く。
// s*(r^N-1)/(r-1) = F を二分法で。歩数が変わっても届く距離は変わらない。
function solveStepMul(step0, steps, far) {
  const sum = (r) => {
    if (r <= 1.000001) return step0 * steps;
    const v = step0 * (Math.pow(r, steps) - 1) / (r - 1);
    return isFinite(v) ? v : 1e12;
  };
  if (sum(1) >= far) return 1;
  let lo = 1, hi = 1.6;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (sum(m) < far) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('シェーダの組み立てに失敗:\n' + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('連結に失敗: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export function createRenderer(canvas, opt = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false,
    // 書き出しのときだけ内容を保持する（再生では余分な複製になる）
    preserveDrawingBuffer: !!opt.readback,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  const pre = hasFloat ? '' : '#define LDR 1\n';
  const inject = (src) => src.replace(/^(#version 300 es\n)/, '$1' + pre);

  const field = program(gl, inject(FRAG_FIELD));
  const stat = program(gl, FRAG_STAT);
  const accum = program(gl, FRAG_ACCUM);
  const grade = program(gl, inject(FRAG_GRADE));

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // 場のテクスチャ
  const noiseTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, noiseTex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
  let noiseSeed = null;

  function setNoise(seed) {
    if (noiseSeed === seed) return;
    const data = buildNoise(seed);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, NOISE_N, NOISE_N, NOISE_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    noiseSeed = seed;
    measureRidge();
  }

  // ---- 稜線の正規化 ----
  // ridge を上げると場の平均と散らばりが動く。種を変えても動く
  // （低周波チャンネルの格子点が 27 個しかない）。放っておくと
  // thresh の意味が ridge と種で変わってしまう。
  // なので実際に場を焼いて読み戻し、平均と散らばりを測って打ち消す。
  // これで thresh は「平均 0.5・散らばり FIELD_SD の場に対する閾値」で固定される。
  const RIDGE_STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const ridgeMean = new Float32Array(RIDGE_STOPS.length).fill(0.5);
  const ridgeGain = new Float32Array(RIDGE_STOPS.length).fill(1);
  const ridgeSd = new Float32Array(RIDGE_STOPS.length).fill(1);
  const statTex = gl.createTexture();
  const statFb = gl.createFramebuffer();
  const STAT_N = 64;
  {
    gl.bindTexture(gl.TEXTURE_2D, statTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, STAT_N, STAT_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, statFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, statTex, 0);
  }

  function measureRidge() {
    const px = new Uint8Array(STAT_N * STAT_N * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, statFb);
    gl.viewport(0, 0, STAT_N, STAT_N);
    gl.useProgram(stat.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    if (stat.u.uNoise) gl.uniform1i(stat.u.uNoise, 0);
    U2(stat.u, 'uRes', [STAT_N, STAT_N]);
    for (let i = 0; i < RIDGE_STOPS.length; i++) {
      U(stat.u, 'uRidge', RIDGE_STOPS[i]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, STAT_N, STAT_N, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, sum2 = 0;
      const n = STAT_N * STAT_N;
      for (let k = 0; k < n; k++) { const v = px[k * 4] / 255 * 2; sum += v; sum2 += v * v; }
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(sum2 / n - mean * mean, 1e-9));
      ridgeMean[i] = mean;
      ridgeSd[i] = sd;
      // 種をまたいで同じ散らばりに揃える（そうしないと thresh の意味が種で変わる）
      ridgeGain[i] = FIELD_SD / sd;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    st.ridgeStats = RIDGE_STOPS.map((r, i) => `${r}:${ridgeMean[i].toFixed(3)}/${ridgeSd[i].toFixed(4)}`).join(' ');
  }

  function ridgeNorm(ridge) {
    const r = Math.max(0, Math.min(1, ridge)) * (RIDGE_STOPS.length - 1);
    const i = Math.min(Math.floor(r), RIDGE_STOPS.length - 2), f = r - i;
    return [
      ridgeMean[i] + (ridgeMean[i + 1] - ridgeMean[i]) * f,
      ridgeGain[i] + (ridgeGain[i + 1] - ridgeGain[i]) * f,
    ];
  }

  // 作業用のバッファ
  const fmt = hasFloat ? gl.RGBA16F : gl.RGBA8;
  const type = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  function makeTarget() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    return { tex, fb, w: 0, h: 0 };
  }
  const cur = makeTarget(), hist = [makeTarget(), makeTarget()];
  let histIdx = 0;

  function sizeTarget(t, w, h) {
    if (t.w === w && t.h === h) return;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    t.w = w; t.h = h;
  }

  const st = {
    scale: 0.72, steps: 88, iw: 0, ih: 0, accN: 0,
    ms: 16, fps: 0, still: false, quality: 'auto', dpr: 1,
  };
  let cssW = 0, cssH = 0;

  function resize(w, h, dpr) {
    cssW = Math.max(1, w | 0); cssH = Math.max(1, h | 0);
    st.dpr = Math.min(dpr || 1, 2);
    canvas.width = Math.round(cssW * st.dpr);
    canvas.height = Math.round(cssH * st.dpr);
    st.accN = 0;
  }

  function reset() { st.accN = 0; }

  function internalSize() {
    let w = Math.round(canvas.width * st.scale);
    let h = Math.round(canvas.height * st.scale);
    const pix = w * h;
    const cap = st.still ? MAX_PIXELS * 1.4 : MAX_PIXELS;
    if (pix > cap) { const k = Math.sqrt(cap / pix); w = Math.round(w * k); h = Math.round(h * k); }
    return [Math.max(8, w), Math.max(8, h)];
  }

  // 負荷に応じて内部解像度と歩数を動かす。絵の作りには一切触らない
  function adapt(ms) {
    if (st.quality === 'still') return;
    st.ms = st.ms * 0.88 + ms * 0.12;
    if (st.ms > 26 && st.scale > 0.34) { st.scale = Math.max(0.34, st.scale * 0.94); st.accN = 0; }
    else if (st.ms > 20 && st.steps > 52) { st.steps -= 2; }
    else if (st.ms < 11 && st.steps < 120) { st.steps += 1; }
    else if (st.ms < 12 && st.scale < 1.0) { st.scale = Math.min(1.0, st.scale * 1.02); st.accN = 0; }
    st.fps = 1000 / Math.max(st.ms, 0.001);
  }

  function setStill(on, steps) {
    st.still = !!on;
    st.quality = on ? 'still' : 'auto';
    if (on) { st.scale = 1.0; st.steps = steps || 176; st.accN = 0; }
  }

  var U = (u, name, v) => { if (u[name] !== undefined && u[name] !== null) gl.uniform1f(u[name], v); };
  var U3 = (u, name, v) => { if (u[name]) gl.uniform3f(u[name], v[0], v[1], v[2]); };
  var U2 = (u, name, v) => { if (u[name]) gl.uniform2f(u[name], v[0], v[1]); };

  // 視点の基底を作る
  function basis(cam) {
    const yaw = cam.yaw + (cam.yawOffset || 0);
    const pitch = cam.pitch + (cam.pitchOffset || 0);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = [sy * cp, sp, -cy * cp];
    let right = [cy, 0, sy];
    const roll = cam.roll || 0;
    let up = [-sy * sp, cp, cy * sp];
    if (roll !== 0) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const r2 = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
      const u2 = [-right[0] * sr + up[0] * cr, -right[1] * sr + up[1] * cr, -right[2] * sr + up[2] * cr];
      right = r2; up = u2;
    }
    return { fwd, right, up };
  }

  function frame(f) {
    const t0 = performance.now();
    const [iw, ih] = internalSize();
    if (iw !== st.iw || ih !== st.ih) { st.iw = iw; st.ih = ih; st.accN = 0; }
    sizeTarget(cur, iw, ih);
    sizeTarget(hist[0], iw, ih);
    sizeTarget(hist[1], iw, ih);

    const p = f.params, cam = f.cam;
    const b = basis(cam);

    // 1. 体積
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb);
    gl.viewport(0, 0, iw, ih);
    gl.useProgram(field.p);
    const u = field.u;
    U2(u, 'uRes', [iw, ih]);
    U(u, 'uTime', f.time);
    U(u, 'uFrame', st.accN);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    if (u.uNoise) gl.uniform1i(u.uNoise, 0);
    U3(u, 'uCamPos', [cam.x, cam.y, cam.z]);
    U3(u, 'uCamFwd', b.fwd); U3(u, 'uCamRight', b.right); U3(u, 'uCamUp', b.up);
    U(u, 'uTanHalfFov', Math.tan(cam.fov * Math.PI / 360));
    for (const k of ['scale', 'thresh', 'density', 'warp', 'warpScale', 'slabSoft', 'wallMix',
      'wallTight', 'wallX', 'wallSide', 'dust', 'detailFade', 'dustFade', 'shadow', 'phaseG', 'powder', 'sunGlow', 'ridge',
      'riftAmp', 'riftTight', 'riftClear', 'riftWobble', 'step0', 'far']) {
      U(u, 'u' + k[0].toUpperCase() + k.slice(1), p[k]);
    }
    for (const k of ['offset', 'flow', 'sunDir', 'sunColor', 'ext', 'albedo', 'ambient', 'skyLo', 'skyHi', 'riftColor']) {
      U3(u, 'u' + k[0].toUpperCase() + k.slice(1), p[k]);
    }
    U2(u, 'uSlab', p.slab);
    U2(u, 'uRiftPos', f.riftPos || [0, 0]);
    if (u.uRiftAxis) gl.uniform1i(u.uRiftAxis, p.riftAxis | 0);
    U(u, 'uStepMul', solveStepMul(p.step0, st.steps, p.far));
    const rn = ridgeNorm(p.ridge);
    U(u, 'uRidgeMean', rn[0]);
    U(u, 'uRidgeGain', rn[1]);
    if (u.uSteps) gl.uniform1i(u.uSteps, st.steps);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. 蓄積
    const dst = hist[histIdx ^ 1], src = hist[histIdx];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, iw, ih);
    gl.useProgram(accum.p);
    U2(accum.u, 'uRes', [iw, ih]);
    const w = st.accN === 0 ? 1 : (st.still ? 1 / (st.accN + 1) : Math.max(0.085, 1 / (st.accN + 1)));
    U(accum.u, 'uMix', w);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex);
    gl.uniform1i(accum.u.uCur, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(accum.u.uHist, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    histIdx ^= 1;

    // 3. 整色
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(grade.p);
    U2(grade.u, 'uRes', [canvas.width, canvas.height]);
    U2(grade.u, 'uSrcRes', [iw, ih]);
    U(grade.u, 'uExposure', p.exposure);
    U(grade.u, 'uVignette', p.vignette);
    U(grade.u, 'uGrain', p.grain);
    U(grade.u, 'uEnv', f.env);
    U(grade.u, 'uGrainSeed', st.still ? 11.0 : (st.accN % 64) * 13.7);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(grade.u.uHDR, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    st.accN++;
    if (!st.still) adapt(performance.now() - t0);
    return st;
  }

  return { gl, hasFloat, setNoise, resize, reset, frame, setStill, st, basis };
}
