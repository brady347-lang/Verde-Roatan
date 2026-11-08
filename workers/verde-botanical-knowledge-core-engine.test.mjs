import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './verde-botanical-knowledge-core-worker.js';

const env = {
  VERDE_PRIMARY_SUPABASE_URL: 'https://primary.test',
  VERDE_PRIMARY_SUPABASE_ANON_KEY: 'anon',
  VERDE_REVIEW_SUPABASE_URL: 'https://review.test',
  VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'service',
  VERDE_ADMIN_EMAILS: 'admin@test'
};
const ok = (body, status=200) => new Response(JSON.stringify(body), {status});
const request = (path, body={}, token='valid') => new Request('https://worker.test'+path, {
  method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{})}, body:JSON.stringify(body)
});

test('health exposes scheduler cadence without claiming Gemini is running', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.scheduler, '15-minute-queue-review');
  assert.equal(body.ai_used, false);
});

test('evidence enqueue requires authentication and validates the evidence contract', async () => {
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? ok({id:'user-1',email:'admin@test'}) : ok([]);
  const denied = await worker.fetch(request('/engine/enqueue', { evidence_type:'catalog_photo', evidence_fingerprint:'abc', submitted_payload:{} }, ''), env);
  assert.equal(denied.status, 401);
  const invalid = await worker.fetch(request('/engine/enqueue', { evidence_type:'unknown', evidence_fingerprint:'abc', submitted_payload:{} }), env);
  assert.equal(invalid.status, 400);
});

test('evidence enqueue is idempotent and reports duplicate fingerprints', async () => {
  globalThis.fetch = async (url, init={}) => {
    if (String(url).includes('/auth/v1/user')) return ok({id:'user-1',email:'admin@test'});
    assert.match(String(url), /botanical_evidence_queue/);
    assert.match(init.headers.Prefer, /resolution=ignore-duplicates/);
    return ok([]);
  };
  const response = await worker.fetch(request('/engine/enqueue', {
    evidence_type:'catalog_photo', source_record_id:'catalog-1', subject_key:'Dypsis lutescens',
    evidence_fingerprint:'sha256:unique-1', submitted_payload:{image_storage_path:'private/path.jpg'}
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.deduplicated, true);
});

test('scheduled cycle does not require Gemini when no evidence is queued', async () => {
  const calls=[];
  globalThis.fetch = async (url, init={}) => {
    calls.push({url:String(url),init});
    if (String(url).includes('botanical_evidence_queue')) return ok([]);
    if (String(url).includes('botanical_engine_runs')) return ok(null, 404);
    throw new Error('Unexpected upstream call: '+url);
  };
  let scheduledTask;
  await worker.scheduled({}, env, { waitUntil(p) { scheduledTask = p; } });
  assert.ok(scheduledTask, 'scheduled handler must register its work with waitUntil');
  await scheduledTask;
  assert.ok(calls.some(c=>c.url.includes('botanical_evidence_queue')));
  assert.ok(!calls.some(c=>/generativelanguage|gemini/i.test(c.url)));
});

test('only administrators may queue evidence', async () => {
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? ok({id:'customer-1',email:'customer@test'}) : ok([]);
  const response = await worker.fetch(request('/engine/enqueue', { evidence_type:'catalog_photo', evidence_fingerprint:'abc', submitted_payload:{} }), env);
  assert.equal(response.status, 403);
});

test('evidence photo paths must stay inside the private bucket', async () => {
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? ok({id:'a',email:'admin@test'}) : ok([]);
  for (const bad of ['../secret.jpg', '/etc/passwd', 'a//b.jpg', 'a/../b.jpg', 'x y.jpg', '']) {
    const response = await worker.fetch(request('/engine/enqueue', { evidence_type:'catalog_photo', evidence_fingerprint:'p'+bad, submitted_payload:{image_storage_path:bad} }), env);
    assert.equal(response.status, 400, 'path should be refused: ' + JSON.stringify(bad));
  }
});

test('cycle is a quiet no-op until the queue schema is installed', async () => {
  const calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return ok(null, 404); };
  let task;
  await worker.scheduled({}, env, { waitUntil(p) { task = p; } });
  await task;
  assert.ok(!calls.some(u => u.includes('botanical_engine_runs')), 'no failure record is written for a missing schema');
});

test('deploy config keeps one worker name and registers the 15-minute cron; schema has every column the worker writes', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const toml = readFileSync(new URL('../wrangler.knowledge-core.toml', import.meta.url), 'utf8');
  assert.match(toml, /name = "verde-botanical-knowledge-core-worker"/);
  assert.match(toml, /crons = \["\*\/15 \* \* \* \*"\]/);
  assert.equal(existsSync(new URL('../wrangler-knowledge-core.toml', import.meta.url)), false);
  const sql = readFileSync(new URL('../supabase/separate-review-db/rootwise_continuous_intelligence_schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /error_summary text/);
  assert.equal((sql.match(/\bcommit;/g) || []).length, 1);
});
