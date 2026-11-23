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

  // ---------- Panel teması (otomatik / açık / koyu) ----------
  const THEME_ICONS = {
    auto: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/></svg>',
    light: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>'
  };
  const THEME_NAMES = { auto: 'Otomatik', light: 'Açık', dark: 'Koyu' };
  let themePref = 'auto';
  try { themePref = localStorage.getItem('zilTheme') || 'auto'; } catch (e) {}
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = themePref === 'dark' || (themePref === 'auto' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const b = $('themeBtn');
    b.innerHTML = THEME_ICONS[themePref];
    b.title = 'Panel teması: ' + THEME_NAMES[themePref];
    b.setAttribute('aria-label', b.title);
  }
  $('themeBtn').onclick = () => {
    themePref = { auto: 'light', light: 'dark', dark: 'auto' }[themePref];
    try { localStorage.setItem('zilTheme', themePref); } catch (e) {}
    applyTheme();
  };
  darkQuery.addEventListener('change', applyTheme);
  applyTheme();

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
      renderState();
    });
    es.onerror = () => {
      $('hConn').textContent = 'Sunucuya bağlantı yok';
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
    const lg = state.display && state.display.logo;
    const hl = $('hLogo');
    if (lg) { const src = '/media/' + encodeURIComponent(lg); if (hl.getAttribute('src') !== src) hl.src = src; }
    hl.classList.toggle('hidden', !lg);
    const a = state.audio || { panos: 0, ready: 0 };
    const audioMsg = a.ready ? 'Ses çıkışı hazır' : a.panos ? 'Ses kapalı: panoya tıklayın' : 'Pano açık değil, ses çıkmaz';
    $('hConn').textContent = audioMsg;
    $('hConn').classList.toggle('bad', !a.ready);
    $('audioWarn').classList.toggle('hidden', !!a.ready);
    $('audioWarn').textContent = a.panos
      ? 'Pano sayfası açık ama sesi kapalı. Sistem odasındaki bilgisayarda pano ekranına bir kez tıklayın.'
      : 'Ses çalacak pano sayfası açık değil. Sistem odasındaki bilgisayarda Chrome ile http://localhost:3000/pano/ adresini açın ve ekrana bir kez tıklayın.';
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
      const c = state.ceremony;
      const st = c.steps[c.step] || {};
      b.classList.toggle('ready', !!c.waiting);
      b.classList.toggle('cer', !c.waiting);
      $('bTag').textContent = c.waiting ? "EKRAN AÇIK · KOMUT BEKLİYOR" : "ŞU AN ÇALIYOR";
      $('bName').textContent = c.name + ' · ' + (STEP_NAMES[st.type] || '');
      $('bSub').textContent = c.waiting
        ? (c.autoGoAt ? 'Otomatik başlama: ' + new Date(c.autoGoAt).toTimeString().slice(0, 5) + ' (isterseniz şimdi başlatın)' : 'Öğretmen işaret verince "Başlat"a basın. Sistem odasında Enter tuşu da başlatır.')
        : '';
      $('bStop').textContent = c.waiting ? 'Ekranı kapat' : 'Durdur';
    }
    $('bGo').classList.toggle('hidden', !(state.mode === 'ceremony' && state.ceremony.waiting));
    if (state.mode !== 'ceremony') { b.classList.remove('ready'); $('bSub').textContent = ''; }
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
  $('bGo').onclick = async () => {
    const r = await api('POST', '/ceremony/go');
    if (!r.ok) alert(r.error);
  };
  $('ringNow').onclick = async () => {
    const r = await api('POST', '/bell/ring', { bell: 'student' });
    if (!r.ok) alert(r.error);
    else if (r.warning) alert(r.warning);
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
    fillAnthem();
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

  // Tören ekranları için görsel yükleme (dosya adını döndürür)
  async function uploadImage(file) {
    const r = await fetch('/api/image/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'x-pin': pin, 'Content-Type': 'application/octet-stream' }, body: file }).then((x) => x.json()).catch(() => ({ ok: false, error: 'Bağlantı hatası' }));
    if (!r.ok) { alert(r.error || 'Görsel yüklenemedi'); return null; }
    return r.file;
  }
  function imgPreview(box, file, emptyText) {
    box.innerHTML = '';
    if (file) { const i = el('img'); i.alt = ''; i.src = '/media/' + encodeURIComponent(file); box.appendChild(i); }
    else box.appendChild(el('span', '', emptyText));
  }

  // ---------- İstiklal Marşı ekranı ----------
  const ANTHEM_DEFAULTS = { bg: '#C8102E', kicker: 'LÜTFEN AYAĞA KALKINIZ', title: 'İstiklal Marşı', showCeremonyName: true, showFlag: true, image: null, showProgress: true };
  function fillAnthem() {
    const a = { ...ANTHEM_DEFAULTS, ...(config.display.anthemScreen || {}) };
    $('anKicker').value = a.kicker;
    $('anTitle').value = a.title;
    $('anBg').value = a.bg;
    $('anName').checked = !!a.showCeremonyName;
    $('anFlag').checked = !!a.showFlag;
    $('anProgress').checked = !!a.showProgress;
    imgPreview($('anImgPrev'), a.image, 'Görsel yok');
    $('anImgDel').disabled = !a.image;
  }
  async function saveAnthem(patch) {
    config.display.anthemScreen = { ...ANTHEM_DEFAULTS, ...(config.display.anthemScreen || {}), ...patch };
    const r = await api('PUT', '/display', { anthemScreen: patch });
    flash('anMsg', r.ok ? 'Kaydedildi' : r.error, !r.ok);
    fillAnthem();
  }
  $('anKicker').onchange = () => saveAnthem({ kicker: $('anKicker').value });
  $('anTitle').onchange = () => saveAnthem({ title: $('anTitle').value.trim() || 'İstiklal Marşı' });
  $('anBg').onchange = () => saveAnthem({ bg: $('anBg').value });
  $('anName').onchange = () => saveAnthem({ showCeremonyName: $('anName').checked });
  $('anFlag').onchange = () => saveAnthem({ showFlag: $('anFlag').checked });
  $('anProgress').onchange = () => saveAnthem({ showProgress: $('anProgress').checked });
  $('anImgInput').onchange = async () => {
    const f = $('anImgInput').files[0];
    $('anImgInput').value = '';
    if (!f) return;
    const file = await uploadImage(f);
    if (file) saveAnthem({ image: file });
  };
  $('anImgDel').onclick = () => saveAnthem({ image: null });

  // ---------- Törenler ----------
  const openEditors = new Set();
  function soundText(c) {
    if (c.soundStart !== 'auto') return 'ses öğretmen komutuyla başlar';
    return c.mode === 'auto' && c.soundDelay > 0 ? 'ses ' + c.soundDelay + ' dk sonra kendiliğinden başlar' : 'ses ekranla birlikte başlar';
  }
  function whenText(c) {
    if (c.mode === 'off') return 'Kapalı · çalmaz';
    if (c.mode === 'manual') return 'Ekran elle açılır · ' + soundText(c);
    const r = c.rule;
    if (!r) return 'Otomatik saat tanımlı değil';
    const t = r.time === 'afterLast' ? 'son dersten sonra' : r.time;
    const when = r.type === 'weekly' ? 'Her ' + DAYS[r.day].toLowerCase() : 'Her yıl ' + (r.dates || []).join(', ');
    return when + ' ' + t + ' ekran açılır · ' + soundText(c);
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
      const open = state && state.mode === 'ceremony' && state.ceremony.id === c.id;
      const waiting = open && state.ceremony.waiting;
      let start;
      if (waiting) {
        start = el('button', 'btn go-big grow', '▶ Başlat');
        start.onclick = async () => { const r = await api('POST', '/ceremony/go'); if (!r.ok) alert(r.error); };
        const close = el('button', 'btn', 'Ekranı kapat');
        close.onclick = () => api('POST', '/stop');
        actions.append(start, close);
      } else if (open) {
        start = el('button', 'btn primary grow', 'Çalıyor…');
        start.disabled = true;
        const stop = el('button', 'btn', 'Durdur');
        stop.onclick = () => api('POST', '/stop');
        actions.append(start, stop);
      } else {
        start = el('button', 'btn primary grow', c.soundStart === 'auto' ? 'Başlat' : 'Ekranı aç');
        start.disabled = !!(state && state.mode !== 'normal');
        start.onclick = async () => {
          const r = await api('POST', '/ceremonies/' + c.id + '/start');
          if (!r.ok) alert(r.error);
        };
      }
      const edit = el('button', 'btn', openEditors.has(c.id) ? 'Kapat' : 'Düzenle');
      edit.onclick = () => { openEditors.has(c.id) ? openEditors.delete(c.id) : openEditors.add(c.id); renderCeremonies(); };
      actions.append(...(open ? [] : [start]), edit);
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

    const sound = el('select'); sound.setAttribute('aria-label', 'Ses ne zaman başlasın');
    for (const [v, t] of [['command', 'Öğretmen komutuyla (ekran açılır, "Başlat"a basılınca çalar)'], ['auto', 'Kendiliğinden']]) { const o = el('option', '', t); o.value = v; sound.appendChild(o); }
    sound.value = draft.soundStart === 'auto' ? 'auto' : 'command';
    const delayWrap = el('div');
    const delayLabel = el('label', '', 'Otomatik açılışta ekran açıldıktan kaç dakika sonra çalsın (0 = hemen)');
    const delay = el('input'); delay.type = 'number'; delay.min = 0; delay.max = 120; delay.value = draft.soundDelay || 0;
    delayLabel.htmlFor = delay.id = 'delay-' + c.id;
    delayWrap.append(delayLabel, delay);
    const syncSound = () => delayWrap.classList.toggle('hidden', sound.value !== 'auto');
    sound.onchange = syncSound;
    syncSound();

    // Saygı duruşu ekranı (siren / sessiz adımlarda görünür)
    const SCREEN_DEFAULTS = { bg: '#121212', kicker: '', title: 'Saygı Duruşu', message: '', image: null, grayscale: false, showSteps: true };
    draft.screen = { ...SCREEN_DEFAULTS, ...(draft.screen || {}) };
    const scrBox = el('div', 'screen-edit');
    function renderScreenEdit() {
      scrBox.innerHTML = '';
      const hasSaygi = draft.steps.some((s) => s.type !== 'anthem');
      scrBox.classList.toggle('hidden', !hasSaygi);
      if (!hasSaygi) return;
      const S = draft.screen;
      const h3 = el('h3', '', 'Saygı duruşu ekranı');
      const mk = (labelText, input) => { const l = el('label', '', labelText); input.id = 'scr-' + c.id + '-' + Math.random().toString(36).slice(2, 7); l.htmlFor = input.id; return [l, input]; };
      const title = el('input'); title.value = S.title; title.oninput = () => { S.title = title.value; };
      const kicker = el('input'); kicker.value = S.kicker; kicker.placeholder = 'Boş bırakılırsa tarih ve saat yazar'; kicker.oninput = () => { S.kicker = kicker.value; };
      const msg = el('textarea'); msg.rows = 3; msg.value = S.message; msg.oninput = () => { S.message = msg.value; };
      const bg = el('input'); bg.type = 'color'; bg.value = S.bg; bg.oninput = () => { S.bg = bg.value; };
      const gl = el('label', 'check'); const g = el('input'); g.type = 'checkbox'; g.checked = !!S.grayscale; g.onchange = () => { S.grayscale = g.checked; };
      gl.append(g, document.createTextNode('Görseli siyah-beyaz göster'));
      const sl = el('label', 'check'); const sh = el('input'); sh.type = 'checkbox'; sh.checked = S.showSteps !== false; sh.onchange = () => { S.showSteps = sh.checked; };
      sl.append(sh, document.createTextNode('Adımları ve geri sayımı göster'));
      const prev = el('div', 'logo-prev');
      imgPreview(prev, S.image, 'Görsel yok');
      const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.className = 'hidden'; fi.id = 'scrimg-' + c.id;
      const pick = el('label', 'btn', 'Görsel seç'); pick.htmlFor = fi.id; pick.style.cssText = 'display:inline-flex;align-items:center;margin:0';
      const rm = el('button', 'btn', 'Kaldır'); rm.disabled = !S.image;
      fi.onchange = async () => { const f = fi.files[0]; fi.value = ''; if (!f) return; const file = await uploadImage(f); if (file) { S.image = file; renderScreenEdit(); } };
      rm.onclick = () => { S.image = null; renderScreenEdit(); };
      const imgRow = el('div', 'logo-row'); const btns = el('div', 'row'); btns.style.margin = '0'; btns.append(pick, rm); imgRow.append(prev, btns, fi);
      const colorRow = el('div', 'row'); const cl = el('label', 'grow', 'Arka plan rengi'); bg.id = 'scrbg-' + c.id; cl.htmlFor = bg.id; cl.style.margin = '0'; colorRow.append(cl, bg);
      scrBox.append(h3, ...mk('Başlık', title), ...mk('Üst yazı', kicker), ...mk('Mesaj', msg), el('div', 'k', 'Görsel (örn. Atatürk fotoğrafı)'), imgRow, gl, sl, colorRow);
    }

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
        if (i > 0) {
          const wl = el('label', 'check');
          const w = el('input'); w.type = 'checkbox'; w.checked = !!s.wait;
          w.onchange = () => { s.wait = w.checked; };
          wl.append(w, document.createTextNode('Bu adımdan önce öğretmen komutunu bekle'));
          stepsBox.appendChild(wl);
        }
      });
    }
    const _renderSteps = renderSteps;
    renderSteps = () => { _renderSteps(); renderScreenEdit(); };
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
      const res = await api('PUT', '/ceremonies/' + c.id, { name: name.value.trim() || c.name, rule, steps: draft.steps, screen: draft.screen, soundStart: sound.value, soundDelay: Number(delay.value) || 0, mode: !rule && c.mode === 'auto' ? 'manual' : c.mode });
      if (res.ok) { openEditors.delete(c.id); await loadConfig(); }
      else { msg.textContent = res.error; msg.classList.add('bad'); }
    };
    del.onclick = async () => {
      if (!confirm(c.name + ' silinsin mi?')) return;
      await api('DELETE', '/ceremonies/' + c.id);
      await loadConfig();
    };
    const l1 = el('label', '', 'Tören adı');
    const l2 = el('label', '', 'Ekran otomatik ne zaman açılsın');
    const l4 = el('label', '', 'Ses ne zaman başlasın');
    const l3 = el('label', '', 'Adımlar (süre saniye)');
    const r1 = el('div', 'row'); r1.append(addStep);
    const r2 = el('div', 'row'); r2.append(save, del);
    box.append(l1, name, l2, type, ruleBox, l4, sound, delayWrap, l3, stepsBox, r1, scrBox, r2, msg);
    return box;
  }
  $('addCer').onclick = async () => {
    const r = await api('POST', '/ceremonies', { name: 'Yeni tören' });
    if (r.ok) { openEditors.add(r.id); await loadConfig(); }
  };

  // ---------- Pano ----------
  function fillBoard() {
    fillDisplay();
    renderMedia();
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


  // ---------- TV görünümü ----------
  const ACCENTS = ['#F2A93B', '#4FC3A1', '#6CA8FF', '#FF7A59', '#C084FC', '#E30A17', '#FFFFFF'];
  function fillLogo() {
    const d = config.display;
    const prev = $('logoPrev');
    prev.innerHTML = '';
    prev.classList.toggle('bg', !!d.logoBg);
    if (d.logo) { const i = el('img'); i.alt = 'Okul logosu'; i.src = '/media/' + encodeURIComponent(d.logo); prev.appendChild(i); }
    else prev.appendChild(el('span', '', 'Logo yok'));
    $('logoDel').disabled = !d.logo;
    document.querySelectorAll('#logoSize .pill').forEach((b) => {
      const on = (d.logoSize || 'normal') === b.dataset.size;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    $('logoBg').checked = !!d.logoBg;
  }
  $('logoInput').onchange = async () => {
    const f = $('logoInput').files[0];
    if (!f) return;
    flash('logoMsg', 'Yükleniyor…');
    const r = await fetch('/api/logo/upload?name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'x-pin': pin, 'Content-Type': 'application/octet-stream' }, body: f }).then((x) => x.json()).catch(() => ({ ok: false, error: 'Bağlantı hatası' }));
    $('logoInput').value = '';
    flash('logoMsg', r.ok ? 'Logo TV\'lerde' : r.error, !r.ok);
    if (r.ok) loadConfig();
  };
  $('logoDel').onclick = async () => {
    if (!confirm('Logo kaldırılsın mı?')) return;
    await api('DELETE', '/logo');
    loadConfig();
  };
  document.querySelectorAll('#logoSize .pill').forEach((b) => { b.onclick = () => { saveDisplay({ logoSize: b.dataset.size }); fillLogo(); }; });
  $('logoBg').onchange = () => { saveDisplay({ logoBg: $('logoBg').checked }); fillLogo(); };

  const STATUS_DEFAULTS = { enabled: true, bigCountdown: true, breakText: 'TENEFFÜS', lunchText: 'ÖĞLE ARASI', warnText: 'SINIFLARINIZA GEÇİN', warnMinutes: 2, breakColor: '#2E9E5B', lunchColor: '#E07B1A', warnColor: '#F2C230' };
  const ST_FIELDS = { stBreakText: 'breakText', stLunchText: 'lunchText', stWarnText: 'warnText', stBreakColor: 'breakColor', stLunchColor: 'lunchColor', stWarnColor: 'warnColor', stWarnMin: 'warnMinutes' };
  function fillStatus() {
    const st = { ...STATUS_DEFAULTS, ...(config.display.status || {}) };
    $('stEnabled').checked = !!st.enabled;
    $('stBig').checked = !!st.bigCountdown;
    for (const [id, k] of Object.entries(ST_FIELDS)) $(id).value = st[k];
  }
  function saveStatus(patch) {
    config.display.status = { ...STATUS_DEFAULTS, ...(config.display.status || {}), ...patch };
    api('PUT', '/display', { status: patch });
  }
  $('stEnabled').onchange = () => saveStatus({ enabled: $('stEnabled').checked });
  $('stBig').onchange = () => saveStatus({ bigCountdown: $('stBig').checked });
  for (const [id, k] of Object.entries(ST_FIELDS)) {
    $(id).onchange = () => {
      let v = $(id).value;
      if (k === 'warnMinutes') v = Number(v) || 0;
      else if (!k.endsWith('Color')) v = v.trim() || STATUS_DEFAULTS[k];
      saveStatus({ [k]: v });
      fillStatus();
    };
  }
  $('stReset').onclick = () => { saveStatus({ ...STATUS_DEFAULTS }); fillStatus(); };

  function fillDisplay() {
    const d = config.display;
    fillLogo();
    fillStatus();
    document.querySelectorAll('#tvTheme .theme-opt').forEach((b) => {
      b.classList.toggle('on', b.dataset.theme === d.theme);
      b.setAttribute('aria-pressed', b.dataset.theme === d.theme);
    });
    document.querySelectorAll('#tvLayout .layout-opt').forEach((b) => {
      b.classList.toggle('on', b.dataset.layout === d.layout);
      b.setAttribute('aria-pressed', b.dataset.layout === d.layout);
    });
    const sw = $('tvAccent');
    sw.innerHTML = '';
    for (const c of ACCENTS) {
      const b = el('button', 'swatch' + (c.toLowerCase() === (d.accent || '').toLowerCase() ? ' on' : ''));
      b.style.background = c;
      b.setAttribute('aria-label', 'Vurgu rengi ' + c);
      b.onclick = () => saveDisplay({ accent: c });
      sw.appendChild(b);
    }
    const custom = el('input');
    custom.type = 'color';
    custom.value = d.accent || '#F2A93B';
    custom.setAttribute('aria-label', 'Özel renk');
    custom.onchange = () => saveDisplay({ accent: custom.value });
    sw.appendChild(custom);
    $('tvDuty').checked = d.showDuty !== false;
    $('tvMenu').checked = d.showMenu !== false;
    $('tvBreaks').checked = !!d.mediaOnlyBreaks;
  }
  async function saveDisplay(patch) {
    Object.assign(config.display, patch);
    fillDisplay();
    const r = await api('PUT', '/display', patch);
    if (!r.ok) flash('mediaMsg', r.error || 'Kaydedilemedi', true);
  }
  // Temanın kendi vurgu rengi de seçilir (sonradan değiştirilebilir)
  const THEME_ACCENT = { dark: '#F2A93B', light: '#F2A93B', ocean: '#6CA8FF', forest: '#4FC3A1', flag: '#FFFFFF', sand: '#FF7A59', contrast: '#F2A93B' };
  document.querySelectorAll('#tvTheme .theme-opt').forEach((b) => { b.onclick = () => saveDisplay({ theme: b.dataset.theme, accent: THEME_ACCENT[b.dataset.theme] }); });
  document.querySelectorAll('#tvLayout .layout-opt').forEach((b) => { b.onclick = () => { saveDisplay({ layout: b.dataset.layout }); renderMedia(); }; });
  $('tvDuty').onchange = () => saveDisplay({ showDuty: $('tvDuty').checked });
  $('tvMenu').onchange = () => saveDisplay({ showMenu: $('tvMenu').checked });
  $('tvBreaks').onchange = () => { saveDisplay({ mediaOnlyBreaks: $('tvBreaks').checked }); renderMedia(); };

  // ---------- Medya ----------
  function renderMedia() {
    const box = $('mediaList');
    box.innerHTML = '';
    const list = config.media || [];
    if (!list.length) { box.appendChild(el('p', 'm-meta', 'Henüz medya eklenmedi.')); return; }
    // Medya var ama TV'de neden görünmüyor? Kullanıcıya söyle.
    const d = config.display || {};
    let why = null;
    if (!list.some((m) => m.enabled !== false)) why = 'Hiçbir medya "Yayında" değil, TV\'de görünmez.';
    else if (d.layout === 'classic') why = 'TV şu an Klasik düzende; medya sadece "Medya + bilgi" ya da "Tam ekran medya" düzeninde görünür.';
    if (why) {
      const w = el('div', 'warn');
      w.style.margin = '0 0 12px';
      w.append(document.createTextNode(why + ' '));
      if (d.layout === 'classic') {
        const b = el('button', 'btn small', 'Medya + bilgi düzenine geç');
        b.style.marginTop = '8px';
        b.onclick = () => { saveDisplay({ layout: 'media' }); renderMedia(); };
        w.append(el('br'), b);
      }
      box.appendChild(w);
    } else if (d.mediaOnlyBreaks) {
      box.appendChild(el('p', 'm-meta', 'Not: "Sadece teneffüste göster" açık; ders sırasında TV Klasik düzende kalır.'));
    }
    list.forEach((m, i) => {
      const row = el('div', 'media-item' + (m.enabled === false ? ' off' : ''));
      let thumb;
      if (m.type === 'image') { thumb = el('img', 'm-thumb'); thumb.alt = ''; thumb.src = '/media/' + encodeURIComponent(m.file); }
      else { thumb = el('video', 'm-thumb'); thumb.muted = true; thumb.preload = 'metadata'; thumb.src = '/media/' + encodeURIComponent(m.file) + '#t=1'; }
      const body = el('div', 'm-body');
      body.append(el('div', 'm-title', m.name), el('div', 'm-meta', (m.type === 'image' ? 'Resim / afiş' : 'Video') + ' · ' + (i + 1) + '. sırada'));
      const ctrl = el('div', 'm-ctrl');
      if (m.type === 'image') {
        const dur = el('input'); dur.type = 'number'; dur.min = 3; dur.max = 600; dur.value = m.duration || 10;
        dur.setAttribute('aria-label', m.name + ' gösterim süresi (sn)');
        dur.onchange = () => { m.duration = Math.max(3, Math.min(600, Number(dur.value) || 10)); saveMedia(); };
        ctrl.append(dur, el('span', 'm-meta', 'sn'));
      } else {
        const sl = el('label', 'check'); const s = el('input'); s.type = 'checkbox'; s.checked = !!m.sound;
        s.onchange = () => { m.sound = s.checked; saveMedia(); };
        sl.append(s, document.createTextNode('Sesli'));
        ctrl.append(sl);
      }
      const onl = el('label', 'check'); const on = el('input'); on.type = 'checkbox'; on.checked = m.enabled !== false;
      on.onchange = () => { m.enabled = on.checked; saveMedia(); renderMedia(); };
      onl.append(on, document.createTextNode('Yayında'));
      const up = el('button', 'btn small', '↑'); up.setAttribute('aria-label', 'Yukarı taşı'); up.disabled = i === 0;
      up.onclick = () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); saveMedia(); renderMedia(); };
      const down = el('button', 'btn small', '↓'); down.setAttribute('aria-label', 'Aşağı taşı'); down.disabled = i === list.length - 1;
      down.onclick = () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); saveMedia(); renderMedia(); };
      const del = el('button', 'btn small', 'Sil');
      del.onclick = async () => {
        if (!confirm(m.name + ' silinsin mi?')) return;
        await api('DELETE', '/media/' + m.id);
        await loadConfig();
      };
      ctrl.append(onl, up, down, del);
      body.append(ctrl);
      row.append(thumb, body);
      box.appendChild(row);
    });
  }
  async function saveMedia() {
    const items = config.media.map((m) => ({ id: m.id, duration: m.duration, sound: !!m.sound, enabled: m.enabled !== false }));
    const r = await api('PUT', '/media', { items });
    flash('mediaMsg', r.ok ? 'Kaydedildi' : r.error, !r.ok);
  }

  function uploadOne(file, i, total) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload?name=' + encodeURIComponent(file.name));
      xhr.setRequestHeader('x-pin', pin);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        $('upBar').style.width = Math.round((e.loaded / e.total) * 100) + '%';
        $('upText').textContent = (total > 1 ? (i + 1) + '/' + total + ' · ' : '') + file.name + ' · %' + Math.round((e.loaded / e.total) * 100);
      };
      xhr.onload = () => {
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch (e) {}
        resolve(r.ok ? null : (r.error || 'Yüklenemedi') + ': ' + file.name);
      };
      xhr.onerror = () => resolve('Bağlantı hatası: ' + file.name);
      xhr.send(file);
    });
  }
  async function uploadFiles(files) {
    files = [...files];
    if (!files.length) return;
    $('upProgressWrap').classList.remove('hidden');
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      $('upBar').style.width = '0';
      const err = await uploadOne(files[i], i, files.length);
      if (err) errors.push(err);
    }
    $('upProgressWrap').classList.add('hidden');
    $('fileInput').value = '';
    flash('mediaMsg', errors.length ? errors.join(' · ') : 'Yüklendi', !!errors.length);
    await loadConfig();
  }
  $('fileInput').onchange = () => uploadFiles($('fileInput').files);
  const dz = $('dropZone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); uploadFiles(e.dataTransfer.files); });

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
