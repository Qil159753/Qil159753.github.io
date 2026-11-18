/* Two virtual Teensys running Q's real ABU firmware, compiled unchanged to WebAssembly
   (tools/fw/build.sh): Controller_v7 and robot_firmware_v7. Around them, the parts that are not code:
   two XBee radios in API mode, the air between them, and the robot's chassis on a floor.

   Each sketch keeps its own microsecond clock (delay() and the I2C read advance it inside the wasm);
   the scheduler always runs one loop() of whichever board is furthest behind, so neither gets ahead
   of the other and radio bytes arrive in the order they were sent. No DOM here, so it also runs in Node. */

const ENC = new TextDecoder();

// Teensy pin numbers, from the #defines at the top of each sketch
export const CTL_PIN = { LEFT: 2, UP: 3, DOWN: 4, RIGHT: 5, SQ: 6, TRI: 7, CIR: 8, CROSS: 9, SW_L: 10, SW_R: 11, L1: 18, R1: 19, TOG_L: 20, TOG_R: 21, MODE: 22, LED: 12 };
const ADC = { LX: 14, LY: 15, RX: 16, RY: 17 };
const MOTORS = [[29, 28], [33, 34], [2, 3], [23, 22]];          // FL FR BL BR as [PWM, DIR]
export const ROBOT_OUT = { GRIPPER: 9, STRETCH: 8, ARM: 5, HAND: 4, WRIST: 6, IR: 17 };
const LIMIT1 = 26, LIMIT2 = 27;

export const CTL_STATES = ['HANDSHAKE', 'SCANNING', 'EXCHANGING', 'DRIVING'];
export const BOT_STATES = ['HANDSHAKE', 'SCANNING', 'WAIT_EXCHANGE', 'DRIVING'];

// Same plant as the journey sim (js/journey-sim.js) so both drive alike.
const LIN = 1.6 / 255, ROT = 220 / 255, TAU = 0.08;
export const FIELD = [8, 5], BOT = 0.8;                          // m, generic practice floor

export const mhz = ch => 2405 + 5 * (ch - 11);                  // 802.15.4 channel centre
const wifiMhz = n => 2412 + 5 * (n - 1);
const ADDR = { controller: [0, 0x13, 0xa2, 0, 0x42, 0x97, 0xcb, 0xc6], robot: [0, 0x13, 0xa2, 0, 0x42, 0x97, 0xcc, 0x16] };

async function board(bytes, name, sim) {
  let mem = null;
  const line = { s: '' };
  const env = {
    js_serial(p, n) {
      line.s += ENC.decode(new Uint8Array(mem.buffer, p, n));
      let i;
      while ((i = line.s.indexOf('\n')) >= 0) { sim.emit('serial', name, line.s.slice(0, i).replace(/\r$/, '')); line.s = line.s.slice(i + 1); }
      if (line.s.length > 400) { sim.emit('serial', name, line.s); line.s = ''; }
    },
    js_radio_tx(p, n, t) { sim.radio.tx(name, new Uint8Array(mem.buffer, p, n).slice(), t >>> 0); },
    js_gyro_z: () => sim.body.w,
    js_angle_z: () => sim.body.angleZ,
  };
  const { instance } = await WebAssembly.instantiate(bytes, { env, wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }) });
  const x = instance.exports;
  mem = x.memory;
  x._initialize?.();
  return { name, x, started: false, inbox: [], now: () => x.fw_now() >>> 0 };
}

export async function createSim(loadWasm) {
  const listeners = {};
  const sim = {
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return sim; },
    emit(ev, ...a) { for (const fn of listeners[ev] || []) fn(...a); },
    body: { x: 0, y: 0, vf: 0, vs: 0, w: 0, angleZ: 0, wheel: [0, 0, 0, 0] },
    air: { cut: false, wifi: 6, jam: new Set() },               // wifi: the Wi-Fi channel nearby, 0 = none
    stats: { sent: 0, delivered: 0, dropped: 0 },
    t: 0,                                                       // µs, the scheduler's target
    rxLayout: 'parser',
  };
  const [cb, rb] = await Promise.all([loadWasm('controller'), loadWasm('robot')]);
  const ctl = await board(cb, 'controller', sim), bot = await board(rb, 'robot', sim);
  const nodes = { controller: ctl, robot: bot };

  // ---------------------------------------------------------------- the air: two XBees, API mode
  const xb = { controller: { ch: 0x0c, hist: [[0, 0x0c]], buf: [] }, robot: { ch: 0x0c, hist: [[0, 0x0c]], buf: [] } };
  // Each board runs ahead in its own steps, so a radio's channel is looked up at the virtual time it mattered.
  const chAt = (n, t) => { const h = xb[n].hist; let i = h.length - 1; while (i > 0 && h[i][0] > t) i--; return h[i][1]; };
  const other = n => (n === 'controller' ? 'robot' : 'controller');
  const wifiHit = ch => sim.air.wifi && Math.abs(mhz(ch) - wifiMhz(sim.air.wifi)) <= 11;
  function noiseDbm(ch) {
    if (sim.air.jam.has(ch)) return -38;
    if (wifiHit(ch)) return -58;
    return -88 + Math.round(Math.random() * 6);
  }
  const lost = ch => sim.air.cut || sim.air.jam.has(ch) || (wifiHit(ch) && Math.random() < 0.35);
  function frame(data, lenField = data.length) {
    let s = 0;
    for (const b of data) s += b;
    return [0x7e, lenField >> 8, lenField & 0xff, ...data, 0xff - (s & 0xff)];
  }
  function deliver(to, bytes, t, air) { nodes[to].inbox.push({ t, bytes, air }); }
  function rxFrame(from, payload) {
    if (sim.rxLayout === 'rx64') return frame([0x80, ...ADDR[from], 0x28, 0x00, ...payload]);   // 802.15.4 legacy RX
    const d = [0x90, ...ADDR[from], 0xff, 0xfe, 0x01, ...payload];
    if (sim.rxLayout === 'zb') return frame(d);                 // the length Digi documents for this frame: 22
    // What both sketches' readAPIPayload() accepts: length byte 21 with the payload at buf[11]. Digi's
    // layout needs 22, so this frame ends at the payload with no checksum byte; a stray trailing byte
    // could be 0x7E and start a bogus frame.
    return [0x7e, 0, 21, ...d];
  }
  function onFrame(from, d, t) {
    const me = xb[from];
    if (d[0] === 0x08) {                                       // AT command
      const id = d[1], cmd = String.fromCharCode(d[2], d[3]);
      if (cmd === 'CH') { me.ch = d[4]; me.hist.push([t, me.ch]); if (me.hist.length > 64) me.hist.splice(1, 32); sim.emit('hop', from, me.ch); deliver(from, frame([0x88, id, 0x43, 0x48, 0]), t + 1000); }
      else if (cmd === 'ED') {
        const dbm = [];
        for (let ch = 11; ch <= 26; ch++) dbm.push(noiseDbm(ch));
        sim.emit('scan', from, dbm);
        deliver(from, frame([0x88, id, 0x45, 0x44, 0, ...dbm.map(v => -v)]), t + 48000);
      }
    } else if (d[0] === 0x00) {                                // TX request, 64-bit address
      const payload = d.slice(11), to = other(from);
      const ch = chAt(from, t);
      sim.stats.sent++;
      if (lost(ch)) { sim.stats.dropped++; sim.emit('tx', from, payload, ch, false); return; }
      deliver(to, rxFrame(from, payload), t + 1200, { from, payload, ch });   // heard only if `to` is on `ch` then
    }
  }
  sim.radio = {
    tx(from, bytes, t) {
      const b = xb[from].buf;
      for (const v of bytes) {
        b.push(v);
        if (b[0] !== 0x7e) { b.length = 0; continue; }
        if (b.length < 3) continue;
        const len = (b[1] << 8) | b[2];
        if (b.length < len + 4) continue;
        const d = b.slice(3, 3 + len);
        let s = b[len + 3];
        for (const v2 of d) s += v2;
        if ((s & 0xff) === 0xff) onFrame(from, d, t);           // a bad API checksum is dropped by the XBee
        b.length = 0;
      }
    },
  };

  // ---------------------------------------------------------------- the controller's hands
  const input = { btn: new Set(), lx: 0, ly: 0, rx: 0, ry: 0, togL: true, togR: true };
  const adc = v => Math.max(0, Math.min(4095, Math.round(2048 + v * 2000)));
  function applyInputs() {
    const x = ctl.x;
    for (const [k, p] of Object.entries(CTL_PIN)) if (k !== 'LED' && k !== 'TOG_L' && k !== 'TOG_R') x.fw_set_in(p, input.btn.has(k) ? 0 : 1);
    x.fw_set_in(CTL_PIN.TOG_L, input.togL ? 1 : 0);             // HIGH = expo curve on
    x.fw_set_in(CTL_PIN.TOG_R, input.togR ? 1 : 0);             // LOW = safety on
    x.fw_set_adc(ADC.LX, adc(input.lx)); x.fw_set_adc(ADC.LY, adc(input.ly));
    x.fw_set_adc(ADC.RX, adc(input.rx)); x.fw_set_adc(ADC.RY, adc(input.ry));
  }
  sim.input = input;

  // ---------------------------------------------------------------- the robot's body
  let physT = 0;
  function physics(toUs) {
    const B = sim.body, x = bot.x;
    while (physT + 1000 <= toUs) {
      physT += 1000;
      const dt = 0.001;
      for (let i = 0; i < 4; i++) B.wheel[i] = (x.fw_pin(MOTORS[i][1]) ? 1 : -1) * x.fw_pwm(MOTORS[i][0]);
      const [fl, fr, bl, br] = B.wheel;
      const vy = (fl + fr + bl + br) / 4, vxn = (fl - fr - bl + br) / 4, vtn = (fl - fr + bl - br) / 4;
      const k = dt / TAU;
      B.vf += (vy * LIN - B.vf) * k; B.vs += (-vxn * LIN - B.vs) * k; B.w += (-vtn * ROT - B.w) * k;
      B.angleZ += B.w * dt;
      const a = B.angleZ * Math.PI / 180;
      B.x += (Math.sin(a) * B.vf + Math.cos(a) * B.vs) * dt;
      B.y += (Math.cos(a) * B.vf - Math.sin(a) * B.vs) * dt;
      const lx = FIELD[0] / 2 - BOT * 0.6, ly = FIELD[1] / 2 - BOT * 0.6;
      if (Math.abs(B.x) > lx) { B.x = Math.sign(B.x) * lx; B.vs *= 0.2; }
      if (Math.abs(B.y) > ly) { B.y = Math.sign(B.y) * ly; B.vf *= 0.2; }
    }
    // both lifts start sitting on their bottom limit switches
    x.fw_set_in(LIMIT1, x.st_steps1() <= 0 ? 0 : 1);
    x.fw_set_in(LIMIT2, x.st_steps2() <= 0 ? 0 : 1);
  }
  sim.bump = deg => { sim.body.angleZ += deg; };

  // ---------------------------------------------------------------- scheduler
  function stepBoard(n) {
    const now = n.now();
    if (n.inbox.length) {
      n.inbox.sort((a, b) => a.t - b.t);
      while (n.inbox.length && n.inbox[0].t <= now) {
        const m = n.inbox.shift();
        if (m.air) {
          const ok = chAt(n.name, m.t) === m.air.ch;
          sim.stats[ok ? 'delivered' : 'dropped']++;
          sim.emit('tx', m.air.from, m.air.payload, m.air.ch, ok);
          if (!ok) continue;
        }
        for (const b of m.bytes) n.x.fw_rx(b);
      }
    }
    if (n === bot) physics(now);
    else applyInputs();
    if (!n.started) { n.started = true; n.x.fw_setup(); }
    else n.x.fw_loop();
  }
  const clock = () => (globalThis.performance || Date).now();
  // Run both boards `ms` further in virtual time, giving up early if the wall-clock budget runs out.
  sim.advance = (ms, budgetMs = 8) => {
    sim.t += ms * 1000;
    const wall = clock();
    for (;;) {
      const n = ctl.now() <= bot.now() ? ctl : bot;
      if (n.now() >= sim.t) break;
      stepBoard(n);
      if (clock() - wall > budgetMs) { sim.t = Math.min(ctl.now(), bot.now()); break; }
    }
  };
  sim.state = () => ({
    ctl: {
      state: CTL_STATES[ctl.x.st_state()], phase: ctl.x.st_phase(), ch: ctl.x.st_channel(), speed: ctl.x.st_speed(),
      creep: !!ctl.x.st_creep(), black: ctl.x.st_blacklist(), local: ctl.x.st_local(), btn: ctl.x.st_btn(), aux: ctl.x.st_aux(),
      led: !!ctl.x.fw_pin(CTL_PIN.LED), t: ctl.now(), radio: xb.controller.ch,
    },
    bot: {
      state: BOT_STATES[bot.x.st_state()], ch: bot.x.st_channel(), black: bot.x.st_blacklist(), local: bot.x.st_local(),
      steps: [bot.x.st_steps1(), bot.x.st_steps2()], locked: !!bot.x.st_locked(), target: bot.x.st_target(),
      failsafe: !!bot.x.st_failsafe(), ir: !!bot.x.st_ir(), t: bot.now(), radio: xb.robot.ch,
      out: Object.fromEntries(Object.entries(ROBOT_OUT).map(([k, p]) => [k, !!bot.x.fw_pin(p)])),
    },
  });
  return sim;
}
