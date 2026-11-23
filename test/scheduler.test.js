// Basit testler: node test/scheduler.test.js
const assert = require('assert');
const defaults = require('../server/defaults.json');
const { buildDay } = require('../server/scheduler');

const cfg = structuredClone(defaults);
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('Pazartesi normal gün: öğretmen, öğrenci ve çıkış zilleri', () => {
  const d = buildDay(cfg, new Date(2026, 10, 23, 7, 0)); // 23 Kasım 2026 Pazartesi
  assert.ok(d.schoolDay);
  const bells = d.events.filter((e) => e.kind === 'bell');
  assert.strictEqual(bells.length, 8 * 3);
  assert.strictEqual(bells[0].time, '08:08');
  assert.strictEqual(bells[0].bell, 'teacher');
  assert.strictEqual(bells[1].time, '08:10');
  assert.ok(d.events.some((e) => e.kind === 'ceremony' && e.id === 'pzt' && e.time === '08:00'));
});

test('Cuma bayrak indirme son dersten sonra', () => {
  const d = buildDay(cfg, new Date(2026, 10, 27, 7, 0)); // Cuma
  const c = d.events.find((e) => e.kind === 'ceremony' && e.id === 'cuma');
  assert.strictEqual(c.time, '15:11');
});

test('Hafta sonu zil yok', () => {
  const d = buildDay(cfg, new Date(2026, 10, 28));
  assert.ok(!d.schoolDay);
  assert.strictEqual(d.events.length, 0);
});

test('10 Kasım hafta sonuna denk gelse de anma çalar', () => {
  const d = buildDay(cfg, new Date(2029, 10, 10)); // 10 Kasım 2029 Cumartesi
  assert.ok(!d.schoolDay);
  assert.ok(d.events.some((e) => e.id === 'kasim' && e.time === '09:05'));
});

test('Resmî tatilde zil susar', () => {
  const d = buildDay(cfg, new Date(2026, 9, 29)); // 29 Ekim 2026 Perşembe
  assert.ok(!d.schoolDay);
  assert.strictEqual(d.reason, 'Cumhuriyet Bayramı');
});

test('Uzun tatil aralığı', () => {
  const c = structuredClone(cfg);
  c.breaks = [{ from: '2027-01-18', to: '2027-01-29', name: 'Yarıyıl tatili' }];
  assert.ok(!buildDay(c, new Date(2027, 0, 20)).schoolDay);
  assert.ok(buildDay(c, new Date(2027, 0, 15)).schoolDay);
});

test('Bugüne özel kısaltılmış program', () => {
  const c = structuredClone(cfg);
  c.override = { date: '2026-11-24', program: 'kisa' };
  const d = buildDay(c, new Date(2026, 10, 24));
  assert.strictEqual(d.programId, 'kisa');
  assert.strictEqual(d.lessons[0].end, '08:40');
  assert.strictEqual(buildDay(c, new Date(2026, 10, 25)).programId, 'normal');
});

test('Teneffüs müziği öğretmen zilinde durur', () => {
  const d = buildDay(cfg, new Date(2026, 10, 23));
  const start = d.events.find((e) => e.kind === 'music' && e.action === 'start');
  const stop = d.events.find((e) => e.kind === 'music' && e.action === 'stop');
  assert.strictEqual(start.time, '08:51');
  assert.strictEqual(stop.time, '08:58');
});

test('Kapalı tören otomatik çalmaz', () => {
  const c = structuredClone(cfg);
  c.ceremonies.find((x) => x.id === 'pzt').mode = 'off';
  const d = buildDay(c, new Date(2026, 10, 23));
  assert.ok(!d.events.some((e) => e.id === 'pzt'));
});

console.log('\n' + passed + ' test geçti');
