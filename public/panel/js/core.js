// Ortak yardımcılar: DOM, API, simgeler, diyaloglar, bildirimler, durum hesabı
'use strict';

window.App = {
  state: null, // sunucudan canlı gelen durum
  config: null, // PIN ile alınan tam ayarlar
  pin: '',
  build: null,
  pages: {},
  page: 'home',
  sub: {}
};

// ---------- DOM ----------
// append / replaceChildren boş (null / false) öğeleri yok saysın
for (const fn of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[fn];
  Element.prototype[fn] = function (...nodes) { return orig.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false)); };
}
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (['value', 'checked', 'disabled', 'htmlFor', 'selected', 'multiple', 'min', 'max', 'step'].includes(k)) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const $ = (sel, root = document) => root.querySelector(sel);
let uid = 0;
const nextId = (p = 'f') => p + '-' + ++uid;

// Etiketli alan
function field(label, input, hint) {
  if (!input.id) input.id = nextId();
  return h('div', { class: 'field' }, h('label', { htmlFor: input.id, text: label }), input, hint ? h('div', { class: 'small muted', text: hint }) : null);
}
// Açma / kapama anahtarı
function toggle(title, checked, onChange, sub) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, h('span', { class: 'sw-text' }, h('span', { class: 'sw-title', text: title }), sub ? h('span', { class: 'sw-sub', text: sub }) : null), input);
}
// Segment seçici
function segmented(options, value, onChange, cls) {
  const box = h('div', { class: 'seg ' + (cls || ''), role: 'group' });
  for (const [v, label] of options) {
    const b = h('button', { type: 'button', 'aria-pressed': String(v === value), text: label });
    b.onclick = () => {
      box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange(v);
    };
    box.appendChild(b);
  }
  return box;
}

// ---------- Simgeler (çizgi simgeler) ----------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  flag: '<path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  skip: '<path d="M5 4v16l10-8Z"/><path d="M19 5v14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3"/>',
  school: '<path d="M2 9 12 4l10 5-10 5Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  wand: '<path d="m15 4 5 5L9 20l-5-5Z"/><path d="M14 5l5 5"/><path d="M5 3v3M3.5 4.5h3M19 15v3M17.5 16.5h3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14v3H5z"/><path d="M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  log: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i ' + (cls || ''));
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// ---------- API ----------
async function api(method, url, body) {
  try {
    const r = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-pin': App.pin },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({ ok: false, error: 'Sunucu yanıt vermedi' }));
    if (r.status === 401) App.logout && App.logout('PIN geçersiz, yeniden giriş yapın');
    return data;
  } catch (e) {
    return { ok: false, error: 'Sunucuya ulaşılamadı' };
  }
}
// Dosya gönderimi (ilerleme ile)
function upload(url, file, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api' + url);
    xhr.setRequestHeader('x-pin', App.pin);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let r = {};
      try { r = JSON.parse(xhr.responseText); } catch (e) {}
      resolve(r.ok ? r : { ok: false, error: r.error || 'Yüklenemedi' });
    };
    xhr.onerror = () => resolve({ ok: false, error: 'Bağlantı hatası' });
    xhr.send(file);
  });
}
// Dosya seçtir
function pickFile(accept, multiple) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, multiple: !!multiple, class: 'hidden' });
    inp.onchange = () => { resolve([...inp.files]); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}
const mediaUrl = (f) => '/media/' + encodeURIComponent(f);
const soundUrl = (f) => '/sounds/' + f.split('/').map(encodeURIComponent).join('/');

// ---------- Bildirim ----------
function toast(msg, bad) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, icon(bad ? 'alert' : 'check', 'sm'), msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), bad ? 5000 : 2200);
}
async function save(promise, okMsg) {
  const r = await promise;
  if (r && r.ok === false) toast(r.error || 'Kaydedilemedi', true);
  else if (okMsg !== null) toast(okMsg || 'Kaydedildi');
  return r;
}

// ---------- Sayfa / diyalog ----------
function sheet({ title, body, foot, size }) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'sheet ' + (size || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Kapat', onclick: () => close() }, icon('x'))),
      h('div', { class: 'sheet-body' }, body),
      foot ? h('div', { class: 'sheet-foot' }, foot) : null));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', esc);
  $('#layer').appendChild(ov);
  const first = ov.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 50);
  return { close, el: ov };
}
function confirmBox({ title, text, ok = 'Tamam', danger }) {
  return new Promise((resolve) => {
    let s;
    const done = (v) => { s.close(); resolve(v); };
    s = sheet({
      title, size: 'sm',
      body: h('p', { style: { margin: 0 }, text }),
      foot: [h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onclick: () => done(false) }),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', text: ok, onclick: () => done(true) })]
    });
  });
}

// ---------- Zaman ----------
const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const fromMin = (m) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function serverNow() {
  return new Date(Date.now() + (App.clockOffset || 0));
}
function fmtLeft(sec) {
  if (sec < 60) return sec + ' sn';
  const m = Math.ceil(sec / 60);
  if (m < 60) return m + ' dk';
  return Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk';
}
// Şu anki durumu hesaplar (TV'deki mantığın aynısı)
function currentPhase(day) {
  const d = serverNow();
  const cur = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const st = (App.state && App.state.display && App.state.display.status) || {};
  const warnMin = st.warnMinutes != null ? Number(st.warnMinutes) : 2;
  if (!day || !day.schoolDay) return { phase: 'off', kicker: 'BUGÜN DERS YOK', title: (day && day.reason) || 'Ders yok', sub: '' };
  const L = day.lessons;
  if (!L.length) return { phase: 'off', kicker: 'PROGRAM BOŞ', title: 'Ders saati tanımlı değil', sub: '' };
  const secTo = (t) => Math.max(0, Math.round((toMin(t) - cur) * 60));
  for (let i = 0; i < L.length; i++) {
    const s = toMin(L[i].start), e = toMin(L[i].end);
    if (cur < s) {
      const prevEnd = i ? toMin(L[i - 1].end) : null;
      const gap = i ? s - prevEnd : null;
      const warn = s - cur <= warnMin;
      const phase = warn ? 'warn' : i === 0 ? 'before' : gap >= 30 ? 'lunch' : 'break';
      const total = i ? (s - prevEnd) * 60 : null;
      return {
        phase,
        kicker: i === 0 ? 'GÜNÜN BAŞI' : gap >= 30 ? 'ÖĞLE ARASI' : 'TENEFFÜS',
        title: i === 0 ? 'Dersler ' + L[0].start + "'de başlıyor" : gap >= 30 ? 'Öğle arası' : 'Teneffüs',
        sub: (i + 1) + '. ders ' + L[i].start + ' – ' + L[i].end,
        countLabel: (i + 1) + '. derse',
        count: fmtLeft(secTo(L[i].start)),
        progress: total ? 1 - secTo(L[i].start) / total : null
      };
    }
    if (cur < e) {
      return {
        phase: 'lesson',
        kicker: (i + 1) + '. DERS',
        title: (i + 1) + '. ders',
        sub: L[i].start + ' – ' + L[i].end,
        countLabel: i === L.length - 1 ? 'dersler bitimine' : 'teneffüse',
        count: fmtLeft(secTo(L[i].end)),
        progress: 1 - secTo(L[i].end) / ((e - s) * 60)
      };
    }
  }
  return { phase: 'off', kicker: 'GÜN BİTTİ', title: 'Bugünlük dersler bitti', sub: 'İyi akşamlar' };
}
const STEP_NAMES = { siren: 'Siren', silence: 'Saygı duruşu (sessiz)', anthem: 'İstiklal Marşı' };
const STEP_SHORT = { siren: 'Siren', silence: 'Saygı duruşu', anthem: 'İstiklal Marşı' };

// ---------- Tema ----------
const THEME_ORDER = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_LABEL = { auto: 'Otomatik tema', light: 'Açık tema', dark: 'Koyu tema' };
function themePref() { try { return localStorage.getItem('zilTheme') || 'auto'; } catch (e) { return 'auto'; } }
function applyTheme() {
  const p = themePref();
  const dark = p === 'dark' || (p === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const id of ['themeBtn', 'themeBtn2']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.replaceChildren(icon(p === 'auto' ? 'auto' : p === 'light' ? 'sun' : 'moon'));
    b.title = THEME_LABEL[p];
    b.setAttribute('aria-label', 'Panel teması: ' + THEME_LABEL[p]);
  }
}
function cycleTheme() {
  try { localStorage.setItem('zilTheme', THEME_ORDER[themePref()]); } catch (e) {}
  applyTheme();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
