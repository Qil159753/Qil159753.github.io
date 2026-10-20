/* SKKU Natural Sciences Campus (Suwon) through a simulated 64-channel 3D LiDAR.
   Building footprints and roads are real OpenStreetMap data (© OpenStreetMap contributors, ODbL),
   projected to metres around 37.2937 N, 126.9755 E. Heights come from OSM tags where present and are
   guessed from footprint size otherwise. The LiDAR is a 2.5D raycast against those prisms: each azimuth
   finds every wall crossing once, then each of the 64 beams takes the first wall it is low enough to
   hit, or the ground. Points are merged on a voxel grid into a growing map, like a mapping run with
   perfect odometry (no SLAM drift is modelled). */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';

const CH = 64, FOV_V = [-16.6, 16.6];        // Ouster OS1-64-like vertical layout, degrees
const COLS = 512, RANGE = 70, SENSOR_Z = 1.9;  // columns per sweep, metres, mount height
const SCAN_HZ = 5, CELL = 16, VOX = 0.6;
const ELEV = Array.from({ length: CH }, (_, i) => Math.tan((FOV_V[0] + (FOV_V[1] - FOV_V[0]) * i / (CH - 1)) * Math.PI / 180));

/* Height colour ramp: ground slate → blue → copper → pale gold on the tallest walls. */
function ramp(z, out, o) {
  const t = Math.min(1, Math.max(0, z / 22));
  const stops = [[0.25, 0.32, 0.4], [0.36, 0.55, 0.78], [0.93, 0.6, 0.35], [1, 0.9, 0.7]];
  const f = t * 3, i = Math.min(2, f | 0), u = f - i, a = stops[i], b = stops[i + 1];
  out[o] = (a[0] + (b[0] - a[0]) * u) * 255; out[o + 1] = (a[1] + (b[1] - a[1]) * u) * 255; out[o + 2] = (a[2] + (b[2] - a[2]) * u) * 255;
}

export async function initLidar(root) {
  const canvas = root.querySelector('canvas');
  const statEl = root.querySelector('[data-stat]');
  const btn = n => root.querySelector(`[data-act="${n}"]`);
  const data = await (await fetch('img/j/skku-osm.json')).json();

  // ---- walls as segments in a uniform grid (world x, y; three.js uses x, -z)
  const segs = [];            // [x0, y0, x1, y1, h]
  const grid = new Map();
  const key = (i, j) => i * 4096 + j;
  for (const b of data.b) {
    const p = b.p, n = p.length / 2;
    for (let k = 0; k < n; k++) {
      const x0 = p[2 * k], y0 = p[2 * k + 1], x1 = p[2 * ((k + 1) % n)], y1 = p[2 * ((k + 1) % n) + 1];
      const s = segs.length; segs.push([x0, y0, x1, y1, b.h]);
      const i0 = Math.floor(Math.min(x0, x1) / CELL), i1 = Math.floor(Math.max(x0, x1) / CELL);
      const j0 = Math.floor(Math.min(y0, y1) / CELL), j1 = Math.floor(Math.max(y0, y1) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const kk = key(i, j); (grid.get(kk) || grid.set(kk, []).get(kk)).push(s);
      }
    }
  }
  const names = data.b.filter(b => b.n).map(b => {
    let x = 0, y = 0; const n = b.p.length / 2;
    for (let k = 0; k < n; k++) { x += b.p[2 * k]; y += b.p[2 * k + 1]; }
    return { n: b.n, x: x / n, y: y / n };
  });

  // ---- route (closed loop along campus roads)
  const R = data.route, route = [];
  for (let k = 0; k < R.length; k += 2) route.push([R[k], R[k + 1]]);
  const cum = [0];
  for (let k = 1; k < route.length; k++) cum.push(cum[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]));
  const LOOP = cum[cum.length - 1];
  function poseAt(s) {
    s = ((s % LOOP) + LOOP) % LOOP;
    let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
    const a = route[k - 1], b = route[k], u = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }

  // ---- three.js stage
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  canvas.addEventListener('webglcontextlost', () => root.classList.add('off'));
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x0e1217, 160, 520);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.enableZoom = false; // keep page scroll working
  controls.maxPolarAngle = Math.PI * 0.47;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // OSM layer: roads always, building outlines on demand
  const roadPos = [];
  for (const r of data.r) for (let k = 0; k + 3 < r.p.length; k += 2) roadPos.push(r.p[k], 0.03, -r.p[k + 1], r.p[k + 2], 0.03, -r.p[k + 3]);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3)),
    new THREE.LineBasicMaterial({ color: 0x3a4554, transparent: true, opacity: 0.6 })));
  const ghostPos = [];
  for (const [x0, y0, x1, y1, h] of segs) ghostPos.push(x0, 0, -y0, x1, 0, -y1, x0, h, -y0, x1, h, -y1, x0, 0, -y0, x0, h, -y0);
  const ghost = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ghostPos, 3)),
    new THREE.LineBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.18 }));
  ghost.visible = false; scene.add(ghost);
  const routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.map(([x, y]) => new THREE.Vector3(x, 0.06, -y))),
    new THREE.LineDashedMaterial({ color: 0x4fd18b, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.55 }));
  routeLine.computeLineDistances(); scene.add(routeLine);

  // accumulated map, preallocated; phones get a smaller budget
  const small = matchMedia('(max-width: 640px)').matches;
  const MAX = small ? 160000 : 360000;
  const mapPos = new Float32Array(MAX * 3), mapCol = new Uint8Array(MAX * 3);
  const mapGeo = new THREE.BufferGeometry();
  mapGeo.setAttribute('position', new THREE.BufferAttribute(mapPos, 3).setUsage(THREE.DynamicDrawUsage));
  mapGeo.setAttribute('color', new THREE.BufferAttribute(mapCol, 3, true).setUsage(THREE.DynamicDrawUsage));
  mapGeo.setDrawRange(0, 0);
  mapGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);
  const mapMat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, sizeAttenuation: true });
  scene.add(new THREE.Points(mapGeo, mapMat));
  const vox = new Set(); let nMap = 0;

  // the current sweep
  const livePos = new Float32Array(CH * COLS * 3);
  const liveGeo = new THREE.BufferGeometry();
  liveGeo.setAttribute('position', new THREE.BufferAttribute(livePos, 3).setUsage(THREE.DynamicDrawUsage));
  liveGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);
  const liveMat = new THREE.PointsMaterial({ size: 0.32, color: 0xfff1e0, sizeAttenuation: true, transparent: true, opacity: 0.9 });
  scene.add(new THREE.Points(liveGeo, liveMat));

  // robot: a small car with a sensor puck
  const bot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.0), new THREE.MeshBasicMaterial({ color: 0x1b222b }));
  body.position.y = 0.9; bot.add(body);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xec9a5a }));
  edges.position.y = 0.9; bot.add(edges);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xec9a5a }));
  puck.position.y = SENSOR_Z; bot.add(puck);
  scene.add(bot);

  // ---- sensor
  const hits = new Float64Array(256), hh = new Float32Array(256), stamp = new Uint32Array(segs.length);
  let stampId = 0;
  function sweep(px, py, yaw) {
    let nLive = 0, added = 0;
    const steps = Math.ceil(RANGE / (CELL * 0.5));
    for (let c = 0; c < COLS; c++) {
      const a = yaw + (c / COLS) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      stampId++; let nh = 0;
      for (let st = 0; st <= steps; st++) {        // half-cell steps along the ray; stamps dedupe segments
        const cx = px + dx * st * CELL * 0.5, cy = py + dy * st * CELL * 0.5;
        const list = grid.get(key(Math.floor(cx / CELL), Math.floor(cy / CELL)));
        if (!list) continue;
        for (const s of list) {
          if (stamp[s] === stampId) continue; stamp[s] = stampId;
          const g = segs[s], ex = g[2] - g[0], ey = g[3] - g[1];
          const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
          const qx = g[0] - px, qy = g[1] - py;
          const t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
          if (t > 0.3 && t < RANGE && u >= 0 && u <= 1 && nh < 256) { hits[nh] = t; hh[nh] = g[4]; nh++; }
        }
      }
      for (let i = 1; i < nh; i++) { const t = hits[i], h = hh[i]; let j = i - 1; while (j >= 0 && hits[j] > t) { hits[j + 1] = hits[j]; hh[j + 1] = hh[j]; j--; } hits[j + 1] = t; hh[j + 1] = h; }
      for (let ch = 0; ch < CH; ch++) {
        const e = ELEV[ch];
        let d = -1, z = 0;
        for (let i = 0; i < nh; i++) { const zz = SENSOR_Z + hits[i] * e; if (zz >= 0 && zz <= hh[i]) { d = hits[i]; z = zz; break; } }
        if (e < 0) { const dg = SENSOR_Z / -e; if (dg < RANGE && (d < 0 || dg < d)) { d = dg; z = 0; } }
        if (d < 0) continue;
        d += (Math.random() - 0.5) * 0.04;
        const x = px + dx * d, y = py + dy * d;
        livePos[nLive * 3] = x; livePos[nLive * 3 + 1] = z; livePos[nLive * 3 + 2] = -y; nLive++;
        if (nMap < MAX) {
          const vk = `${Math.round(x / VOX)},${Math.round(y / VOX)},${Math.round(z / VOX)}`;
          if (!vox.has(vk) && (z > 0.05 || Math.random() < 0.35)) {   // thin the ground so walls get the budget
            vox.add(vk);
            mapPos[nMap * 3] = x; mapPos[nMap * 3 + 1] = z; mapPos[nMap * 3 + 2] = -y;
            ramp(z, mapCol, nMap * 3); nMap++; added++;
          }
        }
      }
    }
    liveGeo.setDrawRange(0, nLive); liveGeo.attributes.position.needsUpdate = true;
    if (added) {
      const pa = mapGeo.attributes.position, ca = mapGeo.attributes.color;
      pa.clearUpdateRanges(); ca.clearUpdateRanges();
      pa.addUpdateRange((nMap - added) * 3, added * 3); ca.addUpdateRange((nMap - added) * 3, added * 3);
      pa.needsUpdate = true; ca.needsUpdate = true;
      mapGeo.setDrawRange(0, nMap);
    }
    return nLive;
  }

  // ---- UI
  let s = 0, speed = 8, playing = !reducedMotion(), view = 'chase', scanAcc = 1, live = 0, near = '';
  const camOff = new THREE.Vector3(-46, 38, 46);
  function setView(v) {
    view = v;
    const [x, y] = poseAt(s);
    const top = v === 'top';
    if (top) { controls.target.set(0, 0, 0); camera.position.set(0.01, 560, 0.01); }
    else { controls.target.set(x, 2, -y); camera.position.copy(controls.target).add(camOff); }
    // From 560 m up, fog would hide everything and world-sized points shrink below a pixel.
    scene.fog = top ? null : fog;
    mapMat.sizeAttenuation = liveMat.sizeAttenuation = !top;
    mapMat.size = top ? 1.6 : 0.5; liveMat.size = top ? 1.6 : 0.32;
    mapMat.needsUpdate = liveMat.needsUpdate = true;
    bot.scale.setScalar(top ? 3 : 1);
    btn('view').querySelector('[data-v]').textContent = v === 'top' ? 'TOP' : 'CHASE';
  }
  btn('play').addEventListener('click', () => { playing = !playing; btn('play').setAttribute('aria-pressed', !playing); });
  btn('play').setAttribute('aria-pressed', !playing);
  btn('speed').addEventListener('click', () => { speed = speed === 8 ? 24 : 8; btn('speed').querySelector('[data-v]').textContent = speed === 8 ? '1×' : '3×'; });
  btn('view').addEventListener('click', () => setView(view === 'top' ? 'chase' : 'top'));
  btn('osm').addEventListener('click', () => { ghost.visible = !ghost.visible; btn('osm').setAttribute('aria-pressed', ghost.visible); });
  btn('clear').addEventListener('click', () => { vox.clear(); nMap = 0; mapGeo.setDrawRange(0, 0); });
  setView('chase');
  live = sweep(...poseAt(0)); // one sweep up front so a paused (reduced-motion) view still shows a scan

  let seen = false, raf = 0, last = 0, dead = false, statT = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    try {
      const prev = poseAt(s);
      if (playing) s += speed * dt;
      const [x, y, yaw] = poseAt(s);
      bot.position.set(x, 0, -y); bot.rotation.y = yaw;
      if (view === 'chase') {
        const dxp = x - prev[0], dyp = y - prev[1];
        controls.target.x += dxp; controls.target.z -= dyp; camera.position.x += dxp; camera.position.z -= dyp;
      }
      scanAcc += dt;
      if (playing && scanAcc >= 1 / SCAN_HZ) { scanAcc = 0; live = sweep(x, y, yaw); }
      controls.update();
      renderer.render(scene, camera);
      statT -= dt;
      if (statT <= 0) {
        statT = 0.4;
        let best = 1e9; for (const b of names) { const d = Math.hypot(b.x - x, b.y - y); if (d < best) { best = d; near = b.n; } }
        statEl.textContent = `${live.toLocaleString('en')} pts/sweep · map ${nMap.toLocaleString('en')} pts${nMap >= MAX ? ' (full)' : ''} · ${(((s % LOOP) + LOOP) % LOOP).toFixed(0)} / ${LOOP.toFixed(0)} m${best < 60 ? ' · ' + near : ''}`;
      }
    } catch (err) { dead = true; raf = 0; console.error('journey lidar', err); return; }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const run = seen && !document.hidden && !dead;
    if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { rootMargin: '80px' }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
}
