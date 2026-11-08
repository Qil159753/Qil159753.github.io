/* Journey story: five chapters above the timeline. On its own this module only draws the parts
   that are generated (540 ELP4 dots, the BATLY room grid and route), so phones, short screens and
   reduced motion get a plain stack of finished pictures. initStory() is called by the GSAP loader
   in index.html: it pins the stage and scrubs one timeline through every chapter. Chapter 5 is the
   real LiDAR sim; js/journey-lidar.js exposes root.lidar so scroll can drive it, then free() hands
   it back to the viewer. */
const NS = 'http://www.w3.org/2000/svg';
const story = document.getElementById('story');
const $ = (sel, root = story) => root.querySelector(sel);
const $$ = (sel, root = story) => [...root.querySelectorAll(sel)];
const key = (root, k) => root.querySelector(`[data-k="${k}"]`);
function svg(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const a in attrs) n.setAttribute(a, attrs[a]);
  return parent.appendChild(n);
}

// ---- chapter 2: one dot per ELP4 applicant; the nine picks are spread out on purpose
const pitch = $('#st-pitch');
const DOT = i => [97 + (i % 30) * 14, 90 + ((i / 30) | 0) * 14];
const dots = [];
for (let i = 0; i < 540; i++) { const [x, y] = DOT(i); dots.push(svg('circle', { class: 'dot', cx: x, cy: y, r: 4 }, key(pitch, 'dots'))); }
const PICKS = [33, 97, 151, 208, 262, 319, 377, 433, 488];
const picks = PICKS.map(i => dots[i]), rest = dots.filter((_, i) => !PICKS.includes(i));
picks.forEach(d => d.classList.add('pick'));
// Static picture: the nine have already left for Korea.
picks.forEach(d => { d.setAttribute('cx', 164); d.setAttribute('cy', 346); });
rest.forEach(d => { d.style.opacity = 0; });
key(pitch, 'count').textContent = '9 / 540';

// ---- chapter 4: a 30 × 20 occupancy grid of the mock factory, 14 px cells from (90, 80)
const nav = $('#st-nav');
const COLS = 30, ROWS = 20, CS = 14, OX = 90, OY = 80;
const BLOCKS = [[8, 8, 21, 11], [13, 2, 16, 3], [3, 14, 6, 17], [23, 14, 26, 17]]; // c0 r0 c1 r1
const START = [4, 4];
const cells = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const wall = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
  const obst = BLOCKS.some(([c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1);
  const n = svg('rect', { class: 'cell' + (wall ? ' w' : obst ? ' o' : ''), x: OX + c * CS + 1, y: OY + r * CS + 1, width: CS - 2, height: CS - 2, rx: 2 }, key(nav, 'cells'));
  cells.push({ n, d: Math.hypot(c - START[0], r - START[1]) });
}
const D_MAX = Math.max(...cells.map(c => c.d));
const WAY = [[4, 4], [25, 4], [25, 6], [23, 12], [15, 16], [7, 13], [5, 9], [4, 4]]; // A → B → C → A
const centre = ([c, r]) => [OX + c * CS + 7, OY + r * CS + 7];
const route = key(nav, 'route');
route.setAttribute('d', 'M' + WAY.map(p => centre(p).join(' ')).join('L'));
const robot = key(nav, 'robot');
key(nav, 'loop').textContent = 'LOOP 2 / 2';

// Put el at fraction u (wrapping) along path; groups also turn to face along it.
function place(el, path, u) {
  const len = path.getTotalLength(), s = (((u % 1) + 1) % 1) * len, p = path.getPointAtLength(s);
  if (el.tagName === 'circle') { el.setAttribute('cx', p.x); el.setAttribute('cy', p.y); return; }
  const q = path.getPointAtLength(Math.min(len, s + 1));
  el.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI})`);
}

// ---- the pinned, scrubbed version
export function initStory(mq) {
  const { gsap, ScrollTrigger } = window;
  const stage = $('.st-stage');
  const chs = $$('.st-ch');
  const lid = $('[data-j3d="lidar"]');
  const rail = $$('.st-rail a');
  const chips = $$('.st-skills li').map(li => ({ li, ch: li.dataset.ch.split(' ').map(Number) }));
  const skills = $('.st-skills');

  gsap.matchMedia().add(mq, () => {
    story.classList.add('on');
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    const marks = [];       // [time, chapter, beat]: what the copy column and rail show from then on
    const mark = (t, ch, b = -1) => marks.push([t, ch, b]);
    const draw = (els, at, dur, stagger = 0) => tl.fromTo(els, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, stagger }, at);
    const swap = (from, to, at) => tl.to(from, { autoAlpha: 0, duration: 0.3 }, at)
      .fromTo(to, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, at + 0.15);
    function enter(i, at) {
      tl.addLabel('ch' + i, at);
      tl.to(chs[i - 1], { autoAlpha: 0, y: -24, duration: 0.4 }, at)
        .fromTo(chs[i], { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, at + 0.2);
      mark(at + 0.2, i, 0);
    }
    gsap.set(chs, { autoAlpha: 0 });
    gsap.set(chs[0], { autoAlpha: 1 });
    gsap.set($$('.st-vis .beat:not([data-b="0"])'), { autoAlpha: 0 });

    // 0 · prologue
    tl.addLabel('ch0', 0); mark(0, 0);
    const intro = chs[0];
    draw(key(intro, 'line'), 0.1, 1.4);
    tl.from($$('.node', intro), { scale: 0, transformOrigin: '50% 50%', autoAlpha: 0, duration: 0.3, stagger: 0.25, ease: 'back.out(2)' }, 0.2);

    // 1 · build: digger arm, the truck exploded into its 11 parts, Nano board traces
    let T = 2; enter(1, T);
    const build = chs[1], [bd, bt, bp] = $$('.beat', build);
    draw($$('.ln', bd), T + 0.2, 0.8, 0.04);
    draw($$('.water', bd), T + 0.7, 0.6, 0.1);
    // Nested groups rotate about their joint in local coordinates, so the arm moves as a chain.
    const arm = { b: 0, s: 0, k: 0 };
    const setArm = () => {
      key(build, 'boom').setAttribute('transform', `rotate(${arm.b} 284 236)`);
      key(build, 'stick').setAttribute('transform', `rotate(${arm.s} 404 150)`);
      key(build, 'bucket').setAttribute('transform', `rotate(${arm.k} 470 262)`);
    };
    tl.to(arm, { b: -14, s: 24, k: 38, duration: 0.9, ease: 'sine.inOut', onUpdate: setArm }, T + 1.1)
      .to(arm, { b: 0, s: 0, k: 0, duration: 0.6, ease: 'sine.inOut', onUpdate: setArm }, T + 2.0);
    mark(T + 2.4, 1, 1); swap(bd, bt, T + 2.4);
    draw($$('.ln', bt), T + 2.6, 0.6, 0.02);
    const ex = { e: 0 }, parts = $$('.part', bt);
    tl.to(ex, { e: 1, duration: 0.9, ease: 'power2.inOut', onUpdate: () => parts.forEach(p => p.setAttribute('transform', `translate(${p.dataset.dx * ex.e} ${p.dataset.dy * ex.e})`)) }, T + 3.3);
    mark(T + 4.4, 1, 2); swap(bt, bp, T + 4.4);
    draw($$('.ln', bp), T + 4.6, 0.5, 0.04);
    draw($$('.trace', bp), T + 5.0, 0.4, 0.06);

    // 2 · on stage: podium (3rd, then 1st), 540 → 9, Chonburi → Suwon
    T = 8.4; enter(2, T);
    const pch = chs[2], [pb0, pb1] = $$('.beat', pch);
    tl.from($$('.pod rect', pch), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.12, ease: 'power2.out' }, T + 0.3);
    gsap.set(key(pch, 'pod1'), { autoAlpha: 0 });
    mark(T + 1.6, 2, 1);
    tl.to(key(pch, 'spot'), { x: -100, duration: 0.5, ease: 'power2.inOut' }, T + 1.6)
      .to(key(pch, 'pod3'), { autoAlpha: 0, duration: 0.2 }, T + 1.6)
      .to(key(pch, 'pod1'), { autoAlpha: 1, duration: 0.2 }, T + 1.8);
    mark(T + 3, 2, 2); swap(pb0, pb1, T + 3);
    const arc = key(pch, 'arc'), plane = key(pch, 'plane'), count = key(pch, 'count');
    const after = [...$$('.city', pb1), key(pch, 'arcdim'), key(pch, 'labels'), plane];
    gsap.set(after, { autoAlpha: 0 });
    gsap.set(dots, { attr: { cx: i => DOT(i)[0], cy: i => DOT(i)[1] }, opacity: 0 });
    const n = { v: 540 };
    tl.to(dots, { opacity: 1, duration: 0.4, stagger: { amount: 0.4, from: 'random' } }, T + 3.2)
      .to(rest, { opacity: 0.12, duration: 0.5 }, T + 4)
      .to(n, { v: 9, duration: 0.5, ease: 'power2.in', onUpdate: () => { count.textContent = Math.round(n.v) + ' / 540'; } }, T + 4)
      .to(picks, { attr: { cx: 164, cy: 346 }, duration: 0.6, ease: 'power2.inOut', stagger: 0.03 }, T + 4.6)
      .to(rest, { opacity: 0, duration: 0.4 }, T + 4.8)
      .to(after, { autoAlpha: (i, e) => e.classList.contains('faint') ? 0.5 : 1, duration: 0.3 }, T + 4.9);
    draw(arc, T + 5.2, 0.8);
    const fl = { u: 0 };
    tl.to(fl, { u: 1, duration: 0.8, onUpdate: () => place(plane, arc, Math.min(fl.u, 0.9999)) }, T + 5.2);

    // 3 · compete: Robotrace learns the course, then races it; ABU radio frame → mecanum strafe
    T = 14.6; enter(3, T);
    const cch = chs[3], [cb0, cb1] = $$('.beat', cch);
    const lap1 = $('.lap1', cch), lap2 = $('.lap2', cch), tracer = key(cch, 'tracer');
    gsap.set(key(cch, 'lap2'), { autoAlpha: 0 });
    const run = { u: 0 };
    tl.fromTo(lap1, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6 }, T + 0.3)
      .to(run, { u: 1, duration: 1.6, onUpdate: () => place(tracer, lap1, run.u) }, T + 0.3)
      .to(key(cch, 'lap1'), { autoAlpha: 0, duration: 0.2 }, T + 1.9)
      .to(key(cch, 'lap2'), { autoAlpha: 1, duration: 0.2 }, T + 2.0)
      .fromTo(lap2, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8 }, T + 2.0)
      .to(run, { u: 2, duration: 0.8, onUpdate: () => place(tracer, lap1, run.u) }, T + 2.0);
    mark(T + 3.1, 3, 1); swap(cb0, cb1, T + 3.1);
    const fr = { x: 150 }, frame = key(cch, 'frame'), mec = key(cch, 'mec'), mv = { x: 420, y: 228, r: 0 };
    const setFrame = () => frame.setAttribute('transform', `translate(${fr.x} 228)`);
    const setMec = () => mec.setAttribute('transform', `translate(${mv.x} ${mv.y}) rotate(${mv.r})`);
    gsap.set(frame, { opacity: 0 });
    tl.to(fr, { x: 236, duration: 0.6, onUpdate: setFrame }, T + 3.4)
      .to(frame, { opacity: 1, duration: 0.15 }, T + 3.4)
      .to(frame, { opacity: 0, duration: 0.15 }, T + 3.85)
      .to(mv, { x: 456, y: 192, r: -12, duration: 0.8, ease: 'power2.inOut', onUpdate: setMec }, T + 4)
      .to(mv, { x: 420, y: 228, r: 0, duration: 0.6, ease: 'power2.inOut', onUpdate: setMec }, T + 4.8);

    // 4 · navigate: 30 h + 30 h, then SLAM → A → B → C twice
    T = 20; enter(4, T);
    const nch = chs[4], [nb0, nb1] = $$('.beat', nch);
    tl.from(key(nch, 'bar1'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.6, ease: 'power2.out' }, T + 0.3)
      .from(key(nch, 'bar2'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.6, ease: 'power2.out' }, T + 0.9);
    mark(T + 1.9, 4, 1); swap(nb0, nb1, T + 1.9);
    const loop = key(nch, 'loop'), slam = { r: 0 }, drive = { u: 0 };
    const reveal = () => { const r = slam.r * D_MAX; for (const c of cells) c.n.style.opacity = c.d <= r ? 1 : 0; };
    reveal();
    tl.to(slam, { r: 1, duration: 1.2, onUpdate: () => { reveal(); loop.textContent = 'SLAM'; } }, T + 2.1);
    draw(route, T + 3.4, 1.4);
    tl.to(drive, { u: 2, duration: 2.4, onUpdate: () => {
      place(robot, route, Math.min(drive.u, 1.9999));
      loop.textContent = `LOOP ${drive.u < 1 ? 1 : 2} / 2`;
    } }, T + 3.4);
    place(robot, route, 0); loop.textContent = 'SLAM';

    // 5 · LiDAR: scroll drives half a lap, then the camera rises; free() at the end
    T = 26.2; enter(5, T);
    const L = { p: 0, k: 0 };
    tl.to(L, { p: 0.5, duration: 3.6 }, T + 0.4).to(L, { k: 1, duration: 1.4, ease: 'sine.inOut' }, T + 2.6);
    const T_FREE = T + 4.1;

    // ★ · epilogue: the copy changes; the LiDAR stays on screen and becomes draggable
    T = T_FREE + 0.1;
    tl.addLabel('ch6', T);
    tl.to($('.st-copy', chs[5]), { autoAlpha: 0, y: -24, duration: 0.4 }, T)
      .fromTo(chs[6], { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, T + 0.2);
    mark(T + 0.2, 6);
    tl.to({}, { duration: 1.4 }, T + 0.6);    // a beat of stillness before the stage unpins
    marks.sort((a, b) => a[0] - b[0]);

    let cur = '', ctl = null;
    function sync() {
      const t = tl.time();
      let m = marks[0];
      for (const x of marks) if (x[0] <= t + 1e-6) m = x;
      const [, ch, beat] = m, id = ch + ':' + beat;
      if (id !== cur) {
        cur = id;
        rail.forEach((a, i) => { a.classList.toggle('on', i === ch); a.classList.toggle('done', i < ch); a.toggleAttribute('aria-current', i === ch); });
        $$('.st-beats li', chs[ch]).forEach((li, i) => li.classList.toggle('on', i === beat));
        $$('.pod', pitch).forEach(p => p.classList.toggle('on', ch === 2 && p.dataset.p === (beat === 0 ? '3' : '1')));
        for (const c of chips) {
          c.li.classList.toggle('on', ch < 6 && c.ch.includes(ch));
          c.li.classList.toggle('seen', ch === 6 || c.ch.some(x => x < ch));
        }
        skills.classList.toggle('sum', ch === 6);
      }
      ctl = ctl || lid.lidar;
      if (ctl) t >= T_FREE ? ctl.free() : ctl.scrub(L.p, L.k);
    }
    tl.eventCallback('onUpdate', sync);
    lid.addEventListener('lidar-ready', sync);

    const st = ScrollTrigger.create({
      trigger: stage, pin: true, start: 'top top', animation: tl, scrub: 0.6,
      end: () => '+=' + Math.round(innerHeight * 0.3 * tl.duration()),
      invalidateOnRefresh: true
    });
    sync();
    // Measured while a reload is still restoring the scroll position, start can land far off; measure again.
    requestAnimationFrame(() => ScrollTrigger.refresh());
    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());

    // In-page links to a chapter scroll to its spot in the pinned run instead of the stage top.
    const go = e => {
      const a = e.target.closest('a[href^="#st-"]');
      if (!a) return;
      const i = chs.findIndex(c => '#' + c.id === a.getAttribute('href'));
      if (i < 0) return;
      e.preventDefault();
      scrollTo({ top: st.labelToScroll('ch' + i) + 2, behavior: 'smooth' });
    };
    document.addEventListener('click', go);
    // Layout above the story can still move (fonts, the live code panels); keep the pin in step.
    let rt = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); });
    ro.observe(document.querySelector('main') || document.body);

    return () => {
      document.removeEventListener('click', go);
      lid.removeEventListener('lidar-ready', sync);
      ro.disconnect(); clearTimeout(rt);
      story.classList.remove('on');
      if (ctl) ctl.free();
      // Back to the finished static pictures (gsap.set and tweens are reverted by matchMedia).
      for (const c of cells) c.n.style.opacity = '';
      [key(build, 'boom'), key(build, 'stick'), key(build, 'bucket'), ...parts].forEach(e => e.removeAttribute('transform'));
      frame.setAttribute('transform', 'translate(196 228)'); mec.setAttribute('transform', 'translate(420 228)');
      tracer.setAttribute('transform', 'translate(140 300)');
      robot.setAttribute('cx', centre(START)[0]); robot.setAttribute('cy', centre(START)[1]);
      plane.setAttribute('cx', 528); plane.setAttribute('cy', 107);
      count.textContent = '9 / 540'; loop.textContent = 'LOOP 2 / 2';
    };
  });
}
