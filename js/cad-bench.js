// CAD bench: Q's own CAD on the page. Three tabs: the MioNex Starter concept mechanism (CadQuery,
// packed by tools/cad/pack_cad.py with its BOM), Q's 3D prints (.3mf, same packer) and the
// controller PCB (EasyEDA export, qos/pcb.bin). Orbit, explode, click a part or pick it from the
// list. It renders only when something changes, so it costs nothing while you read.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const ROOT = new URL('../', import.meta.url);
const tx = (th, en) => `<span class="th">${th}</span><span class="en" lang="en">${en}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// BOM materials -> colour, metalness, roughness, label
const MAT = {
  pla: [0xe9e5dc, 0, 0.62, 'พิมพ์ 3 มิติ (PETG / PA12)', '3D print (PETG / PA12)'],
  teal: [0x2bb3a6, 0, 0.6, 'พิมพ์ 3 มิติ', '3D print'],
  steel: [0xa3aab3, 0.85, 0.34, 'เหล็ก', 'Steel'],
  brass: [0xc9a24a, 0.9, 0.32, 'ทองเหลือง', 'Brass'],
  alu: [0xc8cdd3, 0.8, 0.38, 'อะลูมิเนียม', 'Aluminium'],
  silicone: [0x3d434b, 0, 0.9, 'ซิลิโคน Shore 30A', 'Shore 30A silicone'],
  pcb: [0x2f6d3a, 0.1, 0.55, 'แผ่นวงจร FR4', 'FR4 board'],
  pcbgreen: [0x2f6d3a, 0.1, 0.55, 'แผ่นวงจร', 'Circuit board'],
  gold: [0xd9b44a, 1, 0.28, 'หน้าสัมผัสทอง (ENIG)', 'Gold contact (ENIG)'],
  nickel: [0xbfc3c8, 0.9, 0.3, 'แม่เหล็ก N52', 'N52 magnet'],
  black: [0x1f2329, 0.1, 0.6, 'พลาสติก', 'Plastic'],
  battery: [0x3b4a8a, 0.2, 0.5, 'แบตเตอรี่ LiPo', 'LiPo battery'],
};
const GROUPS = [
  ['ชุดขับ', 'Drive train', /^(n20_|motor_cradle|shaft_coupler|bearing_|leadscrew|nut_carriage|TR5_|guide_rod|push_link|link_pin)/],
  ['นิ้ว', 'Fin', /^(hinge_|M2_screw|e_clip|front_drive_cover|mitten_fin|fin_grip)/],
  ['นิ้วโป้ง', 'Thumb', /^thumb/],
  ['ข้อต่อข้อมือ', 'Wrist coupling', /^(wrist_|contact_|magnet_|locking_collar|release_button|pogo_)/],
  ['ไฟและวงจร', 'Power and electronics', /^(battery|emg_)/],
];
const base = (n) => n.replace(/_-?\d+$/, '');
const pretty = (n) => { const s = base(n).replace(/_/g, ' '); return s[0].toUpperCase() + s.slice(1); };

// 'QCAD' file (tools/cad/pack_cad.py): meta JSON, then per part u16 positions over its box + indices
async function loadQCAD(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer(), dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'QCAD') throw new Error(`${url}: bad magic`);
  const n = dv.getUint32(4, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  let off = 8 + n;
  const align = () => { off = (off + 3) & ~3; };
  return meta.parts.map((p) => {
    align(); const q = new Uint16Array(buf, off, p.v * 3); off += p.v * 6;
    align(); const idx = p.w ? new Uint32Array(buf, off, p.i) : new Uint16Array(buf, off, p.i); off += p.i * (p.w ? 4 : 2);
    const pos = new Float32Array(p.v * 3);
    for (let k = 0; k < pos.length; k++) pos[k] = p.lo[k % 3] + (q[k] / 65535) * p.span[k % 3];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return { ...p, g };
  });
}

function edges(g, opacity = 0.35) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x0b0e13, transparent: true, opacity }));
}

export async function mountCadBench(root) {
  const stage = root.querySelector('.cad-stage'), canvas = stage.querySelector('canvas');
  const list = root.querySelector('.cad-list'), info = root.querySelector('.cad-info');
  const slider = root.querySelector('.cad-explode input'), status = root.querySelector('.cad-status');
  const tabs = [...root.querySelectorAll('.cad-tab')];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture; pmrem.dispose(); room.dispose();
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff4e8, 1.8); key.position.set(-2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xec9a5a, 1.2); rim.position.set(3, 1, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;

  let frame = 0;
  const render = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); }); };
  controls.addEventListener('change', render);
  const fit = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); render();
  };
  const ro = new ResizeObserver(fit); ro.observe(stage);

  // a tab = { obj, items: [{ key, label, meshes, dir, lift, group, info() }], intro, explode, single, view }
  let cur = null, sel = null, hover = null;
  const cache = {};

  function frameView(obj, dir) {
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.78;
    camera.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d));
    camera.near = d / 50; camera.far = d * 10; camera.updateProjectionMatrix();
    controls.target.copy(c); controls.minDistance = d * 0.35; controls.maxDistance = d * 2.5; controls.update();
  }

  function explode(t) {
    if (!cur) return;
    for (const it of cur.items) for (const m of it.meshes) m.position.copy(it.dir).multiplyScalar(t * it.lift);
    render();
  }

  function tint(it, on, color) {
    if (!it) return;
    for (const m of it.meshes) { m.material.emissive.setHex(on ? color : 0); m.material.emissiveIntensity = on ? 0.35 : 0; }
  }
  function select(it) {
    tint(sel, false); sel = it; tint(sel, true, 0xec9a5a);
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === sel?.key));
    info.innerHTML = sel ? sel.info() : cur.intro;
    render();
  }

  // ---- tab builders
  async function buildHand() {
    const parts = await loadQCAD(new URL('cad/hand.bin', ROOT));
    const group = new THREE.Group(), items = new Map();
    for (const p of parts) {
      const [c, metal, rough] = MAT[p.mat] || MAT.pla;
      const m = new THREE.Mesh(p.g, new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, flatShading: true }));
      m.add(edges(p.g));
      const k = base(p.name);
      if (!items.has(k)) items.set(k, { key: k, parts: [], meshes: [] });
      items.get(k).parts.push(p); items.get(k).meshes.push(m);
      m.userData.key = k; group.add(m);
    }
    const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    const holder = new THREE.Group(); group.position.sub(c); holder.add(group);
    const all = [...items.values()].map((it) => {
      const bb = new THREE.Box3(); it.meshes.forEach((m) => bb.expandByObject(m));
      const pc = bb.getCenter(new THREE.Vector3()).sub(c);
      const p = it.parts[0], mat = MAT[p.mat] || MAT.pla, n = it.parts.length;
      return Object.assign(it, {
        dir: pc.lengthSq() > 1e-6 ? pc.clone().normalize() : new THREE.Vector3(0, 1, 0),
        lift: 18 + pc.length() * 0.9,
        group: GROUPS.findIndex((g) => g[2].test(it.key)),
        label: pretty(p.name) + (n > 1 ? ` ×${n}` : ''),
        info: () => `<h4>${esc(pretty(p.name))}${n > 1 ? ` <small>×${n}</small>` : ''}</h4>
          <p class="cad-mat">${tx(mat[3], mat[4])}</p>${p.note ? `<p>${esc(p.note)}</p>` : ''}`,
      });
    });
    return {
      obj: holder, items: all, explode: true, view: [0.9, 1.1, 1.2],
      intro: `<h4>${tx('MioNex Starter · กลไกต้นแบบ', 'MioNex Starter · concept mechanism')}</h4>
        <p>${tx('มอเตอร์ N20 หมุนเกลียว TR5 แคร่บนรางสองเส้นดันก้านให้นิ้วชิ้นเดียวกำและแบ เกลียวล็อกตัวเอง จึงจับค้างได้โดยไม่กินไฟ ข้อมือเป็นบาโยเน็ตพร้อมหน้าสัมผัส 5 ขา',
          'An N20 motor turns a TR5 leadscrew; a carriage on two rods pushes a link that opens and closes a one-piece fin. The leadscrew is self-locking, so the grip holds with no power. The wrist is a bayonet with five spring contacts.')}</p>
        <p class="cad-honest">${tx('CAD แนวคิดที่ผมเขียนด้วย CadQuery (Python) สำหรับเวทีพิตช์ SIBB70 ขนาดเป็นรอบแรก ยังไม่ได้ทดสอบ เปลือกมือ โครงฝ่ามือ และเบ้าแขนเป็น CAD ของทีม จึงไม่ได้แสดงที่นี่',
          "Concept CAD I wrote in CadQuery (Python) for the SIBB70 pitch. First-pass dimensions, not validated. The hand shell, palm chassis and socket are the team's CAD, so they aren't shown here.")}</p>`,
    };
  }

  async function buildPrints() {
    const parts = await loadQCAD(new URL('cad/prints.bin', ROOT));
    const holder = new THREE.Group();
    const items = parts.map((p) => {
      const c = p.g.boundingBox.getCenter(new THREE.Vector3());
      p.g.translate(-c.x, -c.y, -c.z);
      const m = new THREE.Mesh(p.g, new THREE.MeshStandardMaterial({ color: 0xe2ddd3, roughness: 0.55, flatShading: true }));
      m.add(edges(p.g, 0.25));
      m.rotation.x = -Math.PI / 2;            // the print bed is z-up; the scene is y-up
      m.visible = false; m.userData.key = p.name; holder.add(m);
      const s = p.span.map((v) => (v < 10 ? v.toFixed(1) : Math.round(v)));
      return { key: p.name, meshes: [m], dir: new THREE.Vector3(), lift: 0, group: -1, label: p.en, labelTh: p.th,
        info: () => `<h4>${tx(esc(p.th), esc(p.en))}</h4><p class="cad-mat">${tx('ชิ้นงานพิมพ์ 3 มิติที่ผมออกแบบ', 'A print I designed')}</p>
          <p>${s[0]} × ${s[1]} × ${s[2]} mm · ${(p.i / 3).toLocaleString('en')} ${tx('สามเหลี่ยม', 'triangles')}</p>` };
    });
    return {
      obj: holder, items, explode: false, single: true, view: [0.4, 1, 1.1],
      intro: `<h4>${tx('ชิ้นงานพิมพ์ 3 มิติ', '3D prints')}</h4><p>${tx('ของที่ผมออกแบบแล้วพิมพ์จริง เลือกจากรายการเพื่อดูทีละชิ้น', 'Things I designed and printed. Pick one from the list.')}</p>`,
    };
  }

  async function buildPcb() {
    const [{ loadPCB, boardOutline }, { PARTS, LIFT }] = await Promise.all([import('./qos/pcb.js'), import('./qos/robot3d.js')]);
    const pcb = await loadPCB(THREE, new URL('qos/pcb.bin', ROOT).href);
    const holder = new THREE.Group(), up = new THREE.Vector3(0, 1, 0);
    const items = pcb.parts.map((p) => {
      // as in qOS robot3d: a dark solder-masked board with a copper outline; the export's triangle
      // winding is inconsistent, so every part renders both sides
      const g = pcb.geometry(p), board = p.name === 'board';
      const m = new THREE.Mesh(g, board
        ? new THREE.MeshPhysicalMaterial({ color: 0x0d1411, roughness: 0.62, clearcoat: 0.6, clearcoatRoughness: 0.35, flatShading: true, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide }));
      if (board) m.add(new THREE.LineSegments(boardOutline(THREE, g), new THREE.LineBasicMaterial({ color: 0xec9a5a, transparent: true, opacity: 0.4 })));
      m.userData.key = p.name; holder.add(m);
      const d = PARTS[p.name] || { t: p.name, d: { th: '', en: '' } };
      return { key: p.name, meshes: [m], dir: up, lift: LIFT[p.name] ?? 22, group: -1, label: d.t,
        info: () => `<h4>${esc(d.t)}</h4>${d.pin ? `<p class="cad-mat">pin ${esc(d.pin)}${d.bit ? ' · ' + esc(d.bit) : ''}</p>` : ''}<p>${tx(esc(d.d.th), esc(d.d.en))}</p>` };
    });
    return {
      obj: holder, items, explode: true, view: [0.2, 1.1, 0.9],
      intro: `<h4>${tx('บอร์ดรีโมต ABU Robocon 2026', 'ABU Robocon 2026 controller board')}</h4><p>${tx(esc(PARTS.board.d.th), esc(PARTS.board.d.en))}</p>`,
    };
  }
  const BUILD = { hand: buildHand, prints: buildPrints, pcb: buildPcb };

  function fillList() {
    const row = (it) => `<li><button type="button" data-k="${esc(it.key)}" aria-pressed="false">${it.labelTh ? tx(esc(it.labelTh), esc(it.label)) : esc(it.label)}</button></li>`;
    list.innerHTML = cur.items[0].group >= 0
      ? GROUPS.map((g, gi) => `<li class="cad-g"><b>${tx(g[0], g[1])}</b><ul>${cur.items.filter((it) => it.group === gi).map(row).join('')}</ul></li>`).join('')
      : cur.items.map(row).join('');
  }

  let want = '';
  async function show(name) {
    want = name;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    if (cur) scene.remove(cur.obj);
    cur = null; sel = null; hover = null;
    status.hidden = false; status.innerHTML = tx('กำลังโหลด…', 'Loading…');
    let tab;
    try { tab = cache[name] ||= await BUILD[name](); }
    catch (e) { console.warn('cad bench', e); if (want === name) status.innerHTML = tx('โหลดโมเดลไม่สำเร็จ', "Couldn't load this model."); return; }
    if (want !== name) return;                 // another tab was picked while this one loaded
    cur = tab; status.hidden = true;
    scene.add(cur.obj);
    root.querySelector('.cad-explode').hidden = !cur.explode;
    slider.value = 0; explode(0);
    fillList();
    if (cur.single) { cur.items.forEach((it, k) => { it.meshes[0].visible = k === 0; }); select(cur.items[0]); frameView(cur.items[0].meshes[0], cur.view); }
    else { select(null); frameView(cur.obj, cur.view); }
  }

  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  slider.addEventListener('input', () => explode(slider.value / 100));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b || !cur) return;
    const it = cur.items.find((x) => x.key === b.dataset.k);
    if (cur.single) { cur.items.forEach((x) => { x.meshes[0].visible = x === it; }); frameView(it.meshes[0], cur.view); select(it); }
    else select(sel === it ? null : it);
  });

  // pointer picking: hover tints, a click (not a drag) selects
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(cur.items.flatMap((it) => it.meshes).filter((m) => m.visible), false)[0];
    return hit ? cur.items.find((it) => it.key === hit.object.userData.key) : null;
  };
  canvas.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerType !== 'mouse' || e.buttons) return;
    const it = pick(e);
    if (it === hover) return;
    if (hover && hover !== sel) tint(hover, false);
    hover = it;
    if (hover && hover !== sel) tint(hover, true, 0x4a5a6a);
    canvas.style.cursor = hover ? 'pointer' : 'grab'; render();
  });
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!cur || cur.single || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const it = pick(e); select(it === sel ? null : it);
  });

  // dynamic text follows the language switch
  const mo = new MutationObserver(() => { if (cur) info.innerHTML = sel ? sel.info() : cur.intro; });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });

  fit();
  await show('hand');
  root.classList.add('ready');
}
