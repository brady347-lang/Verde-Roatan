import assert from 'node:assert/strict';
import * as g from './gardenMemory.ts';

const row = g.toMemoryRow({ userId: 'u1', type: 'garden_plant', localId: 'p1', data: { name: 'Hibiscus' } });
assert.equal(row.user_id, 'u1'); assert.equal(row.payload.local_id, 'p1'); assert.equal(row.revision, 1);
assert.throws(() => g.toMemoryRow({ userId: '', type: 'garden_plant', localId: 'p', data: {} }));
assert.throws(() => g.toMemoryRow({ userId: 'u', type: 'secret', localId: 'p', data: {} }));
assert.throws(() => g.toMemoryRow({ userId: 'u', type: 'garden_observation', localId: 'o', data: { photo: 'data:image/jpeg;base64,AAAA' } }), /Inline image/);
assert.throws(() => g.toMemoryRow({ userId: 'u', type: 'garden_observation', localId: 'o', data: { note: 'x'.repeat(20000) } }), /too large/);
assert.equal(g.toMemoryRow({ userId: 'u', type: 'garden_observation', localId: 'o', data: { photo_path: 'u/abc.jpg' } }).payload.photo_path, 'u/abc.jpg');

// Merge: higher revision wins, tombstone wins, rows without local_id ignored
const a = { ...row, revision: 1 }; const b = { ...row, revision: 3, payload: { ...row.payload, name: 'Newer' } };
assert.equal(g.mergeMemory([a], [b])[0].payload.name, 'Newer');
assert.equal(g.mergeMemory([b], [a])[0].payload.name, 'Newer');
const tomb = { ...row, revision: 4, deleted_at: '2026-11-08T00:00:00Z' };
assert.equal(g.mergeMemory([b], [tomb])[0].deleted_at, '2026-11-08T00:00:00Z');
assert.equal(g.mergeMemory([{ ...row, payload: {} }], []).length, 0);

// Summary counts only real, live activity; empty garden = no activity (nothing fabricated)
assert.equal(g.summarizeGarden([]).hasActivity, false);
const s = g.summarizeGarden([row, tomb,
  g.toMemoryRow({ userId: 'u', type: 'light_reading', localId: 'l1', data: { lux: 900 }, measuredBy: 'sensor_measured' }),
  g.toMemoryRow({ userId: 'u', type: 'light_reading', localId: 'l2', data: { lux: 700 }, measuredBy: 'camera_estimated' })]);
assert.equal(s.plants, 1); assert.equal(s.lightReadings, 2); assert.equal(s.measuredLightReadings, 1);
console.log('Garden memory tests passed.');
