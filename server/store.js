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
    if (!Array.isArray(data.media)) data.media = [];
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
