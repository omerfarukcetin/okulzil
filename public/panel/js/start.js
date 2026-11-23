// Giriş, gezinme, canlı bağlantı ve üst şerit
'use strict';
(function () {
  const NAV = [
    ['home', 'Ana sayfa', 'home'],
    ['bell', 'Zil', 'bell'],
    ['cer', 'Törenler', 'flag'],
    ['board', 'Duyurular', 'megaphone'],
    ['set', 'Ayarlar', 'settings']
  ];

  // ---------- Gezinme ----------
  function buildNav() {
    for (const holder of [$('#nav'), $('#tabbar')]) {
      holder.innerHTML = '';
      for (const [id, label, ic] of NAV) {
        const b = h('button', { type: 'button', 'data-page': id }, icon(ic), h('span', { text: label }));
        b.onclick = () => App.go(id);
        holder.appendChild(b);
      }
    }
  }
  App.go = function (page, sub) {
    const prev = App.pages[App.page];
    if (prev && prev.leave && page !== App.page) prev.leave();
    App.page = page;
    if (sub) App.sub[page] = sub;
    document.querySelectorAll('[data-page]').forEach((b) => { if (b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    App.render();
    scrollTo(0, 0);
  };
  App.render = function () {
    const root = $('#page');
    const y = scrollY;
    root.innerHTML = '';
    const p = App.pages[App.page];
    if (p && App.config && App.state) p.render(root);
    scrollTo(0, y);
  };
  App.reloadConfig = async function (rerender = true) {
    const c = await api('GET', '/config');
    if (c && c.programs) App.config = c;
    if (rerender) App.render();
  };

  // ---------- Üst şerit ve durum ----------
  function renderChrome() {
    const s = App.state;
    if (!s) return;
    for (const el of [$('#brandName'), $('#topName')]) el.textContent = s.schoolName;
    const logo = s.display && s.display.logo;
    for (const el of [$('#brandLogo'), $('#topLogo')]) {
      if (logo) { const src = mediaUrl(logo); if (el.getAttribute('src') !== src) el.src = src; }
      el.classList.toggle('hidden', !logo);
    }
    const a = s.audio || {};
    const [cls, txt] = a.ready ? ['ok', 'Ses çıkışı hazır'] : a.panos ? ['warn', 'Ses kapalı: panoya tıklayın'] : ['bad', 'TV panosu açık değil'];
    for (const el of [$('#brandStatus'), $('#topStatus')]) {
      el.className = 'status-pill ' + cls;
      el.querySelector('.txt').textContent = txt;
    }
    renderBanner();
  }

  function renderBanner() {
    const s = App.state;
    const box = $('#banner');
    box.innerHTML = '';
    if (s.mode === 'alarm') {
      box.appendChild(h('div', { class: 'banner ' + (s.alarm.drill ? 'drill' : 'alarm') },
        icon('siren', 'lg'),
        h('div', { class: 'b-main' }, h('div', { class: 'b-tag', text: s.alarm.drill ? 'TATBİKAT' : 'GERÇEK ALARM' }), h('div', { class: 'b-name', text: s.alarm.name + ' alarmı çalıyor' }), h('div', { class: 'b-sub', text: 'Tüm katlarda ses ve ekran aktif' })),
        h('button', { class: 'btn lg light', type: 'button', onclick: () => api('POST', '/stop') }, icon('stop'), 'Alarmı durdur')));
    } else if (s.mode === 'ceremony') {
      const c = s.ceremony;
      const st = c.steps[c.step] || {};
      const sub = c.waiting
        ? (c.autoGoAt ? 'Kendiliğinden başlama: ' + new Date(c.autoGoAt).toTimeString().slice(0, 5) + ' · isterseniz şimdi başlatın' : 'Öğretmen işaret verince Başlat\'a basın. Sistem odasında Enter tuşu da başlatır.')
        : 'TV\'lerde çalıyor';
      box.appendChild(h('div', { class: 'banner ' + (c.waiting ? 'ready' : 'playing') },
        icon('flag', 'lg'),
        h('div', { class: 'b-main' }, h('div', { class: 'b-tag', text: c.waiting ? 'EKRAN AÇIK · KOMUT BEKLİYOR' : 'ŞU AN ÇALIYOR' }), h('div', { class: 'b-name', text: c.name + ' · ' + (STEP_SHORT[st.type] || '') }), h('div', { class: 'b-sub', text: sub })),
        c.waiting ? h('button', { class: 'btn lg light', type: 'button', onclick: async () => { const r = await api('POST', '/ceremony/go'); if (!r.ok) toast(r.error, true); } }, icon('play'), 'Başlat') : null,
        h('button', { class: 'btn lg outline', type: 'button', onclick: () => api('POST', '/stop') }, icon('stop'), c.waiting ? 'Ekranı kapat' : 'Durdur')));
    }
  }

  // ---------- Canlı bağlantı ----------
  let es = null;
  function connect() {
    if (es) es.close();
    es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      const first = !App.state;
      App.state = JSON.parse(e.data);
      App.clockOffset = App.state.serverTime - Date.now();
      if (App.build && App.state.build && App.state.build !== App.build) { location.reload(); return; }
      if (!App.build) App.build = App.state.build;
      renderChrome();
      if (first) App.render();
      else {
        const p = App.pages[App.page];
        if (p && p.onState) p.onState();
      }
    });
    es.onerror = () => {
      for (const el of [$('#brandStatus'), $('#topStatus')]) {
        el.className = 'status-pill bad';
        el.querySelector('.txt').textContent = 'Sunucuya bağlantı yok';
      }
    };
  }
  // Saat ilerledikçe canlı alanları güncelle
  setInterval(() => {
    const p = App.pages[App.page];
    if (App.state && p && p.tick) p.tick();
  }, 1000);

  // ---------- Giriş ----------
  async function login(pin) {
    App.pin = pin;
    const r = await api('POST', '/login');
    if (!r.ok) {
      $('#loginErr').textContent = r.error || 'Giriş yapılamadı';
      $('#login').classList.remove('hidden');
      return;
    }
    try { localStorage.setItem('zilPin', pin); } catch (e) {}
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    await App.reloadConfig(false);
    connect();
    if (App.config && !App.config.setupDone && App.wizard) App.wizard();
  }
  App.logout = function (msg) {
    App.pin = '';
    try { localStorage.removeItem('zilPin'); } catch (e) {}
    if (es) es.close();
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#loginErr').textContent = msg || '';
    $('#pinInput').value = '';
  };
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); login($('#pinInput').value.trim()); });

  // ---------- Başlat ----------
  buildNav();
  App.go('home');
  applyTheme();
  $('#themeBtn').onclick = cycleTheme;
  $('#themeBtn2').onclick = cycleTheme;
  let saved = '';
  try { saved = localStorage.getItem('zilPin') || ''; } catch (e) {}
  if (saved) login(saved);
  else $('#login').classList.remove('hidden');
})();
