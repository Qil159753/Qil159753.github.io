// robot3d: the real ABU Robocon 2026 handheld controller board, from Q's EasyEDA 3D export.
// Orbit it, explode it, click a part for what the firmware does with it, and press the buttons
// (keyboard or click) to watch Controller_v7's drive frame and debug line change live.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadPCB, boardOutline } from './pcb.js';
import { driveFrame, hopFrame, channelMHz, FIELDS, LATCHING, PHASES, hex } from './proto.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// What each part is, from the board and Controller_v7.ino.
const PARTS = {
  board: { t: 'Controller PCB', k: 'board', d: { th: 'บอร์ดรีโมตที่คิวออกแบบใน EasyEDA ขนาด 172.7 × 84.7 มม. โมเดลนี้มาจากไฟล์ส่งออก 3 มิติจริงของบอร์ด ลากเพื่อหมุน คลิกชิ้นส่วนเพื่อดูว่าเฟิร์มแวร์ใช้มันทำอะไร', en: 'The controller board Q laid out in EasyEDA, 172.7 × 84.7 mm. This model is the real 3D export of that board. Drag to orbit, click a part to see what the firmware does with it.' } },
  xbee: { t: 'XBee Series 2', k: 'radio', d: { th: 'วิทยุ 2.4 GHz ต่อกับ Serial1 ที่ 115200 ในโหมด API ทุกคำสั่งขับห่อเป็นเฟรม 25 ไบต์ ส่งไปที่ที่อยู่ 64 บิตของหุ่น', en: "The 2.4 GHz radio on Serial1 at 115200 in API mode. Every drive frame is wrapped in a 25-byte API frame addressed to the robot's 64-bit address." } },
  tog_l: { t: 'TOG_L · expo', pin: 'A6', k: 'toggle', d: { th: 'เปิด = จอยใช้กราฟ expo ปลายนุ่ม คุมช้า ๆ ได้ละเอียด', en: 'Up: the sticks use an expo curve, soft near centre for fine control.' } },
  tog_r: { t: 'TOG_R · safety', pin: 'A7', k: 'toggle', d: { th: 'อ่านได้ LOW = โหมดปลอดภัย ทุกแกนและปุ่มในเฟรมเป็นศูนย์ หุ่นหยุด', en: 'Reads LOW: safety. Every axis and button in the frame goes to zero and the robot stops.' } },
  l1: { t: 'L1 · channel hop', pin: 'A4', k: 'button', d: { th: 'หาช่องที่ว่างถัดไป ส่งเฟรม HOP (0xFE) ให้หุ่นสามครั้ง แล้วเปลี่ยนช่อง XBee ตาม', en: 'Finds the next clean channel, sends the robot a HOP frame (0xFE) three times, then retunes the XBee.' } },
  r1: { t: 'R1 · speed mode', pin: 'A5', k: 'button', d: { th: 'สลับความเร็ว FULL (100%) กับ MED (30%)', en: 'Switches speed between FULL (100%) and MED (30%).' } },
  up: { t: '↑ UP', pin: '3', k: 'button', bit: 'BTN bit 2 · held', d: { th: 'กดค้างไว้ บิตจะติดตลอดที่กด', en: 'Held: the bit is set while pressed.' } },
  down: { t: '↓ DOWN · ARM', pin: '4', k: 'button', bit: 'BTN bit 3 · latching', d: { th: 'กดหนึ่งครั้งสลับกลไกแขน (ARM)', en: 'One press toggles the ARM mechanism.' } },
  left: { t: '← LEFT · HAND', pin: '2', k: 'button', bit: 'BTN bit 4 · latching', d: { th: 'กดหนึ่งครั้งสลับกลไกมือ (HAND)', en: 'One press toggles the HAND mechanism.' } },
  right: { t: '→ RIGHT · WRIST', pin: '5', k: 'button', bit: 'BTN bit 5 · latching', d: { th: 'กดหนึ่งครั้งสลับข้อมือ (WRIST)', en: 'One press toggles the WRIST.' } },
  tri: { t: '△ TRI · GRIP', pin: '7', k: 'button', bit: 'BTN bit 1 · latching', d: { th: 'กดหนึ่งครั้งสลับตัวจับ (GRIP)', en: 'One press toggles the GRIP.' } },
  sq: { t: '□ SQ · STR', pin: '6', k: 'button', bit: 'BTN bit 6 · latching', d: { th: 'กดหนึ่งครั้งสลับ STR', en: 'One press toggles STR.' } },
  cir: { t: '○ CIR', pin: '8', k: 'button', bit: 'BTN bit 0 · held', d: { th: 'กดค้างไว้ บิตจะติดตลอดที่กด', en: 'Held: the bit is set while pressed.' } },
  cross: { t: '✕ CROSS', pin: '9', k: 'button', bit: 'AUX bit 0 · held', d: { th: 'กดค้างไว้ ตั้งบิต 0 ของไบต์ AUX', en: 'Held: sets bit 0 of the AUX byte.' } },
  reset: { t: 'MODE', pin: '22 (A8)', k: 'button', d: { th: 'วนช่วงเกม MARTIAL ×1.00 → FOREST ×0.80 → ARENA ×0.60 ซึ่งจำกัดความเร็วสูงสุด (เฉพาะตอนไม่อยู่โหมดปลอดภัย)', en: 'Cycles the game phase MARTIAL ×1.00 → FOREST ×0.80 → ARENA ×0.60, which caps top speed (only when safety is off).' } },
  reg: { t: 'Voltage regulator', k: 'power', d: { th: 'ตัวควบคุมแรงดันแบบ SOIC-8 จ่ายไฟให้บอร์ดจากแบตเตอรี่', en: 'The SOIC-8 regulator that powers the board from the battery.' } },
  jst: { t: 'JST connector', k: 'connector', d: { th: 'คอนเนกเตอร์ JST บนบอร์ด', en: "The board's JST connector." } },
  passives: { t: 'SMD passives', k: 'passive', d: { th: 'ตัวต้านทานและตัวเก็บประจุขนาด 0603 รอบวงจรไฟ', en: '0603 resistors and capacitors around the power section.' } },
  teensy: { t: 'Teensy 4.0', k: 'mcu · not in the CAD', d: { th: 'i.MX RT1062 @ 600 MHz เสียบบนก้างปลา จึงไม่อยู่ในไฟล์ CAD เส้นประนี้เป็นตำแหน่งโดยประมาณ อ่านอินพุต 15 ตัว และแกนอนาล็อก 4 แกนจากจอยที่ต่อสายออกไปนอกบอร์ด', en: "i.MX RT1062 @ 600 MHz. It plugs into headers, so it isn't in the CAD export: the dashed outline is an approximate stand-in. It reads 15 inputs and 4 analog axes from the off-board sticks." } },
};
const BUTTONS = ['l1', 'r1', 'up', 'down', 'left', 'right', 'tri', 'sq', 'cir', 'cross', 'reset'];
const LIFT = { board: 0, xbee: 36, tog_l: 26, tog_r: 26, reg: 12, passives: 8, jst: 18, reset: 16 };   // explode, mm
const CAP_Y = 6.5, BAT_Y = 12.5;   // mm: tact cap above, toggle bat above

export async function mount(body, ctx) {
  const th = () => ctx.lang() === 'th';
  const wrap = el('div', 'q-app');
  wrap.tabIndex = 0;
  wrap.style.cssText = 'outline: none; background: radial-gradient(90% 80% at 50% 40%, #121820 0%, #07090c 70%)';
  const canvas = el('canvas', 'q-gl');
  wrap.append(canvas);
  body.append(wrap);

  const pcb = await loadPCB(THREE, new URL('../../qos/pcb.bin', import.meta.url).href, ctx.progress);

  // ---------------------------------------------------------------- scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 5, 3000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 90; controls.maxDistance = 650; controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.set(0, 6, 0);
  const HOME = new THREE.Vector3(-70, 190, 250), HOME_T = new THREE.Vector3(0, 6, 0);
  camera.position.set(0, 520, 40);

  const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
  key.position.set(-120, 260, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -130, right: 130, top: 90, bottom: -90, near: 50, far: 700 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xec9a5a, 2.2); rim.position.set(200, 80, -200); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x0a0806, 0.35));

  // bench mat: shadow catcher plus a faint copper grid
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -16; ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(600, 60, 0x3a2617, 0x1a1410);
  grid.position.y = -15.9; grid.material.transparent = true; grid.material.opacity = 0.55;
  scene.add(grid);

  // ---------------------------------------------------------------- parts
  const root = new THREE.Group();
  scene.add(root);
  const items = {};          // name -> { group, mats[], lift, cap?, bat?, edges?, ghost? }
  const pickables = [];

  // the EasyEDA export's triangle winding is inconsistent, so every part renders both sides
const mkMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide, ...opts });
  for (const part of pcb.parts) {
    const n = part.name, g = new THREE.Group();
    const it = { group: g, mats: [], lift: LIFT[n] ?? 14 };
    const add = (geo, mat, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true; m.userData.part = n;
      parent.add(m); it.mats.push(mat); pickables.push(m);
      return m;
    };
    if (n === 'board') {
      const geo = pcb.geometry(part);
      add(geo, new THREE.MeshPhysicalMaterial({ color: 0x0d1411, roughness: 0.62, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35, flatShading: true, side: THREE.DoubleSide }));
      it.edges = new THREE.LineSegments(boardOutline(THREE, geo), new THREE.LineBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.4 }));
      g.add(it.edges);
    } else if (BUTTONS.includes(n)) {
      add(pcb.geometry(part, -Infinity, CAP_Y), mkMat());
      it.cap = add(pcb.geometry(part, CAP_Y), mkMat({ roughness: 0.38 }));
    } else if (n === 'tog_l' || n === 'tog_r') {
      add(pcb.geometry(part, -Infinity, BAT_Y), mkMat());
      const geo = pcb.geometry(part, BAT_Y);
      geo.setAttribute('position', geo.attributes.position.clone());   // own copy: the body shares the source array
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -BAT_Y, -c.z);               // pivot at the top of the switch body
      const bat = new THREE.Group();
      bat.position.set(c.x, BAT_Y, c.z); g.add(bat);
      add(geo, mkMat({ metalness: 0.6, roughness: 0.3 }), bat);
      it.bat = bat;
    } else {
      add(pcb.geometry(part), mkMat(n === 'xbee' ? { roughness: 0.42 } : {}));
    }
    root.add(g);
    items[n] = it;
  }

  // Teensy 4.0 stand-in under the board: dashed outline, two header rows, USB stub
  {
    const g = new THREE.Group();
    const mat = new THREE.LineDashedMaterial({ color: 0xffb47c, dashSize: 1.6, gapSize: 1.1 });
    const outline = (w, h, d, x = 0, y = 0) => {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), mat);
      l.computeLineDistances(); l.position.set(x, y, 0); g.add(l);
    };
    outline(35.56, 1.6, 17.78);
    outline(5, 2.6, 7.6, -17.78 + 1.6, 2.1);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xffc58f, metalness: 0.9, roughness: 0.25, emissive: 0x6b3510, emissiveIntensity: 0.6 });
    const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 8, 6), pinMat, 28), m4 = new THREE.Matrix4();
    for (let i = 0; i < 14; i++) for (let r = 0; r < 2; r++) pins.setMatrixAt(i * 2 + r, m4.makeTranslation(-16.51 + i * 2.54, 4.6, r ? 7.62 : -7.62));
    g.add(pins);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(36, 10, 18), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 3; hit.userData.part = 'teensy'; g.add(hit); pickables.push(hit);
    g.position.set(-8, -9, 4);
    root.add(g);
    items.teensy = { group: g, mats: [], lift: -28, ghost: mat, pinMat, base: g.position.y };
  }

  // ---------------------------------------------------------------- HUD
  const hud = el('div', 'q-hud'); hud.style.inset = '0';
  const head = el('div', 'q-panel'); Object.assign(head.style, { position: 'absolute', left: '12px', top: '12px', maxWidth: '330px' });
  const h1 = el('div'); h1.style.cssText = 'font: 600 15px var(--q-disp); color: var(--q-ink); letter-spacing: .02em';
  h1.textContent = 'ABU Robocon 2026 · controller board';
  const h2 = el('div'); h2.style.cssText = 'color: var(--q-muted); font-size: 11px; margin-top: 2px';
  h2.textContent = `EasyEDA 3D export · ${Math.round(pcb.tris / 1000)}k triangles · 172.7 × 84.7 mm`;
  head.append(h1, h2);

  const tools = el('div'); Object.assign(tools.style, { position: 'absolute', right: '12px', top: '12px', display: 'grid', gap: '8px', justifyItems: 'end' });
  const exRow = el('label', 'q-range q-panel'); exRow.style.width = '250px';
  const exK = el('span', 'q-k'); exK.textContent = 'explode';
  const ex = el('input'); Object.assign(ex, { type: 'range', min: 0, max: 1, step: 0.01, value: 0 });
  const exO = el('output'); exO.textContent = '0%';
  exRow.append(exK, ex, exO);
  const chips = el('div'); chips.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end';
  const chip = (label, fn, toggle = true) => {
    const b = el('button', 'q-chip'); b.type = 'button'; b.textContent = label;
    if (toggle) b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const v = b.getAttribute('aria-pressed') !== 'true';
      if (toggle) b.setAttribute('aria-pressed', String(v));
      fn(v); ctx.sfx.click();
    });
    chips.append(b); return b;
  };
  let xray = false;
  chip('x-ray', v => { xray = v; applyXray(); });
  chip('auto-rotate', v => { controls.autoRotate = v; controls.autoRotateSpeed = 0.8; });
  chip('reset view', () => { flyTo(HOME, HOME_T); select(null); }, false);
  tools.append(exRow, chips);

  const info = el('div', 'q-panel'); Object.assign(info.style, { position: 'absolute', left: '12px', bottom: '96px', width: 'min(360px, calc(100% - 24px))' });
  const infoK = el('div', 'q-k'), infoT = el('div'), infoP = el('div'), infoD = el('div');
  infoT.style.cssText = 'font: 600 16px var(--q-disp); color: var(--q-cu-hi); margin: 2px 0 4px';
  infoP.style.cssText = 'font-size: 11.5px; color: var(--q-ink); margin-bottom: 6px';
  infoD.style.cssText = 'font-size: 12.5px; line-height: 1.55; color: var(--q-text)';
  info.append(infoK, infoT, infoP, infoD);

  const keysP = el('div', 'q-panel'); Object.assign(keysP.style, { position: 'absolute', right: '12px', bottom: '96px', fontSize: '11px', lineHeight: '1.75', color: 'var(--q-muted)' });
  const legend = [['← ↑ ↓ →', 'D-pad'], ['z x c v', '✕ ○ □ △'], ['q / e', 'L1 hop / R1 speed'], ['m', 'MODE'], ['1 / 2', 'TOG_L / TOG_R'], ['w a s d', 'left stick'], ['j l · i k', 'turn · lead screw'], ['shift', 'SW_R creep']];
  for (const [k, v] of legend) { const d = el('div'); const kb = el('span'); kb.style.cssText = 'display:inline-block; min-width:76px; color: var(--q-cu-hi)'; kb.textContent = k; d.append(kb, v); keysP.append(d); }

  const bottom = el('div', 'q-panel'); Object.assign(bottom.style, { position: 'absolute', left: '12px', right: '12px', bottom: '12px', display: 'grid', gap: '6px' });
  const frameRow = el('div'); frameRow.style.cssText = 'display:flex; align-items:center; gap:10px; flex-wrap:wrap';
  const frameK = el('span', 'q-k'); frameK.textContent = 'drive frame · 50 Hz';
  const frame = el('div', 'q-frame');
  const cells = FIELDS.map((f, i) => { const s = el('span', i === 9 ? 'crc' : ''); const a = el('i'); a.textContent = f; const b = el('b'); b.textContent = '--'; s.append(a, b); frame.append(s); return { s, a, b }; });
  const badge = el('span', 'q-chip'); badge.style.marginLeft = 'auto';
  frameRow.append(frameK, frame, badge);
  const dbg = el('div'); dbg.style.cssText = 'font-size: 11px; color: var(--q-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis';
  bottom.append(frameRow, dbg);

  const tip = el('div', 'q-panel'); Object.assign(tip.style, { position: 'absolute', padding: '4px 9px', fontSize: '11.5px', color: 'var(--q-ink)', pointerEvents: 'none', display: 'none', whiteSpace: 'nowrap' });
  const tags = {};
  for (const n of ['xbee', 'teensy', 'tog_l', 'tog_r', 'reg', 'jst']) {
    const t = el('div'); t.style.cssText = 'position:absolute; font-size:10.5px; color: var(--q-cu-hi); background: rgba(7,9,12,.75); border:1px solid rgba(236,154,90,.4); border-radius: 4px; padding: 1px 6px; pointer-events:none; white-space:nowrap; opacity:0; transition: opacity .25s; transform: translate(-50%, -100%)';
    t.textContent = PARTS[n].t.split(' ·')[0]; hud.append(t); tags[n] = t;
  }
  hud.append(head, tools, info, keysP, bottom, tip);
  wrap.append(hud);

  // ---------------------------------------------------------------- controller state, as Controller_v7 keeps it
  const st = { btn: {}, x: 0, y: 0, t: 0, lead: 0, speedMode: 1, phase: 0, safety: false, expo: false, ch: 0x0F };
  const held = new Set();
  let hopUntil = 0, hopPkt = null, lastLog = '', lastLogAt = 0;
  const log = s => { lastLog = s; lastLogAt = performance.now(); ctx.termLine?.([s, 'c-mut']); };
  function press(name, down) {
    if (name === 'tog_l' || name === 'tog_r') {
      if (!down) return;
      ctx.sfx.click();
      if (name === 'tog_l') st.expo = !st.expo;
      else { st.safety = !st.safety; if (st.safety) for (const k of LATCHING) st.btn[k] = false; }
      return;
    }
    if (down === held.has(name)) return;
    if (!down) { held.delete(name); if (!LATCHING.has(name)) st.btn[name] = false; return; }
    held.add(name);
    ctx.sfx.click();
    if (name === 'l1') {
      st.ch = st.ch >= 0x1A ? 0x0B : st.ch + 1;
      hopPkt = hopFrame(st.ch); hopUntil = performance.now() + 900;
      log(`[HOP] L1 -> CH:${st.ch} (${channelMHz(st.ch)} MHz)`);
      return;
    }
    if (name === 'r1') { st.speedMode = (st.speedMode % 2) + 1; return; }
    if (name === 'reset') {
      if (!st.safety) { st.phase = (st.phase + 1) % 3; log(`[PHASE] -> ${PHASES[st.phase][0]}`); }
      return;
    }
    if (st.safety) return;
    if (LATCHING.has(name)) st.btn[name] = !st.btn[name];
    else st.btn[name] = true;
  }

  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'cross', x: 'cir', c: 'sq', v: 'tri', q: 'l1', e: 'r1', m: 'reset', 1: 'tog_l', 2: 'tog_r' };
  const axes = new Set();
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const down = e.type === 'keydown', k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Shift') { if (down && !e.repeat) { st.btn.swr = !st.btn.swr; ctx.sfx.click(); } return; }
    if (k.length === 1 && 'wasdjlik'.includes(k)) { e.preventDefault(); if (down) axes.add(k); else axes.delete(k); return; }
    const name = KEYMAP[k];
    if (!name) return;
    e.preventDefault();
    if (e.repeat) return;
    press(name, down);
    if (down) select(name, false);
  }
  wrap.addEventListener('keydown', onKey);
  wrap.addEventListener('keyup', onKey);
  wrap.addEventListener('blur', () => { for (const n of [...held]) press(n, false); axes.clear(); });

  // ---------------------------------------------------------------- picking and selection
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let hover = null, selected = null, downAt = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false).find(h => h.object.visible);
    return hit ? hit.object.userData.part : null;
  }
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const p = pick(e);
    if (p !== hover) { hover = p; paint(); canvas.style.cursor = p ? 'pointer' : 'grab'; }
    if (p) {
      const r = wrap.getBoundingClientRect();
      tip.textContent = PARTS[p].t + (PARTS[p].pin ? '  ·  pin ' + PARTS[p].pin : '');
      tip.style.display = 'block'; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
    } else tip.style.display = 'none';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; paint(); tip.style.display = 'none'; });
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; wrap.focus({ preventScroll: true }); });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const p = pick(e);
    if (!p) { select(null); return; }
    select(p, true);
    if (BUTTONS.includes(p) || p === 'tog_l' || p === 'tog_r') { press(p, true); setTimeout(() => press(p, false), 160); }
  });

  function select(name, fly) {
    selected = name;
    paint();
    const P = PARTS[name || 'board'];
    infoK.textContent = name ? P.k : (th() ? 'คลิกชิ้นส่วนเพื่อดูรายละเอียด' : 'click a part');
    infoT.textContent = P.t;
    infoP.textContent = [P.pin && 'pin ' + P.pin, P.bit].filter(Boolean).join('  ·  ');
    infoP.style.display = infoP.textContent ? '' : 'none';
    infoD.textContent = P.d[th() ? 'th' : 'en'];
    if (fly && name && name !== 'board') {
      const c = new THREE.Box3().setFromObject(items[name].group).getCenter(new THREE.Vector3());
      const dir = camera.position.clone().sub(controls.target).normalize();
      flyTo(c.clone().add(dir.multiplyScalar(170)), c);
    }
  }
  function paint() {
    for (const [n, it] of Object.entries(items)) {
      const v = n === selected ? 0.32 : n === hover ? 0.14 : 0;
      for (const m of it.mats) { m.emissive.setHex(0xec9a5a); m.emissiveIntensity = v; }
      if (it.ghost) it.ghost.color.setHex(n === selected || n === hover ? 0xffffff : 0xffb47c);
    }
  }
  function applyXray() {
    const bm = items.board.mats[0];
    bm.transparent = xray; bm.opacity = xray ? 0.22 : 1; bm.depthWrite = !xray; bm.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera moves
  let fly = null;
  function flyTo(pos, target, dur = 0.9) {
    if (reduced) { camera.position.copy(pos); controls.target.copy(target); return; }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), s: performance.now(), d: dur * 1000 };
  }

  // intro: parts drop onto the board in a ripple from the centre while the camera swings in
  const introStart = performance.now();
  let introOn = !reduced;
  const order = Object.entries(items).map(([n, it]) => {
    const c = new THREE.Box3().setFromObject(it.group).getCenter(new THREE.Vector3());
    return [n, n === 'board' ? 0 : 0.2 + Math.hypot(c.x, c.z) / 260];
  });
  if (introOn) flyTo(HOME, HOME_T, 1.8); else camera.position.copy(HOME);

  // ---------------------------------------------------------------- loop
  let explode = 0, exTarget = 0, raf = 0, last = performance.now(), frameT = 0, dbgT = 1;
  ex.addEventListener('input', () => { exTarget = +ex.value; exO.textContent = Math.round(exTarget * 100) + '%'; });
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const tmp = new THREE.Vector3(), box = new THREE.Box3();

  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const narrow = w < 760;
    keysP.style.display = narrow ? 'none' : '';
    exRow.style.width = narrow ? '190px' : '250px';
    info.style.bottom = narrow ? '120px' : '96px';
  }
  const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (fly) {
      const k = Math.min(1, (now - fly.s) / fly.d), e = easeOut(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (k >= 1) fly = null;
    }
    explode += (exTarget - explode) * Math.min(1, dt * 7);

    const ti = (now - introStart) / 1000;
    for (const [n, delay] of order) {
      const it = items[n];
      let y = (it.base || 0) + explode * it.lift;
      if (introOn && n !== 'board') {
        const k = Math.max(0, Math.min(1, (ti - delay) / 0.7));
        y += (1 - easeBack(k)) * 70;
        it.group.visible = k > 0;
      }
      it.group.position.y = y;
      if (it.cap) {
        const target = (st.btn[n] || held.has(n) ? -1.1 : 0) + explode * 16;
        it.cap.position.y += (target - it.cap.position.y) * Math.min(1, dt * 25);
      }
      if (it.bat) {
        const on = n === 'tog_l' ? st.expo : st.safety;
        it.bat.rotation.x += ((on ? -0.38 : 0.38) - it.bat.rotation.x) * Math.min(1, dt * 14);
      }
    }
    if (introOn && ti > 3) { introOn = false; for (const it of Object.values(items)) it.group.visible = true; }
    items.board.edges.material.opacity = 0.35 + explode * 0.4;
    items.teensy.pinMat.emissiveIntensity = 0.5 + 0.3 * Math.sin(now / 400);

    // sticks from the keyboard (expo when TOG_L is up)
    const a = c => (axes.has(c) ? 1 : 0), approach = (v, tgt) => { const r = v + (tgt - v) * Math.min(1, dt * 10); return Math.abs(r) < 0.004 ? 0 : r; };
    const shape = v => (st.expo ? 0.7 * v * v * v + 0.3 * v : v);
    st.y = approach(st.y, shape(a('w') - a('s'))); st.x = approach(st.x, shape(a('d') - a('a')));
    st.t = approach(st.t, shape(a('l') - a('j'))); st.lead = approach(st.lead, a('i') - a('k'));

    frameT += dt;
    if (frameT >= 0.02) { frameT = 0; drawFrame(now); }       // one frame per 20 ms, like the drive loop
    dbgT += dt;
    if (dbgT >= 0.25) { dbgT = 0; drawDebug(now); }

    // floating labels while exploded
    const r = canvas.getBoundingClientRect(), show = explode > 0.35;
    for (const [n, t] of Object.entries(tags)) {
      box.setFromObject(items[n].group).getCenter(tmp);
      tmp.y = n === 'teensy' ? box.min.y - 4 : box.max.y + 4;
      tmp.project(camera);
      t.style.left = ((tmp.x + 1) / 2 * r.width) + 'px';
      t.style.top = ((1 - tmp.y) / 2 * r.height) + 'px';
      t.style.opacity = show && tmp.z < 1 ? '1' : '0';
    }

    controls.update();
    renderer.render(scene, camera);
  }

  const NEUTRAL = [0xAA, 0x43, 0, 0, 0x80, 0x80, 0x80, -1, 0x80];
  function drawFrame(now) {
    const hop = now < hopUntil, p = hop ? hopPkt : driveFrame(st);
    p.forEach((b, i) => {
      cells[i].b.textContent = hex(b);
      cells[i].s.classList.toggle('hot', hop ? i === 1 || i === 2 : i < 9 && i !== 7 && b !== NEUTRAL[i]);
    });
    cells[1].a.textContent = hop ? 'CMD' : 'VER';
    cells[2].a.textContent = hop ? 'CH' : 'BTN';
    badge.textContent = st.safety ? 'SAFETY · all zero' : hop ? `HOP → CH ${st.ch} · ${channelMHz(st.ch)} MHz` : `${st.btn.swr ? 'CREEP(10%)' : st.speedMode === 1 ? 'FULL(100%)' : 'MED(30%)'} · ${PHASES[st.phase][0]}${st.expo ? ' · expo' : ''}`;
    badge.style.color = st.safety ? 'var(--q-bad)' : hop ? 'var(--q-cu-hi)' : '';
  }
  function drawDebug(now) {
    const s = st, i4 = v => String(Math.trunc(v * 255)).padStart(4), b = k => (s.btn[k] ? 1 : 0);
    const p = driveFrame(s);
    const speed = s.btn.swr ? 'CREEP(10%)' : s.speedMode === 1 ? 'FULL(100%)' : 'MED(30%)';
    const line = `[CH:${s.ch}|${channelMHz(s.ch)}MHz] Q:100% | ${speed} x${PHASES[s.phase][0]} | VY:${i4(s.y)} VX:${i4(s.x)} VT:${i4(s.t)} | BTN:${hex(p[2])} AUX:${hex(p[3])} | GRIP:${b('tri')} ARM:${b('down')} HAND:${b('left')} WRIST:${b('right')} STR:${b('sq')}`;
    dbg.textContent = (now - lastLogAt < 2500 ? lastLog + '   ' : '') + line;
  }

  select(null);
  raf = requestAnimationFrame(tick);

  return {
    focus() { wrap.focus({ preventScroll: true }); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); });
      envTex.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
