// Ayarlar: Genel, Görünüm (canlı önizleme), Sesler, Takvim, Sistem
'use strict';
(function () {
  const SUBS = [
    ['general', 'Genel', 'school'],
    ['look', 'Görünüm', 'palette'],
    ['sounds', 'Sesler', 'volume'],
    ['calendar', 'Takvim', 'calendar'],
    ['system', 'Sistem', 'info']
  ];

  function render(root) {
    const sub = App.sub.set || 'general';
    root.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Ayarlar' }))));
    root.append(h('div', { class: 'subnav' }, SUBS.map(([id, label, ic]) =>
      h('button', { type: 'button', 'aria-current': String(id === sub), onclick: () => { App.sub.set = id; App.render(); } }, icon(ic, 'sm'), label))));
    const body = h('div');
    root.append(body);
    ({ general, look, sounds, calendar, system })[sub](body);
  }

  // ================= GENEL =================
  function general(root) {
    const c = App.config;
    const name = h('input', { value: c.schoolName });
    const area = h('input', { value: (c.emergency && c.emergency.assemblyArea) || '' });
    const p1 = h('input', { type: 'password', inputmode: 'numeric', placeholder: '4–8 rakam', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'Tekrar', autocomplete: 'new-password' });
    root.append(h('div', { class: 'grid two' },
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Okul' })),
        field('Okul adı', name), h('div', { style: { height: '10px' } }), field('Acil durum toplanma alanı', area, 'Yangın ve deprem ekranlarında yazar'),
        h('div', { class: 'row end', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const r = await save(api('PUT', '/settings', { schoolName: name.value.trim(), emergency: { assemblyArea: area.value.trim() } }));
          if (r.ok) App.reloadConfig(false);
        } }, icon('check', 'sm'), 'Kaydet'))),
      weatherCard(),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Panel PIN\'i' }), h('p', { text: 'Okul ağındaki herkes panelin adresine ulaşabilir; PIN\'i kimseyle paylaşmayın.' }))),
        h('div', { class: 'grid two', style: { gap: '12px' } }, field('Yeni PIN', p1), field('Yeni PIN (tekrar)', p2)),
        h('div', { class: 'row end', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!/^\d{4,8}$/.test(p1.value)) return toast('PIN 4–8 rakam olmalı', true);
          if (p1.value !== p2.value) return toast('PIN\'ler aynı değil', true);
          const r = await save(api('PUT', '/settings', { newPin: p1.value }), 'PIN değişti');
          if (r.ok) { App.pin = p1.value; try { localStorage.setItem('zilPin', App.pin); } catch (e) {} p1.value = p2.value = ''; }
        } }, icon('lock', 'sm'), 'PIN\'i değiştir')))));
  }

  function weatherCard() {
    const w = { enabled: false, city: '', ...(App.config.weather || {}) };
    const q = h('input', { placeholder: 'Şehir ya da ilçe adı (örn. Beylikdüzü)', value: '' });
    const results = h('div', { class: 'list-rows', style: { marginTop: '8px' } });
    const current = h('div', { class: 'small muted', style: { marginTop: '8px' } });
    const drawCurrent = () => {
      const live = App.state && App.state.weather;
      current.textContent = w.city ? 'Seçili: ' + w.city + (live ? ' · şu an ' + live.temp + '°' : w.enabled ? ' · bilgi bekleniyor (internet gerekir)' : '') : 'Henüz şehir seçilmedi.';
    };
    drawCurrent();
    const search = async () => {
      const text = q.value.trim();
      if (text.length < 2) return;
      results.replaceChildren(h('div', { class: 'small muted', text: 'Aranıyor…' }));
      const r = await api('GET', '/weather/search?q=' + encodeURIComponent(text));
      results.innerHTML = '';
      if (!r.ok) return results.append(h('div', { class: 'small', style: { color: 'var(--bad)' }, text: r.error }));
      if (!r.results.length) return results.append(h('div', { class: 'small muted', text: 'Sonuç bulunamadı.' }));
      for (const x of r.results) results.append(h('button', { class: 'btn sm', style: { justifyContent: 'flex-start' }, type: 'button', onclick: async () => {
        w.city = x.name; w.enabled = true;
        await save(api('PUT', '/weather', { city: x.name, lat: x.lat, lon: x.lon, enabled: true }), 'Hava durumu: ' + x.name);
        App.config.weather = { ...w, lat: x.lat, lon: x.lon };
        results.innerHTML = ''; q.value = ''; drawCurrent(); App.render();
      } }, icon('check', 'sm'), x.name + (x.region ? ' · ' + x.region : '')));
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Hava durumu' }), h('p', { text: 'TV\'nin sağ üstünde görünür. Okul bilgisayarında internet olması gerekir.' }))),
      toggle('Hava durumunu göster', w.enabled, async (v) => { w.enabled = v; await save(api('PUT', '/weather', { enabled: v })); }),
      h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, q), h('button', { class: 'btn', type: 'button', onclick: search }, 'Ara')),
      results, current);
  }

  // ================= GÖRÜNÜM =================
  const THEMES = [
    ['dark', 'Gece', '#0E1A2B', '#15233A', '#F2A93B'], ['light', 'Gündüz', '#EEF1F5', '#FFFFFF', '#F2A93B'],
    ['ocean', 'Okyanus', '#0B2545', '#13315C', '#6CA8FF'], ['forest', 'Orman', '#0F2A22', '#163A2F', '#4FC3A1'],
    ['flag', 'Bayrak', '#8E0E1F', '#A8182C', '#FFFFFF'], ['sand', 'Kum', '#F5EFE6', '#FFFDF8', '#FF7A59'],
    ['contrast', 'Yüksek kontrast', '#000000', '#141414', '#F2A93B']
  ];
  const ACCENTS = ['#F2A93B', '#4FC3A1', '#6CA8FF', '#FF7A59', '#C084FC', '#E30A17', '#FFFFFF'];
  const LAYOUTS = [
    ['classic', 'Klasik', [[6, 12, 42, 34], [6, 52, 42, 20, 'a'], [52, 12, 42, 30], [52, 48, 20, 24], [74, 48, 20, 24]]],
    ['media', 'Medya + bilgi', [[6, 12, 60, 60, 'm'], [6, 78, 60, 10], [70, 12, 24, 22], [70, 38, 24, 14, 'a'], [70, 56, 24, 32]]],
    ['fullmedia', 'Tam ekran medya', [[0, 0, 100, 100, 'm'], [5, 78, 20, 14], [28, 78, 44, 14], [75, 78, 20, 14, 'a']]]
  ];
  const STATUS_DEF = { enabled: true, bigCountdown: true, breakText: 'TENEFFÜS', lunchText: 'ÖĞLE ARASI', warnText: 'SINIFLARINIZA GEÇİN', warnMinutes: 2, breakColor: '#2E9E5B', lunchColor: '#E07B1A', warnColor: '#F2C230' };
  const ANTHEM_DEF = { bg: '#C8102E', kicker: 'LÜTFEN AYAĞA KALKINIZ', title: 'İstiklal Marşı', showCeremonyName: true, visual: 'flag', image: null, video: null, showProgress: true };
  let demo = 'lesson';

  async function putDisplay(patch, msg) {
    const d = App.config.display;
    for (const [k, v] of Object.entries(patch)) d[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? { ...(d[k] || {}), ...v } : v;
    return save(api('PUT', '/display', patch), msg === undefined ? null : msg);
  }

  function look(root) {
    const d = App.config.display;
    const frame = h('iframe', { class: 'preview-frame', title: 'TV önizlemesi', src: '/pano/?preview=1&demo=' + demo });
    const preview = h('div', { class: 'preview' },
      h('div', { class: 'card', style: { padding: '12px' } },
        h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('b', { text: 'TV önizlemesi' }), h('span', { class: 'chip', text: 'canlı' })),
        frame,
        segmented([['lesson', 'Ders'], ['break', 'Teneffüs'], ['warn', 'Uyarı'], ['anthem', 'Marş'], ['saygi', 'Saygı d.']], demo, (v) => { demo = v; frame.src = '/pano/?preview=1&demo=' + v; }, 'block')));

    // Logo
    const logoBox = h('div', { class: 'img-box dark' }, d.logo ? h('img', { src: mediaUrl(d.logo), alt: 'Okul logosu' }) : 'Logo yok');
    const logoCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Okul logosu' }), h('p', { text: 'Şeffaf arka planlı PNG en iyi sonucu verir' }))),
      h('div', { class: 'img-pick' }, logoBox, h('div', { class: 'row' },
        h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
          const [f] = await pickFile('image/png,image/jpeg,image/webp,image/svg+xml,image/gif'); if (!f) return;
          const r = await save(upload('/logo/upload?name=' + encodeURIComponent(f.name), f), 'Logo yüklendi');
          if (r.ok) App.reloadConfig();
        } }, icon('upload', 'sm'), 'Logo yükle'),
        d.logo ? h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { await save(api('DELETE', '/logo'), 'Logo kaldırıldı'); App.reloadConfig(); } }, 'Kaldır') : null)),
      h('div', { class: 'lbl', text: 'Boyut' }),
      segmented([['normal', 'Normal'], ['big', 'Büyük']], d.logoSize || 'normal', (v) => putDisplay({ logoSize: v })),
      toggle('Logonun arkasına beyaz zemin', d.logoBg, (v) => putDisplay({ logoBg: v }), 'Koyu temada görünmeyen logolar için'));

    // Tema ve düzen
    const themes = h('div', { class: 'tiles' }, THEMES.map(([id, name, bg, card, acc]) =>
      h('button', { class: 'tile', type: 'button', 'aria-pressed': String(d.theme === id), onclick: async () => { await putDisplay({ theme: id, accent: acc }); App.render(); } },
        h('span', { class: 'tprev', style: { background: bg } }, h('i', { style: { left: '8%', top: '14%', width: '40%', height: '30%', background: card } }), h('i', { style: { left: '52%', top: '14%', width: '40%', height: '30%', background: card } }), h('i', { style: { left: '8%', top: '54%', width: '84%', height: '30%', background: acc } })), name)));
    const layouts = h('div', { class: 'tiles' }, LAYOUTS.map(([id, name, blocks]) =>
      h('button', { class: 'tile', type: 'button', 'aria-pressed': String(d.layout === id), onclick: async () => { await putDisplay({ layout: id }); App.render(); } },
        h('span', { class: 'tprev', style: { background: '#0E1A2B' } }, blocks.map(([x, y, w, hh, k]) => h('i', { style: { left: x + '%', top: y + '%', width: w + '%', height: hh + '%', background: k === 'm' ? '#6CA8FF' : k === 'a' ? '#F2A93B' : '#2B3B55' } }))), name)));
    const sw = h('div', { class: 'swatches' }, ACCENTS.map((c) => h('button', { class: 'swatch', type: 'button', style: { background: c }, 'aria-label': 'Vurgu ' + c, 'aria-pressed': String((d.accent || '').toLowerCase() === c.toLowerCase()), onclick: async () => { await putDisplay({ accent: c }); App.render(); } })));
    const custom = h('input', { type: 'color', value: d.accent || '#F2A93B', 'aria-label': 'Özel vurgu rengi' });
    custom.onchange = async () => { await putDisplay({ accent: custom.value }); App.render(); };
    sw.append(custom);
    const lookCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'TV teması' })), themes,
      h('div', { class: 'lbl', text: 'Vurgu rengi' }), sw,
      h('div', { class: 'lbl', text: 'Düzen' }), layouts,
      (App.config.media || []).length ? null : h('p', { class: 'small muted', text: 'Medya eklenmediyse TV her zaman Klasik düzende görünür.' }),
      h('div', { class: 'divider' }),
      toggle('Nöbetçileri göster', d.showDuty !== false, (v) => putDisplay({ showDuty: v })),
      toggle('Yemek menüsünü göster', d.showMenu !== false, (v) => putDisplay({ showMenu: v })),
      toggle('Medyayı sadece teneffüste göster', d.mediaOnlyBreaks, (v) => putDisplay({ mediaOnlyBreaks: v }), 'Ders sırasında Klasik düzen'),
      toggle('Hava durumunu göster', d.showWeather !== false, (v) => putDisplay({ showWeather: v }), 'Şehir: Ayarlar › Genel'),
      toggle('Geri sayımları göster', d.showCountdown !== false, (v) => putDisplay({ showCountdown: v }), 'Geri sayımlar: Duyurular sayfası'));

    // Teneffüs görünümü
    const st = { ...STATUS_DEF, ...(d.status || {}) };
    const stRow = (label, tk, ck) => {
      const t = h('input', { value: st[tk], 'aria-label': label + ' yazısı' });
      t.onchange = () => putDisplay({ status: { [tk]: t.value.trim() || STATUS_DEF[tk] } });
      const c = h('input', { type: 'color', value: st[ck], 'aria-label': label + ' rengi' });
      c.onchange = () => putDisplay({ status: { [ck]: c.value } });
      return [h('span', { class: 'small', style: { fontWeight: 600 }, text: label }), t, c];
    };
    const wm = h('input', { type: 'number', min: 0, max: 10, value: st.warnMinutes });
    wm.onchange = () => putDisplay({ status: { warnMinutes: Number(wm.value) || 0 } });
    const statusCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Teneffüs görünümü' }), h('p', { text: 'Teneffüs ve öğle arasında TV\'nin rengi ve yazısı değişir' }))),
      toggle('Renk değişsin', st.enabled, (v) => putDisplay({ status: { enabled: v } })),
      toggle('Teneffüste en büyük yazı derse kalan süre olsun', st.bigCountdown, (v) => putDisplay({ status: { bigCountdown: v } })),
      h('div', { class: 'status-rows', style: { marginTop: '12px' } },
        h('span', { class: 'h', text: 'Durum' }), h('span', { class: 'h', text: 'Ekrandaki yazı' }), h('span', { class: 'h', text: 'Renk' }),
        stRow('Teneffüs', 'breakText', 'breakColor'), stRow('Öğle arası', 'lunchText', 'lunchColor'), stRow('Uyarı', 'warnText', 'warnColor')),
      h('div', { style: { marginTop: '12px' } }, field('Uyarı, ders başlamadan kaç dakika önce çıksın? (0 = kapalı)', wm)),
      h('button', { class: 'btn sm ghost', style: { marginTop: '10px' }, type: 'button', onclick: async () => { await putDisplay({ status: { ...STATUS_DEF } }, 'Varsayılana döndü'); App.render(); } }, 'Varsayılanlara dön'));

    // İstiklal Marşı ekranı
    const a = { ...ANTHEM_DEF, ...(d.anthemScreen || {}) };
    const putA = (patch) => putDisplay({ anthemScreen: patch });
    const kick = h('input', { value: a.kicker }); kick.onchange = () => putA({ kicker: kick.value });
    const title = h('input', { value: a.title }); title.onchange = () => putA({ title: title.value.trim() || 'İstiklal Marşı' });
    const bg = h('input', { type: 'color', value: a.bg }); bg.onchange = () => putA({ bg: bg.value });
    const visBox = h('div');
    const drawVis = () => {
      visBox.innerHTML = '';
      if (a.visual !== 'image' && a.visual !== 'video') return;
      const isVid = a.visual === 'video';
      const file = isVid ? a.video : a.image;
      const box = h('div', { class: 'img-box dark' }, file ? (isVid ? h('video', { src: mediaUrl(file), muted: true, autoplay: true, loop: true, playsinline: true }) : h('img', { src: mediaUrl(file), alt: '' })) : (isVid ? 'Video yok' : 'Görsel yok'));
      const prog = h('div', { class: 'small muted' });
      visBox.append(h('div', { class: 'img-pick', style: { marginTop: '12px' } }, box, h('div', {},
        h('div', { class: 'row' },
          h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
            const [f] = await pickFile(isVid ? 'video/mp4,video/webm' : 'image/*'); if (!f) return;
            const r = await upload('/image/upload?name=' + encodeURIComponent(f.name), f, (p) => { prog.textContent = 'Yükleniyor %' + Math.round(p * 100); });
            prog.textContent = '';
            if (!r.ok) return toast(r.error, true);
            a[isVid ? 'video' : 'image'] = r.file;
            await putA({ [isVid ? 'video' : 'image']: r.file }); toast(isVid ? 'Video yüklendi' : 'Görsel yüklendi'); drawVis();
          } }, icon('upload', 'sm'), isVid ? 'Video seç' : 'Görsel seç'),
          file ? h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { a[isVid ? 'video' : 'image'] = null; await putA({ [isVid ? 'video' : 'image']: null }); drawVis(); } }, 'Kaldır') : null),
        h('div', { class: 'small muted', style: { marginTop: '6px' }, text: isVid ? 'Örn. dalgalanan bayrak videosu. Tam ekran ve sessiz oynar; marş sesi ayrıca çalar.' : 'Örn. bayrak fotoğrafı ya da okul amblemi.' }), prog)));
    };
    drawVis();
    const anthemCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'İstiklal Marşı ekranı' }), h('p', { text: 'Bütün törenlerde marş çalarken görünür' }))),
      h('div', { class: 'lbl', text: 'Ekranda ne görünsün?' }),
      segmented([['flag', 'Ay yıldız'], ['image', 'Görsel'], ['video', 'Bayrak videosu'], ['none', 'Sadece yazı']], a.visual, async (v) => { a.visual = v; await putA({ visual: v }); drawVis(); }, 'block'),
      visBox,
      h('div', { class: 'grid two', style: { gap: '12px', marginTop: '12px' } }, field('Üst yazı', kick), field('Başlık', title)),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('label', { htmlFor: (bg.id = nextId()), class: 'grow', text: 'Arka plan rengi' }), bg),
      toggle('Başlığın altında tören adını göster', a.showCeremonyName, (v) => putA({ showCeremonyName: v })),
      toggle('İlerleme çubuğunu göster', a.showProgress, (v) => putA({ showProgress: v })),
      h('p', { class: 'small muted', text: 'Saygı duruşu ekranı her törenin kendi ayarlarındadır (Törenler › Düzenle).' }));

    const settingsCol = h('div', { class: 'grid' }, logoCard, lookCard, statusCard, anthemCard);
    root.append(h('div', { class: 'grid look' }, settingsCol, preview));
    // Telefonda önizleme üstte dursun
    if (matchMedia('(max-width: 959px)').matches) root.querySelector('.grid.look').prepend(preview);
  }

  // ================= SESLER =================
  const ROLES = [
    ['Ziller', [['student', 'Derse giriş zili'], ['teacher', 'Öğretmen zili'], ['end', 'Çıkış zili']]],
    ['Törenler', [['anthem', 'İstiklal Marşı'], ['siren', 'Saygı duruşu sireni']]],
    ['Anons', [['chime', 'Anons öncesi "ding-dong"']]],
    ['Acil durum', [['deprem', 'Deprem alarmı'], ['yangin', 'Yangın alarmı'], ['tahliye', 'Tahliye alarmı'], ['kilit', 'Sınıfta kal alarmı']]]
  ];
  let player = null;
  function listen(file, btn) {
    if (player) { player.pause(); player = null; document.querySelectorAll('[data-playing]').forEach((b) => { b.removeAttribute('data-playing'); b.replaceChildren(icon('play', 'sm')); }); if (btn && btn.dataset.file === file && btn.wasPlaying) return; }
    if (!file) return;
    player = new Audio(soundUrl(file));
    player.play().catch(() => toast('Ses çalınamadı', true));
    if (btn) { btn.setAttribute('data-playing', ''); btn.replaceChildren(icon('stop', 'sm')); player.onended = () => { btn.removeAttribute('data-playing'); btn.replaceChildren(icon('play', 'sm')); }; }
  }

  async function sounds(root) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'muted', text: 'Yükleniyor…' })));
    const lib = await api('GET', '/sounds');
    root.innerHTML = '';
    if (!lib.files) return root.append(h('div', { class: 'empty', text: lib.error || 'Ses listesi alınamadı' }));
    const names = new Set(lib.files.map((f) => f.name));
    const roleCards = ROLES.map(([group, roles]) => h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: group })),
      roles.map(([role, label]) => {
        const cur = lib.roles[role] || '';
        const missing = cur && !names.has(cur);
        const sel = h('select', { 'aria-label': label }, h('option', { value: '', text: '— Yedek ses (programın kendi sesi) —', selected: !cur || missing }),
          lib.files.map((f) => h('option', { value: f.name, text: f.name, selected: f.name === cur })));
        sel.onchange = async () => { await save(api('PUT', '/sounds/roles', { [role]: sel.value }), label + ' değişti'); App.render(); };
        const playBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dinle', 'data-file': sel.value, disabled: !sel.value || missing }, icon('play', 'sm'));
        playBtn.onclick = () => { playBtn.wasPlaying = playBtn.hasAttribute('data-playing'); listen(sel.value, playBtn); };
        const up = h('button', { class: 'btn', type: 'button', onclick: async () => {
          const [f] = await pickFile('audio/*'); if (!f) return;
          const r = await save(upload('/sounds/upload?role=' + role + '&name=' + encodeURIComponent(f.name), f), label + ' yüklendi');
          if (r.ok) App.render();
        } }, icon('upload', 'sm'), 'Yükle');
        return h('div', { class: 'sound-row' },
          h('div', { class: 'sr-head' }, h('span', { class: 'sr-name', text: label }), !cur || missing ? h('span', { class: 'chip warn', text: 'yedek ses' }) : null),
          h('div', { class: 'sr-ctrl' }, sel, playBtn, up));
      })));

    // Teneffüs müzikleri
    const musicList = h('div', {}, lib.music.length ? lib.music.map((f) => {
      const pb = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Dinle', 'data-file': 'muzik/' + f.name }, icon('play', 'sm'));
      pb.onclick = () => { pb.wasPlaying = pb.hasAttribute('data-playing'); listen('muzik/' + f.name, pb); };
      return h('div', { class: 'file-row' }, icon('music', 'sm'), h('span', { class: 'nm', text: f.name }), pb,
        f.source === 'uploaded' ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Sil', onclick: async () => { await save(api('DELETE', '/sounds/' + encodeURIComponent(f.name) + '?folder=muzik'), 'Silindi'); App.render(); } }, icon('trash', 'sm')) : null);
    }) : h('div', { class: 'muted small', text: 'Henüz müzik yok.' }));
    const musicCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Teneffüs müzikleri' }), h('p', { text: 'Teneffüslerde rastgele çalar, öğretmen zilinde durur' })),
        h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
          const fs = await pickFile('audio/*', true);
          for (const f of fs) await save(upload('/sounds/upload?folder=muzik&name=' + encodeURIComponent(f.name), f), f.name + ' yüklendi');
          if (fs.length) App.render();
        } }, icon('upload', 'sm'), 'Müzik yükle')),
      musicList,
      toggle('Teneffüslerde müzik çal', App.config.breakMusic, async (v) => { App.config.breakMusic = v; await save(api('PUT', '/settings', { breakMusic: v })); }));

    // Kütüphane
    const libCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Ses kütüphanesi' }), h('p', { text: 'Yüklenen tüm sesler. Bir sesi birden çok yerde kullanabilirsiniz.' })),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          const fs = await pickFile('audio/*', true);
          for (const f of fs) await save(upload('/sounds/upload?name=' + encodeURIComponent(f.name), f), f.name + ' yüklendi');
          if (fs.length) App.render();
        } }, icon('upload', 'sm'), 'Ses yükle')),
      lib.files.length ? lib.files.map((f) => {
        const used = Object.entries(lib.roles).filter(([, v]) => v === f.name).length;
        return h('div', { class: 'file-row' }, icon('volume', 'sm'), h('span', { class: 'nm', text: f.name }),
          used ? h('span', { class: 'chip ok', text: 'kullanımda' }) : null,
          h('span', { class: 'small muted', text: Math.max(1, Math.round(f.size / 1024)) + ' KB' }),
          f.source === 'uploaded' ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Sil', onclick: async () => {
            if (used && !(await confirmBox({ title: f.name + ' silinsin mi?', text: 'Bu ses kullanımda. Silinirse yerine programın yedek sesi çalar.', ok: 'Sil', danger: true }))) return;
            await save(api('DELETE', '/sounds/' + encodeURIComponent(f.name)), 'Silindi'); App.render();
          } }, icon('trash', 'sm')) : h('span', { class: 'chip', text: 'hazır' }));
      }) : h('div', { class: 'muted small', text: 'Henüz ses yüklenmedi.' }));

    root.append(h('p', { class: 'muted', style: { marginTop: 0 }, text: 'Her iş için bir ses seçin ya da doğrudan "Yükle" ile o işe ses yükleyin. "Dinle" sesi bu cihazda çalar, TV\'de değil.' }),
      h('div', { class: 'grid two' }, h('div', { class: 'grid' }, roleCards), h('div', { class: 'grid' }, musicCard, libCard)));
  }

  // ================= TAKVİM =================
  function calendar(root) {
    const c = App.config;
    const days = [...c.weekdays];
    const hol = (c.holidays || []).map((x) => ({ ...x, yearly: x.date.length === 5 }));
    const brk = (c.breaks || []).map((x) => ({ ...x }));
    const year = serverNow().getFullYear();

    const dayBox = h('div', { class: 'daychips' });
    const drawDays = () => {
      dayBox.innerHTML = '';
      for (const n of [1, 2, 3, 4, 5, 6, 0]) dayBox.append(h('button', { type: 'button', 'aria-pressed': String(days.includes(n)), text: DAYS_SHORT[n], onclick: () => { const i = days.indexOf(n); if (i >= 0) days.splice(i, 1); else days.push(n); drawDays(); } }));
    };
    drawDays();

    const holBox = h('div', { class: 'list-rows' });
    const drawHol = () => {
      holBox.innerHTML = '';
      hol.forEach((x, i) => {
        const date = h('input', { type: 'date', value: x.yearly ? year + '-' + x.date : x.date, 'aria-label': 'Tarih' });
        date.onchange = () => { if (date.value) x.date = x.yearly ? date.value.slice(5) : date.value; };
        const name = h('input', { value: x.name, placeholder: 'Tatil adı', 'aria-label': 'Tatil adı' });
        name.oninput = () => { x.name = name.value; };
        const yr = h('select', { 'aria-label': 'Tekrar' }, h('option', { value: '1', text: 'Her yıl', selected: x.yearly }), h('option', { value: '0', text: 'Bir kez', selected: !x.yearly }));
        yr.onchange = () => { x.yearly = yr.value === '1'; x.date = x.yearly ? (date.value || year + '-01-01').slice(5) : date.value || year + '-01-01'; };
        holBox.append(h('div', { class: 'list-row', style: { flexWrap: 'wrap' } }, h('div', { style: { width: '160px' } }, date), h('div', { style: { width: '110px' } }, yr), h('div', { class: 'grow', style: { minWidth: '140px' } }, name),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sil', onclick: () => { hol.splice(i, 1); drawHol(); } }, icon('trash', 'sm'))));
      });
      holBox.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, type: 'button', onclick: () => { hol.push({ date: new Date().toISOString().slice(0, 10), name: '', yearly: false }); drawHol(); } }, icon('plus', 'sm'), 'Tatil ekle'));
    };
    drawHol();

    const brkBox = h('div', { class: 'list-rows' });
    const drawBrk = () => {
      brkBox.innerHTML = '';
      brk.forEach((x, i) => {
        const from = h('input', { type: 'date', value: x.from, 'aria-label': 'Başlangıç' }); from.onchange = () => { x.from = from.value; };
        const to = h('input', { type: 'date', value: x.to, 'aria-label': 'Bitiş' }); to.onchange = () => { x.to = to.value; };
        const name = h('input', { value: x.name, placeholder: 'Örn. Yarıyıl tatili', 'aria-label': 'Ad' }); name.oninput = () => { x.name = name.value; };
        brkBox.append(h('div', { class: 'list-row', style: { flexWrap: 'wrap' } }, h('div', { style: { width: '160px' } }, from), h('span', { class: 'muted', text: '→' }), h('div', { style: { width: '160px' } }, to), h('div', { class: 'grow', style: { minWidth: '140px' } }, name),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sil', onclick: () => { brk.splice(i, 1); drawBrk(); } }, icon('trash', 'sm'))));
      });
      brkBox.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, type: 'button', onclick: () => { const t = new Date().toISOString().slice(0, 10); brk.push({ from: t, to: t, name: '' }); drawBrk(); } }, icon('plus', 'sm'), 'Uzun tatil ekle'));
    };
    drawBrk();

    const doSave = async () => {
      const holidays = hol.filter((x) => x.date).map((x) => ({ date: x.date, name: x.name.trim() || 'Tatil' }));
      const breaks = brk.filter((x) => x.from && x.to).map((x) => ({ from: x.from <= x.to ? x.from : x.to, to: x.from <= x.to ? x.to : x.from, name: x.name.trim() || 'Tatil' }));
      const r = await save(api('PUT', '/settings', { weekdays: days, holidays, breaks }));
      if (r.ok) App.reloadConfig();
    };

    root.append(h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Ders günleri' }), h('p', { text: 'Seçili olmayan günlerde zil çalmaz' }))), dayBox),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Tatiller' }), h('p', { text: 'Resmî tatiller her yıl tekrar eder. Dinî bayramları her yıl "Bir kez" olarak ekleyin.' }))), holBox),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Uzun tatiller' }), h('p', { text: 'Ara tatil, yarıyıl tatili gibi tarih aralıkları' }))), brkBox),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary lg', type: 'button', onclick: doSave }, icon('check', 'sm'), 'Takvimi kaydet'))));
  }

  // ================= SİSTEM =================
  async function system(root) {
    const info = await api('GET', '/info');
    const log = await api('GET', '/log');
    const tests = [['student', 'Giriş zili'], ['teacher', 'Öğretmen zili'], ['end', 'Çıkış zili'], ['siren', 'Siren'], ['chime', 'Anons sesi'], ['deprem', 'Deprem'], ['yangin', 'Yangın']];
    root.append(h('div', { class: 'grid two' },
      h('div', { class: 'grid' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Bağlantı' })),
          h('div', { class: 'lbl', text: 'TV panosu (sistem odasındaki bilgisayarda)' }), h('div', { class: 'addr', text: 'http://localhost:' + (info.port || 3000) + '/pano/' }),
          h('div', { class: 'lbl', text: 'Kontrol paneli (okul ağındaki telefon ve bilgisayarlardan)' }),
          (info.addresses || []).map((a) => h('div', { class: 'addr', style: { marginBottom: '6px' }, text: 'http://' + a + ':' + info.port + '/panel/' })),
          h('div', { class: 'small muted', style: { marginTop: '10px' }, text: 'Program sürümü: ' + (info.build || '?') })),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'TV\'de ses testi' }), h('p', { text: 'Sesi sistem odasındaki hoparlörlerden çalar' }))),
          h('div', { class: 'row' }, tests.map(([k, n]) => h('button', { class: 'btn sm', type: 'button', onclick: () => save(api('POST', '/test-sound', { sound: k }), n + ' çalınıyor') }, icon('volume', 'sm'), n)))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Yedekleme' }), h('p', { text: 'Ayarlar, sesler, logo ve medya tek dosyada. Bilgisayar değişirse yeni bilgisayarda geri yükleyin.' }))),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', type: 'button', onclick: downloadBackup }, icon('down', 'sm'), 'Yedeği indir'),
            h('button', { class: 'btn', type: 'button', onclick: restoreBackup }, icon('upload', 'sm'), 'Yedekten geri yükle'))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Kurulum' })),
          h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', onclick: () => App.wizard() }, icon('wand', 'sm'), 'Kurulum sihirbazını aç'),
            h('button', { class: 'btn ghost', type: 'button', onclick: () => App.logout() }, 'Çıkış yap')))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Kayıt' }), h('p', { text: 'Son olaylar (en yeni üstte)' }))),
        h('div', { class: 'timeline' }, (Array.isArray(log) ? log : []).slice(0, 60).map((l) => {
          const [t, ...rest] = l.split(' · ');
          return h('div', { class: 'tl-item small' }, h('span', { class: 'muted', style: { width: '128px', flexShrink: 0 }, text: t }), h('span', { class: 'l', text: rest.join(' · ') }));
        })))));
  }

  async function downloadBackup(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await fetch('/api/backup', { headers: { 'x-pin': App.pin } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const name = (r.headers.get('Content-Disposition') || '').match(/filename="(.+)"/);
      const a = h('a', { href: URL.createObjectURL(blob), download: name ? name[1] : 'okulzil-yedek.zip' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Yedek indirildi');
    } catch (err) { toast('Yedek alınamadı', true); }
    btn.disabled = false;
  }
  async function restoreBackup() {
    const [f] = await pickFile('.zip,application/zip');
    if (!f) return;
    const ok = await confirmBox({ title: 'Yedek geri yüklensin mi?', text: 'Şu anki ayarların yerine yedekteki ayarlar, sesler ve medya gelir. PIN değişmez. Şu anki ayarlar ayrıca saklanır.', ok: 'Geri yükle', danger: true });
    if (!ok) return;
    toast('Geri yükleniyor…');
    const r = await save(upload('/backup/restore', f), 'Yedek geri yüklendi');
    if (r.ok) await App.reloadConfig();
  }

  App.pages.set = { render, leave: () => { if (player) { player.pause(); player = null; } } };
})();
