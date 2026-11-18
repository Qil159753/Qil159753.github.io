// fw: Q's real ABU Robocon firmware running in the browser. Controller_v7.ino and robot_firmware_v7.ino
// are compiled unchanged to WebAssembly (tools/fw/build.sh); js/fw-sim.js supplies what isn't code:
// the two XBee radios, the 2.4 GHz air between them, the chassis and its MPU6050. Every serial line,
// state change and PWM value on screen comes out of the compiled firmware.
import { createSim, FIELD, BOT, mhz } from '../fw-sim.js';

const CSS = `
.fw { position:absolute; inset:0; display:grid; grid-template-columns: 264px minmax(0,1fr) 336px; background: var(--q-panel); font-size: 12px; }
.fw section { min-height:0; overflow-y:auto; padding: 12px; display:flex; flex-direction:column; gap: 12px; }
.fw section > * { flex: none; }
.fw section + section, .fw .fw-arena { border-left: 1px solid var(--q-line); }
.fw h3 { margin:0; font: 600 11px var(--q-mono); color: var(--q-muted); letter-spacing: .08em; text-transform: uppercase; display:flex; align-items:center; gap:8px; }
.fw h3 .fw-led { width:9px; height:9px; border-radius:50%; background:#1d3326; box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
.fw h3 .fw-led.on { background: var(--q-ok); box-shadow: 0 0 10px var(--q-ok); }
.fw .fw-chip { display:inline-block; padding: 2px 8px; border-radius: 999px; background: var(--q-cu-soft); color: var(--q-cu-hi); font-size: 11px; }
.fw .fw-chip.ok { background: rgba(126,226,168,.12); color: var(--q-ok); }
.fw .fw-chip.bad { background: rgba(255,107,91,.14); color: var(--q-bad); }
.fw .fw-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.fw .fw-sticks { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.fw .fw-stick { aspect-ratio:1; border-radius:50%; border:1px solid rgba(255,255,255,.12); background: radial-gradient(circle, #141a21 0 55%, #0b0f13 56%); position:relative; touch-action:none; cursor:grab; }
.fw .fw-stick i { position:absolute; left:50%; top:50%; width:38%; height:38%; margin:-19% 0 0 -19%; border-radius:50%; background: radial-gradient(circle at 40% 35%, #3a4350, #1b2129); border:1px solid rgba(236,154,90,.5); pointer-events:none; }
.fw .fw-stick b { position:absolute; left:-10px; right:-10px; bottom:-18px; text-align:center; font-weight:400; color: var(--q-muted); font-size:10.5px; white-space:nowrap; }
.fw .fw-pad { display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; }
.fw .fw-pad button, .fw .fw-tog, .fw .fw-tool { padding: 7px 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); color: var(--q-text); font: inherit; font-size: 11.5px; touch-action: manipulation; user-select:none; -webkit-user-select:none; }
.fw .fw-pad button small { display:block; color: var(--q-muted); font-size: 9.5px; }
.fw .fw-pad button.down { background: var(--q-cu-soft); border-color: var(--q-cu); color: var(--q-cu-hi); }
.fw .fw-tog[aria-pressed='true'], .fw .fw-tool[aria-pressed='true'] { background: var(--q-cu-soft); border-color: var(--q-cu); color: var(--q-cu-hi); }
.fw .fw-tool { padding: 6px 10px; background: rgba(10,13,17,.85); }
.fw .fw-arena { position:relative; min-height:0; }
.fw .fw-arena canvas { position:absolute; inset:0; width:100%; height:100%; display:block; outline:none; touch-action:none; }
.fw .fw-arena .fw-over { position:absolute; left:10px; right:10px; top:10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; pointer-events:none; }
.fw .fw-arena .fw-over > * { pointer-events:auto; }
.fw .fw-arena .fw-hint { position:absolute; left:10px; right:10px; bottom:8px; color: var(--q-muted); font-size: 11px; pointer-events:none; }
.fw .fw-chans { display:grid; grid-template-columns: repeat(16, 1fr); gap:2px; height: 74px; align-items:end; }
.fw .fw-chans button { position:relative; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:0; border-radius:3px; font-size:9px; color: var(--q-muted); }
.fw .fw-chans button span { width:100%; border-radius:3px 3px 0 0; background: #2a3440; transition: height .2s; }
.fw .fw-chans button.hot span { background: var(--q-bad); }
.fw .fw-chans button.jam { outline: 1px dashed var(--q-bad); }
.fw .fw-chans button.cur::after { content:'▲'; position:absolute; top:-2px; color: var(--q-cu); font-size: 9px; }
.fw .fw-chans button em { font-style:normal; margin-top:2px; }
.fw .fw-bytes { display:grid; grid-template-columns: repeat(5, 1fr); gap:4px; }
.fw .fw-bytes span { display:grid; text-align:center; padding:4px 0; border-radius:6px; background: #0a0d11; border:1px solid var(--q-line); }
.fw .fw-bytes b { color: var(--q-ink); font-weight:500; }
.fw .fw-bytes small { color: var(--q-muted); font-size: 9.5px; }
.fw .fw-outs { display:flex; flex-wrap:wrap; gap:4px; }
.fw .fw-outs span { padding:2px 7px; border-radius:6px; border:1px solid var(--q-line); color: var(--q-muted); font-size: 10.5px; }
.fw .fw-outs span.on { color: var(--q-ok); border-color: rgba(126,226,168,.5); }
.fw .fw-lift { display:grid; grid-template-columns: auto 1fr 4em; gap:4px 8px; align-items:center; font-size: 11px; }
.fw .fw-lift i { height:6px; border-radius:3px; background:#1b222b; overflow:hidden; }
.fw .fw-lift i::before { content:''; display:block; height:100%; width: var(--p, 0%); background: var(--q-cu); }
.fw .fw-lift span:nth-child(3n) { text-align:right; }
.fw .fw-mon { display:grid; grid-template-rows:auto 1fr; gap:6px; }
.fw .fw-mon pre { margin:0; height: 210px; overflow:auto; background:#05070a; border:1px solid var(--q-line); border-radius:8px; padding:8px; font: 10.5px/1.45 var(--q-mono); color: var(--q-text); white-space: pre-wrap; word-break: break-all; }
.fw .fw-tabs { display:flex; gap:4px; }
.fw .fw-tabs button { padding: 3px 9px; border-radius:6px; color: var(--q-muted); }
.fw .fw-tabs button[aria-selected='true'] { background: var(--q-cu-soft); color: var(--q-cu-hi); }
.fw .fw-note { color: var(--q-muted); line-height: 1.5; margin: 0; }
.fw .fw-note b { color: var(--q-text); font-weight: 500; }
.fw select { background:#0a0d11; color: var(--q-text); border:1px solid var(--q-line); border-radius:6px; font: inherit; padding: 4px 6px; }
@media (max-width: 760px) {
  .fw { display:flex; flex-direction:column; overflow-y:auto; }
  .fw > * { flex: none; }
  .fw .fw-arena { order:-1; height: calc(62vw + 120px); border:0; border-bottom:1px solid var(--q-line); }
  .fw section + section { border-left:0; border-top:1px solid var(--q-line); }
  .fw section { overflow: visible; }
  .fw .fw-sticks { max-width: 300px; }
}`;

const BTNS = [   // pin name, label, what the firmware does with it
  ['CIR', '◯', 'lift 1'], ['TRI', '△', 'gripper'], ['UP', '↑', 'lift 2'], ['DOWN', '↓', 'arm'],
  ['LEFT', '←', 'hand'], ['RIGHT', '→', 'wrist'], ['SQ', '□', 'stretch'], ['CROSS', '✕', 'IR'],
  ['L1', 'L1', 'hop ch'], ['R1', 'R1', 'speed'], ['SW_L', 'SW_L', 'head reset'], ['SW_R', 'SW_R', 'creep'],
  ['MODE', 'MODE', 'phase'],
];
const KEYMAP = { '1': 'CIR', '2': 'UP', h: 'L1', r: 'R1' };
const NAMES = ['SOF', 'VER', 'btn', 'aux', 'vx', 'vy', 'vt', 'spd', 'lead', 'crc'];
const PHASES = ['MARTIAL ×1.0', 'FOREST ×0.8', 'ARENA ×0.6'];
const hex = v => v.toString(16).toUpperCase().padStart(2, '0');

export async function mount(body, ctx) {
  const th = ctx.lang() === 'th';
  const style = el('style'); style.textContent = CSS;
  const root = el('div', 'q-app fw');
  ctx.progress?.(0.3);

  const base = new URL('../../qos/fw/', import.meta.url);
  const sim = await createSim(async n => {
    const r = await fetch(new URL(n + '.wasm', base));
    if (!r.ok) throw new Error(n + '.wasm ' + r.status);
    return r.arrayBuffer();
  });
  ctx.progress?.(1);
  body.append(style, root);

  const pad = { lx: 0, ly: 0, rx: 0, ry: 0 };
  const keys = new Set(), held = new Set();

  // ---------------------------------------------------------------- controller column
  const cCol = el('section');
  const cHead = el('h3'), led = el('span', 'fw-led');
  led.title = 'LED_PIN 12';
  cHead.append(led, 'Controller_v7 · Teensy');
  const cState = el('div', 'fw-row');
  const sticks = el('div', 'fw-sticks');
  sticks.append(stick(th ? 'ขับ · WASD' : 'drive · WASD', (x, y) => { pad.lx = x; pad.ly = y; }),
    stick(th ? 'หมุน Q/E · ลิฟต์ I/K' : 'turn Q/E · lift I/K', (x, y) => { pad.rx = x; pad.ry = y; }));
  const padEl = el('div', 'fw-pad');
  const btnEls = {};
  for (const [k, label, what] of BTNS) {
    const b = el('button'); b.type = 'button';
    b.append(label); const s = el('small'); s.textContent = what; b.append(s);
    hold(b, k);
    padEl.append(b); btnEls[k] = b;
  }
  const togRow = el('div', 'fw-row');
  const togL = tool('TOG_L expo', () => { sim.input.togL = !sim.input.togL; sync(); });
  const togR = tool('TOG_R safety', () => { sim.input.togR = !sim.input.togR; sync(); });
  togRow.append(togL, togR);
  const cNote = el('p', 'fw-note');
  cNote.innerHTML = th
    ? 'ปุ่มแต่ละปุ่มคือขา Teensy ตามที่ประกาศไว้ใน <b>Controller_v7.ino</b> กดค้างได้ เฟิร์มแวร์ตัดสินเองว่าปุ่มไหนกดค้าง ปุ่มไหนกดสลับ แป้นลัด: 1 = ◯, 2 = ↑, H = L1, R = R1'
    : 'Each button is the Teensy pin it is wired to in <b>Controller_v7.ino</b>. Hold them; the firmware itself decides which are momentary and which toggle. Keys: 1 = ◯, 2 = ↑, H = L1, R = R1.';
  cCol.append(cHead, cState, sticks, padEl, togRow, cNote);

  // ---------------------------------------------------------------- floor
  const arena = el('div', 'fw-arena');
  const cv = el('canvas'); cv.tabIndex = 0;
  cv.setAttribute('aria-label', th ? 'พื้นจำลอง คลิกแล้วใช้ WASD ขับ' : 'Practice floor. Click it, then drive with WASD');
  const over = el('div', 'fw-over');
  const bState = el('span', 'fw-chip');
  const speedSel = el('select'); speedSel.setAttribute('aria-label', th ? 'ความเร็วเวลา' : 'time scale');
  for (const [v, t] of [[1, th ? '×1 เวลาจริง' : '×1 real time'], [4, '×4'], [0.25, th ? '×¼ ช้า' : '×¼ slow']]) { const o = el('option'); o.value = v; o.textContent = t; speedSel.append(o); }
  over.append(bState, speedSel,
    tool(th ? 'ชนหุ่น 30°' : 'bump 30°', () => sim.bump(Math.random() < 0.5 ? -30 : 30)),
    tool(th ? 'กลับกลางสนาม' : 'recentre', () => Object.assign(sim.body, { x: 0, y: 0, vf: 0, vs: 0 })));
  const hint = el('div', 'fw-hint');
  hint.textContent = th
    ? 'จับคู่ครั้งแรกใช้ราว 9 วินาทีเหมือนของจริง: บูต, handshake, สแกนช่อง 5 วินาที, แลก blacklist'
    : 'First pairing takes about 9 s, as on the real robot: boot, handshake, a 5 s channel scan, the blacklist exchange.';
  arena.append(cv, over, hint);

  // ---------------------------------------------------------------- radio + serial column
  const rCol = el('section');
  const rHead = el('h3'); rHead.textContent = th ? 'วิทยุ XBee · 2.4 GHz' : 'XBee radios · 2.4 GHz';
  const chans = el('div', 'fw-chans'); chans.setAttribute('role', 'group');
  chans.setAttribute('aria-label', th ? 'ช่อง 11–26 กดเพื่อรบกวนช่องนั้น' : 'Channels 11–26; click one to jam it');
  const chEls = [];
  for (let ch = 11; ch <= 26; ch++) {
    const b = el('button'); b.type = 'button'; b.title = `CH ${ch} · ${mhz(ch)} MHz`;
    b.setAttribute('aria-label', `CH ${ch}`);
    b.append(el('span')); const e = el('em'); e.textContent = ch; b.append(e);
    b.addEventListener('click', () => { const j = sim.air.jam; j.has(ch) ? j.delete(ch) : j.add(ch); b.setAttribute('aria-pressed', String(j.has(ch))); ctx.sfx.click(); });
    chans.append(b); chEls.push(b);
  }
  const airRow = el('div', 'fw-row');
  const cut = tool(th ? 'ตัดวิทยุ' : 'cut radio', () => { sim.air.cut = !sim.air.cut; cut.setAttribute('aria-pressed', String(sim.air.cut)); });
  cut.setAttribute('aria-pressed', 'false');
  const wifi = el('select'); wifi.setAttribute('aria-label', 'Wi-Fi');
  for (const [v, t] of [[6, 'Wi-Fi ch 6'], [1, 'Wi-Fi ch 1'], [11, 'Wi-Fi ch 11'], [0, th ? 'ไม่มี Wi-Fi' : 'no Wi-Fi']]) { const o = el('option'); o.value = v; o.textContent = t; wifi.append(o); }
  wifi.addEventListener('change', () => { sim.air.wifi = +wifi.value; });
  const link = el('span', 'fw-chip');
  airRow.append(cut, wifi, link);
  const fHead = el('h3'); fHead.textContent = th ? 'เฟรมขับล่าสุด (10 ไบต์)' : 'last drive frame (10 bytes)';
  const bytes = el('div', 'fw-bytes');
  const cells = NAMES.map(n => { const s = el('span'), b = el('b'), sm = el('small'); b.textContent = '--'; sm.textContent = n; s.append(b, sm); bytes.append(s); return b; });
  const oHead = el('h3'); oHead.textContent = th ? 'เอาต์พุตของหุ่น' : 'robot outputs';
  const outs = el('div', 'fw-outs');
  const outEls = {};
  for (const k of ['GRIPPER', 'ARM', 'HAND', 'WRIST', 'STRETCH', 'IR']) { const s = el('span'); s.textContent = k; outs.append(s); outEls[k] = s; }
  const lift = el('div', 'fw-lift');
  const liftEls = [0, 1].map(i => { const a = el('span'); a.textContent = `M${i + 1} ${th ? 'สเต็ป' : 'steps'}`; const bar = el('i'); const v = el('span'); lift.append(a, bar, v); return { bar, v }; });
  const mon = el('div', 'fw-mon');
  const tabs = el('div', 'fw-tabs');
  const pre = el('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', 'USB serial monitor');
  const logs = { controller: [], robot: [] };
  let showing = 'robot', dirtyLog = true;
  for (const n of ['robot', 'controller']) {
    const b = el('button'); b.type = 'button'; b.textContent = n; b.dataset.n = n;
    b.addEventListener('click', () => { showing = n; paintLog(true); });
    tabs.append(b);
  }
  const mHead = el('h3'); mHead.textContent = th ? 'Serial (USB) ของแต่ละบอร์ด' : 'USB Serial monitor';
  mon.append(tabs, pre);
  const rNote = el('p', 'fw-note');
  rNote.innerHTML = th
    ? 'โค้ดจริง: <b>Controller_v7.ino</b> และ <b>robot_firmware_v7.ino</b> คอมไพล์เป็น WebAssembly โดยไม่แก้สักบรรทัด (ไฟล์ละ ~17 KB) ส่วนที่จำลองขึ้น: วิทยุ XBee อากาศ ตัวถัง และ MPU6050'
    : 'Real code: <b>Controller_v7.ino</b> and <b>robot_firmware_v7.ino</b>, compiled to WebAssembly without changing a line (~17 KB each). Simulated: the XBee radios, the air, the chassis and the MPU6050.';
  rCol.append(rHead, chans, airRow, fHead, bytes, oHead, outs, lift, mHead, mon, rNote);
  root.append(cCol, arena, rCol);

  // ---------------------------------------------------------------- input plumbing
  function sync() {
    const k = c => (keys.has(c) ? 1 : 0), cl = v => Math.max(-1, Math.min(1, v));
    sim.input.ly = cl(pad.ly + k('w') - k('s'));
    sim.input.lx = cl(pad.lx + k('d') - k('a'));
    sim.input.rx = cl(pad.rx + k('e') - k('q'));
    sim.input.ry = cl(pad.ry + k('i') - k('k'));
    sim.input.btn = new Set([...held, ...[...keys].map(c => KEYMAP[c]).filter(Boolean)]);
    for (const [n, b] of Object.entries(btnEls)) b.classList.toggle('down', sim.input.btn.has(n));
    togL.setAttribute('aria-pressed', String(sim.input.togL));
    togR.setAttribute('aria-pressed', String(!sim.input.togR));
  }
  const DRIVE = new Set(['w', 'a', 's', 'd', 'q', 'e', 'i', 'k', ...Object.keys(KEYMAP)]);
  root.addEventListener('keydown', e => {
    const c = e.key.toLowerCase();
    if (!DRIVE.has(c) || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('select')) return;
    e.preventDefault(); keys.add(c); sync();
  });
  root.addEventListener('keyup', e => { if (keys.delete(e.key.toLowerCase())) sync(); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { keys.clear(); sync(); } });
  cv.addEventListener('pointerdown', () => cv.focus());
  sync();

  function hold(b, k) {
    const off = () => { if (held.delete(k)) sync(); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); held.add(k); sync(); ctx.sfx.click(); });
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); held.add(k); sync(); } });
    b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') off(); });
  }
  function stick(label, set) {
    const s = el('div', 'fw-stick'), knob = el('i'), cap = el('b');
    cap.textContent = label; s.append(knob, cap);
    s.setAttribute('role', 'img'); s.setAttribute('aria-label', label);
    const move = e => {
      const r = s.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / (R * 0.7), y = -(e.clientY - r.top - R) / (R * 0.7);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      knob.style.transform = `translate(${x * R * 0.55}px, ${-y * R * 0.55}px)`;
      set(x, y); sync();
    };
    s.addEventListener('pointerdown', e => { s.setPointerCapture(e.pointerId); move(e); });
    s.addEventListener('pointermove', e => { if (s.hasPointerCapture(e.pointerId)) move(e); });
    const end = () => { knob.style.transform = ''; set(0, 0); sync(); };
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
    return s;
  }

  // ---------------------------------------------------------------- firmware output
  const lastScan = { controller: null, robot: null };
  let lastFrame = null, frames = 0, fps = 0, fpsT = 0;
  sim.on('serial', (n, line) => {
    const L = logs[n];
    if (/^\.+$/.test(line) && L.length && /^\.+$/.test(L[L.length - 1])) L[L.length - 1] += line;   // handshake dots
    else L.push(line);
    if (L.length > 300) L.splice(0, L.length - 300);
    if (n === showing) dirtyLog = true;
  });
  sim.on('scan', (n, dbm) => { lastScan[n] = dbm; });
  sim.on('tx', (from, p, ch, ok) => { if (from === 'controller' && p[1] === 0x43) { lastFrame = p; if (ok) frames++; } });
  function paintLog(force) {
    if (!dirtyLog && !force) return;
    dirtyLog = false;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.n === showing));
    const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
    pre.textContent = logs[showing].join('\n');
    if (atEnd || force) pre.scrollTop = pre.scrollHeight;
  }
  const chip = (t, cls) => { const c = el('span', 'fw-chip' + (cls ? ' ' + cls : '')); c.textContent = t; return c; };
  function paintUi(s, now) {
    led.classList.toggle('on', s.ctl.led);
    const key = [s.ctl.state, s.ctl.phase, s.ctl.speed, s.ctl.creep, sim.input.togR].join();
    if (cState.dataset.k !== key) {
      cState.dataset.k = key;
      cState.replaceChildren(
        chip(s.ctl.state, s.ctl.state === 'DRIVING' ? 'ok' : ''),
        chip(PHASES[s.ctl.phase]),
        chip(s.ctl.creep ? 'CREEP 10%' : s.ctl.speed === 1 ? 'FULL 100%' : 'MED 30%'),
        ...(sim.input.togR ? [] : [chip('SAFETY', 'bad')]),
      );
    }
    bState.textContent = `robot ${s.bot.state}${s.bot.failsafe ? ' · FAIL-SAFE' : ''}${s.bot.state === 'DRIVING' && s.bot.locked ? ' · heading lock' : ''}`;
    bState.className = 'fw-chip' + (s.bot.failsafe ? ' bad' : s.bot.state === 'DRIVING' ? ' ok' : '');
    const scan = lastScan.robot || lastScan.controller;
    const black = s.ctl.state === 'DRIVING' ? s.ctl.black : (s.bot.local | s.ctl.local);
    chEls.forEach((b, i) => {
      const ch = 11 + i, dbm = scan ? scan[i] : -95;
      b.firstChild.style.height = Math.max(6, Math.min(100, (dbm + 95) * 1.9)) + '%';
      b.classList.toggle('hot', !!(black & (1 << i)));
      b.classList.toggle('jam', sim.air.jam.has(ch));
      b.classList.toggle('cur', s.ctl.radio === ch || s.bot.radio === ch);
    });
    if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
    link.textContent = s.ctl.radio === s.bot.radio ? `CH ${s.ctl.radio} · ${mhz(s.ctl.radio)} MHz · ${fps} fr/s` : `ctl CH ${s.ctl.radio} ≠ robot CH ${s.bot.radio}`;
    link.className = 'fw-chip' + (fps > 20 ? ' ok' : s.ctl.radio === s.bot.radio ? '' : ' bad');
    if (lastFrame) lastFrame.forEach((v, i) => { const t = hex(v); if (cells[i].textContent !== t) cells[i].textContent = t; });
    for (const [k, e] of Object.entries(outEls)) e.classList.toggle('on', s.bot.out[k]);
    s.bot.steps.forEach((v, i) => { liftEls[i].bar.style.setProperty('--p', Math.min(100, v / 40) + '%'); liftEls[i].v.textContent = v; });
    paintLog();
  }

  // ---------------------------------------------------------------- drawing
  const g = cv.getContext('2d');
  function draw(s) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#080b0f'; g.fillRect(0, 0, w, h);
    // the floor fills the space between the overlay row and the hint line
    const top = over.offsetTop + over.offsetHeight + 12, bottom = h - hint.offsetHeight - 16;
    const sc = Math.min((w - 24) / FIELD[0], (bottom - top) / FIELD[1]), cx = w / 2, cy = (top + bottom) / 2;
    const X = x => cx + x * sc, Y = y => cy - y * sc;
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = -FIELD[0] / 2; x <= FIELD[0] / 2 + 1e-6; x += 0.5) { g.moveTo(X(x), Y(-FIELD[1] / 2)); g.lineTo(X(x), Y(FIELD[1] / 2)); }
    for (let y = -FIELD[1] / 2; y <= FIELD[1] / 2 + 1e-6; y += 0.5) { g.moveTo(X(-FIELD[0] / 2), Y(y)); g.lineTo(X(FIELD[0] / 2), Y(y)); }
    g.stroke();
    g.strokeStyle = 'rgba(236,154,90,.5)'; g.strokeRect(X(-FIELD[0] / 2), Y(FIELD[1] / 2), FIELD[0] * sc, FIELD[1] * sc);
    g.fillStyle = '#7d8796'; g.font = '10px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(th ? 'ตาราง 0.5 ม.' : 'grid 0.5 m', X(-FIELD[0] / 2) + 4, Y(-FIELD[1] / 2) - 5);

    const B = sim.body, half = BOT / 2 * sc;
    g.save();
    g.translate(X(B.x), Y(B.y)); g.rotate(B.angleZ * Math.PI / 180);
    if (s.bot.state === 'DRIVING' && s.bot.locked) {    // the heading the gyro PD is holding
      g.save(); g.rotate((s.bot.target - B.angleZ) * Math.PI / 180);
      g.strokeStyle = 'rgba(126,226,168,.6)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -half * 1.7); g.stroke(); g.restore();
    }
    g.fillStyle = '#141a21'; g.strokeStyle = s.bot.failsafe ? '#ff6b5b' : '#ec9a5a'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(-half, -half, half * 2, half * 2, 6); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-half * 0.3, -half * 0.5); g.lineTo(0, -half * 0.82); g.lineTo(half * 0.3, -half * 0.5); g.stroke();
    // wheels FL FR BL BR; the bar is the PWM the firmware is writing, along the wheel's drive axis
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
      const wx = sx * half * 0.78, wy = sy * half * 0.7, ww = half * 0.26, wh = half * 0.5;
      g.fillStyle = '#0a0d11'; g.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      g.save(); g.beginPath(); g.rect(wx - ww / 2, wy - wh / 2, ww, wh); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.beginPath();
      const d = sx * sy > 0 ? 1 : -1;                    // rollers at 45°, mirrored per corner (X layout)
      for (let k = -3; k <= 3; k++) { g.moveTo(wx - ww, wy + k * wh / 6 - d * ww); g.lineTo(wx + ww, wy + k * wh / 6 + d * ww); }
      g.stroke(); g.restore();
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.strokeRect(wx - ww / 2, wy - wh / 2, ww, wh);
      const v = B.wheel[i] / 255;
      if (v) {
        const tip = wy - v * half * 0.85;
        g.strokeStyle = '#ffb47c'; g.lineWidth = 2.5; g.beginPath();
        g.moveTo(wx, wy); g.lineTo(wx, tip);
        g.moveTo(wx - 4, tip + Math.sign(v) * 5); g.lineTo(wx, tip); g.lineTo(wx + 4, tip + Math.sign(v) * 5);
        g.stroke();
      }
    });
    if (s.bot.ir && (performance.now() / 120 | 0) % 2) { g.fillStyle = '#ff6b5b'; g.beginPath(); g.arc(0, -half, 4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  // ---------------------------------------------------------------- loop
  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 50); last = now;
    if (!root.isConnected || root.closest('[hidden]')) return;   // minimised: the boards wait
    try {
      sim.advance(dt * +speedSel.value, 10);
      const s = sim.state();
      draw(s); paintUi(s, now);
    } catch (e) {
      cancelAnimationFrame(raf);
      console.error('fw', e);
      hint.textContent = 'firmware stopped: ' + e.message;
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    focus() { cv.focus({ preventScroll: true }); },
    dispose() { cancelAnimationFrame(raf); style.remove(); },
  };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function tool(label, fn) { const b = el('button', 'fw-tool'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); return b; }
