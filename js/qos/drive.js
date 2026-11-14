// drive: BATLY R1 in a dark mock factory. Its LiDAR builds a log-odds occupancy grid as you drive
// (walls rise where returns land), and once you've visited A → B → C the Nav2-style autopilot
// (A* over the map you made, inflated by the robot's radius, followed with pure pursuit) can run
// the loop by itself, twice, the way Q's loop_navigator node did on the real robot.
import * as THREE from 'three';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the factory (cells, y grows south)
const W = 56, H = 36, CS = 0.25;                 // 14 m × 9 m at 0.25 m per cell
const RECTS = [
  [18, 0, 18, 12], [38, 0, 38, 12], [18, 12, 25, 12], [30, 12, 38, 12], [24, 4, 31, 6],    // QC room + bench
  [4, 6, 13, 7], [4, 11, 13, 12], [4, 16, 13, 17],                                          // racking
  [43, 5, 50, 9], [42, 15, 46, 19], [20, 22, 35, 23],                                       // machines, conveyor
  [16, 20, 16, 20], [40, 23, 40, 23], [28, 30, 29, 31], [50, 22, 51, 23], [9, 24, 10, 25],  // pillars, crates
];
const STATIONS = [
  { id: 'A', cell: [6, 30], name: { th: 'รับวัตถุดิบ', en: 'receiving' } },
  { id: 'B', cell: [49, 29], name: { th: 'ประกอบ', en: 'assembly' } },
  { id: 'C', cell: [28, 9], name: { th: 'ตรวจคุณภาพ', en: 'QC' } },
];
const RANGE = 4.0;                                // m; the real RPLIDAR C1 reaches 12 m, the sim caps it so you explore
const BEAMS = 360, SCAN_HZ = 10;
const R_BOT = 0.22, VMAX = 0.6, WMAX = 2.2;

const truth = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!x || !y || x === W - 1 || y === H - 1) truth[y * W + x] = 1;
for (const [x0, y0, x1, y1] of RECTS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) truth[y * W + x] = 1;

const FW = W * CS, FH = H * CS;
const wx = cx => (cx + 0.5) * CS - FW / 2;       // cell → world (x east, z south)
const wz = cy => (cy + 0.5) * CS - FH / 2;
const cxOf = x => Math.floor((x + FW / 2) / CS);
const cyOf = z => Math.floor((z + FH / 2) / CS);
const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || truth[cy * W + cx] === 1;

export async function mount(body, ctx) {
  const th = () => ctx.lang() === 'th';
  const wrap = el('div', 'q-app');
  wrap.tabIndex = 0;
  wrap.style.cssText = 'outline:none; background:#05070a';
  const canvas = el('canvas', 'q-gl');
  wrap.append(canvas);
  body.append(wrap);

  // ---------------------------------------------------------------- renderer + scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.FogExp2(0x05070a, 0.085);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80);

  scene.add(new THREE.HemisphereLight(0x5a6f86, 0x0b0805, 0.55));
  const moon = new THREE.DirectionalLight(0x9db4d0, 0.5);
  moon.position.set(-4, 10, 6); scene.add(moon);

  // floor: concrete with a faint 1 m grid, then the occupancy texture on top
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW + 6, FH + 6), new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const gsize = Math.round(Math.max(FW, FH) + 6);
  const grid = new THREE.GridHelper(gsize, gsize, 0x1c242c, 0x141a20);
  grid.position.y = 0.002; scene.add(grid);

  const texData = new Uint8Array(W * H * 4);
  const occTex = new THREE.DataTexture(texData, W, H, THREE.RGBAFormat);
  occTex.magFilter = THREE.NearestFilter; occTex.minFilter = THREE.NearestFilter; occTex.colorSpace = THREE.SRGBColorSpace;
  const occPlane = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: occTex, transparent: true, depthWrite: false }));
  occPlane.rotation.x = -Math.PI / 2; occPlane.position.y = 0.004; scene.add(occPlane);

  // walls appear as the LiDAR finds them: one instance per occupied cell, rising from the floor
  const WALL_H = 0.55, maxWalls = truth.reduce((s, v) => s + v, 0);
  const wallGeo = new THREE.BoxGeometry(CS * 0.94, WALL_H, CS * 0.94); wallGeo.translate(0, WALL_H / 2, 0);
  const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.75, metalness: 0.15, emissive: 0xec9a5a, emissiveIntensity: 0.04 }), maxWalls);
  walls.count = 0; walls.castShadow = true; walls.receiveShadow = true;
  walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(walls);
  const wallTop = new THREE.InstancedMesh(new THREE.BoxGeometry(CS * 0.94, 0.012, CS * 0.94), new THREE.MeshBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.85 }), maxWalls);
  wallTop.count = 0; scene.add(wallTop);
  const rising = [];             // [instance, cx, cy, t0]
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3();

  // stations: floor ring, letter
  const stationObjs = STATIONS.map(s => {
    const g = new THREE.Group(); g.position.set(wx(s.cell[0]), 0, wz(s.cell[1]));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.33, 48), new THREE.MeshBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48), new THREE.MeshBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.08 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.008; g.add(disc);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTex(s.id), transparent: true, depthWrite: false, fog: false }));
    spr.scale.set(0.42, 0.42, 1); spr.position.y = 0.75; g.add(spr);
    scene.add(g);
    return { ...s, g, ring, disc, spr };
  });

  // planned path, drawn like the route in the story film
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb47c }));
  pathLine.position.y = 0.02; scene.add(pathLine);
  // where the robot has been
  const TRAIL = 1500, trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x5f7a92, transparent: true, opacity: 0.55 }));
  trail.position.y = 0.015; trail.frustumCulled = false; scene.add(trail);
  let trailN = 0;

  // LiDAR returns: a ring buffer of points that fade over three seconds
  const NPTS = 2400, ptPos = new Float32Array(NPTS * 3), ptCol = new Float32Array(NPTS * 3), ptAge = new Float32Array(NPTS).fill(99);
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
  ptGeo.setAttribute('color', new THREE.BufferAttribute(ptCol, 3));
  const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  let ptHead = 0;

  // ---------------------------------------------------------------- BATLY R1
  const bot = new THREE.Group(); scene.add(bot);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, ...o });
  const cyl = (r, h, m, y) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), m); x.position.y = y; x.castShadow = true; bot.add(x); return x; };
  cyl(0.22, 0.13, mat(0x14181d), 0.095);
  cyl(0.222, 0.025, mat(0xec9a5a, { metalness: 0.9, roughness: 0.3, emissive: 0x3a1a08 }), 0.13);
  cyl(0.19, 0.02, mat(0xb9c2cc, { metalness: 0.8, roughness: 0.25 }), 0.175);
  cyl(0.065, 0.06, mat(0x1d2126), 0.215);
  const head = new THREE.Group(); head.position.y = 0.255; bot.add(head);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 32), mat(0x221010, { emissive: 0xff2a14, emissiveIntensity: 0.6 }));
  head.add(lens);
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3b24 }));
  dot.position.set(0.055, 0, 0); head.add(dot);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24), mat(0x0b0b0b, { roughness: 0.9 }));
    w.rotation.x = Math.PI / 2; w.position.set(0, 0.06, s * 0.2); bot.add(w);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7ee2a8 }));
  led.position.set(0.18, 0.17, 0); bot.add(led);
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xff3b24, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
  scene.add(beam);
  const lamp = new THREE.SpotLight(0xffe6c8, 3.5, 7, 0.55, 0.6, 1.2);
  lamp.position.set(0.2, 0.18, 0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.002;
  bot.add(lamp); lamp.target.position.set(2.5, 0, 0); bot.add(lamp.target);
  const glow = new THREE.PointLight(0xff3b24, 0.12, 1.2, 2); glow.position.y = 0.45; bot.add(glow);

  // ---------------------------------------------------------------- SLAM: log-odds occupancy grid
  const LO_HIT = 0.9, LO_MISS = 0.35, LO_MAX = 3.5, LO_OCC = 0.6, LO_FREE = -0.6;
  const lo = new Float32Array(W * H), shown = new Uint8Array(W * H);     // shown: 0 unknown, 1 free, 2 occupied
  const reachable = countReachable();
  const wallAt = new Map();
  let known = 0, texDirty = true;

  function setCell(i) {
    const s = lo[i] > LO_OCC ? 2 : lo[i] < LO_FREE ? 1 : 0;
    if (s === shown[i]) return;
    if (!shown[i] && s) known++;
    else if (shown[i] && !s) known--;
    shown[i] = s;
    texDirty = true;
    const cx = i % W, cy = (i / W) | 0, ti = ((H - 1 - cy) * W + cx) * 4;
    if (s === 2) { texData.set([236, 154, 90, 255], ti); if (!wallAt.has(i)) addWall(i, cx, cy); }
    else if (s === 1) texData.set([28, 38, 48, 235], ti);
    else texData.set([0, 0, 0, 0], ti);
  }
  function addWall(i, cx, cy) {
    const k = walls.count++;
    wallTop.count = walls.count;
    wallAt.set(i, k);
    if (reduced) placeWall(k, cx, cy, 1);
    else { rising.push([k, cx, cy, performance.now()]); placeWall(k, cx, cy, 0.001); }
  }
  function placeWall(k, cx, cy, s) {
    v3.set(wx(cx), 0, wz(cy)); s3.set(1, s, 1);
    walls.setMatrixAt(k, m4.compose(v3, q4, s3));
    v3.y = WALL_H * s + 0.006; s3.set(1, 1, 1);
    wallTop.setMatrixAt(k, m4.compose(v3, q4, s3));
    walls.instanceMatrix.needsUpdate = true; wallTop.instanceMatrix.needsUpdate = true;
  }

  // one beam: DDA through the true map, returning the cells it crossed and where it stopped
  const RCELLS = RANGE / CS;
  function castBeam(x, z, ang) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    let cx = cxOf(x), cy = cyOf(z);
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const gx = (x + FW / 2) / CS, gz = (z + FH / 2) / CS;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dz);
    let tmx = dx > 0 ? (cx + 1 - gx) * tdx : (gx - cx) * tdx;
    let tmy = dz > 0 ? (cy + 1 - gz) * tdy : (gz - cy) * tdy;
    let t = 0;
    const free = [];
    while (t < RCELLS) {
      if (solid(cx, cy)) return { hit: true, d: t * CS + (Math.random() - 0.5) * 0.024, cx, cy, free };
      free.push(cy * W + cx);
      if (tmx < tmy) { t = tmx; tmx += tdx; cx += stepX; } else { t = tmy; tmy += tdy; cy += stepY; }
    }
    return { hit: false, d: RANGE, free };
  }
  function integrate(r) {
    for (const i of r.free) { lo[i] = Math.max(-LO_MAX, lo[i] - LO_MISS); setCell(i); }
    if (r.hit && r.cx >= 0 && r.cy >= 0 && r.cx < W && r.cy < H) { const i = r.cy * W + r.cx; lo[i] = Math.min(LO_MAX, lo[i] + LO_HIT); setCell(i); }
  }
  // free cells reachable from A plus the walls bounding them: what "100% mapped" means
  function countReachable() {
    const seen = new Uint8Array(W * H), q = [STATIONS[0].cell[1] * W + STATIONS[0].cell[0]];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop(); n++;
      const x = i % W, y = (i / W) | 0;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, ny = y + ay;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        if (solid(nx, ny)) n++; else q.push(j);
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- A* over the built map (Nav2's job)
  function blocked(cx, cy) {
    if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) return true;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (shown[(cy + y) * W + cx + x] === 2) return true;   // inflation ≈ robot radius
    return false;
  }
  function astar(sx, sy, gx, gy) {
    const N = W * H, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => {
      const topI = heap[0][1], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return topI;
    };
    const s = sy * W + sx, goal = gy * W + gx;
    g[s] = 0; push(s, Math.hypot(sx - gx, sy - gy));
    while (heap.length) {
      const i = pop();
      if (i === goal) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (blocked(nx, ny) || (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy)))) continue;
        const j = ny * W + nx;
        const ng = g[i] + (dx && dy ? Math.SQRT2 : 1) + (shown[j] === 0 ? 0.35 : 0);    // unknown costs a little more
        if (ng < g[j]) { g[j] = ng; came[j] = i; push(j, ng + Math.hypot(nx - gx, ny - gy)); }
      }
    }
    if (goal !== s && came[goal] < 0) return null;
    const cells = [];
    for (let i = goal; i >= 0; i = came[i]) { cells.push(i); if (i === s) break; }
    cells.reverse();
    // string-pull: keep only the corners a straight line can't skip
    const out = [cells[0]];
    let a = 0;
    for (let k = 2; k < cells.length; k++) if (!sight(cells[a], cells[k])) { out.push(cells[k - 1]); a = k - 1; }
    if (cells.length > 1) out.push(cells[cells.length - 1]);
    return out.map(i => [wx(i % W), wz((i / W) | 0)]);
  }
  function sight(i, j) {
    let x0 = i % W, y0 = (i / W) | 0;
    const x1 = j % W, y1 = (j / W) | 0, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (blocked(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---------------------------------------------------------------- HUD
  const hud = el('div', 'q-hud'); hud.style.inset = '0';
  const top = el('div', 'q-panel'); Object.assign(top.style, { position: 'absolute', left: '12px', top: '12px', width: '270px' });
  const t1 = el('div'); t1.style.cssText = 'font: 600 15px var(--q-disp); color: var(--q-ink)'; t1.textContent = 'BATLY R1 · SLAM';
  const t2 = el('div'); t2.style.cssText = 'font-size: 11px; color: var(--q-muted); margin: 2px 0 8px';
  t2.textContent = `ROS 2 Jazzy sim · RPLIDAR C1 · ${BEAMS} beams @ ${SCAN_HZ} Hz · range capped at ${RANGE} m`;
  const goalsRow = el('div'); goalsRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px; flex-wrap: wrap';
  const goalChips = STATIONS.map(s => { const c = el('span', 'q-chip'); c.textContent = s.id + ' · ' + s.name[th() ? 'th' : 'en']; c.setAttribute('aria-pressed', 'false'); goalsRow.append(c); return c; });
  const stats = el('div'); stats.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 11px';
  const stat = k => { const d = el('div'); const a = el('div', 'q-k'); a.textContent = k; const b = el('div'); b.style.cssText = 'color: var(--q-cu-hi); font-size: 14px; font-variant-numeric: tabular-nums'; d.append(a, b); stats.append(d); return b; };
  const sMap = stat('map'), sTime = stat('time'), sSpd = stat('m/s');
  const mission = el('div'); mission.style.cssText = 'margin-top:8px; font-size: 12px; color: var(--q-ink); line-height: 1.5';
  top.append(t1, t2, goalsRow, stats, mission);

  const mapPanel = el('div', 'q-panel'); Object.assign(mapPanel.style, { position: 'absolute', right: '12px', top: '12px', padding: '8px' });
  const mapK = el('div', 'q-k'); mapK.textContent = '/map · nav_msgs/OccupancyGrid'; mapK.style.marginBottom = '6px';
  const mini = el('canvas'); mini.width = W * 4; mini.height = H * 4; mini.style.cssText = 'display:block; image-rendering: pixelated; border-radius: 4px';
  mapPanel.append(mapK, mini);
  const mctx = mini.getContext('2d');

  const logP = el('div', 'q-panel'); Object.assign(logP.style, { position: 'absolute', right: '12px', bottom: '12px', width: 'min(440px, 46%)', fontSize: '11px', lineHeight: '1.6', color: 'var(--q-muted)' });
  const chipRow = el('div'); chipRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 8px';
  const mkChip = (label, fn) => { const b = el('button', 'q-chip'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => { fn(); wrap.focus({ preventScroll: true }); }); chipRow.append(b); return b; };
  const autoBtn = mkChip('△ autonav', () => action('tri'));
  autoBtn.setAttribute('aria-pressed', 'false');
  mkChip('□ view', () => action('sq'));
  mkChip('○ reset map', () => action('cir'));
  const logBox = el('div'); logBox.style.cssText = 'white-space: pre-wrap';
  logP.append(chipRow, logBox);
  const logs = [];
  function log(s, color = '') {
    logs.push([s, color]); if (logs.length > 5) logs.shift();
    logBox.replaceChildren(...logs.map(([t, c]) => { const d = el('div'); d.textContent = t; if (c) d.style.color = c; return d; }));
  }

  // on-screen copy of Q's handheld controller (same layout as the PCB in robot3d)
  const pad = el('div'); Object.assign(pad.style, { position: 'absolute', left: '12px', bottom: '12px', width: '300px', touchAction: 'none', userSelect: 'none' });
  pad.innerHTML = `<svg viewBox="0 0 340 168" style="width:100%; display:block; overflow:visible">
    <path d="M38 8 H302 L336 46 V128 L298 164 H42 L4 128 V46 Z" fill="rgba(13,20,17,.92)" stroke="#ec9a5a" stroke-opacity=".55" stroke-width="1.5"/>
    <rect x="146" y="16" width="48" height="42" rx="4" fill="rgba(58,139,216,.12)" stroke="#3a8bd8" stroke-opacity=".7"/>
    <text x="170" y="41" fill="#6fb0f0" font-size="10" text-anchor="middle" font-family="JetBrains Mono, monospace">XBee</text>
    <text x="170" y="150" fill="#808a99" font-size="8.5" text-anchor="middle" font-family="JetBrains Mono, monospace" letter-spacing=".08em">ABU 2026 · CTRL</text>
  </svg>`;
  const svgEl = pad.firstElementChild;
  const NS = 'http://www.w3.org/2000/svg', padBtn = {};
  const mk = (id, x, y, r, label, title) => {
    const g = document.createElementNS(NS, 'g'); g.dataset.b = id; g.style.cursor = 'pointer';
    const c = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries({ cx: x, cy: y, r, fill: '#1a2026', stroke: '#c9b45a', 'stroke-opacity': '.6' })) c.setAttribute(k, v);
    const t = document.createElementNS(NS, 'text');
    for (const [k, v] of Object.entries({ x, y: y + 4, 'text-anchor': 'middle', fill: '#ffb47c', 'font-size': r > 11 ? 12 : 9, 'font-family': 'JetBrains Mono, monospace', 'pointer-events': 'none' })) t.setAttribute(k, v);
    t.textContent = label;
    const ti = document.createElementNS(NS, 'title'); ti.textContent = title;
    g.append(ti, c, t); svgEl.append(g); padBtn[id] = c;
  };
  mk('up', 74, 70, 13, '▲', 'forward'); mk('down', 74, 128, 13, '▼', 'back'); mk('left', 45, 99, 13, '◀', 'turn left'); mk('right', 103, 99, 13, '▶', 'turn right');
  mk('l1', 74, 30, 10, 'L1', 'LiDAR beam on/off');
  mk('tri', 266, 70, 13, '△', 'autonav'); mk('cross', 266, 128, 13, '✕', 'stop'); mk('sq', 237, 99, 13, '□', 'camera view'); mk('cir', 295, 99, 13, '○', 'reset map');
  mk('r1', 266, 30, 10, 'R1', 'speed FULL / MED');
  mk('togr', 122, 30, 8, 'S', 'TOG_R safety');
  const hint = el('div'); hint.style.cssText = 'font-size: 10.5px; color: var(--q-muted); margin-top: 4px; text-align: center';
  hint.textContent = matchMedia('(pointer: coarse)').matches
    ? (th() ? 'กดค้างปุ่มทิศ หรือลากบนฉากเพื่อขับ' : 'hold the D-pad or drag on the scene to drive')
    : 'W A S D / arrows · gamepad · △ n · □ v · ○ r · ✕ space';
  pad.append(hint);

  hud.append(top, mapPanel, logP, pad);
  wrap.append(hud);

  // ---------------------------------------------------------------- input
  const keys = new Set(), padHeld = new Set();
  let touch = null, speedMode = 1, safety = false, view = 0, zoom = 1;
  const gpPrev = [];
  const KEY = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(), down = e.type === 'keydown';
    if (KEY[k]) { e.preventDefault(); if (down) keys.add(KEY[k]); else keys.delete(KEY[k]); return; }
    if (!down || e.repeat) return;
    const act = { n: 'tri', v: 'sq', r: 'cir', ' ': 'cross', e: 'r1', q: 'l1', 2: 'togr' }[k];
    if (act) { e.preventDefault(); action(act); }
  }
  wrap.addEventListener('keydown', onKey); wrap.addEventListener('keyup', onKey);
  wrap.addEventListener('blur', () => keys.clear());
  function action(id) {
    ctx.sfx.click();
    flash(id);
    if (id === 'tri') toggleAuto();
    else if (id === 'sq') view = (view + 1) % 3;
    else if (id === 'cir') resetMap();
    else if (id === 'cross') { if (auto) toggleAuto(); v = 0; w = 0; }
    else if (id === 'r1') { speedMode = (speedMode % 2) + 1; log(`[controller] R1 → ${speedMode === 1 ? 'FULL(100%)' : 'MED(30%)'}`); }
    else if (id === 'l1') beam.visible = !beam.visible;
    else if (id === 'togr') {
      safety = !safety;
      log(safety ? '[controller] TOG_R safety ON · frame all zero' : '[controller] safety off', safety ? 'var(--q-bad)' : '');
    }
  }
  function flash(id) {
    const c = padBtn[id]; if (!c) return;
    c.setAttribute('fill', '#ec9a5a');
    setTimeout(() => c.setAttribute('fill', id === 'togr' && safety ? '#ff6b5b' : '#1a2026'), 140);
  }
  svgEl.addEventListener('pointerdown', e => {
    const g = e.target.closest('g[data-b]'); if (!g) return;
    e.preventDefault();
    const id = g.dataset.b;
    if (!['up', 'down', 'left', 'right'].includes(id)) { action(id); return; }
    svgEl.setPointerCapture(e.pointerId);
    padHeld.add(id); padBtn[id].setAttribute('fill', '#ec9a5a');
    const end = () => { padHeld.delete(id); padBtn[id].setAttribute('fill', '#1a2026'); svgEl.removeEventListener('pointerup', end); svgEl.removeEventListener('pointercancel', end); };
    svgEl.addEventListener('pointerup', end); svgEl.addEventListener('pointercancel', end);
  });
  // a touch-drag on the scene is a virtual stick
  canvas.addEventListener('pointerdown', e => {
    wrap.focus({ preventScroll: true });
    if (e.pointerType !== 'mouse') { touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', e => { if (touch && e.pointerId === touch.id) { touch.dx = (e.clientX - touch.x) / 60; touch.dy = (e.clientY - touch.y) / 60; } });
  const endTouch = e => { if (touch && e.pointerId === touch.id) touch = null; };
  canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.55, Math.min(1.8, zoom * (e.deltaY > 0 ? 1.08 : 0.92))); }, { passive: false });

  // ---------------------------------------------------------------- robot state + autopilot
  let x = wx(STATIONS[0].cell[0]), z = wz(STATIONS[0].cell[1]), yaw = 0, v = 0, w = 0, scanAng = 0;
  let auto = false, route = null, routeIdx = 0, replanT = 0, loop = 0, goalIdx = 0, done = false, doneAt = 0;
  const visited = new Set(['A']), t0 = performance.now();
  let lastPose = [x, z];

  function toggleAuto() {
    if (!auto && visited.size < 3) {
      log(th() ? '[nav2] ขับไปให้ครบ A → B → C ก่อน แผนที่ยังไม่พอให้วางเส้นทาง' : '[nav2] drive A → B → C yourself first: not enough map to plan on', 'var(--q-cu-hi)');
      ctx.sfx.err(); return;
    }
    auto = !auto;
    autoBtn.setAttribute('aria-pressed', String(auto));
    if (auto) { loop = 0; goalIdx = 0; route = null; replanT = 0; log('[loop_navigator] sending A → B → C ×2 through FollowWaypoints'); }
    else { route = null; pathLine.geometry.setFromPoints([]); log('[loop_navigator] goal canceled'); }
  }
  function resetMap() {
    lo.fill(0); shown.fill(0); texData.fill(0); known = 0; texDirty = true;
    walls.count = 0; wallTop.count = 0; wallAt.clear(); rising.length = 0;
    trailN = 0; trailGeo.setDrawRange(0, 0); ptAge.fill(99);
    log('[slam_toolbox] map cleared');
  }

  log(`[slam_toolbox] map ${W}×${H} @ ${CS} m/cell, mode: mapping`);

  // ---------------------------------------------------------------- loop
  function resize() {
    const ww = wrap.clientWidth, hh = wrap.clientHeight;
    if (!ww || !hh) return;
    renderer.setSize(ww, hh, false);
    camera.aspect = ww / hh; camera.updateProjectionMatrix();
    const narrow = ww < 760, sc = narrow ? 2.4 : 4;
    mapPanel.style.display = ww < 520 ? 'none' : '';
    mini.style.width = W * sc + 'px'; mini.style.height = H * sc + 'px';
    logP.style.display = narrow ? 'none' : '';
    pad.style.width = narrow ? '230px' : '300px';
    top.style.width = narrow ? '210px' : '270px';
    t2.style.display = narrow ? 'none' : '';
  }
  const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

  let raf = 0, last = performance.now(), miniT = 0;
  const camPos = new THREE.Vector3(x - 3, 3.2, z), camLook = new THREE.Vector3(x, 0, z);

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    // -------- command: keys, on-screen pad, touch stick, gamepad; autopilot when it's on
    const k = id => (keys.has(id) || padHeld.has(id) ? 1 : 0);
    let cmdV = k('up') - k('down'), cmdW = k('left') - k('right');
    if (touch) { cmdV += Math.max(-1, Math.min(1, -touch.dy)); cmdW += Math.max(-1, Math.min(1, -touch.dx)); }
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) {
      const dz = a => (Math.abs(a) < 0.12 ? 0 : a);
      cmdV -= dz(gp.axes[1] || 0); cmdW -= dz(gp.axes[2] ?? gp.axes[0] ?? 0);
      [[3, 'tri'], [2, 'sq'], [1, 'cir'], [0, 'cross'], [5, 'r1'], [4, 'l1']].forEach(([bi, id]) => {
        const p = !!gp.buttons[bi]?.pressed; if (p && !gpPrev[bi]) action(id); gpPrev[bi] = p;
      });
    }
    if (auto && Math.abs(cmdV) + Math.abs(cmdW) > 0.05) toggleAuto();       // manual input wins, like a teleop mux
    let tv = Math.max(-1, Math.min(1, cmdV)) * VMAX * (speedMode === 1 ? 1 : 0.3);
    let tw = Math.max(-1, Math.min(1, cmdW)) * WMAX;
    if (auto) [tv, tw] = pursue(dt);
    if (safety) { tv = 0; tw = 0; }
    v += (tv - v) * Math.min(1, dt * 6); w += (tw - w) * Math.min(1, dt * 8);

    // -------- integrate, sliding along whichever axis is free
    yaw += w * dt;
    const nx = x + Math.cos(yaw) * v * dt, nz = z + Math.sin(yaw) * v * dt;
    if (!collides(nx, z)) x = nx;
    if (!collides(x, nz)) z = nz;
    bot.position.set(x, 0, z); bot.rotation.y = -yaw;
    ctx.sfx.motor(Math.min(1, Math.abs(v) / VMAX * 0.8 + Math.abs(w) / WMAX * 0.3));

    // -------- LiDAR: the beams swept since the last frame
    const n = Math.max(1, Math.round(BEAMS * SCAN_HZ * dt)), step = (2 * Math.PI) / BEAMS;
    let lastD = RANGE;
    for (let i = 0; i < n; i++) {
      scanAng += step;
      const a = yaw + scanAng, r = castBeam(x, z, a);
      integrate(r);
      lastD = r.d;
      if (r.hit) {
        const p = ptHead; ptHead = (ptHead + 1) % NPTS;
        ptPos[p * 3] = x + Math.cos(a) * r.d; ptPos[p * 3 + 1] = 0.255; ptPos[p * 3 + 2] = z + Math.sin(a) * r.d;
        ptAge[p] = 0;
      }
    }
    scanAng %= 2 * Math.PI;
    head.rotation.y = -scanAng;
    beam.position.set(x, 0.255, z); beam.rotation.y = -(yaw + scanAng); beam.scale.x = lastD;
    for (let i = 0; i < NPTS; i++) {
      const f = Math.max(0, 1 - (ptAge[i] += dt) / 3);
      ptCol[i * 3] = 0.9 * f; ptCol[i * 3 + 1] = 0.1 * f; ptCol[i * 3 + 2] = 0.05 * f;
    }
    ptGeo.attributes.position.needsUpdate = true; ptGeo.attributes.color.needsUpdate = true;
    if (texDirty) { occTex.needsUpdate = true; texDirty = false; }

    // -------- walls rising
    for (let i = rising.length - 1; i >= 0; i--) {
      const [kk, cx, cy, ts] = rising[i], p = Math.min(1, (now - ts) / 450);
      placeWall(kk, cx, cy, Math.max(0.001, 1 - Math.pow(1 - p, 3)));
      if (p >= 1) rising.splice(i, 1);
    }

    // -------- trail
    if (Math.hypot(x - lastPose[0], z - lastPose[1]) > 0.08 && trailN < TRAIL) {
      lastPose = [x, z];
      trailPos.set([x, 0, z], trailN * 3); trailN++;
      trailGeo.setDrawRange(0, trailN); trailGeo.attributes.position.needsUpdate = true;
    }

    // -------- stations
    const ts = now / 1000, nextManual = STATIONS.findIndex(q => !visited.has(q.id));
    stationObjs.forEach((s, i) => {
      const isGoal = auto ? i === goalIdx : i === nextManual;
      s.ring.material.opacity = isGoal ? 0.6 + 0.4 * Math.sin(ts * 5) : visited.has(s.id) ? 0.55 : 0.25;
      s.disc.material.opacity = isGoal ? 0.18 : 0.06;
      s.spr.position.y = 0.75 + Math.sin(ts * 2 + i) * 0.04;
      if (Math.hypot(x - s.g.position.x, z - s.g.position.z) < 0.35) arrive(s, i);
    });

    // -------- camera: chase, top-down, or riding on the robot
    if (view === 2) {
      camPos.set(x - Math.cos(yaw) * 0.5, 0.5, z - Math.sin(yaw) * 0.5);
      camLook.set(x + Math.cos(yaw) * 2, 0.3, z + Math.sin(yaw) * 2);
    } else {
      const back = (view === 1 ? 0.4 : 3.1) * zoom, up = (view === 1 ? 7 : 3) * zoom;
      camPos.lerp(v3.set(x - Math.cos(yaw) * back, up, z - Math.sin(yaw) * back), Math.min(1, dt * 3.5));
      camLook.lerp(v3.set(x + Math.cos(yaw) * 0.6, 0, z + Math.sin(yaw) * 0.6), Math.min(1, dt * 5));
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    scene.fog.density = view === 1 ? 0.03 : 0.085;

    // -------- HUD
    sMap.textContent = Math.min(100, Math.round(known / reachable * 100)) + '%';
    const secs = ((done ? doneAt : now) - t0) / 1000;
    sTime.textContent = `${(secs / 60) | 0}:${String((secs % 60) | 0).padStart(2, '0')}`;
    sSpd.textContent = Math.abs(v).toFixed(2);
    led.material.color.setHex(safety ? 0xff6b5b : auto ? 0xffb47c : 0x7ee2a8);
    lens.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(now / 90);
    padBtn.togr.setAttribute('fill', safety ? '#ff6b5b' : padBtn.togr.getAttribute('fill') === '#ec9a5a' ? '#ec9a5a' : '#1a2026');
    if ((miniT += dt) > 0.1) { miniT = 0; drawMini(); }

    renderer.render(scene, camera);
  }

  function arrive(s, i) {
    if (auto) {
      if (i !== goalIdx) return;
      ctx.sfx.ping();
      log(`[loop_navigator] reached ${s.id} · AMCL x=${x.toFixed(2)} y=${(-z).toFixed(2)} yaw=${(-yaw % (2 * Math.PI)).toFixed(2)}`, 'var(--q-ok)');
      goalIdx = (goalIdx + 1) % 3; route = null;
      if (goalIdx === 0 && ++loop >= 2) {
        log('[loop_navigator] 2 loops done · FollowWaypoints SUCCEEDED', 'var(--q-ok)');
        auto = false; autoBtn.setAttribute('aria-pressed', 'false'); pathLine.geometry.setFromPoints([]);
      }
      return;
    }
    if (visited.has(s.id) || STATIONS.findIndex(q => !visited.has(q.id)) !== i) return;
    visited.add(s.id);
    goalChips[i].setAttribute('aria-pressed', 'true');
    ctx.sfx.ping();
    log(`[goal] reached ${s.id} · ${s.name[th() ? 'th' : 'en']}  x=${x.toFixed(2)} y=${(-z).toFixed(2)}`, 'var(--q-ok)');
    if (visited.size === 3) {
      done = true; doneAt = performance.now();
      const secs = ((doneAt - t0) / 1000).toFixed(1);
      log(th() ? `[done] ครบ A → B → C ใน ${secs} วินาที · กด △ ให้ Nav2 ขับเอง` : `[done] A → B → C in ${secs} s · press △ and let Nav2 drive`, 'var(--q-cu-hi)');
      autoBtn.style.borderColor = 'rgba(236,154,90,.8)';
    }
    updateMission();
  }
  function updateMission() {
    const next = STATIONS.find(q => !visited.has(q.id));
    mission.textContent = next
      ? (th() ? `ขับไปที่ ${next.id} · ${next.name.th} แล้วดูแผนที่ค่อย ๆ เกิดขึ้น` : `Drive to ${next.id} · ${next.name.en} and watch the map build`)
      : (th() ? 'ทำแผนที่เสร็จ กด △ ให้หุ่นวิ่ง A → B → C เองสองรอบ' : 'Mapped. Press △ and BATLY runs A → B → C twice on its own.');
  }
  goalChips[0].setAttribute('aria-pressed', 'true');
  updateMission();

  function collides(px, pz) {
    const cx = cxOf(px), cy = cyOf(pz);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (!solid(xx, yy)) continue;
      const x0 = xx * CS - FW / 2, z0 = yy * CS - FH / 2;
      const qx = Math.max(x0, Math.min(px, x0 + CS)), qz = Math.max(z0, Math.min(pz, z0 + CS));
      if (Math.hypot(px - qx, pz - qz) < R_BOT) return true;
    }
    return false;
  }

  // pure pursuit along the A* path; replan twice a second as the map grows
  function pursue(dt) {
    replanT -= dt;
    const g = STATIONS[goalIdx];
    if (!route || replanT <= 0) {
      replanT = 0.5;
      const p = astar(cxOf(x), cyOf(z), g.cell[0], g.cell[1]);
      if (!p) { log('[nav2] no path, spinning to see more', 'var(--q-bad)'); return [0, 0.8]; }
      route = p; routeIdx = 0;
      pathLine.geometry.setFromPoints([new THREE.Vector3(x, 0, z), ...route.map(([px, pz]) => new THREE.Vector3(px, 0, pz))]);
    }
    while (routeIdx < route.length - 1 && Math.hypot(route[routeIdx][0] - x, route[routeIdx][1] - z) < 0.55) routeIdx++;
    const [tx, tz] = route[routeIdx];
    let err = Math.atan2(tz - z, tx - x) - yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    return [VMAX * 0.85 * Math.max(0, 1 - Math.abs(err) / 1.1), Math.max(-WMAX, Math.min(WMAX, 3 * err))];
  }

  // RViz-style map: unknown grey, free white, occupied black, like map_server's PGM
  const img = mctx.createImageData(W, H);
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d');
  function drawMini() {
    for (let i = 0; i < W * H; i++) {
      const s = shown[i], c = s === 2 ? 20 : s === 1 ? 236 : 128;
      img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = c; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(off, 0, 0, mini.width, mini.height);
    const sc = mini.width / W;
    const px = X => (X + FW / 2) / CS * sc, pz = Z => (Z + FH / 2) / CS * sc;
    if (trailN > 1) {
      mctx.strokeStyle = 'rgba(70,120,190,.8)'; mctx.lineWidth = 1.5; mctx.beginPath();
      for (let i = 0; i < trailN; i++) { const X = px(trailPos[i * 3]), Z = pz(trailPos[i * 3 + 2]); if (i) mctx.lineTo(X, Z); else mctx.moveTo(X, Z); }
      mctx.stroke();
    }
    if (auto && route) {
      mctx.strokeStyle = '#ec9a5a'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(px(x), pz(z));
      for (const [a, b] of route.slice(routeIdx)) mctx.lineTo(px(a), pz(b));
      mctx.stroke();
    }
    mctx.font = `bold ${Math.round(sc * 2.6)}px JetBrains Mono, monospace`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    for (const s of STATIONS) {
      mctx.fillStyle = visited.has(s.id) ? '#d9772f' : 'rgba(217,119,47,.55)';
      mctx.fillText(s.id, (s.cell[0] + 0.5) * sc, (s.cell[1] + 0.5) * sc);
    }
    // robot pose as a TF frame: red x, green y
    const X = px(x), Z = pz(z), L = sc * 2.6;
    mctx.lineWidth = 2;
    mctx.strokeStyle = '#ff3b24'; mctx.beginPath(); mctx.moveTo(X, Z); mctx.lineTo(X + Math.cos(yaw) * L, Z + Math.sin(yaw) * L); mctx.stroke();
    mctx.strokeStyle = '#32d74b'; mctx.beginPath(); mctx.moveTo(X, Z); mctx.lineTo(X + Math.sin(yaw) * L, Z - Math.cos(yaw) * L); mctx.stroke();
  }

  // test hook, only with ?qosdebug in the URL: jump to a station
  if (new URLSearchParams(location.search).has('qosdebug')) {
    wrap.qosDebug = { go(id) { const s = STATIONS.find(q => q.id === id); x = wx(s.cell[0]); z = wz(s.cell[1]); }, get auto() { return auto; }, get goal() { return goalIdx; }, get loop() { return loop; } };
  }

  // one full sweep before the first frame so the start isn't black
  for (let i = 0; i < BEAMS; i++) integrate(castBeam(x, z, (i / BEAMS) * Math.PI * 2));
  raf = requestAnimationFrame(tick);

  return {
    focus() { wrap.focus({ preventScroll: true }); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); ctx.sfx.motor(0);
      scene.traverse(o => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose(); x.dispose(); }); });
      occTex.dispose(); renderer.dispose();
    },
  };
}

function letterTex(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(7,9,12,.75)'; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ec9a5a'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ffb47c'; g.font = '700 64px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
