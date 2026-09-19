// 進行。譜を時計で引いて、映写と音に渡す。
// ここには美の判断を置かない（全部 score.js / motif.js / paint.js にある）。
//
// 作品は終わらない。一つ終われば次の種の作品が始まる。
//
// 第一版から変わった一番大きいところ: **絵は時刻だけで決まる。**
// 視点を積み上げる状態が無くなったので、どこへ飛んでも同じ絵が出る。
// おかげで書き出しは「時刻を渡して1枚もらう」だけになった。

import { composeWork, checkWork, shotAt, REST } from './score.js';
import { createFilm, STAGE } from './film.js';
import { createSound } from './sound.js';
import { composeMusic } from './music.js';
import { NAMES } from './motif.js';

// AudioBuffer を 16bit PCM の WAV にする（外の道具に音声encoderを要らせない）
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

// 大きいものは配っている所へそのまま POST する。
// CDP 経由で base64 にすると 1MB あたりで詰まって永久に返ってこない。
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

const film = createFilm(canvas);
if (!film) {
  hint.innerHTML = 'この端末では canvas が使えないため、映像を出せません。';
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
  let music = composeMusic(work);
  const bad = checkWork(work);
  if (bad.length) console.error('基軸違反:\n' + bad.join('\n'));

  let t = 0, rest = 0;
  let playing = false, paused = false;
  let snd = null, sndT0 = 0, sndIdx = 0;
  let last = 0;

  // 画面の形に関わらず 16:9 に収める。余りは黒のまま捨てる。
  const ASPECT = STAGE.w / STAGE.h;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(64, Math.round(Math.min(vw, vh * ASPECT)));
    const h = Math.max(36, Math.round(Math.min(vh, vw / ASPECT)));
    film.resize(w, h, window.devicePixelRatio || 1);
  }
  // ?w=&h= があれば枠の大きさを固定する（録るときに窓の都合で大きさが
  // 変わらないようにするため。実測で 640×360 の窓から 299×168 が出た）。
  const fixedW = q.has('w') ? parseInt(q.get('w'), 10) : 0;
  if (fixedW > 0) {
    const fixedH = parseInt(q.get('h') || '', 10) || Math.round(fixedW * 9 / 16);
    film.resize(fixedW, fixedH, 1);
  } else {
    window.addEventListener('resize', fit);
    fit();
  }

  function seek(to) {
    t = Math.max(0, Math.min(to, work.total));
    sndT0 = snd ? snd.ctx.currentTime - t : 0;
    sndIdx = 0;
    while (sndIdx < music.notes.length && music.notes[sndIdx].t < t) sndIdx++;
  }
  function nextWork() {
    seed += 1;
    work = composeWork(seed);
    music = composeMusic(work);
    const v = checkWork(work);
    if (v.length) console.error('基軸違反:\n' + v.join('\n'));
    t = 0; sndIdx = 0;
    if (snd) sndT0 = snd.ctx.currentTime;
  }

  // 音は先読みして予約する。**音符は景ではなく、音の時計で並んでいる**
  // （だから長い景でも旋律は動き続ける）。
  function pumpSound() {
    if (!snd) return;
    const horizon = t + 1.5;
    while (sndIdx < music.notes.length && music.notes[sndIdx].t < horizon) {
      const n = music.notes[sndIdx++];
      const at = sndT0 + n.t;
      if (at > snd.ctx.currentTime - 0.05) snd.play(n, at);
    }
  }

  function drawAt(to) { film.draw(work, to); }

  // 音を from〜to 秒ぶん焼いて WAV のバイト列にする。
  // 書き出し（外の道具）と、頁からの保存の両方がここを通る。
  async function renderWav(from, to, rate) {
    const sr = rate || 48000;
    const dur = Math.max(0.05, to - from);
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return null;
    const oc = new OC(2, Math.ceil(sr * dur), sr);
    const sd = createSound(oc);
    if (!sd) return null;
    for (const n of music.notes) {
      if (n.t + n.d < from || n.t > to) continue;
      sd.play(n, Math.max(0, n.t - from));
    }
    return wavBytes(await oc.startRendering());
  }

  // ---- 保存（映像と音楽を別々に） ----
  // **絵と音を1本に混ぜない。** 音だけ差し替えたい・音だけ使いたい、が
  // できるようにしておく（依頼者の求め）。
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
  let saying = null;
  function say(msg, hold) {
    if (!hud.isConnected) return;
    hud.textContent = msg;
    hud.classList.add('shown');
    clearTimeout(saying);
    if (hold !== true) saying = setTimeout(() => { if (!showHud) hud.classList.remove('shown'); }, 4000);
  }
  const stem = () => '無銘-' + String(((work.seed % 1000) + 1000) % 1000).padStart(3, '0');

  let busy = false;
  async function saveMusic() {
    if (busy) return;
    busy = true;
    say('音楽を書き出しています…（1分ほどかかります）', true);
    try {
      const bytes = await renderWav(0, work.total, 48000);
      if (!bytes) { say('この端末では音を書き出せません'); busy = false; return; }
      saveBlob(new Blob([bytes], { type: 'audio/wav' }), stem() + '-音楽.wav');
      say('音楽を保存しました（' + (bytes.length / 1e6).toFixed(0) + 'MB）');
    } catch (e) { say('音の書き出しに失敗しました'); }
    busy = false;
  }

  // 映像を録る。withAudio なら音楽も一緒に1本へ入れる。
  //   V … 映像＋音楽（本編1本）
  //   B … 映像だけ（音なし。あとで別の音を当てたいとき）
  //   S … 音楽だけ
  let rec = null, recDone = null;
  // 録っている途中でもう一度押したら、そこまでを保存して止める
  function stopFilm() {
    if (!rec) return false;
    try { rec.stop(); } catch (e) { rec = null; }
    return true;
  }
  function saveFilm(withAudio) {
    if (busy) return null;
    if (rec) { stopFilm(); return null; }
    if (!canvas.captureStream || !window.MediaRecorder) { say('この端末では映像を保存できません'); return null; }
    if (!playing) begin();
    const types = withAudio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) { say('この端末では映像を保存できません'); return null; }
    const tracks = canvas.captureStream(30).getVideoTracks();
    let withSound = false;
    if (withAudio && snd && snd.stream) {
      const as = snd.stream();
      if (as && as.getAudioTracks().length) { tracks.push(as.getAudioTracks()[0]); withSound = true; }
    }
    const chunks = [];
    try {
      // 面で描いた絵はよく縮むので、画素数から見積もる。
      // ?vbr= で明示もできる（道具から大きさを詰めるため）。
      const vbr = parseInt(q.get('vbr') || '', 10)
        || Math.max(2e6, Math.round(film.st.w * film.st.h * 2.4));
      rec = new MediaRecorder(new MediaStream(tracks), {
        mimeType: mime, videoBitsPerSecond: vbr, audioBitsPerSecond: 192e3,
      });
    } catch (e) { say('この端末では映像を保存できません'); rec = null; return null; }
    const name = stem() + (withSound ? '.webm' : '-映像.webm');
    const done = new Promise((ok) => { recDone = ok; });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      saveBlob(blob, name);
      say(withSound ? '映像（音楽入り）を保存しました' : '映像を保存しました（音なし。S で音楽を別に保存できます）');
      rec = null;
      if (recDone) { recDone(blob); recDone = null; }
    };
    seek(0);
    paused = false;
    rec.start(2000);
    say(withSound ? '映像と音楽を記録しています… 0%' : '映像を記録しています… 0%', true);
    return done;
  }

  // ---- 静止画（検証・サムネイル） ----
  if (still) {
    if (q.has('w')) {
      const w = parseInt(q.get('w'), 10), h = parseInt(q.get('h') || '', 10) || Math.round(w * 9 / 16);
      film.resize(w, h, 1);
    }
    veil.style.opacity = '0';
    hint.remove();
    document.getElementById('back')?.remove();
    hud.remove();
    drawAt(stillT);
    const el = document.createElement('div');
    el.id = 'png';
    el.textContent = canvas.toDataURL('image/png');
    document.body.appendChild(el);
    document.title = 'ready';
    window.__artStill = 'ready';
    return;
  }

  // ---- 書き出し（tools/export.mjs が使う） ----
  if (q.get('export') === '1') {
    const w = parseInt(q.get('w') || '', 10) || 1920;
    const h = parseInt(q.get('h') || '', 10) || Math.round(w * 9 / 16);
    window.removeEventListener('resize', fit);
    film.resize(w, h, 1);
    veil.style.opacity = '0';
    hint.remove();
    document.getElementById('back')?.remove();
    hud.remove();

    window.__mumei = {
      meta: {
        title: work.title, seed: work.seed, total: work.total,
        movements: work.movements.map((m) => ({ name: m.name, start: m.start, dur: m.dur, shots: m.shots.length })),
        shots: work.shots.length, size: [w, h], frames: 1, steps: 0,
      },
      // 1枚焼く。状態を持たないので、どの時刻でも同じ値段で出せる。
      // **蓄積（モーションブラー）はしない。** コマ打ちの絵にブラーを足すと
      // 早期アニメーションの呼吸が消えて、ただの CG になる。
      frame(to) { drawAt(to); return true; },
      png(mime, quality) { return canvas.toDataURL(mime || 'image/png', quality); },
      // 譜の中身（下見の道具が、どの時刻を見るか決めるのに使う）
      list() {
        return work.shots.map((s) => ({
          start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), name: NAMES[s.m],
          m: s.m, fps: s.fps, hand: s.hand, pal: s.pal, inv: s.inv ? 1 : 0,
          n: s.n, odd: s.odd ? 1 : 0, empty: s.empty, flash: s.flash, mv: s.mv,
          sec: s.sec, th: s.th, w: s.w, recall: s.recall ? 1 : 0,
          ev: s.ev, evAt: s.evAt, p0: s.p0, p1: s.p1,
        }));
      },
      async push(to, mime, quality) {
        drawAt(to);
        return this.send(mime, quality);
      },
      async send(mime, quality) {
        const blob = await new Promise((r) => canvas.toBlob(r, mime || 'image/png', quality));
        return sink(blob);
      },
      // 図を1つだけ、決めた条件で描く。**作品の一部ではなく、形を詰めるための道具**
      // （tools/sheet.mjs が使う）。譜を通さないので、ここで何を描いても
      // 本編には出ない。
      demo(m, p, over) {
        const sh = Object.assign({
          id: 3, m, dur: 6, start: 0, n: 4, hand: 0, pal: 0, inv: false,
          gk: 0, gx: 0.5, gy: 0.55, ga: 0.7, gn: 3, g2: true,
          ox: 0.12, oy: -0.08, k1: 0.5, k2: 0.5, k3: 0.45, odd: true,
          fps: 12, boil: 1, grain: 0.18, mv: 0, mvA: 0.5, flash: 0,
          hang: 0.6, hgap: 0.5, empty: 0,
          au: { hit: 0, root: 0, chord: 0, level: 1, silent: 0 },
        }, over || {});
        film.drawShot(sh, p * sh.dur);
        return true;
      },
      // 音を from〜to 秒ぶんまとめて焼く。譜が同じなら必ず同じ音になる。
      async audio(from, to, rate) {
        const sr = rate || 48000;
        const bytes = await renderWav(from, to, sr);
        if (!bytes) return null;
        await sink(new Blob([bytes], { type: 'audio/wav' }));
        return { bytes: bytes.length, seconds: (bytes.length - 44) / 4 / sr, rate: sr, channels: 2 };
      },
    };
    return;
  }

  // ---- 進行 ----
  function tick(dt) {
    if (rest > 0) {
      rest -= dt;
      if (rest <= 0) nextWork();
      const c = film.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#000';
      c.fillRect(0, 0, film.st.w, film.st.h);
      return;
    }
    if (!paused) {
      t += dt;
      if (t >= work.total) {
        if (rec) { try { rec.stop(); } catch (e) { rec = null; } }
        rest = REST; return;
      }
    }
    if (rec) say('映像を記録しています… ' + Math.round((t / work.total) * 100) + '%', true);
    pumpSound();
    drawAt(t);
    if (showHud && hud.isConnected) {
      const sh = work.shots[film.st.shot];
      hud.textContent = `${work.title}｜${t.toFixed(1)}/${work.total}s｜景 ${film.st.shot + 1}/${work.shots.length}` +
        `｜${film.st.name} ${sh.dur.toFixed(2)}s ${sh.fps}コマ｜${film.st.ms.toFixed(1)}ms`;
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000 || 0, 0.25);
    last = now;
    if (playing) tick(dt);
  }

  function begin() {
    if (playing) return;
    playing = true;
    hint.classList.remove('shown');
    veil.style.opacity = '0';
    document.body.classList.add('running');
    try {
      snd = createSound();
      if (snd) { snd.resume(); sndT0 = snd.ctx.currentTime - t; sndIdx = 0; }
    } catch (e) { snd = null; }
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // 道具から録らせるための口（tools/record.mjs）。**作品の一部ではない。**
  // 頁の V / S と同じ道を通るので、頁で保存したものと中身が一致する。
  window.__save = {
    async film(withAudio) {
      window.__saveSunk = false;
      const blob = await saveFilm(withAudio !== false);
      if (!blob) { window.__saveSunk = 'fail'; return null; }
      await sink(blob);
      window.__saveSunk = true;
      return { bytes: blob.size, type: blob.type };
    },
    async music(rate) {
      const bytes = await renderWav(0, work.total, rate || 48000);
      if (!bytes) return null;
      await sink(new Blob([bytes], { type: 'audio/wav' }));
      return { bytes: bytes.length };
    },
    meta() { return { title: work.title, seed: work.seed, total: work.total }; },
    stop() { return stopFilm(); },
    done() { return !rec; },
  };

  // 検証用: ?auto=1 で一触りを待たずに始める
  if (q.get('auto') === '1') setTimeout(begin, 30);

  // 検証用: ?run=N&dt=S で再生の中身を同期で N 回進める
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
      景: film.st.shot, 図: film.st.name, 景の数: work.shots.length,
      一枚あたり: +film.st.ms.toFixed(2), 無: +rest.toFixed(2),
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

  window.addEventListener('keydown', (e) => {
    if (!playing) return;
    if (e.key >= '1' && e.key <= '9') {
      const i = parseInt(e.key, 10) - 1;
      if (i < work.movements.length) { seek(work.movements[i].start); if (snd) snd.resume(); }
    } else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } else if (e.key === 'm' || e.key === 'M') { if (snd) snd.toggleMute(); }
    else if (e.key === 'n' || e.key === 'N') { nextWork(); }
    else if (e.key === 'h' || e.key === 'H') { hud.classList.toggle('shown'); }
    else if (e.key === 's' || e.key === 'S') { saveMusic(); }
    else if (e.key === 'v' || e.key === 'V') { saveFilm(true); }
    else if (e.key === 'b' || e.key === 'B') { saveFilm(false); }
    else if (e.key === 'ArrowRight') { seek(t + 20); }
    else if (e.key === 'ArrowLeft') { seek(t - 20); }
  });
  if (showHud) hud.classList.add('shown');

  let idle = null;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add('idle'), 2200);
  };
  window.addEventListener('pointermove', wake);
  wake();
}
