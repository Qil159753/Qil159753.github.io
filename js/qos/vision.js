// vision: the YOLOv8n detector from Q's Test_YOLO/detect.py, running in the browser on the visitor's
// webcam. The same yolov8n.pt (Ultralytics' COCO model, not one Q trained) exported to ONNX at 320 px
// and int8-quantised (3.4 MB), run by onnxruntime-web on WebAssembly. Frames never leave the page.
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODEL = new URL('../../models/yolov8n-int8.onnx', import.meta.url).href;
const SIZE = 320, CONF = 0.4, IOU = 0.45;
const COCO = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'];

const CSS = `
.vz { position:absolute; inset:0; display:grid; grid-template-columns: minmax(0,1fr) 280px; background: var(--q-panel); font-size: 12.5px; }
.vz-stage { position:relative; min-height:0; background:#05070a; display:grid; place-items:center; overflow:hidden; }
.vz-stage video, .vz-stage canvas { position:absolute; inset:0; width:100%; height:100%; object-fit: contain; }
.vz-stage video { transform: scaleX(-1); }
.vz-start { position:relative; z-index:1; max-width: 26rem; padding: 20px; text-align:center; display:grid; gap:12px; justify-items:center; }
.vz-start[hidden] { display:none; }
.vz-start p { margin:0; color: var(--q-muted); line-height:1.55; }
.vz-btn { padding: 10px 18px; border-radius: 999px; background: var(--q-cu); color: #1b1009; font-weight: 600; }
.vz-btn[disabled] { opacity:.5; cursor: default; }
.vz-btn.ghost { background: transparent; color: var(--q-text); border: 1px solid rgba(255,255,255,.2); font-weight:400; }
.vz-side { border-left: 1px solid var(--q-line); padding: 12px; overflow-y:auto; display:flex; flex-direction:column; gap: 12px; }
.vz-side > * { flex:none; }
.vz-side h3 { margin:0; font: 600 11px var(--q-mono); color: var(--q-muted); letter-spacing: .08em; text-transform: uppercase; }
.vz-stat { display:grid; grid-template-columns: 1fr 1fr; gap:6px; }
.vz-stat span { padding: 6px 8px; border-radius: 8px; background:#0a0d11; border:1px solid var(--q-line); display:grid; }
.vz-stat b { color: var(--q-ink); font-weight:500; font-size: 15px; }
.vz-stat small { color: var(--q-muted); font-size: 10.5px; }
.vz-list { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.vz-list li { display:flex; justify-content:space-between; padding: 4px 8px; border-radius: 6px; background: var(--q-cu-soft); color: var(--q-cu-hi); }
.vz-list li.none { background:none; color: var(--q-muted); padding-left:0; }
.vz-note { margin:0; color: var(--q-muted); line-height:1.55; }
.vz-note b { color: var(--q-text); font-weight:500; }
.vz-side label { display:grid; gap:4px; color: var(--q-muted); }
.vz-side input[type=range] { accent-color: var(--q-cu); }
@media (max-width: 760px) {
  .vz { display:flex; flex-direction:column; overflow-y:auto; }
  .vz > * { flex:none; }
  .vz-stage { height: 75vw; }
  .vz-side { border-left:0; border-top:1px solid var(--q-line); }
}`;

export async function mount(body, ctx) {
  const th = ctx.lang() === 'th', t = (a, b) => (th ? a : b);
  const style = el('style'); style.textContent = CSS;
  const root = el('div', 'q-app vz');
  root.innerHTML = `
    <div class="vz-stage">
      <video playsinline muted hidden></video><canvas hidden></canvas>
      <div class="vz-start">
        <button type="button" class="vz-btn vz-on">${t('เปิดกล้อง', 'Turn on camera')}</button>
        <p>${t('ภาพจากกล้องประมวลผลในเบราว์เซอร์ของคุณเท่านั้น ไม่ถูกส่งหรือบันทึกไว้ที่ไหน ครั้งแรกจะโหลดโมเดล 3.4 MB และตัวรันโมเดลอีกราว 10 MB',
    'Your camera feed is processed in your browser and is never uploaded or saved. The first run downloads the 3.4 MB model and about 10 MB of runtime.')}</p>
        <p class="vz-status" role="status"></p>
      </div>
    </div>
    <div class="vz-side">
      <h3>${t('สิ่งที่โมเดลเห็น', 'detections')}</h3>
      <div class="vz-stat"><span><b class="vz-ms">–</b><small>${t('ms ต่อเฟรม', 'ms per frame')}</small></span><span><b class="vz-fps">–</b><small>fps</small></span></div>
      <ul class="vz-list" aria-live="polite"></ul>
      <label>${t('ความมั่นใจขั้นต่ำ', 'min confidence')} <input type="range" class="vz-conf" min="0.2" max="0.8" step="0.05" value="${CONF}"></label>
      <button type="button" class="vz-btn ghost vz-off" hidden>${t('ปิดกล้อง', 'Turn off camera')}</button>
      <p class="vz-note">${t(
    'โมเดลเดียวกับที่ใช้ใน <b>detect.py</b> ของผม: <b>yolov8n.pt</b> ของ Ultralytics ที่เทรนบน COCO (80 คลาส) ผมไม่ได้เทรนเอง บน Mac ผมรันบน GPU ผ่าน mps ส่วนที่นี่ export เป็น ONNX ขนาด 320 px, quantize เป็น int8 แล้วรันด้วย onnxruntime-web บน CPU',
    'The model my <b>detect.py</b> runs: Ultralytics\' <b>yolov8n.pt</b>, trained on COCO (80 classes). I didn\'t train it. On my Mac it runs on the GPU through mps; here it is exported to ONNX at 320 px, quantised to int8 and run by onnxruntime-web on the CPU.')}</p>
      <p class="vz-note">YOLOv8 © Ultralytics, AGPL-3.0 · onnxruntime-web © Microsoft, MIT</p>
    </div>`;
  body.append(style, root);
  const $ = s => root.querySelector(s);
  const video = $('video'), cv = $('canvas'), g = cv.getContext('2d');
  const say = s => { $('.vz-status').textContent = s; };
  const idle = () => { const li = el('li', 'none'); li.textContent = t('ยังไม่เปิดกล้อง', 'camera off'); $('.vz-list').replaceChildren(li); lastList = ''; };
  let disposed = false, stream = null, session = null, sessionP = null, running = false, conf = CONF, raf = 0, lastList = '';
  idle();
  $('.vz-conf').addEventListener('input', e => { conf = +e.target.value; });

  // one load at a time; a failed load can be retried
  function getSession() {
    sessionP ||= (async () => {
      const ort = await import(ORT + 'ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = 1;              // threads need cross-origin isolation, which GitHub Pages can't set
      const r = await fetch(MODEL);
      if (!r.ok) throw new Error('model ' + r.status);
      const s = await ort.InferenceSession.create(await r.arrayBuffer(), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      if (disposed) { s.release?.(); throw new Error('disposed'); }
      return (session = { ort, s });
    })();
    sessionP.catch(() => { sessionP = null; });
    return sessionP;
  }

  async function start() {
    $('.vz-on').disabled = true;
    if (!navigator.mediaDevices?.getUserMedia) { say(t('ไม่เจอกล้องบนเครื่องนี้', 'No camera found on this device.')); $('.vz-on').disabled = false; return; }
    say(t('รอสิทธิ์ใช้กล้อง…', 'Waiting for camera permission…'));
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
    catch (e) {
      say(e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? t('ไม่เจอกล้องบนเครื่องนี้', 'No camera found on this device.') : t('เบราว์เซอร์ไม่ให้ใช้กล้อง เปิดสิทธิ์ให้เว็บนี้แล้วลองใหม่', 'The browser blocked the camera. Allow camera access for this site and try again.'));
      $('.vz-on').disabled = false; return;
    }
    if (disposed) { stopStream(); return; }
    video.srcObject = stream; await video.play().catch(() => {});
    video.hidden = cv.hidden = false; $('.vz-off').hidden = false;
    say(t('กำลังโหลดโมเดล…', 'Loading the model…'));
    try { await getSession(); }
    catch (e) { if (!disposed) { console.warn('vision', e); stop(); say(t('โหลดโมเดลไม่สำเร็จ ลองใหม่อีกครั้ง', "The model didn't load. Try again.")); } return; }
    if (disposed || !stream) return;
    $('.vz-start').hidden = true;
    running = true; loop();
  }
  function stopStream() { stream?.getTracks().forEach(tr => tr.stop()); stream = null; }
  function stop() {
    running = false; cancelAnimationFrame(raf); stopStream(); video.srcObject = null;
    video.hidden = cv.hidden = true; $('.vz-off').hidden = true; $('.vz-start').hidden = false; $('.vz-on').disabled = false;
    idle();
  }
  $('.vz-on').addEventListener('click', start);
  $('.vz-off').addEventListener('click', () => { stop(); say(''); });

  // letterbox the frame into 320×320 the way Ultralytics does (grey 114 padding), RGB, 0..1, CHW
  const pre = document.createElement('canvas'); pre.width = pre.height = SIZE;
  const pg = pre.getContext('2d', { willReadFrequently: true });
  const input = new Float32Array(3 * SIZE * SIZE);
  function prep() {
    const vw = video.videoWidth, vh = video.videoHeight, s = SIZE / Math.max(vw, vh);
    pg.fillStyle = 'rgb(114,114,114)'; pg.fillRect(0, 0, SIZE, SIZE);
    pg.drawImage(video, 0, 0, vw * s, vh * s);
    const d = pg.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE;
    for (let i = 0; i < n; i++) { input[i] = d[i * 4] / 255; input[n + i] = d[i * 4 + 1] / 255; input[2 * n + i] = d[i * 4 + 2] / 255; }
    return s;
  }
  // output [1, 84, 2100]: cx, cy, w, h, then the 80 class scores, per anchor
  function decode(out, s) {
    const N = out.length / 84, boxes = [];
    for (let i = 0; i < N; i++) {
      let best = 0, c = -1;
      for (let k = 0; k < 80; k++) { const v = out[(4 + k) * N + i]; if (v > best) { best = v; c = k; } }
      if (best < conf) continue;
      const cx = out[i], cy = out[N + i], w = out[2 * N + i], h = out[3 * N + i];
      boxes.push({ c, p: best, x: (cx - w / 2) / s, y: (cy - h / 2) / s, w: w / s, h: h / s });
    }
    boxes.sort((a, b) => b.p - a.p);
    const keep = [];
    for (const b of boxes) if (!keep.some(k => k.c === b.c && iou(k, b) > IOU)) keep.push(b);
    return keep.slice(0, 50);
  }

  let busy = false, last = -1, fpsN = 0, fpsT = performance.now();
  async function loop() {
    if (!running || disposed) return;
    raf = requestAnimationFrame(loop);
    if (busy || video.readyState < 2 || video.currentTime === last) return;
    busy = true; last = video.currentTime;
    try {
      const t0 = performance.now(), s = prep();
      const { ort, s: sess } = session;
      const res = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
      if (!running) return;
      const dets = decode(res[sess.outputNames[0]].data, s);
      $('.vz-ms').textContent = Math.round(performance.now() - t0);
      fpsN++;
      if (performance.now() - fpsT > 1000) { $('.vz-fps').textContent = fpsN; fpsN = 0; fpsT = performance.now(); }
      draw(dets); list(dets);
    } catch (e) { console.error('vision', e); stop(); say(t('ตัวตรวจจับหยุดทำงาน', 'The detector stopped.')); }
    finally { busy = false; }
  }
  function draw(dets) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    g.clearRect(0, 0, vw, vh);
    const lh = Math.max(16, vw / 30);
    g.lineWidth = Math.max(2, vw / 260); g.font = `600 ${Math.round(lh * 0.7)}px "JetBrains Mono", ui-monospace, monospace`;
    for (const d of dets) {
      const x = vw - d.x - d.w;                       // the video is mirrored like a selfie view, so are the boxes
      g.strokeStyle = '#ec9a5a'; g.strokeRect(x, d.y, d.w, d.h);
      const label = `${COCO[d.c]} ${Math.round(d.p * 100)}%`, tw = g.measureText(label).width + 10, ty = Math.max(0, d.y - lh);
      g.fillStyle = '#ec9a5a'; g.fillRect(x, ty, tw, lh);
      g.fillStyle = '#1b1009'; g.fillText(label, x + 5, ty + lh * 0.74);
    }
  }
  function list(dets) {
    const counts = {};
    for (const d of dets) counts[COCO[d.c]] = (counts[COCO[d.c]] || 0) + 1;
    const key = JSON.stringify(counts);
    if (key === lastList) return;
    lastList = key;
    const ul = $('.vz-list'); ul.replaceChildren();
    const names = Object.keys(counts);
    if (!names.length) { const li = el('li', 'none'); li.textContent = t('ยังไม่เห็นอะไร ลองถือแก้ว ขวด หรือมือถือ', 'nothing yet. Try a cup, a bottle or a phone'); ul.append(li); }
    for (const n of names) { const li = el('li'); const a = el('span'), b = el('span'); a.textContent = n; b.textContent = '×' + counts[n]; li.append(a, b); ul.append(li); }
  }

  return {
    focus() { if (!$('.vz-start').hidden) $('.vz-on').focus({ preventScroll: true }); },
    dispose() { disposed = true; stop(); session?.s.release?.(); style.remove(); },
  };
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return i / (a.w * a.h + b.w * b.h - i);
}
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
