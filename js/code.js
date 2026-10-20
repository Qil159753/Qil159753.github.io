/* "Code I wrote": tabs for the source excerpts, and the live panels that run the same logic.
   Each port below mirrors the excerpt beside it; comments name the original function. */
(function () {
  var root = document.documentElement;
  var en = function () { return root.dataset.lang === 'en'; };
  var ide = document.querySelector('.ide');
  if (!ide) return;

  /* ---------- tabs (WAI-ARIA tabs pattern: arrows move, Home/End jump) ---------- */
  var tabs = [].slice.call(ide.querySelectorAll('[role=tab]'));
  function select(t, focus) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) t.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      select(tabs[(j + tabs.length) % tabs.length], true);
    });
  });

  var hex = function (v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); };

  /* ---------- crc8() from robot_firmware_v6.ino ---------- */
  function crc8(data, len) {
    var crc = 0;
    for (var i = 0; i < len; i++) {
      crc ^= data[i];
      for (var b = 0; b < 8; b++) crc = (crc & 0x80) ? ((crc << 1) ^ 0x31) & 0xFF : (crc << 1) & 0xFF;
    }
    return crc;
  }
  var crcBox = ide.querySelector('[data-live=crc]');
  if (crcBox) {
    // SOF, VER_DRIVE, btn, aux, vx, vy, vt, speed mode, lead screw: left stick pushed forward, FULL mode
    var BASE = [0xAA, 0x43, 0x00, 0x00, 0x80, 0xC8, 0x80, 0x01, 0x80];
    var NAMES = ['SOF', 'VER', 'BTN', 'AUX', 'VX', 'VY', 'VT', 'SPD', 'LEAD'];
    var bytes = BASE.slice(), rx = crc8(BASE, 9);
    var row = crcBox.querySelector('[data-hex]'), out = crcBox.querySelector('[data-out]'), inputs = [];
    var two = function (v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
    NAMES.forEach(function (n, i) {
      var l = document.createElement('label');
      var s = document.createElement('span');
      s.textContent = n;
      var inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 2; inp.spellcheck = false; inp.autocomplete = 'off';
      inp.setAttribute('aria-label', 'byte ' + i + ' ' + n);
      inp.value = two(BASE[i]);
      inp.addEventListener('input', function () {
        var okHex = /^[0-9a-fA-F]{1,2}$/.test(inp.value);
        inp.classList.toggle('bad', !okHex);
        if (okHex) { bytes[i] = parseInt(inp.value, 16); run(); }
      });
      inputs.push(inp);
      l.appendChild(s);
      l.appendChild(inp);
      row.appendChild(l);
    });
    function run() {
      var c = crc8(bytes, 9), ok = c === rx;
      var changed = bytes.some(function (b, i) { return b !== BASE[i]; });
      inputs.forEach(function (inp, i) { inp.classList.toggle('diff', bytes[i] !== BASE[i]); });
      out.className = 'crc-out ' + (ok ? 'ok' : 'bad');
      out.innerHTML = '<span>crc8(frame, 9) = <b>' + hex(c) + '</b></span><span>' + (en() ? 'received' : 'ที่ได้รับ') + ' = <b>' + hex(rx) + '</b></span><em>' +
        (ok ? (changed ? (en() ? 'Collision: different bytes, same CRC. About 1 in 256.' : 'ชนกันพอดี: ไบต์ต่างกัน แต่ CRC เท่ากัน โอกาสราว 1 ใน 256')
                       : (en() ? 'Match → frame accepted' : 'ตรงกัน → รับเฟรม'))
            : (en() ? 'Mismatch → return -1, frame dropped' : 'ไม่ตรง → return -1 ทิ้งเฟรม')) + '</em>';
    }
    crcBox.querySelector('[data-reset]').addEventListener('click', function () {
      bytes = BASE.slice();
      inputs.forEach(function (inp, i) { inp.value = two(BASE[i]); inp.classList.remove('bad'); });
      run();
    });
    run();
    new MutationObserver(run).observe(root, { attributes: true, attributeFilter: ['data-lang'] });
  }

  /* ---------- driveMecanumRamped() mix + scale, from robot_firmware_v6.ino ---------- */
  var cdiv = function (a, b) { return Math.trunc(a / b); };   // C int division truncates toward zero
  var drBox = ide.querySelector('[data-live=drive]');
  if (drBox) {
    var wEl = drBox.querySelector('[data-wheels]'), bars = [];
    ['FL', 'FR', 'BL', 'BR'].forEach(function (n) {
      var d = document.createElement('div');
      d.className = 'wh';
      d.innerHTML = '<span>' + n + '</span><i><s></s></i><b></b>';
      wEl.appendChild(d);
      bars.push(d);
    });
    var sl = {};
    drBox.querySelectorAll('input[data-v]').forEach(function (s) { sl[s.dataset.v] = s; s.addEventListener('input', mix); });
    function mix() {
      var vy = +sl.vy.value, vx = +sl.vx.value, vt = +sl.vt.value;
      ['vy', 'vx', 'vt'].forEach(function (k) { drBox.querySelector('[data-o=' + k + ']').textContent = sl[k].value; });
      vx = -vx; vt = -vt;
      var fl = vy + vx + vt, fr = vy - vx - vt, bl = vy - vx + vt, br = vy + vx - vt;
      var mx = Math.max(Math.abs(fl), Math.abs(fr), Math.abs(bl), Math.abs(br));
      if (mx > 255) { fl = cdiv(fl * 255, mx); fr = cdiv(fr * 255, mx); bl = cdiv(bl * 255, mx); br = cdiv(br * 255, mx); }
      [fl, fr, bl, br].forEach(function (v, i) {
        var s = bars[i].querySelector('s'), w = Math.abs(v) / 255 * 50;
        s.style.width = w + '%';
        s.style.left = v >= 0 ? '50%' : (50 - w) + '%';
        s.className = v >= 0 ? 'fw' : 'rv';
        bars[i].querySelector('b').textContent = v;
      });
    }
    mix();
  }

  /* ---------- computeError() + adaptive PD, from linetracer_v3.ino ---------- */
  var ltBox = ide.querySelector('[data-live=line]');
  if (ltBox) {
    var Kp = 500, SPEED_MAX = 450, SPEED_MIN = 40, ERR_FAST = 0.07, ERR_SLOW = 0.28;
    var on = [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
    var irEl = ltBox.querySelector('[data-ir]'), lOut = ltBox.querySelector('[data-out]'), cells = [];
    // The firmware's index 0 sits on the robot's right ("positive err = line to the LEFT"),
    // so the row is drawn mirrored: what you see on the left is the robot's left.
    on.forEach(function (v, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'IR ' + (12 - i));
      b.addEventListener('click', function () { on[i] = on[i] ? 0 : 1; calc(); });
      irEl.appendChild(b);
      cells.push(b);
    });
    var lastErr = 0;
    function adaptiveBase(a) {
      if (a <= ERR_FAST) return SPEED_MAX;
      if (a >= ERR_SLOW) return SPEED_MIN;
      var t = (a - ERR_FAST) / (ERR_SLOW - ERR_FAST);
      return Math.trunc(SPEED_MAX + t * (SPEED_MIN - SPEED_MAX));
    }
    function calc() {
      var wsum = 0, vsum = 0;
      on.forEach(function (w, idx) { vsum += w; wsum += w * (-5.5 + idx); });
      cells.forEach(function (c, i) { c.setAttribute('aria-pressed', String(!!on[i])); });
      var saw = vsum > 0, err = saw ? (wsum / vsum) / 5.5 : lastErr;
      lastErr = err;
      var base = adaptiveBase(Math.abs(err)), delta = Math.trunc(Kp * err);
      var clamp = function (v) { return Math.max(-SPEED_MAX, Math.min(SPEED_MAX, v)); };
      var l = clamp(base - delta), r = clamp(base + delta);
      var bar = function (name, v) {
        return '<div class="lt-m"><span>' + name + '</span><i><s style="width:' + Math.round(Math.abs(v) / SPEED_MAX * 100) + '%" class="' + (v < 0 ? 'rv' : 'fw') + '"></s></i><b>' + v + '</b></div>';
      };
      var note = !saw ? (en() ? 'No line: keep the last error (the real robot pivots here)' : 'ไม่เห็นเส้น: ใช้ error เดิม (หุ่นจริงจะเข้าโหมด pivot)')
        : Math.abs(err) <= ERR_FAST ? (en() ? 'Centred: full speed' : 'อยู่กลาง: วิ่งเต็มความเร็ว')
        : en() ? 'Off-centre: slow down and steer ' + (err > 0 ? 'left' : 'right')
        : 'เส้นเยื้อง: ลดความเร็วแล้วเลี้ยว' + (err > 0 ? 'ซ้าย' : 'ขวา');
      lOut.innerHTML = '<div class="lt-row"><span>err</span><b>' + err.toFixed(3) + '</b><span>base</span><b>' + base + '</b><span>Kp·err</span><b>' + delta + '</b></div>' +
        bar('L', l) + bar('R', r) + '<em>' + note + '</em>';
    }
    calc();
    new MutationObserver(calc).observe(root, { attributes: true, attributeFilter: ['data-lang'] });
  }
})();
