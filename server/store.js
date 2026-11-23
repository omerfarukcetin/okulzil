// Ayarların JSON dosyasında saklanması. İnternet gerekmez.
const fs = require('fs');
const path = require('path');
const defaults = require('./defaults.json');

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

  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...structuredClone(defaults), ...saved };
    data.sounds = { ...defaults.sounds, ...(saved.sounds || {}) };
    data.board = { ...defaults.board, ...(saved.board || {}) };
    data.emergency = { ...defaults.emergency, ...(saved.emergency || {}) };
    data.display = { ...defaults.display, ...(saved.display || {}) };
    data.display.status = { ...defaults.display.status, ...((saved.display && saved.display.status) || {}) };
    data.display.anthemScreen = { ...defaults.display.anthemScreen, ...((saved.display && saved.display.anthemScreen) || {}) };
    const savedAnthem = (saved.display && saved.display.anthemScreen) || {};
    if (!savedAnthem.visual) data.display.anthemScreen.visual = savedAnthem.image ? 'image' : savedAnthem.showFlag === false ? 'none' : 'flag';
    // Önceden kurulmuş sistemlerde sihirbaz kendiliğinden açılmasın
    if (saved.setupDone === undefined) data.setupDone = true;
    if (!Array.isArray(data.media)) data.media = [];
    // Eski kayıtlar: törende ses başlatma ayarı yoksa ekle
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
  } catch (e) {
    if (fs.existsSync(file)) {
      // Bozuk dosyayı yedekle, varsayılanlarla devam et.
      fs.copyFileSync(file, file + '.bozuk-' + Date.now());
    }
    data = structuredClone(defaults);
    save();
  }

  return {
    file,
    get: () => data,
    update(fn) {
      fn(data);
      save();
      return data;
    }
  };
}

module.exports = { createStore };
