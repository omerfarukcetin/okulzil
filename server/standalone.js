// Electron olmadan sadece sunucuyu çalıştırır (geliştirme ve deneme için).
// Pano: http://localhost:3000/pano/?audio=1   Panel: http://localhost:3000/panel/
const path = require('path');
const { startServer } = require('./server');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const port = Number(process.env.PORT) || 3000;
startServer({ dataDir, port, bundledSoundsDir: path.join(__dirname, '..', 'sounds') });
