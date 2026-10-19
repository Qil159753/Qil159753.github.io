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
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose(); pmrem.dispose(); // only the baked env map is needed after this
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

/* Run `step` only while the viewer is on screen and the tab is visible: the frame loop is started and
   stopped, not left spinning. A step that throws stops the loop once instead of failing every frame. */
function loop(canvas, step) {
  let seen = false, raf = 0, last = 0, dead = false;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    try { step(dt); } catch (err) { dead = true; raf = 0; console.error('journey 3d', err); return; }
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

/* ------------------------------------------------------------------ backhoe */
/* Arm geometry lives in 2D: every link is a group rotating about z, so each pin is an (x, y) in its
   parent's frame. Numbers were checked offline: every cylinder grows monotonically across its slider,
   keeps a real lever arm about its joint, and the dig cycle stays inside the pile and above the board. */
const BH = {
  S: [0.7, 5.0],                      // shoulder pin, swing frame
  A1: [1.9, 1.45], P1: [2.2, 0.55],   // boom cylinder: barrel on the mast foot, rod under the boom
  T: [7.0, 0], A2: [3.1, 1.85],       // boom tip (stick pin); stick cylinder barrel on the boom lug
  H: [-0.85, 0.6], Q: [4.6, 0],       // stick heel (rod pin), bucket pin, stick frame
  A3: [0.25, 0.85],                   // bucket cylinder barrel on the stick
  G: [4.15, 0.28], g: 0.95,           // guide link: pivot on the stick, length
  K: [0.15, 0.75], t: 0.92,           // tipping link: ear on the bucket, length
};
// Joint angle at slider 0 and 1. Slider 1 = master pushed fully in = slave fully extended.
const BH_RANGE = [[-1.2, 1.2], [-0.25, 0.8], [-0.95, -2.15], [0.85, -1.45]];

const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/* Bucket four-bar, in the stick frame: J is where the guide link (from G) meets the tipping link (to the ear). */
function linkJ(b) {
  const K = add2(BH.Q, rot(BH.K, b)), G = BH.G;
  const d = dist2(G, K), a = (BH.g * BH.g - BH.t * BH.t + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, BH.g * BH.g - a * a));
  const ex = (K[0] - G[0]) / d, ey = (K[1] - G[1]) / d, mx = G[0] + a * ex, my = G[1] + a * ey;
  return { J: [mx - h * ey, my + h * ex], K };
}
// Each slave's barrel pin (fixed in the parent frame) and rod pin (moves with its joint angle).
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const BH_BARREL = [BH.A1, BH.A2, BH.A3];
const bhRod = [r => add2(BH.S, rot(BH.P1, r)), s => add2(BH.T, rot(BH.H, s)), b => linkJ(b).J];
const bhLen = (i, a) => dist2(BH_BARREL[i], bhRod[i](a));

export function initBackhoe(root) {
  const canvas = root.querySelector('canvas');
  const sliders = [...root.querySelectorAll('input[type=range]')];
  const digBtn = root.querySelector('[data-dig]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { renderer, scene, camera, controls } = makeStage(canvas, { pos: [8, 12, 25], target: [0, 3, 0], min: 10, max: 60 });
  // Zoom is off, so the distance is ours: back off until the board and the arm's reach fit the canvas.
  const hull = [[-10, 0, -7.5], [10, 0, -7.5], [-10, 0, 7.5], [10, 0, 7.5], [-10, 0.6, 8.3], [10, 0.6, 7.5],
    [-1, 11, 0], [4, 10.5, 0], [8, 7, 0], [8, 7, -4.5]].map(p => new THREE.Vector3(...p));
  const off = new THREE.Vector3(), ndc = new THREE.Vector3();
  function fit() {
    off.subVectors(camera.position, controls.target).normalize();
    let lo = 10, hi = 90;
    for (let n = 0; n < 18; n++) {
      const d = (lo + hi) / 2;
      camera.position.copy(controls.target).addScaledVector(off, d); camera.lookAt(controls.target); camera.updateMatrixWorld();
      const ok = hull.every(p => { ndc.copy(p).project(camera); return Math.abs(ndc.x) < 0.94 && Math.abs(ndc.y) < 0.92; });
      if (ok) hi = d; else lo = d;
    }
    camera.position.copy(controls.target).addScaledVector(off, hi);
    controls.minDistance = controls.maxDistance = hi;
    dirty = true;
  }
  let dirty = true;
  new ResizeObserver(fit).observe(canvas);

  const M = {
    board: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.7 }),
    ply: new THREE.MeshStandardMaterial({ color: 0xb3864f, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.3, depthWrite: false }),
    plunger: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    bucket: new THREE.MeshStandardMaterial({ color: 0xf2ad1c, roughness: 0.5, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 }),
    dug: new THREE.MeshStandardMaterial({ color: 0x8a5d3a, roughness: 1, flatShading: true }),
  };
  // One water colour per circuit, matched to the slider dots in the HTML.
  const WATER = [0x3aa0ff, 0xff5a4e, 0x4fd18b];
  const waterMat = WATER.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: c, emissiveIntensity: 0.25 }));
  const tubeMat = WATER.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.2 }));

  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.12, Math.min(w, h, d) * 0.3)), mat);
    m.position.set(x, y, z); return m;
  };
  // Flat plate cut to an outline, `th` thick, centred on z.
  const plate = (pts, th, mat, z) => {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); pts.slice(1).forEach(p => sh.lineTo(...p));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.translate(0, 0, z - th / 2);
    return new THREE.Mesh(geo, mat);
  };
  const pin = (parent, [x, y], len = 1.2, r = 0.09) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), M.steel);
    p.rotation.x = Math.PI / 2; p.position.set(x, y, 0); parent.add(p); return p;
  };

  // Base board, the soil pile in front of the arm and a small spoil heap off to the side.
  scene.add(box(20, 0.6, 15, M.board, 0, 0.3, 0));
  const mound = (r, sx, sy, sz, x, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.soil);
    m.scale.set(sx, sy, sz); m.position.set(x, 0.6, z); scene.add(m);
  };
  mound(2.6, 1, 0.46, 0.95, 7.0, 0);
  mound(1.2, 1, 0.5, 1, 5.0, -4.6);

  // Swing: turntable, tapered mast plates either side of the boom, foot block for the boom cylinder.
  const swing = new THREE.Group(); swing.position.set(-4.5, 0.6, 0); scene.add(swing);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 40), M.wood); table.position.y = 0.25; swing.add(table);
  for (const z of [-0.75, 0.75]) swing.add(plate([[-0.9, 0.5], [1.5, 0.5], [1.3, 5.6], [0.1, 5.6]], 0.22, M.wood, z));
  swing.add(box(0.5, 0.5, 1.3, M.wood, -0.4, 2.6, 0));          // back brace
  swing.add(box(1.6, 0.4, 0.95, M.wood, 1.4, 0.7, 0));          // foot
  for (const z of [-0.36, 0.36]) swing.add(box(0.6, 0.9, 0.1, M.ply, 1.9, 1.3, z));
  pin(swing, BH.S, 1.9); pin(swing, BH.A1, 0.9, 0.07);

  // Boom: two bent plates (a "banana" boom, like a real backhoe), with a lug for the stick cylinder.
  const boom = new THREE.Group(); boom.position.set(...BH.S, 0); swing.add(boom);
  const boomOutline = [[-0.45, -0.1], [-0.3, 0.35], [2.7, 1.3], [2.85, 2.15], [3.4, 2.15], [3.75, 1.35], [7.3, 0.35],
    [7.45, -0.1], [7.2, -0.4], [3.4, 0.5], [2.4, 0.15], [0.2, -0.45]];
  for (const z of [-0.45, 0.45]) boom.add(plate(boomOutline, 0.18, M.wood, z));
  boom.add(box(0.6, 0.3, 0.9, M.wood, 4.9, 0.95, 0));           // spacer between the plates
  pin(boom, BH.P1, 1.1, 0.07); pin(boom, BH.A2, 1.1, 0.07); pin(boom, BH.T, 1.25);

  // Stick: one plate between the boom plates, a clevis at the heel and cheeks for the bucket cylinder.
  const stick = new THREE.Group(); stick.position.set(...BH.T, 0); boom.add(stick);
  stick.add(plate([[-0.35, -0.3], [-0.35, 0.3], [4.4, 0.32], [4.9, 0.2], [4.95, -0.2], [4.6, -0.32]], 0.26, M.wood, 0));
  for (const z of [-0.22, 0.22]) stick.add(plate([[0.25, -0.25], [0.25, 0.25], [-0.8, 0.95], [-1.1, 0.7], [-0.4, -0.25]], 0.09, M.ply, z));
  for (const z of [-0.33, 0.33]) stick.add(plate([[-0.1, 0.25], [0.65, 0.25], [0.45, 1.05], [0.05, 1.05]], 0.08, M.ply, z));
  pin(stick, BH.H, 0.6, 0.07); pin(stick, BH.A3, 0.8, 0.07); pin(stick, BH.G, 0.75, 0.07); pin(stick, BH.Q, 0.75);

  // Bucket linkage: guide links (stick to J) and tipping links (J to the bucket ear), rebuilt every move.
  const guide = [-0.3, 0.3].map(z => { const m = box(1, 0.22, 0.07, M.steel); m.position.z = z; stick.add(m); return m; });
  const tip = [-0.18, 0.18].map(z => { const m = box(1, 0.22, 0.07, M.steel); m.position.z = z; stick.add(m); return m; });
  const pinJ = pin(stick, [0, 0], 0.75, 0.07);
  const placeBar = (m, a, b) => {
    m.position.x = (a[0] + b[0]) / 2; m.position.y = (a[1] + b[1]) / 2;
    m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]); m.scale.x = (dist2(a, b) + 0.22);
  };

  // Bucket: curved wrap plate and two side plates. Mouth faces the machine; teeth curl toward it.
  const bucketG = new THREE.Group(); bucketG.position.set(...BH.Q, 0); stick.add(bucketG);
  const wrap = new THREE.SplineCurve([[-0.12, -0.36], [-0.36, 0], [-0.16, 0.36], [0.4, 0.5], [1.04, 0.4], [1.52, 0.04], [1.72, -0.44], [1.68, -0.8]]
    .map(p => new THREE.Vector2(...p))).getPoints(28);
  const W = 1.2, inner = wrap.map((p, i) => {
    const a = wrap[Math.max(0, i - 1)], b = wrap[Math.min(wrap.length - 1, i + 1)];
    const n = new THREE.Vector2(b.y - a.y, a.x - b.x).normalize();    // inward: the outline runs clockwise
    return p.clone().addScaledVector(n, 0.07);
  });
  const shell = new THREE.Shape([...wrap, ...inner.reverse()]);
  const shellGeo = new THREE.ExtrudeGeometry(shell, { depth: W, bevelEnabled: false });
  shellGeo.translate(0, 0, -W / 2);
  bucketG.add(new THREE.Mesh(shellGeo, M.bucket));
  for (const z of [-W / 2, W / 2]) {
    const side = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(wrap), { depth: 0.06, bevelEnabled: false }), M.bucket);
    side.position.z = z - 0.03; bucketG.add(side);
  }
  for (const z of [-0.28, 0.28]) bucketG.add(plate([[-0.25, -0.15], [0.25, -0.15], [0.42, 0.8], [0.0, 0.95], [-0.2, 0.3]], 0.07, M.bucket, z));
  pin(bucketG, BH.K, 0.75, 0.07);
  const edge = wrap[wrap.length - 1], lip = wrap[wrap.length - 4];
  const toothDir = Math.atan2(edge.y - lip.y, edge.x - lip.x) - Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), M.steel);
    tooth.rotation.z = toothDir; tooth.position.set(edge.x + Math.cos(toothDir + Math.PI / 2) * 0.15, edge.y + Math.sin(toothDir + Math.PI / 2) * 0.15, -0.45 + i * 0.3);
    bucketG.add(tooth);
  }
  // Freshly dug soil, heaped a little above the mouth so it reads as a full bucket.
  const load = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), M.dug);
  load.scale.set(1.15, 0.75, 0.85); load.position.set(0.8, -0.35, 0); load.visible = false; bucketG.add(load);

  /* One syringe in its own frame: nozzle end at the origin, axis +y, barrel BL long. Water fills from the
     nozzle to the rubber seal at `w`; the rod runs from the seal for `rl`. */
  const BL = 2.4, SR = 0.28;
  function syringe(i, rl, thumb) {
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(SR, SR, BL, 20, 1, true), M.glass); barrel.position.y = BL / 2;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, SR * 0.9, 0.3, 12), M.glass); nozzle.position.y = -0.15;
    const flange = box(1.0, 0.08, 0.5, M.glass, 0, BL, 0);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(SR - 0.03, SR - 0.03, 1, 20), waterMat[i]);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(SR - 0.02, SR - 0.02, 0.16, 20), M.rubber);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, rl, 10), M.plunger);
    const end = thumb ? new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20), M.plunger) : box(0.24, 0.3, 0.2, M.plunger);
    g.add(barrel, nozzle, flange, water, seal, rod, end);
    return {
      g, rl,
      set(w) {
        water.scale.y = w; water.position.y = w / 2;
        seal.position.y = w; rod.position.y = w + rl / 2; end.position.y = w + rl;
      },
    };
  }

  // Slaves: barrel pinned at its nozzle end on the parent link, rod end pinned on the child (or on J).
  // rl is chosen so the seal sits 0.25 from the nozzle when the cylinder is fully closed.
  const parents = [swing, boom, stick];
  const span = BH_RANGE.slice(1).map((r, i) => [bhLen(i, r[0]), bhLen(i, r[1])]);
  const slaves = span.map(([dMin], i) => {
    const s = syringe(i, dMin - 0.25, false);
    s.g.position.set(...BH_BARREL[i], 0); parents[i].add(s.g);
    return s;
  });
  // Equal syringes on both ends, so water length moved out of a master shows up in its slave.
  const masters = span.map(([dMin, dMax], i) => {
    const s = syringe(i, BL + 0.2, true);
    s.g.position.set(-8 + i * 1.2, 1.25, 3.0); s.g.rotation.x = Math.PI / 2; scene.add(s.g);
    s.total = dMax - dMin + 0.5;
    return s;
  });
  scene.add(box(4.0, 0.35, 1.4, M.wood, -6.8, 0.78, 3.9));
  for (let i = 0; i < 3; i++) scene.add(box(0.75, 0.12, 0.3, M.ply, -8 + i * 1.2, 1.58, 3.9));

  // Tubes: master nozzle, along the board, up the mast and boom, into each slave's nozzle.
  const routes = [
    [[scene, [-6.6, 0.75, 2.2]], [swing, [-1.3, 0.62, 1.1]], [swing, [-1.3, 0.62, 0]], [swing, [0.9, 1.15, 0]]],
    [[scene, [-6.2, 0.75, 2.0]], [swing, [-1.3, 0.62, 1.15]], [swing, [-0.3, 1.2, 1.0]], [swing, [0.3, 4.8, 1.0]],
      [boom, [0.4, -0.15, 0.65]], [boom, [2.0, 0.65, 0.65]], [boom, [2.5, 1.7, 0.3]]],
    [[scene, [-5.8, 0.75, 1.8]], [swing, [-1.3, 0.62, 1.3]], [swing, [-0.3, 1.2, 1.14]], [swing, [0.4, 4.8, 1.14]],
      [boom, [0.5, -0.3, 0.8]], [boom, [3.5, 0.6, 0.8]], [boom, [6.6, 0.55, 0.8]], [stick, [-0.3, 1.25, 0.45]], [stick, [-0.3, 1.0, 0]]],
  ];
  // Each route: master nozzle tip, a drop to the board, the waypoints, the slave nozzle tip.
  routes.forEach((r, i) => { r.unshift([masters[i].g, [0, -0.3, 0]], [masters[i].g, [0, -0.7, 0.55]]); r.push([slaves[i].g, [0, -0.3, 0]]); });
  const curves = routes.map(r => new THREE.CatmullRomCurve3(r.map(() => new THREE.Vector3())));
  // Tube meshes are built once; moving the arm rewrites their vertices in place (same layout as TubeGeometry).
  const SEG = 70, RAD = 8, TR = 0.07;
  const tubes = WATER.map((_, i) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(curves[i], SEG, TR, RAD, false), tubeMat[i]);
    m.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); m.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; scene.add(m); return m;
  });
  const P = new THREE.Vector3(), nrm = new THREE.Vector3();
  function plumb() {
    tubes.forEach((tube, i) => {
      const c = curves[i];
      routes[i].forEach(([o, p], j) => o.localToWorld(c.points[j].set(...p)));
      c.updateArcLengths();
      const { normals, binormals } = c.computeFrenetFrames(SEG, false);
      const pos = tube.geometry.attributes.position, nor = tube.geometry.attributes.normal;
      for (let s = 0, v = 0; s <= SEG; s++) {
        c.getPointAt(s / SEG, P);
        for (let r = 0; r <= RAD; r++, v++) {
          const a = r / RAD * Math.PI * 2, sin = Math.sin(a), cos = -Math.cos(a);
          nrm.set(0, 0, 0).addScaledVector(normals[s], cos).addScaledVector(binormals[s], sin).normalize();
          nor.setXYZ(v, nrm.x, nrm.y, nrm.z);
          pos.setXYZ(v, P.x + TR * nrm.x, P.y + TR * nrm.y, P.z + TR * nrm.z);
        }
      }
      pos.needsUpdate = true; nor.needsUpdate = true;
    });
  }

  // Inputs: swing angle plus one value per hydraulic circuit, all 0..1.
  const cur = sliders.map(s => Number(s.value) / 100), tgt = cur.slice();
  let seq = null;
  sliders.forEach((s, i) => s.addEventListener('input', () => { tgt[i] = Number(s.value) / 100; seq = null; }));

  // "Dig" plays a full cycle: reach out, teeth into the far side of the pile, drag in while curling,
  // lift with the bucket closed, swing to the spoil heap, open to dump, return. Poses are [swing, boom, stick, bucket].
  const KEYS = [
    [0.5, 0.72, 0.1, 0], [0.5, 0.36, 0.12, 0.01], [0.5, 0.4, 0.22, 0.2],
    [0.5, 0.44, 0.3, 0.34], [0.5, 0.51, 0.36, 0.55], [0.5, 0.62, 0.48, 1, 'grab'], [0.5, 0.85, 0.54, 1],
    [0.69, 0.85, 0.54, 1], [0.69, 0.85, 0.42, 0], [0.5, 0.5, 0.4, 0.4],
  ];
  const STEP = [1.1, 0.8, 0.6, 0.6, 0.6, 0.8, 0.8, 0.9, 0.8, 1.2];
  digBtn?.addEventListener('click', () => { seq = { k: 0, t: 0, from: cur.slice() }; load.visible = false; });

  // The board stops the bucket: if a pose would push it below the board, the boom stays just high enough.
  const outline = [...wrap.map(p => [p.x, p.y]), [edge.x + Math.cos(toothDir + Math.PI / 2) * 0.35, edge.y + Math.sin(toothDir + Math.PI / 2) * 0.35]];
  const lowest = (r, s, b) => {
    const q = add2(add2(BH.S, rot(BH.T, r)), rot(BH.Q, r + s));
    return Math.min(...outline.map(p => q[1] + rot(p, r + s + b)[1]));
  };
  const at = i => BH_RANGE[i][0] + (BH_RANGE[i][1] - BH_RANGE[i][0]) * cur[i];
  function boomAngle() {
    const s = at(2), b = at(3), top = BH_RANGE[1][1];
    let lo = at(1), hi = top;
    if (lowest(lo, s, b) >= 0.05 || lowest(hi, s, b) < 0.05) return lowest(lo, s, b) >= 0.05 ? lo : hi;
    for (let n = 0; n < 14; n++) { const m = (lo + hi) / 2; if (lowest(m, s, b) >= 0.05) hi = m; else lo = m; }
    return hi;
  }
  const apply = () => {
    const ang = [at(0), boomAngle(), at(2), at(3)];
    swing.rotation.y = ang[0]; boom.rotation.z = ang[1]; stick.rotation.z = ang[2]; bucketG.rotation.z = ang[3];
    const { J, K } = linkJ(ang[3]);
    guide.forEach(m => placeBar(m, BH.G, J)); tip.forEach(m => placeBar(m, J, K));
    pinJ.position.set(J[0], J[1], 0);
    // Slave water length = pin distance minus rod; the master gives up exactly that much.
    slaves.forEach((s, i) => {
      const a = BH_BARREL[i], b = bhRod[i](ang[i + 1]);
      s.g.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
      const w = dist2(a, b) - s.rl;
      s.set(w); masters[i].set(masters[i].total - w);
    });
    if (cur[3] < 0.3) load.visible = false;   // an open bucket spills its load
    scene.updateMatrixWorld();
    plumb();
  };

  const ease = t => t * t * (3 - 2 * t);
  let first = true;
  loop(canvas, (dt) => {
    let moved = first || dirty;
    if (seq) {
      seq.t += dt;
      const dur = reduce ? 0.7 : STEP[seq.k], u = reduce ? 1 : ease(Math.min(1, seq.t / dur)), key = KEYS[seq.k];
      for (let i = 0; i < 4; i++) { cur[i] = seq.from[i] + (key[i] - seq.from[i]) * u; sliders[i].value = Math.round(cur[i] * 100); tgt[i] = cur[i]; }
      moved = true;
      if (seq.t >= dur) {
        if (key[4] === 'grab') load.visible = true;
        seq = ++seq.k < KEYS.length ? { k: seq.k, t: 0, from: key.slice(0, 4) } : null;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const n = reduce ? tgt[i] : cur[i] + (tgt[i] - cur[i]) * Math.min(1, dt * 6);
        if (Math.abs(n - cur[i]) > 1e-4) moved = true;
        cur[i] = n;
      }
    }
    if (moved) { apply(); first = false; }
    // Idle (arm still, camera settled): skip the draw. controls.update() reports damping and drags.
    if (controls.update() || moved) { renderer.render(scene, camera); dirty = false; }
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
