// 進行。譜を時計で解いて、描き手と音に渡す。
// ここには美の判断を置かない（全部 compose.js と law.js にある）。
//
// 作品は終わらない。一つ終われば次の種の作品が始まる。
// それが基軸「五・種」の運用で、この頁は「一本の映像」ではなく
// 同じ法から世界が出てくる場所として置いてある。

import { composeWork, resolve, makeCamera, stepCamera, cameraAt, CAM_DT, REST, checkWork } from './compose.js';
import { createRenderer } from './render.js';
import { createDrone } from './drone.js';
import { makeRng } from './rng.js';

// AudioBuffer を 16bit PCM の WAV（バイト列）にする。
// ここで作っておけば、外の道具は ffmpeg の音声encoderを要らない。
function wavBytes(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const dv = new DataView(bytes.buffer);
  const tag = (o, str) => { for (let i = 0; i < str.length; i++) bytes[o + i] = str.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); tag(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  tag(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const src = [];
  for (let c = 0; c < ch; c++) src.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++, o += 2) {
      const v = Math.max(-1, Math.min(1, src[c][i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  }
  return bytes;
}

// 大きいものは配ってくれている所へそのまま POST する。
// CDP 経由で base64 文字列として返すと、1MB を超えたあたりで
// 受け渡しが詰まって永久に返ってこなくなる（実際に詰まった）。
async function sink(blob) {
  const res = await fetch('/__sink', { method: 'POST', body: blob });
  if (!res.ok) throw new Error('受け取り先が ' + res.status);
  return blob.size;
}

const canvas = document.getElementById('stage');
const veil = document.getElementById('veil');
const hint = document.getElementById('hint');
const hud = document.getElementById('hud');
const q = new URLSearchParams(location.search);

const renderer = createRenderer(canvas, { readback: q.has('t') || q.has('export') });
if (!renderer) {
  hint.innerHTML = 'この端末では WebGL2 が使えないため、映像を出せません。<br>' +
    '<span class="sub">別のブラウザか端末で開いてください</span>';
  hint.classList.add('shown');
} else {
  start();
}

function start() {
  const stillT = q.has('t') ? parseFloat(q.get('t')) : null;
  const still = stillT !== null;
  let seed = q.has('seed') ? (parseInt(q.get('seed'), 10) | 0) : 0;
  const showHud = q.get('hud') === '1';

  let work = composeWork(seed);
  const bad = checkWork(work);
  if (bad.length) console.error('基軸違反:\n' + bad.join('\n'));
  renderer.setNoise(work.seed);

  // 事象（膨らむ膜・衝撃波）の中心は「置いた」ものではなく、
  // その楽章に入る時点の視点から一度だけ打ち込まれる。
  // 世界の原点に固定すると、視点が遠くへ行ったあと事象が画面に入らない。
  const centers = new Map();
  function eventCenter(w, mi) {
    const key = w.seed + ':' + mi;
    if (centers.has(key)) return centers.get(key);
    const m = w.movements[mi];
    const c = cameraAt(w, m.start);
    const rng = makeRng(w.seed * 7919 + mi * 104729);
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const dist = 120 + rng() * 120;
    const side = (rng() < 0.5 ? -1 : 1) * (30 + rng() * 70);
    const v = [
      c.x + sy * dist + cy * side,
      c.y + (rng() * 2 - 1) * 60,
      c.z - cy * dist + sy * side,
    ];
    centers.set(key, v);
    return v;
  }

  // その事象を持っている楽章を探す（転換中は溶ける側の楽章のものを使う）。
  // ここを現在の楽章にすると、爆から次へ溶けるあいだに膜の半径が
  // 打ち直されて、半径が飛ぶ＝カットになる。
  function owner(w, mi, key) {
    if (w.movements[mi].params[key] > 0) return mi;
    if (mi > 0 && w.movements[mi - 1].params[key] > 0) return mi - 1;
    for (let i = 0; i < w.movements.length; i++) if (w.movements[i].params[key] > 0) return i;
    return mi;
  }

  let cam = makeCamera();
  let camT = 0, t = 0, rest = 0;
  let playing = false, paused = false;
  let drone = null;
  let last = 0;

  function seek(to) {
    t = Math.max(0, Math.min(to, work.total));
    cam = cameraAt(work, t);
    camT = Math.floor(t / CAM_DT) * CAM_DT;
    renderer.reset();
  }

  function nextWork() {
    seed += 1;
    work = composeWork(seed);
    const v = checkWork(work);
    if (v.length) console.error('基軸違反:\n' + v.join('\n'));
    renderer.setNoise(work.seed);
    centers.clear();
    cam = makeCamera(); camT = 0; t = 0;
    renderer.reset();
  }

  // 画面の形に関わらず 16:9 に収める。
  // 画角を画面に合わせて広げると、端末ごとに別の構図になってしまう。
  // 枠を固定しておけば、縦持ちでも横長のモニタでも、
  // 書き出した静止画とまったく同じ絵が出る。
  const ASPECT = 16 / 9;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(64, Math.round(Math.min(vw, vh * ASPECT)));
    const h = Math.max(36, Math.round(Math.min(vh, vw / ASPECT)));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.resize(w, h, window.devicePixelRatio || 1);
  }
  window.addEventListener('resize', fit);
  fit();

  // 視点は必ず固定歩幅で積む（でないと機械ごとに別の絵になる）。
  // 積みきれたら true。再生では歩数に上限を置き、書き出しでは置かない。
  function advanceCamera(target, maxSteps) {
    let n = 0;
    while (camT + CAM_DT <= target) {
      if (maxSteps && n++ >= maxSteps) return false;
      const rc = resolve(work, camT);
      stepCamera(cam, rc.cam, camT);
      camT += CAM_DT;
    }
    return true;
  }

  function draw() {
    const r = resolve(work, t);
    // 事象の時刻と中心。膜も衝撃波も「楽章に入ってからの秒数」で動く
    const ev = r.params.shell > 0.001 ? 'shell' : r.params.frontAmp > 0.001 ? 'frontAmp' : null;
    if (ev) {
      const mi = owner(work, r.movement, ev);
      r.eventC = eventCenter(work, mi);
      r.local = t - work.movements[mi].start;
    } else {
      r.local = r.local === undefined ? t - work.movements[r.movement].start : r.local;
    }
    if (still) applyOver(r.params);
    const roll = r.cam.rollAmp * Math.sin(2 * Math.PI * r.cam.rollFreq * t);
    r.time = t;
    r.cam = Object.assign({}, cam, {
      fov: r.cam.fov, roll,
      yawOffset: r.cam.yawOffset, pitchOffset: r.cam.pitchOffset,
    });
    renderer.frame(r);
    if (drone) drone.update(resolve(work, t).audio, r.env, t);
    if (showHud && hud.isConnected) {
      hud.textContent = `${work.title}｜${r.name} ${r.movement + 1}/${work.movements.length}` +
        `｜${t.toFixed(0)}/${work.total}s｜${renderer.st.iw}×${renderer.st.ih} ` +
        `(${(renderer.st.scale * 100) | 0}%) ${renderer.st.steps}歩 ${renderer.st.fps.toFixed(0)}fps`;
    }
  }

  // 検証用の上書き（?p=thresh:0.5,dust:0）。
  // 作品の一部ではなく、値を詰めるための道具。静止画モードでしか効かない。
  const over = {};
  if (q.has('p')) {
    for (const kv of q.get('p').split(',')) {
      const [k, v] = kv.split(':');
      if (k && v !== undefined) over[k.trim()] = v.split('|').map(Number);
    }
  }
  function applyOver(pr) {
    for (const k in over) {
      if (!(k in pr)) { console.warn('知らないパラメータ: ' + k); continue; }
      pr[k] = Array.isArray(pr[k]) ? over[k] : over[k][0];
    }
  }

  // ---- 静止画（書き出しと検証） ----
  if (still) {
    const frames = q.has('frames') ? parseInt(q.get('frames'), 10) : 96;
    const steps = q.has('steps') ? parseInt(q.get('steps'), 10) : 176;
    if (q.has('w')) {
      const w = parseInt(q.get('w'), 10), h = parseInt(q.get('h') || '', 10) || Math.round(w * 9 / 16);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      renderer.resize(w, h, 1);
    }
    renderer.setStill(true, steps);
    veil.style.opacity = '0';
    hint.remove();
    document.getElementById('back')?.remove();  // 静止画に頁の部品を混ぜない
    hud.remove();
    seek(stillT);
    // 蓄積を同期で焼き切る。読み込み完了より前に絵を置いておきたいので
    // requestAnimationFrame は使わない（書き出しの道具が DOM を読む）
    for (let n = 0; n < frames; n++) draw();
    // キャンバスそのものを渡す。窓の大きさや頁の余白が混ざらない
    const st = document.createElement('div');
    st.id = 'stat';
    st.textContent = renderer.st.ridgeStats || '';
    document.body.appendChild(st);
    const el = document.createElement('div');
    el.id = 'png';
    el.textContent = canvas.toDataURL('image/png');
    document.body.appendChild(el);
    document.title = 'ready';
    window.__artStill = 'ready';
    return;
  }

  // ---- 進行 ----
  // 1フレーム分だけ進める。再生（rAF）と検証（同期）で同じここを通す。
  function tick(dt) {
    if (rest > 0) {
      rest -= dt;
      if (rest <= 0) nextWork();
      const gl = renderer.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (drone) drone.update(resolve(work, work.total).audio, 0, t);
      return;
    }
    if (!paused) {
      t += dt;
      // 追いつけない機械では時計に合わせる（再生は止めない）
      if (!advanceCamera(t, 60)) camT = t;
      if (t >= work.total) { rest = REST; return; }
    }
    draw();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000 || 0, 0.5);
    last = now;
    if (playing) tick(dt);
  }

  function begin() {
    if (playing) return;
    playing = true;
    hint.classList.remove('shown');
    veil.style.opacity = '0';
    document.body.classList.add('running');
    try { drone = createDrone(work.seed); if (drone) drone.resume(); } catch (e) { drone = null; }
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // ---- 書き出し（tools/export.mjs が使う） ----
  // 頁を1回だけ開いて、外から時刻を指定して1枚ずつ焼かせる。
  // 毎フレーム別々にブラウザを立ち上げるより、場のテクスチャを
  // 作り直さずに済むぶん速い。絵は静止画モードと同じ品質。
  if (q.get('export') === '1') {
    const frames = parseInt(q.get('frames') || '', 10) || 20;
    const steps = parseInt(q.get('steps') || '', 10) || 176;
    // シャッター時間（秒）。24fps の半分が既定（実写の 180度シャッター相当）
    const shutter = parseFloat(q.get('shutter') || '') || 1 / 48;
    const w = parseInt(q.get('w') || '', 10) || 1920;
    const h = parseInt(q.get('h') || '', 10) || Math.round(w * 9 / 16);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    window.removeEventListener('resize', fit);
    renderer.resize(w, h, 1);
    renderer.setStill(true, steps);
    veil.style.opacity = '0';
    hint.remove();
    document.getElementById('back')?.remove();
    hud.remove();

    window.__mumei = {
      meta: {
        title: work.title, seed: work.seed, total: work.total,
        movements: work.movements.map((m) => ({ name: m.name, start: m.start, dur: m.dur })),
        size: [w, h], frames, steps,
      },
      // 時刻 t の1枚を焼く。前に進むだけなら視点を積み直さない。
      //
      // 蓄積の各枚を**シャッター時間の中で少しずつ違う時刻**にする。
      // 全部を同じ時刻で積むと、1枚は綺麗だが残像がゼロになり、
      // 24fps で並べたときに世界の速い運動がカクつく（ストロボになる）。
      // 実写のシャッターと同じ量だけ時間を開くと、適量のモーションブラーが付く。
      frame(to) {
        if (to < camT) { cam = cameraAt(work, to); camT = Math.floor(to / CAM_DT) * CAM_DT; }
        else advanceCamera(to, 0);
        renderer.reset();
        for (let i = 0; i < frames; i++) {
          t = to + (frames > 1 ? (i / frames) * shutter : 0);
          draw();
        }
        t = to;
        return true;
      },
      png(mime, quality) { return canvas.toDataURL(mime || 'image/png', quality); },
      // 1枚焼いて、そのまま外へ送る（base64 を通さない）
      async push(to, mime, quality) {
        this.frame(to);
        const blob = await new Promise((r) => canvas.toBlob(r, mime || 'image/png', quality));
        return sink(blob);
      },
      // 音を from〜to 秒ぶんまとめて焼く。譜が同じなら必ず同じ音になる。
      // 位相を繋ぐため、途中で切らずに一度に焼いて頁の側に置く。
      async audio(from, to, rate) {
        const sr = rate || 48000;
        const dur = Math.max(0.05, to - from);
        const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OC) return null;
        const oc = new OC(2, Math.ceil(sr * dur), sr);
        const d = createDrone(work.seed, oc);
        if (!d) return null;
        // この間隔で予約する。持続音で、譜の変化も十数秒かけて溶けるので
        // 2秒刻みで足りる（追従の時定数が0.6〜1.6秒あるので段は聞こえない）。
        // 細かくしても音はほぼ変わらず、予約イベントだけ増える
        // （8分半なら 6千件 と 5万件 の差になる）。
        const STEP = parseFloat(q.get('astep') || '') || 2.0;
        for (let x = 0; x <= dur; x += STEP) {
          const r = resolve(work, Math.min(from + x, work.total));
          d.update(r.audio, r.env, from + x, x, x === 0);
        }
        const buf = await oc.startRendering();
        const bytes = wavBytes(buf);
        await sink(new Blob([bytes], { type: 'audio/wav' }));
        return { bytes: bytes.length, seconds: buf.length / sr, rate: sr, channels: buf.numberOfChannels };
      },
    };
    return;
  }

  // 検証用: ?auto=1 で一触りを待たずに始める。
  // 音は端末の方針で鳴らないことがある（作品としては一触りで始まる）。
  if (q.get('auto') === '1') setTimeout(begin, 30);

  // 検証用: ?run=N&dt=S で、再生の中身を同期で N 回進める。
  // 読み込み完了より前に済ませて、状態を DOM に置く（道具が読む）。
  // requestAnimationFrame に依存せず、進行・視点の積み・音の更新まで通る。
  if (q.has('run')) {
    const n = parseInt(q.get('run'), 10) || 60;
    const dt = parseFloat(q.get('dt') || '') || 1 / 30;
    if (q.has('from')) seek(parseFloat(q.get('from')));
    playing = true;
    veil.style.opacity = '0';
    hint.remove();
    for (let i = 0; i < n; i++) tick(dt);
    const el = document.createElement('div');
    el.id = 'ran';
    el.textContent = JSON.stringify({
      進めた回数: n, 時刻: +t.toFixed(2), 作品: work.title, 種: work.seed,
      楽章: resolve(work, Math.min(t, work.total - 0.01)).name,
      視点: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)],
      視点の歩数: cam.steps, 無: +rest.toFixed(2),
      内部解像度: [renderer.st.iw, renderer.st.ih], 歩数: renderer.st.steps,
      場の統計: renderer.st.ridgeStats,
    });
    document.body.appendChild(el);
    return;
  }

  hint.classList.add('shown');
  const kick = (e) => {
    if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
    begin();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);

  // 操作は作品の一部ではない。だから何も画面に出していない（README に書いてある）
  window.addEventListener('keydown', (e) => {
    if (!playing) return;
    if (e.key >= '1' && e.key <= '9') {
      const i = parseInt(e.key, 10) - 1;
      if (i < work.movements.length) { seek(work.movements[i].start); if (drone) drone.resume(); }
    } else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } else if (e.key === 'm' || e.key === 'M') { if (drone) drone.toggleMute(); }
    else if (e.key === 'n' || e.key === 'N') { nextWork(); }
    else if (e.key === 'h' || e.key === 'H') { hud.classList.toggle('shown'); }
    else if (e.key === 'ArrowRight') { seek(t + 30); }
    else if (e.key === 'ArrowLeft') { seek(t - 30); }
  });
  if (showHud) hud.classList.add('shown');

  // 指を止めたら矢印も消す
  let idle = null;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add('idle'), 2200);
  };
  window.addEventListener('pointermove', wake);
  wake();
}
