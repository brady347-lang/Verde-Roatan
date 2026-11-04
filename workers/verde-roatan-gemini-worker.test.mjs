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

// ---- Bulk botanical import routes ----
const impEnv = { GEMINI_API_KEY: 'k', PRIMARY_SUPABASE_URL: 'https://main.test', PRIMARY_SUPABASE_ANON_KEY: 'anon', REVIEW_SUPABASE_URL: 'https://tv.test', REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'svc', VERDE_ADMIN_EMAILS: 'boss@x.com' };
const authed = (path, body, token = 'tok', e = impEnv) => worker.fetch(new Request('https://w.test' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }), e);
function impMock({ user = { id: 'u1', email: 'boss@x.com' }, store = [] } = {}) {
  const log = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); log.push({ url, init });
    if (url.startsWith('https://main.test/auth/v1/user')) return init.headers.Authorization === 'Bearer tok' ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.startsWith('https://api.gbif.org/')) { const nm = decodeURIComponent(url.match(/name=([^&]+)/)[1]); return new Response(JSON.stringify(nm.startsWith('Zzz') ? { matchType: 'NONE' } : { matchType: 'EXACT', status: 'ACCEPTED', canonicalName: nm, family: 'Arecaceae', kingdom: 'Plantae', confidence: 99 }), { status: 200 }); }
    if (url.startsWith('https://tv.test/rest/v1/botanical_import_batches') && init.method === 'POST') return new Response(JSON.stringify([{ id: 'b1' }]), { status: 201 });
    if (url.startsWith('https://tv.test/rest/v1/botanical_import_batches') && init.method === 'PATCH') return new Response('', { status: 204 });
    if (url.startsWith('https://tv.test/rest/v1/botanical_taxa') && init.method === 'POST') {
      const rows = JSON.parse(init.body); const fresh = rows.filter((r) => !store.includes(r.name_key)); return new Response(JSON.stringify(fresh), { status: 201 });
    }
    if (url.startsWith('https://tv.test/rest/v1/botanical_taxa')) return new Response(JSON.stringify([{ scientific_name: 'Cocos nucifera', common_name: 'Coconut' }]), { status: 200 });
    if (url.includes('generativelanguage')) return ok({ mapping: { 'Nombre': 'common_name', 'Precio': 'common_name', 'Latin': 'scientific_name', 'Price': 'price', 'Bogus': 'not_a_field' } });
    throw new Error('unexpected fetch ' + url);
  };
  return log;
}
await t('import: no token -> 401, non-admin -> 403', async () => {
  impMock(); let r = await worker.fetch(new Request('https://w.test/botanical-import/commit', { method: 'POST', body: '{}' }), impEnv); assert.equal(r.status, 401);
  impMock({ user: { id: 'u2', email: 'cust@x.com' } }); r = await authed('/botanical-import/commit', { rows: [{}] }); assert.equal(r.status, 403);
});
await t('import: admin via allow-list or app_metadata role; existing list returned', async () => {
  impMock(); let j = await (await authed('/botanical-import/existing', {})).json(); assert.equal(j.records[0].scientific_name, 'Cocos nucifera');
  impMock({ user: { id: 'u3', email: 'other@x.com', app_metadata: { role: 'admin' } } }); assert.equal((await authed('/botanical-import/existing', {})).status, 200);
});
await t('import: GBIF validation flags unknown names; failures never block', async () => {
  impMock(); const j = await (await authed('/botanical-import/validate', { names: ['Cocos nucifera', 'Zzz fake'] })).json();
  assert.equal(j.results[0].match, 'EXACT'); assert.equal(j.results[1].match, 'NONE');
  globalThis.fetch = async (u) => String(u).includes('main.test') ? new Response(JSON.stringify({ id: 'u1', email: 'boss@x.com' })) : Promise.reject(new Error('offline'));
  assert.equal((await (await authed('/botanical-import/validate', { names: ['Cocos nucifera'] })).json()).results[0].match, 'UNAVAILABLE');
});
await t('import: commit inserts new rows, skips existing, whitelists fields, never overwrites', async () => {
  const log = impMock({ store: ['cocos nucifera'] });
  const rows = [
    { scientific_name: 'Cocos nucifera', common_name: 'Coconut' },
    { scientific_name: 'Plumeria rubra', common_name: 'Frangipani', family: 'Apocynaceae', price: 99, stock_quantity: 5, supplier: 'X', reference_photo_url: 'http://insecure/x.jpg' },
    { scientific_name: 'Plumeria rubra', common_name: 'dup in payload' },
    { scientific_name: 'Rosa', common_name: 'no species' }
  ];
  const j = await (await authed('/botanical-import/commit', { filename: 'f.csv', rows })).json();
  assert.equal(j.status, 'success'); assert.equal(j.inserted, 1); assert.equal(j.skipped, 3);
  assert.ok(j.rejected.some((r) => /Already exists/.test(r.reason))); assert.ok(j.rejected.some((r) => /Duplicate inside/.test(r.reason))); assert.ok(j.rejected.some((r) => /Needs a scientific/.test(r.reason)));
  const post = log.find((l) => l.url.includes('/botanical_taxa') && l.init.method === 'POST');
  assert.match(post.init.headers.Prefer, /ignore-duplicates/); assert.ok(!post.init.headers.Prefer.includes('merge'));
  const sent = JSON.parse(post.init.body); const plum = sent.find((r) => r.name_key === 'plumeria rubra');
  for (const bad of ['price', 'stock_quantity', 'supplier']) assert.ok(!(bad in plum), bad);
  assert.equal(plum.reference_photo_url, null); assert.equal(plum.verification_status, 'unverified'); assert.equal(plum.created_by_email, 'boss@x.com');
  assert.ok(!log.some((l) => l.init.method === 'DELETE' || (l.url.includes('/botanical_taxa') && l.init.method === 'PATCH')));
});
await t('import: size cap and empty payload rejected', async () => {
  impMock(); assert.equal((await authed('/botanical-import/commit', { rows: [] })).status, 400);
  assert.equal((await authed('/botanical-import/commit', { rows: Array(501).fill({ scientific_name: 'A b', common_name: 'c' }) })).status, 400);
});
await t('import: AI column mapping is sanitised to allowed fields, one use each', async () => {
  impMock(); const j = await (await authed('/botanical-import/map-columns', { headers: ['Nombre', 'Precio', 'Latin', 'Price', 'Bogus'], sample: [['a', '1', 'b', '2', 'c']] })).json();
  assert.equal(j.mapping['Nombre'], 'common_name'); assert.equal(j.mapping['Precio'], null); assert.equal(j.mapping['Latin'], 'scientific_name');
  assert.equal(j.mapping['Price'], null); assert.equal(j.mapping['Bogus'], null);
});
console.log('ALL', n, 'PASSED');
