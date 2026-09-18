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

const canvas = document.getElementById('stage');
const veil = document.getElementById('veil');
const hint = document.getElementById('hint');
const hud = document.getElementById('hud');
const q = new URLSearchParams(location.search);

const renderer = createRenderer(canvas, { readback: q.has('t') });
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

  // 裂の光源は「置いた」ものではなく、その楽章に入る時点の視点の前方に
  // 一度だけ打ち込まれる。以後は世界に固定される（追いかけてはこない）。
  const anchors = new Map();
  function anchorFor(w, mi) {
    const key = w.seed + ':' + mi;
    if (anchors.has(key)) return anchors.get(key);
    const m = w.movements[mi];
    const c = cameraAt(w, m.start);
    const rng = makeRng(w.seed * 7919 + mi * 104729);
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    // 前方に打つ距離と、中心からのずらし。
    // 遠すぎると見えず、横にずらしすぎると画角の外に出る。
    // 楽章のあいだ視点が近づいても画面から出ない値にしてある。
    const dist = 760 + rng() * 170;
    const side = (rng() < 0.5 ? -1 : 1) * (40 + rng() * 60);
    const a = {
      x: c.x + sy * dist + cy * side,
      y: c.y + 20 + rng() * 60,
      z: c.z - cy * dist + sy * side,
    };
    anchors.set(key, a);
    return a;
  }
  function riftPos(w, mi, axis) {
    const a = anchorFor(w, mi);
    return axis === 0 ? [a.y, a.z] : axis === 1 ? [a.x, a.z] : [a.x, a.y];
  }
  // 壁の面。視点が面の中に入ってしまわないよう、楽章に入る時点の視点の横に置く
  const walls = new Map();
  function wallXFor(w, mi) {
    const key = w.seed + ':' + mi;
    if (walls.has(key)) return walls.get(key);
    const m = w.movements[mi];
    const c = cameraAt(w, m.start);
    const rng = makeRng(w.seed * 15485863 + mi * 31);
    // 視線を回している側に置く（回していなければ左右どちらか）
    const side = m.cam.yawOffset !== 0 ? Math.sign(m.cam.yawOffset) : (rng() < 0.5 ? -1 : 1);
    const v = { x: c.x + side * (100 + rng() * 60), side };
    walls.set(key, v);
    return v;
  }
  // その効果を持っている楽章を探す（転換中は溶ける側の楽章のものを使う）
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
    anchors.clear();
    cam = makeCamera(); camT = 0; t = 0;
    renderer.reset();
  }

  function fit() {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }
  window.addEventListener('resize', fit);
  fit();

  function draw() {
    const r = resolve(work, t);
    if (r.params.riftAmp > 0.001) {
      r.riftPos = riftPos(work, owner(work, r.movement, 'riftAmp'), r.params.riftAxis | 0);
    }
    if (r.params.wallMix > 0.001) {
      const w = wallXFor(work, owner(work, r.movement, 'wallMix'));
      r.params.wallX = w.x; r.params.wallSide = w.side;
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
    document.getElementById('back').remove();   // 静止画に頁の部品を混ぜない
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
      // 視点は必ず固定歩幅で積む（でないと機械ごとに別の絵になる）
      let guard = 0;
      while (camT + CAM_DT <= t && guard++ < 60) {
        const rc = resolve(work, camT);
        stepCamera(cam, rc.cam, camT);
        camT += CAM_DT;
      }
      if (guard >= 60) camT = t;
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
