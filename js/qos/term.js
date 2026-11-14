// qsh: the qOS terminal. A small virtual filesystem over content.js, tab completion, history,
// and commands that open the apps. Every line is built from DOM nodes, never parsed HTML.
import { T, ABOUT, MUSIC, MUSIC_ERA, GAMES, PROJECTS, CONTACT } from './content.js';
import { crc8, driveFrame, xbeeFrame, hex } from './proto.js';

const HOME = '/home/q';
const APPS = {
  robot3d: { th: 'บอร์ดรีโมตตัวจริงแบบ 3 มิติ', en: 'the real controller board in 3D' },
  drive: { th: 'ขับ BATLY ทำ SLAM เอง', en: 'drive BATLY and build the SLAM map' },
  lab: { th: 'โต๊ะแล็บ: สโคป ลอจิก PCB', en: 'lab bench: scope, logic analyzer, PCB' },
  hand: { th: 'ขยับมือ MIONEX ด้วยกล้องของคุณ', en: 'move the MIONEX hand with your webcam' },
};

export function mountTerm(body, ctx) {
  const L = () => ctx.lang();
  const root = el('div', 'q-term');
  const out = el('div', 'q-out'); out.setAttribute('role', 'log'); out.setAttribute('aria-live', 'polite');
  const inRow = el('label', 'q-in');
  const ps = el('span', 'p');
  const input = el('input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, autocapitalize: 'off' });
  input.setAttribute('aria-label', 'qsh');
  inRow.append(ps, input);
  root.append(out, inRow);
  body.append(root);

  let cwd = HOME, hist = [], hi = 0, stream = null;
  const t0 = performance.now();
  const short = p => (p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p);
  const prompt = () => { ps.textContent = `guest@qos:${short(cwd)}$`; };
  prompt();

  // ---------------------------------------------------------------- output
  function line(...parts) {
    const d = el('div', 'l');
    for (const p of parts) {
      if (p == null) continue;
      if (p instanceof Node) d.append(p);
      else if (Array.isArray(p)) d.append(span(p[0], p[1]));
      else d.append(String(p));
    }
    out.append(d);
    root.scrollTop = root.scrollHeight;
    return d;
  }
  const run = (cmd, label = cmd) => {
    const b = el('button', 'run'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', e => { e.stopPropagation(); exec(cmd); });
    return b;
  };
  const block = text => text.split('\n').forEach(t => line(t.startsWith('# ') ? [t, 'c-h'] : t));

  // ---------------------------------------------------------------- filesystem
  const file = read => ({ t: 'f', read });
  const FS = { t: 'd', c: {
    home: { t: 'd', c: { q: { t: 'd', c: {
      'about.md': file(() => T(ABOUT, L())),
      'music.md': file(() => musicText()),
      'games.md': file(() => gamesText()),
      'contact.txt': file(() => `email   ${CONTACT.email}\ngithub  ${CONTACT.github}`),
      projects: { t: 'd', c: Object.fromEntries(PROJECTS.map(p => [p.file, file(() => T(p, L()))])) },
      apps: { t: 'd', c: Object.fromEntries(Object.keys(APPS).map(k => [k, { t: 'x', app: k }])) },
    } } } },
    etc: { t: 'd', c: {
      motd: file(() => motd()),
      'os-release': file(() => 'NAME="qOS"\nVERSION="1.0"\nID=qos\nPRETTY_NAME="qOS 1.0 (bare metal, in your browser)"\nHOME_URL="https://qil159753.github.io/"'),
    } },
    dev: { t: 'd', c: { xbee: { t: 'dev' } } },
    proc: { t: 'd', c: { cpuinfo: file(() => cpuinfo()) } },
  } };

  function resolve(p) {
    if (!p || p === '~') return p ? HOME : cwd;
    if (p.startsWith('~/')) p = HOME + p.slice(1);
    const st = [];
    for (const s of (p.startsWith('/') ? p : cwd + '/' + p).split('/')) {
      if (!s || s === '.') continue;
      if (s === '..') st.pop(); else st.push(s);
    }
    return '/' + st.join('/');
  }
  function node(path) {
    let n = FS;
    for (const s of path.split('/').filter(Boolean)) {
      if (n.t !== 'd' || !n.c[s]) return null;
      n = n.c[s];
    }
    return n;
  }

  // ---------------------------------------------------------------- content
  function motd() {
    return L() === 'th'
      ? 'ยินดีต้อนรับสู่ qOS · ห้องเล่นลับของคิว\nพิมพ์ help เพื่อดูคำสั่ง หรือเปิดแอปจากเดสก์ท็อป'
      : "Welcome to qOS · Q's hidden playground\nType help for commands, or open an app from the desktop.";
  }
  function musicText() {
    const lang = L(), w = 18;
    const rows = MUSIC.map(m => {
      const n = Math.round(m.level * w);
      // bar first: Thai tone marks have no width, so padding the label would not line the bars up
      return `${'█'.repeat(n)}${'░'.repeat(w - n)}  ${T(m.genre, lang)}` + (m.picks.length ? '\n' + ' '.repeat(w + 2) + m.picks.join('\n' + ' '.repeat(w + 2)) : '');
    });
    return `# music.md\n\n${rows.join('\n')}\n\n${T(MUSIC_ERA, lang)}`;
  }
  function gamesText() {
    const lang = L();
    return '# games.md\n\n' + GAMES.map(g => '- ' + T(g.kind, lang) + (g.picks.length ? ': ' + g.picks.join(', ') : '')).join('\n');
  }
  function cpuinfo() {
    const n = navigator.hardwareConcurrency || '?';
    return `processor   : qOS virtual MCU
model name  : NXP i.MX RT1062 (Teensy 4.0), ARM Cortex-M7 @ 600 MHz
flash       : 1984 KB
ram         : 1024 KB
note        : simulated. The real CPU is yours: ${n} hardware threads.`;
  }
  const uptime = () => {
    const s = ((performance.now() - t0) / 1000) | 0;
    return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------- commands
  const HELP = [
    ['help', { th: 'คำสั่งทั้งหมด', en: 'this list' }],
    ['about', { th: 'คิวคือใคร', en: 'who Q is' }],
    ['projects', { th: 'งานที่ทำ', en: 'what Q built' }],
    ['music', { th: 'เพลงที่ฟัง', en: 'what Q listens to' }],
    ['games', { th: 'เกมและงานอดิเรก', en: 'games and hobbies' }],
    ['robot3d', APPS.robot3d], ['drive', APPS.drive], ['lab', APPS.lab], ['hand', APPS.hand],
    ['neofetch', { th: 'ข้อมูลระบบ', en: 'system info' }],
    ['ls, cd, cat, tree', { th: 'เดินดูไฟล์', en: 'look around the files' }],
    ['cat /dev/xbee', { th: 'ดูเฟรมวิทยุจริงของรีโมต', en: "watch the controller's real radio frames" }],
    ['crc8 AA 43 …', { th: 'คำนวณ CRC-8 แบบเฟิร์มแวร์', en: 'CRC-8 exactly as the firmware does it' }],
    ['contact', { th: 'ติดต่อคิว', en: 'reach Q' }],
    ['sound on|off · lang th|en', { th: 'เสียง · ภาษา', en: 'sound · language' }],
    ['exit', { th: 'กลับไปหน้าเว็บ', en: 'back to the website' }],
  ];
  const CMDS = {
    help() {
      line(['qsh, the qOS shell', 'c-h']);
      for (const [c, d] of HELP) {
        const plain = /[ ,]/.test(c) && c !== 'cat /dev/xbee';
        line(plain ? [c.padEnd(26), 'c-hi'] : run(c, c.padEnd(26)), '  ', [T(d, L()), 'c-mut']);
      }
      line(['Tab completes · ↑↓ history · Ctrl+C stops · Ctrl+L clears', 'c-mut']);
    },
    about() { block(T(ABOUT, L())); line(); line(run('projects'), '  ', run('music'), '  ', run('games'), '  ', run('contact')); },
    projects() {
      line(['# ~/projects', 'c-h']);
      for (const p of PROJECTS) line(run('cat ~/projects/' + p.file, p.file.padEnd(22)), ' ', [T(p, L()).split('\n')[0], 'c-mut']);
    },
    music() { block(musicText()); },
    games() { block(gamesText()); },
    contact() {
      line(['email   ', 'c-mut'], link('mailto:' + CONTACT.email, CONTACT.email));
      line(['github  ', 'c-mut'], link(CONTACT.github, CONTACT.github));
      try { navigator.clipboard.writeText(CONTACT.email).then(() => line(['(email copied to clipboard)', 'c-ok']), () => {}); } catch (e) {}
    },
    whoami() { line(L() === 'th' ? 'guest · คุณกำลังเดินเล่นในโฮมไดเรกทอรีของคิว (อภิภัทร)' : "guest · you're walking around q's home directory. q is Apipath."); },
    id() { line('uid=1000(guest) gid=1000(guest) groups=1000(guest),20(dialout),27(sudo)'); },
    pwd() { line(cwd); },
    uname(a) { line(a[0] === '-a' ? 'qOS qos 1.0 #1 PREEMPT_RT armv7e-m Cortex-M7 i.MX-RT1062' : 'qOS'); },
    date() { line(new Date().toString()); line(['Bangkok: ' + new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }), 'c-mut']); },
    uptime() { line(`up ${uptime()}, 1 user`); },
    echo(a) { line(a.join(' ')); },
    clear() { out.replaceChildren(); },
    history() { hist.forEach((h, i) => line([String(i + 1).padStart(4), 'c-mut'], '  ', h)); },
    ls(a) {
      const flags = a.filter(x => x.startsWith('-')).join(''), arg = a.find(x => !x.startsWith('-'));
      const path = resolve(arg), n = node(path);
      if (!n) return line([`ls: ${arg}: No such file or directory`, 'c-bad']);
      if (n.t !== 'd') return line(path.split('/').pop());
      const names = Object.keys(n.c).filter(k => flags.includes('a') || !k.startsWith('.'));
      const d = line();
      names.forEach((k, i) => {
        const c = n.c[k], full = (path === '/' ? '' : path) + '/' + k;
        const label = c.t === 'd' ? k + '/' : c.t === 'x' ? k + '*' : k;
        const b = run(c.t === 'd' ? 'cd ' + full : c.t === 'x' ? c.app : 'cat ' + full, label);
        b.classList.add(c.t === 'd' ? 'c-cu' : 'c-ink');
        d.append(b, i < names.length - 1 ? '   ' : '');
      });
    },
    tree() {
      const walk = (n, pre) => {
        const ks = Object.keys(n.c);
        ks.forEach((k, i) => {
          const last = i === ks.length - 1, c = n.c[k];
          line([pre + (last ? '└── ' : '├── '), 'c-mut'], [k + (c.t === 'd' ? '/' : ''), c.t === 'd' ? 'c-cu' : '']);
          if (c.t === 'd') walk(c, pre + (last ? '    ' : '│   '));
        });
      };
      line(['~', 'c-cu']); walk(node(HOME), '');
    },
    cd(a) {
      const p = a[0] ? resolve(a[0]) : HOME, n = node(p);
      if (!n) return line([`cd: ${a[0]}: No such file or directory`, 'c-bad']);
      if (n.t !== 'd') return line([`cd: ${a[0]}: Not a directory`, 'c-bad']);
      cwd = p; prompt();
    },
    cat(a) {
      if (!a.length) return line(['cat: missing file', 'c-bad']);
      for (const x of a) {
        const p = resolve(x), n = node(p);
        if (!n) { line([`cat: ${x}: No such file or directory`, 'c-bad']); continue; }
        if (n.t === 'd') { line([`cat: ${x}: Is a directory`, 'c-bad']); continue; }
        if (n.t === 'x') { line([`cat: ${x}: binary file (run it instead: `, 'c-mut'], run(n.app), [')', 'c-mut']); continue; }
        if (n.t === 'dev') { xbee(); return; }
        block(n.read());
        const proj = PROJECTS.find(q => p.endsWith('/' + q.file));
        if (proj) line(link(proj.href, L() === 'th' ? '→ เปิดในหน้าเว็บ' : '→ open it on the page', () => ctx.exit()));
      }
    },
    open(a) {
      if (a[0] in APPS) return ctx.openApp(a[0]);
      const n = a[0] && node(resolve(a[0]));
      if (n && n.t === 'x') return ctx.openApp(n.app);
      if (n && n.t === 'f') return CMDS.cat(a);
      line(['open: try ', 'c-mut'], run('open robot3d'), ', ', run('open drive'), ' or ', run('open lab'));
    },
    robot3d() { line(['launching robot3d…', 'c-mut']); ctx.openApp('robot3d'); },
    drive() { line(['launching drive…', 'c-mut']); ctx.openApp('drive'); },
    lab(a) { line(['launching lab…', 'c-mut']); ctx.openApp('lab', a[0]); },
    hand() { line(['launching hand…', 'c-mut']); ctx.openApp('hand'); },
    neofetch() {
      const logo = [
        '   ▄▄████████▄▄   ',
        ' ▄██▀▀      ▀▀██▄ ',
        '███            ███',
        '███            ███',
        '███       ▄▄   ███',
        ' ▀██▄▄     ▀██▄██ ',
        '   ▀▀████████▀███▄',
        '                ▀▀',
      ].join('\n');
      const g = el('div', 'q-neo'), pre = el('pre'); pre.textContent = logo;
      const info = el('div');
      const kv = (k, v) => { const d = el('div'); d.append(span(k + ': ', 'c-cu'), v); info.append(d); };
      const h = el('div'); h.append(span('guest', 'c-cu'), '@', span('qos', 'c-cu'));
      info.append(h, span('─'.repeat(30), 'c-mut'));
      kv('OS', 'qOS 1.0 (bare metal, in your browser)');
      kv('Host', 'Apipath "Q" Santasnachok');
      kv('Kernel', 'Teensy 4.0 · Cortex-M7 @ 600 MHz (simulated)');
      kv('Uptime', uptime());
      kv('Shell', 'qsh 1.0');
      kv('Display', `${innerWidth}×${innerHeight} @ ${devicePixelRatio}x`);
      kv('Study', 'Embedded Systems Eng., Burapha Univ., Y3');
      kv('Langs', 'C, C++, Python, JavaScript');
      kv('MCUs', 'Teensy 4.x, ESP32, STM32, Arduino');
      kv('Robots', 'ABU R1 2026 · BATLY R1 · Robotrace');
      kv('Music', MUSIC.map(m => T(m.genre, 'en').split(' /')[0]).join(', '));
      const sw = el('div'); sw.style.marginTop = '6px';
      ['#07090c', '#10141a', '#808a99', '#c4cbd5', '#f2f4f7', '#ec9a5a', '#ffb47c', '#7ee2a8'].forEach(c => { const s = el('span', 'q-swatch'); s.style.background = c; sw.append(s); });
      info.append(sw);
      g.append(pre, info);
      line(g);
    },
    crc8(a) {
      const bytes = a.join(' ').split(/[\s,]+/).filter(Boolean).map(x => parseInt(x.replace(/^0x/i, ''), 16));
      if (!bytes.length || bytes.some(b => isNaN(b) || b < 0 || b > 255)) {
        line(['usage: crc8 AA 43 00 00 80 80 80 01 80', 'c-mut']);
        line(['poly 0x31, init 0x00, MSB first: the same loop as Controller_v7.ino', 'c-mut']);
        return;
      }
      line(bytes.map(hex).join(' '), ' → ', ['0x' + hex(crc8(bytes)), 'c-ok']);
    },
    sound(a) {
      const v = a[0] ? a[0] === 'on' : !ctx.sfx.on;
      ctx.setSound(v);
      line(['sound ' + (v ? 'on' : 'off'), 'c-mut']);
    },
    lang(a) {
      const v = a[0] === 'th' || a[0] === 'en' ? a[0] : L() === 'th' ? 'en' : 'th';
      ctx.setLang(v);
      line(['lang = ' + v, 'c-mut']);
    },
    sudo(a) {
      if (!a.length) return line(['usage: sudo <command>', 'c-mut']);
      if (a[0] === 'rm') return CMDS.rm(a.slice(1));
      line(['guest is already in the sudoers file. This incident will not be reported.', 'c-mut']);
      exec(a.join(' '), false);
    },
    rm(a) {
      if (a.some(x => /^-\w*r/.test(x)) && a.some(x => x === '/' || x === '/*' || x === '~')) {
        line(['rm: removing everything…', 'c-bad']);
        line(['*** watchdog: main loop starved for 1500 ms → reset ***', 'c-bad']);
        ctx.sfx.err();
        setTimeout(() => ctx.reboot(), 900);
        return;
      }
      line(['rm: read-only file system (this is ROM, nice try)', 'c-bad']);
    },
    ping(a) {
      const host = a[0] || 'robot';
      let n = 0;
      line(`PING ${host}: XBee 802.15.4, 10-byte payload + CRC-8`);
      stream = setInterval(() => {
        line(`10 bytes from ${host}: seq=${n} crc=ok time=${(6 + Math.random() * 9).toFixed(1)} ms`);
        ctx.sfx.click();
        if (++n >= 4) { stopStream(); line(['4 sent, 4 received, 0% loss (simulated link)', 'c-mut']); }
      }, 400);
    },
    flash() {
      const steps = [
        ['[sim] teensy_loader_cli --mcu=TEENSY40 -w -v robot_firmware_v6.hex', 'c-mut'],
        ['Teensy Loader, Command Line', ''],
        ['Read "robot_firmware_v6.hex"', ''],
        ['Waiting for Teensy device… (press the PROGRAM button)', 'c-mut'],
        ['Found HalfKay Bootloader', 'c-ok'],
        ['Programming', 'bar'],
        ['Booting', 'c-ok'],
      ];
      let i = 0;
      const next = () => {
        if (i >= steps.length) { stream = null; ctx.sfx.beep(); return; }
        const [t, c] = steps[i++];
        if (c === 'bar') {
          const d = line('Programming ');
          let k = 0;
          stream = setInterval(() => {
            d.append('.'); ctx.sfx.click();
            if (++k >= 24) { clearInterval(stream); stream = setTimeout(next, 200); }
          }, 45);
          return;
        }
        line([t, c]);
        stream = setTimeout(next, 260);
      };
      next();
    },
    ps() { ctx.windows().forEach((w, i) => line([String(100 + i).padStart(5), 'c-mut'], '  ', w)); },
    exit() { ctx.exit(); }, logout() { ctx.exit(); }, shutdown() { ctx.exit(); },
    reboot() { ctx.reboot(); },
    man(a) { if (a[0]) line(`No manual entry for ${a[0]}. Try `, run('help')); else CMDS.help(); },
    vim() { line(['you are now trapped in vim. (kidding: type exit to leave qOS)', 'c-mut']); },
  };
  CMDS['./robot3d'] = CMDS.robot3d; CMDS['./drive'] = CMDS.drive; CMDS['./lab'] = CMDS.lab; CMDS['./hand'] = CMDS.hand;
  CMDS.ll = a => CMDS.ls(a);

  // cat /dev/xbee: drive frames wrapped in the XBee API frame, five a second, with a stick wiggling
  function xbee() {
    line(['# /dev/xbee · 115200 8N1 · XBee API TX frames · Ctrl+C or q stops', 'c-mut']);
    // one 3-char column per byte, as in the rows below
    const cols = ['', 'len', '', 'ap', 'id', 'dest addr', '', '', '', '', '', '', '', 'op', 'SO', 'VR', 'BT', 'AX', 'VX', 'VY', 'VT', 'SP', 'LD', 'CR', 'cs'];
    let hdr = '';
    cols.forEach((c, i) => { if (hdr.length <= i * 3) hdr = hdr.padEnd(i * 3) + c; });
    line([hdr, 'c-mut']);
    const s = { btn: {}, x: 0, y: 0, t: 0, lead: 0, speedMode: 1, phase: 0, safety: false };
    let k = 0;
    stream = setInterval(() => {
      s.y = Math.max(0, Math.sin(k / 7)) * 0.8; s.t = k % 24 > 16 ? 0.5 : 0; s.btn.up = k % 30 < 3; k++;
      const p = driveFrame(s), f = xbeeFrame(p);
      line(['7E 00 15 ', 'c-mut'], [f.slice(3, 14).map(hex).join(' ') + ' ', 'c-mut'], [p.slice(0, 9).map(hex).join(' ') + ' ', 'c-ink'], [hex(p[9]) + ' ', 'c-ok'], [hex(f[24]), 'c-mut']);
      if (out.childElementCount > 400) out.firstChild.remove();
    }, 200);
  }
  function stopStream() { clearInterval(stream); clearTimeout(stream); stream = null; }

  // ---------------------------------------------------------------- input
  function exec(raw, echo = true) {
    const cmdline = raw.trim();
    if (echo) line([ps.textContent + ' ', 'p'], cmdline);
    if (!cmdline) return;
    if (echo) { hist.push(cmdline); hi = hist.length; }
    if (stream) stopStream();
    const [c, ...a] = cmdline.split(/\s+/);
    const f = Object.hasOwn(CMDS, c) && CMDS[c];
    if (f) { try { f(a); } catch (e) { line([String(e), 'c-bad']); } }
    else {
      const n = node(resolve(c));
      if (n && n.t === 'x') ctx.openApp(n.app);
      else { line([`qsh: command not found: ${c}  (try `, 'c-mut'], run('help'), [')', 'c-mut']); ctx.sfx.err(); }
    }
    root.scrollTop = root.scrollHeight;
  }

  function complete() {
    const v = input.value, parts = v.split(/\s+/);
    if (parts.length <= 1) {
      const opts = Object.keys(CMDS).filter(k => k.startsWith(v) && !k.startsWith('./'));
      if (opts.length === 1) input.value = opts[0] + ' ';
      else if (opts.length > 1) { line([ps.textContent + ' ', 'p'], v); line([opts.join('   '), 'c-mut']); }
      return;
    }
    const last = parts.pop(), dirPart = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
    const n = node(dirPart ? resolve(dirPart) : cwd);
    if (!n || n.t !== 'd') return;
    const base = last.slice(dirPart.length), opts = Object.keys(n.c).filter(k => k.startsWith(base));
    if (opts.length === 1) input.value = [...parts, dirPart + opts[0] + (n.c[opts[0]].t === 'd' ? '/' : ' ')].join(' ');
    else if (opts.length > 1) { line([ps.textContent + ' ', 'p'], v); line([opts.join('   '), 'c-mut']); }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { ctx.sfx.enter(); const v = input.value; input.value = ''; exec(v); return; }
    if (e.key === 'Tab') { e.preventDefault(); complete(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; return; }
    if (e.ctrlKey && e.key === 'c') {
      if (stream) { stopStream(); line(['^C', 'c-mut']); }
      else { line([ps.textContent + ' ', 'p'], input.value + '^C'); input.value = ''; }
      return;
    }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); out.replaceChildren(); return; }
    if (stream && e.key === 'q' && !input.value) { e.preventDefault(); stopStream(); return; }
    if (e.key.length === 1) ctx.sfx.key();
  });
  root.addEventListener('click', () => { if (!getSelection().toString()) input.focus({ preventScroll: true }); });

  return {
    el: root, exec, line, run, focus: () => input.focus({ preventScroll: true }),
    dispose() { stopStream(); },
  };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function span(text, cls) { const s = el('span', cls); s.textContent = text; return s; }
function link(href, text, onClick) {
  const a = el('a'); a.href = href; a.textContent = text;
  if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
  if (onClick) a.addEventListener('click', onClick);
  return a;
}
