// TV panosu: ekranları gösterir ve (audio=1 ise) sesleri çalar.
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  // Ses varsayılan olarak açık. Sadece ek ekranlarda sessiz istenirse: ?audio=0
  const AUDIO = params.get('audio') !== '0';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  let state = null;
  let clockOffset = 0; // sunucu saati ile fark (ms)
  const now = () => new Date(Date.now() + clockOffset);

  // ---------- Ölçekleme ----------
  function fit() {
    const s = Math.min(innerWidth / 1280, innerHeight / 720);
    const st = $('stage');
    st.style.transform = `translate(${(innerWidth - 1280 * s) / 2}px, ${(innerHeight - 720 * s) / 2}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();


  // ---------- Ses ----------
  const AC = new (window.AudioContext || window.webkitAudioContext)();
  const active = new Set(); // çalan sesler
  // Tarayıcı izin vermediyse AudioContext "suspended" durumda kalır
  function audioReady() {
    return AUDIO && AC.state === 'running';
  }
  function checkGate() {
    const wasHidden = !$('audioGate').classList.contains('show');
    const need = AUDIO && !audioReady();
    $('audioGate').classList.toggle('show', need);
    if (!need && !wasHidden && AUDIO) overlay('Ses açık', 2500);
    reportStatus();
  }
  // Sayfanın herhangi bir yerine tıklamak ya da bir tuşa basmak sesi açar
  const unlock = () => {
    AC.resume().then(checkGate, checkGate);
    checkGate();
  };
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  AC.onstatechange = checkGate;
  // Not: tarayıcı izin vermezse resume() hiç sonuçlanmaz; bu yüzden durumu ayrıca kontrol ediyoruz
  AC.resume().catch(() => {});
  setTimeout(checkGate, 500);
  setInterval(checkGate, 5000);

  // Sunucuya "ses çıkışı burada" bilgisini gönder (panelde gösterilir)
  let lastReport = 0;
  function reportStatus() {
    if (!AUDIO || Date.now() - lastReport < 4000) return;
    lastReport = Date.now();
    fetch('/api/pano-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PANO_ID, ready: audioReady() })
    }).catch(() => {});
  }
  const PANO_ID = Math.random().toString(36).slice(2);

  // Fare hareket edince imleç görünür, 3 sn durunca TV'de görünmesin diye gizlenir
  let cursorTimer = null;
  document.addEventListener('mousemove', () => {
    document.body.classList.add('show-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.remove('show-cursor'), 3000);
  });

  function stopAllAudio() {
    for (const a of [...active]) a.stop();
    active.clear();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // Dosya çal; dosya yoksa false döner
  function playFile(name, { loop = false, volume = 1, onProgress } = {}) {
    let handle;
    const p = new Promise((resolve) => {
      if (!AUDIO || !name) return resolve(false);
      const a = new Audio('/sounds/' + name.split('/').map(encodeURIComponent).join('/'));
      a.loop = loop;
      a.volume = volume;
      let done = false;
      const fin = (ok) => {
        if (done) return;
        done = true;
        active.delete(handle);
        resolve(ok);
      };
      handle = { stop() { a.pause(); fin(true); }, el: a };
      active.add(handle);
      a.onended = () => fin(true);
      a.onerror = () => fin(false);
      if (onProgress) a.ontimeupdate = () => a.duration && onProgress(a.currentTime, a.duration);
      a.play().catch(() => fin(false));
    });
    return p;
  }

  // Dosya bulunamazsa sentezlenmiş ses
  function synth(kind, seconds) {
    return new Promise((resolve) => {
      if (!AUDIO) return setTimeout(() => resolve(true), seconds * 1000);
      if (AC.state === 'suspended') AC.resume();
      const g = AC.createGain();
      g.connect(AC.destination);
      const o = AC.createOscillator();
      o.connect(g);
      const t0 = AC.currentTime + 0.05;
      const end = t0 + seconds;
      g.gain.setValueAtTime(0.0001, AC.currentTime);
      if (kind === 'bell') {
        o.type = 'triangle';
        const notes = [784, 659, 523, 659, 784, 659, 523];
        notes.forEach((f, i) => {
          const t = t0 + i * 0.55;
          o.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        });
      } else if (kind === 'chime') {
        o.type = 'sine';
        [659, 784, 988].forEach((f, i) => {
          const t = t0 + i * 0.45;
          o.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        });
      } else {
        o.type = 'sawtooth';
        g.gain.setValueAtTime(0.22, t0);
        g.gain.setValueAtTime(0.22, end - 0.05);
        g.gain.linearRampToValueAtTime(0.0001, end);
        if (kind === 'yangin') {
          for (let t = t0; t < end; t += 1) { o.frequency.setValueAtTime(960, t); o.frequency.setValueAtTime(640, t + 0.5); }
        } else if (kind === 'deprem') {
          for (let t = t0; t < end; t += 0.5) { o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(1500, t + 0.45); }
        } else if (kind === 'kilit') {
          o.type = 'square';
          for (let t = t0; t < end; t += 1.5) { g.gain.setValueAtTime(0.18, t); g.gain.setValueAtTime(0.0001, t + 0.3); g.gain.setValueAtTime(0.18, t + 0.45); g.gain.setValueAtTime(0.0001, t + 0.75); }
          o.frequency.setValueAtTime(880, t0);
        } else {
          for (let t = t0; t < end; t += 4) { o.frequency.setValueAtTime(400, t); o.frequency.linearRampToValueAtTime(1000, t + 2); o.frequency.linearRampToValueAtTime(400, t + 4); }
        }
      }
      let done = false;
      const handle = {
        stop() {
          if (done) return;
          done = true;
          try { o.stop(); } catch (e) {}
          active.delete(handle);
          resolve(true);
        }
      };
      active.add(handle);
      o.onended = () => handle.stop();
      o.start(t0);
      o.stop(end);
    });
  }

  async function playOrSynth(file, kind, seconds) {
    const ok = await playFile(file);
    if (!ok && AUDIO) await synth(kind, seconds);
  }

  // Süreli ses (siren gibi): dosya varsa döngüde çalıp süre sonunda kes
  function timedSound(file, kind, seconds) {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => { if (!finished) { finished = true; clearTimeout(t); resolve(); } };
      const t = setTimeout(() => { stopAllAudio(); finish(); }, seconds * 1000);
      playFile(file, { loop: true }).then((ok) => {
        if (finished) return;
        if (!ok) synth(kind, seconds).then(finish);
      });
    });
  }

  // ---------- Teneffüs müziği ----------
  let musicOn = false;
  let musicHandle = null;
  async function startMusic() {
    if (musicOn || !AUDIO) return;
    musicOn = true;
    let list = [];
    try { list = await (await fetch('/api/music')).json(); } catch (e) {}
    if (!list.length) { musicOn = false; return; }
    while (musicOn) {
      const f = list[Math.floor(Math.random() * list.length)];
      const ok = await playFile(f, { volume: 0.6 });
      if (!ok) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  function stopMusic() {
    musicOn = false;
    for (const a of [...active]) if (a.el && a.el.volume < 1) a.stop();
  }

  // ---------- Bilgi ekranları (3 düzen ortak) ----------
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  let annIndex = 0;
  const all = (cls) => document.querySelectorAll('.' + cls);
  const setText = (cls, text) => all(cls).forEach((e) => { if (e.textContent !== text) e.textContent = text; });

  function setList(cls, items, empty) {
    all(cls).forEach((el) => {
      el.innerHTML = '';
      const rows = items.length ? items : [empty];
      for (const t of rows) {
        const d = document.createElement('div');
        if (!items.length) d.className = 'muted';
        d.textContent = t;
        el.appendChild(d);
      }
    });
  }

  // Açık renkli vurguda koyu yazı, koyu vurguda beyaz yazı
  function onAccent(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#0E1A2B' : '#FFFFFF';
  }

  function applyDisplay() {
    const d = state.display || {};
    document.body.dataset.theme = ['light', 'ocean', 'forest', 'flag', 'sand', 'contrast'].includes(d.theme) ? d.theme : 'dark';
    const accent = /^#[0-9a-fA-F]{6}$/.test(d.accent || '') ? d.accent : '#F2A93B';
    document.body.style.setProperty('--accent', accent);
    document.body.style.setProperty('--on-accent', onAccent(accent));
    // Okul logosu
    const logoSrc = d.logo ? '/media/' + encodeURIComponent(d.logo) : '';
    all('js-logo').forEach((img) => {
      if (img.getAttribute('data-src') !== logoSrc) {
        img.setAttribute('data-src', logoSrc);
        if (logoSrc) img.src = logoSrc; else img.removeAttribute('src');
      }
      img.classList.toggle('hide', !logoSrc);
      img.onerror = () => img.classList.add('hide');
    });
    document.body.classList.toggle('logo-big', d.logoSize === 'big');
    document.body.classList.toggle('logo-bg', !!d.logoBg);
    all('js-duty-card').forEach((e) => e.classList.toggle('hide', d.showDuty === false));
    all('js-menu-card').forEach((e) => e.classList.toggle('hide', d.showMenu === false));
    all('js-extras').forEach((e) => e.classList.toggle('hide', d.showDuty === false && d.showMenu === false));
  }

  function renderBoard() {
    if (!state) return;
    applyDisplay();
    setText('js-school', state.schoolName);
    const b = state.board || {};
    const duty = (b.duty || []).map((d) => d.place + (d.name ? ': ' + d.name : ''));
    setList('js-duty', duty, 'Henüz girilmedi');
    setList('js-menu', b.menu || [], 'Henüz girilmedi');
    setText('js-duty-line', duty.join(' · ') || 'Henüz girilmedi');
    setText('js-menu-line', (b.menu || []).join(' · ') || 'Henüz girilmedi');
    setText('js-ticker', b.ticker || state.schoolName);
    renderAnnouncements();
    const day = state.day;
    setText('js-prog', day.schoolDay ? day.programName : day.reason);
    setText('js-last', day.lessons.length ? day.lessons[day.lessons.length - 1].end : '—');
    updateLayout();
  }

  function renderAnnouncements() {
    const list = (state && state.board.announcements) || [];
    if (!list.length) { setText('js-ann-main', 'Duyuru yok'); setText('js-ann-next', ''); return; }
    annIndex = annIndex % list.length;
    setText('js-ann-main', list[annIndex]);
    setText('js-ann-next', list.length > 1 ? list[(annIndex + 1) % list.length] : '');
  }
  setInterval(() => { annIndex++; renderAnnouncements(); }, 10000);
  setInterval(() => document.querySelectorAll('.screen.info').forEach((s) => s.classList.toggle('shift')), 5 * 60 * 1000);

  function fmtLeft(sec) {
    if (sec < 60) return sec + ' sn';
    const m = Math.ceil(sec / 60);
    if (m < 60) return m + ' dk';
    return Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk';
  }

  let inLesson = false;
  const STATUS_DEFAULTS = { enabled: true, bigCountdown: true, breakText: 'TENEFFÜS', lunchText: 'ÖĞLE ARASI', warnText: 'SINIFLARINIZA GEÇİN', warnMinutes: 2, breakColor: '#2E9E5B', lunchColor: '#E07B1A', warnColor: '#F2C230' };
  let lastPhase = '';

  // Teneffüs / öğle arası / uyarı durumunu ekrana uygular
  function applyPhase(phase, info) {
    const st = { ...STATUS_DEFAULTS, ...((state && state.display && state.display.status) || {}) };
    const active = st.enabled && phase !== 'none';
    const color = phase === 'warn' ? st.warnColor : phase === 'lunch' ? st.lunchColor : st.breakColor;
    const text = phase === 'warn' ? st.warnText : phase === 'lunch' ? st.lunchText : st.breakText;
    const key = active + phase + color + text;
    if (key !== lastPhase) {
      lastPhase = key;
      document.body.classList.toggle('phase-on', active);
      document.body.classList.toggle('phase-warn', active && phase === 'warn');
      if (active) {
        document.body.style.setProperty('--phase', color);
        document.body.style.setProperty('--on-phase', onAccent(color));
      }
      setText('js-band-text', text);
    }
    if (active) {
      setText('js-band-sub', info.nextLabel);
      setText('js-band-left', info.left);
    }
    return active && st.bigCountdown;
  }

  function tickClock() {
    const d = now();
    const clock = pad(d.getHours()) + ':' + pad(d.getMinutes());
    setText('js-date', d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + DAYS[d.getDay()]);
    if (!state) { setText('js-clock', clock); return; }
    const day = state.day;
    const cur = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const L = day.lessons;
    const set = (o) => {
      inLesson = !!o.lesson;
      const big = applyPhase(o.phase || 'none', o);
      if (big) {
        // Teneffüste en büyük yazı: derse kalan süre. Saat geri sayım kartına geçer.
        setText('js-clock', o.left);
        setText('js-period', o.title + ' · ' + o.nextLabel);
        setText('js-count-title', 'Saat');
        setText('js-count-sub', o.period);
        setText('js-count-value', clock);
        document.body.classList.add('big-count');
      } else {
        setText('js-clock', clock);
        setText('js-period', o.period);
        setText('js-count-title', o.title);
        setText('js-count-sub', o.sub);
        setText('js-count-value', o.left || '');
        document.body.classList.remove('big-count');
      }
      all('js-count-card').forEach((c) => c.classList.toggle('idle', !!o.idle));
      updateLayout();
    };
    if (!day.schoolDay) return set({ period: day.reason || 'Bugün ders yok', title: 'Bugün ders yok', sub: day.reason || '', idle: true });
    if (!L.length) return set({ period: '', title: 'Ders programı boş', sub: '', idle: true });
    const secTo = (t) => Math.max(0, Math.round((toMin(t) - cur) * 60));
    const st = { ...STATUS_DEFAULTS, ...((state.display && state.display.status) || {}) };
    for (let i = 0; i < L.length; i++) {
      const s = toMin(L[i].start), e = toMin(L[i].end);
      if (cur < s) {
        const first = i === 0;
        const gap = first ? null : s - toMin(L[i - 1].end);
        const warn = s - cur <= (Number(st.warnMinutes) || 0);
        const phase = warn ? 'warn' : first ? 'none' : gap >= 30 ? 'lunch' : 'break';
        const period = first ? 'Dersler ' + L[0].start + '\'de başlıyor' : gap >= 30 ? 'Öğle arası' : 'Teneffüs';
        return set({
          phase, period,
          title: first ? 'İlk derse kalan' : 'Derse kalan',
          sub: (i + 1) + '. ders ' + L[i].start + ' – ' + L[i].end,
          nextLabel: (i + 1) + '. ders ' + L[i].start + '\'de',
          left: fmtLeft(secTo(L[i].start))
        });
      }
      if (cur < e) {
        const last = i === L.length - 1;
        return set({
          lesson: true, phase: 'none',
          period: (i + 1) + '. ders · ' + L[i].start + ' – ' + L[i].end,
          title: last ? 'Dersler bitimine kalan' : 'Teneffüse kalan',
          sub: 'Çıkış zili ' + L[i].end,
          left: fmtLeft(secTo(L[i].end))
        });
      }
    }
    set({ period: 'Dersler bitti', title: 'Bugünlük dersler bitti', sub: 'İyi akşamlar', idle: true });
  }
  setInterval(tickClock, 1000);

  // ---------- Düzen seçimi ----------
  let screen = 'normal'; // normal | anthem | saygi | alarm
  function currentLayout() {
    if (!state) return 'classic';
    const d = state.display || {};
    const media = state.media || [];
    if (!media.length || d.layout === 'classic') return 'classic';
    if (d.mediaOnlyBreaks && inLesson) return 'classic';
    return d.layout === 'fullmedia' ? 'fullmedia' : 'media';
  }
  function show(name) {
    screen = name;
    updateLayout();
  }
  let shownId = null;
  function updateLayout() {
    const layout = currentLayout();
    const id = screen === 'normal' ? 'scr-' + layout : 'scr-' + screen;
    if (id !== shownId) {
      shownId = id;
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
    }
    if (screen === 'normal' && layout !== 'classic') playerSet(document.querySelector('#' + id + ' .media-box'), state.media);
    else playerStop();
  }

  // ---------- Medya oynatıcı ----------
  const player = { box: null, key: '', list: [], idx: -1, el: null, timer: null };
  const mediaKey = (list) => (list || []).map((m) => m.id + ':' + m.duration).join('|');
  function playerSet(box, list) {
    const key = mediaKey(list);
    if (box === player.box && key === player.key) return;
    const keepIndex = box === player.box;
    playerStop();
    player.box = box;
    player.key = key;
    player.list = list || [];
    if (!keepIndex) player.idx = -1;
    if (box && player.list.length) playerNext();
  }
  function playerStop() {
    clearTimeout(player.timer);
    if (player.el) {
      if (player.el.tagName === 'VIDEO') { player.el.pause(); player.el.removeAttribute('src'); player.el.load(); }
      player.el.remove();
      player.el = null;
    }
    player.box = null;
    player.key = '';
  }
  function playerNext() {
    clearTimeout(player.timer);
    const list = player.list;
    if (!player.box || !list.length) return;
    player.idx = (player.idx + 1) % list.length;
    const m = list[player.idx];
    const src = '/media/' + encodeURIComponent(m.file);
    const skip = () => { clearTimeout(player.timer); player.timer = setTimeout(playerNext, list.length > 1 ? 300 : 5000); };
    let el;
    if (m.type === 'image') {
      el = new Image();
      el.onerror = skip;
      el.src = src;
      player.timer = setTimeout(playerNext, (m.duration || 10) * 1000);
    } else {
      el = document.createElement('video');
      // Videolar HER ZAMAN sessiz: bilgisayar zil sistemine bağlı
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.setAttribute('muted', '');
      el.onvolumechange = () => { if (!el.muted || el.volume > 0) { el.muted = true; el.volume = 0; } };
      el.playsInline = true;
      el.onended = playerNext;
      el.onerror = skip;
      el.src = src;
      el.play().catch(skip);
      player.timer = setTimeout(playerNext, 30 * 60 * 1000); // güvenlik: takılırsa geç
    }
    el.className = 'media-el';
    const old = player.el;
    player.box.appendChild(el);
    player.el = el;
    if (old) {
      if (old.tagName === 'VIDEO') { old.pause(); old.removeAttribute('src'); old.load(); }
      setTimeout(() => old.remove(), 600);
    }
  }


  // ---------- Overlay ----------
  let overlayTimer = null;
  function overlay(text, ms) {
    $('overlayText').textContent = text;
    $('overlay').classList.add('show');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => $('overlay').classList.remove('show'), ms);
  }

  // ---------- Tören ----------
  let runToken = 0;
  let runningCeremonyAt = null;

  function stepLabel(s) {
    if (s.type === 'siren') return 'Siren ve saygı duruşu';
    if (s.type === 'silence') return 'Saygı duruşu';
    if (s.type === 'anthem') return 'İstiklal Marşı';
    return s.type;
  }

  function renderSaygiSteps(steps, idx, remain, waiting) {
    const box = $('saygiSteps');
    box.innerHTML = '';
    steps.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'step' + (i === idx ? ' now' : '') + (i === idx && waiting ? ' ready' : '');
      row.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span>';
      row.querySelector('.n').textContent = i + 1;
      row.querySelector('.t').textContent = stepLabel(s);
      if (i === idx && waiting) row.querySelector('.c').textContent = 'Hazır';
      else if (i === idx && remain != null) row.querySelector('.c').textContent = Math.floor(remain / 60) + ':' + pad(remain % 60);
      box.appendChild(row);
    });
  }

  // Tören ekranı ayarları (panelden özelleştirilir)
  const ANTHEM_DEFAULTS = { bg: '#C8102E', kicker: 'LÜTFEN AYAĞA KALKINIZ', title: 'İstiklal Marşı', showCeremonyName: true, showFlag: true, image: null, showProgress: true };
  const SAYGI_DEFAULTS = { bg: '#121212', kicker: '', title: 'Saygı Duruşu', message: '', image: null, grayscale: false, showSteps: true };
  const mediaUrl = (f) => '/media/' + encodeURIComponent(f);

  function applyAnthemScreen(c, waiting) {
    const a = { ...ANTHEM_DEFAULTS, ...((state && state.display && state.display.anthemScreen) || {}) };
    const scr = $('scr-anthem');
    scr.style.setProperty('--anthem-bg', a.bg);
    scr.style.setProperty('--anthem-text', onAccent(a.bg) === '#FFFFFF' ? '#FFFFFF' : '#0E1A2B');
    $('anthemKicker').textContent = a.kicker;
    $('anthemKicker').classList.toggle('hide', !a.kicker);
    $('anthemTitle').textContent = a.title;
    $('anthemSource').textContent = a.showCeremonyName ? c.name : '';
    $('anthemSource').classList.toggle('hide', !a.showCeremonyName);
    const img = $('anthemImg');
    const useImg = !!a.image;
    if (useImg && img.getAttribute('src') !== mediaUrl(a.image)) img.src = mediaUrl(a.image);
    img.classList.toggle('hide', !useImg);
    $('anthemFlag').classList.toggle('hide', useImg || !a.showFlag);
    scr.classList.toggle('noimage', !useImg && !a.showFlag);
    $('anthemBarWrap').classList.toggle('hide', !a.showProgress);
    $('anthemBar').style.width = '0';
    $('anthemTime').textContent = '';
    $('anthemState').textContent = waiting ? 'Başlamaya hazır' : '';
    scr.classList.toggle('waiting', !!waiting);
  }

  function applySaygiScreen(c) {
    const s = { ...SAYGI_DEFAULTS, ...(c.screen || {}) };
    const scr = $('scr-saygi');
    scr.style.setProperty('--saygi-bg', s.bg);
    scr.style.setProperty('--saygi-text', onAccent(s.bg) === '#FFFFFF' ? '#EDEBE7' : '#121212');
    const d = now();
    $('saygiKicker').textContent = s.kicker || (d.getDate() + ' ' + MONTHS[d.getMonth()].toUpperCase() + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes()));
    $('saygiTitle').textContent = s.title;
    $('saygiLine').textContent = s.message;
    $('saygiLine').classList.toggle('hide', !s.message);
    const img = $('portraitImg');
    if (s.image) { if (img.getAttribute('src') !== mediaUrl(s.image)) img.src = mediaUrl(s.image); }
    $('portrait').classList.toggle('hide', !s.image);
    $('portrait').classList.toggle('gray', !!s.grayscale);
    scr.classList.toggle('noimage', !s.image);
    scr.classList.toggle('nosteps', !s.showSteps);
  }

  // Bir adımın ekranını sesi başlatmadan hazırlar
  function prepareStep(c, steps, i, waiting) {
    const s = steps[i];
    if (s.type === 'anthem') {
      applyAnthemScreen(c, waiting);
      show('anthem');
    } else {
      applySaygiScreen(c);
      show('saygi');
      renderSaygiSteps(steps, i, s.seconds || 60, waiting);
    }
  }

  // Öğretmen komutu (panelden "Başlat" ya da sistem odasında Enter/Boşluk)
  let goWaiter = null;
  const goReceived = new Set(); // "töreninBaşlangıcı:adım"
  function waitForGo(c, i, token) {
    const key = c.startedAt + ':' + i;
    if (goReceived.has(key)) return Promise.resolve();
    return new Promise((resolve) => {
      goWaiter = { key, resolve, token };
    });
  }
  function receiveGo(cmdObj) {
    if (!state || !state.ceremony || state.ceremony.id !== cmdObj.id) return;
    const key = state.ceremony.startedAt + ':' + cmdObj.step;
    goReceived.add(key);
    if (goWaiter && goWaiter.key === key) { const w = goWaiter; goWaiter = null; w.resolve(); }
  }
  function reportProgress(c, step, waiting) {
    if (!AUDIO) return;
    fetch('/api/ceremony/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, step, waiting }) }).catch(() => {});
  }
  // Sistem odasındaki klavyeden başlatma
  document.addEventListener('keydown', (e) => {
    if (!goWaiter || !(e.key === 'Enter' || e.key === ' ')) return;
    e.preventDefault();
    fetch('/api/ceremony/go-local', { method: 'POST' }).catch(() => {});
  });

  async function runCeremony(c) {
    const token = ++runToken;
    runningCeremonyAt = c.startedAt;
    goWaiter = null;
    stopMusic();
    stopAllAudio();
    const steps = c.steps || [];
    for (let i = 0; i < steps.length; i++) {
      if (token !== runToken) return;
      const s = steps[i];
      if (s.wait) {
        prepareStep(c, steps, i, true);
        reportProgress(c, i, true);
        await waitForGo(c, i, token);
        if (token !== runToken) return;
      }
      reportProgress(c, i, false);
      prepareStep(c, steps, i, false);
      if (s.type === 'siren' || s.type === 'silence') {
        const total = s.seconds || 60;
        let remain = total;
        renderSaygiSteps(steps, i, remain);
        const iv = setInterval(() => { remain = Math.max(0, remain - 1); renderSaygiSteps(steps, i, remain); }, 1000);
        if (s.type === 'siren') await timedSound(state.sounds.siren, 'siren', total);
        else await new Promise((r) => setTimeout(r, total * 1000));
        clearInterval(iv);
      } else if (s.type === 'anthem') {
        const ok = await playFile(state.sounds.anthem, {
          onProgress(t, dur) {
            $('anthemBar').style.width = (t / dur) * 100 + '%';
            $('anthemTime').textContent = Math.floor(t / 60) + ':' + pad(Math.floor(t % 60)) + ' / ' + Math.floor(dur / 60) + ':' + pad(Math.floor(dur % 60));
          }
        });
        if (!ok) {
          // Ses dosyası yoksa ekranı kısa süre göster
          await new Promise((r) => setTimeout(r, 8000));
        }
      }
    }
    if (token !== runToken) return;
    if (AUDIO) fetch('/api/ceremony/done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) });
    show('normal');
  }

  // ---------- Alarm ----------
  const ALARM_CONTENT = {
    deprem: {
      title: 'DEPREM',
      cards: [['ÇÖK', 'Olduğun yerde dizlerinin üzerine çök.'], ['KAPAN', 'Başını ve enseni kollarınla koru, sıranın yanına kapan.'], ['TUTUN', 'Sarsıntı bitene kadar sağlam bir yere tutun.']],
      foot: 'Sarsıntı bitince öğretmeninin talimatıyla sakin şekilde tahliye ol.'
    },
    yangin: {
      title: 'YANGIN',
      cards: [['SAKİN OL', 'Koşma, itişme. Eşyalarını bırak.'], ['ÇIK', 'En yakın çıkıştan, asansörü kullanmadan çık.'], ['EĞİL', 'Duman varsa eğilerek ilerle, ağzını kapat.']],
      foot: 'Öğretmenini takip et, sınıf listesiyle toplanma alanında say.'
    },
    tahliye: {
      title: 'TAHLİYE',
      cards: [['DUR', 'Elindeki işi bırak, öğretmenini dinle.'], ['SIRAYLA ÇIK', 'Merdivenlerden sağdan, sırayla in.'], ['TOPLAN', 'Toplanma alanında sınıfınla bekle.']],
      foot: 'Asansör kullanma. Geri dönme.'
    },
    kilit: {
      title: 'SINIFTA KAL',
      cards: [['KAPIYI KAPAT', 'Sınıf kapısını kapat, koridora çıkma.'], ['SESSİZ OL', 'Pencerelerden uzak, sessizce bekle.'], ['BEKLE', 'Yeni anons gelene kadar sınıfta kal.']],
      foot: 'Koridorda olan en yakın sınıfa girsin.'
    }
  };
  let alarmToken = 0;
  let runningAlarmAt = null;

  async function runAlarm(alarm) {
    const token = ++alarmToken;
    runningAlarmAt = alarm.startedAt;
    runningCeremonyAt = null;
    runToken++;
    stopMusic();
    stopAllAudio();
    renderAlarm(alarm);
    show('alarm');
    while (token === alarmToken) {
      const ok = await playFile(state && state.sounds[alarm.type], { loop: false });
      if (token !== alarmToken) break;
      if (!ok) await synth(alarm.type, 20);
    }
  }

  function renderAlarm(alarm) {
    const c = ALARM_CONTENT[alarm.type];
    const scr = $('scr-alarm');
    scr.className = 'screen alarm ' + alarm.type + (scr.classList.contains('active') ? ' active' : '');
    $('alarmTitle').textContent = c.title;
    $('alarmMode').textContent = alarm.drill ? 'TATBİKAT' : 'GERÇEK ALARM';
    const d = new Date(alarm.startedAt + 0);
    $('alarmTime').textContent = 'Başladı: ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    document.querySelector('.alarm-head').classList.toggle('blink', !alarm.drill);
    const body = $('alarmBody');
    body.innerHTML = '';
    for (const [h, p] of c.cards) {
      const card = document.createElement('div');
      card.className = 'a-card';
      const h2 = document.createElement('h2');
      h2.textContent = h;
      const pp = document.createElement('p');
      pp.textContent = p;
      card.append(h2, pp);
      body.appendChild(card);
    }
    $('alarmFoot').textContent = c.foot;
    $('alarmArea').textContent = alarm.type === 'kilit' ? '' : 'Toplanma alanı: ' + ((state && state.emergency.assemblyArea) || '—');
  }

  // ---------- Anons ----------
  async function announce(text, repeat) {
    stopMusic();
    overlay(text, 15000 * repeat);
    if (!AUDIO) return;
    for (let i = 0; i < repeat; i++) {
      await playOrSynth(state.sounds.chime, 'chime', 1.6);
      await new Promise((resolve) => {
        if (!('speechSynthesis' in window)) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'tr-TR';
        const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('tr'));
        if (v) u.voice = v;
        u.rate = 0.95;
        u.onend = resolve;
        u.onerror = resolve;
        speechSynthesis.speak(u);
        setTimeout(resolve, 60000);
      });
    }
  }

  // ---------- Komutlar ----------
  function handle(c) {
    if (c.action === 'bell') {
      if (!state || state.mode !== 'normal') return;
      stopMusic();
      if (!c.silent) playOrSynth(state.sounds[c.bell], 'bell', 4);
    } else if (c.action === 'music') {
      c.on ? startMusic() : stopMusic();
    } else if (c.action === 'ceremony') {
      runCeremony(c.ceremony);
    } else if (c.action === 'ceremonyGo') {
      receiveGo(c);
    } else if (c.action === 'alarm') {
      runAlarm(c.alarm);
    } else if (c.action === 'stopAll') {
      alarmToken++;
      runToken++;
      runningAlarmAt = null;
      runningCeremonyAt = null;
      goWaiter = null;
      stopMusic();
      stopAllAudio();
      show('normal');
    } else if (c.action === 'announce') {
      announce(c.text, c.repeat || 1);
    } else if (c.action === 'test') {
      const kind = { teacher: 'bell', student: 'bell', end: 'bell', chime: 'chime' }[c.sound] || c.sound;
      timedSound(state.sounds[c.sound], kind, 6);
    }
  }

  // ---------- Bağlantı ----------
  let loadedBuild = null;
  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      const prev = state;
      state = JSON.parse(e.data);
      // Program güncellendiyse (git pull + yeniden başlatma) sayfayı kendiliğinden yenile.
      // Tören ya da alarm sürerken yenilenmez.
      if (loadedBuild && state.build && state.build !== loadedBuild && state.mode === 'normal') { location.reload(); return; }
      if (!loadedBuild) loadedBuild = state.build;
      clockOffset = state.serverTime - Date.now();
      renderBoard();
      tickClock();
      // Bağlantı kopup geri gelirse kaçırılan alarmı/töreni sürdür
      if (state.mode === 'alarm' && runningAlarmAt !== state.alarm.startedAt) runAlarm(state.alarm);
      if (state.mode === 'ceremony' && runningCeremonyAt !== state.ceremony.startedAt) {
        // Sayfa yenilendiyse daha önce başlatılmış adımlar için tekrar komut bekleme
        const c = state.ceremony;
        for (let i = 0; i < c.step + (c.waiting ? 0 : 1); i++) goReceived.add(c.startedAt + ':' + i);
        runCeremony(c);
      }
      if (state.mode === 'normal' && (runningAlarmAt || (prev && prev.mode === 'alarm'))) {
        runningAlarmAt = null;
        alarmToken++;
        stopAllAudio();
        show('normal');
      }
    });
    es.addEventListener('cmd', (e) => handle(JSON.parse(e.data)));
  }
  connect();
  tickClock();
})();
