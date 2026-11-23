// Yerel sunucu: TV panosu ve telefon paneli buradan açılır, komutlar buradan dağıtılır.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createStore } = require('./store');
const { createScheduler } = require('./scheduler');

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

function startServer({ dataDir, port, bundledSoundsDir }) {
  const store = createStore(dataDir);
  const cfg = () => store.get();
  const soundsDir = path.join(dataDir, 'sounds');
  fs.mkdirSync(path.join(soundsDir, 'muzik'), { recursive: true });

  const logFile = path.join(dataDir, 'kayit.log');
  const recent = [];
  function log(msg) {
    const line = new Date().toLocaleString('tr-TR') + ' · ' + msg;
    recent.unshift(line);
    if (recent.length > 200) recent.pop();
    fs.appendFile(logFile, line + '\n', () => {});
    console.log(line);
  }

  const state = { mode: 'normal', alarm: null, ceremony: null, skipNext: null, music: false };
  let ceremonyTimer = null;

  // --- SSE: pano ve paneller canlı olarak buradan dinler ---
  const clients = new Set();
  function send(res, type, payload) {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify(payload) + '\n\n');
  }
  function broadcast(type, payload) {
    for (const res of clients) send(res, type, payload);
  }
  function publicState() {
    const c = cfg();
    return {
      mode: state.mode,
      alarm: state.alarm,
      ceremony: state.ceremony,
      skipNext: state.skipNext,
      music: state.music,
      day: scheduler.today(),
      schoolName: c.schoolName,
      board: c.board,
      emergency: c.emergency,
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
    stopMusic();
    state.mode = 'ceremony';
    state.ceremony = { id: c.id, name: c.name, steps: c.steps, startedAt: Date.now(), source };
    clearTimeout(ceremonyTimer);
    ceremonyTimer = setTimeout(() => endCeremony('zaman aşımı'), 15 * 60 * 1000);
    log('Tören başladı: ' + c.name + ' (' + (source === 'auto' ? 'otomatik' : 'elle') + ')');
    cmd({ action: 'ceremony', ceremony: state.ceremony });
    pushState();
    return { ok: true };
  }

  function endCeremony(why) {
    if (state.mode !== 'ceremony') return;
    clearTimeout(ceremonyTimer);
    log('Tören bitti: ' + state.ceremony.name + (why ? ' (' + why + ')' : ''));
    state.mode = 'normal';
    state.ceremony = null;
    pushState();
  }

  function startAlarm(type, drill) {
    if (!ALARMS[type]) return { ok: false, error: 'Bilinmeyen alarm türü' };
    clearTimeout(ceremonyTimer);
    stopMusic();
    state.mode = 'alarm';
    state.ceremony = null;
    state.alarm = { type, name: ALARMS[type], drill: !!drill, startedAt: Date.now() };
    log((drill ? 'TATBİKAT ' : 'ALARM ') + ALARMS[type] + ' başlatıldı');
    cmd({ action: 'alarm', alarm: state.alarm });
    pushState();
    return { ok: true };
  }

  function stopAll(by) {
    clearTimeout(ceremonyTimer);
    if (state.mode === 'alarm') log('Alarm durduruldu' + (by ? ' (' + by + ')' : ''));
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
  app.use('/pano', express.static(path.join(pub, 'pano')));
  app.use('/panel', express.static(path.join(pub, 'panel')));
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

  // Pano töreni bitirdiğini bildirir (yerel çağrı)
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
    const { pin, ...rest } = cfg();
    res.json(rest);
  });
  api.get('/log', (req, res) => res.json(recent));
  api.get('/info', (req, res) => res.json({ addresses: lanAddresses(), port, dataDir, soundsDir }));

  api.post('/bell/ring', (req, res) => {
    const bell = ['teacher', 'student', 'end'].includes(req.body.bell) ? req.body.bell : 'student';
    if (state.mode !== 'normal') return res.json({ ok: false, error: 'Tören ya da alarm sürüyor' });
    ringBell(bell, 'Elle çalınan zil', false);
    log('Elle zil çalındı');
    res.json({ ok: true });
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
      c.override = id === c.activeProgram ? null : { date: dk, program: id };
    });
    log('Bugünkü program: ' + cfg().programs[id].name);
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
      if (programs) c.programs = programs;
      if (activeProgram && c.programs[activeProgram]) c.activeProgram = activeProgram;
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
    });
    if (!found) return res.status(404).json({ ok: false, error: 'Tören bulunamadı' });
    pushState();
    res.json({ ok: true });
  });

  api.post('/ceremonies', (req, res) => {
    const id = 't' + Date.now().toString(36);
    store.update((c) => {
      c.ceremonies.push({ id, name: req.body.name || 'Yeni tören', mode: 'manual', rule: null, steps: [{ type: 'anthem' }] });
    });
    res.json({ ok: true, id });
  });

  api.delete('/ceremonies/:id', (req, res) => {
    store.update((c) => {
      c.ceremonies = c.ceremonies.filter((x) => x.id !== req.params.id);
    });
    res.json({ ok: true });
  });

  api.post('/ceremonies/:id/start', (req, res) => res.json(startCeremony(req.params.id, 'manual')));
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
        ticker: String(b.ticker || '').slice(0, 300)
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

  api.post('/test-sound', (req, res) => {
    cmd({ action: 'test', sound: req.body.sound });
    res.json({ ok: true });
  });

  app.use('/api', api);

  const server = app.listen(port, '0.0.0.0', () => {
    log('Sunucu çalışıyor: http://localhost:' + port + ' · Ağ: ' + lanAddresses().map((a) => 'http://' + a + ':' + port).join(', '));
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
