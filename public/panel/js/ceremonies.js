// Törenler: sade kartlar ve düzenleme penceresi
'use strict';
(function () {
  function summary(c) {
    if (c.mode === 'off') return 'Kapalı';
    const r = c.rule;
    let when = 'Elle açılır';
    if (c.mode === 'auto' && r) {
      const t = r.time === 'afterLast' ? 'son dersten sonra' : r.time;
      const days = r.type === 'weekly' ? 'Her ' + DAYS[r.day].toLowerCase() : 'Her yıl ' + (r.dates || []).map(fmtDate).join(', ');
      when = days + ' ' + t;
    }
    const snd = c.soundStart === 'auto' ? (c.mode === 'auto' && c.soundDelay > 0 ? 'ses ' + c.soundDelay + ' dk sonra kendiliğinden' : 'ses kendiliğinden') : 'ses öğretmen komutuyla';
    return when + ' · ' + snd;
  }
  function fmtDate(md) {
    const [m, d] = md.split('-').map(Number);
    return d + ' ' + MONTHS[m - 1];
  }

  function render(root) {
    const c = App.config;
    root.append(h('div', { class: 'page-head' },
      h('div', {}, h('h1', { text: 'Törenler' }), h('p', { text: 'Önce ekran açılır, öğretmen işaret verince "Başlat" ile ses çalar.' })),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => App.go('set', 'look') }, icon('palette', 'sm'), 'Ekran görünümü'),
        h('button', { class: 'btn primary', type: 'button', onclick: addCeremony }, icon('plus', 'sm'), 'Yeni tören'))));
    const grid = h('div', { class: 'cer-grid' });
    for (const cer of c.ceremonies) grid.append(card(cer));
    root.append(grid);
  }

  function card(cer) {
    const s = App.state;
    const open = s.mode === 'ceremony' && s.ceremony.id === cer.id;
    const waiting = open && s.ceremony.waiting;
    let main;
    if (waiting) main = h('button', { class: 'btn primary grow', type: 'button', onclick: go }, icon('play', 'sm'), 'Başlat');
    else if (open) main = h('button', { class: 'btn danger grow', type: 'button', onclick: () => api('POST', '/stop') }, icon('stop', 'sm'), 'Durdur');
    else main = h('button', { class: 'btn primary grow', type: 'button', disabled: s.mode !== 'normal' || cer.mode === 'off', onclick: async () => { const r = await api('POST', '/ceremonies/' + cer.id + '/start'); if (!r.ok) toast(r.error, true); } }, icon(cer.soundStart === 'auto' ? 'play' : 'monitor', 'sm'), cer.soundStart === 'auto' ? 'Başlat' : 'Ekranı aç');
    const chips = h('div', { class: 'cer-chips' },
      cer.mode === 'off' ? h('span', { class: 'chip', text: 'Kapalı' }) : cer.mode === 'auto' ? h('span', { class: 'chip primary' }, icon('calendar', 'sm'), 'Otomatik') : h('span', { class: 'chip' }, 'Elle'),
      open ? h('span', { class: 'chip ' + (waiting ? 'primary' : 'bad'), text: waiting ? 'Ekran açık' : 'Çalıyor' }) : null);
    return h('div', { class: 'card cer-card' + (cer.mode === 'off' ? ' off' : '') },
      h('div', { class: 'row between' }, h('div', { class: 'cer-title', text: cer.name }), chips),
      h('div', { class: 'cer-sum', text: summary(cer) }),
      h('div', { class: 'steps-mini' }, cer.steps.map((x, i) => [i ? '→' : null, h('span', { class: 'chip', text: STEP_SHORT[x.type] + (x.seconds && x.type !== 'anthem' ? ' ' + Math.round(x.seconds / 6) / 10 + ' dk' : '') })])),
      h('div', { class: 'row' }, main, open ? (waiting ? h('button', { class: 'btn', type: 'button', onclick: () => api('POST', '/stop') }, 'Kapat') : null) : h('button', { class: 'btn', type: 'button', onclick: () => editSheet(cer) }, icon('edit', 'sm'), 'Düzenle')));
  }
  async function go() {
    const r = await api('POST', '/ceremony/go');
    if (!r.ok) toast(r.error, true);
  }

  async function addCeremony() {
    const r = await api('POST', '/ceremonies', { name: 'Yeni tören' });
    if (!r.ok) return toast(r.error, true);
    await App.reloadConfig();
    const cer = App.config.ceremonies.find((x) => x.id === r.id);
    if (cer) editSheet(cer);
  }

  // ---------- Düzenleme ----------
  function editSheet(cer) {
    const d = JSON.parse(JSON.stringify(cer));
    d.rule = d.rule || { type: 'weekly', day: 1, time: '08:00', onlySchoolDays: true };
    let enabled = d.mode !== 'off';
    let autoOpen = d.mode === 'auto';

    const name = h('input', { value: d.name });
    name.oninput = () => { d.name = name.value; };

    // Zamanlama
    const sched = h('div');
    const drawSched = () => {
      sched.innerHTML = '';
      if (!autoOpen) return;
      const r = d.rule;
      const type = segmented([['weekly', 'Her hafta'], ['yearly', 'Her yıl belirli günler']], r.type, (v) => { r.type = v; if (v === 'yearly' && !r.dates) r.dates = []; drawSched(); }, 'block');
      let which;
      if (r.type === 'weekly') {
        which = h('div', { class: 'daychips' }, [1, 2, 3, 4, 5, 6, 0].map((n) => h('button', { type: 'button', 'aria-pressed': String(r.day === n), text: DAYS_SHORT[n], onclick: () => { r.day = n; drawSched(); } })));
      } else {
        const dd = h('select', { 'aria-label': 'Gün' }, Array.from({ length: 31 }, (_, i) => h('option', { value: i + 1, text: i + 1 })));
        const mm = h('select', { 'aria-label': 'Ay' }, MONTHS.map((m, i) => h('option', { value: i + 1, text: m })));
        which = h('div', {},
          h('div', { class: 'cer-chips' }, (r.dates || []).length ? r.dates.map((md, i) => h('span', { class: 'chip primary' }, fmtDate(md), h('button', { class: 'btn ghost sm', style: { minHeight: '22px', padding: '0 4px' }, type: 'button', 'aria-label': fmtDate(md) + ' kaldır', onclick: () => { r.dates.splice(i, 1); drawSched(); } }, icon('x', 'sm')))) : h('span', { class: 'muted small', text: 'Henüz tarih eklenmedi' })),
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { style: { width: '90px' } }, dd), h('div', { class: 'grow' }, mm),
            h('button', { class: 'btn', type: 'button', onclick: () => { const v = pad(mm.value) + '-' + pad(dd.value); r.dates = r.dates || []; if (!r.dates.includes(v)) r.dates.push(v); drawSched(); } }, icon('plus', 'sm'), 'Ekle')));
      }
      const afterLast = r.time === 'afterLast';
      const time = h('input', { type: 'time', value: afterLast ? '15:00' : r.time || '08:00', disabled: afterLast });
      time.onchange = () => { r.time = time.value; };
      sched.append(
        h('div', { class: 'lbl', text: 'Ne zaman?' }), type, h('div', { style: { marginTop: '10px' } }, which),
        h('div', { class: 'grid two', style: { gap: '12px', marginTop: '6px' } }, field('Ekranın açılacağı saat', time)),
        toggle('Son ders bitince aç', afterLast, (v) => { r.time = v ? 'afterLast' : time.value || '15:00'; drawSched(); }),
        toggle('Sadece ders günlerinde', r.onlySchoolDays !== false, (v) => { r.onlySchoolDays = v; }, 'Kapalıysa hafta sonu ve tatilde de açılır (örn. 10 Kasım)'));
    };

    // Ses
    const soundBox = h('div');
    const drawSound = () => {
      soundBox.innerHTML = '';
      const delay = h('input', { type: 'number', min: 0, max: 120, value: d.soundDelay || 0 });
      delay.oninput = () => { d.soundDelay = Math.max(0, Number(delay.value) || 0); };
      soundBox.append(
        segmented([['command', 'Öğretmen komutuyla'], ['auto', 'Kendiliğinden']], d.soundStart === 'auto' ? 'auto' : 'command', (v) => { d.soundStart = v; drawSound(); }, 'block'),
        h('p', { class: 'small muted', text: d.soundStart === 'auto' ? 'Ekran açılınca ses de başlar.' : 'Ekran açılır, ses ancak "Başlat"a basılınca çalar.' }),
        d.soundStart === 'auto' && autoOpen ? field('Otomatik açılışta ekran açıldıktan kaç dakika sonra çalsın?', delay, 'Örn. 10 Kasım: ekran 09:00\'da açılır, 5 dk sonra siren çalar.') : null);
    };

    // Adımlar
    const stepsBox = h('div', { class: 'list-rows' });
    const drawSteps = () => {
      stepsBox.innerHTML = '';
      d.steps.forEach((st, i) => {
        const type = h('select', { 'aria-label': (i + 1) + '. adım' }, Object.entries(STEP_NAMES).map(([v, n]) => h('option', { value: v, text: n, selected: st.type === v })));
        const sec = h('input', { type: 'number', min: 5, max: 600, value: st.seconds || 60, disabled: st.type === 'anthem', 'aria-label': 'Süre (saniye)' });
        type.onchange = () => { st.type = type.value; if (st.type === 'anthem') delete st.seconds; else st.seconds = Number(sec.value) || 60; drawSteps(); drawScreen(); };
        sec.oninput = () => { st.seconds = Math.max(5, Math.min(600, Number(sec.value) || 60)); };
        stepsBox.append(h('div', { class: 'step-edit' }, type, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, sec, h('span', { class: 'small muted', text: 'sn' })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Adımı sil', disabled: d.steps.length < 2, onclick: () => { d.steps.splice(i, 1); drawSteps(); drawScreen(); } }, icon('trash', 'sm'))));
        if (i > 0) {
          const cb = h('input', { type: 'checkbox', checked: !!st.wait });
          cb.onchange = () => { st.wait = cb.checked; };
          stepsBox.append(h('label', { class: 'row step-wait muted' }, cb, 'Bu adımdan önce öğretmen komutunu bekle'));
        }
      });
    };

    // Saygı duruşu ekranı
    const screenBox = h('details', { class: 'more' });
    const drawScreen = () => {
      screenBox.innerHTML = '';
      const has = d.steps.some((x) => x.type !== 'anthem');
      screenBox.classList.toggle('hidden', !has);
      if (!has) return;
      const S = d.screen = { bg: '#121212', kicker: '', title: 'Saygı Duruşu', message: '', image: null, grayscale: false, showSteps: true, ...(d.screen || {}) };
      const title = h('input', { value: S.title }); title.oninput = () => { S.title = title.value; };
      const kick = h('input', { value: S.kicker, placeholder: 'Boşsa tarih ve saat yazar' }); kick.oninput = () => { S.kicker = kick.value; };
      const msg = h('textarea', { rows: 3, value: S.message }); msg.oninput = () => { S.message = msg.value; };
      const bg = h('input', { type: 'color', value: S.bg }); bg.oninput = () => { S.bg = bg.value; };
      const box = h('div', { class: 'img-box dark' }, S.image ? h('img', { src: mediaUrl(S.image), alt: '' }) : 'Görsel yok');
      screenBox.append(h('summary', { text: 'Saygı duruşu ekranı' }),
        field('Başlık', title), field('Üst yazı', kick), field('Mesaj', msg),
        h('div', { class: 'lbl', text: 'Görsel (örn. Atatürk fotoğrafı)' }),
        h('div', { class: 'img-pick' }, box, h('div', { class: 'row' },
          h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            const [f] = await pickFile('image/*'); if (!f) return;
            const r = await upload('/image/upload?name=' + encodeURIComponent(f.name), f);
            if (!r.ok) return toast(r.error, true);
            S.image = r.file; drawScreen(); screenBox.open = true;
          } }, icon('upload', 'sm'), 'Görsel seç'),
          S.image ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S.image = null; drawScreen(); screenBox.open = true; } }, 'Kaldır') : null)),
        toggle('Görseli siyah-beyaz göster', S.grayscale, (v) => { S.grayscale = v; }),
        toggle('Adımları ve geri sayımı göster', S.showSteps !== false, (v) => { S.showSteps = v; }),
        h('div', { class: 'row', style: { marginTop: '8px' } }, h('label', { htmlFor: (bg.id = nextId()), class: 'grow', text: 'Arka plan rengi' }), bg));
    };

    const schedWrap = h('div');
    const drawTop = () => {
      schedWrap.innerHTML = '';
      schedWrap.append(
        toggle('Etkin', enabled, (v) => { enabled = v; drawTop(); }, 'Kapalı törenler otomatik açılmaz ve ana sayfada görünmez'),
        enabled ? toggle('Saatinde kendisi açılsın', autoOpen, (v) => { autoOpen = v; drawSched(); drawSound(); }, 'Kapalıysa ekranı siz açarsınız') : null,
        enabled ? sched : null);
    };
    drawTop(); drawSched(); drawSound(); drawSteps(); drawScreen();

    let s;
    const doSave = async () => {
      if (autoOpen && d.rule.type === 'yearly' && !(d.rule.dates || []).length) return toast('En az bir tarih ekleyin', true);
      const mode = !enabled ? 'off' : autoOpen ? 'auto' : 'manual';
      const r = await save(api('PUT', '/ceremonies/' + cer.id, {
        name: d.name.trim() || cer.name, mode, rule: d.rule, steps: d.steps, screen: d.screen,
        soundStart: d.soundStart === 'auto' ? 'auto' : 'command', soundDelay: d.soundDelay || 0
      }));
      if (r.ok) { s.close(); App.reloadConfig(); }
    };
    const doDelete = async () => {
      if (!(await confirmBox({ title: cer.name + ' silinsin mi?', text: 'Tören ve ayarları kalıcı olarak silinir.', ok: 'Sil', danger: true }))) return;
      await save(api('DELETE', '/ceremonies/' + cer.id), 'Silindi');
      s.close();
      App.reloadConfig();
    };
    s = sheet({
      title: 'Töreni düzenle',
      body: [field('Tören adı', name),
        h('div', { class: 'section-title', text: 'Zamanlama' }), schedWrap,
        h('div', { class: 'section-title', text: 'Ses ne zaman başlasın?' }), soundBox,
        h('div', { class: 'section-title', text: 'Adımlar' }), stepsBox,
        h('button', { class: 'btn sm', style: { marginTop: '10px' }, type: 'button', onclick: () => { d.steps.push({ type: 'silence', seconds: 60 }); drawSteps(); drawScreen(); } }, icon('plus', 'sm'), 'Adım ekle'),
        screenBox],
      foot: [h('button', { class: 'btn ghost', type: 'button', onclick: doDelete }, icon('trash', 'sm'), 'Sil'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onclick: () => s.close() }),
        h('button', { class: 'btn primary', type: 'button', onclick: doSave }, icon('check', 'sm'), 'Kaydet')]
    });
  }

  App.pages.cer = { render, onState: () => App.render() };
})();
