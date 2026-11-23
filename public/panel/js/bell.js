// Zil sayfası: bugünün programı, program düzenleme, hızlı oluşturucu, günün akışı
'use strict';
(function () {
  let editing = null; // düzenlenen program kimliği
  let draft = null; // kaydedilmemiş programlar
  let dirty = false;

  // ---------- Hızlı oluşturucu (sihirbaz da kullanır) ----------
  App.genLessons = function (o) {
    const lessons = [];
    let t = toMin(o.start);
    for (let i = 1; i <= o.count; i++) {
      lessons.push({ start: fromMin(t), end: fromMin(t + o.len) });
      t += o.len;
      if (i < o.count) t += i === o.lunchAfter ? o.lunchLen : o.brk;
    }
    return lessons;
  };
  App.genForm = function (init, onChange) {
    const o = { start: '08:10', len: 40, brk: 10, count: 8, lunchAfter: 5, lunchLen: 40, ...init };
    const num = (k, min, max) => {
      const i = h('input', { type: 'number', min, max, value: o[k] });
      i.oninput = () => { o[k] = Math.max(min, Math.min(max, Number(i.value) || min)); onChange(o); };
      return i;
    };
    const start = h('input', { type: 'time', value: o.start });
    start.oninput = () => { if (start.value) { o.start = start.value; onChange(o); } };
    const el = h('div', { class: 'gen-grid' },
      field('İlk ders başlangıcı', start),
      field('Ders süresi (dk)', num('len', 10, 120)),
      field('Teneffüs (dk)', num('brk', 0, 60)),
      field('Ders sayısı', num('count', 1, 14)),
      field('Öğle arası kaçıncı dersten sonra', num('lunchAfter', 0, 14), '0 = öğle arası yok'),
      field('Öğle arası (dk)', num('lunchLen', 0, 120)));
    return { el, get: () => o };
  };
  App.lessonPreview = function (lessons) {
    return h('div', { class: 'timeline' }, lessons.map((l, i) => h('div', { class: 'tl-item' }, h('span', { class: 't', text: l.start }), h('span', { class: 'l', text: (i + 1) + '. ders' }), h('span', { class: 'muted', text: l.end }))));
  };

  function render(root) {
    const c = App.config;
    if (!draft) draft = JSON.parse(JSON.stringify(c.programs));
    if (!editing || !draft[editing]) editing = c.activeProgram;
    const s = App.state;

    root.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Zil' }), h('p', { text: 'Ders saatleri, zil programları ve teneffüs müziği' }))));

    // Bugün
    const todayCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Bugün hangi program çalsın?' }), h('p', { text: s.day.schoolDay ? sourceText(s.day) + ' Buradan seçim sadece bugün için geçerli.' : 'Bugün ders yok: ' + s.day.reason }))),
      segmented(Object.entries(c.programs).map(([id, p]) => [id, p.name]), s.day.programId, async (id) => {
        await save(api('POST', '/program/today', { program: id }), 'Bugün: ' + c.programs[id].name);
      }, 'block'));

    root.append(h('div', { class: 'grid two' },
      h('div', { class: 'grid' }, todayCard, rulesCard(), editorCard(), musicCard()),
      h('div', { class: 'grid' }, timelineCard())));
  }

  function sourceText(day) {
    const src = day.programSource;
    if (src === 'today') return 'Bugün için elle seçildi.';
    if (src === 'range') return '"' + (day.programSourceLabel || day.programName) + '" tarih aralığından geliyor.';
    if (src === 'weekday') return DAYS[serverNow().getDay()] + ' günleri için ayarlı program.';
    return 'Varsayılan program.';
  }

  // Haftanın günlerine ve tarih aralıklarına program atama
  function rulesCard() {
    const c = App.config;
    const progs = Object.entries(c.programs);
    const dp = { ...(c.dayPrograms || {}) };
    const ranges = (c.rangePrograms || []).map((r) => ({ ...r }));
    const saveRules = () => {
      // Panelin elindeki ayarları da güncelle (sayfa yeniden çizilince eski hali görünmesin)
      c.dayPrograms = { ...dp };
      c.rangePrograms = ranges.map((r) => ({ ...r }));
      return save(api('PUT', '/program-rules', { dayPrograms: dp, rangePrograms: ranges }));
    };
    const days = [1, 2, 3, 4, 5, 6, 0].filter((n) => c.weekdays.includes(n));
    const dayRows = h('div', { class: 'list-rows' }, days.map((n) => {
      const sel = h('select', { 'aria-label': DAYS[n] + ' programı' },
        h('option', { value: '', text: 'Varsayılan (' + c.programs[c.activeProgram].name + ')', selected: !dp[n] }),
        progs.map(([id, p]) => h('option', { value: id, text: p.name, selected: dp[n] === id })));
      sel.onchange = () => { if (sel.value) dp[n] = sel.value; else delete dp[n]; saveRules(); };
      return h('div', { class: 'list-row' }, h('span', { style: { width: '92px', fontWeight: 600 }, text: DAYS[n] }), h('div', { class: 'grow' }, sel));
    }));
    const rangeBox = h('div', { class: 'list-rows' });
    const drawRanges = () => {
      rangeBox.innerHTML = '';
      if (!ranges.length) rangeBox.append(h('div', { class: 'small muted', text: 'Örn. sınav haftası boyunca "Sınav günü" programı çalsın.' }));
      ranges.forEach((r, i) => {
        const from = h('input', { type: 'date', value: r.from, 'aria-label': 'Başlangıç' });
        const to = h('input', { type: 'date', value: r.to, 'aria-label': 'Bitiş' });
        const sel = h('select', { 'aria-label': 'Program' }, progs.map(([id, p]) => h('option', { value: id, text: p.name, selected: r.program === id })));
        const name = h('input', { value: r.name || '', placeholder: 'Ad (örn. Sınav haftası)', 'aria-label': 'Ad' });
        from.onchange = () => { r.from = from.value; saveRules(); };
        to.onchange = () => { r.to = to.value; saveRules(); };
        sel.onchange = () => { r.program = sel.value; saveRules(); };
        name.onchange = () => { r.name = name.value; saveRules(); };
        rangeBox.append(h('div', { class: 'card', style: { padding: '12px', boxShadow: 'none', background: 'var(--surface-2)' } },
          h('div', { class: 'row' }, h('div', { class: 'grow', style: { minWidth: '130px' } }, from), h('span', { class: 'muted', text: '→' }), h('div', { class: 'grow', style: { minWidth: '130px' } }, to)),
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow', style: { minWidth: '130px' } }, sel), h('div', { class: 'grow', style: { minWidth: '130px' } }, name),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sil', onclick: () => { ranges.splice(i, 1); drawRanges(); saveRules(); } }, icon('trash', 'sm')))));
      });
      rangeBox.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, type: 'button', onclick: () => {
        const t = serverNow().toISOString().slice(0, 10);
        ranges.push({ from: t, to: t, program: progs.find(([id]) => id !== c.activeProgram)?.[0] || c.activeProgram, name: '' });
        drawRanges(); saveRules();
      } }, icon('plus', 'sm'), 'Tarih aralığı ekle'));
    };
    drawRanges();
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Otomatik program seçimi' }), h('p', { text: 'Program kendiliğinden değişsin. Öncelik: bugüne seçim › tarih aralığı › gün › varsayılan' }))),
      h('div', { class: 'lbl', style: { marginTop: 0 }, text: 'Haftanın günlerine göre' }), dayRows,
      h('div', { class: 'lbl', text: 'Tarih aralığına göre' }), rangeBox);
  }

  function editorCard() {
    const c = App.config;
    const p = draft[editing];
    const card = h('div', { class: 'card' });
    card.addEventListener('input', () => { dirty = true; });
    card.addEventListener('change', () => { dirty = true; });
    const tabs = segmented(Object.entries(draft).map(([id, x]) => [id, x.name + (id === c.activeProgram ? ' ★' : '')]), editing, (id) => { editing = id; App.render(); });
    const addProg = h('button', { class: 'btn sm', type: 'button', onclick: addProgram }, icon('plus', 'sm'), 'Yeni program');

    const name = h('input', { value: p.name });
    name.oninput = () => { p.name = name.value; };
    const off = h('input', { type: 'number', min: 0, max: 10, value: p.teacherBellOffset || 0 });
    off.oninput = () => { p.teacherBellOffset = Math.max(0, Math.min(10, Number(off.value) || 0)); };

    const rows = h('div', { class: 'list-rows' });
    const drawRows = () => {
      rows.innerHTML = '';
      p.lessons.forEach((l, i) => {
        if (i > 0) {
          const gap = toMin(l.start) - toMin(p.lessons[i - 1].end);
          rows.append(h('div', { class: 'lesson-gap', text: gap >= 30 ? gap + ' dk öğle arası' : gap > 0 ? gap + ' dk teneffüs' : gap < 0 ? '⚠ önceki dersle çakışıyor' : 'ara yok' }));
        }
        const st = h('input', { type: 'time', value: l.start, 'aria-label': (i + 1) + '. ders giriş' });
        const en = h('input', { type: 'time', value: l.end, 'aria-label': (i + 1) + '. ders çıkış' });
        st.onchange = () => { l.start = st.value; drawRows(); };
        en.onchange = () => { l.end = en.value; drawRows(); };
        const del = h('button', { class: 'icon-btn', type: 'button', 'aria-label': (i + 1) + '. dersi sil', onclick: () => { p.lessons.splice(i, 1); dirty = true; drawRows(); } }, icon('trash', 'sm'));
        rows.append(h('div', { class: 'lesson-row' }, h('span', { class: 'n', text: (i + 1) + '. ders' }), st, en, del));
      });
      if (!p.lessons.length) rows.append(h('div', { class: 'empty', text: 'Ders yok. "Hızlı oluştur" ile saatleri tek seferde girebilirsiniz.' }));
    };
    drawRows();

    const addLesson = () => {
      const last = p.lessons[p.lessons.length - 1];
      p.lessons.push(last ? { start: fromMin(toMin(last.end) + 10), end: fromMin(toMin(last.end) + 50) } : { start: '08:10', end: '08:50' });
      dirty = true;
      drawRows();
    };
    const doSave = async (extra) => {
      for (const x of Object.values(draft)) x.lessons.sort((a, b) => a.start.localeCompare(b.start));
      const r = await save(api('PUT', '/programs', { programs: draft, ...extra }));
      if (r.ok) { draft = null; dirty = false; await App.reloadConfig(); }
    };
    const isActive = editing === c.activeProgram;

    card.append(
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Programlar' }), h('p', { text: '★ varsayılan program (her gün bu çalar)' })), addProg),
      tabs,
      h('div', { class: 'grid two', style: { marginTop: '14px', gap: '12px' } }, field('Program adı', name), field('Öğretmen zili (dersten kaç dk önce)', off, '0 = öğretmen zili çalmaz')),
      toggle('Sessiz program', p.silent, (v) => { p.silent = v; }, 'Zil çalmaz, sadece TV\'de geri sayım görünür (sınav günleri için)'),
      h('div', { class: 'divider' }),
      rows,
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', type: 'button', onclick: addLesson }, icon('plus', 'sm'), 'Ders ekle'),
        h('button', { class: 'btn', type: 'button', onclick: () => genSheet(p, drawRows) }, icon('wand', 'sm'), 'Hızlı oluştur')),
      h('div', { class: 'divider' }),
      h('div', { class: 'row between' },
        h('div', { class: 'row' },
          !isActive ? h('button', { class: 'btn ghost', type: 'button', onclick: () => doSave({ activeProgram: editing }) }, '★ Varsayılan yap') : null,
          !isActive && Object.keys(draft).length > 1 ? h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
            if (!(await confirmBox({ title: p.name + ' silinsin mi?', text: 'Bu program kalıcı olarak silinir.', ok: 'Sil', danger: true }))) return;
            delete draft[editing]; editing = c.activeProgram; doSave();
          } }, icon('trash', 'sm'), 'Sil') : null),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { draft = null; dirty = false; App.render(); } }, 'Vazgeç'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => doSave() }, icon('check', 'sm'), 'Kaydet'))));
    return card;
  }

  function addProgram() {
    const name = h('input', { placeholder: 'Örn. Cuma programı' });
    let s;
    const ok = () => {
      const n = name.value.trim();
      if (!n) return name.focus();
      const id = 'p' + Date.now().toString(36);
      draft[id] = { name: n, teacherBellOffset: draft[editing].teacherBellOffset || 0, silent: false, lessons: JSON.parse(JSON.stringify(draft[editing].lessons)) };
      editing = id;
      dirty = true;
      s.close();
      App.render();
      toast('Program oluşturuldu, kaydetmeyi unutmayın');
    };
    s = sheet({ title: 'Yeni program', size: 'sm', body: field('Program adı', name, 'Şu an açık olan programın saatleri kopyalanır.'), foot: [h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onclick: () => s.close() }), h('button', { class: 'btn primary', type: 'button', text: 'Oluştur', onclick: ok })] });
  }

  function genSheet(p, redraw) {
    const prev = h('div');
    const form = App.genForm({ start: p.lessons[0] ? p.lessons[0].start : '08:10' }, (o) => { prev.replaceChildren(App.lessonPreview(App.genLessons(o))); });
    prev.append(App.lessonPreview(App.genLessons(form.get())));
    let s;
    s = sheet({
      title: 'Hızlı oluştur',
      body: [form.el, h('div', { class: 'section-title', text: 'Önizleme' }), prev],
      foot: [h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onclick: () => s.close() }),
        h('button', { class: 'btn primary', type: 'button', text: 'Saatleri uygula', onclick: () => { p.lessons = App.genLessons(form.get()); dirty = true; s.close(); redraw(); toast('Saatler oluşturuldu, kaydetmeyi unutmayın'); } })]
    });
  }

  function musicCard() {
    const c = App.config;
    return h('div', { class: 'card' },
      toggle('Teneffüslerde müzik çal', c.breakMusic, async (v) => { c.breakMusic = v; await save(api('PUT', '/settings', { breakMusic: v })); }, 'Öğretmen ziliyle birlikte kendiliğinden durur'),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => App.go('set', 'sounds') }, icon('music', 'sm'), 'Müzikleri yönet'));
  }

  function timelineCard() {
    const s = App.state;
    const d = serverNow();
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const items = s.day.events.filter((e) => e.kind !== 'music');
    let nextMarked = false;
    const list = h('div', { class: 'timeline' }, items.map((e) => {
      const past = e.time <= hm;
      const isNext = !past && !nextMarked && (nextMarked = true);
      return h('div', { class: 'tl-item' + (past ? ' past' : '') + (isNext ? ' now' : '') },
        h('span', { class: 't', text: e.time }), h('span', { class: 'l', text: e.label }),
        s.skipNext === e.key ? h('span', { class: 'chip warn', text: 'atlanacak' }) : e.kind === 'ceremony' ? h('span', { class: 'chip primary', text: 'Tören' }) : null);
    }));
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Bugünün akışı' }), h('p', { text: s.day.schoolDay ? s.day.programName + (s.day.silent ? ' · sessiz' : '') : 'Bugün ders yok: ' + s.day.reason }))),
      items.length ? list : h('div', { class: 'empty', text: 'Bugün zil yok.' }));
  }

  // Kaydedilmemiş değişiklik yoksa canlı durumla yeniden çiz
  App.pages.bell = {
    render,
    onState: () => { if (!dirty) { draft = null; App.render(); } },
    leave: () => { draft = null; dirty = false; }
  };
})();
