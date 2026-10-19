/* Two interactive models for the Journey timeline, built in code (no mesh files):
   - blackhole: the Y1 hydraulic project. A master syringe moves water through a tube to a
     slave syringe whose rod pulls the centre of a stretched sheet down; the deeper the well,
     the faster the marbles spiral in.
   - truck: the Engineering Drawing toy truck (TRUCK SERIES D917), split into the same 11 parts
     the group modelled in SolidWorks, with an explode slider and a tipping dump bed.
   Shapes are hand-built from photos, so proportions are close, not measured. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const COPPER = 0xec9a5a;
const lang = () => (document.documentElement.dataset.lang === 'en' ? 'en' : 'th');

function makeStage(canvas, { fov = 32, pos = [10, 7, 12], target = [0, 2, 0], min = 8, max = 34 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const key = new THREE.DirectionalLight(0xfff4e8, 2.2); key.position.set(-4, 9, 6); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xdde6f0, 0x15181d, 0.7));
  const rim = new THREE.DirectionalLight(COPPER, 1.6); rim.position.set(5, 2, -6); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
  camera.position.set(...pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false; // keep page scroll working over the canvas
  controls.minDistance = min; controls.maxDistance = max;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.7;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  return { renderer, scene, camera, controls };
}

/* Render only while the viewer is on screen and the tab is visible. */
function loop(canvas, step) {
  let on = false, last = performance.now();
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (on && !document.hidden) step(dt);
  })(last);
}

/* ------------------------------------------------------------------ black hole */
export function initBlackhole(root) {
  const canvas = root.querySelector('canvas');
  const slider = root.querySelector('input[type=range]');
  const drop = root.querySelector('[data-drop]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { renderer, scene, camera, controls } = makeStage(canvas, { pos: [0, 11, 19], target: [0, 2, 0.6], min: 10, max: 34 });
  controls.autoRotate = !reduce;

  const M = {
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.75 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.4, metalness: 0.6 }),
    sheet: new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.6, side: THREE.DoubleSide }),
    grid: new THREE.LineBasicMaterial({ color: COPPER, transparent: true, opacity: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.2, emissive: 0x0b3d75, emissiveIntensity: 0.6 }),
    plunger: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    tube: new THREE.MeshStandardMaterial({ color: 0x5fb4ff, roughness: 0.2, emissive: 0x0b3d75, emissiveIntensity: 0.4, transparent: true, opacity: 0.75 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }),
    glow: new THREE.MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  };

  const R = 5, SEG_R = 36, SEG_T = 72, Y0 = 4.2, K = 2.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(17, 0.5, 12), M.wood); base.position.y = 0.25; scene.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 12, 96), M.frame);
  ring.rotation.x = Math.PI / 2; ring.position.y = Y0; scene.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, Y0 - 0.5, 10), M.frame);
    leg.position.set(Math.cos(a) * R, (Y0 + 0.5) / 2, Math.sin(a) * R); scene.add(leg);
  }

  // The stretched sheet: a polar grid whose depth follows a softened 1/r well.
  const pos = new Float32Array((SEG_R + 1) * (SEG_T + 1) * 3), idx = [];
  for (let i = 0; i < SEG_R; i++) for (let j = 0; j < SEG_T; j++) {
    const k = i * (SEG_T + 1) + j, n = k + SEG_T + 1;
    idx.push(k, n, k + 1, k + 1, n, n + 1);
  }
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sheetGeo.setIndex(idx);
  scene.add(new THREE.Mesh(sheetGeo, M.sheet));
  const RINGS = Math.floor(SEG_R / 3) + 1, SPOKES = SEG_T / 4;
  const gridPos = new Float32Array((RINGS * SEG_T + SPOKES * SEG_R) * 6);
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
  scene.add(new THREE.LineSegments(gridGeo, M.grid));

  const rAt = i => 0.35 + (R - 0.35) * Math.pow(i / SEG_R, 1.35);
  const yAt = (r, D) => Y0 - K * D * (1 - r / R) / (1 + 2.2 * r);
  function shapeSheet(D) {
    for (let i = 0; i <= SEG_R; i++) {
      const r = rAt(i), y = yAt(r, D);
      for (let j = 0; j <= SEG_T; j++) {
        const t = j / SEG_T * Math.PI * 2, k = (i * (SEG_T + 1) + j) * 3;
        pos[k] = Math.cos(t) * r; pos[k + 1] = y; pos[k + 2] = Math.sin(t) * r;
      }
    }
    sheetGeo.attributes.position.needsUpdate = true;
    sheetGeo.computeVertexNormals();
    let g = 0;
    const at = (i, j) => (i * (SEG_T + 1) + j) * 3;
    const put = k => { gridPos[g++] = pos[k]; gridPos[g++] = pos[k + 1] + 0.012; gridPos[g++] = pos[k + 2]; };
    for (let i = 0; i <= SEG_R; i += 3) for (let j = 0; j < SEG_T; j++) { put(at(i, j)); put(at(i, j + 1)); }
    for (let j = 0; j < SEG_T; j += 4) for (let i = 0; i < SEG_R; i++) { put(at(i, j)); put(at(i + 1, j)); }
    gridGeo.attributes.position.needsUpdate = true;
  }

  // Centre mass and accretion glow.
  const mass = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), M.hole); scene.add(mass);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 64), M.glow); halo.rotation.x = Math.PI / 2; scene.add(halo);

  // Slave syringe under the sheet (vertical): its rod is tied to the sheet's centre.
  const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 24, 1, true), M.glass); sBarrel.position.y = 0.5 + 0.75; scene.add(sBarrel);
  const sWater = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1, 24), M.water); scene.add(sWater);
  const sSeal = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 24), M.rubber); scene.add(sSeal);
  const sRod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 10), M.plunger); scene.add(sRod);

  // Master syringe lying on the base: the part a visitor would pull.
  const master = new THREE.Group(); master.position.set(1.4, 1.15, 4.6); master.rotation.y = Math.PI / 2; scene.add(master);
  const mBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 24, 1, true), M.glass); mBarrel.rotation.x = Math.PI / 2; master.add(mBarrel);
  const mWater = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), M.water); mWater.rotation.x = Math.PI / 2; master.add(mWater);
  const mPlunger = new THREE.Group(); master.add(mPlunger);
  const mRod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 10), M.plunger); mRod.rotation.x = Math.PI / 2; mRod.position.z = 1.7; mPlunger.add(mRod);
  const mSeal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 24), M.rubber); mSeal.rotation.x = Math.PI / 2; mPlunger.add(mSeal);
  const mThumb = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 24), M.plunger); mThumb.rotation.x = Math.PI / 2; mThumb.position.z = 3.4; mPlunger.add(mThumb);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.4, 12), M.glass); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = -1.9; master.add(nozzle);
  const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, 1.15, 4.6), new THREE.Vector3(-1.6, 0.8, 4.3), new THREE.Vector3(-1.9, 0.65, 2.6),
    new THREE.Vector3(-1.0, 0.62, 0.9), new THREE.Vector3(-0.3, 0.58, 0.15), new THREE.Vector3(0, 0.55, 0),
  ]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 64, 0.12, 10, false), M.tube));

  // Marbles orbit the well; a deeper well means a faster orbit and a faster fall inward.
  const marbleMats = [0xe8edf5, COPPER, 0x7fc4ff, 0xf2b31b].map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, clearcoat: 1 }));
  const marbleGeo = new THREE.SphereGeometry(0.22, 20, 12);
  const marbles = [];
  let colour = 0;
  function addMarble() {
    const m = new THREE.Mesh(marbleGeo, marbleMats[colour++ % marbleMats.length]);
    m.userData = { r: R - 0.4 - Math.random() * 0.8, t: Math.random() * Math.PI * 2 };
    scene.add(m); marbles.push(m);
    if (marbles.length > 8) scene.remove(marbles.shift());
  }
  for (let i = 0; i < 4; i++) addMarble();
  drop?.addEventListener('click', addMarble);

  let depth = Number(slider.value) / 100, target = depth;
  slider.addEventListener('input', () => { target = Number(slider.value) / 100; controls.autoRotate = false; });
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  loop(canvas, (dt) => {
    depth += (target - depth) * Math.min(1, dt * 4);
    const D = 0.2 + depth * 1.65;
    shapeSheet(D);
    const bottom = yAt(0.35, D);
    mass.position.y = bottom + 0.22; halo.position.y = bottom + 0.3;
    halo.material.opacity = 0.2 + depth * 0.7;

    // Pulling the master plunger draws water out of the slave, so its rod drops with the sheet.
    const sealZ = -1.2 + depth * 2.5;
    mPlunger.position.z = sealZ;
    const mLen = sealZ + 1.7;
    mWater.scale.y = Math.max(0.02, mLen); mWater.position.z = -1.7 + mWater.scale.y / 2;
    const sLen = 1.25 - depth * 0.95, sTop = 0.5 + sLen;
    sWater.scale.y = sLen; sWater.position.y = 0.5 + sLen / 2;
    sSeal.position.y = sTop + 0.07;
    const rodLen = Math.max(0.05, bottom - (sTop + 0.14));
    sRod.scale.y = rodLen; sRod.position.y = sTop + 0.14 + rodLen / 2;

    for (const m of marbles) {
      const u = m.userData;
      u.t += (0.35 + D * 1.2) / Math.pow(Math.max(u.r, 0.5), 1.5) * dt * 2.2;
      u.r -= dt * (0.04 + D * 0.12) / Math.max(u.r, 0.6);
      if (u.r < 0.55) { u.r = R - 0.4; u.t = Math.random() * Math.PI * 2; }
      m.position.set(Math.cos(u.t) * u.r, yAt(u.r, D) + 0.24, Math.sin(u.t) * u.r);
    }
    controls.update();
    renderer.render(scene, camera);
  });
}

/* ------------------------------------------------------------------ toy truck */
export function initTruck(root) {
  const canvas = root.querySelector('canvas');
  const slider = root.querySelector('input[type=range]');
  const tip = root.querySelector('[data-tip]');
  const dumpBtn = root.querySelector('[data-dump]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { renderer, scene, camera, controls } = makeStage(canvas, { pos: [25, 14, 27], target: [0, 6, 0], min: 20, max: 50 });
  controls.autoRotate = !reduce;

  const M = {
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2ad1c, roughness: 0.5 }),
    gray: new THREE.MeshStandardMaterial({ color: 0x5f646b, roughness: 0.7 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.95 }),
  };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // Moulded-plastic look: every block gets rounded edges scaled to its thinnest side.
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.3, Math.min(w, h, d) * 0.3)), mat);
    m.position.set(x, y, z); return m;
  };
  const cyl = (r, len, mat, x, y, z, axis = 'z', seg = 24) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z); return m;
  };

  const parts = [];
  // n = number on the group's parts sheet; dir = where the part flies when exploded.
  function part(n, th, en, dir, ...meshes) {
    const g = new THREE.Group();
    meshes.forEach(m => g.add(m));
    g.userData = { n, th, en, dir: new THREE.Vector3(...dir) };
    scene.add(g); parts.push(g);
    return g;
  }

  // 8 chassis (TRUCK BASE), plus the yellow rear body moulded onto it.
  const chassis = [box(13, 2.0, 4.6, M.black, 0, 3.1, 0), box(7.8, 0.8, 5.6, M.yellow, -3.0, 4.6, 0)];
  for (const x of [-4.8, 4.8]) for (const s of [-1, 1]) chassis.push(cyl(0.45, 1.6, M.black, x, 2.4, s * 3.0));
  for (const x of [-2, 2]) chassis.push(box(0.8, 0.5, 0.8, M.black, x, 4.35, 0));
  part(8, 'แชสซี', 'Chassis', [0, -0.6, 0], ...chassis);

  // 2 tyres, 5 rims, 3 bolts: one of each per wheel.
  for (const x of [-4.8, 4.8]) for (const s of [-1, 1]) {
    const z = s * 3.9;
    const tyre = [cyl(2.35, 2.0, M.tyre, x, 2.4, z, 'z', 40)];
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      const l = box(0.55, 0.22, 1.8, M.tyre, x + Math.cos(a) * 2.4, 2.4 + Math.sin(a) * 2.4, z);
      l.rotation.z = a + Math.PI / 2; tyre.push(l);
    }
    part(2, 'ล้อยาง', 'Tyre', [0, 0, s * 4], ...tyre);
    const hub = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.28, 12, 32), M.yellow); hub.position.set(x, 2.4, z + s * 1.15);
    part(5, 'กระทะล้อ', 'Rim', [0, 0, s * 7], cyl(1.55, 0.45, M.yellow, x, 2.4, z + s * 0.85, 'z', 32), hub);
    const x1 = box(0.95, 0.16, 0.1, M.black, x, 2.4, z + s * 1.5), x2 = x1.clone();
    x1.rotation.z = Math.PI / 4; x2.rotation.z = -Math.PI / 4;
    part(3, 'น็อตล้อ', 'Wheel bolt', [0, 0, s * 9.5], cyl(0.62, 0.35, M.gray, x, 2.4, z + s * 1.3, 'z', 6), x1, x2);
  }

  // 11 lower body (CENTER): side profile with the front wheel arch, extruded across the width.
  const prof = new THREE.Shape();
  const th = Math.asin((4.6 - 2.4) / 2.9), ax = 2.9 * Math.cos(th);
  prof.moveTo(1.4, 7.2); prof.lineTo(1.4, 4.6); prof.lineTo(4.8 - ax, 4.6);
  prof.absarc(4.8, 2.4, 2.9, Math.PI - th, th, true);
  prof.lineTo(7.6, 4.6); prof.lineTo(7.7, 7.2); prof.lineTo(1.4, 7.2);
  const lowerGeo = new THREE.ExtrudeGeometry(prof, { depth: 6.4, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2, curveSegments: 24 });
  lowerGeo.translate(0, 0, -3.2);
  const lower = [new THREE.Mesh(lowerGeo, M.yellow)];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) lower.push(box(0.45, 0.35, 0.2, M.yellow, 5.4 + i * 0.6, 6.2, s * 3.4));
  part(11, 'ตัวถังล่าง', 'Lower body', [0, 1.6, 0], ...lower);

  // 7 cab frame (FRONT FRAME): pillars and rails around the windows.
  const cab = [];
  for (const x of [1.8, 7.0]) for (const s of [-1, 1]) cab.push(box(0.7, 3.8, 0.7, M.yellow, x, 9.1, s * 2.9));
  for (const s of [-1, 1]) cab.push(box(5.9, 0.7, 0.7, M.yellow, 4.4, 10.7, s * 2.9), box(5.9, 0.9, 0.5, M.yellow, 4.4, 7.65, s * 3.05));
  cab.push(box(0.7, 0.7, 6.5, M.yellow, 7.0, 10.7, 0), box(0.7, 0.7, 6.5, M.yellow, 1.8, 10.7, 0));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 20), M.yellow); hook.position.set(1.8, 8.0, 3.35); cab.push(hook);
  part(7, 'โครงห้องคนขับ', 'Cab frame', [0, 4.6, 0], ...cab);

  // 10 seat insert.
  const seat = [box(4.2, 0.8, 5.0, M.gray, 4.3, 7.6, 0)];
  for (const s of [-1, 1]) seat.push(box(0.6, 2.0, 1.8, M.gray, 3.0, 8.9, s * 1.3), box(1.6, 0.5, 1.8, M.gray, 3.8, 8.2, s * 1.3));
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 8, 24), M.gray); wheelS.position.set(5.7, 8.9, 1.2); wheelS.rotation.y = Math.PI / 2; seat.push(wheelS);
  part(10, 'เบาะและคอนโซล', 'Seat insert', [0, 2.4, 0], ...seat);

  // 4 front guard (FRONT GUARD): grey grille with the big cross screw and yellow lamps.
  const guard = [box(0.6, 3.2, 6.6, M.gray, 8.05, 5.4, 0), box(1.0, 0.8, 7.0, M.gray, 8.2, 3.7, 0)];
  guard.push(cyl(1.0, 0.35, M.gray, 8.45, 5.6, 0, 'x', 28));
  for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = box(0.12, 1.5, 0.3, M.black, 8.65, 5.6, 0); b.rotation.x = r; guard.push(b); }
  for (const s of [-1, 1]) for (const y of [5.4, 6.4]) guard.push(cyl(0.32, 0.3, M.yellow, 7.85, y, s * 2.6, 'x', 20));
  part(4, 'กันชนหน้า', 'Front guard', [4.6, 0, 0], ...guard);

  // 1 roof (CAR-ROOF): grey visor with five light bumps and a rear hinge.
  const roof = [box(6.3, 0.6, 6.8, M.gray, 4.45, 11.35, 0)];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.gray);
    b.scale.set(1.3, 0.8, 1); b.position.set(6.6, 11.65, -2.4 + i * 1.2); roof.push(b);
  }
  roof.push(cyl(0.35, 6.8, M.gray, 1.4, 11.2, 0, 'z', 16));
  part(1, 'หลังคา', 'Roof', [0, 8, 0], ...roof);

  // 9 dump bed (TRUCK): open box pivoting at the rear axle line, front wall up to the roof.
  const bed = new THREE.Group();
  [
    box(8, 0.5, 6.8, M.yellow, 0, 0, 0),
    box(8, 2.6, 0.45, M.yellow, 0, 1.4, 3.2), box(8, 2.6, 0.45, M.yellow, 0, 1.4, -3.2),
    box(8, 0.35, 0.75, M.yellow, 0, 2.75, 3.25), box(8, 0.35, 0.75, M.yellow, 0, 2.75, -3.25),
    box(0.5, 5.75, 6.8, M.yellow, 3.8, 2.9, 0),
    cyl(0.55, 3.2, M.yellow, 2.8, 0.8, 0, 'z', 20),
  ].forEach(m => bed.add(m));
  for (const s of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.8, 3), M.black);
    sign.rotation.z = Math.PI / 2; sign.position.set(-1.4, 1.5, s * 3.44);
    if (s < 0) sign.rotation.y = Math.PI;
    bed.add(sign);
  }
  const pivot = new THREE.Group(); pivot.position.set(-6.8, 5.0, 0);
  bed.position.set(3.8, 0.25, 0); pivot.add(bed);
  part(9, 'กระบะดั๊มพ์', 'Dump bed', [-2, 6, 0], pivot);

  // 6 tailgate (TRUCK COVER): the small plate with two hinge clips at the back.
  const gate = [box(0.4, 2.4, 6.0, M.yellow, -7.3, 6.5, 0)];
  for (const s of [-1, 1]) gate.push(box(0.5, 0.5, 0.4, M.yellow, -7.3, 7.9, s * 2.4));
  part(6, 'ฝาท้าย', 'Tailgate', [-6, 1, 0], ...gate);

  for (const p of parts) {
    p.userData.home = p.position.clone();
    p.traverse(o => { if (o.isMesh) { o.userData.part = p; o.userData.base = o.material; } });
  }

  let ex = Number(slider.value) / 100, exT = ex, tilt = 0, tiltT = 0;
  slider.addEventListener('input', () => { exT = Number(slider.value) / 100; controls.autoRotate = false; });
  dumpBtn?.addEventListener('click', () => {
    tiltT = tiltT ? 0 : 1;
    dumpBtn.setAttribute('aria-pressed', String(!!tiltT));
  });
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // Hover (or tap) a part to see its number and name.
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const glowCache = new Map();
  const glowOf = mat => {
    if (!glowCache.has(mat)) { const g = mat.clone(); g.emissive = new THREE.Color(COPPER); g.emissiveIntensity = 0.4; glowCache.set(mat, g); }
    return glowCache.get(mat);
  };
  let hot = null;
  const setHot = p => {
    if (p === hot) return;
    if (hot) hot.traverse(o => { if (o.isMesh) o.material = o.userData.base; });
    hot = p;
    if (p) p.traverse(o => { if (o.isMesh) o.material = glowOf(o.userData.base); });
  };
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(parts, true)[0];
    const p = hit ? hit.object.userData.part : null;
    setHot(p);
    if (p) {
      tip.hidden = false;
      tip.textContent = `${p.userData.n} · ${p.userData[lang()]}`;
      tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    } else tip.hidden = true;
  }
  canvas.addEventListener('pointermove', pick);
  canvas.addEventListener('pointerdown', pick);
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; setHot(null); });

  const ease = t => t * t * (3 - 2 * t);
  // Zoom is off, so the camera distance is ours: pull back while the parts fly apart.
  const baseLen = camera.position.distanceTo(controls.target), off = new THREE.Vector3();
  loop(canvas, (dt) => {
    ex += (exT - ex) * Math.min(1, dt * 5);
    tilt += (tiltT - tilt) * Math.min(1, dt * 3);
    const e = ease(ex);
    for (const p of parts) p.position.copy(p.userData.home).addScaledVector(p.userData.dir, e * 0.8);
    controls.target.y = 6 + e * 2;
    off.subVectors(camera.position, controls.target).setLength(baseLen * (1 + e * 0.45));
    camera.position.copy(controls.target).add(off);
    pivot.rotation.z = tilt * 0.7;
    controls.update();
    renderer.render(scene, camera);
  });
}
