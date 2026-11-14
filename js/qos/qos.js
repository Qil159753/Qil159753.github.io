// qOS: Q's hidden desktop. delight.js imports this only after the visitor types `sudo` (or taps the
// Q mark five times), so the page itself carries none of it. Boots like the Teensy 4.0 in the ABU
// controller, then drops into a copper desktop with a terminal and three apps.
import { sfx } from './sfx.js';
import { mountTerm } from './term.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'off';
const narrow = () => innerWidth <= 760;
let dlg = null;

const ICON = {
  term: '<path d="M4 6h24v20H4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12l4 3-4 3M14 19h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  robot3d: '<path d="M3 13l5-6h16l5 6v8l-5 5H8l-5-5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="16" r="2.2" fill="currentColor"/><circle cx="22" cy="16" r="2.2" fill="currentColor"/><path d="M14 11h4v4h-4z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  drive: '<circle cx="16" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="18" r="2.6" fill="currentColor"/><path d="M16 18L27 8M16 18l-9-9" stroke="currentColor" stroke-width="1.2" opacity=".7"/><path d="M5 5h3v3H5zM25 26h3v3h-3zM24 4h3v3h-3z" fill="currentColor" opacity=".55"/>',
  lab: '<rect x="3" y="6" width="26" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 18c2 0 2-8 4-8s2 8 4 8 2-8 4-8 2 8 4 8 2-4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 27h16" stroke="currentColor" stroke-width="1.6"/>',
  doc: '<path d="M8 3h11l6 6v20H8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 3v6h6M12 15h9M12 19h9M12 23h6" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  music: '<path d="M12 23V7l14-3v16" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="23" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="23" cy="20" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  pad: '<path d="M6 11h20a4 4 0 014 4l-1 7a3 3 0 01-5 2l-3-3H11l-3 3a3 3 0 01-5-2l-1-7a4 4 0 014-4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 14v5M6.5 16.5h5" stroke="currentColor" stroke-width="1.6"/><circle cx="22" cy="15" r="1.3" fill="currentColor"/><circle cx="25" cy="18" r="1.3" fill="currentColor"/>',
  mail: '<rect x="4" y="7" width="24" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 9l12 9 12-9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  sound: '<path d="M3 9h3l4-4v14l-4-4H3z" fill="currentColor"/><path d="M13 7a5 5 0 010 6M15.5 4.5a8.5 8.5 0 010 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  mute: '<path d="M3 9h3l4-4v14l-4-4H3z" fill="currentColor"/><path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  power: '<path d="M10 3v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 6a6.5 6.5 0 108 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  min: '<path d="M2 6h8" stroke="currentColor" stroke-width="1.5"/>',
  max: '<rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  x: '<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5"/>',
};
const svg = (name, vb = 32) => `<svg viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${ICON[name]}</svg>`;

const APPS = {
  term: { title: 'qsh', sub: '~', w: 720, h: 460 },
  robot3d: { title: 'robot3d', sub: 'controller_v7 · pcb', w: 1060, h: 680 },
  drive: { title: 'drive', sub: 'batly_r1 · slam', w: 1100, h: 700 },
  lab: { title: 'lab', sub: 'bench', w: 1020, h: 660 },
};

export function boot() {
  if (dlg) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./qos.css', import.meta.url).href;
  document.head.append(link);

  dlg = document.createElement('dialog');
  dlg.id = 'qos';
  dlg.setAttribute('aria-label', 'qOS');
  document.body.append(dlg);
  const prevOverflow = root.style.overflow;
  root.style.overflow = 'hidden';
  new Promise(r => { link.onload = r; link.onerror = r; setTimeout(r, 1500); }).then(() => { dlg.showModal(); start(); });
  // Esc belongs to the apps and the shell; leaving is `exit` or the power button
  dlg.addEventListener('cancel', e => e.preventDefault());

  const lang = () => (root.dataset.lang === 'en' ? 'en' : 'th');
  const wins = new Map();
  let z = 20, layer, tasks, fpsEl, clockEl, soundBtn, rafFps = 0, clockIv = 0, term = null, bootTimer = 0;

  // ---------------------------------------------------------------- boot screen
  function start() {
    const crt = el('div', 'q-crt'), pre = el('pre', 'q-boot'), skip = el('button', 'q-skip');
    skip.type = 'button'; skip.textContent = lang() === 'th' ? 'กดปุ่มใดก็ได้เพื่อข้าม' : 'press any key to skip';
    crt.append(pre, skip);
    dlg.append(crt);
    const L = [
      ['qBOOT 1.0  ·  HalfKay-compatible loader', 'ok', 120],
      ['(c) 2026 Apipath Santasnachok', 'dim', 160],
      ['', '', 60],
      ['CPU    NXP i.MX RT1062, ARM Cortex-M7', '', 70],
      ['CLK    ARM_PLL 1200 MHz /2 → 600 MHz ........ ', '', 90, 'OK'],
      ['FLASH  1984 KB QSPI ........................ ', '', 90, 'OK'],
      ['RAM    512 KB ITCM/DTCM + 512 KB OCRAM ..... ', '', 90, 'OK'],
      ['', 'mem', 0],
      ['GPIO   15 inputs INPUT_PULLUP, 4 analog axes  ', '', 80, 'OK'],
      ['UART1  115200 8N1 → XBee S2 (API mode) ..... ', '', 110, 'LINK'],
      ['CRC8   poly 0x31 init 0x00 self-test ....... ', '', 90, 'PASS'],
      ['WDT    1500 ms failsafe armed .............. ', '', 90, 'OK'],
      ['', '', 60],
      ['sudo: authenticating guest ... permission granted.', 'ok', 220],
      ['loading qOS ', '', 0, 'dots'],
    ];
    let i = 0, done = false;
    const cur = el('span', 'cur');
    const add = (t, cls) => { const s = el('span', cls); s.textContent = t; pre.insertBefore(s, cur); return s; };
    pre.append(cur);
    function step() {
      if (done) return;
      if (i >= L.length) { bootTimer = setTimeout(finish, 280); return; }
      const [t, cls, wait, tail] = L[i++];
      if (cls === 'mem') {
        add('MEMTEST [', '');
        const bar = add('', 'ok'), end = add('] ', '');
        let k = 0;
        const tick = () => {
          if (done) return;
          bar.textContent = '#'.repeat(k) + ' '.repeat(24 - k);
          if (k++ < 24) { bootTimer = setTimeout(tick, 18); if (k % 3 === 0) sfx.click(); }
          else { end.textContent = '] 1024 KB '; add('OK', 'ok'); add('\n', ''); step(); }
        };
        tick();
        return;
      }
      add(t, cls);
      if (tail === 'dots') {
        let k = 0;
        const dot = () => { if (done) return; add('.', ''); if (++k < 6) bootTimer = setTimeout(dot, 70); else step(); };
        dot();
        return;
      }
      if (tail) add(tail, 'ok');
      add('\n', '');
      bootTimer = setTimeout(step, wait);
    }
    function finish() {
      if (done) return;
      done = true; clearTimeout(bootTimer);
      removeEventListener('keydown', skipper, true); crt.removeEventListener('pointerdown', skipper);
      sfx.boot();
      if (reduced) { crt.remove(); desktop(); return; }
      crt.classList.add('off');
      setTimeout(() => { crt.remove(); desktop(); }, 480);
    }
    const skipper = e => { if (e.type === 'keydown' && e.key === 'Tab') return; e.preventDefault(); finish(); };
    addEventListener('keydown', skipper, true);
    crt.addEventListener('pointerdown', skipper);
    sfx.beep();
    if (reduced) {
      L.forEach(r => { if (r[1] !== 'mem') add(r[0] + (r[3] && r[3] !== 'dots' ? r[3] : '') + '\n', r[1]); });
      bootTimer = setTimeout(finish, 600);
    } else step();
  }

  // ---------------------------------------------------------------- desktop
  function desktop() {
    const desk = el('div', 'q-desk');
    const bar = el('header', 'q-bar');
    const brand = el('span', 'q-brand'); brand.textContent = 'qOS';
    tasks = el('nav', 'q-tasks'); tasks.setAttribute('aria-label', 'windows');
    const meta = el('div', 'q-meta');
    fpsEl = el('span', 'q-fps'); clockEl = el('span');
    soundBtn = iconBtn(sfx.on ? 'sound' : 'mute', lang() === 'th' ? 'เสียง' : 'Sound', () => setSound(!sfx.on));
    soundBtn.setAttribute('aria-pressed', String(sfx.on));
    const off = iconBtn('power', lang() === 'th' ? 'ออกจาก qOS' : 'Leave qOS', exit);
    meta.append(fpsEl, clockEl, soundBtn, off);
    bar.append(brand, tasks, meta);

    const icons = el('div', 'q-icons');
    const shortcut = (icon, label, fn) => {
      const b = el('button', 'q-icon'); b.type = 'button';
      b.innerHTML = svg(icon);
      const s = el('span'); s.textContent = label; b.append(s);
      b.addEventListener('click', () => { sfx.click(); fn(); });
      icons.append(b);
    };
    shortcut('term', 'terminal', () => openApp('term'));
    shortcut('robot3d', 'robot3d', () => openApp('robot3d'));
    shortcut('drive', 'drive', () => openApp('drive'));
    shortcut('lab', 'lab', () => openApp('lab'));
    shortcut('doc', 'about.md', () => termRun('about'));
    shortcut('music', 'music.md', () => termRun('music'));
    shortcut('pad', 'games.md', () => termRun('games'));
    shortcut('mail', 'contact', () => termRun('contact'));

    const mono = el('div', 'q-mono-q'); mono.textContent = 'qOS'; mono.setAttribute('aria-hidden', 'true');
    layer = el('div', 'q-wins');
    desk.append(bar, mono, icons, layer);
    dlg.append(desk);

    const tickClock = () => {
      clockEl.textContent = 'BKK ' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    };
    tickClock(); clockIv = setInterval(tickClock, 15000);
    clockEl.title = lang() === 'th' ? 'เวลาที่ไทย ที่คิวอยู่' : "Q's local time in Thailand";
    let frames = 0, last = performance.now();
    const fps = now => {
      frames++;
      if (now - last > 1000) { fpsEl.textContent = Math.round(frames * 1000 / (now - last)) + ' fps'; frames = 0; last = now; }
      rafFps = requestAnimationFrame(fps);
    };
    rafFps = requestAnimationFrame(fps);

    openApp('term');
    const th = lang() === 'th';
    term.line(['[sudo] password for guest: ••••••••', 'c-mut']);
    term.line(['permission granted. ', 'c-ok'], th ? 'ยินดีต้อนรับสู่ qOS ห้องเล่นลับของคิว' : "welcome to qOS, Q's hidden playground.");
    term.line(th ? 'ลองพิมพ์ ' : 'try ', term.run('help'), ', ', term.run('neofetch'), th ? ' หรือเปิดแอป ' : ' or open an app: ', term.run('robot3d'), '  ', term.run('drive'), '  ', term.run('lab'));
    term.line();
  }

  // ---------------------------------------------------------------- windows
  function openApp(name, arg) {
    const spec = APPS[name];
    if (!spec || !layer) return;
    if (wins.has(name)) { const w = wins.get(name); focus(w); if (arg) w.app?.arg?.(arg); return; }
    sfx.open();
    const w = { name, el: el('section', 'q-win'), app: null };
    w.el.setAttribute('aria-label', spec.title);
    const tb = el('div', 'q-tb');
    const title = el('b'); title.append(spec.title + '  '); const sub = el('i'); sub.textContent = spec.sub; title.append(sub);
    const bmin = winBtn('min', 'Minimise'), bmax = winBtn('max', 'Maximise'), bx = winBtn('x', 'Close');
    bmax.classList.add('mx'); bx.classList.add('x');
    tb.append(title, bmin, bmax, bx);
    const body = el('div', 'q-body'), grip = el('div', 'q-grip');
    w.el.append(tb, body, grip);

    // centred in the area right of the icons, cascading a little per open window
    const W = dlg.clientWidth, H = dlg.clientHeight - 34;
    const ww = Math.min(spec.w, W - 130), hh = Math.min(spec.h, H - 30);
    const k = wins.size;
    const x = Math.max(110, Math.min(W - ww - 12, 110 + (W - 110 - ww) / 2 + k * 28));
    const y = Math.max(10, Math.min(H - hh - 10, (H - hh) / 2 + k * 24));
    Object.assign(w.el.style, { left: x + 'px', top: y + 'px', width: ww + 'px', height: hh + 'px' });
    layer.append(w.el);
    wins.set(name, w);

    const task = el('button'); task.type = 'button'; task.textContent = spec.title;
    task.addEventListener('click', () => focus(w));
    tasks.append(task); w.task = task;

    w.el.addEventListener('pointerdown', () => { if (!w.el.classList.contains('focus')) focus(w); }, true);
    bx.addEventListener('click', () => closeWin(w));
    bmin.addEventListener('click', () => { w.el.hidden = true; w.el.classList.remove('focus'); task.setAttribute('aria-current', 'false'); focusTop(); });
    const toggleMax = () => { w.el.classList.toggle('max'); };
    bmax.addEventListener('click', toggleMax);
    tb.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleMax(); });
    drag(tb, (dx, dy, o) => {
      if (w.el.classList.contains('max') || narrow()) return;
      w.el.style.left = Math.max(80 - o.w, Math.min(dlg.clientWidth - 80, o.x + dx)) + 'px';
      w.el.style.top = Math.max(0, Math.min(dlg.clientHeight - 70, o.y + dy)) + 'px';
    }, w.el);
    drag(grip, (dx, dy, o) => {
      w.el.style.width = Math.max(320, o.w + dx) + 'px';
      w.el.style.height = Math.max(220, o.h + dy) + 'px';
    }, w.el);
    focus(w);

    if (name === 'term') {
      term = mountTerm(body, ctx);
      w.app = term;
      term.focus();
      return;
    }
    const load = el('div', 'q-load'); load.textContent = 'loading ' + name + '…'; load.append(el('i'));
    body.append(load);
    w.progress = p => load.style.setProperty('--p', Math.round(p * 100) + '%');
    import(`./${name}.js`).then(m => m.mount(body, { ...ctx, progress: w.progress }, arg)).then(app => {
      load.remove();
      if (!wins.has(name)) { app?.dispose?.(); return; }
      w.app = app;
      if (w.el.classList.contains('focus')) app?.focus?.();
    }).catch(err => {
      load.textContent = 'failed to start ' + name + ': ' + err.message;
      console.error(err);
    });
  }

  function focus(w) {
    for (const o of wins.values()) { o.el.classList.toggle('focus', o === w); o.task.setAttribute('aria-current', String(o === w)); }
    w.el.hidden = false;
    w.el.style.zIndex = ++z;
    w.app?.focus?.();
  }
  function focusTop() {
    let top = null;
    for (const o of wins.values()) if (!o.el.hidden && (!top || +o.el.style.zIndex > +top.el.style.zIndex)) top = o;
    if (top) focus(top);
  }
  function closeWin(w) {
    sfx.close();
    try { w.app?.dispose?.(); } catch (e) { console.error(e); }
    wins.delete(w.name);
    w.task.remove();
    if (w.name === 'term') term = null;
    if (reduced) w.el.remove();
    else { w.el.classList.add('closing'); setTimeout(() => w.el.remove(), 200); }
    focusTop();
  }

  function termRun(cmd) {
    if (!term) openApp('term'); else focus(wins.get('term'));
    term.exec(cmd);
  }

  function setSound(v) {
    sfx.set(v);
    if (soundBtn) { soundBtn.innerHTML = svg(v ? 'sound' : 'mute', 20); soundBtn.setAttribute('aria-pressed', String(v)); }
  }
  function setLang(v) {
    if (lang() !== v) document.getElementById('lang')?.click();
  }

  function teardown() {
    clearTimeout(bootTimer);
    for (const w of wins.values()) { try { w.app?.dispose?.(); } catch (e) {} }
    wins.clear();
    cancelAnimationFrame(rafFps); clearInterval(clockIv);
    sfx.stop();
    term = null; layer = null;
  }
  function exit() {
    teardown();
    dlg.close(); dlg.remove(); dlg = null; link.remove();
    root.style.overflow = prevOverflow;
  }
  function reboot() {
    teardown();
    dlg.replaceChildren();
    start();
  }

  const ctx = {
    sfx, lang, setLang, setSound, openApp, exit, reboot,
    windows: () => [...wins.values()].map(w => APPS[w.name].title + '  ' + APPS[w.name].sub),
    termLine: (...a) => term?.line(...a),
  };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function iconBtn(icon, label, fn) {
  const b = el('button', 'q-iconbtn'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
  b.innerHTML = svg(icon, 20);
  b.addEventListener('click', fn);
  return b;
}
function winBtn(icon, label) {
  const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', label);
  b.innerHTML = svg(icon, 12);
  return b;
}
// pointer drag: move(dx, dy, origin) with the target's box at pointerdown
function drag(handle, move, target) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const o = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight }, sx = e.clientX, sy = e.clientY;
    handle.setPointerCapture(e.pointerId);
    const mv = ev => move(ev.clientX - sx, ev.clientY - sy, o);
    const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}
