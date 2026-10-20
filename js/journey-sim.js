/* Journey sims: 2D canvas replays of code I wrote, no three.js.
   ros: BATLY R1 on my SLAM map, Nav2-style planning and my loop_navigator node.
   abu: my ABU Robocon 2026 controller → radio frame → robot firmware chain (mecanum mix, ramp, heading lock, failsafe). */

const COPPER = '#ec9a5a';
const MONO = '500 11px "JetBrains Mono", ui-monospace, monospace';

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/* Same contract as journey-3d's loop: only runs while on screen and the tab is visible. */
function loop(el, step) {
  let seen = false, raf = 0, last = 0, dead = false;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    try { step(dt); } catch (err) { dead = true; raf = 0; console.error('journey sim', err); return; }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const run = seen && !document.hidden && !dead;
    if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { rootMargin: '80px' }).observe(el);
  document.addEventListener('visibilitychange', sync);
}

function terminal(pre, max = 160) {
  const lines = [];
  return {
    print(s) {
      lines.push(...String(s).split('\n'));
      if (lines.length > max) lines.splice(0, lines.length - max);
      pre.textContent = lines.join('\n');
      pre.scrollTop = pre.scrollHeight;
    },
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

/* =================================================================== ROS 2 */
/* The map is my SLAM map (Apipath_map.pgm), thresholded into 255 free / 0 occupied / 128 unknown /
   200 free-but-outside-the-room. Its yaml (origin, resolution) was not kept, so 0.05 m per cell and
   the origin cell are assumptions: station spacing is true to the recorded poses, placement is not. */
const RES = 0.05, ORIGIN = [144, 194];
const STATIONS = [
  { id: 'A', name: 'Station A - Receiving', x: 0.1691, y: 2.9975, yaw: -2.162 },
  { id: 'B', name: 'Station B - Assembly', x: -0.6101, y: 2.3805, yaw: -0.414 },
  { id: 'C', name: 'Station C - QC', x: -0.6888, y: 1.8841, yaw: 1.022 },
];
const NUM_LOOPS = 2, SETTLE_SEC = 1.5;
const SID = '<student-id>';                 // the package is named after my student ID; kept off the public page
const ROBOT_R = 0.19;                       // BATLY R1 footprint radius, m
const V_MAX = 0.3, W_MAX = 1.2;             // m/s, rad/s
const LIDAR_RANGE = 12, LIDAR_RAYS = 240;   // RPLIDAR C1

const w2c = (x, y) => [ORIGIN[0] + x / RES, ORIGIN[1] - y / RES];
const c2w = (cx, cy) => [(cx - ORIGIN[0]) * RES, (ORIGIN[1] - cy) * RES];

class Heap {
  constructor() { this.a = []; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], end = a.pop();
    if (a.length) {
      a[0] = end; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

export async function initRos(root) {
  const canvas = root.querySelector('canvas'), pre = root.querySelector('[data-log]');
  const runBtn = root.querySelector('[data-run]'), stopBtn = root.querySelector('[data-stop]');
  const term = terminal(pre);

  const img = new Image(); img.src = 'img/j/batly-map.png'; await img.decode();
  const W = img.width, H = img.height, N = W * H;
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0);
  const px = octx.getImageData(0, 0, W, H).data;
  const grid = new Uint8Array(N);
  for (let i = 0; i < N; i++) grid[i] = px[i * 4];

  // Distance (cells) to the nearest non-free cell: drives both inflation and the lethal footprint.
  const dist = new Float32Array(N).fill(1e9);
  { const q = []; for (let i = 0; i < N; i++) if (grid[i] !== 255) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx, d = dist[i] + (dx && dy ? 1.414 : 1);
        if (d < dist[j]) { dist[j] = d; q.push(j); }
      }
    } }
  const LETHAL = ROBOT_R / RES;
  const cost = i => dist[i] <= LETHAL ? Infinity : 1 + 8 * Math.exp(-0.45 * (dist[i] - LETHAL));

  // Pre-render map + costmap once.
  const mapImg = octx.createImageData(W, H);
  for (let i = 0; i < N; i++) {
    const g = grid[i]; let c;
    if (g === 0) c = [214, 221, 230];
    else if (g === 128) c = [14, 18, 23];
    else if (g === 200) c = [21, 26, 33];
    else if (dist[i] <= LETHAL) c = [64, 40, 52];
    else { const t = Math.exp(-0.45 * (dist[i] - LETHAL)); c = [31 + 30 * t, 38 + 8 * t, 47 + 10 * t]; }
    mapImg.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  octx.putImageData(mapImg, 0, 0);
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  // Frame the navigable room, not the stray scan rays around it.
  for (let i = 0; i < N; i++) if (dist[i] > LETHAL + 1) { const x = i % W, y = (i / W) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  bx0 -= 10; by0 -= 10; bx1 += 10; by1 += 10;

  function astar(sx, sy, gx, gy) {
    const s = sy * W + sx, g = gy * W + gx;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H || !isFinite(cost(g))) return null;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = i => Math.hypot(i % W - gx, ((i / W) | 0) - gy);
    const heap = new Heap(); gs[s] = 0; heap.push(h(s), s);
    while (heap.size) {
      const i = heap.pop(); if (closed[i]) continue; closed[i] = 1;
      if (i === g) break;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx, c = cost(j); if (!isFinite(c) || closed[j]) continue;
        const ng = gs[i] + c * (dx && dy ? 1.414 : 1);
        if (ng < gs[j]) { gs[j] = ng; from[j] = i; heap.push(ng + h(j), j); }
      }
    }
    if (from[g] < 0 && g !== s) return null;
    const path = []; for (let i = g; i >= 0; i = from[i]) { path.push(c2w(i % W + 0.5, ((i / W) | 0) + 0.5)); if (i === s) break; }
    return path.reverse();
  }

  // Start where SLAM started (map origin), nudged into free space if the assumed origin is tight.
  let start = ORIGIN.slice();
  if (!(dist[start[1] * W + start[0]] > LETHAL + 2)) {
    let best = Infinity;
    for (let i = 0; i < N; i++) if (dist[i] > LETHAL + 3) { const d = Math.hypot(i % W - ORIGIN[0], ((i / W) | 0) - ORIGIN[1]); if (d < best) { best = d; start = [i % W, (i / W) | 0]; } }
  }
  const [sx0, sy0] = c2w(start[0] + 0.5, start[1] + 0.5);
  const bot = { x: sx0, y: sy0, th: Math.PI / 2, v: 0, w: 0 };
  let spread = 0.35;                                            // AMCL cloud sigma, shrinks as the robot moves
  const parts = Array.from({ length: 70 }, () => [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  const est = () => ({ x: bot.x + (Math.random() - 0.5) * 0.02, y: bot.y + (Math.random() - 0.5) * 0.02, th: wrapPi(bot.th + (Math.random() - 0.5) * 0.02) });

  let nav = null;      // { path, goal: {x,y,yaw|null}, i, onDone }
  let mission = null;  // { wps, cur, wait, after }
  let scan = [], scanT = 0, click = null;

  function navigate(goal, onDone) {
    const s = w2c(bot.x, bot.y), g = w2c(goal.x, goal.y);
    const path = astar(s[0] | 0, s[1] | 0, g[0] | 0, g[1] | 0);
    if (!path) { term.print('[planner_server] Failed to create plan: goal is in an obstacle or unknown space.'); nav = null; return false; }
    nav = { path, goal, i: 0, onDone };
    return true;
  }

  // Raycast in cell space; anything that isn't known-free stops the beam.
  function doScan() {
    scan = [];
    const [cx, cy] = w2c(bot.x, bot.y), maxC = LIDAR_RANGE / RES;
    for (let k = 0; k < LIDAR_RAYS; k++) {
      const a = bot.th + (k / LIDAR_RAYS) * Math.PI * 2, dx = Math.cos(a), dy = -Math.sin(a);
      for (let r = LETHAL * 0.6; r < maxC; r += 0.5) {
        const x = (cx + dx * r) | 0, y = (cy + dy * r) | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        if (grid[y * W + x] !== 255) { scan.push([cx + dx * r, cy + dy * r]); break; }
      }
    }
  }

  function printPose(name) {
    const p = est();
    term.print(`[POSE]  ${name}\n        x=${p.x.toFixed(4)}  y=${p.y.toFixed(4)}  yaw=${p.th.toFixed(4)} rad`);
  }

  // Mirrors loop_navigator.py's feedback callback: arrival, settle, pose, loop header, next heading.
  function nextWaypoint() {
    const m = mission, wp = m.wps[m.cur];
    const ok = navigate(wp, () => {
      m.wait = SETTLE_SEC;
      m.after = () => {
        term.print(`\n[NAV]  Arrived at ${wp.name}!`); printPose(wp.name);
        if (m.cur === m.wps.length - 1) {
          term.print('\n[NAV]  Mission complete - all loops finished!');
          mission = null; runBtn.disabled = false; return;
        }
        m.cur++;
        if (m.cur % STATIONS.length === 0) term.print(`\n---------- Loop ${m.cur / STATIONS.length + 1} / ${NUM_LOOPS} ----------`);
        term.print(`[NAV]  Heading to ${m.wps[m.cur].name}...`);
        nextWaypoint();
      };
    });
    if (!ok) { mission = null; runBtn.disabled = false; }
  }

  runBtn.addEventListener('click', () => {
    if (mission) return;
    const wps = Array.from({ length: NUM_LOOPS }, () => STATIONS).flat();
    term.print(`\n$ ros2 run ${SID}_nav loop_navigator`);
    term.print('='.repeat(52) + '\n   Loop Navigator - Student ' + SID + '\n' + `   Stations : ${STATIONS.length}   |   Loops : ${NUM_LOOPS}\n` + '='.repeat(52));
    term.print('[NAV]  Waiting for Nav2 FollowWaypoints server...\n[NAV]  Nav2 ready. Starting mission.');
    term.print(`\n---------- Loop 1 / ${NUM_LOOPS} ----------\n[NAV]  Heading to ${wps[0].name}...`);
    mission = { wps, cur: 0, wait: 0, after: null };
    runBtn.disabled = true;
    nextWaypoint();
  });
  const interrupt = () => { term.print('^C\n[NAV]  Interrupted by user.'); mission = null; nav = null; runBtn.disabled = false; };
  stopBtn.addEventListener('click', () => { if (mission || nav) interrupt(); });

  let view = { s: 1, ox: 0, oy: 0 };
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left - view.ox) / view.s, cy = (e.clientY - r.top - view.oy) / view.s;
    const [x, y] = c2w(cx, cy);
    if (mission) interrupt();
    click = { x, y, t: 1 };
    term.print(`\n[rviz2] Nav2 Goal  x=${x.toFixed(2)}  y=${y.toFixed(2)}`);
    if (navigate({ x, y, yaw: null }, () => term.print('[bt_navigator] Goal succeeded'))) term.print(`[planner_server] Plan: ${nav.path.length} poses`);
  });

  term.print('$ ros2 launch batly_nav nav.launch.py\n[lifecycle_manager_navigation]: Managed nodes are active');

  const sim = dt => {
    // Pure pursuit on the global plan; rotate in place when the heading error is large.
    let v = 0, w = 0;
    if (mission && mission.wait > 0) {
      mission.wait -= dt;
      if (mission.wait <= 0) { const f = mission.after; mission.after = null; f && f(); }
    } else if (nav) {
      const p = nav.path, g = nav.goal;
      while (nav.i < p.length - 1 && Math.hypot(p[nav.i][0] - bot.x, p[nav.i][1] - bot.y) < 0.3) nav.i++;
      const tgt = p[nav.i], dg = Math.hypot(g.x - bot.x, g.y - bot.y);
      if (dg > 0.08 && !nav.turning) {
        const e = wrapPi(Math.atan2(tgt[1] - bot.y, tgt[0] - bot.x) - bot.th);
        w = clamp(2.2 * e, -W_MAX, W_MAX);
        v = Math.abs(e) > 0.7 ? 0 : V_MAX * (1 - Math.abs(e) / 0.9) * Math.min(1, dg / 0.35 + 0.25);
      } else if (g.yaw != null && Math.abs(wrapPi(g.yaw - bot.th)) > 0.06) {
        nav.turning = true; w = clamp(2.2 * wrapPi(g.yaw - bot.th), -W_MAX, W_MAX);
      } else { const done = nav.onDone; nav = null; done && done(); }
    }
    bot.v += (v - bot.v) * Math.min(1, dt * 6); bot.w += (w - bot.w) * Math.min(1, dt * 8);
    bot.th = wrapPi(bot.th + bot.w * dt);
    bot.x += Math.cos(bot.th) * bot.v * dt; bot.y += Math.sin(bot.th) * bot.v * dt;
    spread = Math.max(0.035, spread * Math.exp(-(Math.abs(bot.v) * 2.2 + Math.abs(bot.w) * 0.35) * dt));
    for (const q of parts) { q[0] = (q[0] + (Math.random() - 0.5) * 0.25) * 0.97; q[1] = (q[1] + (Math.random() - 0.5) * 0.25) * 0.97; }
    scanT -= dt; if (scanT <= 0) { scanT = 0.1; doScan(); }
    if (click) click.t -= dt * 0.8;
  };

  loop(canvas, dt => {
    sim(dt / 2); sim(dt / 2); sim(dt / 2); sim(dt / 2);                // replay at 2×
    const { ctx, w, h } = fit(canvas); if (!w) return;
    const bw = bx1 - bx0, bh = by1 - by0, s = Math.min(w / bw, h / bh);
    view = { s, ox: (w - bw * s) / 2 - bx0 * s, oy: (h - bh * s) / 2 - by0 * s };
    ctx.fillStyle = '#0e1217'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(s, s);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(oc, 0, 0);
    const L = 1 / s;                                                    // one CSS pixel in cell units
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = L;     // 1 m grid
    for (let gx = ORIGIN[0] % 20; gx < W; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = ORIGIN[1] % 20; gy < H; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.font = `600 ${11 * L}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const st of STATIONS) {
      const [cx, cy] = w2c(st.x, st.y);
      ctx.strokeStyle = COPPER; ctx.lineWidth = 1.5 * L;
      ctx.setLineDash([1.5, 1.5]); ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(st.yaw) * 7, cy - Math.sin(st.yaw) * 7); ctx.stroke();
      ctx.fillStyle = COPPER; ctx.fillText(st.id, cx - Math.cos(st.yaw) * 9, cy + Math.sin(st.yaw) * 9);
    }
    if (nav) {
      ctx.strokeStyle = '#4fd18b'; ctx.lineWidth = 2 * L; ctx.beginPath();
      nav.path.forEach(([x, y], i) => { const [cx, cy] = w2c(x, y); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.stroke();
    }
    if (click && click.t > 0) {
      const [cx, cy] = w2c(click.x, click.y); ctx.strokeStyle = `rgba(79,209,139,${click.t})`; ctx.lineWidth = 1.5 * L;
      ctx.beginPath(); ctx.arc(cx, cy, 3 + (1 - click.t) * 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#ff5a4e';
    for (const [x, y] of scan) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    const [rc, rr] = w2c(bot.x, bot.y);
    ctx.strokeStyle = 'rgba(58,160,255,.75)'; ctx.lineWidth = L;
    for (const q of parts) {
      const x = rc + q[0] * spread * 2 / RES, y = rr + q[1] * spread * 2 / RES, a = -(bot.th + q[2] * spread * 1.5);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2); ctx.stroke();
    }
    ctx.translate(rc, rr); ctx.rotate(-bot.th);
    const R = ROBOT_R / RES;
    ctx.fillStyle = COPPER; ctx.strokeStyle = '#fff4e8'; ctx.lineWidth = 1.5 * L;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R * 0.85, 0); ctx.lineTo(-R * 0.3, R * 0.5); ctx.lineTo(-R * 0.3, -R * 0.5); ctx.closePath(); ctx.fillStyle = '#10141a'; ctx.fill();
    ctx.restore();
    ctx.font = MONO; ctx.fillStyle = 'rgba(230,236,243,.55)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const pose = `/amcl_pose  x ${bot.x.toFixed(2)}  y ${bot.y.toFixed(2)}  yaw ${bot.th.toFixed(2)}`, tw = ctx.measureText(pose).width;
    ctx.fillStyle = 'rgba(14,18,23,.85)'; ctx.fillRect(w - tw - 20, h - 26, tw + 16, 22);
    ctx.fillStyle = 'rgba(230,236,243,.6)'; ctx.fillText(pose, w - 12, h - 10);
  });
}

/* ================================================================== ABU 2026 */
/* Constants and logic are lifted from Controller_v7.ino and robot_firmware_v6.ino. Only the plant is
   made up: wheel value 255 ≈ 1.6 m/s, 255 of rotation ≈ 220 °/s, and the robot loop runs ~1 kHz. */
const SOF = 0xAA, VER_DRIVE = 0x43;
const ACCEL = 30, DECEL = 20;                 // MOTOR_ACCEL_STEP / MOTOR_DECEL_STEP
const KP = 0.8, KD = 0.02;                    // Kp_Lock / Kd_Lock
const PHASES = [['MARTIAL', 1.0], ['FOREST', 0.8], ['ARENA', 0.6]];
const LIN = 1.6 / 255, ROT = 220 / 255;
const field = (w, h) => (w >= h ? [8, 5] : [5, 8]);   // m, generic practice floor; portrait on phones
const BOT = 0.8;                              // chassis side, m

function crc8(a, n) {
  let c = 0;
  for (let i = 0; i < n; i++) { c ^= a[i]; for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff; }
  return c;
}
const ctrunc = v => (v < 0 ? Math.ceil(v) : Math.floor(v));   // C int conversion truncates toward zero

export function initAbu(root) {
  const canvas = root.querySelector('canvas'), log = terminal(root.querySelector('[data-log]'), 40);
  const frameEl = root.querySelector('[data-frame]');
  const btn = n => root.querySelector(`[data-act="${n}"]`);

  const ctl = { mode: 1, creep: false, phase: 0, swL: false, lx: 0, ly: 0, rx: 0, link: true };
  const keys = new Set();
  const fw = { state: 'DRIVING', angleZ: 0, target: 0, locked: true, s: [0, 0, 0, 0], lastRx: 0, lostAt: 0, hs: 0 };
  const body = { x: 0, y: 0, vf: 0, vs: 0, w: 0 };
  let t = 0, acc = 0, pkt = new Uint8Array(10), shown = 0;

  const label = () => {
    btn('speed').querySelector('[data-v]').textContent = ctl.mode === 1 ? 'FULL 100%' : 'MED 30%';
    btn('creep').setAttribute('aria-pressed', ctl.creep);
    btn('phase').querySelector('[data-v]').textContent = `${PHASES[ctl.phase][0]} ×${PHASES[ctl.phase][1].toFixed(1)}`;
    btn('link').setAttribute('aria-pressed', !ctl.link);
  };
  btn('speed').addEventListener('click', () => { ctl.mode = ctl.mode % 2 + 1; label(); });
  btn('creep').addEventListener('click', () => { ctl.creep = !ctl.creep; label(); });
  btn('phase').addEventListener('click', () => { ctl.phase = (ctl.phase + 1) % 3; log.print(`[PHASE] -> ${PHASES[ctl.phase][0]} (x${PHASES[ctl.phase][1].toFixed(1)})`); label(); });
  btn('heading').addEventListener('click', () => { ctl.swL = true; });
  btn('bump').addEventListener('click', () => { fw.angleZ += (Math.random() < 0.5 ? -1 : 1) * 28; body.vs += 0.6; });
  btn('link').addEventListener('click', () => { ctl.link = !ctl.link; log.print(ctl.link ? '[radio] link restored' : '[radio] link cut'); label(); });
  label();

  for (const pad of root.querySelectorAll('[data-pad]')) {
    const knob = pad.querySelector('i'), side = pad.dataset.pad;
    const set = (x, y) => {
      if (side === 'L') { ctl.lx = x; ctl.ly = y; } else { ctl.rx = x; y = 0; }
      knob.style.transform = `translate(${x * 30}px, ${-y * 30}px)`;
    };
    const move = e => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / (R * 0.75), y = -(e.clientY - r.top - R) / (R * 0.75);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      set(x, y);
    };
    pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); move(e); });
    pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) move(e); });
    const end = () => set(0, 0);
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  }
  const DRIVE_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  canvas.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (DRIVE_KEYS.includes(k)) { e.preventDefault(); keys.add(k); } });
  canvas.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', () => canvas.focus());

  // Controller_v7: one drive packet every 20 ms.
  function controllerTick() {
    const k = c => keys.has(c) ? 1 : 0;
    let driveY = clamp(ctl.ly + k('w') + k('arrowup') - k('s') - k('arrowdown'), -1, 1);
    let driveX = clamp(ctl.lx + k('d') - k('a'), -1, 1);
    let driveT = clamp(ctl.rx + k('e') + k('arrowright') - k('q') - k('arrowleft'), -1, 1);
    const speedMult = (ctl.creep ? 0.1 : ctl.mode === 1 ? 1.0 : 0.3) * PHASES[ctl.phase][1];
    if (ctl.creep) driveT = 0;
    if (Math.abs(driveY) > 0.4 && Math.abs(driveX) < 0.25) driveX = 0;
    if (Math.abs(driveX) > 0.4 && Math.abs(driveY) < 0.25) driveY = 0;
    if (Math.abs(driveT) < 0.10) driveT = 0;
    const vy = ctrunc(driveY * 255 * speedMult), vx = ctrunc(driveX * 255 * speedMult), vt = ctrunc(driveT * 255 * speedMult);
    const aux = (ctl.swL ? 1 << 1 : 0) | (ctl.creep ? 1 << 2 : 0); ctl.swL = false;
    const b = v => clamp(ctrunc(v / 2) + 128, 0, 255);
    pkt = Uint8Array.from([SOF, VER_DRIVE, 0, aux, b(vx), b(vy), b(vt), ctl.mode, 128, 0]);
    pkt[9] = crc8(pkt, 9);
    return pkt;
  }

  function ramp(i, target) {
    const cur = fw.s[i], diff = target - cur;
    const same = (cur > 0 && target >= 0) || (cur < 0 && target <= 0);
    const step = same && Math.abs(target) < Math.abs(cur) ? DECEL : ACCEL;
    fw.s[i] = Math.abs(diff) <= step ? target : cur + (diff > 0 ? step : -step);
  }
  function mecanumRamped(vy, vx, vt) {
    vx = -vx; vt = -vt;
    let w4 = [vy + vx + vt, vy - vx - vt, vy - vx + vt, vy + vx - vt];   // FL FR BL BR
    const mx = Math.max(...w4.map(Math.abs));
    if (mx > 255) w4 = w4.map(v => ctrunc(v * 255 / mx));
    w4.forEach((v, i) => ramp(i, v));
  }
  const resetLock = () => { fw.target = fw.angleZ; fw.locked = false; };

  // robot_firmware_v6, STATE_DRIVING: handle one received drive frame.
  function robotRx(p, gyroZ) {
    fw.lastRx = t; fw.lostAt = 0;
    const aux = p[3];
    const vx = (p[4] - 128) * 2, vy = (p[5] - 128) * 2; let vt = (p[6] - 128) * 2;
    if (aux & (1 << 1)) resetLock();
    if (Math.abs(vt) > 15) resetLock();
    else {
      if (!fw.locked) { resetLock(); fw.locked = true; }
      let err = fw.target - fw.angleZ;
      if (err > 180) err -= 360;
      if (err < -180) err += 360;
      vt = ctrunc(clamp(err * KP - gyroZ * KD, -50, 50));
    }
    mecanumRamped(vy, vx, vt);
  }

  const STEP = 0.02;
  function tick() {
    t += STEP;
    if (fw.state === 'DRIVING') {
      const p = controllerTick();
      if (ctl.link) robotRx(p, body.w);
      else if (t - fw.lastRx > 1.5) {
        if (!fw.lostAt) { fw.lostAt = t; log.print('[FAIL-SAFE] Link lost! Ramping wheels down...'); }
        for (let k = 0; k < 20; k++) mecanumRamped(0, 0, 0);       // loop() spins ~1 kHz while waiting
        if (fw.s.every(v => v === 0) || t - fw.lostAt > 0.5) {
          fw.s = [0, 0, 0, 0]; fw.lostAt = 0; fw.state = 'HANDSHAKE'; fw.hs = t;
          log.print('[FAIL-SAFE] Wheels stopped. Reconnecting...');
        }
      }
    } else if (ctl.link) {
      // HANDSHAKE → SCANNING → EXCHANGING → DRIVING. Real timing depends on the channel scan; shortened here.
      const order = ['HANDSHAKE', 'SCANNING', 'EXCHANGING', 'DRIVING'];
      if (t - fw.hs > 0.45) {
        fw.state = order[order.indexOf(fw.state) + 1]; fw.hs = t; log.print(`[STATE] ${fw.state}`);
        if (fw.state === 'DRIVING') { fw.lastRx = t; resetLock(); fw.locked = true; }
      }
    } else fw.hs = t;

    // Plant: forward kinematics of the smoothed wheel values, with a little lag for mass.
    const [fl, fr, bl, br] = fw.s;
    const vy = (fl + fr + bl + br) / 4, vxn = (fl - fr - bl + br) / 4, vtn = (fl - fr + bl - br) / 4;
    const k = Math.min(1, STEP / 0.08);
    body.vf += (vy * LIN - body.vf) * k; body.vs += (-vxn * LIN - body.vs) * k; body.w += (-vtn * ROT - body.w) * k;
    fw.angleZ += body.w * STEP;
    const a = fw.angleZ * Math.PI / 180;
    body.x += (Math.sin(a) * body.vf + Math.cos(a) * body.vs) * STEP;
    body.y += (Math.cos(a) * body.vf - Math.sin(a) * body.vs) * STEP;
    const F = field(canvas.clientWidth, canvas.clientHeight), lim = [F[0] / 2 - BOT * 0.6, F[1] / 2 - BOT * 0.6];
    body.x = clamp(body.x, -lim[0], lim[0]); body.y = clamp(body.y, -lim[1], lim[1]);
  }

  const NAMES = ['SOF', 'VER', 'btn', 'aux', 'vx', 'vy', 'vt', 'spd', 'lead', 'crc'];
  loop(canvas, dt => {
    acc += dt; while (acc >= STEP) { tick(); acc -= STEP; }
    shown += dt;
    if (shown > 0.1) {
      shown = 0;
      const live = fw.state === 'DRIVING' && ctl.link;
      frameEl.innerHTML = Array.from(pkt, (v, i) => `<span${live ? '' : ' class="dim"'}><b>${v.toString(16).toUpperCase().padStart(2, '0')}</b><small>${NAMES[i]}</small></span>`).join('');
    }

    const { ctx, w, h } = fit(canvas); if (!w) return;
    const FIELD = field(w, h);
    const s = Math.min((w - 24) / FIELD[0], (h - 124) / FIELD[1]);
    ctx.fillStyle = '#0e1217'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, 46 + (h - 124) / 2); ctx.scale(s, s);
    const L = 1 / s;
    ctx.fillStyle = '#161c24'; ctx.fillRect(-FIELD[0] / 2, -FIELD[1] / 2, FIELD[0], FIELD[1]);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = L;
    for (let x = -FIELD[0] / 2; x <= FIELD[0] / 2 + 1e-6; x += 0.5) { ctx.beginPath(); ctx.moveTo(x, -FIELD[1] / 2); ctx.lineTo(x, FIELD[1] / 2); ctx.stroke(); }
    for (let y = -FIELD[1] / 2; y <= FIELD[1] / 2 + 1e-6; y += 0.5) { ctx.beginPath(); ctx.moveTo(-FIELD[0] / 2, y); ctx.lineTo(FIELD[0] / 2, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(236,154,90,.5)'; ctx.lineWidth = 2 * L; ctx.strokeRect(-FIELD[0] / 2, -FIELD[1] / 2, FIELD[0], FIELD[1]);

    ctx.translate(body.x, -body.y);
    if (fw.locked && fw.state === 'DRIVING') {
      ctx.save(); ctx.rotate(fw.target * Math.PI / 180);
      ctx.setLineDash([0.08, 0.08]); ctx.strokeStyle = 'rgba(236,154,90,.8)'; ctx.lineWidth = 1.5 * L;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -1.1); ctx.stroke(); ctx.restore();
    }
    ctx.rotate(fw.angleZ * Math.PI / 180);
    const hb = BOT / 2;
    ctx.fillStyle = 'rgba(236,154,90,.14)'; ctx.strokeStyle = COPPER; ctx.lineWidth = 1.5 * L;
    ctx.beginPath(); ctx.roundRect(-hb, -hb, BOT, BOT, 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COPPER; ctx.beginPath(); ctx.moveTo(0, -hb + 0.05); ctx.lineTo(0.09, -hb + 0.2); ctx.lineTo(-0.09, -hb + 0.2); ctx.closePath(); ctx.fill();
    // Wheels FL FR BL BR. Rollers form an X seen from above; arrows show signed PWM along the drive axis.
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
      const cx = sx * (hb + 0.03), cy = sy * (hb - 0.14);
      ctx.fillStyle = '#2a323d'; ctx.fillRect(cx - 0.05, cy - 0.11, 0.1, 0.22);
      ctx.strokeStyle = 'rgba(214,221,230,.5)'; ctx.lineWidth = L;
      const dir = (i === 0 || i === 3) ? 1 : -1;
      for (let r = -0.08; r <= 0.081; r += 0.04) { ctx.beginPath(); ctx.moveTo(cx - 0.045, cy + r - 0.03 * dir); ctx.lineTo(cx + 0.045, cy + r + 0.03 * dir); ctx.stroke(); }
      const v = fw.s[i] / 255;
      if (Math.abs(v) > 0.01) {
        const len = v * 0.45, ax = cx + sx * 0.12;
        ctx.strokeStyle = v > 0 ? '#4fd18b' : '#ff5a4e'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5 * L;
        ctx.beginPath(); ctx.moveTo(ax, cy); ctx.lineTo(ax, cy - len); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax, cy - len - Math.sign(len) * 0.06); ctx.lineTo(ax - 0.04, cy - len); ctx.lineTo(ax + 0.04, cy - len); ctx.closePath(); ctx.fill();
      }
    });
    ctx.restore();

    ctx.font = MONO; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    const st = fw.state !== 'DRIVING' ? fw.state : !ctl.link ? (fw.lostAt ? 'FAIL-SAFE' : 'NO RX') : 'DRIVING';
    ctx.fillStyle = st === 'DRIVING' ? '#4fd18b' : st === 'NO RX' ? COPPER : '#ff5a4e';
    ctx.fillText(`● ${st}`, 14, h - 62);
    ctx.fillStyle = 'rgba(230,236,243,.6)';
    const f = v => String(v).padStart(4, ' ');
    ctx.fillText(`FL${f(fw.s[0])}  FR${f(fw.s[1])}`, 14, h - 44);
    ctx.fillText(`BL${f(fw.s[2])}  BR${f(fw.s[3])}`, 14, h - 29);
    ctx.fillText(`angleZ ${fw.angleZ.toFixed(1)}°  target ${fw.target.toFixed(1)}°  ${fw.locked ? 'LOCK' : 'free'}`, 14, h - 11);
  });
}
