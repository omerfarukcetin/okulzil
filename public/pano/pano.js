// TV panosu: ekranları gösterir ve (audio=1 ise) sesleri çalar.
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const AUDIO = params.get('audio') === '1';
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

  function show(name) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'scr-' + name));
  }

  // ---------- Ses ----------
  const AC = new (window.AudioContext || window.webkitAudioContext)();
  const active = new Set(); // çalan sesler
  function checkGate() {
    $('audioGate').classList.toggle('show', AUDIO && AC.state === 'suspended');
  }
  $('audioGate').addEventListener('click', () => AC.resume().then(checkGate));
  setTimeout(() => AC.resume().finally(checkGate), 300);

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

  // ---------- Normal pano ----------
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  let annIndex = 0;

  function setList(el, items, empty) {
    el.innerHTML = '';
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'muted';
      d.textContent = empty;
      el.appendChild(d);
      return;
    }
    for (const t of items) {
      const d = document.createElement('div');
      d.textContent = t;
      el.appendChild(d);
    }
  }

  function renderBoard() {
    if (!state) return;
    $('schoolName').textContent = state.schoolName;
    const b = state.board || {};
    setList($('duty'), (b.duty || []).map((d) => d.place + ': ' + d.name), 'Henüz girilmedi');
    setList($('menu'), b.menu || [], 'Henüz girilmedi');
    $('ticker').textContent = b.ticker || state.schoolName;
    renderAnnouncements();
    const day = state.day;
    $('progName').textContent = day.schoolDay ? day.programName : day.reason;
    $('lastEnd').textContent = day.lessons.length ? day.lessons[day.lessons.length - 1].end : '—';
  }

  function renderAnnouncements() {
    const list = (state && state.board.announcements) || [];
    if (!list.length) { $('annMain').textContent = 'Duyuru yok'; $('annNext').textContent = ''; return; }
    annIndex = annIndex % list.length;
    $('annMain').textContent = list[annIndex];
    $('annNext').textContent = list.length > 1 ? list[(annIndex + 1) % list.length] : '';
  }
  setInterval(() => { annIndex++; renderAnnouncements(); }, 10000);
  setInterval(() => $('scr-normal').classList.toggle('shift'), 5 * 60 * 1000);

  function fmtLeft(sec) {
    if (sec < 60) return sec + ' sn';
    const m = Math.ceil(sec / 60);
    if (m < 60) return m + ' dk';
    return Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk';
  }

  function tickClock() {
    const d = now();
    $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('dateText').textContent = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + DAYS[d.getDay()];
    if (!state) return;
    const day = state.day;
    const cur = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const L = day.lessons;
    const card = $('countCard');
    const set = (title, sub, val, idle) => {
      $('countTitle').textContent = title;
      $('countSub').textContent = sub;
      $('countValue').textContent = val;
      card.classList.toggle('idle', !!idle);
    };
    if (!day.schoolDay) {
      $('period').textContent = day.reason || 'Bugün ders yok';
      return set('Bugün ders yok', day.reason || '', '', true);
    }
    if (!L.length) { $('period').textContent = ''; return set('Ders programı boş', '', '', true); }
    const secTo = (t) => Math.max(0, Math.round((toMin(t) - cur) * 60));
    for (let i = 0; i < L.length; i++) {
      const s = toMin(L[i].start), e = toMin(L[i].end);
      if (cur < s) {
        const gap = i === 0 ? null : s - toMin(L[i - 1].end);
        $('period').textContent = i === 0 ? 'Dersler ' + L[0].start + '\'de başlıyor' : gap >= 30 ? 'Öğle arası' : 'Teneffüs';
        return set(i === 0 ? 'İlk derse kalan' : 'Derse kalan', (i + 1) + '. ders ' + L[i].start + ' – ' + L[i].end, fmtLeft(secTo(L[i].start)));
      }
      if (cur < e) {
        $('period').textContent = (i + 1) + '. ders · ' + L[i].start + ' – ' + L[i].end;
        const last = i === L.length - 1;
        return set(last ? 'Dersler bitimine kalan' : 'Teneffüse kalan', 'Çıkış zili ' + L[i].end, fmtLeft(secTo(L[i].end)));
      }
    }
    $('period').textContent = 'Dersler bitti';
    set('Bugünlük dersler bitti', 'İyi akşamlar', '', true);
  }
  setInterval(tickClock, 1000);

  // ---------- Overlay ----------
  let overlayTimer = null;
  function overlay(text, ms) {
    $('overlayText').textContent = text;
    $('overlay').classList.add('show');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => $('overlay').classList.remove('show'), ms);
  }

  // ---------- Tören ----------
  const STANZAS = [
    'Korkma, sönmez bu şafaklarda yüzen al sancak;\nSönmeden yurdumun üstünde tüten en son ocak.\nO benim milletimin yıldızıdır, parlayacak;\nO benimdir, o benim milletimindir ancak.',
    'Çatma, kurban olayım, çehreni ey nazlı hilâl!\nKahraman ırkıma bir gül! Ne bu şiddet, bu celâl?\nSana olmaz dökülen kanlarımız sonra helâl.\nHakkıdır, Hakk\'a tapan milletimin istiklâl!'
  ];
  let runToken = 0;
  let runningCeremonyAt = null;

  function stepLabel(s) {
    if (s.type === 'siren') return 'Siren ve saygı duruşu';
    if (s.type === 'silence') return 'Saygı duruşu';
    if (s.type === 'anthem') return 'İstiklal Marşı';
    return s.type;
  }

  function renderSaygiSteps(steps, idx, remain) {
    const box = $('saygiSteps');
    box.innerHTML = '';
    steps.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'step' + (i === idx ? ' now' : '');
      row.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span>';
      row.querySelector('.n').textContent = i + 1;
      row.querySelector('.t').textContent = stepLabel(s);
      if (i === idx && remain != null) row.querySelector('.c').textContent = Math.floor(remain / 60) + ':' + pad(remain % 60);
      box.appendChild(row);
    });
  }

  async function runCeremony(c) {
    const token = ++runToken;
    runningCeremonyAt = c.startedAt;
    stopMusic();
    stopAllAudio();
    const steps = c.steps || [];
    const d = now();
    $('saygiKicker').textContent = d.getDate() + ' ' + MONTHS[d.getMonth()].toUpperCase() + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    for (let i = 0; i < steps.length; i++) {
      if (token !== runToken) return;
      const s = steps[i];
      if (s.type === 'siren' || s.type === 'silence') {
        show('saygi');
        const total = s.seconds || 60;
        let remain = total;
        renderSaygiSteps(steps, i, remain);
        const iv = setInterval(() => { remain = Math.max(0, remain - 1); renderSaygiSteps(steps, i, remain); }, 1000);
        if (s.type === 'siren') await timedSound(state.sounds.siren, 'siren', total);
        else await new Promise((r) => setTimeout(r, total * 1000));
        clearInterval(iv);
      } else if (s.type === 'anthem') {
        show('anthem');
        $('stanza').textContent = STANZAS[0];
        $('anthemBar').style.width = '0';
        $('anthemSource').textContent = c.name;
        $('anthemTime').textContent = '';
        const ok = await playFile(state.sounds.anthem, {
          onProgress(t, dur) {
            $('anthemBar').style.width = (t / dur) * 100 + '%';
            $('anthemTime').textContent = Math.floor(t / 60) + ':' + pad(Math.floor(t % 60)) + ' / ' + Math.floor(dur / 60) + ':' + pad(Math.floor(dur % 60));
            $('stanza').textContent = t > dur / 2 ? STANZAS[1] : STANZAS[0];
          }
        });
        if (!ok) {
          // Ses dosyası yoksa ekranı kısa süre göster
          $('stanza').textContent = STANZAS[0];
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
    } else if (c.action === 'alarm') {
      runAlarm(c.alarm);
    } else if (c.action === 'stopAll') {
      alarmToken++;
      runToken++;
      runningAlarmAt = null;
      runningCeremonyAt = null;
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
  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      const prev = state;
      state = JSON.parse(e.data);
      clockOffset = state.serverTime - Date.now();
      renderBoard();
      tickClock();
      // Bağlantı kopup geri gelirse kaçırılan alarmı/töreni sürdür
      if (state.mode === 'alarm' && runningAlarmAt !== state.alarm.startedAt) runAlarm(state.alarm);
      if (state.mode === 'ceremony' && runningCeremonyAt !== state.ceremony.startedAt) runCeremony(state.ceremony);
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
