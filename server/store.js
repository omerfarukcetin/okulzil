// Ayarların JSON dosyasında saklanması. İnternet gerekmez.
const fs = require('fs');
const path = require('path');
const defaults = require('./defaults.json');

// Kayıtlı ayarları güncel yapıya getirir (eski sürümlerden gelen dosyalar dahil)
function normalize(saved) {
  const data = { ...structuredClone(defaults), ...saved };
  data.sounds = { ...defaults.sounds, ...(saved.sounds || {}) };
  data.board = { ...defaults.board, ...(saved.board || {}) };
  if (!Array.isArray(data.board.countdowns)) data.board.countdowns = [];
  data.weather = { ...defaults.weather, ...(saved.weather || {}) };
  data.quote = { ...defaults.quote, ...(saved.quote || {}) };
  data.telegram = { ...defaults.telegram, ...(saved.telegram || {}) };
  data.telegram.events = { ...defaults.telegram.events, ...((saved.telegram && saved.telegram.events) || {}) };
  if (!data.dayPrograms || typeof data.dayPrograms !== 'object') data.dayPrograms = {};
  if (!Array.isArray(data.rangePrograms)) data.rangePrograms = [];
  data.emergency = { ...defaults.emergency, ...(saved.emergency || {}) };
  data.display = { ...defaults.display, ...(saved.display || {}) };
  data.display.dim = { ...defaults.display.dim, ...((saved.display && saved.display.dim) || {}) };
  data.display.status = { ...defaults.display.status, ...((saved.display && saved.display.status) || {}) };
  data.display.anthemScreen = { ...defaults.display.anthemScreen, ...((saved.display && saved.display.anthemScreen) || {}) };
  const savedAnthem = (saved.display && saved.display.anthemScreen) || {};
  if (!savedAnthem.visual) data.display.anthemScreen.visual = savedAnthem.image ? 'image' : savedAnthem.showFlag === false ? 'none' : 'flag';
  // Önceden kurulmuş sistemlerde sihirbaz kendiliğinden açılmasın
  if (saved.setupDone === undefined) data.setupDone = true;
  if (!Array.isArray(data.media)) data.media = [];
  if (!data.programs || !Object.keys(data.programs).length) data.programs = structuredClone(defaults.programs);
  if (!data.programs[data.activeProgram]) data.activeProgram = Object.keys(data.programs)[0];
  // Eski kayıtlar: tören ekranı ve ses başlatma ayarı yoksa ekle
  for (const c of data.ceremonies || []) {
    if (!c.screen) {
      const def = defaults.ceremonies.find((x) => x.id === c.id) || defaults.ceremonies.find((x) => x.id === 'saygi');
      c.screen = structuredClone(def.screen);
    }
    if (!c.soundStart) {
      c.soundStart = c.id === 'kasim' ? 'auto' : 'command';
      c.soundDelay = 0;
    }
  }
  return data;
}

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'config.json');
  let data;

  function save() {
    // Önce geçici dosyaya yaz, sonra taşı: elektrik kesilirse dosya bozulmaz.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  function load() {
    try {
      data = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
      if (fs.existsSync(file)) {
        // Bozuk dosyayı yedekle, varsayılanlarla devam et.
        fs.copyFileSync(file, file + '.bozuk-' + Date.now());
      }
      data = structuredClone(defaults);
      save();
    }
  }
  load();

  return {
    file,
    get: () => data,
    reload: load,
    update(fn) {
      fn(data);
      save();
      return data;
    }
  };
}

module.exports = { createStore, normalize };
