// MIONEX hero model: a designed procedural prosthetic arm. Proportions come from the img2threejs
// reconstruction of the real arm (arm-height units; X runs fingers -X to brim +X, Y up, +Z is the
// palmar side where the thumb lies). Finishes and the extra hardware (rotator, LED ring, BOA-style
// dial, hex vents, electrodes, light pipe) are design additions, not measurements.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const X0 = 0, X1 = 1.86, NOTCH = 0.42, WALL = 0.032, SE = 2.6;
const se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 2 / SE);
const ry = (t) => 0.24 + 0.235 * (1 - Math.pow(1 - t, 1.7)) + 0.018 * Math.exp(-(((t - 0.06) / 0.05) ** 2));
const rz = (t) => 0.86 * ry(t) - 0.01;
const yc = (t) => -0.06 + 0.035 * t;
const xEnd = (th) => X1 - NOTCH * Math.pow(Math.abs(Math.sin(th)), 1.4);
const shellPoint = (x, th, off) => {
  const t = Math.min(1, Math.max(0, (x - X0) / (X1 - X0)));
  return new THREE.Vector3(x, yc(t) + (ry(t) + off) * se(Math.cos(th)), (rz(t) + off) * se(Math.sin(th)));
};
const UP = new THREE.Vector3(0, 1, 0);

function mats() {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    shell: P({ color: 0xf4f2ee, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.14 }),
    liner: P({ color: 0x3b4048, roughness: 0.9, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0x8a929c }),
    satin: P({ color: 0xe6e3dc, roughness: 0.5, clearcoat: 0.3 }),
    petg: P({ color: 0xf1f6f4, roughness: 0.34, transmission: 0.6, thickness: 0.3, ior: 1.5, attenuationColor: 0xd3e4de, attenuationDistance: 0.8, clearcoat: 0.5, clearcoatRoughness: 0.18 }),
    print: P({ color: 0xf3f6f5, roughness: 0.46, transmission: 0.38, thickness: 0.4, ior: 1.5, attenuationColor: 0xe6eeeb, attenuationDistance: 1.2, sheen: 0.4, sheenRoughness: 0.6, sheenColor: 0xffffff, clearcoat: 0.25, clearcoatRoughness: 0.35 }),
    graphite: P({ color: 0x272b31, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.28 }),
    link: P({ color: 0x18191c, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    rubber: P({ color: 0x1d1f22, roughness: 0.93 }),
    alu: P({ color: 0xc8ccd2, metalness: 1, roughness: 0.28, anisotropy: 0.7 }),
    steel: P({ color: 0xdadde1, metalness: 1, roughness: 0.2 }),
    // the site's accent orange (--copper #ec9a5a) as anodized aluminium; a little emission keeps it
    // saturated on the shadow side
    accent: P({ color: 0xec9a5a, metalness: 0.35, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: 0xec9a5a, emissiveIntensity: 0.12 }),
    inlay: P({ color: 0xec9a5a, metalness: 0.2, roughness: 0.35, emissive: 0xec9a5a, emissiveIntensity: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7 }),
    pcb: P({ color: 0x1b6a3b, roughness: 0.42, clearcoat: 0.7 }),
    chassis: P({ color: 0x2f343b, roughness: 0.55 }),
    led: new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: 0xffa25c, emissiveIntensity: 2.2 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x062a12, emissive: 0x6dffa8, emissiveIntensity: 1.6 }),
  };
}

// One closed surface: outer skin -> rounded brim lip -> inner liner -> rounded wrist lip.
function socketGeometry() {
  const NT = 168, NU = 90, LK = 8, rows = [], kinds = [];
  const along = (u, th) => X0 + (1 - Math.pow(1 - u, 1.35)) * (xEnd(th) - X0);
  const outer = (u, th) => shellPoint(along(u, th), th, 0);
  const inner = (u, th) => shellPoint(along(u, th), th, -WALL);
  const lip = (a, b, tan, k) => {
    const mid = a.clone().add(b).multiplyScalar(0.5), half = a.clone().sub(b).multiplyScalar(0.5), h = half.length(), phi = (k / LK) * Math.PI;
    return mid.add(half.multiplyScalar(Math.cos(phi))).add(tan.clone().multiplyScalar(h * 0.9 * Math.sin(phi)));
  };
  const ths = [...Array(NT)].map((_, j) => (j / NT) * Math.PI * 2);
  for (let i = 0; i <= NU; i++) { rows.push(ths.map((th) => outer(i / NU, th))); kinds.push(0); }
  for (let k = 1; k < LK; k++) rows.push(ths.map((th) => lip(outer(1, th), inner(1, th), outer(1, th).sub(outer(0.985, th)).normalize(), k))), kinds.push(0);
  for (let i = NU; i >= 0; i--) { rows.push(ths.map((th) => inner(i / NU, th))); kinds.push(1); }
  for (let k = 1; k < LK; k++) rows.push(ths.map((th) => lip(inner(0, th), outer(0, th), new THREE.Vector3(-1, 0, 0), k))), kinds.push(0);
  const R = rows.length, pos = new Float32Array(R * NT * 3);
  rows.forEach((r, i) => r.forEach((p, j) => p.toArray(pos, (i * NT + j) * 3)));
  const idx = [], g = new THREE.BufferGeometry();
  let start = 0, cur = kinds[0];
  for (let i = 0; i < R; i++) {
    if (kinds[i] !== cur) { g.addGroup(start, idx.length - start, cur); start = idx.length; cur = kinds[i]; }
    const i2 = (i + 1) % R;
    for (let j = 0; j < NT; j++) {
      const j2 = (j + 1) % NT, a = i * NT + j, b = i * NT + j2, c = i2 * NT + j, d = i2 * NT + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  g.addGroup(start, idx.length - start, cur);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const loopTube = (fn, radius, mat, n = 160) => {
  const pts = [...Array(n)].map((_, j) => fn((j / n) * Math.PI * 2));
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), n * 2, radius, 8, true), mat);
};

function raisedPanel(th0, th1, x0, x1, height, mat) {
  const A = 40, B = 20, pos = [], idx = [];
  const sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= A; i++) for (let j = 0; j <= B; j++) {
    const a = i / A, b = j / B, bev = sm(0, 0.1, Math.min(a, 1 - a)) * sm(0, 0.18, Math.min(b, 1 - b));
    shellPoint(x0 + a * (x1 - x0), th0 + b * (th1 - th0), 0.001 + height * bev).toArray(pos, pos.length);
  }
  for (let i = 0; i < A; i++) for (let j = 0; j < B; j++) {
    const a = i * (B + 1) + j, b = a + 1, c = a + B + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function onSurface(x, th, off, obj) {
  const p = shellPoint(x, th, off), n = shellPoint(x, th, off + 0.05).sub(p).normalize();
  obj.position.copy(p); obj.quaternion.setFromUnitVectors(UP, n); return obj;
}

function hexScrew(M, r = 0.024) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, r * 0.5, 32), M.steel));
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.46, r * 0.46, r * 0.52, 6), M.dark); socket.position.y = 0.0015; g.add(socket);
  return g;
}

// Hex vent field on the dorsal face of the socket (instanced, follows the shell).
function hexField(M) {
  const tiles = [], geo = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 6); geo.rotateY(Math.PI / 6);
  for (let r = 0, x = 0.36; x < 1.12; r++, x += 0.052) {
    const t = (x - X0) / (X1 - X0), rad = (ry(t) + rz(t)) / 2, dth = 0.06 / rad;
    for (let c = -4; c <= 4; c++) {
      const th = 1.5 * Math.PI + (c + (r % 2) * 0.5) * dth;
      const edge = Math.min((x - 0.36) / 0.12, (1.12 - x) / 0.12, (4.6 - Math.abs(c + (r % 2) * 0.5)) / 1.4);
      if (edge <= 0.15) continue;
      tiles.push({ x, th, s: Math.min(1, edge) });
    }
  }
  const mesh = new THREE.InstancedMesh(geo, M.graphite, tiles.length), o = new THREE.Object3D();
  tiles.forEach(({ x, th, s }, i) => { onSurface(x, th, 0.001, o); o.scale.setScalar(s); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  return mesh;
}

// Block-sans MIONEX glyphs as polygons in (advance, up) units, height H.
const H = 0.07, ST = 0.014;
const GLYPHS = {
  M: (w) => [[0,0],[ST,0],[ST,H-0.03],[w/2,H*0.38],[w-ST,H-0.03],[w-ST,0],[w,0],[w,H],[w-ST,H],[w/2,H*0.62],[ST,H],[0,H]],
  I: (w) => [[0,0],[w,0],[w,H],[0,H]],
  N: (w) => [[0,0],[ST,0],[ST,H-0.032],[w-ST,0],[w,0],[w,H],[w-ST,H],[w-ST,0.032],[ST,H],[0,H]],
  E: (w) => [[0,0],[w,0],[w,ST],[ST,ST],[ST,H/2-ST/2],[w*0.85,H/2-ST/2],[w*0.85,H/2+ST/2],[ST,H/2+ST/2],[ST,H-ST],[w,H-ST],[w,H],[0,H]],
  X: (w) => [[0,0],[ST*1.25,0],[w/2,H/2-ST*0.8],[w-ST*1.25,0],[w,0],[w/2+ST*0.8,H/2],[w,H],[w-ST*1.25,H],[w/2,H/2+ST*0.8],[ST*1.25,H],[0,H],[w/2-ST*0.8,H/2]],
};
const ellipse = (cx, cy, a, b, n = 32) => [...Array(n)].map((_, k) => [cx + a * Math.cos((k / n) * Math.PI * 2), cy + b * Math.sin((k / n) * Math.PI * 2)]);

// Plate-local frame: +X toward the wrist, +Y up, -Z out of the dorsal cover. Text advances along -X so it
// reads left-to-right when the dorsal side faces the viewer.
function logoPlate(M) {
  const plate = new THREE.Group();
  const toPlate = (x0) => ([a, b]) => new THREE.Vector2(x0 - a, b - H / 2);
  const holes = [], islands = [];
  const MARK_X = 0.31, WORD_X = 0.165;
  holes.push([[0, 0], [0.1, 0], [0, 0.06]].map(toPlate(MARK_X)), [[0.12, 0.07], [0.02, 0.07], [0.12, 0.01]].map(toPlate(MARK_X)));
  let u = 0;
  for (const [ch, w] of [['M', 0.062], ['I', 0.014], ['O', 0.06], ['N', 0.056], ['E', 0.048], ['X', 0.056]]) {
    const at = toPlate(WORD_X - u);
    if (ch === 'O') { holes.push(ellipse(w / 2, H / 2, w / 2, H / 2).map(at)); islands.push(ellipse(w / 2, H / 2, w / 2 - ST, H / 2 - ST).map(at)); }
    else holes.push(GLYPHS[ch](w).map(at));
    u += w + 0.02;
  }
  const L = -0.27, R = 0.345, T = 0.068, rr = 0.03, s = new THREE.Shape();
  s.moveTo(L + rr, -T); s.lineTo(R - rr, -T); s.quadraticCurveTo(R, -T, R, -T + rr); s.lineTo(R, T - rr); s.quadraticCurveTo(R, T, R - rr, T);
  s.lineTo(L + rr, T); s.quadraticCurveTo(L, T, L, T - rr); s.lineTo(L, -T + rr); s.quadraticCurveTo(L, -T, L + rr, -T);
  s.holes = holes.map((h) => new THREE.Path(h));
  const skinG = new THREE.ExtrudeGeometry(s, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0014, bevelSegments: 2, curveSegments: 8 });
  skinG.translate(0, 0, -0.0098);
  plate.add(new THREE.Mesh(skinG, M.graphite));
  for (const isl of islands) {
    const ig = new THREE.ExtrudeGeometry(new THREE.Shape(isl), { depth: 0.0088, bevelEnabled: false }); ig.translate(0, 0, -0.0098);
    plate.add(new THREE.Mesh(ig, M.graphite));
  }
  // inlays seen through the cuts: accent orange under the word, green PCB with LEDs under the mark
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.004), M.inlay); inlay.position.set(-0.04, 0, 0.001); plate.add(inlay);
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.004), M.pcb); pcb.position.set(0.25, 0, 0.001); plate.add(pcb);
  const leds = [];
  for (const [x, y] of [[0.275, -0.012], [0.235, 0.016]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.003), M.led); l.position.set(x, y, -0.0012); plate.add(l); leds.push(l);
  }
  return { plate, leds };
}

function capsuleLink(L, r, mat, flatZ = 0.88) {
  const geo = new THREE.CapsuleGeometry(r, L - 2 * r, 8, 24); geo.rotateZ(Math.PI / 2); geo.translate(-L / 2, 0, 0); geo.scale(1, 1, flatZ);
  return new THREE.Mesh(geo, mat);
}

function finger(M, len, w) {
  const segs = [0.4, 0.33, 0.27].map((f) => f * len), pivots = [];
  let parent = new THREE.Group(); const root = parent;
  segs.forEach((L, k) => {
    const pivot = new THREE.Group(); if (k > 0) pivot.position.x = -segs[k - 1]; parent.add(pivot); pivots.push(pivot);
    const ww = w * (1 - k * 0.05);
    // joint barrel + pin heads at every pivot
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(ww * 0.42, ww * 0.42, ww * 0.94, 28), M.graphite); pivot.add(barrel);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, ww * 1.06, 20), M.steel); pivot.add(pin);
    if (k < 2) {
      const g = new RoundedBoxGeometry(L - 0.02, ww * 0.9, ww * 0.78, 4, 0.03); g.translate(-L / 2, 0, 0);
      pivot.add(new THREE.Mesh(g, M.link));
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, L * 0.6, 4, 10), M.alu); bar.rotation.z = Math.PI / 2;
      bar.position.set(-L * 0.5, 0, -ww * 0.39 - 0.006); pivot.add(bar);
    } else {
      pivot.add(capsuleLink(L, ww * 0.47, M.petg, 0.86));
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(ww * 0.22, L * 0.3, 6, 16), M.rubber); pad.rotation.z = Math.PI / 2; pad.scale.set(1, 1, 0.32); pad.position.set(-L * 0.55, 0, ww * 0.39); pivot.add(pad);
    }
    parent = pivot;
  });
  return { root, pivots };
}

// Crosshatch infill seen through the thin wall of the real PETG prints, as a tiling bump texture.
function infillTexture(rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#b4b4b4'; g.lineWidth = 2.2;
  for (let k = -128; k <= 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  return t;
}

// One thumb bone as an organic tapered capsule along local -X, pivot at the origin. Both ends are rounded
// about the joint centres, so neighbouring bones overlap like knuckles at any flexion angle. Local +Z is
// the thumb's palmar side (it flexes that way) and carries a slightly fuller pad.
function thumbBone(L, w0, w1, hRatio, tipCap, mat) {
  const c0 = w0 * 0.95, c1 = w1 * tipCap, total = c0 + L + c1, NA = 72, NR = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NA; i++) {
    const s = -c0 + (i / NA) * total, k = Math.min(1, Math.max(0, s / L));
    let w = (w0 + (w1 - w0) * k) * (1 - 0.07 * Math.sin(Math.PI * k));
    if (s < 0) w *= Math.sqrt(Math.max(0, 1 - (s / c0) ** 2));
    if (s > L) w *= Math.sqrt(Math.max(0, 1 - ((s - L) / c1) ** 2));
    const h = w * hRatio;
    for (let j = 0; j <= NR; j++) {
      const ph = (j / NR) * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph);
      const ex = Math.sign(cs) * Math.pow(Math.abs(cs), 0.9), ey = Math.sign(sn) * Math.pow(Math.abs(sn), sn > 0 ? 0.8 : 0.95);
      pos.push(-s, -w * ex, h * ey); uv.push(i / NA, j / NR);
    }
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + 1, c = a + NR + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// Thumb: thenar mound on the proximal index-side of the palm, then metacarpal -> proximal -> distal bones.
// At rest it stands out of the palm (abducted ~30 deg, lifted ~35 deg) with soft MCP/IP flexion; the grip
// pose flexes and opposes it toward the index and middle fingers.
function articulatedThumb(M, mat) {
  const root = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  // mound long axis runs along the thumb's in-plane direction so the thenar flows into the metacarpal
  const MC = new THREE.Vector3(0.26, 0.215, 0.14), MA = [0.22, 0.13, 0.075], MR = -0.52;
  mound.scale.set(...MA); mound.rotation.z = MR; mound.position.copy(MC); root.add(mound);
  for (const u of [0.48, 0.12]) {
    const w = Math.sqrt(1 - u * u), rz = new THREE.Matrix4().makeRotationZ(MR);
    const p = new THREE.Vector3(u * MA[0], 0, w * MA[2]).applyMatrix4(rz).add(MC);
    const n = new THREE.Vector3(u / MA[0], 0, w / MA[2]).applyMatrix4(rz).normalize();
    const sc = hexScrew(M, 0.015); sc.position.copy(p); sc.quaternion.setFromUnitVectors(UP, n); root.add(sc);
  }
  const d0 = new THREE.Vector3(-Math.cos(0.52) * Math.cos(0.61), Math.sin(0.52) * Math.cos(0.61), Math.sin(0.61));
  const xB = d0.clone().negate();
  const v = new THREE.Vector3(-0.3, -0.9, -0.3), zB = v.clone().addScaledVector(d0, -v.dot(d0)).normalize();
  const yB = new THREE.Vector3().crossVectors(zB, xB);
  const base = new THREE.Group(); base.position.set(0.17, 0.265, 0.13); base.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xB, yB, zB)); root.add(base);
  const cmc = new THREE.Group(); base.add(cmc);
  const LEN = [0.3, 0.25, 0.21];
  cmc.add(thumbBone(LEN[0], 0.1, 0.088, 0.84, 1.0, mat));
  const mcp = new THREE.Group(); mcp.position.x = -LEN[0]; cmc.add(mcp);
  mcp.add(thumbBone(LEN[1], 0.088, 0.08, 0.84, 1.0, mat));
  const ip = new THREE.Group(); ip.position.x = -LEN[1]; mcp.add(ip);
  ip.add(thumbBone(LEN[2], 0.08, 0.072, 0.86, 1.25, mat));
  const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.07, 6, 16), M.rubber); pad.rotation.z = Math.PI / 2; pad.scale.set(1, 1, 0.3);
  pad.position.set(-LEN[2] * 0.62, 0, 0.058); ip.add(pad);
  return {
    root,
    pose(curl) {
      cmc.rotation.y = 0.05 + curl * 0.32;
      mcp.rotation.y = 0.32 + curl * 0.5;
      ip.rotation.y = 0.28 + curl * 0.55;
    },
  };
}

export function createMionexArm() {
  const M = mats(), arm = new THREE.Group(); arm.name = 'MIONEX arm (designed)';

  // ---- socket: clearcoat shell, padded liner, orange trims, seam groove
  arm.add(new THREE.Mesh(socketGeometry(), [M.shell, M.liner]));
  arm.add(raisedPanel(0.2 * Math.PI, 0.45 * Math.PI, 0.16, 0.86, 0.018, M.satin));
  const pipe = new THREE.CatmullRomCurve3([0.3, 0.45, 0.6, 0.72].map((x) => shellPoint(x, 0.325 * Math.PI, 0.02)));
  const leds = [];
  const lightPipe = new THREE.Mesh(new THREE.TubeGeometry(pipe, 40, 0.006, 8, false), M.led); arm.add(lightPipe);
  arm.add(loopTube((th) => shellPoint(1.0, th, 0.0004), 0.0042, M.graphite));
  arm.add(loopTube((th) => shellPoint(0.045, th, 0.004), 0.011, M.accent));
  arm.add(loopTube((th) => shellPoint(X0 + 0.95 * (xEnd(th) - X0), th, 0.0025), 0.0055, M.accent, 240));
  arm.add(hexField(M));
  for (const [x, th] of [[0.22, 0.265 * Math.PI], [0.22, 0.385 * Math.PI], [0.8, 0.265 * Math.PI], [0.8, 0.385 * Math.PI]]) arm.add(onSurface(x, th, 0.0195, hexScrew(M, 0.02)));
  // BOA-style fit dial on the lateral face near the brim
  const dial = new THREE.Group();
  const dg = new THREE.CylinderGeometry(0.075, 0.082, 0.045, 96, 1), dp = dg.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), z = dp.getZ(i), r = Math.hypot(x, z);
    if (r > 0.06) { const k = 1 + 0.06 * Math.max(0, Math.cos(Math.atan2(z, x) * 30)); dp.setX(i, x * k); dp.setZ(i, z * k); }
  }
  dg.computeVertexNormals(); dial.add(new THREE.Mesh(dg, M.graphite));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 48), M.accent); dial.add(cap);
  const capMark = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.03), M.dark); capMark.position.set(0, 0.026, 0.012); dial.add(capMark);
  const dialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.105, 0.016, 64), M.satin); dialBase.position.y = -0.02; dial.add(dialBase);
  arm.add(onSurface(1.26, 0.64 * Math.PI, 0.024, dial));
  // EMG electrodes on the liner, visible through the brim
  for (const th of [0.38 * Math.PI, 0.62 * Math.PI, 1.38 * Math.PI, 1.62 * Math.PI]) {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 40), M.graphite));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.steel); dome.scale.y = 0.35; dome.rotation.x = Math.PI; dome.position.y = -0.004; e.add(dome);
    arm.add(onSurface(1.3, th, -WALL - 0.003, e));
  }

  // ---- wrist rotator (fixed to the socket), LED ring, then the rotating wrist
  const prof = [[0.17, 0], [0.205, 0], [0.232, 0.006], [0.24, 0.02], [0.24, 0.116], [0.232, 0.13], [0.205, 0.136], [0.17, 0.136]].map(([r, h]) => new THREE.Vector2(r, h));
  const rotG = new THREE.LatheGeometry(prof, 128); rotG.rotateZ(-Math.PI / 2);
  const rotator = new THREE.Mesh(rotG, M.alu); rotator.position.set(-0.148, -0.06, 0); rotator.scale.z = 0.84; arm.add(rotator);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.2415, 0.006, 12, 160), M.led); ledRing.rotation.y = Math.PI / 2; ledRing.position.set(-0.08, -0.06, 0); ledRing.scale.y = 0.84; arm.add(ledRing);
  for (const x of [-0.13, -0.03]) { const groove = new THREE.Mesh(new THREE.TorusGeometry(0.2405, 0.0025, 8, 160), M.graphite); groove.rotation.y = Math.PI / 2; groove.position.set(x, -0.06, 0); groove.scale.y = 0.84; arm.add(groove); }

  const wrist = new THREE.Group(); wrist.position.set(-0.15, -0.06, 0); arm.add(wrist);
  const rrect = (w, h, r) => { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s; };
  const flG = new THREE.ExtrudeGeometry(rrect(0.36, 0.64, 0.08), { depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 });
  flG.rotateY(Math.PI / 2);
  const flange = new THREE.Mesh(flG, M.petg); flange.position.set(-0.04, 0, 0); wrist.add(flange);
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const s = hexScrew(M, 0.017); s.rotation.z = Math.PI / 2; s.position.set(-0.052, sy * 0.25, sz * 0.12); wrist.add(s); }

  // ---- palm: frosted PETG housing with the chassis and controller board visible inside
  const palm = new THREE.Group(); palm.position.set(-0.49, -0.005, 0); wrist.add(palm);
  const palmMat = M.print.clone(); palmMat.bumpMap = infillTexture(5, 4); palmMat.bumpScale = 0.4;
  palm.add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.7, 0.3, 6, 0.075), palmMat));
  const ch = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.56, 0.15, 3, 0.03), M.chassis); ch.position.z = -0.02; palm.add(ch);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.012), M.pcb); board.position.set(0.04, 0, 0.065); palm.add(board);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.012), M.dark); chip.position.set(0.1, 0.05, 0.075); palm.add(chip);
  for (let k = 0; k < 5; k++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.01), k % 2 ? M.led : M.ledGreen); l.position.set(-0.14 + k * 0.07, -0.13, 0.074); palm.add(l); leds.push(l);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const s = hexScrew(M); s.position.set(sx * 0.37, sy * 0.27, 0.151); s.rotation.x = Math.PI / 2; palm.add(s); }

  // dorsal cover: thick at the knuckles, thin at the wrist (the CAD chassis slope), graphite
  const SLOPE = 0.06 / 0.84, zTop = (x) => -0.168 - (0.03 + 0.06 * (0.42 - x) / 0.84);
  const cs = new THREE.Shape(); cs.moveTo(-0.42, 0); cs.lineTo(0.42, 0); cs.lineTo(0.42, 0.03); cs.lineTo(-0.42, 0.09); cs.closePath();
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 5, curveSegments: 4 });
  cg.rotateX(-Math.PI / 2); cg.translate(0, -0.3, -0.15);
  palm.add(new THREE.Mesh(cg, M.graphite));
  const normal = new THREE.Vector3(SLOPE, 0, -1).normalize();
  for (const x of [-0.36, 0.36]) for (const y of [-0.24, 0.24]) {
    const s = hexScrew(M, 0.02); s.position.set(x, y, zTop(x) + 0.004); s.quaternion.setFromUnitVectors(UP, normal); palm.add(s);
  }
  const { plate, leds: logoLeds } = logoPlate(M); leds.push(...logoLeds);
  // The hero rolls the arm about its long axis, so the dorsal side arrives fingers-left with Y flipped:
  // turning the plate half a turn in its own plane makes it read left-to-right there.
  plate.rotation.set(0, -Math.atan(SLOPE), Math.PI); plate.position.set(0.0, 0, zTop(0.0) - 0.0005); palm.add(plate);

  // ---- fingers (index..little): length and splay vary like a hand, not a comb
  const fingers = [];
  [[0.218, 1.0, 0.122, 0.04], [0.073, 1.07, 0.126, 0.012], [-0.073, 1.0, 0.122, -0.015], [-0.215, 0.86, 0.112, -0.045]].forEach(([y, s, r, splay]) => {
    const f = finger(M, 0.74 * s, r); f.root.position.set(-0.45, y, 0); f.root.rotation.z = splay; palm.add(f.root); fingers.push(f);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, r * 0.98, 32), M.alu); knuckle.position.set(-0.45, y, 0); palm.add(knuckle);
  });

  // ---- thumb: frosted print like the real one, but jointed so it rests in a natural curl and closes
  // with the grip
  const thumbMat = M.print.clone(); thumbMat.bumpMap = infillTexture(4, 3); thumbMat.bumpScale = 0.4;
  const thumb = articulatedThumb(M, thumbMat); palm.add(thumb.root); thumb.pose(0);

  // ---- cable from the light-pipe panel into the rotator, with an orange ferrule
  const cable = new THREE.CatmullRomCurve3([shellPoint(0.19, 0.325 * Math.PI, 0.03), shellPoint(0.1, 0.325 * Math.PI, 0.04), shellPoint(0.02, 0.33 * Math.PI, 0.03), new THREE.Vector3(-0.02, -0.06 + 0.23 * se(Math.cos(0.33 * Math.PI)), 0.2 * se(Math.sin(0.33 * Math.PI)))]);
  arm.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 48, 0.012, 12, false), M.graphite));
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 20), M.accent);
  ferrule.position.copy(cable.getPoint(0.12)); ferrule.quaternion.setFromUnitVectors(UP, cable.getTangent(0.12)); arm.add(ferrule);

  arm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group: arm,
    setPose(curl, twist) {
      fingers.forEach((f, i) => f.pivots.forEach((p, k) => { p.rotation.y = curl * [0.95, 0.85, 0.7][k] * (1 - i * 0.03); }));
      thumb.pose(curl);
      wrist.rotation.x = twist;
    },
    update(t) {
      M.led.emissiveIntensity = 1.6 + Math.sin(t * 2.2) * 0.8;
      leds.forEach((l, k) => { l.visible = Math.sin(t * 3 + k * 1.3) > -0.5; });
    },
  };
}
