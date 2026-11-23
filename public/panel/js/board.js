// Duyurular sayfası: duyuru, nöbetçi, menü, kayan yazı ve medya
'use strict';
(function () {
  let saveTimer = null;
  function saveBoard() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const b = App.config.board;
      await save(api('PUT', '/board', {
        announcements: b.announcements.map((x) => x.trim()).filter(Boolean),
        duty: b.duty.filter((x) => x.place.trim() || x.name.trim()).map((x) => ({ place: x.place.trim() || '—', name: x.name.trim() })),
        menu: b.menu.map((x) => x.trim()).filter(Boolean),
        ticker: (b.ticker || '').trim(),
        countdowns: b.countdowns.filter((x) => x.date).map((x) => ({ title: x.title.trim() || 'Etkinlik', date: x.date }))
      }), 'TV\'de yayında');
    }, 700);
  }

  // Satır satır liste düzenleyici
  function rowsEditor({ list, make, empty, addLabel, cols }) {
    const box = h('div', { class: 'list-rows' });
    const draw = () => {
      box.innerHTML = '';
      if (!list.length) box.append(h('div', { class: 'muted small', text: empty }));
      list.forEach((item, i) => {
        const inputs = cols.map(([key, ph, w, type]) => {
          const inp = h('input', { type: type || 'text', value: key ? item[key] : item, placeholder: ph, 'aria-label': ph, style: w ? { maxWidth: w } : null });
          inp.addEventListener(type === 'date' ? 'change' : 'input', () => { if (key) item[key] = inp.value; else list[i] = inp.value; saveBoard(); });
          return inp;
        });
        box.append(h('div', { class: 'list-row' }, h('span', { class: 'num', text: i + 1 }), inputs,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Satırı sil', onclick: () => { list.splice(i, 1); draw(); saveBoard(); } }, icon('trash', 'sm'))));
      });
      box.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, type: 'button', onclick: () => { list.push(make()); draw(); const ins = box.querySelectorAll('input'); if (ins.length) ins[ins.length - cols.length].focus(); } }, icon('plus', 'sm'), addLabel));
    };
    draw();
    return box;
  }

  function render(root) {
    const b = App.config.board;
    b.announcements = b.announcements || [];
    b.duty = b.duty || [];
    b.menu = b.menu || [];
    b.countdowns = b.countdowns || [];

    root.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Duyurular' }), h('p', { text: 'Yazdıklarınız birkaç saniye içinde TV\'lerde görünür.' }))));

    const ticker = h('input', { value: b.ticker || '', placeholder: 'Örn. Yarın veli toplantısı 14:00\'te' });
    ticker.oninput = () => { b.ticker = ticker.value; saveBoard(); };

    const left = h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Duyurular' }), h('p', { text: 'TV\'de sırayla 10 saniyede bir değişir' }))),
        rowsEditor({ list: b.announcements, make: () => '', empty: 'Henüz duyuru yok.', addLabel: 'Duyuru ekle', cols: [[null, 'Duyuru metni']] })),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Kayan yazı' })), ticker),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Geri sayımlar' }), h('p', { text: 'TV\'de en yakın iki tanesi görünür: "LGS · 187 gün"' }))),
        rowsEditor({ list: b.countdowns, make: () => ({ title: '', date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }), empty: 'Henüz geri sayım yok.', addLabel: 'Geri sayım ekle', cols: [['title', 'Etkinlik (örn. LGS)'], ['date', 'Tarih', '170px', 'date']] })),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Nöbetçi öğretmenler' })),
        rowsEditor({ list: b.duty, make: () => ({ place: '', name: '' }), empty: 'Henüz nöbetçi yok.', addLabel: 'Nöbetçi ekle', cols: [['place', 'Yer (örn. Zemin kat)', '160px'], ['name', 'Öğretmen']] })),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Günün menüsü' })),
        rowsEditor({ list: b.menu, make: () => '', empty: 'Menü girilmedi.', addLabel: 'Yemek ekle', cols: [[null, 'Yemek']] })));

    root.append(h('div', { class: 'grid two' }, left, h('div', { class: 'grid' }, quoteCard(), mediaCard())));
  }

  // ---------- Günün sözü ----------
  function quoteCard() {
    const q = { enabled: true, kinds: 'both', showMeaning: true, custom: [], ...(App.config.quote || {}) };
    const putQ = (patch, msg) => { Object.assign(q, patch); App.config.quote = { ...q }; return save(api('PUT', '/quote', patch), msg === undefined ? null : msg); };
    const today = App.state.quote;
    const prev = h('div', { class: 'card', style: { boxShadow: 'none', background: 'var(--surface-2)', marginTop: '12px' } },
      h('div', { class: 'small muted', text: 'Bugün TV\'de' }),
      today ? [h('div', { style: { fontWeight: 700, fontSize: '17px', marginTop: '4px' }, text: today.text }), today.meaning ? h('div', { class: 'small muted', text: today.meaning }) : null, h('span', { class: 'chip', style: { marginTop: '8px' }, text: today.kind })]
        : h('div', { class: 'small', text: 'Kapalı' }));
    let saveT = null;
    const custom = q.custom.map((x) => ({ ...x }));
    const saveCustom = () => { clearTimeout(saveT); saveT = setTimeout(() => putQ({ custom: custom.filter((x) => x.text.trim()) }, 'Kaydedildi'), 700); };
    const box = h('div', { class: 'list-rows' });
    const draw = () => {
      box.innerHTML = '';
      custom.forEach((x, i) => {
        const t = h('input', { value: x.text, placeholder: 'Söz', 'aria-label': 'Söz' }); t.oninput = () => { x.text = t.value; saveCustom(); };
        const m = h('input', { value: x.meaning, placeholder: 'Anlamı (isteğe bağlı)', 'aria-label': 'Anlamı' }); m.oninput = () => { x.meaning = m.value; saveCustom(); };
        box.append(h('div', { class: 'list-row', style: { flexWrap: 'wrap' } }, h('div', { class: 'grow', style: { minWidth: '160px' } }, t), h('div', { class: 'grow', style: { minWidth: '160px' } }, m),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sil', onclick: () => { custom.splice(i, 1); draw(); saveCustom(); } }, icon('trash', 'sm'))));
      });
      box.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, type: 'button', onclick: () => { custom.push({ text: '', meaning: '' }); draw(); } }, icon('plus', 'sm'), 'Kendi sözünü ekle'));
    };
    draw();
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Günün sözü' }), h('p', { text: 'Her gün bir atasözü ya da deyim, anlamıyla birlikte' }))),
      toggle('TV\'de göster', q.enabled, (v) => putQ({ enabled: v }, v ? 'Günün sözü açık' : 'Günün sözü kapalı')),
      h('div', { class: 'lbl', text: 'Neler gösterilsin?' }),
      segmented([['both', 'Atasözü + deyim'], ['atasozu', 'Atasözü'], ['deyim', 'Deyim'], ['custom', 'Sadece benimkiler']], q.kinds, (v) => putQ({ kinds: v }, 'Kaydedildi'), 'block'),
      toggle('Anlamını da göster', q.showMeaning !== false, (v) => putQ({ showMeaning: v })),
      prev,
      h('details', { class: 'more' }, h('summary', { text: 'Kendi sözlerim (' + custom.filter((x) => x.text).length + ')' }), h('p', { class: 'small muted', text: 'Eklediğiniz sözler de sıraya girer (ör. Atatürk\'ün sözleri, okulun sloganı).' }), box));
  }

  // ---------- Medya ----------
  function mediaCard() {
    const c = App.config;
    const card = h('div', { class: 'card' });
    const prog = h('div', { class: 'progress hidden' }, h('div'));
    const progText = h('div', { class: 'small muted' });
    const doUpload = async (files) => {
      const errs = [];
      prog.classList.remove('hidden');
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const r = await upload('/media/upload?name=' + encodeURIComponent(f.name), f, (p) => {
          prog.firstChild.style.width = Math.round(p * 100) + '%';
          progText.textContent = (files.length > 1 ? (i + 1) + '/' + files.length + ' · ' : '') + f.name + ' · %' + Math.round(p * 100);
        });
        if (!r.ok) errs.push(f.name + ': ' + r.error);
      }
      prog.classList.add('hidden'); progText.textContent = '';
      if (errs.length) toast(errs.join(' · '), true); else toast('Yüklendi');
      await App.reloadConfig();
    };
    const dz = h('div', { class: 'dropzone' },
      icon('upload', 'lg'), h('div', { style: { marginTop: '6px', fontWeight: 600 }, text: 'Video, resim ya da afişleri buraya sürükleyin' }),
      h('div', { class: 'small', text: 'MP4, WEBM, JPG, PNG, WEBP, GIF · videolar her zaman sessiz oynar' }),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { const fs = await pickFile('image/*,video/mp4,video/webm', true); if (fs.length) doUpload(fs); } }, 'Dosya seç'),
      prog, progText);
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); doUpload([...e.dataTransfer.files]); });

    const list = c.media || [];
    const saveMedia = () => save(api('PUT', '/media', { items: list.map((m) => ({ id: m.id, duration: m.duration, enabled: m.enabled !== false })) }));
    const items = h('div', {}, list.map((m, i) => {
      const thumb = m.type === 'image' ? h('img', { class: 'thumb', src: mediaUrl(m.file), alt: '' }) : h('video', { class: 'thumb', src: mediaUrl(m.file) + '#t=1', muted: true, preload: 'metadata' });
      if (thumb.tagName === 'VIDEO') thumb.muted = true;
      const ctrl = h('div', { class: 'media-ctrl' });
      if (m.type === 'image') {
        const dur = h('input', { type: 'number', min: 3, max: 600, value: m.duration || 10, 'aria-label': 'Gösterim süresi (saniye)' });
        dur.onchange = () => { m.duration = Math.max(3, Math.min(600, Number(dur.value) || 10)); saveMedia(); };
        ctrl.append(dur, h('span', { class: 'small muted', text: 'sn' }));
      } else ctrl.append(h('span', { class: 'chip', text: 'Video · sessiz' }));
      const on = h('input', { type: 'checkbox', checked: m.enabled !== false });
      on.onchange = () => { m.enabled = on.checked; saveMedia().then(() => App.render()); };
      ctrl.append(h('label', { class: 'row small', style: { gap: '6px' } }, on, 'Yayında'),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Yukarı', disabled: i === 0, onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); saveMedia(); App.render(); } }, icon('up', 'sm')),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Aşağı', disabled: i === list.length - 1, onclick: () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); saveMedia(); App.render(); } }, icon('down', 'sm')),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Sil', onclick: async () => {
          if (!(await confirmBox({ title: m.name + ' silinsin mi?', text: 'Dosya kalıcı olarak silinir.', ok: 'Sil', danger: true }))) return;
          await save(api('DELETE', '/media/' + m.id), 'Silindi'); App.reloadConfig();
        } }, icon('trash', 'sm')));
      return h('div', { class: 'media-item' + (m.enabled === false ? ' off' : '') }, thumb, h('div', {}, h('div', { class: 'media-title', text: m.name }), h('div', { class: 'small muted', text: (m.type === 'image' ? 'Resim / afiş' : 'Video') + ' · ' + (i + 1) + '. sırada' }), ctrl));
    }));

    const d = c.display;
    let hint = null;
    if (list.length && d.layout === 'classic') {
      hint = h('div', { class: 'notice', style: { marginTop: '12px', marginBottom: 0 } }, icon('info'), h('div', {}, h('b', { text: 'Medya TV\'de görünmüyor' }), 'TV şu an Klasik düzende. ',
        h('button', { class: 'btn sm', style: { marginTop: '8px' }, type: 'button', onclick: async () => { await save(api('PUT', '/display', { layout: 'media' }), 'Düzen: Medya + bilgi'); App.reloadConfig(); } }, 'Medya + bilgi düzenine geç')));
    }
    card.append(...[h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Medya' }), h('p', { text: 'Etkinlik videoları, resimler ve afişler TV\'de sırayla gösterilir' }))),
      dz, hint, list.length ? h('div', { style: { marginTop: '8px' } }, items) : null].filter(Boolean));
    return card;
  }

  App.pages.board = { render };
})();
