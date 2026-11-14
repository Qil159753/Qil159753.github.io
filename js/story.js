/* Journey story: five chapters above the timeline. Phones, short screens and reduced motion get a
   plain stack: each chapter's copy and its real photos. initStory() is called by the GSAP loader in
   index.html: the stage sticks and one scrubbed timeline plays every chapter. Chapters 1-4 are photo
   reels (one photo at a time, cross-faded beat by beat, drifting slowly with scroll; chapter 4 is the
   real SLAM map with the A -> B -> C loop drawn on it). Chapter 5 is the real LiDAR sim;
   js/journey-lidar.js exposes root.lidar so scroll can drive it, then free() hands it back. */
const story = document.getElementById('story');
const $ = (sel, root = story) => root.querySelector(sel);
const $$ = (sel, root = story) => [...root.querySelectorAll(sel)];
const key = (root, k) => root.querySelector(`[data-k="${k}"]`);

// Real footage (figure.vid) is silent and short. Stacked, a clip plays while it is on screen; in the
// sticky story, sync() plays it only while its shot is the one showing. With reduced motion nothing
// starts by itself: the clip shows its poster and the player's controls.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
const clips = $$('.st-vis figure.vid video');
if (reduce) clips.forEach(v => { v.controls = true; v.removeAttribute('loop'); });
else {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (story.classList.contains('on')) return;
    e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
  }), { threshold: 0.4 });
  clips.forEach(v => io.observe(v));
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
    const marks = [];       // [time, chapter, beat]: what the copy column and rail show from then on
    const mark = (t, ch, b = -1) => marks.push([t, ch, b]);
    const stops = [];       // extra resting points inside a beat: each later shot, once it is in

    // Chapter change: the old copy lifts away and its picture fades; the new heading rises out of a
    // mask, its lines follow one by one, and the new picture settles in.
    function enter(i, at) {
      const prev = chs[i - 1], cur = chs[i];
      tl.addLabel('ch' + i, at);
      // explicit start values: a .to() records its start lazily, and after a long jump forward it can
      // capture the already-hidden state, so scrolling back would never bring the chapter back
      tl.fromTo($('.st-copy', prev), { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -40, duration: 0.4, ease: 'power2.in', immediateRender: false }, at)
        .fromTo($('.st-vis', prev), { scale: 1, autoAlpha: 1 }, { scale: 1.06, autoAlpha: 0, duration: 0.5, ease: 'power2.in', immediateRender: false }, at)
        .set(prev, { autoAlpha: 0 }, at + 0.5)
        .set(cur, { autoAlpha: 1 }, at + 0.15)
        .fromTo($('.kicker', cur), { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.3, immediateRender: false }, at + 0.2)
        // the mask has headroom so Thai tone marks above the line are never clipped
        .fromTo($('h3', cur), { clipPath: 'inset(-40% -10% 140% -10%)', y: 36 }, { clipPath: 'inset(-40% -10% -40% -10%)', y: 0, duration: 0.5, ease: 'power3.out', immediateRender: false }, at + 0.25)
        .fromTo($$('.st-beats li, .st-copy > p', cur), { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out', immediateRender: false }, at + 0.4);
      tl.fromTo($('.st-vis', cur), { scale: 0.96, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'power3.out', immediateRender: false }, at + 0.3);
      mark(at + 0.2, i, 0);
    }

    // A reel chapter: each beat lights its line in the copy and brings in its photo(s); a beat with two
    // photos splits its time between them. Every photo pushes in slowly while it is up, so the panel is
    // never a still, but it all runs off the scrubbed timeline: no animation loop of its own.
    function reel(i, T, dur, beats) {
      enter(i, T);
      const ch = chs[i], end = T + dur, at = [[T + 0.2, 0], ...beats], shots = [];
      at.forEach(([t, b], k) => {
        if (b) mark(t, i, b);
        const t1 = k + 1 < at.length ? at[k + 1][0] : end, figs = $$(`.st-vis figure[data-b="${b}"]`, ch);
        // data-w gives a shot more of the beat (the map needs room for its animation)
        const w = figs.map(f => +(f.dataset.w || 1)), sum = w.reduce((x, y) => x + y, 0);
        let acc = 0;
        figs.forEach((f, n) => { const a = t + (t1 - t) * acc / sum; acc += w[n]; shots.push([f, a, t + (t1 - t) * acc / sum]); });
      });
      shots.forEach(([f, a, z], k) => {
        if (k) stops.push(a + 0.4);
        if (k) tl.fromTo(f, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power1.inOut', immediateRender: false }, a);
        if (k + 1 < shots.length) tl.set(f, { autoAlpha: 0 }, shots[k + 1][1] + 0.35);
        if (f.classList.contains('map')) return mapShot(f, a, z);
        if (f.classList.contains('vid')) return;          // footage moves by itself
        const dir = k % 2 ? -1 : 1;
        tl.fromTo($('img', f), { scale: 1.07, xPercent: -1.2 * dir }, { scale: 1, xPercent: 1.2 * dir, duration: z - a + 0.35, immediateRender: false }, a);
      });
    }

    // The SLAM map: it opens out from where mapping started (the map origin cell), then the view closes
    // in on the stations and the loop draws itself while the robot dot goes round it twice.
    function mapShot(f, a, z) {
      const map = $('.st-map', f), route = $('.route', f), bot = $('.bot', f), stns = $$('.stn', f);
      const d = z - a, len = route.getTotalLength(), B = { v: 0 };
      const place = () => { const q = route.getPointAtLength((B.v % 1) * len); bot.setAttribute('cx', q.x); bot.setAttribute('cy', q.y); };
      tl.fromTo(map, { clipPath: 'circle(0% at 57.8% 67.6%)' }, { clipPath: 'circle(150% at 57.8% 67.6%)', duration: d * 0.35, ease: 'power1.out', immediateRender: false }, a)
        .fromTo(map, { scale: 1, transformOrigin: '55.8% 50.5%' }, { scale: 2.4, duration: d * 0.3, ease: 'power2.inOut', immediateRender: false }, a + d * 0.35)
        .fromTo(stns, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, stagger: 0.1, immediateRender: false }, a + d * 0.55)
        .fromTo(route, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d * 0.2, immediateRender: false }, a + d * 0.62)
        .fromTo(B, { v: 0 }, { v: 2, duration: d * 0.36, onUpdate: place, immediateRender: false }, a + d * 0.64);
      stops.push(a + d * 0.6);   // rest on the zoomed map; the next flick draws the loop
      gsap.set([stns, bot], { autoAlpha: 0 });
      tl.set(bot, { autoAlpha: 1 }, a + d * 0.64);
    }
    gsap.set(chs, { autoAlpha: 0 });
    gsap.set(chs[0], { autoAlpha: 1 });

    // 0 · prologue
    tl.addLabel('ch0', 0); mark(0, 0);
    const intro = chs[0];
    tl.fromTo(key(intro, 'line'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4 }, 0.1)
      .from($$('.node', intro), { scale: 0, transformOrigin: '50% 50%', autoAlpha: 0, duration: 0.3, stagger: 0.25, ease: 'back.out(2)' }, 0.2);

    // 1-4 · the photo reels
    reel(1, 2, 6.4, [[4.0, 1], [5.6, 2]]);              // digger · truck · Nano
    reel(2, 8.4, 6.2, [[10.4, 1], [12.4, 2]]);          // STL, 3rd · Pitch Your IP, 1st · ELP4
    reel(3, 14.6, 5.4, [[17.1, 1]]);                    // Robotrace · ABU
    reel(4, 20, 6.2, [[21.4, 1]]);                      // MARA ROS courses · BATLY footage, then the SLAM map and its loop

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
    const rests = [0, ...marks.slice(1).map(m => m[0] - 0.15), ...stops].map(t => t / tl.duration()).concat(1).sort((a, b) => a - b);

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
      // play only the clip whose shot is showing in the current chapter
      if (!reduce) for (const v of clips) {
        const f = v.closest('figure'), on = ch < 6 && chs[ch].contains(f) && +gsap.getProperty(f, 'opacity') > 0.5;
        if (on && v.paused) v.play().catch(() => {});
        else if (!on && !v.paused) v.pause();
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
    // Web fonts and the panels above can still move the story down; measure again once they land.
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
      ro.disconnect(); clearTimeout(rt);
      story.classList.remove('on'); document.documentElement.style.scrollBehavior = '';
      if (ctl) ctl.free();
    };
  });
}
