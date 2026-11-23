// Telefon / bilgisayar kontrol paneli
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const STEP_NAMES = { siren: 'Siren', silence: 'Saygı duruşu (sessiz)', anthem: 'İstiklal Marşı' };

  let pin = '';
  try { pin = localStorage.getItem('zilPin') || ''; } catch (e) {}
  let state = null;
  let config = null;
  let drill = false;
  let pendingAlarm = null;

  async function api(method, url, body) {
    const r = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-pin': pin },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({ ok: false, error: 'Sunucu yanıt vermedi' }));
    if (r.status === 401) logout();
    return data;
  }
  function flash(id, text, bad) {
    const m = $(id);
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 4000);
  }

  // ---------- Giriş ----------
  async function login(p) {
    pin = p;
    const r = await api('POST', '/login');
    if (!r.ok) {
      $('loginErr').textContent = r.error || 'Giriş yapılamadı';
      return false;
    }
    try { localStorage.setItem('zilPin', pin); } catch (e) {}
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    await loadConfig();
    connect();
    return true;
  }
  function logout() {
    pin = '';
    try { localStorage.removeItem('zilPin'); } catch (e) {}
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
  }
  $('loginBtn').onclick = () => login($('pinInput').value.trim());
  $('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
  $('logout').onclick = logout;
  if (pin) login(pin);

  // ---------- Sekmeler ----------
  document.querySelectorAll('.nav button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.nav button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
      if (b.dataset.tab === 'set') loadExtras();
      scrollTo(0, 0);
    };
  });

  // ---------- Canlı durum ----------
  let es = null;
  function connect() {
    if (es) es.close();
    es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      state = JSON.parse(e.data);
      $('hConn').textContent = 'Sistem çalışıyor';
      $('hConn').classList.remove('bad');
      renderState();
    });
    es.onerror = () => {
      $('hConn').textContent = 'Bağlantı yok';
      $('hConn').classList.add('bad');
    };
  }
  setInterval(() => state && renderHeader(), 15000);

  function nowHm() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderHeader() {
    $('hSchool').textContent = state.schoolName;
    const day = state.day;
    const next = day.events.find((e) => e.kind === 'bell' && e.time > nowHm());
    $('hNext').textContent = day.schoolDay ? (next ? next.time : 'Bitti') : '—';
    $('hProg').textContent = day.schoolDay ? day.programName : day.reason;
    $('skipNext').textContent = state.skipNext ? 'Atlama iptal' : 'Sonraki zili atla';
    $('skipNext').classList.toggle('on', !!state.skipNext);
  }

  function renderState() {
    renderHeader();
    const b = $('activeBanner');
    b.classList.toggle('hidden', state.mode === 'normal');
    b.classList.toggle('cer', state.mode === 'ceremony');
    b.classList.toggle('drill', state.mode === 'alarm' && state.alarm.drill);
    if (state.mode === 'alarm') {
      $('bTag').textContent = state.alarm.drill ? 'TATBİKAT' : 'GERÇEK ALARM';
      $('bName').textContent = state.alarm.name + ' alarmı çalıyor';
      $('bStop').textContent = 'Alarmı durdur';
    } else if (state.mode === 'ceremony') {
      $('bTag').textContent = "ŞU AN TV'LERDE";
      $('bName').textContent = state.ceremony.name;
      $('bStop').textContent = 'Durdur';
    }
    renderToday();
    renderTodayProgs();
    if (config) renderCeremonies();
  }

  function renderToday() {
    const box = $('todayList');
    box.innerHTML = '';
    const day = state.day;
    if (!day.schoolDay) { box.appendChild(el('div', 'item', 'Bugün ders yok: ' + day.reason)); return; }
    const hm = nowHm();
    for (const ev of day.events) {
      if (ev.kind === 'music') continue;
      const it = el('div', 'item' + (ev.time < hm ? ' past' : '') + (state.skipNext === ev.key ? ' skip' : ''));
      it.append(el('span', '', ev.label + (day.silent && ev.kind === 'bell' ? ' (sessiz)' : '')), el('span', 't', ev.time));
      box.appendChild(it);
    }
  }

  // ---------- Ana sayfa ----------
  $('drillBtn').onclick = () => {
    drill = !drill;
    $('drillBtn').textContent = 'Tatbikat modu: ' + (drill ? 'Açık' : 'Kapalı');
    $('drillBtn').classList.toggle('drill-on', drill);
    $('drillBtn').setAttribute('aria-pressed', drill);
  };
  document.querySelectorAll('[data-alarm]').forEach((b) => {
    b.onclick = () => {
      pendingAlarm = b.dataset.alarm;
      $('confirmTitle').textContent = b.querySelector('span').textContent + (drill ? ' tatbikatı' : ' alarmı') + ' başlatılsın mı?';
      $('confirmBox').classList.remove('hidden');
      $('confirmBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });
  $('confirmNo').onclick = () => { pendingAlarm = null; $('confirmBox').classList.add('hidden'); };
  $('confirmYes').onclick = async () => {
    if (!pendingAlarm) return;
    const r = await api('POST', '/alarm', { type: pendingAlarm, drill });
    pendingAlarm = null;
    $('confirmBox').classList.add('hidden');
    if (!r.ok) alert(r.error);
    scrollTo(0, 0);
  };
  $('bStop').onclick = () => api('POST', '/stop');
  $('ringNow').onclick = async () => {
    const r = await api('POST', '/bell/ring', { bell: 'student' });
    if (!r.ok) alert(r.error);
  };
  $('skipNext').onclick = async () => {
    const r = await api('POST', '/bell/skip');
    if (!r.ok) alert(r.error);
  };
  $('annSend').onclick = async () => {
    const text = $('annText').value.trim();
    if (!text) return;
    const r = await api('POST', '/announce', { text, repeat: Number($('annRepeat').value) });
    if (r.ok) $('annText').value = '';
    else alert(r.error);
  };

  // ---------- Ayarlar yükle ----------
  async function loadConfig() {
    config = await api('GET', '/config');
    fillBell();
    fillBoard();
    fillSettings();
    if (state) renderState();
  }

  // ---------- Zil ----------
  function renderTodayProgs() {
    if (!config) return;
    const box = $('todayProgs');
    box.innerHTML = '';
    for (const [id, p] of Object.entries(config.programs)) {
      const b = el('button', 'pill' + (state.day.programId === id ? ' on' : ''), p.name);
      b.onclick = async () => { await api('POST', '/program/today', { program: id }); };
      box.appendChild(b);
    }
  }

  let editing = null;
  function fillBell() {
    const sel = $('editProg');
    sel.innerHTML = '';
    for (const [id, p] of Object.entries(config.programs)) {
      const o = el('option', '', p.name + (id === config.activeProgram ? ' (varsayılan)' : ''));
      o.value = id;
      sel.appendChild(o);
    }
    if (!editing || !config.programs[editing]) editing = config.activeProgram;
    sel.value = editing;
    renderProgEditor();
    $('breakMusic').checked = !!config.breakMusic;
  }
  $('editProg').onchange = () => { editing = $('editProg').value; renderProgEditor(); };

  function renderProgEditor() {
    const p = config.programs[editing];
    $('progName').value = p.name;
    $('progOffset').value = p.teacherBellOffset || 0;
    $('progSilent').checked = !!p.silent;
    const box = $('lessonRows');
    box.innerHTML = '';
    p.lessons.forEach((l, i) => {
      const row = el('div', 'lesson');
      const s = el('input'); s.type = 'time'; s.value = l.start; s.setAttribute('aria-label', (i + 1) + '. ders giriş');
      const e = el('input'); e.type = 'time'; e.value = l.end; e.setAttribute('aria-label', (i + 1) + '. ders çıkış');
      s.onchange = () => { l.start = s.value; };
      e.onchange = () => { l.end = e.value; };
      const x = el('button', 'x', '×'); x.setAttribute('aria-label', (i + 1) + '. dersi sil');
      x.onclick = () => { p.lessons.splice(i, 1); renderProgEditor(); };
      row.append(el('span', 'n', (i + 1) + '. ders'), s, e, x);
      box.appendChild(row);
    });
  }
  $('addLesson').onclick = () => {
    const p = config.programs[editing];
    const last = p.lessons[p.lessons.length - 1];
    const add = (t, m) => { const [h, mm] = t.split(':').map(Number); const v = h * 60 + mm + m; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
    p.lessons.push(last ? { start: add(last.end, 10), end: add(last.end, 50) } : { start: '08:10', end: '08:50' });
    renderProgEditor();
  };
  $('saveProg').onclick = async () => {
    const p = config.programs[editing];
    p.name = $('progName').value.trim() || p.name;
    p.teacherBellOffset = Math.max(0, Math.min(10, Number($('progOffset').value) || 0));
    p.silent = $('progSilent').checked;
    p.lessons.sort((a, b) => a.start.localeCompare(b.start));
    const r = await api('PUT', '/programs', { programs: config.programs });
    flash('progMsg', r.ok ? 'Kaydedildi' : r.error, !r.ok);
    if (r.ok) loadConfig();
  };
  $('progDefault').onclick = async () => {
    const r = await api('PUT', '/programs', { programs: config.programs, activeProgram: editing });
    flash('progMsg', r.ok ? 'Varsayılan program değişti' : r.error, !r.ok);
    if (r.ok) loadConfig();
  };
  $('breakMusic').onchange = () => api('PUT', '/settings', { breakMusic: $('breakMusic').checked });

  // ---------- Törenler ----------
  const openEditors = new Set();
  function whenText(c) {
    if (c.mode === 'off') return 'Kapalı · çalmaz';
    if (c.mode === 'manual') return 'Sadece elle başlatılır';
    const r = c.rule;
    if (!r) return 'Otomatik saat tanımlı değil';
    const t = r.time === 'afterLast' ? 'son dersten sonra' : r.time;
    if (r.type === 'weekly') return 'Her ' + DAYS[r.day].toLowerCase() + ' · ' + t;
    if (r.type === 'yearly') return 'Her yıl ' + (r.dates || []).join(', ') + ' · ' + t;
    return '';
  }

  function renderCeremonies() {
    const box = $('cerList');
    box.innerHTML = '';
    for (const c of config.ceremonies) {
      const card = el('div', 'cer');
      const head = el('div');
      head.append(el('div', 'cer-name', c.name), el('div', 'cer-when', whenText(c)));
      const seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', c.name + ' çalışma şekli');
      for (const [m, label] of [['auto', 'Otomatik'], ['manual', 'Elle'], ['off', 'Kapalı']]) {
        const b = el('button', c.mode === m ? 'on' : '', label);
        b.setAttribute('aria-pressed', c.mode === m);
        b.onclick = async () => {
          if (m === 'auto' && !c.rule) { openEditors.add(c.id); }
          c.mode = m;
          await api('PUT', '/ceremonies/' + c.id, { mode: m });
          renderCeremonies();
        };
        seg.appendChild(b);
      }
      const chips = el('div', 'chips');
      for (const s of c.steps) chips.appendChild(el('span', '', STEP_NAMES[s.type] + (s.seconds ? ' ' + Math.round(s.seconds / 60 * 10) / 10 + ' dk' : '')));
      const actions = el('div', 'row');
      const start = el('button', 'btn primary grow', 'Şimdi başlat');
      const running = state && state.mode === 'ceremony' && state.ceremony.id === c.id;
      if (running) start.textContent = 'Çalıyor…';
      start.disabled = !!running || (state && state.mode === 'alarm');
      start.onclick = async () => {
        const r = await api('POST', '/ceremonies/' + c.id + '/start');
        if (!r.ok) alert(r.error);
      };
      const edit = el('button', 'btn', openEditors.has(c.id) ? 'Kapat' : 'Düzenle');
      edit.onclick = () => { openEditors.has(c.id) ? openEditors.delete(c.id) : openEditors.add(c.id); renderCeremonies(); };
      actions.append(start, edit);
      card.append(head, seg, chips, actions);
      if (openEditors.has(c.id)) card.appendChild(cerEditor(c));
      box.appendChild(card);
    }
  }

  function cerEditor(c) {
    const box = el('div', 'cer-edit open');
    const draft = JSON.parse(JSON.stringify(c));
    const name = el('input'); name.value = draft.name; name.setAttribute('aria-label', 'Tören adı');
    const type = el('select'); type.setAttribute('aria-label', 'Otomatik çalışma zamanı');
    for (const [v, t] of [['none', 'Otomatik zaman yok'], ['weekly', 'Her hafta'], ['yearly', 'Her yıl belirli günler']]) { const o = el('option', '', t); o.value = v; type.appendChild(o); }
    type.value = draft.rule ? draft.rule.type : 'none';
    const day = el('select'); day.setAttribute('aria-label', 'Gün');
    DAYS.forEach((d, i) => { const o = el('option', '', d); o.value = i; day.appendChild(o); });
    const dates = el('input'); dates.placeholder = 'AA-GG, AA-GG (örn. 11-10, 03-18)'; dates.setAttribute('aria-label', 'Tarihler');
    const time = el('input'); time.type = 'time'; time.setAttribute('aria-label', 'Saat');
    const afterLastWrap = el('label', 'check');
    const afterLast = el('input'); afterLast.type = 'checkbox';
    afterLastWrap.append(afterLast, document.createTextNode('Son ders bitince'));
    const schoolWrap = el('label', 'check');
    const school = el('input'); school.type = 'checkbox';
    schoolWrap.append(school, document.createTextNode('Sadece ders günlerinde çalsın'));
    const r = draft.rule || {};
    day.value = r.day != null ? r.day : 1;
    dates.value = (r.dates || []).join(', ');
    afterLast.checked = r.time === 'afterLast';
    time.value = r.time && r.time !== 'afterLast' ? r.time : '08:00';
    school.checked = r.onlySchoolDays !== false;
    const ruleBox = el('div');
    function syncRule() {
      ruleBox.innerHTML = '';
      if (type.value === 'none') return;
      ruleBox.append(type.value === 'weekly' ? day : dates);
      const row = el('div', 'row');
      row.append(time, afterLastWrap);
      ruleBox.append(row, schoolWrap);
      time.disabled = afterLast.checked;
    }
    type.onchange = syncRule;
    afterLast.onchange = syncRule;
    syncRule();

    const stepsBox = el('div');
    function renderSteps() {
      stepsBox.innerHTML = '';
      draft.steps.forEach((s, i) => {
        const row = el('div', 'step-row');
        const t = el('select'); t.setAttribute('aria-label', (i + 1) + '. adım');
        for (const [v, n] of Object.entries(STEP_NAMES)) { const o = el('option', '', n); o.value = v; t.appendChild(o); }
        t.value = s.type;
        const sec = el('input'); sec.type = 'number'; sec.min = 5; sec.max = 600; sec.setAttribute('aria-label', 'Süre (sn)');
        sec.value = s.seconds || 60;
        sec.disabled = s.type === 'anthem';
        t.onchange = () => { s.type = t.value; if (s.type === 'anthem') delete s.seconds; else s.seconds = Number(sec.value) || 60; renderSteps(); };
        sec.onchange = () => { s.seconds = Math.max(5, Math.min(600, Number(sec.value) || 60)); };
        const x = el('button', 'x btn', '×'); x.setAttribute('aria-label', 'Adımı sil');
        x.onclick = () => { draft.steps.splice(i, 1); renderSteps(); };
        row.append(t, sec, x);
        stepsBox.appendChild(row);
      });
    }
    renderSteps();
    const addStep = el('button', 'btn grow', '+ Adım ekle');
    addStep.onclick = () => { draft.steps.push({ type: 'silence', seconds: 60 }); renderSteps(); };
    const save = el('button', 'btn primary grow', 'Kaydet');
    const del = el('button', 'btn', 'Sil');
    const msg = el('p', 'msg');
    save.onclick = async () => {
      let rule = null;
      if (type.value === 'weekly') rule = { type: 'weekly', day: Number(day.value) };
      if (type.value === 'yearly') {
        const ds = dates.value.split(',').map((x) => x.trim()).filter((x) => /^\d{2}-\d{2}$/.test(x));
        if (!ds.length) { msg.textContent = 'Tarihleri AA-GG şeklinde yazın'; msg.classList.add('bad'); return; }
        rule = { type: 'yearly', dates: ds };
      }
      if (rule) {
        rule.time = afterLast.checked ? 'afterLast' : time.value;
        rule.onlySchoolDays = school.checked;
      }
      if (!draft.steps.length) { msg.textContent = 'En az bir adım ekleyin'; msg.classList.add('bad'); return; }
      const res = await api('PUT', '/ceremonies/' + c.id, { name: name.value.trim() || c.name, rule, steps: draft.steps, mode: !rule && c.mode === 'auto' ? 'manual' : c.mode });
      if (res.ok) { openEditors.delete(c.id); await loadConfig(); }
      else { msg.textContent = res.error; msg.classList.add('bad'); }
    };
    del.onclick = async () => {
      if (!confirm(c.name + ' silinsin mi?')) return;
      await api('DELETE', '/ceremonies/' + c.id);
      await loadConfig();
    };
    const l1 = el('label', '', 'Tören adı');
    const l2 = el('label', '', 'Otomatik çalışma');
    const l3 = el('label', '', 'Adımlar (süre saniye)');
    const r1 = el('div', 'row'); r1.append(addStep);
    const r2 = el('div', 'row'); r2.append(save, del);
    box.append(l1, name, l2, type, ruleBox, l3, stepsBox, r1, r2, msg);
    return box;
  }
  $('addCer').onclick = async () => {
    const r = await api('POST', '/ceremonies', { name: 'Yeni tören' });
    if (r.ok) { openEditors.add(r.id); await loadConfig(); }
  };

  // ---------- Pano ----------
  function fillBoard() {
    const b = config.board;
    $('bAnn').value = (b.announcements || []).join('\n');
    $('bDuty').value = (b.duty || []).map((d) => d.place + ': ' + d.name).join('\n');
    $('bMenu').value = (b.menu || []).join('\n');
    $('bTicker').value = b.ticker || '';
  }
  const lines = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
  $('saveBoard').onclick = async () => {
    const duty = lines('bDuty').map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { place: l.slice(0, i).trim(), name: l.slice(i + 1).trim() } : { place: l, name: '' };
    });
    const r = await api('PUT', '/board', { announcements: lines('bAnn'), duty, menu: lines('bMenu'), ticker: $('bTicker').value.trim() });
    flash('boardMsg', r.ok ? 'Panoda yayında' : r.error, !r.ok);
  };

  // ---------- Ayarlar ----------
  let days = [];
  function fillSettings() {
    $('sSchool').value = config.schoolName;
    $('sArea').value = (config.emergency && config.emergency.assemblyArea) || '';
    days = [...config.weekdays];
    renderDays();
    $('sHol').value = (config.holidays || []).map((h) => h.date + ' ' + h.name).join('\n');
    $('sBreaks').value = (config.breaks || []).map((b) => b.from + ' ' + b.to + ' ' + b.name).join('\n');
    const tests = $('soundTests');
    tests.innerHTML = '';
    for (const [k, n] of [['student', 'Öğrenci zili'], ['teacher', 'Öğretmen zili'], ['end', 'Çıkış zili'], ['siren', 'Siren'], ['chime', 'Anons sesi'], ['deprem', 'Deprem'], ['yangin', 'Yangın']]) {
      const b = el('button', 'pill', n);
      b.onclick = () => api('POST', '/test-sound', { sound: k });
      tests.appendChild(b);
    }
  }
  function renderDays() {
    const box = $('sDays');
    box.innerHTML = '';
    [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
      const b = el('button', 'pill' + (days.includes(d) ? ' on' : ''), SHORT[d]);
      b.setAttribute('aria-pressed', days.includes(d));
      b.onclick = () => { days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; renderDays(); };
      box.appendChild(b);
    });
  }
  $('saveSet').onclick = async () => {
    const holidays = [];
    for (const l of lines('sHol')) {
      const m = l.match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\s+(.+)$/);
      if (!m) return flash('setMsg', 'Tatil satırı hatalı: ' + l, true);
      holidays.push({ date: m[1], name: m[2] });
    }
    const breaks = [];
    for (const l of lines('sBreaks')) {
      const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      if (!m) return flash('setMsg', 'Uzun tatil satırı hatalı: ' + l, true);
      breaks.push({ from: m[1], to: m[2], name: m[3] });
    }
    const newPin = $('sPin').value.trim();
    if (newPin && !/^\d{4,8}$/.test(newPin)) return flash('setMsg', 'PIN 4–8 rakam olmalı', true);
    const r = await api('PUT', '/settings', {
      schoolName: $('sSchool').value.trim(),
      emergency: { assemblyArea: $('sArea').value.trim() },
      weekdays: days, holidays, breaks, newPin: newPin || undefined
    });
    if (r.ok && newPin) { pin = newPin; try { localStorage.setItem('zilPin', pin); } catch (e) {} $('sPin').value = ''; }
    flash('setMsg', r.ok ? 'Kaydedildi' : r.error, !r.ok);
    if (r.ok) loadConfig();
  };

  async function loadExtras() {
    const info = await api('GET', '/info');
    const box = $('info');
    box.innerHTML = '';
    if (info.addresses) {
      box.appendChild(el('div', '', 'Telefondan açmak için (okul ağında):'));
      for (const a of info.addresses) box.appendChild(el('div', '', 'http://' + a + ':' + info.port + '/panel/'));
      box.appendChild(el('div', '', 'Ses dosyaları klasörü: ' + info.soundsDir));
    }
    const log = await api('GET', '/log');
    const lb = $('logList');
    lb.innerHTML = '';
    for (const l of (Array.isArray(log) ? log : []).slice(0, 40)) lb.appendChild(el('div', 'item', l));
  }
})();
