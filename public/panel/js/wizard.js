// İlk kurulum sihirbazı
'use strict';
(function () {
  const STEPS = ['Okul', 'Ders saatleri', 'Sesler', 'Görünüm', 'Güvenlik', 'Hazır'];

  App.wizard = function () {
    let step = 0;
    const c = App.config;
    const data = { name: c.schoolName === '[OKUL ADI]' ? '' : c.schoolName, gen: null, pin1: '', pin2: '' };
    const root = h('div', { class: 'wizard', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kurulum sihirbazı' });
    document.body.appendChild(root);

    const finish = async () => {
      await api('PUT', '/setup', { done: true });
      App.config.setupDone = true;
      root.remove();
      await App.reloadConfig();
      App.go('home');
    };

    async function next() {
      // Adımı kaydet
      if (step === 0) {
        if (!data.name.trim()) return toast('Okul adını yazın', true);
        await save(api('PUT', '/settings', { schoolName: data.name.trim() }), null);
      }
      if (step === 1 && data.gen) {
        await App.reloadConfig(false);
        const progs = App.config.programs;
        progs[App.config.activeProgram].lessons = App.genLessons(data.gen);
        await save(api('PUT', '/programs', { programs: progs }), 'Ders saatleri kaydedildi');
      }
      if (step === 4 && (data.pin1 || data.pin2)) {
        if (!/^\d{4,8}$/.test(data.pin1)) return toast('PIN 4–8 rakam olmalı', true);
        if (data.pin1 !== data.pin2) return toast('PIN\'ler aynı değil', true);
        const r = await save(api('PUT', '/settings', { newPin: data.pin1 }), 'PIN değişti');
        if (r.ok) { App.pin = data.pin1; try { localStorage.setItem('zilPin', App.pin); } catch (e) {} }
      }
      step++;
      draw();
    }

    async function draw() {
      await App.reloadConfig(false);
      const cfg = App.config;
      root.innerHTML = '';
      const inner = h('div', { class: 'wiz-inner' });
      root.append(inner);
      inner.append(h('div', { class: 'wiz-top' },
        h('div', { class: 'wiz-dots', 'aria-label': 'Adım ' + (step + 1) + ' / ' + STEPS.length }, STEPS.map((_, i) => h('span', { class: i <= step ? 'on' : '' }))),
        step < STEPS.length - 1 ? h('button', { class: 'btn ghost sm', type: 'button', onclick: finish, text: 'Şimdilik atla' }) : null));
      const nav = (nextLabel, canBack = true) => h('div', { class: 'wiz-nav' },
        canBack && step > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => { step--; draw(); }, text: 'Geri' }) : h('span'),
        h('button', { class: 'btn primary lg', type: 'button', onclick: next }, nextLabel || 'Devam'));

      if (step === 0) {
        const name = h('input', { value: data.name, placeholder: 'Örn. Atatürk Anadolu Lisesi' });
        name.oninput = () => { data.name = name.value; };
        const logoBox = h('div', { class: 'img-box dark' }, cfg.display.logo ? h('img', { src: mediaUrl(cfg.display.logo), alt: '' }) : 'Logo yok');
        inner.append(h('div', { class: 'small muted', text: 'Adım 1 / 6' }), h('h1', { text: 'Hoş geldiniz' }),
          h('p', { text: 'Birkaç adımda zil sistemini okulunuza göre hazırlayalım. Her şeyi daha sonra Ayarlar\'dan değiştirebilirsiniz.' }),
          h('div', { class: 'card' }, field('Okul adı', name),
            h('div', { class: 'lbl', text: 'Okul logosu (isteğe bağlı)' }),
            h('div', { class: 'img-pick' }, logoBox, h('button', { class: 'btn', type: 'button', onclick: async () => {
              const [f] = await pickFile('image/*'); if (!f) return;
              const r = await save(upload('/logo/upload?name=' + encodeURIComponent(f.name), f), 'Logo yüklendi');
              if (r.ok) draw();
            } }, icon('upload', 'sm'), 'Logo yükle'))),
          nav());
      } else if (step === 1) {
        const first = (cfg.programs[cfg.activeProgram].lessons[0] || {}).start;
        const prev = h('div');
        const form = App.genForm({ start: first || '08:10' }, (o) => { data.gen = { ...o }; prev.replaceChildren(App.lessonPreview(App.genLessons(o))); });
        data.gen = { ...form.get() };
        prev.append(App.lessonPreview(App.genLessons(form.get())));
        inner.append(h('div', { class: 'small muted', text: 'Adım 2 / 6' }), h('h1', { text: 'Ders saatleri' }),
          h('p', { text: 'Ders süresini ve teneffüsleri girin, saatleri biz hesaplayalım. Farklı süreli teneffüsler varsa sonra Zil sayfasından tek tek düzeltebilirsiniz.' }),
          h('div', { class: 'card' }, form.el, h('div', { class: 'section-title', text: 'Önizleme' }), prev), nav('Kaydet ve devam'));
      } else if (step === 2) {
        const lib = await api('GET', '/sounds');
        const names = new Set((lib.files || []).map((f) => f.name));
        const rows = [['student', 'Derse giriş zili', true], ['teacher', 'Öğretmen zili'], ['end', 'Çıkış zili'], ['anthem', 'İstiklal Marşı', true], ['siren', 'Saygı duruşu sireni']];
        inner.append(h('div', { class: 'small muted', text: 'Adım 3 / 6' }), h('h1', { text: 'Sesler' }),
          h('p', { text: 'Zil seslerini ve İstiklal Marşı\'nı yükleyin. Yüklemezseniz program kendi yedek zil ve siren seslerini çalar; İstiklal Marşı için dosya gerekir.' }),
          h('div', { class: 'card' }, rows.map(([role, label, important]) => {
            const cur = lib.roles && lib.roles[role];
            const ok = cur && names.has(cur);
            return h('div', { class: 'file-row', style: { padding: '12px 0' } },
              icon(role === 'anthem' ? 'flag' : role === 'siren' ? 'siren' : 'bell'),
              h('span', { class: 'nm' }, h('b', { text: label }), h('div', { class: 'small muted', text: ok ? cur : important ? 'Önerilir' : 'İsteğe bağlı' })),
              ok ? h('span', { class: 'chip ok' }, icon('check', 'sm'), 'Hazır') : null,
              h('button', { class: 'btn sm' + (ok ? '' : ' primary'), type: 'button', onclick: async () => {
                const [f] = await pickFile('audio/*'); if (!f) return;
                const r = await save(upload('/sounds/upload?role=' + role + '&name=' + encodeURIComponent(f.name), f), label + ' yüklendi');
                if (r.ok && role === 'student') {
                  // Diğer ziller boşsa aynı sesi kullan
                  const patch = {};
                  for (const k of ['teacher', 'end']) if (!(lib.roles[k] && names.has(lib.roles[k]))) patch[k] = r.file;
                  if (Object.keys(patch).length) await api('PUT', '/sounds/roles', patch);
                }
                draw();
              } }, icon('upload', 'sm'), ok ? 'Değiştir' : 'Yükle'));
          })), nav());
      } else if (step === 3) {
        const frame = h('iframe', { class: 'preview-frame', title: 'TV önizlemesi', src: '/pano/?preview=1&demo=lesson' });
        const themes = [['dark', 'Gece', '#0E1A2B', '#15233A', '#F2A93B'], ['light', 'Gündüz', '#EEF1F5', '#FFFFFF', '#F2A93B'], ['ocean', 'Okyanus', '#0B2545', '#13315C', '#6CA8FF'], ['forest', 'Orman', '#0F2A22', '#163A2F', '#4FC3A1'], ['flag', 'Bayrak', '#8E0E1F', '#A8182C', '#FFFFFF'], ['sand', 'Kum', '#F5EFE6', '#FFFDF8', '#FF7A59'], ['contrast', 'Yüksek kontrast', '#000000', '#141414', '#F2A93B']];
        const tiles = h('div', { class: 'tiles' }, themes.map(([id, name, bg, card, acc]) => h('button', { class: 'tile', type: 'button', 'aria-pressed': String(cfg.display.theme === id), onclick: async (e) => {
          tiles.querySelectorAll('.tile').forEach((t) => t.setAttribute('aria-pressed', String(t === e.currentTarget)));
          await api('PUT', '/display', { theme: id, accent: acc });
        } }, h('span', { class: 'tprev', style: { background: bg } }, h('i', { style: { left: '8%', top: '14%', width: '40%', height: '30%', background: card } }), h('i', { style: { left: '52%', top: '14%', width: '40%', height: '30%', background: card } }), h('i', { style: { left: '8%', top: '54%', width: '84%', height: '30%', background: acc } })), name)));
        inner.append(h('div', { class: 'small muted', text: 'Adım 4 / 6' }), h('h1', { text: 'TV görünümü' }),
          h('p', { text: 'Koridordaki TV\'lerde nasıl görüneceğini seçin. Önizleme anında değişir.' }),
          h('div', { class: 'card' }, frame, h('div', { style: { height: '14px' } }), tiles), nav());
      } else if (step === 4) {
        const p1 = h('input', { type: 'password', inputmode: 'numeric', placeholder: '4–8 rakam', autocomplete: 'new-password' });
        const p2 = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'Tekrar', autocomplete: 'new-password' });
        p1.oninput = () => { data.pin1 = p1.value; };
        p2.oninput = () => { data.pin2 = p2.value; };
        inner.append(h('div', { class: 'small muted', text: 'Adım 5 / 6' }), h('h1', { text: 'Panel PIN\'i' }),
          h('p', { text: 'Okul ağındaki herkes panelin adresine ulaşabilir. Alarm ve törenleri sadece yetkililer başlatabilsin diye varsayılan PIN\'i (1234) değiştirin.' }),
          h('div', { class: 'card' }, h('div', { class: 'grid two', style: { gap: '12px' } }, field('Yeni PIN', p1), field('Yeni PIN (tekrar)', p2)),
            h('p', { class: 'small muted', style: { marginBottom: 0 }, text: 'Boş bırakırsanız PIN değişmez.' })), nav('Devam'));
      } else {
        const info = await api('GET', '/info');
        inner.append(h('div', { class: 'small muted', text: 'Adım 6 / 6' }), h('h1', { text: 'Her şey hazır' }),
          h('p', { text: 'Son olarak TV\'lere giden ekranı açın.' }),
          h('div', { class: 'card' },
            h('div', { class: 'lbl', style: { marginTop: 0 }, text: '1. Sistem odasındaki bilgisayarda Chrome ile açın, F11 ile tam ekran yapın ve ekrana bir kez tıklayın:' }),
            h('div', { class: 'addr', text: 'http://localhost:' + (info.port || 3000) + '/pano/' }),
            h('div', { class: 'lbl', text: '2. Telefonunuzdan bu paneli açmak için (okul ağında):' }),
            (info.addresses || []).map((a) => h('div', { class: 'addr', style: { marginBottom: '6px' }, text: 'http://' + a + ':' + info.port + '/panel/' })),
            h('p', { class: 'small muted', text: 'Programı masaüstü uygulaması (npm start) olarak çalıştırırsanız pano kendiliğinden tam ekran açılır, tıklamaya gerek kalmaz.' })),
          h('div', { class: 'wiz-nav' }, h('button', { class: 'btn', type: 'button', onclick: () => { step--; draw(); }, text: 'Geri' }), h('button', { class: 'btn primary lg', type: 'button', onclick: finish }, icon('check', 'sm'), 'Panele git')));
      }
      root.scrollTo(0, 0);
    }
    draw();
  };
})();
