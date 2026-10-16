import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync('public/voyage-db.js', 'utf8');
function harness(status = 200) {
  let now = 0;
  const calls = [], timers = [], listeners = {};
  const document = { hidden: false, addEventListener() {} };
  const window = { addEventListener(n, cb) { listeners[n] = cb; }, dispatchEvent() {} };
  vm.runInNewContext(source, { window, document, Date: { now: () => now }, Set, URLSearchParams,
    CustomEvent: class {}, crypto: { randomUUID: () => 'id' },
    setInterval(fn, ms) { timers.push({ fn, ms, next: ms }); return timers.length; }, clearInterval() {},
    fetch: async (path, options) => { calls.push({ path, options }); return { status, ok: status === 200,
      json: async () => path === '/api/me' ? { role: 'editor' } : { exists: true, data: {}, docs: [], peers: [] } }; },
  });
  return { window, document, calls, async settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); },
    async advance(ms) { const end = now + ms; while (true) { const next = Math.min(...timers.map(t => t.next)); if (next > end) break; now = next; for (const t of timers) if (t.next === now) { t.next += t.ms; t.fn(); } await this.settle(); } now = end; }, listeners };
}
test('16 feeds stop when idle, stay bounded when active, and stop hidden', async () => {
  const h = harness(); await h.window.voyageDb.init();
  for (let i = 0; i < 16; i++) h.window.voyageDb.collection('feed' + i).onSnapshot(() => {});
  await h.settle(); assert.equal(h.calls.length, 17);
  await h.advance(3600000); assert.equal(h.calls.length, 17);
  h.listeners.pointerdown(); await h.advance(60000); assert.equal(h.calls.length, 17); // now idle again
  for (let i = 0; i < 60; i++) { h.listeners.pointermove(); await h.advance(10000); }
  assert.ok(h.calls.length <= 177); // <=16 reads/minute, previously330/minute
  const before = h.calls.length; h.document.hidden = true;
  await h.advance(3600000); assert.equal(h.calls.length, before);
});
test('quota circuit breaker stops further subscriptions and retries', async () => {
  const h = harness(429);
  await assert.rejects(h.window.voyageDb.init(), /limit reached/);
  h.window.voyageDb.collection('opps').onSnapshot(() => {});
  for (let i = 0; i < 60; i++) { h.listeners.pointerdown(); await h.advance(60000); }
  assert.equal(h.calls.length, 1);
});
test('a write only refreshes matching feeds', async () => {
  const h = harness(); await h.window.voyageDb.init();
  h.window.voyageDb.collection('opps').onSnapshot(() => {});
  h.window.voyageDb.collection('contacts').onSnapshot(() => {});
  await h.settle(); h.calls.length = 0;
  await h.window.voyageDb.collection('opps').doc('one').update({ name: 'test' }); await h.settle();
  assert.deepEqual(h.calls.map(c => c.path), ['/api/document/opps/one', '/api/collection/opps']);
});
test('custom endpoint refresh remains usable', async () => {
  const h = harness(); await h.window.voyageDb.init();
  h.window.voyageDb.collection('deals').onSnapshot(() => {}); await h.settle();
  h.calls.length = 0; h.window.voyageDb.refresh(); await h.settle();
  assert.equal(h.calls.length, 1);
});
test('presence and data stop offline and while hidden', async () => {
  const h = harness(); await h.window.voyageDb.init();
  h.window.voyageRoom.onPeers(() => {}); await h.settle();
  const before = h.calls.length;
  h.listeners.offline();
  for (let i = 0; i < 12; i++) { h.listeners.pointerdown(); await h.advance(10000); }
  assert.equal(h.calls.length, before);
  h.listeners.online(); h.document.hidden = true;
  await h.advance(60000); assert.equal(h.calls.length, before);
});

test('background startup loads exactly one initial snapshot per feed and then stays quiet', async () => {
 const h=harness();h.document.hidden=true;await h.window.voyageDb.init();let loaded=0;
 for(let i=0;i<8;i++)h.window.voyageDb.collection('boot'+i).onSnapshot(()=>loaded++);
 await h.settle();assert.equal(loaded,8);assert.equal(h.calls.length,9);
 await h.advance(3600000);assert.equal(h.calls.length,9);
});
