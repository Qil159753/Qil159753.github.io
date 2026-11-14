/* Chapter 4 of the Journey story, live: the same scene as tools/blender/nav.py (BATLY R1 maps a
   mock factory, the occupancy grid rises in a ripple from the robot, then it drives the
   A → B → C loop), rebuilt in three.js so it stays sharp at any size and can be dragged round.
   story.js drives it with set(p), p = 0..1 across the chapter, the way it drives the films.
   Blender coordinates (x, y, z-up) map to three as (x, z, -y); "frames" are the film's 1..96. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const COLS = 24, ROWS = 16, CS = 0.3, X0 = -COLS * CS / 2, Y0 = -ROWS * CS / 2;
const BLOCKS = [[7, 6, 16, 8], [3, 10, 6, 13], [18, 10, 21, 13], [10, 1, 13, 2]];
const A = [4, 4], B = [19, 4], C = [11, 12];
const ROUTE = [A, [17, 4], B, [19, 7], [17, 9], [14, 11], C, [6, 9], [4, 7], A];
const at = (c, r, z = 0) => [X0 + (c + 0.5) * CS, Y0 + (r + 0.5) * CS, z];
const v3 = ([x, y, z]) => new THREE.Vector3(x, z, -y);
// camera keys from nav.py: [frame, position, aim], Blender coordinates
const CAM = [
  [1, [-1.6, -5.4, 4.8], at(...A)],
  [28, [-0.6, -6.0, 5.6], [0.4, 0.2, 0]],
  [60, [1.6, -6.0, 5.2], [0.8, 0.4, 0]],
  [96, [3.4, -5.0, 4.6], [1.0, 0.6, 0]],
];
const LENS = 30, SHIFT_X = -0.27;     // mm on a 36 mm sensor, and Blender's horizontal lens shift

export function navScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.fog = new THREE.Fog(0x07090c, 8, 20);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 60);
  // a soft room to reflect, standing in for the glossy look of the EEVEE film
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env; scene.environmentIntensity = 0.35;

  // warm key from the front left, copper rim from behind, a dim fill (nav.py's studio())
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6);
  key.position.set(-4, 7, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 20 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xec9a5a, 2.4); rim.position.set(3, 3, -6); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8aa0b8, 0x080604, 0.45));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; floor.receiveShadow = true;
  scene.add(floor);

  // ---------------------------------------------------------------- the occupancy grid
  const kinds = { free: [], obst: [], wall: [] };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const wall = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
    const obst = BLOCKS.some(([c0, r0, c1, r1]) => c0 <= c && c <= c1 && r0 <= r && r <= r1);
    kinds[wall ? 'wall' : obst ? 'obst' : 'free'].push({ c, r, f: 3 + Math.hypot(c - A[0], r - A[1]) * 0.95 });
  }
  const H = { free: 0.04, obst: 0.35, wall: 0.6 };
  const MAT = {
    free: new THREE.MeshPhysicalMaterial({ color: 0x1c2631, roughness: 0.3, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    obst: new THREE.MeshStandardMaterial({ color: 0xc8804a, metalness: 0.35, roughness: 0.35, emissive: 0xec9a5a, emissiveIntensity: 0.18 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.45 }),
  };
  const tiles = {};
  for (const k of Object.keys(kinds)) {
    const g = new RoundedBoxGeometry(CS * 0.92, H[k], CS * 0.92, 2, Math.min(0.012, H[k] / 3));
    g.translate(0, H[k] / 2, 0);                                 // grow up from the floor
    const m = new THREE.InstancedMesh(g, MAT[k], kinds[k].length);
    m.castShadow = k !== 'free'; m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m); tiles[k] = m;
  }
  const M4 = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  function placeTiles(frame) {
    for (const k of Object.keys(kinds)) {
      kinds[k].forEach((t, i) => {
        const s = Math.min(1, Math.max(0.001, (frame - t.f) / 4));
        const [x, y] = at(t.c, t.r);
        tiles[k].setMatrixAt(i, M4.compose(P.set(x, 0, -y), Q, S.set(1, s, 1)));
      });
      tiles[k].instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- stations: glowing ring + letter
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb47c });
  for (const [name, cell] of [['A', A], ['B', B], ['C', C]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 48), glow);
    ring.rotation.x = Math.PI / 2; ring.position.copy(v3(at(...cell, 0.06))); scene.add(ring);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: letter(name), transparent: true, depthWrite: false }));
    spr.scale.set(0.42, 0.42, 1); spr.position.copy(v3(at(...cell, 0.78))); scene.add(spr);
  }

  // ---------------------------------------------------------------- the loop, drawn as the robot drives it
  // straight legs between waypoints, as in the film (and as FollowWaypoints drives it)
  const curve = new THREE.CurvePath();
  const pts = ROUTE.map(cell => v3(at(...cell, 0.08)));
  for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.022, 8, false), new THREE.MeshStandardMaterial({ color: 0xffd2a8, emissive: 0xffb47c, emissiveIntensity: 1.4 }));
  scene.add(tube);
  const tubeIdx = tube.geometry.index.count;

  // ---------------------------------------------------------------- BATLY
  const bot = new THREE.Group(); scene.add(bot);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, ...o });
  const cyl = (r, h, m, y, parent = bot) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), m); x.position.y = y; x.castShadow = true; parent.add(x); return x; };
  cyl(0.26, 0.16, mat(0x161a1f), 0.08);
  cyl(0.265, 0.03, mat(0xec9a5a, { metalness: 0.9, roughness: 0.3 }), 0.12);
  cyl(0.22, 0.02, mat(0xc0c7cf, { metalness: 0.8, roughness: 0.25 }), 0.19);
  cyl(0.09, 0.08, mat(0x1d2126), 0.24);
  const head = new THREE.Group(); head.position.y = 0.28; bot.add(head);
  cyl(0.07, 0.04, mat(0x2a0d08, { emissive: 0xff2a14, emissiveIntensity: 1.2 }), 0, head);
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xff3b24 });
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3, ray = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.008, 0.008), rayMat);
    ray.position.set(0.8 * Math.cos(a), 0, -0.8 * Math.sin(a)); ray.rotation.y = a; head.add(ray);
  }

  // ---------------------------------------------------------------- camera: nav.py's keys, eased between
  const ease = t => t * t * (3 - 2 * t);
  const camPos = new THREE.Vector3(), camAim = new THREE.Vector3(), off = new THREE.Vector3();
  function cameraAt(frame) {
    let i = 0;
    while (i < CAM.length - 2 && frame > CAM[i + 1][0]) i++;
    const [f0, p0, a0] = CAM[i], [f1, p1, a1] = CAM[i + 1];
    const t = ease(Math.min(1, Math.max(0, (frame - f0) / (f1 - f0))));
    camPos.lerpVectors(v3(p0), v3(p1), t); camAim.lerpVectors(v3(a0), v3(a1), t);
  }

  // ---------------------------------------------------------------- size, keeping the film's lens shift
  function fit() {
    const W = canvas.clientWidth, Hh = canvas.clientHeight;
    if (!W || !Hh) return;
    renderer.setSize(W, Hh, false);
    const aspect = W / Hh, hfov = 2 * Math.atan(18 / LENS);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    camera.setViewOffset(W, Hh, SHIFT_X * Math.max(W, Hh), 0, W, Hh);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(fit); ro.observe(canvas);

  // ---------------------------------------------------------------- drag to orbit; it eases back home on release
  let yaw = 0, drag = null, p = 0, raf = 0, visible = false, last = performance.now(), spin = 0;
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => { if (drag) yaw = Math.max(-1.2, Math.min(1.2, drag.yaw + (e.clientX - drag.x) / 260)); });
  const up = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vis = canvas.closest('.st-vis');
  function render(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const frame = 1 + p * 95, u = Math.min(1, Math.max(0, (frame - 30) / 60));
    placeTiles(frame);
    tube.geometry.setDrawRange(0, Math.floor(u * tubeIdx / 6) * 6);
    bot.position.copy(curve.getPointAt(u)).setY(0);
    const tan = curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
    bot.rotation.y = Math.atan2(-tan.z, tan.x);
    if (!reduced) spin += dt * 2.2;                                    // the LiDAR keeps turning between scrolls
    head.rotation.y = (frame / 96) * Math.PI * 12 + spin;
    cameraAt(frame);
    if (!drag) yaw -= yaw * Math.min(1, dt * 1.6);
    off.copy(camPos).sub(camAim).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    camera.position.copy(camAim).add(off); camera.lookAt(camAim);
    renderer.render(scene, camera);
  }
  const step = now => {
    raf = 0;
    if (!visible) return;
    raf = requestAnimationFrame(step);
    if (vis && vis.style.visibility === 'hidden') return;              // GSAP autoAlpha: chapter not on screen
    render(now);
  };
  const io = new IntersectionObserver(es => {
    visible = es[es.length - 1].isIntersecting;
    if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  });
  io.observe(canvas);
  fit();

  return {
    set(v) { p = Math.max(0, Math.min(1, v)); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      scene.traverse(o => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
      env.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}

function letter(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffb47c'; g.shadowColor = '#ec9a5a'; g.shadowBlur = 18;
  g.font = '700 84px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
