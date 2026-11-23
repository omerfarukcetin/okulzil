// Ana sayfa: günlük kumanda
'use strict';
(function () {
  let refs = null;
  let drill = false;

  const ALARMS = [
    ['deprem', 'Deprem', 'Çök – Kapan – Tutun'],
    ['yangin', 'Yangın', 'Tahliye talimatı'],
    ['tahliye', 'Tahliye', 'Toplanma alanına'],
    ['kilit', 'Sınıfta kal', 'Kapılar kapalı, bekle']
  ];

  function render(root) {
    const s = App.state;
    refs = {};
    root.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Ana sayfa' }), h('p', { id: 'homeDate' }))));

    refs.notice = h('div');
    root.append(refs.notice);

    // Şu an kartı
    refs.hero = h('div', { class: 'hero' },
      h('div', { class: 'hero-top' },
        h('div', {}, refs.kicker = h('div', { class: 'hero-kicker' }), refs.title = h('div', { class: 'hero-title' }), refs.sub = h('div', { class: 'hero-sub' })),
        refs.clock = h('div', { class: 'hero-clock' })),
      refs.countBox = h('div', { class: 'hero-count' }, refs.count = h('span', { class: 'n' }), refs.countLabel = h('span', { class: 't' })),
      refs.bar = h('div', { class: 'hero-bar' }, h('div')));

    // Hızlı işlemler
    refs.skipBtn = h('button', { class: 'action', type: 'button', onclick: skipNext });
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'action', type: 'button', onclick: ringNow }, h('span', { class: 'ic' }, icon('bell')), h('span', {}, 'Zili çal', h('small', { text: 'Giriş zilini şimdi çalar' }))),
      refs.skipBtn,
      h('button', { class: 'action', type: 'button', onclick: announceSheet }, h('span', { class: 'ic' }, icon('megaphone')), h('span', {}, 'Anons', h('small', { text: 'Yazılanı sesli okur' }))),
      h('button', { class: 'action', type: 'button', onclick: ceremonySheet }, h('span', { class: 'ic' }, icon('flag')), h('span', {}, 'Tören', h('small', { text: 'Tören ekranını aç' }))));

    // Acil durum
    const drillSw = toggle('Tatbikat modu', drill, (v) => { drill = v; }, 'Açıkken ekranda "TATBİKAT" yazar');
    const alarmBtns = h('div', { class: 'alarms' }, ALARMS.map(([id, name, sub]) =>
      h('button', { class: 'alarm-btn ' + id, type: 'button', onclick: () => startAlarm(id, name) }, name, h('small', { text: sub }))));
    const alarmCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Acil durum' }), h('p', { text: 'Siren tüm katlarda çalar, TV\'ler talimat ekranına geçer.' }))),
      alarmBtns, drillSw);

    // Sıradaki
    refs.next = h('div', { class: 'next-list' });
    const nextCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Sıradaki' }), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => App.go('bell') }, 'Tüm gün')),
      refs.next);

    root.append(h('div', { class: 'grid home' },
      h('div', { class: 'grid' }, refs.hero, actions, alarmCard),
      h('div', { class: 'grid' }, nextCard)));
    onState();
    tick();
  }

  function onState() {
    if (!refs) return;
    const s = App.state;
    // Ses uyarısı
    refs.notice.innerHTML = '';
    const a = s.audio || {};
    if (!a.ready) {
      refs.notice.append(h('div', { class: 'notice' }, icon('alert'), h('div', {},
        h('b', { text: a.panos ? 'TV panosunun sesi kapalı' : 'Zil sesi çıkmayacak' }),
        a.panos ? 'Sistem odasındaki bilgisayarda pano ekranına bir kez tıklayın.' : 'Sistem odasındaki bilgisayarda pano sayfası açık değil: http://localhost:3000/pano/')));
    }
    // Atlanacak zil
    refs.skipBtn.className = 'action' + (s.skipNext ? ' on' : '');
    refs.skipBtn.replaceChildren(h('span', { class: 'ic' }, icon('skip')), h('span', {}, s.skipNext ? 'Atlama iptal' : 'Sonraki zili atla', h('small', { text: s.skipNext ? 'Sıradaki zil çalmayacak' : 'Bir sonraki zil çalmaz' })));
    renderNext();
  }

  function renderNext() {
    const s = App.state;
    const d = serverNow();
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const list = s.day.events.filter((e) => e.kind !== 'music' && e.time > hm).slice(0, 5);
    refs.next.innerHTML = '';
    if (!s.day.schoolDay) refs.next.append(h('div', { class: 'muted', text: 'Bugün ders yok: ' + s.day.reason }));
    else if (!list.length) refs.next.append(h('div', { class: 'muted', text: 'Bugün başka zil yok.' }));
    for (const e of list) {
      refs.next.append(h('div', { class: 'next-item' + (s.skipNext === e.key ? ' skip' : '') },
        h('span', { class: 't', text: e.time }), h('span', { class: 'l', text: e.label }),
        e.kind === 'ceremony' ? h('span', { class: 'chip primary', text: 'Tören' }) : s.day.silent ? h('span', { class: 'chip', text: 'sessiz' }) : null));
    }
  }

  let lastMinute = '';
  function tick() {
    if (!refs || !document.body.contains(refs.hero)) return;
    const d = serverNow();
    const s = App.state;
    const p = currentPhase(s.day);
    const cls = { lesson: 'lesson', break: 'break', lunch: 'lunch', warn: 'warn' }[p.phase] || '';
    refs.hero.className = 'hero ' + cls;
    refs.kicker.textContent = p.phase === 'warn' ? 'DERS BAŞLIYOR' : p.kicker;
    refs.title.textContent = p.title;
    refs.sub.textContent = p.sub + (s.day.schoolDay ? ' · ' + s.day.programName : '');
    refs.clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    refs.countBox.classList.toggle('hidden', !p.count);
    refs.count.textContent = p.count || '';
    refs.countLabel.textContent = p.countLabel ? p.countLabel + ' kaldı' : '';
    refs.bar.classList.toggle('hidden', p.progress == null);
    refs.bar.firstChild.style.width = Math.round((p.progress || 0) * 100) + '%';
    const dateEl = $('#homeDate');
    if (dateEl) dateEl.textContent = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + DAYS[d.getDay()];
    const m = d.getHours() + ':' + d.getMinutes();
    if (m !== lastMinute) { lastMinute = m; renderNext(); }
  }

  // ---------- İşlemler ----------
  async function ringNow() {
    const r = await api('POST', '/bell/ring', { bell: 'student' });
    if (!r.ok) toast(r.error, true);
    else if (r.warning) toast(r.warning, true);
    else toast('Zil çalındı');
  }
  async function skipNext() {
    const r = await api('POST', '/bell/skip');
    if (!r.ok) toast(r.error, true);
    else toast(r.skipped ? 'Atlanacak: ' + r.label : 'Zil atlama iptal edildi');
  }
  async function startAlarm(type, name) {
    const ok = await confirmBox({
      title: name + (drill ? ' tatbikatı' : ' alarmı') + ' başlatılsın mı?',
      text: 'Siren tüm katlarda çalacak ve TV\'ler acil durum ekranına geçecek. Çalan zil ve müzik kesilir.',
      ok: 'Evet, başlat',
      danger: true
    });
    if (!ok) return;
    const r = await api('POST', '/alarm', { type, drill });
    if (!r.ok) toast(r.error, true);
  }
  function announceSheet() {
    const text = h('textarea', { rows: 3, placeholder: 'Örn. 9-A sınıf başkanı müdür yardımcısının odasına gelsin.' });
    let repeat = 1;
    let s;
    const send = async () => {
      const t = text.value.trim();
      if (!t) return text.focus();
      const r = await api('POST', '/announce', { text: t, repeat });
      if (!r.ok) return toast(r.error, true);
      toast('Anons yapılıyor');
      s.close();
    };
    s = sheet({
      title: 'Sesli anons',
      body: [field('Anons metni', text, 'Önce "ding-dong" çalar, sonra metin okunur ve TV\'lerde yazı olarak görünür.'),
        h('div', { class: 'lbl', text: 'Kaç kez okunsun?' }), segmented([[1, '1 kez'], [2, '2 kez'], [3, '3 kez']], 1, (v) => { repeat = v; })],
      foot: [h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onclick: () => s.close() }), h('button', { class: 'btn primary', type: 'button', onclick: send }, icon('megaphone'), 'Anons yap')]
    });
  }
  function ceremonySheet() {
    const list = App.config.ceremonies.filter((c) => c.mode !== 'off');
    let s;
    const body = h('div', { class: 'next-list' }, list.length ? list.map((c) =>
      h('div', { class: 'next-item' }, h('span', { class: 'l' }, h('b', { text: c.name }), h('div', { class: 'small muted', text: c.steps.map((x) => STEP_SHORT[x.type]).join(' → ') })),
        h('button', { class: 'btn sm primary', type: 'button', disabled: App.state.mode !== 'normal', onclick: async () => { const r = await api('POST', '/ceremonies/' + c.id + '/start'); if (!r.ok) toast(r.error, true); else s.close(); } }, c.soundStart === 'auto' ? 'Başlat' : 'Ekranı aç'))) : h('div', { class: 'empty', text: 'Etkin tören yok.' }));
    s = sheet({ title: 'Tören başlat', body: [h('p', { class: 'muted small', style: { marginTop: 0 }, text: 'Ekran açılır; ses, siz üstteki şeritten "Başlat"a basınca çalar.' }), body] });
  }

  App.pages.home = { render, onState, tick };
})();
