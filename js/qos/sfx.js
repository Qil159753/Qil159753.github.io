// qOS sound: everything is synthesised with Web Audio, so there are no files to fetch.
// Muted until the visitor turns it on; the choice is remembered per browser.
let ctx = null, master = null, on = false;
try { on = localStorage.getItem('qos-sound') === 'on'; } catch (e) {}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.08, glide = 0, at = 0 } = {}) {
  if (!on || !ac()) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.05, hp = 2000, at = 0 } = {}) {
  if (!on || !ac()) return;
  const t = ctx.currentTime + at, n = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start(t);
}

// a continuous whine whose pitch follows wheel speed; level 0 fades it out
let mo = null;
function motor(level) {
  if (!on || !ac()) { if (mo) mo.g.gain.value = 0; return; }
  if (!mo) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(master); o.start(); o2.start();
    mo = { o, o2, g };
  }
  const t = ctx.currentTime, l = Math.min(1, Math.abs(level));
  mo.o.frequency.setTargetAtTime(60 + l * 260, t, 0.05);
  mo.o2.frequency.setTargetAtTime(121 + l * 520, t, 0.05);
  mo.g.gain.setTargetAtTime(l * 0.03, t, 0.08);
}

export const sfx = {
  get on() { return on; },
  set(v) {
    on = !!v;
    try { localStorage.setItem('qos-sound', on ? 'on' : 'off'); } catch (e) {}
    if (on) { ac(); tone(880, 0.08, { vol: 0.05 }); } else if (mo) mo.g.gain.value = 0;
  },
  key() { noise(0.018, { vol: 0.035, hp: 3500 }); },
  enter() { noise(0.03, { vol: 0.05, hp: 1500 }); },
  // POST beep, like a board that passed its self-test
  beep() { tone(1046, 0.12, { vol: 0.06 }); },
  boot() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.07, at: i * 0.09 })); },
  open() { tone(420, 0.12, { type: 'sine', vol: 0.06, glide: 380 }); },
  close() { tone(700, 0.1, { type: 'sine', vol: 0.05, glide: -400 }); },
  err() { tone(160, 0.16, { type: 'sawtooth', vol: 0.05 }); },
  click() { tone(1800, 0.02, { type: 'square', vol: 0.03 }); },
  ping() { tone(1320, 0.25, { type: 'sine', vol: 0.06 }); tone(1980, 0.3, { type: 'sine', vol: 0.03, at: 0.06 }); },
  motor,
  stop() { if (mo) mo.g.gain.value = 0; },
};
