// "Now": fills the section from now.json, which .github/workflows/now.yml rebuilds from Q's GitHub
// activity every six hours. Public repos by name; private work only as a count. Text is set with
// textContent throughout, since commit messages come from outside the page.
const root = document.querySelector('[data-now]');
if (root) load();

async function load() {
  let d;
  try {
    const r = await fetch(new URL('now.json', document.baseURI), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    d = await r.json();
  } catch (e) {
    root.querySelector('[data-now-fail]').hidden = false;
    return;
  }
  render(d);
}

function both(th, en) {
  const f = document.createDocumentFragment();
  const a = document.createElement('span'); a.className = 'th'; a.textContent = th;
  const b = document.createElement('span'); b.className = 'en'; b.lang = 'en'; b.textContent = en;
  f.append(a, b);
  return f;
}
function rel(iso, lang) {
  const s = (new Date(iso) - Date.now()) / 1000;
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  for (const [u, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= n) return fmt.format(Math.round(s / n), u);
  }
  return fmt.format(0, 'minute');
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function stat(value, th, en) {
  const d = el('div', 'now-stat'), b = el('b');
  b.append(value);
  const s = el('span'); s.append(both(th, en));
  d.append(b, s);
  return d;
}

function render(d) {
  const stats = root.querySelector('[data-now-stats]');
  stats.replaceChildren(
    stat(d.last_active ? both(rel(d.last_active, 'th'), rel(d.last_active, 'en')) : '–', 'คอมมิตล่าสุด', 'last commit'),
    stat(String(d.total), `contribution ใน ${d.weeks} สัปดาห์`, `contributions in ${d.weeks} weeks`),
    stat(String(d.active_days), `วันที่มีงาน จาก ${d.days.length} วัน`, `active days of ${d.days.length}`),
    ...(d.private > 0 ? [stat(String(d.private), 'ใน repo ส่วนตัว (เช่นงานทีม)', 'in private repos (team work)')] : []),
  );

  // weeks run left to right, weekdays top to bottom from Sunday, like GitHub's own calendar
  const cal = root.querySelector('[data-now-cal]'), max = Math.max(1, ...d.days.map(x => x.n));
  cal.replaceChildren();
  const lead = d.days.length ? new Date(d.days[0].d + 'T00:00:00Z').getUTCDay() : 0;
  for (let i = 0; i < lead; i++) cal.append(el('i', 'blank'));
  for (const day of d.days) {
    const c = el('i');
    c.dataset.l = day.n ? Math.min(4, Math.ceil((day.n / max) * 4)) : 0;
    c.title = `${day.d}: ${day.n}`;
    cal.append(c);
  }
  cal.setAttribute('aria-label', `${d.total} contributions over the last ${d.weeks} weeks, on ${d.active_days} days`);

  const list = root.querySelector('[data-now-list]');
  list.replaceChildren();
  if (!d.repos.length) {
    const p = el('p', 'now-empty'); p.append(both('30 วันที่ผ่านมายังไม่มีคอมมิตใน repo สาธารณะ', 'No public commits in the last 30 days.'));
    list.append(p);
  }
  for (const r of d.repos) {
    const box = el('div', 'now-repo');
    const h = el('h3'), a = el('a', null, r.name + ' ↗');
    a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
    h.append(a);
    if (r.lang) h.append(el('small', null, r.lang));
    const ul = el('ul');
    for (const m of r.recent) {
      const li = el('li'), link = el('a', null, m.msg), t = el('time');
      link.href = m.url; link.target = '_blank'; link.rel = 'noopener';
      t.dateTime = m.date; t.append(both(rel(m.date, 'th'), rel(m.date, 'en')));
      li.append(link, t);
      ul.append(li);
    }
    box.append(h, ul);
    list.append(box);
  }
  root.classList.add('ready');
}
