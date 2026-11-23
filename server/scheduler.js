// Günün zil, müzik ve tören olaylarını hesaplar ve zamanı gelince tetikler.
const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

function schoolDayInfo(cfg, d) {
  if (!cfg.weekdays.includes(d.getDay())) return { ok: false, reason: 'Hafta sonu' };
  const dk = dateKey(d);
  const md = dk.slice(5);
  const h = (cfg.holidays || []).find((x) => x.date === dk || x.date === md);
  if (h) return { ok: false, reason: h.name };
  const b = (cfg.breaks || []).find((x) => dk >= x.from && dk <= x.to);
  if (b) return { ok: false, reason: b.name };
  return { ok: true, reason: null };
}

// Hangi program çalacak? Öncelik: bugüne elle seçilen > tarih aralığı > haftanın günü > varsayılan
function programIdFor(cfg, d) {
  return programSource(cfg, d).id;
}
function programSource(cfg, d) {
  const dk = dateKey(d);
  const o = cfg.override;
  if (o && o.date === dk && cfg.programs[o.program]) return { id: o.program, source: 'today' };
  const r = (cfg.rangePrograms || []).find((x) => dk >= x.from && dk <= x.to && cfg.programs[x.program]);
  if (r) return { id: r.program, source: 'range', label: r.name };
  const w = (cfg.dayPrograms || {})[d.getDay()];
  if (w && cfg.programs[w]) return { id: w, source: 'weekday' };
  return { id: cfg.activeProgram, source: 'default' };
}

function buildDay(cfg, d) {
  const sd = schoolDayInfo(cfg, d);
  const src = programSource(cfg, d);
  const pid = src.id;
  const prog = cfg.programs[pid];
  const lessons = sd.ok && prog ? [...prog.lessons].sort((a, b) => a.start.localeCompare(b.start)) : [];
  const events = [];
  const off = prog ? prog.teacherBellOffset || 0 : 0;

  lessons.forEach((l, i) => {
    const n = i + 1;
    const s = toMin(l.start);
    const e = toMin(l.end);
    if (off > 0) events.push({ time: fromMin(s - off), kind: 'bell', bell: 'teacher', lesson: n, label: n + '. ders öğretmen zili' });
    events.push({ time: l.start, kind: 'bell', bell: 'student', lesson: n, label: n + '. ders giriş' });
    events.push({ time: l.end, kind: 'bell', bell: 'end', lesson: n, label: n + '. ders çıkış' });
    const next = lessons[i + 1];
    if (next && cfg.breakMusic && !prog.silent) {
      const stopAt = toMin(next.start) - off;
      if (stopAt - e >= 5) {
        events.push({ time: fromMin(e + 1), kind: 'music', action: 'start', label: 'Teneffüs müziği' });
        events.push({ time: fromMin(stopAt), kind: 'music', action: 'stop', label: 'Müzik dur' });
      }
    }
  });

  const wd = d.getDay();
  const md = dateKey(d).slice(5);
  for (const c of cfg.ceremonies || []) {
    if (c.mode !== 'auto' || !c.rule) continue;
    if (c.rule.onlySchoolDays !== false && !sd.ok) continue;
    let match = false;
    if (c.rule.type === 'weekly') match = c.rule.day === wd;
    if (c.rule.type === 'yearly') match = (c.rule.dates || []).includes(md);
    if (!match) continue;
    let time = c.rule.time;
    if (time === 'afterLast') {
      if (!lessons.length) continue;
      time = fromMin(toMin(lessons[lessons.length - 1].end) + 1);
    }
    events.push({ time, kind: 'ceremony', id: c.id, label: c.name });
  }

  const order = { music: 0, bell: 1, ceremony: 2 };
  events.sort((a, b) => a.time.localeCompare(b.time) || order[a.kind] - order[b.kind]);
  events.forEach((ev) => {
    ev.key = dateKey(d) + 'T' + ev.time + ':' + ev.kind + ':' + (ev.bell || ev.id || ev.action);
  });

  return {
    date: dateKey(d),
    weekday: wd,
    schoolDay: sd.ok,
    reason: sd.reason,
    programId: pid,
    programName: prog ? prog.name : pid,
    programSource: src.source,
    programSourceLabel: src.label || null,
    silent: !!(prog && prog.silent),
    lessons,
    events
  };
}

function createScheduler({ getConfig, onEvent, now = () => new Date() }) {
  let lastMinute = null;
  const fired = new Set();

  function tick() {
    const d = now();
    const hm = fromMin(d.getHours() * 60 + d.getMinutes());
    const mk = dateKey(d) + 'T' + hm;
    if (mk === lastMinute) return;
    lastMinute = mk;
    if (fired.size > 300) {
      for (const k of fired) if (!k.startsWith(dateKey(d))) fired.delete(k);
    }
    const day = buildDay(getConfig(), d);
    for (const ev of day.events) {
      if (ev.time === hm && !fired.has(ev.key)) {
        fired.add(ev.key);
        try {
          onEvent(ev, day);
        } catch (e) {
          console.error('Olay işlenemedi', ev, e);
        }
      }
    }
  }

  const timer = setInterval(tick, 1000);
  tick();
  return {
    today: () => buildDay(getConfig(), now()),
    tick,
    stop: () => clearInterval(timer)
  };
}

module.exports = { buildDay, createScheduler, toMin, fromMin, dateKey, programSource };
