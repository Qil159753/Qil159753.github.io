// lab: Q's bench. A two-channel scope (function generator on CH1, a simulated surface-EMG burst on
// CH2, the kind of signal MIONEX reads), a logic analyzer that draws and decodes real frames
// (the controller's XBee frame over UART, an MPU6050 register read over I2C, an SPI transfer),
// and a top-down PCB viewer of the controller board with a millimetre ruler.
import { driveFrame, xbeeFrame, XBEE_FIELDS, FIELDS, hex } from './proto.js';

const TABS = [['scope', 'oscilloscope'], ['logic', 'logic analyzer'], ['pcb', 'pcb viewer']];

export async function mount(body, ctx, arg) {
  const wrap = el('div', 'q-app');
  wrap.style.cssText = 'display:grid; grid-template-rows:auto 1fr; background: var(--q-panel)';
  const tabs = el('div', 'q-tabs'); tabs.setAttribute('role', 'tablist');
  const stage = el('div'); stage.style.cssText = 'position:relative; min-height:0';
  wrap.append(tabs, stage);
  body.append(wrap);

  let cur = null, curName = '', token = 0;
  const btns = {};
  for (const [id, label] of TABS) {
    const b = el('button'); b.type = 'button'; b.textContent = label; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { ctx.sfx.click(); show(id); });
    tabs.append(b); btns[id] = b;
  }
  async function show(id) {
    if (id === curName) return;
    const my = ++token;
    cur?.dispose(); cur = null; stage.replaceChildren();
    curName = id;
    for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-selected', String(k === id));
    const tab = await ({ scope, logic, pcb }[id])(stage, ctx);
    if (my !== token) { tab.dispose(); return; }      // switched again while this one was loading
    cur = tab;
  }
  await show(TABS.some(t => t[0] === arg) ? arg : 'scope');

  return {
    arg(a) { if (TABS.some(t => t[0] === a)) show(a); },
    dispose() { token++; cur?.dispose(); },
  };
}

// ======================================================================== oscilloscope
function scope(stage, ctx) {
  const root = el('div'); root.style.cssText = 'position:absolute; inset:0; display:grid; grid-template-columns: 1fr 250px; outline: none';
  root.tabIndex = 0;
  const screenBox = el('div'); screenBox.style.cssText = 'position:relative; margin: 12px; border-radius: 10px; overflow:hidden; background:#04070a; border:1px solid rgba(255,255,255,.08)';
  const cv = el('canvas'); cv.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; cursor: ns-resize; touch-action: none';
  const readout = el('div'); readout.style.cssText = 'position:absolute; left:10px; right:10px; bottom:8px; display:flex; gap:14px; flex-wrap:wrap; font-size:11px; pointer-events:none';
  const topline = el('div'); topline.style.cssText = 'position:absolute; left:10px; right:10px; top:8px; display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color: var(--q-muted); pointer-events:none';
  screenBox.append(cv, topline, readout);
  const side = el('div'); side.style.cssText = 'padding: 12px 14px 12px 2px; display:grid; align-content:start; gap: 14px; overflow-y:auto';
  root.append(screenBox, side);
  stage.append(root);

  const S = { wave: 'sine', freq: 1000, amp: 1.65, tdiv: 0.0002, v1: 0.5, v2: 0.5, trig: 0, run: true, ch2: true, flex: false, duty: 0.3 };
  const section = title => { const s = el('div'); const k = el('div', 'q-k'); k.textContent = title; k.style.marginBottom = '6px'; s.append(k); side.append(s); return s; };
  const chipGroup = (parent, opts, get, set) => {
    const row = el('div'); row.style.cssText = 'display:flex; gap:5px; flex-wrap:wrap; margin-bottom: 6px';
    const bs = opts.map(([v, label]) => { const b = el('button', 'q-chip'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => { set(v); sync(); ctx.sfx.click(); }); row.append(b); return [v, b]; });
    const sync = () => bs.forEach(([v, b]) => b.setAttribute('aria-pressed', String(get() === v)));
    sync(); parent.append(row);
  };
  const slider = (parent, label, min, max, step, get, set, fmt) => {
    const r = el('label', 'q-range'); const k = el('span'); k.textContent = label; k.style.minWidth = '40px';
    const i = el('input'); Object.assign(i, { type: 'range', min, max, step, value: get() });
    const o = el('output'); o.textContent = fmt();
    i.addEventListener('input', () => { set(+i.value); o.textContent = fmt(); });
    r.append(k, i, o); parent.append(r);
  };

  const s1 = section('CH1 · function generator');
  chipGroup(s1, [['sine', 'sine'], ['square', 'square'], ['tri', 'triangle'], ['saw', 'saw'], ['pwm', 'PWM']], () => S.wave, v => (S.wave = v));
  slider(s1, 'freq', 1, 4.3, 0.01, () => Math.log10(S.freq), v => (S.freq = Math.round(10 ** v)), () => fmtHz(S.freq));
  slider(s1, 'amp', 0.1, 3.3, 0.05, () => S.amp, v => (S.amp = v), () => S.amp.toFixed(2) + ' V');
  slider(s1, 'duty', 0.05, 0.95, 0.01, () => S.duty, v => (S.duty = v), () => Math.round(S.duty * 100) + ' %');

  const s2 = section('CH2 · sEMG (simulated)');
  const note = el('div'); note.style.cssText = 'font-size: 11.5px; color: var(--q-text); line-height: 1.5; margin-bottom: 8px';
  note.textContent = ctx.lang() === 'th'
    ? 'สัญญาณกล้ามเนื้อแบบที่ MIONEX อ่าน กดค้างปุ่มนี้ (หรือ space) เพื่อเกร็ง'
    : 'The kind of muscle signal MIONEX reads. Hold this button (or space) to flex.';
  const flexBtn = el('button', 'q-chip'); flexBtn.type = 'button'; flexBtn.textContent = ctx.lang() === 'th' ? 'กดค้างเพื่อเกร็ง' : 'hold to flex';
  flexBtn.style.marginBottom = '6px';
  const setFlex = v => { S.flex = v; flexBtn.setAttribute('aria-pressed', String(v)); };
  flexBtn.addEventListener('pointerdown', e => { e.preventDefault(); setFlex(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => flexBtn.addEventListener(t, () => setFlex(false)));
  s2.append(note, flexBtn);
  chipGroup(s2, [[true, 'CH2 on'], [false, 'CH2 off']], () => S.ch2, v => (S.ch2 = v));

  const s3 = section('horizontal · vertical · trigger');
  const TB = [0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
  const VD = [0.2, 0.5, 1, 2];
  slider(s3, 't/div', 0, TB.length - 1, 1, () => TB.indexOf(S.tdiv), v => (S.tdiv = TB[v]), () => fmtT(S.tdiv));
  slider(s3, 'V/div', 0, VD.length - 1, 1, () => VD.indexOf(S.v1), v => (S.v1 = VD[v]), () => S.v1 + ' V');
  slider(s3, 'trig', -3, 3, 0.05, () => S.trig, v => (S.trig = v), () => S.trig.toFixed(2) + ' V');
  chipGroup(s3, [[true, 'run'], [false, 'stop']], () => S.run, v => (S.run = v));

  const keyH = e => { if (e.key === ' ') { e.preventDefault(); setFlex(e.type === 'keydown'); } };
  root.addEventListener('keydown', keyH); root.addEventListener('keyup', keyH);

  // drag on the screen sets the trigger level
  cv.addEventListener('pointerdown', e => {
    root.focus({ preventScroll: true });
    const r = cv.getBoundingClientRect();
    const mv = ev => { S.trig = Math.max(-3, Math.min(3, -((ev.clientY - r.top) / r.height - 0.5) * 8 * S.v1)); };
    mv(e); cv.setPointerCapture(e.pointerId);
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', () => cv.removeEventListener('pointermove', mv), { once: true });
  });

  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
    root.style.gridTemplateColumns = root.clientWidth < 640 ? '1fr' : '1fr 250px';
    root.style.gridTemplateRows = root.clientWidth < 640 ? '1fr auto' : '';
    side.style.maxHeight = root.clientWidth < 640 ? '45%' : '';
  };
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  const ch1 = t => {
    const ph = ((t * S.freq) % 1 + 1) % 1, a = S.amp, n = (Math.random() - 0.5) * 0.02;
    switch (S.wave) {
      case 'square': return (ph < 0.5 ? a : -a) + n;
      case 'tri': return (ph < 0.5 ? -a + 4 * a * ph : 3 * a - 4 * a * ph) + n;
      case 'saw': return -a + 2 * a * ph + n;
      case 'pwm': return (ph < S.duty ? a : 0) + n;               // 0..a, like a logic-level PWM pin
      default: return a * Math.sin(2 * Math.PI * ph) + n;
    }
  };
  // CH2: noise shaped by a contraction envelope, plus a little 50 Hz mains hum
  let env = 0.03, emg = 0;
  const ch2 = (t, k) => {
    env += ((S.flex ? 1 : 0.03) - env) * k;
    emg = emg * 0.55 + (Math.random() - 0.5) * 0.9;
    return emg * env * 1.4 + Math.sin(2 * Math.PI * 50 * t) * 0.04;
  };

  let raf = 0, simT = 0, last = performance.now(), rms2 = 0;
  const N = 900, buf1 = new Float32Array(N), buf2 = new Float32Array(N);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const span = S.tdiv * 10, sdt = span / N;
    if (S.run) {
      simT += dt;
      // trigger: first rising crossing of the level within about two periods
      let tTrig = simT, found = false;
      const step = 1 / S.freq / 200;
      for (let k = 0, prev = ch1(simT); k < 400; k++) {
        const tt = simT + (k + 1) * step, val = ch1(tt);
        if (prev < S.trig && val >= S.trig) { tTrig = tt; found = true; break; }
        prev = val;
      }
      const start = (found ? tTrig : simT) - span / 2, k2 = Math.min(1, dt * 18) / N;
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const t = start + i * sdt;
        buf1[i] = ch1(t); buf2[i] = ch2(t, k2 * 8); sum += buf2[i] * buf2[i];
      }
      rms2 = Math.sqrt(sum / N);
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgba(4,7,10,0.42)'; g.fillRect(0, 0, W, H);           // phosphor: fade instead of clear
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 1; i < 10; i++) { const x = Math.round(i * W / 10) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let i = 1; i < 8; i++) { const y = Math.round(i * H / 8) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(W / 2 + 0.5, 0); g.lineTo(W / 2 + 0.5, H); g.moveTo(0, H / 2 + 0.5); g.lineTo(W, H / 2 + 0.5); g.stroke();
    const Y = (v, vd) => H / 2 - (v / vd) * (H / 8);
    const trace = (b, color, vd) => {
      g.strokeStyle = color; g.lineWidth = 1.6; g.shadowColor = color; g.shadowBlur = 8;
      g.beginPath();
      for (let i = 0; i < N; i++) { const x = i / (N - 1) * W, y = Y(b[i], vd); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.shadowBlur = 0;
    };
    if (S.ch2) trace(buf2, '#5ad1e6', S.v2);
    trace(buf1, '#ffb47c', S.v1);
    const ty = Y(S.trig, S.v1);
    g.fillStyle = '#ffb47c'; g.beginPath(); g.moveTo(W - 2, ty); g.lineTo(W - 10, ty - 5); g.lineTo(W - 10, ty + 5); g.fill();
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,180,124,.3)'; g.beginPath(); g.moveTo(0, ty); g.lineTo(W, ty); g.stroke(); g.setLineDash([]);

    let mn = Infinity, mx = -Infinity, ss = 0;
    for (let i = 0; i < N; i++) { const v = buf1[i]; if (v < mn) mn = v; if (v > mx) mx = v; ss += v * v; }
    readout.replaceChildren(
      tag('CH1', '#ffb47c'), meas('freq', fmtHz(S.freq)), meas('Vpp', (mx - mn).toFixed(2) + ' V'), meas('Vrms', Math.sqrt(ss / N).toFixed(2) + ' V'),
      ...(S.wave === 'pwm' ? [meas('duty', Math.round(S.duty * 100) + ' %')] : []),
      ...(S.ch2 ? [tag('CH2', '#5ad1e6'), meas('RMS', (rms2 * 1000).toFixed(0) + ' mV'), meas('', S.flex ? 'contracting' : 'rest')] : []),
    );
    topline.replaceChildren(word(S.run ? 'RUN' : 'STOP', S.run ? 'var(--q-ok)' : 'var(--q-bad)'), meas('H', fmtT(S.tdiv) + '/div'), meas('CH1', S.v1 + ' V/div'), meas('CH2', S.v2 + ' V/div'), meas('T', '↑ ' + S.trig.toFixed(2) + ' V'));
  }
  raf = requestAnimationFrame(frame);
  return { dispose() { cancelAnimationFrame(raf); ro.disconnect(); } };
}

// ======================================================================== logic analyzer
// MPU6050 burst read starting at ACCEL_XOUT_H; the six data bytes are example values
const MPU = { addr: 0x68, reg: 0x3B, data: [0x02, 0x1C, 0xFF, 0x88, 0x40, 0x10] };

function logic(stage, ctx) {
  const root = el('div'); root.style.cssText = 'position:absolute; inset:0; display:grid; grid-template-rows:auto 1fr auto';
  const bar = el('div'); bar.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding: 10px 12px; border-bottom: 1px solid var(--q-line)';
  const view = el('div'); view.style.cssText = 'position:relative; min-height:0';
  const cv = el('canvas'); cv.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; cursor: grab; touch-action: none';
  view.append(cv);
  const foot = el('div'); foot.style.cssText = 'padding: 8px 12px 10px; border-top: 1px solid var(--q-line); font-size: 11.5px; line-height: 1.5; color: var(--q-text)';
  root.append(bar, view, foot);
  stage.append(root);

  let proto = 'uart', text = '';
  const protoBtns = [['uart', 'UART · XBee frame'], ['i2c', 'I²C · MPU6050'], ['spi', 'SPI']].map(([id, label]) => {
    const b = el('button', 'q-chip'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { proto = id; ctx.sfx.click(); build(); }); bar.append(b); return [id, b];
  });
  const input = el('input');
  Object.assign(input, { type: 'text', placeholder: ctx.lang() === 'th' ? 'พิมพ์ข้อความเพื่อส่งไบต์ของคุณเอง…' : 'type to send your own bytes…', spellcheck: false });
  input.style.cssText = 'flex:1; min-width: 160px; background: rgba(255,255,255,.04); border: 1px solid var(--q-line); border-radius: 8px; color: var(--q-ink); font: inherit; font-size: 12px; padding: 5px 10px; outline: none';
  input.addEventListener('input', () => { text = input.value; build(); });
  const fitBtn = el('button', 'q-chip'); fitBtn.type = 'button'; fitBtn.textContent = 'fit';
  fitBtn.addEventListener('click', () => { fit(); ctx.sfx.click(); });
  bar.append(input, fitBtn);

  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => { dpr = Math.min(devicePixelRatio, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; draw(); };

  // a capture: chans [{ name, edges: [[t, level]...] }] and decoded boxes ann [{ t0, t1, row, label, sub, color }]
  let cap = null, t0 = 0, t1 = 1, hoverX = -1;
  function build() {
    protoBtns.forEach(([id, b]) => b.setAttribute('aria-pressed', String(id === proto)));
    const bytes = text ? [...new TextEncoder().encode(text)].slice(0, 48) : null;
    cap = proto === 'uart' ? uart(bytes) : proto === 'i2c' ? i2c(bytes) : spi(bytes);
    foot.textContent = cap.note[ctx.lang() === 'th' ? 'th' : 'en'];
    fit();
  }
  function fit() { const pad = cap.end * 0.03; t0 = -pad; t1 = cap.end + pad; draw(); }
  const asc = b => (b >= 32 && b < 127 ? `'${String.fromCharCode(b)}'` : '');

  function uart(custom) {
    const bit = 1 / 115200;
    const bytes = custom || xbeeFrame(driveFrame({ btn: {}, x: 0, y: 0.6, t: 0, lead: 0, speedMode: 1, phase: 0, safety: false }));
    const edges = [[0, 1]], ann = [];
    let t = bit * 4;
    bytes.forEach((b, i) => {
      edges.push([t, 0]);                                                    // start bit
      for (let k = 0; k < 8; k++) edges.push([t + bit * (1 + k), (b >> k) & 1]);  // data, LSB first
      edges.push([t + bit * 9, 1]);                                          // stop bit
      const f = !custom && XBEE_FIELDS.find(([s, n]) => i >= s && i < s + n);
      const inPayload = f && f[2] === 'payload';
      ann.push({ t0: t, t1: t + bit * 10, row: 0, label: hex(b), sub: custom ? asc(b) : inPayload ? FIELDS[i - 14] : f[2], color: inPayload ? '#ffb47c' : '#9fb0c4' });
      t += bit * 10;
    });
    return {
      chans: [{ name: 'TX', edges }], ann, end: t + bit * 4, unit: bit,
      note: custom
        ? { th: `${bytes.length} ไบต์ · 115200 8N1 · LSB ก่อน · บิตเริ่มเป็น 0 บิตหยุดเป็น 1`, en: `${bytes.length} bytes · 115200 8N1 · LSB first · start bit 0, stop bit 1` }
        : { th: 'เฟรม XBee API 25 ไบต์ที่ Controller_v7 เขียนออก Serial1 ทุก 20 ms ตรงกลางคือเฟรมขับ 10 ไบต์ (สีทองแดง ตอนนี้ดันจอยไปข้างหน้า 60%) มี CRC-8 ของมันเอง ปิดท้ายด้วย checksum ของ XBee · ล้อเมาส์ซูม ลากเพื่อเลื่อน', en: "The 25-byte XBee API frame Controller_v7 writes to Serial1 every 20 ms. The copper bytes are the 10-byte drive frame (stick 60% forward) with its own CRC-8, then the XBee checksum. Wheel to zoom, drag to pan." },
    };
  }

  function i2c(custom) {
    const bit = 1 / 400000, h = bit / 2;             // 400 kHz fast mode
    const scl = [[0, 1]], sda = [[0, 1]], ann = [];
    let t = bit * 3;
    const clockBit = v => { sda.push([t + h * 0.3, v]); scl.push([t + h, 1]); scl.push([t + 2 * h, 0]); t += bit; };
    const start = label => {
      if (label === 'Sr') { sda.push([t, 1]); scl.push([t + h * 0.4, 1]); t += h; }   // repeated start: release both lines first
      sda.push([t, 0]); scl.push([t + h, 0]);
      ann.push({ t0: t - h * 0.3, t1: t + h, row: 1, label, color: '#7ee2a8' }); t += bit;
    };
    const stop = () => { sda.push([t, 0]); scl.push([t + h * 0.5, 1]); sda.push([t + h, 1]); ann.push({ t0: t, t1: t + h * 1.5, row: 1, label: 'P', color: '#ff8a7a' }); t += bit * 2; };
    const byte = (b, label, sub, nack = 0) => {
      const s = t;
      for (let k = 7; k >= 0; k--) clockBit((b >> k) & 1);                 // MSB first
      ann.push({ t0: s, t1: t, row: 1, label, sub, color: '#ffb47c' });
      const a = t; clockBit(nack);
      ann.push({ t0: a, t1: t, row: 1, label: nack ? 'N' : 'A', color: nack ? '#ff8a7a' : '#7ee2a8' });
    };
    if (custom) {
      start('S'); byte(MPU.addr << 1, hex(MPU.addr) + '+W', 'addr');
      custom.forEach(b => byte(b, hex(b), asc(b)));
      stop();
    } else {
      start('S'); byte(MPU.addr << 1, hex(MPU.addr) + '+W', 'MPU6050'); byte(MPU.reg, hex(MPU.reg), 'ACCEL_XOUT_H');
      start('Sr'); byte((MPU.addr << 1) | 1, hex(MPU.addr) + '+R', 'MPU6050');
      const names = ['AX_H', 'AX_L', 'AY_H', 'AY_L', 'AZ_H', 'AZ_L'];
      MPU.data.forEach((b, i) => byte(b, hex(b), names[i], i === MPU.data.length - 1 ? 1 : 0));
      stop();
    }
    sda.push([t, 1]);
    const az = (((MPU.data[4] << 8) | MPU.data[5]) << 16) >> 16;
    return {
      chans: [{ name: 'SCL', edges: scl }, { name: 'SDA', edges: sda }], ann, end: t + bit * 2, unit: bit,
      note: custom
        ? { th: 'I²C 400 kHz · MSB ก่อน · ทุกไบต์ตามด้วย ACK', en: 'I²C at 400 kHz · MSB first · every byte followed by an ACK' }
        : { th: `อ่าน 6 ไบต์จาก MPU6050 (0x68) เริ่มที่ ACCEL_XOUT_H (0x3B) แบบที่ไลบรารี MPU6050_light ทำบนหุ่น · ค่าข้อมูลเป็นตัวอย่าง: AZ = ${az} ≈ ${(az / 16384).toFixed(2)} g`, en: `Reading 6 bytes from the MPU6050 (0x68) starting at ACCEL_XOUT_H (0x3B), the way MPU6050_light does on the robot · data bytes are example values: AZ = ${az} ≈ ${(az / 16384).toFixed(2)} g` },
    };
  }

  function spi(custom) {
    const bit = 1 / 1000000, h = bit / 2;             // 1 MHz, mode 0
    const bytes = custom || [0x9F, 0x00, 0x00, 0x00];
    const miso = custom ? bytes.map(() => 0xFF) : [0xFF, 0xEF, 0x40, 0x18];
    const cs = [[0, 1]], sck = [[0, 0]], mosi = [[0, 0]], so = [[0, 1]], ann = [];
    let t = bit * 2;
    cs.push([t, 0]); t += bit;
    bytes.forEach((b, i) => {
      const s = t;
      for (let k = 7; k >= 0; k--) { mosi.push([t, (b >> k) & 1]); so.push([t, (miso[i] >> k) & 1]); sck.push([t + h, 1]); sck.push([t + bit, 0]); t += bit; }
      ann.push({ t0: s, t1: t, row: 2, label: hex(b), sub: custom ? asc(b) : i === 0 ? 'RDID' : '', color: '#ffb47c' });
      ann.push({ t0: s, t1: t, row: 3, label: hex(miso[i]), sub: custom ? '' : ['', 'mfr', 'type', 'size'][i], color: '#5ad1e6' });
      t += bit * 0.5;
    });
    t += bit; cs.push([t, 1]); mosi.push([t, 0]); so.push([t, 1]);
    return {
      chans: [{ name: 'CS', edges: cs }, { name: 'SCK', edges: sck }, { name: 'MOSI', edges: mosi }, { name: 'MISO', edges: so }], ann, end: t + bit * 2, unit: bit,
      note: { th: 'SPI โหมด 0 ที่ 1 MHz · ตัวอย่าง: คำสั่ง 0x9F อ่าน JEDEC ID ของชิปแฟลช · ไบต์ MISO เป็นค่าตัวอย่าง', en: "SPI mode 0 at 1 MHz · example: command 0x9F reads a flash chip's JEDEC ID · the MISO bytes are example values" },
    };
  }

  const LBL = 70;
  function draw() {
    if (!cap || !W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#080b0f'; g.fillRect(0, 0, W, H);
    const top = 28, n = cap.chans.length, rowH = Math.min(96, (H - top - 12) / n);
    const X = t => LBL + (t - t0) / (t1 - t0) * (W - LBL - 10);
    const span = t1 - t0, raw = span / 8, p10 = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(m => m * p10).find(s => s >= raw);
    g.font = '10px JetBrains Mono, monospace'; g.textBaseline = 'top'; g.textAlign = 'center';
    for (let t = Math.ceil(t0 / step) * step; t < t1; t += step) {
      const x = X(t);
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, top - 6, 1, H);
      g.fillStyle = '#6c7787'; g.fillText(fmtT(t), x, 8);
    }
    cap.chans.forEach((c, ci) => {
      const y0 = top + ci * rowH, hi = y0 + rowH * 0.46, lo = y0 + rowH * 0.82;
      g.fillStyle = '#9fb0c4'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '11px JetBrains Mono, monospace';
      g.fillText(c.name, 12, (hi + lo) / 2);
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.moveTo(LBL, y0 + rowH - 2); g.lineTo(W, y0 + rowH - 2); g.stroke();
      g.strokeStyle = ci % 2 ? '#5ad1e6' : '#7ee2a8'; g.lineWidth = 1.5;
      g.beginPath();
      let lvl = c.edges[0][1];
      g.moveTo(LBL, lvl ? hi : lo);
      for (const [t, v] of c.edges) {
        if (t > t1) break;
        const x = Math.max(LBL, X(t));
        g.lineTo(x, lvl ? hi : lo); g.lineTo(x, v ? hi : lo); lvl = v;
      }
      g.lineTo(W, lvl ? hi : lo); g.stroke();
      for (const a of cap.ann) {
        if (a.row !== ci) continue;
        const x0 = Math.max(LBL, X(a.t0)), x1 = Math.min(W - 2, X(a.t1));
        if (x1 <= x0) continue;
        const by = y0 + 4, bh = rowH * 0.32;
        g.fillStyle = a.color + '22'; g.strokeStyle = a.color + 'aa'; g.lineWidth = 1;
        roundRect(g, x0 + 1, by, x1 - x0 - 2, bh, 4); g.fill(); g.stroke();
        if (x1 - x0 > 20) {
          const cx = (x0 + x1) / 2, two = a.sub && x1 - x0 > 50 && bh > 24;
          g.fillStyle = a.color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '11px JetBrains Mono, monospace';
          g.fillText(a.label, cx, by + bh / 2 - (two ? 6 : 0));
          if (two) { g.fillStyle = '#7d8796'; g.font = '9px JetBrains Mono, monospace'; g.fillText(a.sub, cx, by + bh / 2 + 7); }
        }
      }
    });
    if (hoverX > LBL) {
      g.strokeStyle = 'rgba(255,180,124,.6)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(hoverX, top - 6); g.lineTo(hoverX, H); g.stroke(); g.setLineDash([]);
      const t = t0 + (hoverX - LBL) / (W - LBL - 10) * (t1 - t0);
      g.fillStyle = '#ffb47c'; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = '10px JetBrains Mono, monospace'; g.fillText(fmtT(t), hoverX + 4, top - 4);
    }
  }

  // wheel zooms around the cursor, drag pans
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), f = Math.max(0, (e.clientX - r.left - LBL) / (W - LBL - 10));
    const tc = t0 + f * (t1 - t0), k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    const span = Math.max(cap.unit * 3, Math.min(cap.end * 1.5, (t1 - t0) * k));
    t0 = tc - f * span; t1 = t0 + span; draw();
  }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, t0, t1 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => {
    hoverX = e.clientX - cv.getBoundingClientRect().left;
    if (drag) { const d = (e.clientX - drag.x) / (W - LBL - 10) * (drag.t1 - drag.t0); t0 = drag.t0 - d; t1 = drag.t1 - d; }
    draw();
  });
  cv.addEventListener('pointerup', () => { drag = null; cv.style.cursor = 'grab'; });
  cv.addEventListener('pointerleave', () => { hoverX = -1; draw(); });

  const ro = new ResizeObserver(resize); ro.observe(cv);
  build(); resize();
  return { dispose() { ro.disconnect(); } };
}

// ======================================================================== PCB viewer
async function pcb(stage, ctx) {
  const root = el('div'); root.style.cssText = 'position:absolute; inset:0; background: radial-gradient(80% 80% at 50% 50%, #0f151b, #06080b)';
  const cv = el('canvas', 'q-gl');
  const load = el('div', 'q-load'); load.textContent = 'loading board…'; load.append(el('i'));
  root.append(cv, load);
  stage.append(root);
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const { loadPCB, boardOutline } = await import('./pcb.js');
  const data = await loadPCB(THREE, new URL('../../qos/pcb.bin', import.meta.url).href, p => load.style.setProperty('--p', Math.round(p * 100) + '%'));
  load.remove();

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-60, 200, 80); scene.add(dl);
  const cam = new THREE.OrthographicCamera(-100, 100, 60, -60, 0.1, 1000);
  cam.position.set(0, 300, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  const controls = new OrbitControls(cam, cv);
  controls.enableRotate = false; controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.minZoom = 0.6; controls.maxZoom = 14;

  const LAYERS = {
    board: ['board'],
    radio: ['xbee'],
    switches: ['l1', 'r1', 'up', 'down', 'left', 'right', 'tri', 'sq', 'cir', 'cross', 'reset', 'tog_l', 'tog_r'],
    power: ['reg', 'jst', 'passives'],
  };
  const meshes = {};
  for (const part of data.parts) {
    const geo = data.geometry(part), isBoard = part.name === 'board';
    const m = new THREE.Mesh(geo, isBoard
      ? new THREE.MeshStandardMaterial({ color: 0x0f3b2a, roughness: 0.7, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, side: THREE.DoubleSide }));
    if (isBoard) m.add(new THREE.LineSegments(boardOutline(THREE, geo), new THREE.LineBasicMaterial({ color: 0xe8e2c8, transparent: true, opacity: 0.85 })));
    meshes[part.name] = m; scene.add(m);
  }

  const hud = el('div', 'q-hud'); hud.style.inset = '0';
  const tools = el('div', 'q-panel'); Object.assign(tools.style, { position: 'absolute', left: '12px', top: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: 'calc(100% - 24px)' });
  const chip = (label, on, fn) => {
    const b = el('button', 'q-chip'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); fn(v); ctx.sfx.click(); });
    tools.append(b);
  };
  for (const [id, parts] of Object.entries(LAYERS)) chip(id, true, v => parts.forEach(p => { if (meshes[p]) meshes[p].visible = v; }));
  chip('wireframe', false, v => Object.values(meshes).forEach(m => (m.material.wireframe = v)));
  let measuring = false;
  chip('measure', false, v => { measuring = v; pts.length = 0; redraw(); cv.style.cursor = v ? 'crosshair' : 'grab'; });
  const status = el('div', 'q-panel'); Object.assign(status.style, { position: 'absolute', left: '12px', bottom: '12px', fontSize: '12px', maxWidth: 'calc(100% - 140px)' });
  const hintText = ctx.lang() === 'th' ? 'ลากเพื่อเลื่อน · ล้อเมาส์เพื่อซูม · เปิด measure แล้วคลิกสองจุดเพื่อวัดระยะ' : 'drag to pan · wheel to zoom · turn on measure and click two points';
  status.textContent = hintText;
  const scaleBar = el('div'); Object.assign(scaleBar.style, { position: 'absolute', right: '16px', bottom: '16px', fontSize: '11px', color: 'var(--q-text)', textAlign: 'center' });
  const sbLine = el('div'); sbLine.style.cssText = 'height: 6px; border: 1.5px solid var(--q-cu); border-top: 0; margin-bottom: 3px';
  const sbText = el('div');
  scaleBar.append(sbLine, sbText);
  hud.append(tools, status, scaleBar);
  root.append(hud);

  // ruler: two clicks, a line between them, distance in mm and mil
  const pts = [];
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb47c, depthTest: false }));
  line.renderOrder = 10; scene.add(line);
  const dotGeo = new THREE.CircleGeometry(0.7, 20); dotGeo.rotateX(-Math.PI / 2);
  const dots = [0, 1].map(() => { const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffb47c, depthTest: false })); d.renderOrder = 11; d.visible = false; scene.add(d); return d; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -40);
  const at = e => {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  function redraw(hover) {
    const p = hover && pts.length === 1 ? [pts[0], hover] : pts;
    line.geometry.setFromPoints(p.length === 2 ? p : []);
    dots.forEach((d, i) => { d.visible = !!p[i]; if (p[i]) d.position.copy(p[i]); });
    if (p.length === 2) {
      const dx = Math.abs(p[1].x - p[0].x), dz = Math.abs(p[1].z - p[0].z), mm = Math.hypot(dx, dz);
      status.textContent = `${mm.toFixed(2)} mm · ${(mm / 0.0254).toFixed(0)} mil · Δx ${dx.toFixed(2)} · Δy ${dz.toFixed(2)} mm`;
      status.style.color = 'var(--q-cu-hi)';
    } else { status.textContent = hintText; status.style.color = ''; }
  }
  let down = null;
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', e => {
    if (!measuring || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const p = at(e); if (!p) return;
    if (pts.length === 2) pts.length = 0;
    pts.push(p); ctx.sfx.click(); redraw();
  });
  cv.addEventListener('pointermove', e => { if (measuring && pts.length === 1) redraw(at(e)); });

  function resize() {
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h, halfW = Math.max(data.size.x / 2 + 12, (data.size.z / 2 + 14) * aspect);
    cam.left = -halfW; cam.right = halfW; cam.top = halfW / aspect; cam.bottom = -halfW / aspect; cam.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    controls.update();
    const pxPerMm = root.clientWidth / ((cam.right - cam.left) / cam.zoom);
    const mm = [1, 2, 5, 10, 20, 50].find(v => v * pxPerMm > 60) || 50;
    sbLine.style.width = (mm * pxPerMm) + 'px'; sbText.textContent = mm + ' mm';
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(tick);
  return {
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose();
    },
  };
}

// ======================================================================== helpers
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function tag(t, c) { const s = el('span'); s.textContent = t; s.style.cssText = `color:#07090c; background:${c}; padding: 0 5px; border-radius: 3px; font-weight: 600`; return s; }
function word(t, c) { const s = el('span'); s.textContent = t; s.style.color = c; return s; }
function meas(k, v) { const s = el('span'); const a = el('span'); a.textContent = k ? k + ' ' : ''; a.style.color = 'var(--q-muted)'; const b = el('span'); b.textContent = v; b.style.color = 'var(--q-ink)'; s.append(a, b); return s; }
function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : f + ' Hz'; }
function fmtT(t) {
  const a = Math.abs(t);
  if (a < 1e-12) return '0';
  if (a < 1e-6) return Math.round(t * 1e9) + ' ns';
  if (a < 1e-3) return +(t * 1e6).toFixed(1) + ' µs';
  if (a < 1) return +(t * 1e3).toFixed(2) + ' ms';
  return t.toFixed(2) + ' s';
}
function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
