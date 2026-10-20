/* Small engineer-flavoured touches. External file, so the CSP needs no new hash.
   Nothing here animates on its own: it reacts to a tap, a key or the console. */
(function () {
  var root = document.documentElement;
  var en = function () { return root.dataset.lang === 'en'; };

  /* ---------- 1. The drive frame on the ABU card: corrupt a byte, watch CRC-8 drop the frame ---------- */
  var frame = document.querySelector('.bytes'), msg = document.querySelector('.frame-msg');
  var crcCell = frame && frame.querySelector('.crc');
  if (frame && msg && crcCell) {
    var busy = 0;
    var label = function (li) {
      li.setAttribute('aria-label', (en() ? 'Corrupt byte ' : 'ทำให้ไบต์เสีย ') + li.dataset.name);
    };
    frame.querySelectorAll('li:not(.crc)').forEach(function (li) {
      var b = li.querySelector('b');
      li.dataset.name = b.textContent;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      label(li);
      function hit() {
        if (li.dataset.bad) return;
        var junk = (Math.random() * 256) | 0;
        li.dataset.bad = '1';
        b.textContent = '0x' + junk.toString(16).toUpperCase().padStart(2, '0');
        crcCell.classList.add('fail');
        msg.classList.remove('ok');
        msg.textContent = en() ? 'CRC-8 mismatch → frame dropped, the robot keeps its last good command'
                               : 'CRC-8 ไม่ตรง → ทิ้งเฟรมนี้ หุ่นยังใช้คำสั่งล่าสุดที่ถูกต้อง';
        busy++;
        setTimeout(function () {
          b.textContent = li.dataset.name;
          delete li.dataset.bad;
          if (--busy === 0) {
            crcCell.classList.remove('fail');
            msg.classList.add('ok');
            msg.textContent = en() ? 'Next frame: CRC matches, accepted' : 'เฟรมถัดไป: CRC ตรง รับคำสั่ง';
            setTimeout(function () { if (!busy) { msg.textContent = ''; msg.classList.remove('ok'); } }, 1600);
          }
        }, 1600);
      }
      li.addEventListener('click', hit);
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(); }
      });
    });
    new MutationObserver(function () {
      frame.querySelectorAll('li[role=button]').forEach(label);
    }).observe(root, { attributes: true, attributeFilter: ['data-lang'] });
  }

  /* ---------- 2. A serial monitor in DevTools ---------- */
  try {
    console.log(
      '%c[  0.000] Q-fw boot @115200 8N1\n' +
      '[  0.004] radio link: OK   crc8: OK\n' +
      '[  0.009] whoami -> Apipath (Q), Embedded Systems Eng., Burapha University\n' +
      '[  0.011] contact -> apipath.san@gmail.com | github.com/Qil159753\n' +
      '[  0.012] > type q() for the project table',
      'font: 12px/1.6 ui-monospace, Menlo, monospace; color: #ec9a5a');
    window.q = function () {
      console.table({
        'ABU Robocon 2026': 'Teensy 4.1 + 4.0, own radio protocol, CRC-8, 1.5 s failsafe',
        'MIONEX': 'myoelectric arm for below-elbow amputees, worn by 6 people',
        'TMIRC 2025': 'ESP32 line follower, 16-ch IR, PID, raced in Taiwan',
        'BATLY R1': 'ROS 2 Jazzy, SLAM, Nav2, AMCL',
        'Shop system': 'Node.js + SQLite, phone-first',
        'This page': 'plain HTML/CSS/JS + three.js, no framework'
      });
      return 'ACK';
    };
  } catch (e) {}

  /* ---------- 3. Footer: firmware stamp from the page's real last-modified date, plus uptime ---------- */
  var fw = document.querySelector('[data-fw]');
  if (fw) {
    var d = new Date(document.lastModified), t0 = performance.now();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var stamp = isNaN(d) ? '' : 'fw ' + d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
    var tick = function () {
      var u = ((performance.now() - t0) / 1000) | 0;
      fw.textContent = stamp + (stamp ? ' · ' : '') + 'up ' + pad((u / 3600) | 0) + ':' + pad(((u / 60) | 0) % 60) + ':' + pad(u % 60);
    };
    tick();
    var iv = 0;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        clearInterval(iv); iv = 0;
        if (es[es.length - 1].isIntersecting) iv = setInterval(tick, 1000);
      }).observe(fw);
    }
  }

  /* ---------- 4. Keyboard shortcuts: ? shows the map ---------- */
  var toast = document.getElementById('toast'), toastT = 0;
  // rows: [[key, label], ...] per line; built as nodes so no string is ever parsed as HTML.
  function show(rows) {
    if (!toast) return;
    toast.replaceChildren();
    rows.forEach(function (line, li) {
      if (li) toast.append(document.createElement('br'));
      line.forEach(function (kv) {
        var k = document.createElement('kbd');
        k.textContent = kv[0];
        toast.append(k, ' ' + kv[1] + '  ');
      });
    });
    toast.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.hidden = true; }, 5200);
  }
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    var t = e.target;
    // The ABU canvas uses WASD/QE; form fields and the lightbox keep their keys too.
    if (t && (/^(INPUT|TEXTAREA|SELECT|CANVAS)$/.test(t.tagName) || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    var go = { w: '#work', j: '#journey', c: '#contact', a: '#j-abu', r: '#j-ros', l: '#j-lidar' }[e.key];
    if (go) {
      var el = document.querySelector(go);
      if (el) { el.scrollIntoView({ block: 'start' }); history.replaceState(null, '', go); }
      return;
    }
    if (e.key === 'e') { var c = document.getElementById('copy'); if (c) c.click(); return; }
    if (e.key === 't') { var l = document.getElementById('lang'); if (l) l.click(); return; }
    if (e.key === 'Escape' && toast && !toast.hidden) { toast.hidden = true; return; }
    if (e.key === '?') {
      show(en()
        ? [[['w', 'work'], ['j', 'journey'], ['c', 'contact']], [['a', 'drive the ABU robot'], ['r', 'ROS 2'], ['l', 'LiDAR']], [['e', 'copy email'], ['t', 'ไทย / EN']]]
        : [[['w', 'ผลงาน'], ['j', 'เส้นทาง'], ['c', 'ติดต่อ']], [['a', 'ขับหุ่น ABU'], ['r', 'ROS 2'], ['l', 'LiDAR']], [['e', 'คัดลอกอีเมล'], ['t', 'ไทย / EN']]]);
    }
  });
})();
