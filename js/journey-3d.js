/* Two interactive models for the Journey timeline, built in code (no mesh files):
   - backhoe: the Y1 hydraulic digger. Three master syringes on the board push water through
     tubes into slave syringes that work the boom, stick and bucket; a fourth input swings it.
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

/* ------------------------------------------------------------------ backhoe */
export function initBackhoe(root) {
  const canvas = root.querySelector('canvas');
  const sliders = [...root.querySelectorAll('input[type=range]')];
  const digBtn = root.querySelector('[data-dig]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { renderer, scene, camera, controls } = makeStage(canvas, { pos: [13, 11, 19], target: [2.5, 4, 0], min: 12, max: 40 });

  const M = {
    board: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.3, depthWrite: false }),
    plunger: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    bucket: new THREE.MeshStandardMaterial({ color: 0xf2ad1c, roughness: 0.5, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 }),
  };
  // One water colour per circuit, matched to the slider dots in the HTML.
  const WATER = [0x3aa0ff, 0xff5a4e, 0x4fd18b];
  const waterMat = WATER.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: c, emissiveIntensity: 0.25 }));
  const tubeMat = WATER.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, transparent: true, opacity: 0.8, emissive: c, emissiveIntensity: 0.2 }));

  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.12, Math.min(w, h, d) * 0.3)), mat);
    m.position.set(x, y, z); return m;
  };
  const pin = (parent, x, y) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 12), M.steel);
    p.rotation.x = Math.PI / 2; p.position.set(x, y, 0); parent.add(p);
  };

  scene.add(box(20, 0.6, 13, M.board, 0, 0.3, 0));
  const pile = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.soil);
  pile.scale.set(1.3, 0.45, 1.1); pile.position.set(9.6, 0.6, 1.5); scene.add(pile);

  // Swing: turntable, the two side plates of the mast, the shoulder pin.
  const swing = new THREE.Group(); swing.position.set(-1.5, 0.6, 0); scene.add(swing);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.5, 40), M.wood); table.position.y = 0.25; swing.add(table);
  for (const z of [-0.55, 0.55]) swing.add(box(2.6, 4.8, 0.3, M.wood, 0.4, 2.9, z));
  pin(swing, 1.0, 4.8);

  // Boom, stick and bucket: each link is a group rotating about its own pin.
  const boom = new THREE.Group(); boom.position.set(1.0, 4.8, 0); swing.add(boom);
  for (const z of [-0.35, 0.35]) boom.add(box(7.6, 0.75, 0.25, M.wood, 3.4, 0, z));
  pin(boom, 7.0, 0);
  const stick = new THREE.Group(); stick.position.set(7.0, 0, 0); boom.add(stick);
  stick.add(box(6.4, 0.6, 0.3, M.wood, 2.2, 0, 0));
  stick.add(box(1.4, 0.35, 0.25, M.wood, -0.6, 0.2, 0)); // stub the stick cylinder pushes on
  pin(stick, 5.2, 0);
  const bucketG = new THREE.Group(); bucketG.position.set(5.2, 0, 0); stick.add(bucketG);
  const prof = new THREE.Shape();
  prof.moveTo(0, 0.3); prof.lineTo(-0.2, -1.2); prof.quadraticCurveTo(0.2, -2.2, 1.6, -2.0);
  prof.lineTo(1.4, -1.6); prof.quadraticCurveTo(0.6, -1.7, 0.45, -1.1); prof.lineTo(0.6, 0.2);
  const bucketGeo = new THREE.ExtrudeGeometry(prof, { depth: 1.6, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  bucketGeo.translate(0, 0, -0.8);
  bucketG.add(new THREE.Mesh(bucketGeo, M.bucket));
  for (const z of [-0.82, 0.82]) {
    const side = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), M.bucket);
    side.position.set(0.55, -1.25, z); bucketG.add(side);
  }
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), M.steel);
    tooth.rotation.z = -1.35; tooth.position.set(1.75, -1.95, -0.6 + i * 0.4); bucketG.add(tooth);
  }
  const load = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10), M.soil);
  load.scale.set(1, 0.6, 0.9); load.position.set(0.7, -1.35, 0); load.visible = false; bucketG.add(load);

  // Slave syringes mounted between two links: barrel pinned on the parent, rod on the child.
  const up = new THREE.Vector3(0, 1, 0);
  function slave(i, parent, a, child, b) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1, 20, 1, true), M.glass);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 1, 20), waterMat[i]);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), M.plunger);
    scene.add(barrel, water, rod);
    const wa = new THREE.Vector3(), wb = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    let len = 0;
    return function update() {
      parent.localToWorld(wa.copy(A)); child.localToWorld(wb.copy(B));
      dir.subVectors(wb, wa); const d = dir.length(); dir.normalize();
      if (!len) len = d * 0.62; // barrel length fixed from the starting pose
      q.setFromUnitVectors(up, dir);
      const bl = Math.min(len, d - 0.2);
      barrel.quaternion.copy(q); barrel.scale.y = bl; barrel.position.copy(wa).addScaledVector(dir, bl / 2);
      const wl = Math.max(0.05, bl - 0.15);
      water.quaternion.copy(q); water.scale.y = wl; water.position.copy(wa).addScaledVector(dir, wl / 2);
      const rl = d - bl + 0.3;
      rod.quaternion.copy(q); rod.scale.y = rl; rod.position.copy(wb).addScaledVector(dir, -rl / 2);
      return wa;
    };
  }
  const slaves = [
    slave(0, swing, [2.6, 1.8, 0], boom, [2.6, -0.45, 0]),
    slave(1, boom, [4.0, 0.55, 0], stick, [-0.9, 0.35, 0]),
    slave(2, stick, [2.0, 0.45, 0], bucketG, [0.15, 0.3, 0]),
  ];

  // Master syringes on the control strip at the front: nozzle toward the arm, thumb toward you.
  const masters = WATER.map((_, i) => {
    const g = new THREE.Group(); g.position.set(-4.4 + i * 1.6, 1.0, 3.6); g.rotation.x = -Math.PI / 2; scene.add(g);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3, 20, 1, true), M.glass));
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.3, 12), M.glass); nozzle.position.y = 1.65; g.add(nozzle);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1, 20), waterMat[i]); g.add(water);
    const plunger = new THREE.Group(); g.add(plunger);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 10), M.plunger); rod.position.y = -1.5; plunger.add(rod);
    plunger.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 20), M.rubber));
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 20), M.plunger); thumb.position.y = -3; plunger.add(thumb);
    return { g, water, plunger, tube: null };
  });

  // Inputs: swing angle plus one value per hydraulic circuit, all 0..1.
  const RANGE = [[-1.2, 1.2], [-0.35, 0.75], [-2.3, -0.75], [-2.4, 0.4]];
  const cur = sliders.map(s => Number(s.value) / 100), tgt = cur.slice();
  let seq = null;
  sliders.forEach((s, i) => s.addEventListener('input', () => { tgt[i] = Number(s.value) / 100; seq = null; }));

  // "Dig" plays a full cycle: reach, curl into the pile, lift, swing, dump, return.
  const KEYS = [
    [0.5, 0.45, 0.4, 0.4], [0.5, 0.12, 0.8, 0.15], [0.5, 0.1, 0.6, 0.95, 'grab'], [0.5, 0.75, 0.3, 1.0],
    [0.95, 0.75, 0.3, 1.0], [0.95, 0.6, 0.45, 0.1, 'drop'], [0.5, 0.5, 0.4, 0.4],
  ];
  digBtn?.addEventListener('click', () => { seq = { k: 0, t: 0 }; });

  const mid = new THREE.Vector3();
  function plumb() {
    masters.forEach((m, i) => {
      const from = m.g.localToWorld(new THREE.Vector3(0, 1.8, 0));
      const to = slaves[i]().clone();
      mid.lerpVectors(from, to, 0.5); mid.y = 1.2;
      const curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x, 0.9, from.z - 1.4), mid, to]);
      if (m.tube) { m.tube.geometry.dispose(); scene.remove(m.tube); }
      m.tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 8, false), tubeMat[i]);
      scene.add(m.tube);
    });
  }

  let first = true;
  loop(canvas, (dt) => {
    if (seq) {
      const key = KEYS[seq.k];
      for (let i = 0; i < 4; i++) tgt[i] = key[i];
      seq.t += dt;
      if (seq.t > (reduce ? 0.2 : 1.1)) {
        if (key[4] === 'grab') load.visible = true;
        if (key[4] === 'drop') load.visible = false;
        seq.t = 0; seq.k++;
        if (seq.k >= KEYS.length) seq = null;
      }
    }
    let moved = first;
    for (let i = 0; i < 4; i++) {
      const n = cur[i] + (tgt[i] - cur[i]) * Math.min(1, dt * 3.5);
      if (Math.abs(n - cur[i]) > 1e-4) moved = true;
      cur[i] = n;
      if (seq) sliders[i].value = Math.round(n * 100);
    }
    if (moved) {
      const at = i => RANGE[i][0] + (RANGE[i][1] - RANGE[i][0]) * cur[i];
      swing.rotation.y = at(0); boom.rotation.z = at(1); stick.rotation.z = at(2); bucketG.rotation.z = at(3);
      // Pushing a master in drives water into its slave, which extends: v = 1 is fully pushed in.
      masters.forEach((m, i) => {
        const seal = -1.1 + cur[i + 1] * 2.4;
        m.plunger.position.y = seal;
        const wl = Math.max(0.05, 1.45 - seal);
        m.water.scale.y = wl; m.water.position.y = 1.5 - wl / 2;
      });
      scene.updateMatrixWorld();
      plumb();
      first = false;
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
