// Yerel sunucu: TV panosu ve telefon paneli buradan açılır, komutlar buradan dağıtılır.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createStore } = require('./store');
const { createScheduler } = require('./scheduler');

const STEP_LABELS = { siren: 'Siren ve saygı duruşu', silence: 'Saygı duruşu', anthem: 'İstiklal Marşı' };
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const ALARMS = {
  deprem: 'Deprem',
  yangin: 'Yangın',
  tahliye: 'Tahliye',
  kilit: 'Sınıfta kal'
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// Arayüz dosyalarından bir sürüm kimliği üretir; dosyalar değişince TV ve paneller kendini yeniler
function buildId() {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else h.update(p + fs.readFileSync(p));
    }
  };
  walk(path.join(__dirname, '..', 'public'));
  return h.digest('hex').slice(0, 10);
}

function startServer({ dataDir, port, bundledSoundsDir }) {
  const BUILD = buildId();
  const SOZLER = require('./sozler.json');
  // Her gün aynı söz; liste karışık sırayla dolaşılır
  function quoteOfDay() {
    const q = cfg().quote || {};
    if (q.enabled === false) return null;
    const kinds = q.kinds || 'both';
    let pool = [];
    if (kinds === 'both' || kinds === 'atasozu') pool = pool.concat(SOZLER.atasozu.map(([t, m]) => ({ kind: 'Atasözü', text: t, meaning: m })));
    if (kinds === 'both' || kinds === 'deyim') pool = pool.concat(SOZLER.deyim.map(([t, m]) => ({ kind: 'Deyim', text: t, meaning: m })));
    pool = pool.concat((q.custom || []).map((x) => ({ kind: 'Günün sözü', text: x.text, meaning: x.meaning })));
    if (!pool.length) return null;
    const d = new Date();
    const dayNo = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    const pick = pool[(dayNo * 7919) % pool.length];
    return { ...pick, meaning: q.showMeaning === false ? '' : pick.meaning };
  }
  const store = createStore(dataDir);
  const cfg = () => store.get();
  const soundsDir = path.join(dataDir, 'sounds');
  fs.mkdirSync(path.join(soundsDir, 'muzik'), { recursive: true });
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const MEDIA_TYPES = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', mp4: 'video', webm: 'video', m4v: 'video' };

  const logFile = path.join(dataDir, 'kayit.log');
  const recent = [];
  function log(msg) {
    const line = new Date().toLocaleString('tr-TR') + ' · ' + msg;
    recent.unshift(line);
    if (recent.length > 200) recent.pop();
    fs.appendFile(logFile, line + '\n', () => {});
    console.log(line);
  }

  let weather = null; // son hava durumu
  // ---------- Telefona bildirim (Telegram) ----------
  const TG_BASE = process.env.ZIL_TELEGRAM_BASE || 'https://api.telegram.org';
  async function tgCall(token, method, body) {
    const r = await fetch(TG_BASE + '/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000)
    });
    return r.json();
  }
  const lastNotify = {};
  // kind: alarm | ceremony | audio | system — panelde hangisinin gönderileceği seçilir
  function notify(kind, text, throttleMin) {
    const t = cfg().telegram || {};
    if (!t.enabled || !t.token || !(t.chats || []).length) return;
    if (t.events && t.events[kind] === false) return;
    if (throttleMin) {
      if (lastNotify[kind] && Date.now() - lastNotify[kind] < throttleMin * 60000) return;
      lastNotify[kind] = Date.now();
    }
    const msg = cfg().schoolName + '\n' + text;
    for (const ch of t.chats) {
      tgCall(t.token, 'sendMessage', { chat_id: ch.id, text: msg }).catch(() => log('Telegram bildirimi gönderilemedi (internet?)'));
    }
  }
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  const state = { dimOverride: null, mode: 'normal', alarm: null, ceremony: null, skipNext: null, music: false };
  let ceremonyTimer = null;

  // --- SSE: pano ve paneller canlı olarak buradan dinler ---
  const clients = new Set();
  function send(res, type, payload) {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify(payload) + '\n\n');
  }
  function broadcast(type, payload) {
    for (const res of clients) send(res, type, payload);
  }
  // Ses çalan pano sayfaları (en az biri açık ve sesi açık olmalı)
  const outputs = new Map();
  function audioStatus() {
    const fresh = [...outputs.values()].filter((o) => Date.now() - o.at < 15000);
    return { panos: fresh.length, ready: fresh.filter((o) => o.ready).length };
  }
  let lastAudioKey = '';
  setInterval(() => {
    const k = JSON.stringify(audioStatus());
    if (k !== lastAudioKey) { lastAudioKey = k; pushState(); }
  }, 5000);

  function publicState() {
    const c = cfg();
    return {
      build: BUILD,
      audio: audioStatus(),
      mode: state.mode,
      alarm: state.alarm,
      ceremony: state.ceremony,
      skipNext: state.skipNext,
      music: state.music,
      day: scheduler.today(),
      schoolName: c.schoolName,
      board: c.board,
      emergency: c.emergency,
      display: c.display,
      weather: weather && (c.weather || {}).enabled ? weather : null,
      quote: quoteOfDay(),
      dimOverride: state.dimOverride && state.dimOverride.until > Date.now() ? state.dimOverride : null,
      ceremonies: c.ceremonies.map((x) => ({ id: x.id, name: x.name, mode: x.mode, steps: x.steps, screen: x.screen })),
      media: c.media.filter((m) => m.enabled !== false),
      sounds: c.sounds,
      breakMusic: c.breakMusic,
      serverTime: Date.now()
    };
  }
  const pushState = () => broadcast('state', publicState());
  const cmd = (payload) => broadcast('cmd', payload);

  // --- Tören, alarm, zil mantığı ---
  function startCeremony(id, source) {
    if (state.mode === 'alarm') return { ok: false, error: 'Alarm sürerken tören başlatılamaz' };
    const c = cfg().ceremonies.find((x) => x.id === id);
    if (!c) return { ok: false, error: 'Tören bulunamadı' };
    if (c.mode === 'off' && source === 'auto') return { ok: false, error: 'Tören kapalı' };
    if (!c.steps || !c.steps.length) return { ok: false, error: 'Törende adım yok' };
    stopMusic();
    // Ekran hemen açılır. Ses: "command" ise öğretmen komutuyla, "auto" ise hemen
    // (otomatik zamanlamada soundDelay dakika sonra) başlar.
    const soundStart = c.soundStart === 'auto' ? 'auto' : 'command';
    const delay = Math.max(0, Number(c.soundDelay) || 0);
    const autoGoAt = soundStart === 'auto' && source === 'auto' && delay > 0 ? Date.now() + delay * 60000 : null;
    const firstWait = soundStart === 'command' || !!autoGoAt;
    const steps = c.steps.map((s, i) => ({ ...s, wait: i === 0 ? firstWait : !!s.wait }));
    state.mode = 'ceremony';
    state.ceremony = { id: c.id, name: c.name, steps, screen: c.screen || null, startedAt: Date.now(), source, step: 0, waiting: firstWait, autoGoAt };
    clearTimeout(goTimer);
    if (autoGoAt) goTimer = setTimeout(() => ceremonyGo('otomatik'), autoGoAt - Date.now());
    armCeremonyTimer();
    log('Tören ekranı açıldı: ' + c.name + ' (' + (source === 'auto' ? 'otomatik' : 'elle') + ')' + (firstWait && !autoGoAt ? ' · ses komut bekliyor' : ''));
    cmd({ action: 'ceremony', ceremony: state.ceremony });
    pushState();
    return { ok: true };
  }

  // Komut beklerken ekran uzun süre açık kalabilir (ör. 08:00'de açılıp 08:50'de başlatılır)
  function armCeremonyTimer() {
    clearTimeout(ceremonyTimer);
    const waiting = state.ceremony && state.ceremony.waiting;
    ceremonyTimer = setTimeout(() => endCeremony(waiting ? 'komut gelmedi, ekran kapandı' : 'zaman aşımı'), (waiting ? 3 * 60 : 15) * 60 * 1000);
  }

  let goTimer = null;
  function ceremonyGo(by) {
    const c = state.ceremony;
    if (state.mode !== 'ceremony' || !c) return { ok: false, error: 'Açık tören yok' };
    if (!c.waiting) return { ok: false, error: 'Tören şu an zaten çalıyor' };
    clearTimeout(goTimer);
    c.waiting = false;
    c.autoGoAt = null;
    armCeremonyTimer();
    const st = c.steps[c.step] || {};
    log('Tören başladı: ' + c.name + ' · ' + (STEP_LABELS[st.type] || st.type) + ' (' + by + ')');
    notify('ceremony', '🇹🇷 ' + c.name + ': ' + (STEP_LABELS[st.type] || st.type) + ' başladı (' + hhmm() + ')');
    cmd({ action: 'ceremonyGo', id: c.id, step: c.step });
    pushState();
    return { ok: true };
  }

  function endCeremony(why) {
    if (state.mode !== 'ceremony') return;
    clearTimeout(ceremonyTimer);
    clearTimeout(goTimer);
    log('Tören bitti: ' + state.ceremony.name + (why ? ' (' + why + ')' : ''));
    state.mode = 'normal';
    state.ceremony = null;
    pushState();
  }

  function startAlarm(type, drill) {
    if (!ALARMS[type]) return { ok: false, error: 'Bilinmeyen alarm türü' };
    clearTimeout(ceremonyTimer);
    clearTimeout(goTimer);
    stopMusic();
    state.mode = 'alarm';
    state.ceremony = null;
    state.alarm = { type, name: ALARMS[type], drill: !!drill, startedAt: Date.now() };
    log((drill ? 'TATBİKAT ' : 'ALARM ') + ALARMS[type] + ' başlatıldı');
    notify('alarm', (drill ? '🟠 TATBİKAT: ' : '🚨 GERÇEK ALARM: ') + ALARMS[type] + ' (' + hhmm() + ')');
    cmd({ action: 'alarm', alarm: state.alarm });
    pushState();
    return { ok: true };
  }

  function stopAll(by) {
    clearTimeout(ceremonyTimer);
    clearTimeout(goTimer);
    if (state.mode === 'alarm') {
      log('Alarm durduruldu' + (by ? ' (' + by + ')' : ''));
      notify('alarm', '✅ ' + state.alarm.name + (state.alarm.drill ? ' tatbikatı' : ' alarmı') + ' durduruldu (' + hhmm() + ')');
    }
    if (state.mode === 'ceremony') log('Tören durduruldu' + (by ? ' (' + by + ')' : ''));
    state.mode = 'normal';
    state.alarm = null;
    state.ceremony = null;
    state.music = false;
    cmd({ action: 'stopAll' });
    pushState();
  }

  function stopMusic() {
    if (state.music) {
      state.music = false;
      cmd({ action: 'music', on: false });
    }
  }

  function ringBell(bell, label, silent) {
    stopMusic();
    cmd({ action: 'bell', bell, label, silent: !!silent });
  }

  function onEvent(ev, day) {
    if (state.mode === 'alarm') return log('Atlandı (alarm sürüyor): ' + ev.label);
    if (ev.kind === 'bell') {
      if (state.skipNext === ev.key) {
        state.skipNext = null;
        pushState();
        return log('Atlandı (elle): ' + ev.label);
      }
      if (state.mode === 'ceremony') return log('Atlandı (tören sürüyor): ' + ev.label);
      ringBell(ev.bell, ev.label, day.silent);
      log((day.silent ? 'Sessiz zil: ' : 'Zil: ') + ev.label);
      if (!day.silent) {
        const a = audioStatus();
        if (!a.ready) {
          log('UYARI: zil çaldı ama ses çıkışı yok');
          notify('audio', '⚠️ ' + ev.time + ' ' + ev.label + ' çalmadı: ' + (a.panos ? 'pano sesi kapalı (ekrana bir kez tıklanmalı)' : 'TV panosu açık değil'), 30);
        }
      }
      pushState();
    } else if (ev.kind === 'music') {
      if (state.mode !== 'normal') return;
      state.music = ev.action === 'start';
      cmd({ action: 'music', on: state.music });
      pushState();
    } else if (ev.kind === 'ceremony') {
      const r = startCeremony(ev.id, 'auto');
      if (!r.ok) log('Tören başlamadı: ' + ev.label + ' · ' + r.error);
    }
  }

  const scheduler = createScheduler({ getConfig: cfg, onEvent });
  // Gün değişince ve her dakika panolara güncel programı gönder
  setInterval(pushState, 60 * 1000);

  // --- HTTP ---
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const pub = path.join(__dirname, '..', 'public');
  // Tarayıcı arayüz dosyalarını her açılışta kontrol etsin (eski sürüm önbellekte kalmasın)
  const noCache = { etag: true, lastModified: true, setHeaders: (res) => res.set('Cache-Control', 'no-cache') };
  app.use('/pano', express.static(path.join(pub, 'pano'), noCache));
  app.use('/panel', express.static(path.join(pub, 'panel'), noCache));
  app.use('/media', express.static(mediaDir, {
    maxAge: '1d',
    // Yüklenen SVG içindeki betikler çalışmasın
    setHeaders: (res, p) => { if (p.endsWith('.svg')) res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); }
  }));
  app.use('/sounds', express.static(soundsDir));
  if (bundledSoundsDir) app.use('/sounds', express.static(bundledSoundsDir));
  app.get('/', (req, res) => res.redirect('/panel/'));

  app.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    clients.add(res);
    send(res, 'state', publicState());
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  });

  app.get('/api/status', (req, res) => res.json(publicState()));

  app.get('/api/music', (req, res) => {
    const files = new Set();
    for (const dir of [path.join(soundsDir, 'muzik'), bundledSoundsDir && path.join(bundledSoundsDir, 'muzik')]) {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (/\.(mp3|ogg|wav|m4a)$/i.test(f)) files.add('muzik/' + f);
    }
    res.json([...files]);
  });

  app.post('/api/pano-status', (req, res) => {
    const id = String(req.body.id || '').slice(0, 20);
    if (id) {
      const before = JSON.stringify(audioStatus());
      outputs.set(id, { ready: !!req.body.ready, at: Date.now(), ip: req.ip });
      for (const [k, o] of outputs) if (Date.now() - o.at > 60000) outputs.delete(k);
      const after = JSON.stringify(audioStatus());
      if (before !== after) { lastAudioKey = after; pushState(); }
    }
    res.json({ ok: true });
  });

  // Pano töreni bitirdiğini bildirir (yerel çağrı)
  // Pano hangi adımda olduğunu ve komut bekleyip beklemediğini bildirir
  app.post('/api/ceremony/progress', (req, res) => {
    const c = state.ceremony;
    if (c && req.body.id === c.id) {
      const step = Number(req.body.step) || 0;
      const waiting = !!req.body.waiting;
      if (c.step !== step || c.waiting !== waiting) {
        c.step = step;
        c.waiting = waiting;
        armCeremonyTimer();
        pushState();
      }
      if (waiting && c.autoGoAt && Date.now() >= c.autoGoAt) ceremonyGo('otomatik');
    }
    res.json({ ok: true });
  });

  // Sistem odasındaki bilgisayarda pano ekranında Enter / Boşluk ile başlatma
  app.post('/api/ceremony/go-local', (req, res) => {
    if (!LOOPBACK.has(req.ip)) return res.status(403).json({ ok: false, error: 'Sadece sistem odasındaki bilgisayardan' });
    res.json(ceremonyGo('sistem odası klavyesi'));
  });

  app.post('/api/ceremony/done', (req, res) => {
    if (state.ceremony && req.body.id === state.ceremony.id) endCeremony();
    res.json({ ok: true });
  });

  // --- PIN korumalı uçlar ---
  const fails = new Map();
  function auth(req, res, next) {
    const ip = req.ip;
    const f = fails.get(ip);
    if (f && f.count >= 10 && Date.now() - f.at < 5 * 60 * 1000) {
      return res.status(429).json({ ok: false, error: 'Çok fazla hatalı deneme. 5 dakika bekleyin.' });
    }
    if (req.get('x-pin') === String(cfg().pin)) {
      fails.delete(ip);
      return next();
    }
    fails.set(ip, { count: (f ? f.count : 0) + 1, at: Date.now() });
    res.status(401).json({ ok: false, error: 'PIN hatalı' });
  }
  const api = express.Router();
  api.use(auth);

  api.post('/login', (req, res) => res.json({ ok: true }));
  api.get('/config', (req, res) => {
    const { pin, telegram, ...rest } = cfg();
    const t = telegram || {};
    res.json({ ...rest, telegram: { enabled: !!t.enabled, hasToken: !!t.token, chats: t.chats || [], events: t.events || {} } });
  });
  api.get('/log', (req, res) => res.json(recent));
  api.get('/info', (req, res) => res.json({ addresses: lanAddresses(), port, dataDir, soundsDir, build: BUILD }));

  api.post('/bell/ring', (req, res) => {
    const bell = ['teacher', 'student', 'end'].includes(req.body.bell) ? req.body.bell : 'student';
    if (state.mode !== 'normal') return res.json({ ok: false, error: 'Tören ya da alarm sürüyor' });
    ringBell(bell, 'Elle çalınan zil', false);
    log('Elle zil çalındı');
    const a = audioStatus();
    const warning = !a.panos
      ? 'Zil komutu gönderildi ama ses çalacak pano sayfası açık değil. Sistem odasındaki bilgisayarda pano sayfasını açın.'
      : !a.ready
        ? 'Pano açık ama sesi kapalı. Sistem odasındaki bilgisayarda pano ekranına bir kez tıklayın.'
        : null;
    res.json({ ok: true, warning });
  });

  api.post('/bell/skip', (req, res) => {
    const nowHm = new Date().toTimeString().slice(0, 5);
    const next = scheduler.today().events.find((e) => e.kind === 'bell' && e.time > nowHm);
    if (!next) return res.json({ ok: false, error: 'Bugün çalacak başka zil yok' });
    state.skipNext = state.skipNext === next.key ? null : next.key;
    log(state.skipNext ? 'Sonraki zil atlanacak: ' + next.label : 'Zil atlama iptal edildi');
    pushState();
    res.json({ ok: true, skipped: !!state.skipNext, label: next.label });
  });

  api.post('/program/today', (req, res) => {
    const id = req.body.program;
    if (!cfg().programs[id]) return res.status(400).json({ ok: false, error: 'Program bulunamadı' });
    const today = new Date();
    const dk = require('./scheduler').dateKey(today);
    store.update((c) => {
      // Zaten kurala göre çalacak program seçildiyse elle seçimi kaldır
      const base = require('./scheduler').programSource({ ...c, override: null }, today).id;
      c.override = id === base ? null : { date: dk, program: id };
    });
    log('Bugünkü program: ' + cfg().programs[id].name);
    pushState();
    res.json({ ok: true });
  });

  // Haftanın günü ve tarih aralığı kuralları
  api.put('/program-rules', (req, res) => {
    const b = req.body || {};
    const dateOk = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
    store.update((c) => {
      if (b.dayPrograms && typeof b.dayPrograms === 'object') {
        const dp = {};
        for (const [k, v] of Object.entries(b.dayPrograms)) if (/^[0-6]$/.test(k) && c.programs[v]) dp[k] = v;
        c.dayPrograms = dp;
      }
      if (Array.isArray(b.rangePrograms)) {
        c.rangePrograms = b.rangePrograms
          .filter((r) => dateOk(r.from) && dateOk(r.to) && c.programs[r.program])
          .map((r) => ({ from: r.from <= r.to ? r.from : r.to, to: r.from <= r.to ? r.to : r.from, program: r.program, name: String(r.name || '').trim().slice(0, 60) || c.programs[r.program].name }))
          .slice(0, 50);
      }
    });
    log('Program kuralları güncellendi');
    pushState();
    res.json({ ok: true });
  });

  api.put('/programs', (req, res) => {
    const { programs, activeProgram } = req.body;
    const valid = (t) => /^\d{2}:\d{2}$/.test(t);
    for (const p of Object.values(programs || {})) {
      if (!p.name || !Array.isArray(p.lessons) || !p.lessons.every((l) => valid(l.start) && valid(l.end) && l.start < l.end)) {
        return res.status(400).json({ ok: false, error: 'Ders saatlerinde hata var' });
      }
    }
    store.update((c) => {
      if (programs && Object.keys(programs).length) c.programs = programs;
      if (activeProgram && c.programs[activeProgram]) c.activeProgram = activeProgram;
      if (!c.programs[c.activeProgram]) c.activeProgram = Object.keys(c.programs)[0];
      // Silinen programa bağlı kuralları temizle
      for (const k of Object.keys(c.dayPrograms || {})) if (!c.programs[c.dayPrograms[k]]) delete c.dayPrograms[k];
      c.rangePrograms = (c.rangePrograms || []).filter((r) => c.programs[r.program]);
      if (c.override && !c.programs[c.override.program]) c.override = null;
    });
    log('Zil programları güncellendi');
    pushState();
    res.json({ ok: true });
  });

  api.put('/ceremonies/:id', (req, res) => {
    let found = false;
    store.update((c) => {
      const t = c.ceremonies.find((x) => x.id === req.params.id);
      if (!t) return;
      found = true;
      if (['auto', 'manual', 'off'].includes(req.body.mode)) t.mode = req.body.mode;
      if (req.body.name) t.name = req.body.name;
      if (req.body.rule !== undefined) t.rule = req.body.rule;
      if (Array.isArray(req.body.steps)) t.steps = req.body.steps;
      if (['command', 'auto'].includes(req.body.soundStart)) t.soundStart = req.body.soundStart;
      if (req.body.screen && typeof req.body.screen === 'object') {
        const before = t.screen && t.screen.image;
        t.screen = cleanScreen(req.body.screen, t.screen);
        if (before && before !== t.screen.image) setImmediate(() => cleanupImage(before));
      }
      if (req.body.soundDelay != null) t.soundDelay = Math.max(0, Math.min(120, Number(req.body.soundDelay) || 0));
    });
    if (!found) return res.status(404).json({ ok: false, error: 'Tören bulunamadı' });
    pushState();
    res.json({ ok: true });
  });

  api.post('/ceremonies', (req, res) => {
    const id = 't' + Date.now().toString(36);
    store.update((c) => {
      const def = require('./defaults.json').ceremonies.find((x) => x.id === 'saygi');
      c.ceremonies.push({ id, name: req.body.name || 'Yeni tören', mode: 'manual', soundStart: 'command', soundDelay: 0, rule: null, steps: [{ type: 'anthem' }], screen: structuredClone(def.screen) });
    });
    res.json({ ok: true, id });
  });

  api.delete('/ceremonies/:id', (req, res) => {
    const gone = cfg().ceremonies.find((x) => x.id === req.params.id);
    store.update((c) => {
      c.ceremonies = c.ceremonies.filter((x) => x.id !== req.params.id);
    });
    if (gone && gone.screen) cleanupImage(gone.screen.image);
    res.json({ ok: true });
  });

  api.post('/ceremonies/:id/start', (req, res) => res.json(startCeremony(req.params.id, 'manual')));
  api.post('/ceremony/go', (req, res) => res.json(ceremonyGo('panel')));
  api.post('/alarm', (req, res) => res.json(startAlarm(req.body.type, req.body.drill)));
  api.post('/stop', (req, res) => {
    stopAll('panel');
    res.json({ ok: true });
  });

  api.post('/announce', (req, res) => {
    const text = String(req.body.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ ok: false, error: 'Metin boş' });
    if (state.mode === 'alarm') return res.json({ ok: false, error: 'Alarm sürüyor' });
    cmd({ action: 'announce', text, repeat: Math.min(Number(req.body.repeat) || 1, 3) });
    log('Sesli anons: ' + text);
    res.json({ ok: true });
  });

  api.put('/board', (req, res) => {
    const b = req.body;
    store.update((c) => {
      c.board = {
        announcements: (b.announcements || []).map(String).filter(Boolean).slice(0, 20),
        duty: (b.duty || []).filter((d) => d && d.place).slice(0, 12),
        menu: (b.menu || []).map(String).filter(Boolean).slice(0, 8),
        ticker: String(b.ticker || '').slice(0, 300),
        countdowns: Array.isArray(b.countdowns)
          ? b.countdowns.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')).map((x) => ({ title: String(x.title || '').trim().slice(0, 60) || 'Etkinlik', date: x.date })).slice(0, 20)
          : (c.board.countdowns || [])
      };
    });
    pushState();
    res.json({ ok: true });
  });

  api.put('/settings', (req, res) => {
    const b = req.body;
    store.update((c) => {
      if (typeof b.schoolName === 'string') c.schoolName = b.schoolName.slice(0, 80);
      if (typeof b.breakMusic === 'boolean') c.breakMusic = b.breakMusic;
      if (Array.isArray(b.weekdays)) c.weekdays = b.weekdays.map(Number).filter((n) => n >= 0 && n <= 6);
      if (Array.isArray(b.holidays)) c.holidays = b.holidays;
      if (Array.isArray(b.breaks)) c.breaks = b.breaks;
      if (b.emergency) c.emergency = { ...c.emergency, ...b.emergency };
      if (b.sounds) c.sounds = { ...c.sounds, ...b.sounds };
      if (b.newPin && /^\d{4,8}$/.test(b.newPin)) c.pin = b.newPin;
    });
    log('Ayarlar güncellendi');
    pushState();
    res.json({ ok: true });
  });

  // --- Ekran görünümü ---
  api.put('/display', (req, res) => {
    const b = req.body;
    store.update((c) => {
      const d = c.display;
      if (['dark', 'light', 'ocean', 'forest', 'flag', 'sand', 'contrast'].includes(b.theme)) d.theme = b.theme;
      if (['classic', 'media', 'fullmedia'].includes(b.layout)) d.layout = b.layout;
      if (typeof b.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent)) d.accent = b.accent;
      for (const k of ['showDuty', 'showMenu', 'mediaOnlyBreaks', 'showWeather', 'showCountdown']) if (typeof b[k] === 'boolean') d[k] = b[k];
      if (['normal', 'big'].includes(b.logoSize)) d.logoSize = b.logoSize;
      if (typeof b.logoBg === 'boolean') d.logoBg = b.logoBg;
      if (b.anthemScreen && typeof b.anthemScreen === 'object') {
        const before = { ...(d.anthemScreen || {}) };
        d.anthemScreen = cleanScreen(b.anthemScreen, d.anthemScreen);
        for (const k of ['image', 'video']) if (before[k] && before[k] !== d.anthemScreen[k]) setImmediate(() => cleanupImage(before[k]));
      }
      if (b.status && typeof b.status === 'object') {
        const st = { ...(d.status || {}) };
        for (const k of ['enabled', 'bigCountdown']) if (typeof b.status[k] === 'boolean') st[k] = b.status[k];
        for (const k of ['breakText', 'lunchText', 'warnText']) if (typeof b.status[k] === 'string') st[k] = b.status[k].trim().slice(0, 40);
        for (const k of ['breakColor', 'lunchColor', 'warnColor']) if (/^#[0-9a-fA-F]{6}$/.test(b.status[k] || '')) st[k] = b.status[k];
        if (b.status.warnMinutes != null) st.warnMinutes = Math.max(0, Math.min(10, Number(b.status.warnMinutes) || 0));
        d.status = st;
      }
    });
    pushState();
    res.json({ ok: true });
  });

  // --- Tören ekranları için görsel ve video (bayrak videosu vb.) ---
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'];
  const VID_EXT = ['mp4', 'webm', 'm4v'];
  api.post('/image/upload', (req, res) => {
    const ext = path.extname(String(req.query.name || '')).slice(1).toLowerCase();
    const isVideo = VID_EXT.includes(ext);
    if (!IMG_EXT.includes(ext) && !isVideo) return res.status(400).json({ ok: false, error: 'Görsel (PNG, JPG, WEBP, SVG, GIF) ya da video (MP4, WEBM) olmalı' });
    const LIMIT = (isVideo ? 1024 : 20) * 1024 * 1024;
    const file = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '.' + ext;
    const dest = path.join(mediaDir, file);
    const out = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (ch) => { size += ch.length; if (size > LIMIT) { req.destroy(); out.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(out);
    out.on('finish', () => {
      if (!size || size > LIMIT) { fs.unlink(dest, () => {}); return res.status(400).json({ ok: false, error: size ? 'Dosya çok büyük (görsel 20 MB, video 1 GB)' : 'Dosya boş' }); }
      res.json({ ok: true, file, type: isVideo ? 'video' : 'image' });
    });
    out.on('error', () => res.status(500).json({ ok: false, error: 'Dosya kaydedilemedi' }));
  });
  // Artık hiçbir yerde kullanılmayan tören görselini sil
  function cleanupImage(file) {
    if (!file || !/^img-[\w]+\.\w+$/.test(file)) return;
    const c = cfg();
    const a = c.display.anthemScreen || {};
    const used = a.image === file || a.video === file || c.ceremonies.some((x) => x.screen && (x.screen.image === file || x.screen.video === file));
    if (!used) fs.unlink(path.join(mediaDir, file), () => {});
  }
  function cleanScreen(input, base) {
    const out = { ...(base || {}) };
    for (const k of ['title', 'kicker', 'message']) if (typeof input[k] === 'string') out[k] = input[k].trim().slice(0, k === 'message' ? 300 : 80);
    for (const k of ['grayscale', 'showSteps', 'showFlag', 'showProgress', 'showCeremonyName']) if (typeof input[k] === 'boolean') out[k] = input[k];
    if (/^#[0-9a-fA-F]{6}$/.test(input.bg || '')) out.bg = input.bg;
    for (const k of ['image', 'video']) if (input[k] === null || (typeof input[k] === 'string' && /^img-[\w]+\.\w+$/.test(input[k]))) out[k] = input[k];
    if (['flag', 'image', 'video', 'none'].includes(input.visual)) out.visual = input.visual;
    return out;
  }

  // --- Ses kütüphanesi (zil, İstiklal Marşı, siren, alarm, müzik) ---
  const SOUND_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
  const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  function safeName(name) {
    const ext = path.extname(name).toLowerCase();
    const base = path.basename(name, path.extname(name)).replace(/[çğıöşüÇĞİÖŞÜ]/g, (ch) => TR[ch]).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ses';
    return base + ext;
  }
  function listSounds(sub) {
    const seen = new Map();
    const dirs = [[path.join(soundsDir, sub || ''), 'uploaded'], [bundledSoundsDir && path.join(bundledSoundsDir, sub || ''), 'bundled']];
    for (const [dir, source] of dirs) {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!f.isFile() || !SOUND_EXT.includes(path.extname(f.name).slice(1).toLowerCase()) || seen.has(f.name)) continue;
        seen.set(f.name, { name: f.name, size: fs.statSync(path.join(dir, f.name)).size, source });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }
  api.get('/sounds', (req, res) => res.json({ files: listSounds(''), music: listSounds('muzik'), roles: cfg().sounds }));
  api.post('/sounds/upload', (req, res) => {
    const original = String(req.query.name || '');
    const ext = path.extname(original).slice(1).toLowerCase();
    if (!SOUND_EXT.includes(ext)) return res.status(400).json({ ok: false, error: 'Ses dosyası MP3, WAV, OGG, M4A ya da AAC olmalı' });
    const sub = req.query.folder === 'muzik' ? 'muzik' : '';
    const dir = path.join(soundsDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    let file = safeName(original);
    let n = 2;
    while (fs.existsSync(path.join(dir, file))) file = safeName(path.basename(original, path.extname(original)) + '-' + n++ + path.extname(original));
    const dest = path.join(dir, file);
    const out = fs.createWriteStream(dest);
    let size = 0;
    const LIMIT = 200 * 1024 * 1024;
    req.on('data', (ch) => { size += ch.length; if (size > LIMIT) { req.destroy(); out.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(out);
    out.on('finish', () => {
      if (!size || size > LIMIT) { fs.unlink(dest, () => {}); return res.status(400).json({ ok: false, error: size ? 'Ses dosyası 200 MB\'dan küçük olmalı' : 'Dosya boş' }); }
      const role = String(req.query.role || '');
      if (role && !sub && cfg().sounds[role] !== undefined) store.update((c) => { c.sounds[role] = file; });
      log('Ses yüklendi: ' + (sub ? sub + '/' : '') + file + (role ? ' (' + role + ')' : ''));
      pushState();
      res.json({ ok: true, file });
    });
    out.on('error', () => res.status(500).json({ ok: false, error: 'Dosya kaydedilemedi' }));
  });
  api.delete('/sounds/:name', (req, res) => {
    const sub = req.query.folder === 'muzik' ? 'muzik' : '';
    const file = path.basename(req.params.name);
    const p = path.join(soundsDir, sub, file);
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'Sadece yüklenen dosyalar silinebilir' });
    fs.unlinkSync(p);
    log('Ses silindi: ' + (sub ? sub + '/' : '') + file);
    res.json({ ok: true });
  });
  api.put('/sounds/roles', (req, res) => {
    const b = req.body || {};
    store.update((c) => {
      for (const k of Object.keys(c.sounds)) if (typeof b[k] === 'string') c.sounds[k] = path.basename(b[k]);
    });
    pushState();
    res.json({ ok: true });
  });

  // --- Hava durumu (Open-Meteo, anahtar gerektirmez; internet yoksa sessizce atlanır) ---
  let weatherTimer = null;
  async function refreshWeather() {
    clearTimeout(weatherTimer);
    const w = cfg().weather || {};
    if (!w.enabled || w.lat == null || w.lon == null) { weather = null; pushState(); return; }
    try {
      const url = (process.env.ZIL_WEATHER_BASE || 'https://api.open-meteo.com') + '/v1/forecast?latitude=' + w.lat + '&longitude=' + w.lon +
        '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      weather = {
        city: w.city, temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, isDay: !!j.current.is_day,
        max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), at: Date.now()
      };
      pushState();
    } catch (e) {
      // İnternet yoksa eski bilgiyi 3 saate kadar göster
      if (weather && Date.now() - weather.at > 3 * 3600 * 1000) { weather = null; pushState(); }
    }
    weatherTimer = setTimeout(refreshWeather, 30 * 60 * 1000);
  }
  setTimeout(refreshWeather, 2000);

  api.get('/weather/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, results: [] });
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=tr&format=json&name=' + encodeURIComponent(q), { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      res.json({ ok: true, results: (j.results || []).map((x) => ({ name: x.name, region: [x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude })) });
    } catch (e) {
      res.json({ ok: false, error: 'Şehir aranamadı. Okul bilgisayarında internet var mı?' });
    }
  });
  api.put('/weather', (req, res) => {
    const b = req.body || {};
    store.update((c) => {
      const w = c.weather || {};
      if (typeof b.enabled === 'boolean') w.enabled = b.enabled;
      if (typeof b.city === 'string') w.city = b.city.slice(0, 80);
      if (Number.isFinite(b.lat) && Number.isFinite(b.lon)) { w.lat = b.lat; w.lon = b.lon; }
      c.weather = w;
    });
    refreshWeather();
    res.json({ ok: true });
  });

  // --- Günün sözü ---
  api.put('/quote', (req, res) => {
    const b = req.body || {};
    store.update((c) => {
      const q = c.quote || {};
      if (typeof b.enabled === 'boolean') q.enabled = b.enabled;
      if (['both', 'atasozu', 'deyim', 'custom'].includes(b.kinds)) q.kinds = b.kinds;
      if (typeof b.showMeaning === 'boolean') q.showMeaning = b.showMeaning;
      if (Array.isArray(b.custom)) q.custom = b.custom.map((x) => ({ text: String(x.text || '').trim().slice(0, 200), meaning: String(x.meaning || '').trim().slice(0, 200) })).filter((x) => x.text).slice(0, 365);
      c.quote = q;
    });
    pushState();
    res.json({ ok: true });
  });

  // --- Ekran karartma ---
  api.put('/dim', (req, res) => {
    const b = req.body || {};
    store.update((c) => {
      const d = c.display.dim || {};
      if (['auto', 'off'].includes(b.mode)) d.mode = b.mode;
      for (const k of ['before', 'after']) if (b[k] != null) d[k] = Math.max(0, Math.min(180, Number(b[k]) || 0));
      if (typeof b.holidays === 'boolean') d.holidays = b.holidays;
      c.display.dim = d;
    });
    pushState();
    res.json({ ok: true });
  });
  // Şimdi karart / şimdi aç (belirli süre için elle)
  api.post('/dim/now', (req, res) => {
    const v = req.body.value;
    if (v === 'auto') state.dimOverride = null;
    else if (v === 'dim' || v === 'wake') state.dimOverride = { value: v, until: Date.now() + (Math.max(10, Math.min(720, Number(req.body.minutes) || 180))) * 60000 };
    log(v === 'dim' ? 'TV ekranı elle karartıldı' : v === 'wake' ? 'TV ekranı elle açıldı' : 'TV ekranı otomatik karartmaya döndü');
    pushState();
    res.json({ ok: true });
  });

  // --- Telegram ---
  api.put('/telegram', (req, res) => {
    const b = req.body || {};
    store.update((c) => {
      const t = c.telegram || {};
      if (typeof b.enabled === 'boolean') t.enabled = b.enabled;
      if (typeof b.token === 'string' && b.token.trim()) t.token = b.token.trim();
      if (b.token === null) { t.token = ''; t.chats = []; t.enabled = false; }
      if (Array.isArray(b.chats)) t.chats = b.chats.filter((x) => x && x.id != null).map((x) => ({ id: x.id, name: String(x.name || x.id).slice(0, 60) })).slice(0, 20);
      if (b.events && typeof b.events === 'object') t.events = { ...(t.events || {}), ...b.events };
      c.telegram = t;
    });
    res.json({ ok: true });
  });
  // Bota mesaj atan sohbetleri bul
  api.post('/telegram/discover', async (req, res) => {
    const t = cfg().telegram || {};
    if (!t.token) return res.json({ ok: false, error: 'Önce bot anahtarını kaydedin' });
    try {
      const me = await tgCall(t.token, 'getMe');
      if (!me.ok) return res.json({ ok: false, error: 'Bot anahtarı geçersiz' });
      const up = await tgCall(t.token, 'getUpdates', { limit: 100 });
      const chats = new Map();
      for (const u of up.result || []) {
        const ch = (u.message || u.channel_post || u.my_chat_member || {}).chat;
        if (ch) chats.set(ch.id, { id: ch.id, name: ch.title || [ch.first_name, ch.last_name].filter(Boolean).join(' ') || ch.username || String(ch.id) });
      }
      res.json({ ok: true, bot: me.result.username, chats: [...chats.values()] });
    } catch (e) {
      res.json({ ok: false, error: 'Telegram\'a ulaşılamadı. Okul bilgisayarında internet var mı?' });
    }
  });
  api.post('/telegram/test', async (req, res) => {
    const t = cfg().telegram || {};
    if (!t.token || !(t.chats || []).length) return res.json({ ok: false, error: 'Bot anahtarı ve en az bir sohbet gerekli' });
    try {
      const results = await Promise.all(t.chats.map((ch) => tgCall(t.token, 'sendMessage', { chat_id: ch.id, text: cfg().schoolName + '\n✅ Test bildirimi: Okul Zil sistemi bildirimleri çalışıyor.' })));
      const bad = results.filter((r) => !r.ok).length;
      res.json(bad ? { ok: false, error: bad + ' sohbete gönderilemedi' } : { ok: true });
    } catch (e) {
      res.json({ ok: false, error: 'Telegram\'a ulaşılamadı. Okul bilgisayarında internet var mı?' });
    }
  });

  // --- Yedekleme ---
  // Ayarlar, sesler ve medya tek ZIP dosyasında
  api.get('/backup', (req, res) => {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFile(store.file, '', 'config.json');
    if (fs.existsSync(soundsDir)) zip.addLocalFolder(soundsDir, 'sounds');
    if (fs.existsSync(mediaDir)) zip.addLocalFolder(mediaDir, 'media');
    zip.addFile('okulzil-yedek.txt', Buffer.from('Okul Zil ve Pano yedeği\nOluşturma: ' + new Date().toISOString() + '\nSürüm: ' + BUILD + '\n'));
    const day = new Date().toISOString().slice(0, 10);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="okulzil-yedek-' + day + '.zip"' });
    res.send(zip.toBuffer());
    log('Yedek indirildi');
  });

  api.post('/backup/restore', (req, res) => {
    const AdmZip = require('adm-zip');
    const tmp = path.join(dataDir, 'geri-yukle-' + Date.now() + '.zip');
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on('error', () => res.status(500).json({ ok: false, error: 'Dosya kaydedilemedi' }));
    out.on('finish', () => {
      try {
        const zip = new AdmZip(tmp);
        const cfgEntry = zip.getEntry('config.json');
        if (!cfgEntry) throw new Error('Bu dosya bir Okul Zil yedeği değil (config.json yok)');
        const restored = JSON.parse(cfgEntry.getData().toString('utf8'));
        if (!restored.programs || !restored.ceremonies) throw new Error('Yedekteki ayar dosyası bozuk');
        const currentPin = cfg().pin;
        // Mevcut ayarları ayrıca sakla
        fs.copyFileSync(store.file, store.file + '.geri-yukleme-oncesi-' + Date.now());
        for (const e of zip.getEntries()) {
          if (e.isDirectory) continue;
          const name = e.entryName.replace(/\\/g, '/');
          if (!/^(sounds|media)\//.test(name) || name.split('/').includes('..')) continue;
          const dest = path.join(dataDir, ...name.split('/'));
          if (!dest.startsWith(dataDir + path.sep)) continue;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, e.getData());
        }
        restored.pin = currentPin; // PIN değişmesin, kimse dışarıda kalmasın
        fs.writeFileSync(store.file, JSON.stringify(restored, null, 2), 'utf8');
        store.reload();
        log('Yedek geri yüklendi');
        pushState();
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message || 'Yedek okunamadı' });
      } finally {
        fs.unlink(tmp, () => {});
      }
    });
  });

  // --- İlk kurulum ---
  api.put('/setup', (req, res) => {
    store.update((c) => { c.setupDone = !!req.body.done; });
    res.json({ ok: true });
  });

  // --- Okul logosu ---
  api.post('/logo/upload', (req, res) => {
    const ext = path.extname(String(req.query.name || '')).slice(1).toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return res.status(400).json({ ok: false, error: 'Logo PNG, JPG, WEBP, SVG ya da GIF olmalı' });
    const file = 'logo-' + Date.now().toString(36) + '.' + ext;
    const dest = path.join(mediaDir, file);
    const out = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (ch) => { size += ch.length; if (size > 10 * 1024 * 1024) { req.destroy(); out.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(out);
    out.on('finish', () => {
      if (!size || size > 10 * 1024 * 1024) { fs.unlink(dest, () => {}); return res.status(400).json({ ok: false, error: size ? 'Logo 10 MB\'dan küçük olmalı' : 'Dosya boş' }); }
      const old = cfg().display.logo;
      store.update((c) => { c.display.logo = file; });
      if (old) fs.unlink(path.join(mediaDir, path.basename(old)), () => {});
      log('Okul logosu güncellendi');
      pushState();
      res.json({ ok: true });
    });
    out.on('error', () => res.status(500).json({ ok: false, error: 'Logo kaydedilemedi' }));
  });
  api.delete('/logo', (req, res) => {
    const old = cfg().display.logo;
    store.update((c) => { c.display.logo = null; });
    if (old) fs.unlink(path.join(mediaDir, path.basename(old)), () => {});
    pushState();
    res.json({ ok: true });
  });

  // --- Medya (video / resim / afiş) ---
  // Dosya, gövdede ham veri olarak gelir: POST /api/media/upload?name=afis.jpg
  api.post('/media/upload', (req, res) => {
    const original = String(req.query.name || '').slice(0, 120);
    const ext = path.extname(original).slice(1).toLowerCase();
    const type = MEDIA_TYPES[ext];
    if (!type) return res.status(400).json({ ok: false, error: 'Desteklenen dosyalar: JPG, PNG, WEBP, GIF, MP4, WEBM' });
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const file = id + '.' + ext;
    const dest = path.join(mediaDir, file);
    const out = fs.createWriteStream(dest);
    let size = 0;
    const LIMIT = 2 * 1024 * 1024 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMIT) {
        req.destroy();
        out.destroy();
        fs.unlink(dest, () => {});
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (size === 0 || size > LIMIT) {
        fs.unlink(dest, () => {});
        return res.status(400).json({ ok: false, error: size ? 'Dosya 2 GB sınırını aşıyor' : 'Dosya boş' });
      }
      const name = original.replace(/\.[^.]+$/, '') || file;
      store.update((c) => {
        c.media.push({ id, file, type, name, duration: 10, enabled: true });
      });
      log('Medya eklendi: ' + name);
      pushState();
      res.json({ ok: true, id });
    });
    out.on('error', () => res.status(500).json({ ok: false, error: 'Dosya kaydedilemedi' }));
  });

  // Sıra, süre, ses, açık/kapalı güncellemesi
  api.put('/media', (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ ok: false, error: 'Liste eksik' });
    store.update((c) => {
      const byId = new Map(c.media.map((m) => [m.id, m]));
      const next = [];
      for (const it of items) {
        const m = byId.get(it.id);
        if (!m) continue;
        if (typeof it.name === 'string' && it.name.trim()) m.name = it.name.trim().slice(0, 80);
        if (it.duration != null) m.duration = Math.max(3, Math.min(600, Number(it.duration) || 10));
        if (typeof it.enabled === 'boolean') m.enabled = it.enabled;
        next.push(m);
        byId.delete(m.id);
      }
      c.media = next.concat([...byId.values()]);
    });
    pushState();
    res.json({ ok: true });
  });

  api.delete('/media/:id', (req, res) => {
    let removed = null;
    store.update((c) => {
      removed = c.media.find((m) => m.id === req.params.id);
      c.media = c.media.filter((m) => m.id !== req.params.id);
    });
    if (removed) {
      fs.unlink(path.join(mediaDir, path.basename(removed.file)), () => {});
      log('Medya silindi: ' + removed.name);
    }
    pushState();
    res.json({ ok: true });
  });

  api.post('/test-sound', (req, res) => {
    cmd({ action: 'test', sound: req.body.sound });
    res.json({ ok: true });
  });

  app.use('/api', api);

  // Ders saatlerinde pano 3 dakikadan uzun süre kapalı kalırsa haber ver
  let panoMissingSince = null;
  let panoAlerted = false;
  setInterval(() => {
    const day = scheduler.today();
    if (!day.schoolDay || !day.lessons.length) { panoMissingSince = null; return; }
    const now = new Date();
    const hm = now.getHours() * 60 + now.getMinutes();
    const toM = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const inHours = hm >= toM(day.lessons[0].start) - 15 && hm <= toM(day.lessons[day.lessons.length - 1].end);
    const a = audioStatus();
    if (inHours && !a.ready) {
      if (!panoMissingSince) panoMissingSince = Date.now();
      if (!panoAlerted && Date.now() - panoMissingSince > 3 * 60000) {
        panoAlerted = true;
        log('UYARI: ders saatinde ses çıkışı yok');
        notify('audio', '⚠️ Ders saatinde zil sesi çıkmıyor: ' + (a.panos ? 'pano sesi kapalı' : 'TV panosu açık değil') + ' (' + hhmm() + ')');
      }
    } else {
      if (panoAlerted && a.ready) notify('audio', '✅ Ses çıkışı yeniden hazır (' + hhmm() + ')');
      panoMissingSince = null;
      panoAlerted = false;
    }
  }, 60000);
  setTimeout(() => notify('system', '🔔 Okul Zil sistemi açıldı (' + hhmm() + ')'), 5000);

  const server = app.listen(port, '0.0.0.0', () => {
    log('Sürüm ' + BUILD + ' · Sunucu çalışıyor: http://localhost:' + port + ' · Ağ: ' + lanAddresses().map((a) => 'http://' + a + ':' + port).join(', '));
  });

  return {
    store,
    state,
    log,
    stopAll,
    lanAddresses,
    close: () => {
      scheduler.stop();
      server.close();
    }
  };
}

module.exports = { startServer };
