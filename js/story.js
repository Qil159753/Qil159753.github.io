/* Journey story: five chapters above the timeline. Phones, short screens and reduced motion get a
   plain stack: each chapter's copy, a still from its Blender film and its real photos. initStory()
   is called by the GSAP loader in index.html: the stage sticks and one scrubbed timeline plays every
   chapter, drawing film frames to a canvas. Chapter 5 is the real LiDAR sim; js/journey-lidar.js
   exposes root.lidar so scroll can drive it, then free() hands it back to the viewer. */
const story = document.getElementById('story');
const $ = (sel, root = story) => root.querySelector(sel);
const $$ = (sel, root = story) => [...root.querySelectorAll(sel)];
const key = (root, k) => root.querySelector(`[data-k="${k}"]`);

// A pre-rendered Blender sequence drawn to a canvas; set(p) shows the frame at progress p, or the
// nearest one already loaded, so scrubbing works while the rest stream in.
function film(canvas) {
  const n = +canvas.dataset.n, base = canvas.dataset.film, imgs = new Array(n), ctx = canvas.getContext('2d');
  let want = 0, shown = -1, started = false;
  function draw() {
    let i = want; while (i > 0 && !imgs[i]) i--;
    const im = imgs[i];
    if (!im || i === shown || !canvas.width) return;
    shown = i;
    const W = canvas.width, H = canvas.height, k = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    ctx.fillStyle = '#07090c'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  }
  function fit() {
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * d); canvas.height = Math.round(canvas.clientHeight * d);
    shown = -1; draw();
  }
  const ro = new ResizeObserver(fit); ro.observe(canvas);
  return {
    set(p) { want = Math.max(0, Math.min(n - 1, Math.round(p * (n - 1)))); draw(); },
    load() {
      if (started) return; started = true;
      // every 8th frame first, then 4th, 2nd, the rest: the whole range is scrubbable early
      const order = [];
      for (const step of [8, 4, 2, 1]) for (let i = 0; i < n; i += step) if (!order.includes(i)) order.push(i);
      let next = 0;
      const pump = () => {
        if (next >= order.length) return;
        const i = order[next++], im = new Image();
        im.decoding = 'async';
        im.onload = () => { imgs[i] = im; if (shown < 0 || Math.abs(i - want) < Math.abs(shown - want)) { shown = -1; draw(); } pump(); };
        im.onerror = pump;
        im.src = `${base}f${String(i + 1).padStart(3, '0')}.webp`;
      };
      for (let k = 0; k < 6; k++) pump();     // six requests in flight
    },
    stop() { ro.disconnect(); }
  };
}

// ---- the sticky, scrubbed version
export function initStory(mq) {
  const { gsap, ScrollTrigger } = window;
  const chs = $$('.st-ch');
  const lid = $('[data-j3d="lidar"]');
  const rail = $$('.st-rail a');
  const chips = $$('.st-skills li').map(li => ({ li, ch: li.dataset.ch.split(' ').map(Number) }));
  const skills = $('.st-skills');

  gsap.matchMedia().add(mq, () => {
    story.classList.add('on');
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    const films = [];
    const marks = [];       // [time, chapter, beat]: what the copy column and rail show from then on
    const mark = (t, ch, b = -1) => marks.push([t, ch, b]);

    // Chapter change: the old copy lifts away and its picture pushes in; the new heading rises out of
    // a mask, its lines follow one by one, and the picture wipes in (film) or settles from a zoom.
    function enter(i, at) {
      const prev = chs[i - 1], cur = chs[i];
      tl.addLabel('ch' + i, at);
      tl.to($('.st-copy', prev), { autoAlpha: 0, y: -40, duration: 0.4, ease: 'power2.in' }, at)
        .to($('.st-vis', prev), { scale: 1.06, autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, at)
        .set(prev, { autoAlpha: 0 }, at + 0.5)
        .set(cur, { autoAlpha: 1 }, at + 0.15)
        .fromTo($('.kicker', cur), { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.3, immediateRender: false }, at + 0.2)
        // the mask has headroom so Thai tone marks above the line are never clipped
        .fromTo($('h3', cur), { clipPath: 'inset(-40% -10% 140% -10%)', y: 36 }, { clipPath: 'inset(-40% -10% -40% -10%)', y: 0, duration: 0.5, ease: 'power3.out', immediateRender: false }, at + 0.25)
        .fromTo($$('.st-beats li, .st-copy > p', cur), { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out', immediateRender: false }, at + 0.4);
      const gone = $$('.st-photos figure', prev);
      if (gone.length) tl.to(gone, { autoAlpha: 0, duration: 0.3 }, at);
      const vis = $('.st-vis', cur);
      if (vis.classList.contains('film'))
        tl.fromTo(vis, { clipPath: 'inset(0 0 0 100%)', autoAlpha: 1 }, { clipPath: 'inset(0 0 0 0%)', duration: 0.6, ease: 'power3.inOut', immediateRender: false }, at + 0.1);
      else
        tl.fromTo(vis, { scale: 0.92, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'power3.out', immediateRender: false }, at + 0.3);
      mark(at + 0.2, i, 0);
    }

    // A film chapter: the Blender frames scrub across the chapter, each beat lights its line in the
    // copy, and the real photo for that beat (figure[data-b]) slides in beside the render.
    function reel(i, T, dur, beats) {
      enter(i, T);
      const ch = chs[i], r = film($('.st-film', ch)), F = { v: 0 };
      films.push(r);
      tl.to(F, { v: 1, duration: dur - 0.4, onUpdate: () => r.set(F.v) }, T + 0.2);
      const at = [[T + 0.2, 0], ...beats];
      at.forEach(([t, b], k) => {
        if (b) mark(t, i, b);
        const fig = $(`.st-photos figure[data-b="${b}"]`, ch);
        if (!fig) return;
        const tilt = k % 2 ? -1 : 1;
        tl.fromTo(fig, { autoAlpha: 0, y: 60, rotate: 4 * tilt }, { autoAlpha: 1, y: 0, rotate: -2 * tilt, duration: 0.5, ease: 'power3.out', immediateRender: false }, t + 0.5);
        if (at[k + 1]) tl.to(fig, { autoAlpha: 0, y: -40, duration: 0.3 }, at[k + 1][0]);
      });
    }
    gsap.set(chs, { autoAlpha: 0 });
    gsap.set(chs[0], { autoAlpha: 1 });
    gsap.set($$('.st-photos figure'), { autoAlpha: 0 });

    // 0 · prologue
    tl.addLabel('ch0', 0); mark(0, 0);
    const intro = chs[0];
    tl.fromTo(key(intro, 'line'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4 }, 0.1)
      .from($$('.node', intro), { scale: 0, transformOrigin: '50% 50%', autoAlpha: 0, duration: 0.3, stagger: 0.25, ease: 'back.out(2)' }, 0.2);

    // 1-4 · the Blender films; beat times line up with the cuts inside each film
    reel(1, 2, 6.4, [[4.4, 1], [6.4, 2]]);              // digger · truck (frame 35) · Nano (frame 65)
    reel(2, 8.4, 6.2, [[10.1, 1], [11.6, 2]]);          // 3rd · 1st (frame 25) · 540 → 9 (frame 49)
    reel(3, 14.6, 5.4, [[17.5, 1]]);                    // Robotrace · ABU (frame 51)
    reel(4, 20, 6.2, [[21.9, 1]]);                      // SLAM mapping · the A → B → C loop (frame 30)

    // 5 · LiDAR: scroll drives half a lap, then the camera rises; free() at the end
    let T = 26.2; enter(5, T);
    const L = { p: 0, k: 0 };
    tl.to(L, { p: 0.5, duration: 3.6 }, T + 0.4).to(L, { k: 1, duration: 1.4, ease: 'sine.inOut' }, T + 2.6);
    const T_FREE = T + 4.1;

    // ★ · epilogue: the copy changes; the LiDAR stays on screen and becomes draggable
    T = T_FREE + 0.1;
    tl.addLabel('ch6', T);
    tl.to($('.st-copy', chs[5]), { autoAlpha: 0, y: -24, duration: 0.4 }, T)
      .fromTo(chs[6], { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, T + 0.2);
    mark(T + 0.2, 6);
    tl.to({}, { duration: 1.4 }, T + 0.6);    // a beat of stillness before the stage scrolls away
    marks.sort((a, b) => a[0] - b[0]);
    const rests = [0, ...marks.slice(1).map(m => (m[0] - 0.15) / tl.duration()), 1];

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

    // The stage is position: sticky inside .story, which is made exactly tall enough for the run;
    // ScrollTrigger only maps that scroll to the timeline (no pin to measure, nothing to drift).
    const runLen = () => Math.round(innerHeight * 0.18 * tl.duration());
    // Start and end in plain page pixels: after a mid-page reload ScrollTrigger's own 'top top'
    // measurement lands off by the restored scroll distance, this one cannot.
    const top = () => story.getBoundingClientRect().top + scrollY;
    const st = ScrollTrigger.create({
      trigger: story, start: top, end: () => top() + runLen(), animation: tl, scrub: 0.4,
      // One flick = one step: when the scroll stops, it glides on to the next resting point, the
      // moment just before the next beat or chapter starts, so each scene plays out by itself.
      snap: { snapTo: rests, directional: true, inertia: false, delay: 0.2, duration: { min: 0.35, max: 1.1 }, ease: 'power1.inOut' },
      invalidateOnRefresh: true,
      // html has scroll-behavior: smooth; it animates each step of the snap's own scrolling, and the
      // lag makes one flick skip a resting point. Instant inside the story, smooth everywhere else.
      onToggle: self => { document.documentElement.style.scrollBehavior = self.isActive ? 'auto' : ''; },
      onRefreshInit: () => story.style.setProperty('--run', runLen() + 'px')
    });
    story.style.setProperty('--run', runLen() + 'px');
    ScrollTrigger.refresh();
    sync();
    // Frames load only when the story is about to be seen, coarse to fine.
    const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { near.disconnect(); films.forEach(f => f.load()); } }, { rootMargin: '150% 0px' });
    near.observe(story);
    // Web fonts and the live panels above can still move the story down; measure again once they land.
    requestAnimationFrame(() => ScrollTrigger.refresh());
    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());

    // In-page links to a chapter scroll to its spot in the run instead of the stage top.
    const go = e => {
      const a = e.target.closest('a[href^="#st-"]');
      if (!a) return;
      const i = chs.findIndex(c => '#' + c.id === a.getAttribute('href'));
      if (i < 0) return;
      e.preventDefault();
      scrollTo({ top: st.labelToScroll('ch' + i) + 2, behavior: 'smooth' });
    };
    document.addEventListener('click', go);
    let rt = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); });
    ro.observe(document.querySelector('main') || document.body);

    return () => {
      document.removeEventListener('click', go);
      lid.removeEventListener('lidar-ready', sync);
      story.style.removeProperty('--run');
      ro.disconnect(); clearTimeout(rt); near.disconnect(); films.forEach(f => f.stop());
      story.classList.remove('on'); document.documentElement.style.scrollBehavior = '';
      if (ctl) ctl.free();
    };
  });
}
