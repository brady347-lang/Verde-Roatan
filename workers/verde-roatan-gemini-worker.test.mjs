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
    if (url.startsWith('https://tv.test/rest/v1/botanical_import_batches') && init.method === 'PATCH') return new Response(null, { status: 204 });
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

// ---- Botanical Knowledge Center routes ----
const DOC = '11111111-1111-4111-8111-111111111111';
const vec = () => Array(768).fill(0.01);
function kMock(state = {}) {
  const log = []; state.docs ??= {}; state.chunks ??= []; state.entities ??= [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const method = init.method || 'GET'; log.push({ url, method, init });
    const J = (o, st = 200, h = {}) => new Response(JSON.stringify(o), { status: st, headers: h });
    if (url.startsWith('https://main.test/auth/v1/user')) return init.headers.Authorization === 'Bearer tok' ? J({ id: 'u1', email: 'boss@x.com' }) : J({}, 401);
    if (url.includes(':batchEmbedContents')) { if (state.embedFail) return J({}, 500); return J({ embeddings: JSON.parse(init.body).requests.map(() => ({ values: vec() })) }); }
    if (url.includes(':generateContent')) { state.genCalls = (state.genCalls || 0) + 1; return J({ candidates: [{ content: { parts: [{ text: JSON.stringify(state.genReply || {}) }] } }] }); }
    if (url.includes('/storage/v1/object/sign/')) return J({ signedURL: '/object/sign/botanical-documents/x?token=t' });
    if (url.includes('/storage/v1/object/botanical-documents/')) return J({ Key: 'ok' });
    if (url.includes('/rest/v1/rpc/match_knowledge_chunks')) { state.rpcBody = JSON.parse(init.body); return J(state.hits || []); }
    if (url.includes('/rest/v1/knowledge_documents')) {
      if (method === 'POST') { const d = { id: DOC, status: 'uploaded', ...JSON.parse(init.body) }; state.docs[DOC] = d; return J([d], 201); }
      if (method === 'PATCH') { Object.assign(state.docs[DOC] || {}, JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      if (url.includes('content_sha256=eq.')) { const sha = url.match(/eq\.([0-9a-f]+)/)[1]; const d = Object.values(state.docs).find((x) => x.content_sha256 === sha); return J(d ? [d] : []); }
      return J(state.docs[DOC] ? [state.docs[DOC]] : []);
    }
    if (url.includes('/rest/v1/knowledge_chunks')) {
      if (method === 'POST') { state.chunks.push(...JSON.parse(init.body)); return new Response('', { status: 201 }); }
      if (method === 'DELETE') { state.chunks = []; return new Response(null, { status: 204 }); }
      if (url.includes('embedding=is.null')) return new Response('[]', { status: 200, headers: { 'content-range': `*/${state.missing || 0}` } });
      if (url.includes('select=id')) return new Response('[]', { status: 200, headers: { 'content-range': `0-0/${state.chunks.length}` } });
      if (url.includes('chunk_index.desc')) return J(state.chunks.length ? [{ chunk_index: state.chunks.length - 1 }] : []);
      return J(state.chunks);
    }
    if (url.includes('/rest/v1/knowledge_entities')) {
      if (method === 'POST') { state.entities.push(...JSON.parse(init.body)); return new Response('', { status: 201 }); }
      if (method === 'DELETE') { state.entities = []; return new Response(null, { status: 204 }); }
      if (method === 'PATCH') { state.entityPatches = [...(state.entityPatches || []), JSON.parse(init.body)]; return new Response(null, { status: 204 }); }
      return J(state.entities);
    }
    throw new Error('unexpected fetch ' + method + ' ' + url);
  };
  state.log = log; return state;
}
const pdfBytes = (txt = 'hello') => new TextEncoder().encode('%PDF-1.4 ' + txt);
const upload = (bytes, name = 'a.pdf', token = 'tok') => worker.fetch(new Request('https://w.test/knowledge/upload?name=' + name, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: bytes }), impEnv);

await t('knowledge: upload rejects non-admin, non-PDF, oversize; stores a PDF; detects duplicates by hash', async () => {
  const st = kMock(); assert.equal((await upload(pdfBytes(), 'a.pdf', 'bad')).status, 401);
  assert.equal((await upload(new TextEncoder().encode('not a pdf'))).status, 400);
  assert.equal((await upload(new Uint8Array(21 * 1024 * 1024))).status, 413);
  const ok1 = await (await upload(pdfBytes('one'))).json(); assert.equal(ok1.duplicate, false); assert.equal(ok1.document.id, DOC);
  assert.ok(st.log.some((l) => l.url.includes('/storage/v1/object/botanical-documents/') && l.init.headers['Content-Type'] === 'application/pdf'));
  const again = await (await upload(pdfBytes('one'))).json(); assert.equal(again.duplicate, true);
});
await t('knowledge: ingest chunks pages, embeds 768-dim vectors, marks failed when no text', async () => {
  const st = kMock({ docs: { [DOC]: { id: DOC, status: 'uploaded', storage_path: 'p.pdf' } } });
  const long = ('Cocos nucifera is a palm. ').repeat(120);
  const j = await (await authed('/knowledge/ingest', { document_id: DOC, pages: [{ page: 1, text: long }, { page: 2, text: 'Short page about Plumeria rubra frangipani flowers.' }], page_count: 2, final: true })).json();
  assert.equal(j.status, 'success', JSON.stringify(j)); assert.ok(st.chunks.length >= 3); assert.ok(st.chunks.every((c) => c.embedding.startsWith('[') && c.embedding.split(',').length === 768));
  assert.equal(st.docs[DOC].stage, 'text_indexed'); assert.equal(st.docs[DOC].page_count, 2);
  const st2 = kMock({ docs: { [DOC]: { id: DOC, status: 'uploaded' } } });
  const j2 = await (await authed('/knowledge/ingest', { document_id: DOC, pages: [{ page: 1, text: '   ' }], final: true })).json();
  assert.equal(st2.docs[DOC].status, 'failed'); assert.match(st2.docs[DOC].error_message, /Scanned PDFs/); assert.equal(j2.status, 'success');
});
await t('knowledge: embedding failure marks the document failed with a readable error', async () => {
  const st = kMock({ embedFail: true, docs: { [DOC]: { id: DOC, status: 'uploaded' } } });
  const r = await authed('/knowledge/ingest', { document_id: DOC, pages: [{ page: 1, text: 'Cocos nucifera grows on beaches of the Caribbean coast.' }] });
  assert.equal(r.status, 502); assert.equal(st.docs[DOC].status, 'failed'); assert.match(st.docs[DOC].error_message, /embedding/i);
});
await t('knowledge: extract keeps only entities whose quoted evidence is in the text; category set by server', async () => {
  const st = kMock({ docs: { [DOC]: { id: DOC, status: 'processing' } }, chunks: [{ chunk_index: 0, page_number: 3, content: 'Cocos nucifera tolerates salt spray and prefers full sun on sandy soils.' }],
    genReply: { entities: [
      { field_name: 'sunlight', scientific_name: 'Cocos nucifera', value: 'full sun', confidence: 0.9, page: 3, snippet: 'prefers full sun on sandy soils' },
      { field_name: 'toxicity', scientific_name: 'Cocos nucifera', value: 'toxic to dogs', confidence: 0.9, page: 3, snippet: 'highly toxic to dogs and cats' },
      { field_name: 'price', scientific_name: 'Cocos nucifera', value: '5', confidence: 1, page: 3, snippet: 'Cocos nucifera tolerates salt spray' } ] } });
  const j = await (await authed('/knowledge/extract', { document_id: DOC })).json();
  assert.equal(j.entities, 1); assert.equal(st.entities[0].category, 'horticulture'); assert.equal(st.entities[0].approval_status, undefined);
  assert.equal(st.docs[DOC].status, 'awaiting_review');
});
await t('knowledge: extract without AI key still moves to review with a warning (AI optional)', async () => {
  const st = kMock({ docs: { [DOC]: { id: DOC, status: 'processing' } }, chunks: [{ chunk_index: 0, page_number: 1, content: 'Some indexed text about palms.' }] });
  const j = await (await authed('/knowledge/extract', { document_id: DOC }, 'tok', { ...impEnv, GEMINI_API_KEY: undefined })).json();
  assert.equal(j.entities, 0); assert.match(j.warning, /unavailable/); assert.equal(st.docs[DOC].status, 'awaiting_review');
});
await t('knowledge: approve requires awaiting_review + full embeddings; sets rag_indexed; reject clears it', async () => {
  let st = kMock({ docs: { [DOC]: { id: DOC, status: 'processing', chunks_count: 3 } } });
  assert.equal((await authed('/knowledge/review', { document_id: DOC, action: 'approve' })).status, 409);
  st = kMock({ docs: { [DOC]: { id: DOC, status: 'awaiting_review', chunks_count: 3 } }, missing: 2 });
  assert.equal((await authed('/knowledge/review', { document_id: DOC, action: 'approve' })).status, 409); assert.notEqual(st.docs[DOC].status, 'approved');
  st = kMock({ docs: { [DOC]: { id: DOC, status: 'awaiting_review', chunks_count: 3 } } });
  const j = await (await authed('/knowledge/review', { document_id: DOC, action: 'approve', visibility: 'public', citation: 'Kew 2020', entity_decisions: [{ id: DOC, status: 'approved' }] })).json();
  assert.equal(j.document_status, 'approved'); assert.equal(st.docs[DOC].rag_indexed, true); assert.equal(st.docs[DOC].visibility, 'public'); assert.equal(st.docs[DOC].reviewed_by_email, 'boss@x.com');
  await authed('/knowledge/review', { document_id: DOC, action: 'reject' }); assert.equal(st.docs[DOC].rag_indexed, false); assert.equal(st.docs[DOC].status, 'rejected');
});
await t('knowledge: retry clears chunks/entities and resets; refuses approved docs', async () => {
  let st = kMock({ docs: { [DOC]: { id: DOC, status: 'failed', storage_path: 'p.pdf' } }, chunks: [{}], entities: [{}] });
  const j = await (await authed('/knowledge/retry', { document_id: DOC })).json();
  assert.equal(st.chunks.length, 0); assert.equal(st.entities.length, 0); assert.equal(st.docs[DOC].status, 'uploaded'); assert.ok(j.pdf_url.includes('token=t'));
  st = kMock({ docs: { [DOC]: { id: DOC, status: 'approved' } } }); assert.equal((await authed('/knowledge/retry', { document_id: DOC })).status, 409);
});
await t('knowledge: document view returns a signed URL for the original PDF', async () => {
  kMock({ docs: { [DOC]: { id: DOC, status: 'awaiting_review', storage_path: '2026/x.pdf' } } });
  const j = await (await authed('/knowledge/document', { document_id: DOC })).json(); assert.ok(j.pdf_url.startsWith('https://tv.test/storage/v1/object/sign/'));
});
await t('knowledge: ask answers only from retrieved sources and cites them; no hits -> no model call', async () => {
  let st = kMock({ hits: [] });
  let j = await (await authed('/knowledge/ask', { question: 'How much sun does a coconut palm need?' })).json();
  assert.equal(j.answered, false); assert.equal(st.genCalls || 0, 0);
  st = kMock({ hits: [{ document_id: DOC, original_name: 'Palms.pdf', citation: 'Kew 2020', page_number: 3, content: 'Cocos nucifera prefers full sun.', similarity: 0.82 }], genReply: { answer: 'Full sun [1].', used: [1, 9] } });
  j = await (await authed('/knowledge/ask', { question: 'How much sun does a coconut palm need?' })).json();
  assert.equal(j.answered, true); assert.equal(j.sources.length, 1); assert.equal(j.sources[0].used, true); assert.equal(j.sources[0].page, 3); assert.equal(st.rpcBody.query_embedding.split(',').length, 768);
  assert.equal(st.rpcBody.include_private, true);
});
await t('knowledge: all knowledge routes reject non-admins', async () => {
  kMock({ docs: { [DOC]: { id: DOC } } });
  for (const r of ['list', 'document', 'review', 'retry', 'ingest', 'extract', 'ask', 'mark-failed']) assert.equal((await authed('/knowledge/' + r, { document_id: DOC, question: 'abc' }, 'bad')).status, 401, r);
});

// ---- Public botanical intelligence (no AI) ----
await t('botanical search/care: public, no AI key needed, validated inputs, PostgreSQL functions only', async () => {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => { url = String(url); seen.push({ url, body: init.body && JSON.parse(init.body) });
    if (url.includes('/rpc/botanical_search')) return new Response(JSON.stringify([{ id: DOC, scientific_name: 'Cocos nucifera', rank: 1 }]), { status: 200 });
    if (url.includes('/rpc/botanical_care')) return new Response(JSON.stringify(JSON.parse(init.body).p_id === DOC ? { id: DOC, missing: ['soil'] } : null), { status: 200 });
    throw new Error('unexpected ' + url); };
  const noAi = { REVIEW_SUPABASE_URL: 'https://tv.test', REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  let j = await (await post('/botanical/search', { q: ' coco ', sun: 'full', water: 'EVIL', min_salt: 9, pet_safe: true, limit: 999 }, noAi)).json();
  assert.equal(j.status, 'success'); assert.equal(j.ai_used, false);
  const p = seen[0].body; assert.equal(p.q, 'coco'); assert.equal(p.p_sun, 'full'); assert.equal(p.p_water, null); assert.equal(p.p_min_salt, null); assert.equal(p.p_pet_safe, true); assert.equal(p.lim, 25);
  j = await (await post('/botanical/care', { id: DOC }, noAi)).json(); assert.deepEqual(j.care.missing, ['soil']);
  assert.equal((await post('/botanical/care', { id: '22222222-2222-4222-8222-222222222222' }, noAi)).status, 404);
  assert.equal((await post('/botanical/care', { id: 'x' }, noAi)).status, 400);
  assert.equal((await post('/botanical/search', { q: 'a' }, {})).status, 503);
});
console.log('ALL', n, 'PASSED');
