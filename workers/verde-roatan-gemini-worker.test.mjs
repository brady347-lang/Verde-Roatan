import worker from './verde-roatan-gemini-worker.js';
import assert from 'node:assert/strict';

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const env = { GEMINI_API_KEY: 'k' };
const calls = [];
const plant = { candidates: [{ common_name: 'Monstera', scientific_name: 'Monstera deliciosa', confidence_score: .9 }],
  verified_botanical_record: { common_name: 'Monstera', scientific_name: 'Monstera deliciosa', plant_family: 'Araceae', care: {} } };
const ok = (obj, fence=false) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: fence ? '```json\n'+JSON.stringify(obj)+'\n```' : JSON.stringify(obj) }] } }] }), { status: 200 });

function mock(handler) { globalThis.fetch = async (url, init) => { const m = String(url).match(/models\/([^:]+):/)[1]; calls.push(m); assert.ok(!String(url).includes('key='), 'key must not be in URL'); assert.equal(init.headers['x-goog-api-key'], 'k'); return handler(m, init); }; }
const post = (path, body, e = env) => worker.fetch(new Request('https://w.test' + path, { method: 'POST', body: JSON.stringify(body) }), e);
let n = 0; const t = async (name, fn) => { calls.length = 0; await fn(); console.log('ok', ++n, name); };

await t('health', async () => { const r = await worker.fetch(new Request('https://w.test/health'), env); assert.equal((await r.json()).status, 'ok'); });
await t('analyze falls back past 404 model and forces status=success (model omitted it)', async () => {
  mock((m) => m === 'gemini-3.8-flash' ? new Response('nf', { status: 404 }) : ok(plant));
  const r = await post('/', { mode: 'plant', image: IMG }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.status, 'success'); assert.equal(j.model_used, 'gemini-3-flash-preview');
  assert.equal(calls.length, 2); assert.ok(Array.isArray(j.verified_botanical_record.verified_images));
});
await t('analyze accepts fenced JSON', async () => { mock(() => ok(plant, true)); const j = await (await post('/', { image: IMG })).json(); assert.equal(j.status, 'success'); });
await t('pest mode', async () => { mock(() => ok({ result: { primary_diagnosis: 'Mealybugs' } })); const j = await (await post('/', { mode: 'pest', image: IMG })).json(); assert.equal(j.result.primary_diagnosis, 'Mealybugs'); assert.equal(j.status, 'success'); });
await t('refine route flags refined', async () => { mock(() => ok(plant)); const j = await (await post('/refine', { image: IMG, initialResult: plant })).json(); assert.equal(j.is_refined, true); assert.equal(j.status, 'success'); });
await t('/api/refine alias + garden advisor', async () => {
  mock(() => ok({ summary: 's', recommendations: [] }));
  assert.equal((await (await post('/api/refine', { image: IMG, initialResult: plant })).json()).status, 'success');
  const g = await (await post('/garden-advisor', { conditions: 'x', catalogItems: [] })).json(); assert.equal(g.status, 'success'); assert.equal(g.summary, 's');
});
await t('hung model is aborted and next model is used', async () => {
  mock((m, init) => m === 'gemini-3.8-flash' ? new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))) : ok(plant));
  const t0 = Date.now(); const j = await (await post('/', { image: IMG })).json();
  assert.equal(j.status, 'success'); assert.ok(Date.now() - t0 < 14000, 'stayed inside client timeout');
});
await t('all models fail -> 502 with readable error', async () => { mock(() => new Response('x', { status: 500 })); const r = await post('/', { image: IMG }); const j = await r.json(); assert.equal(r.status, 502); assert.equal(j.status, 'error'); assert.match(j.error, /Gemini/); });
await t('missing image -> 400', async () => { const r = await post('/', { mode: 'plant' }); assert.equal(r.status, 400); });
await t('missing API key -> 500 config error', async () => { const r = await post('/', { image: IMG }, {}); assert.equal(r.status, 500); });
await t('CORS preflight', async () => { const r = await worker.fetch(new Request('https://w.test/', { method: 'OPTIONS' }), env); assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), '*'); });
console.log('ALL', n, 'PASSED');
