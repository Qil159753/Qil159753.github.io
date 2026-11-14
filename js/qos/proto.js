// The ABU Robocon 2026 controller protocol, ported from Controller_v7.ino so the bytes qOS shows
// are the bytes the real controller puts on Serial1. (journey-sim.js keeps its own private copy
// of crc8 for the page's ABU sim; this one stays separate so qOS loads without that module.)

export const SOF = 0xAA, VER_HANDSHAKE = 0x42, VER_DRIVE = 0x43;
// XBee 64-bit destination address the controller firmware sends every frame to
const DEST = [0x00, 0x13, 0xA2, 0x00, 0x42, 0x97, 0xCC, 0x16];
export const PHASES = [['MARTIAL', 1.0], ['FOREST', 0.8], ['ARENA', 0.6]];

export function crc8(bytes, len = bytes.length) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b++) crc = crc & 0x80 ? ((crc << 1) ^ 0x31) & 0xFF : (crc << 1) & 0xFF;
  }
  return crc;
}

// BTN / AUX bit positions from the firmware's drive loop
export const BTN_BIT = { cir: 0, tri: 1, up: 2, down: 3, left: 4, right: 5, sq: 6 };
export const AUX_BIT = { cross: 0, swl: 1, swr: 2 };
// LEFT/RIGHT/DOWN/SQ/TRI/SW_R latch through handleToggle(); UP/CIR/CROSS read the pin directly
export const LATCHING = new Set(['left', 'right', 'down', 'sq', 'tri', 'swr']);

const ctrunc = v => (v < 0 ? Math.ceil(v) : Math.floor(v));   // C int conversion truncates toward zero
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// s: { btn:{name:bool}, x, y, t, lead (-1..1), speedMode 1|2, phase 0..2, safety }
export function driveFrame(s) {
  let btn = 0, aux = 0, vx = 0, vy = 0, vt = 0, lead = 0;
  let x = s.x, y = s.y, t = s.t, ry = s.lead;
  if (s.btn.swr) { t = 0; ry = 0; }                 // creep mode disables the right stick
  if (Math.abs(y) > 0.4 && Math.abs(x) < 0.25) x = 0;
  if (Math.abs(x) > 0.4 && Math.abs(y) < 0.25) y = 0;
  if (Math.abs(t) < 0.10) t = 0;
  if (!s.safety) {
    for (const k in BTN_BIT) if (s.btn[k]) btn |= 1 << BTN_BIT[k];
    for (const k in AUX_BIT) if (s.btn[k]) aux |= 1 << AUX_BIT[k];
    const mult = (s.btn.swr ? 0.1 : s.speedMode === 1 ? 1.0 : 0.3) * PHASES[s.phase][1];
    vx = ctrunc(x * 255 * mult); vy = ctrunc(y * 255 * mult); vt = ctrunc(t * 255 * mult);
    lead = ctrunc(ry * 255);
  }
  const b = v => clamp(ctrunc(v / 2) + 128, 0, 255);
  const p = [SOF, VER_DRIVE, btn, aux, b(vx), b(vy), b(vt), s.speedMode, b(lead), 0];
  p[9] = crc8(p, 9);
  return p;
}

// L1: tell the robot which channel to follow, then retune the local XBee (sent three times)
export const CMD_HOP = 0xFE;
export const hopFrame = ch => { const p = [SOF, CMD_HOP, ch, 0, 128, 128, 128, 1, 100, 0]; p[9] = crc8(p, 9); return p; };
export const channelMHz = ch => 2405 + (ch - 11) * 5;

export const handshakeFrame = () => { const p = [SOF, VER_HANDSHAKE, 0, 0, 128, 128, 128, 1, 100, 0]; p[9] = crc8(p, 9); return p; };

export const FIELDS = ['SOF', 'VER', 'BTN', 'AUX', 'VX', 'VY', 'VT', 'SPD', 'LEAD', 'CRC8'];

// sendDrivePacketAPI(): 0x7E, length 21, API id 0x00 (TX, 64-bit address), frame id 0, address, options, payload, checksum
export function xbeeFrame(payload) {
  const f = [0x7E, 0x00, 21, 0x00, 0x00, ...DEST, 0x00, ...payload];
  let sum = 0;
  for (let i = 3; i < f.length; i++) sum += f[i];
  f.push(0xFF - (sum & 0xFF));
  return f;
}
export const XBEE_FIELDS = [[0, 1, 'start'], [1, 2, 'length'], [3, 1, 'API id'], [4, 1, 'frame id'], [5, 8, 'dest addr'], [13, 1, 'options'], [14, 10, 'payload'], [24, 1, 'checksum']];

export const hex = b => b.toString(16).toUpperCase().padStart(2, '0');
