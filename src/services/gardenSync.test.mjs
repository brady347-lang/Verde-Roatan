import assert from 'node:assert/strict';
import * as gs from './gardenSync.ts';

const store = [];
const calls = [];
const fakeFetch = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET', headers: init.headers, body: init.body });
  if ((init.method || 'GET') === 'GET') return { ok: true, json: async () => store.map(r => ({ memory_type: r.memory_type, payload: r.payload, deleted_at: null })) };
  JSON.parse(init.body).forEach(r => store.push(r));
  return { ok: true, json: async () => [] };
};
const cfg = { baseUrl: 'https://x.supabase.co', apiKey: 'pub', accessToken: 'tok', userId: 'u1', fetchImpl: fakeFetch };
const item = (id, extra = {}) => ({ id, date: '2026-11-08', mode: 'plant', name: 'Hibiscus', photo: null, photoId: 'local-photo', data: { confidence: 0.8 }, ...extra });

// First push sends rows, never photos, scoped to the signed-in user
let r = await gs.pushGarden(cfg, [item('a'), item('b', { mode: 'pest' })]);
assert.deepEqual([r.ok, r.sent], [true, 2]);
assert.ok(store.every(row => row.user_id === 'u1'));
assert.deepEqual(store.map(x => x.memory_type), ['garden_plant', 'garden_observation']);
assert.ok(!JSON.stringify(store).includes('local-photo'));
assert.ok(calls.every(c => c.headers.Authorization === 'Bearer tok'));
assert.ok(calls[0].url.includes('user_id=eq.u1'));

// Second push does not duplicate
r = await gs.pushGarden(cfg, [item('a'), item('b', { mode: 'pest' }), item('c')]);
assert.equal(r.sent, 1); assert.equal(store.length, 3);

// Oversize / inline image items are skipped, not sent
r = await gs.pushGarden(cfg, [item('big', { data: { img: 'data:image/png;base64,AAA' } })]);
assert.equal(r.sent, 0); assert.equal(r.skipped, 1);

// Pull returns items without photos; merge keeps local photos and adds remote-only
const pulled = await gs.pullGarden(cfg);
assert.equal(pulled.items.length, 3); assert.equal(pulled.items[0].photo, null);
const merged = gs.mergeGardenItems([item('a', { photo: 'keep-me' })], pulled.items);
assert.equal(merged.length, 3); assert.equal(merged.find(m => m.id === 'a').photo, 'keep-me');

// Failure handling: server error and network error never throw
const bad = { ...cfg, fetchImpl: async () => ({ ok: false, status: 401 }) };
assert.equal((await gs.pullGarden(bad)).ok, false);
assert.equal((await gs.pushGarden(bad, [item('z')])).ok, false);
const down = { ...cfg, fetchImpl: async () => { throw new Error('offline'); } };
assert.equal((await gs.pullGarden(down)).error, 'offline');
console.log('Garden sync tests passed.');
