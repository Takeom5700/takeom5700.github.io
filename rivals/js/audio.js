// 効果音（WebAudio で合成。音声ファイルは持たない）
let ctx = null, enabled = true;

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { enabled = false; } }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function setSound(on) { enabled = on; }
export function soundOn() { return enabled; }

function tone(freq, dur, type = 'triangle', vol = 0.06, slide = 0) {
  if (!enabled) return;
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur);
}
function noise(dur = 0.16, vol = 0.05) {
  if (!enabled) return;
  const a = ac(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; g.gain.value = vol;
  src.connect(g); g.connect(a.destination); src.start();
}

export const SFX = {
  tap()      { tone(620, 0.05, 'square', 0.03); },
  play()     { tone(430, 0.09, 'triangle', 0.05); tone(650, 0.09, 'triangle', 0.035); },
  summon()   { tone(330, 0.1, 'sawtooth', 0.04, 260); },
  attack()   { noise(0.12, 0.06); tone(180, 0.1, 'square', 0.04, -90); },
  hit()      { noise(0.1, 0.05); },
  death()    { tone(220, 0.26, 'sawtooth', 0.05, -160); },
  heal()     { tone(720, 0.12, 'sine', 0.045, 260); },
  tension()  { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.05), i * 70)); },
  turn()     { tone(520, 0.1, 'sine', 0.04); setTimeout(() => tone(690, 0.13, 'sine', 0.04), 90); },
  win()      { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.06), i * 110)); },
  lose()     { [440, 392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.06), i * 150)); },
};
