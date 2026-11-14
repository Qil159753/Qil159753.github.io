// MIONEX hand demo: the code-built MIONEX arm (js/mionex-hero.js) copies the visitor's fingers from
// their webcam. Tracking is MediaPipe's hand landmarker running in the browser; no frame leaves it.
// The main page opens it in a dialog (openHandDialog); qOS mounts it in a window (js/qos/hand.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMionexArm } from './mionex-hero.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = new URL('../models/hand_landmarker.task', import.meta.url).href;
const CSS = new URL('./mionex-hand.css', import.meta.url).href;

// MediaPipe landmark ids per finger, index..little: MCP, PIP, DIP, tip
const CHAINS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17], ...CHAINS.flatMap(c => [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]]])];
// joint limits of the model (radians) so a tight fist doesn't push links through each other
const LIMIT = [1.45, 1.6, 1.15];
const REST = 0.08;

const tx = (th, en) => `<span class="th">${th}</span><span class="en" lang="en">${en}</span>`;
const MSG = {
  idle: tx('กดเปิดกล้อง แล้วชูฝ่ามือให้กล้องเห็น', 'Turn on the camera, then hold your palm up to it.'),
  asking: tx('รอสิทธิ์ใช้กล้อง…', 'Waiting for camera permission…'),
  loading: tx('กำลังโหลดตัวจับมือ (ราว 10 MB เฉพาะครั้งแรก)…', 'Loading hand tracking (about 10 MB, first time only)…'),
  tracking: tx('เจอมือแล้ว ลองกำ แบ หรือนับนิ้วดู', 'Got your hand. Try a fist, an open palm, or count on your fingers.'),
  lost: tx('ยังไม่เห็นมือ ชูฝ่ามือให้อยู่ในกรอบ', 'No hand in view. Hold your palm inside the frame.'),
  denied: tx('เบราว์เซอร์ไม่ให้ใช้กล้อง เปิดสิทธิ์กล้องให้เว็บนี้แล้วลองใหม่', 'The browser blocked the camera. Allow camera access for this site and try again.'),
  nocam: tx('ไม่เจอกล้องบนเครื่องนี้', 'No camera found on this device.'),
  fail: tx('โหลดตัวจับมือไม่สำเร็จ ลองรีเฟรชหน้าแล้วลองใหม่', "Couldn't load hand tracking. Refresh the page and try again."),
  nogl: tx('เบราว์เซอร์นี้แสดงโมเดล 3 มิติไม่ได้', "This browser can't show the 3D model."),
};
const NAMES = [['นิ้วโป้ง', 'thumb'], ['นิ้วชี้', 'index'], ['นิ้วกลาง', 'middle'], ['นิ้วนาง', 'ring'], ['นิ้วก้อย', 'little']];

function loadCSS() {
  if (document.querySelector(`link[href="${CSS}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS; document.head.append(l);
}

const sub = (a, b) => [b.x - a.x, b.y - a.y, b.z - a.z];
function angle(u, w) {
  const d = u[0] * w[0] + u[1] * w[1] + u[2] * w[2], n = Math.hypot(...u) * Math.hypot(...w);
  return n ? Math.acos(Math.max(-1, Math.min(1, d / n))) : 0;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// World landmarks (metres, hand-centred) -> model joints. Each joint is the bend between the bones on
// either side of it; MCP is measured against the wrist->knuckle line, which sits ~0.15 rad off a
// straight finger, so that offset is taken away.
export function solve(L) {
  const j = CHAINS.map(([m, p, d, t]) => [
    Math.min(LIMIT[0], Math.max(0, angle(sub(L[0], L[m]), sub(L[m], L[p])) - 0.15)),
    Math.min(LIMIT[1], angle(sub(L[m], L[p]), sub(L[p], L[d]))),
    Math.min(LIMIT[2], angle(sub(L[p], L[d]), sub(L[d], L[t]))),
  ]);
  // thumb: its own bend, or how far the tip has crossed toward the middle knuckle, whichever says more
  const bend = (angle(sub(L[1], L[2]), sub(L[2], L[3])) + angle(sub(L[2], L[3]), sub(L[3], L[4]))) / 1.3;
  const palm = Math.hypot(...sub(L[0], L[9])) || 1;
  const reach = 1 - clamp01((Math.hypot(...sub(L[4], L[9])) / palm - 0.45) / 0.6);
  return { j, thumb: clamp01(Math.max(bend, reach)) };
}

export async function mountHand(host, { compact = false } = {}) {
  loadCSS();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
  const root = document.createElement('div');
  root.className = 'mh' + (compact ? ' mh-compact' : '');
  root.innerHTML = `
    <div class="mh-stage">
      <canvas class="mh-gl" aria-hidden="true"></canvas>
      <div class="mh-cam" hidden><video playsinline muted></video><canvas class="mh-bones" aria-hidden="true"></canvas></div>
      <div class="mh-start"><button type="button" class="mh-btn mh-on">${tx('เปิดกล้อง', 'Turn on camera')}</button>
        <p>${tx('ภาพจากกล้องประมวลผลในเบราว์เซอร์ของคุณเท่านั้น ไม่ถูกส่งหรือบันทึกไว้ที่ไหน', 'Your camera feed is processed in your browser and is never uploaded or saved.')}</p></div>
    </div>
    <div class="mh-side">
      <h3>${tx('มือ MIONEX ขยับตามคุณ', 'The MIONEX hand, following yours')}</h3>
      <p class="mh-status" aria-live="polite">${MSG.idle}</p>
      <ul class="mh-meters">${NAMES.map(([th, en]) => `<li><span class="mh-name">${tx(th, en)}</span><span class="mh-bar"><i></i></span><span class="mh-pct">0%</span></li>`).join('')}</ul>
      <p class="mh-note">${tx('MIONEX ตัวจริงอ่านสัญญาณไฟฟ้าจากกล้ามเนื้อแขนส่วนที่เหลือ แล้วสั่งให้มือกำและแบ เดโมนี้ใช้กล้องแทน และให้ทุกนิ้วขยับตามคุณ โมเดลสร้างด้วยโค้ดตามสัดส่วนแขนจริง',
        'The real MIONEX reads muscle signals from the remaining forearm to open and close the hand. This demo uses your webcam instead and moves every finger with yours. The model is built in code to the real arm\'s proportions.')}</p>
      <button type="button" class="mh-btn mh-off" hidden>${tx('ปิดกล้อง', 'Turn off camera')}</button>
    </div>`;
  host.append(root);
  const $ = (s) => root.querySelector(s);
  const status = (k) => { $('.mh-status').innerHTML = MSG[k]; };
  const bars = [...root.querySelectorAll('.mh-bar i')], pcts = [...root.querySelectorAll('.mh-pct')];

  // ---- 3D
  const canvas = $('.mh-gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    status('nogl'); $('.mh-start').hidden = true;
    return { dispose() { root.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture; pmrem.dispose(); room.dispose();
  scene.environmentIntensity = 0.35;
  const key = new THREE.DirectionalLight(0xfff4e8, 2.4); key.position.set(-1.5, 5, 3.5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xdde6f0, 0x1a1d22, 0.6));
  const rim = new THREE.DirectionalLight(0xec9a5a, 2.2); rim.position.set(3, 1, -4); scene.add(rim);

  const A = createMionexArm(), model = A.group;
  // fingers up, palm toward the viewer like the visitor's own palm toward the webcam, turned a little
  // so finger flexion reads in depth
  const pose = new THREE.Group(); pose.add(model);
  model.rotation.z = -Math.PI / 2;
  const box = new THREE.Box3().setFromObject(pose);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  model.position.y -= 0.55;   // frame the hand, let the socket run off the bottom
  pose.rotation.y = -0.45;
  scene.add(pose);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0.35, Math.max(4.6, 3.4 / camera.aspect));
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // smoothed joint state
  const cur = { j: CHAINS.map(() => [REST, REST, REST]), thumb: 0 };
  let target = null, lastSeen = 0;

  function idleTarget(t) {
    if (reduce) return { j: CHAINS.map(() => [REST, REST, REST]), thumb: 0.1 };
    // a slow ripple across the fingers, so the hand looks alive before the camera is on
    const c = (i) => 0.12 + 0.45 * Math.max(0, Math.sin(t * 1.6 - i * 0.7)) ** 2;
    return { j: CHAINS.map((_, i) => [c(i + 1) * 0.9, c(i + 1), c(i + 1) * 0.8]), thumb: c(0) * 0.8 };
  }

  // ---- camera + tracking
  const video = $('video'), bones = $('.mh-bones'), bctx = bones.getContext('2d');
  let stream = null, landmarker = null, tracking = false, lastVideoTime = -1, lms = null;

  async function getLandmarker() {
    if (landmarker) return landmarker;
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
    return landmarker;
  }

  async function start() {
    $('.mh-on').disabled = true;
    if (!navigator.mediaDevices?.getUserMedia) { status('nocam'); $('.mh-on').disabled = false; return; }
    status('asking');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      status(e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'nocam' : 'denied');
      $('.mh-on').disabled = false; return;
    }
    if (disposed) { stopStream(); return; }
    video.srcObject = stream; await video.play().catch(() => {});
    $('.mh-start').hidden = true; $('.mh-cam').hidden = false; $('.mh-off').hidden = false;
    status('loading');
    try { await getLandmarker(); }
    catch (e) { console.warn('hand tracking unavailable:', e); status('fail'); stop(); return; }
    if (disposed || !stream) return;
    tracking = true; status('lost');
  }

  function stopStream() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
  function stop() {
    tracking = false; target = null; lms = null; seenState = false; stopStream(); video.srcObject = null;
    $('.mh-cam').hidden = true; $('.mh-off').hidden = true; $('.mh-start').hidden = false; $('.mh-on').disabled = false;
    bctx.clearRect(0, 0, bones.width, bones.height);
  }
  $('.mh-on').addEventListener('click', start);
  $('.mh-off').addEventListener('click', () => { stop(); status('idle'); });

  let seenState = false;
  function track(now) {
    if (!tracking || !landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const r = landmarker.detectForVideo(video, now);
    if (r.worldLandmarks?.length) {
      target = solve(r.worldLandmarks[0]); lms = r.landmarks[0]; lastSeen = now;
      if (!seenState) { seenState = true; status('tracking'); }
    } else if (now - lastSeen > 500) {
      target = null; lms = null;
      if (seenState) { seenState = false; status('lost'); }
    }
    drawBones();
  }

  function drawBones() {
    const w = video.videoWidth, h = video.videoHeight;
    if (bones.width !== w) { bones.width = w; bones.height = h; }
    bctx.clearRect(0, 0, w, h);
    if (!lms) return;
    bctx.strokeStyle = 'rgba(236,154,90,.9)'; bctx.lineWidth = Math.max(2, w / 220); bctx.lineCap = 'round';
    bctx.beginPath();
    for (const [a, b] of BONES) { bctx.moveTo(lms[a].x * w, lms[a].y * h); bctx.lineTo(lms[b].x * w, lms[b].y * h); }
    bctx.stroke();
    bctx.fillStyle = '#ffb47c';
    for (const p of lms) { bctx.beginPath(); bctx.arc(p.x * w, p.y * h, w / 150, 0, Math.PI * 2); bctx.fill(); }
  }

  // ---- loop
  let raf = 0, last = performance.now(), visible = true, disposed = false;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    track(now);
    const want = target || (tracking ? { j: CHAINS.map(() => [REST, REST, REST]), thumb: 0.05 } : idleTarget(now / 1000));
    const k = 1 - Math.exp(-dt * (target ? 16 : 6));
    cur.j.forEach((f, i) => f.forEach((v, n) => { f[n] = v + (want.j[i][n] - v) * k; }));
    cur.thumb += (want.thumb - cur.thumb) * k;
    A.setJoints(cur.j, cur.thumb);
    A.update(now / 1000);
    const curls = [cur.thumb, ...cur.j.map((f) => (f[0] / LIMIT[0] + f[1] / LIMIT[1] + f[2] / LIMIT[2]) / 3)];
    curls.forEach((c, i) => { const p = Math.round(clamp01(c) * 100); bars[i].style.transform = `scaleX(${p / 100})`; pcts[i].textContent = p + '%'; });
    renderer.render(scene, camera);
    sync();
  }
  function sync() {
    if (!disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  sync();

  return {
    dispose() {
      disposed = true; cancelAnimationFrame(raf); stop();
      io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', sync);
      // the landmarker holds the WASM heap and its own GL context, so it goes with the view
      try { landmarker?.close(); } catch (e) {}
      landmarker = null;
      renderer.dispose(); renderer.forceContextLoss();
      root.remove();
    },
  };
}

// The main page's entry: a modal dialog around the demo. Closing it stops the camera.
export async function openHandDialog() {
  loadCSS();
  const en = document.documentElement.dataset.lang === 'en';
  const dlg = document.createElement('dialog');
  dlg.className = 'mh-dlg';
  dlg.setAttribute('aria-label', en ? 'MIONEX hand demo' : 'เดโมมือ MIONEX');
  dlg.innerHTML = `<form method="dialog"><button type="submit" class="mh-x" aria-label="${en ? 'Close' : 'ปิด'}">×</button></form>`;
  document.body.append(dlg);
  dlg.showModal();
  const app = await mountHand(dlg);
  dlg.addEventListener('close', () => { app.dispose(); dlg.remove(); }, { once: true });
}
