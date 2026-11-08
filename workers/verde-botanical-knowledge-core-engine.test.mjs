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

test('authenticated customers may submit their own evidence without granting approval', async () => {
  let inserted;
  globalThis.fetch = async (url, init={}) => {
    if (String(url).includes('/auth/v1/user')) return ok({id:'customer-1',email:'customer@test'});
    inserted = JSON.parse(init.body);
    return ok([{id:'queue-1'}]);
  };
  const response = await worker.fetch(request('/engine/enqueue', {
    evidence_type:'catalog_photo', evidence_fingerprint:'customer-photo-1',
    submitted_payload:{image_storage_path:'customer-1/photo.jpg'}
  }), env);
  assert.equal(response.status, 200);
  assert.equal(inserted.verification_status, 'community_submitted');
  assert.equal(inserted.status, 'pending');
});

test('authenticated customers cannot queue another users private photo', async () => {
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? ok({id:'customer-1',email:'customer@test'}) : ok([]);
  const response = await worker.fetch(request('/engine/enqueue', {
    evidence_type:'catalog_photo', evidence_fingerprint:'foreign-photo',
    submitted_payload:{image_storage_path:'other-user/photo.jpg'}
  }), env);
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


test('one administrator approval makes evidence immediately retrievable without scientific verification', async () => {
  const calls=[];
  globalThis.fetch = async (url, init={}) => {
    const target=String(url); calls.push({target,init});
    if (target.includes('/auth/v1/user')) return ok({id:'admin-1',email:'admin@test'});
    if (target.includes('botanical_evidence_queue?id=eq.evidence-1')) {
      if (init.method === 'PATCH') {
        const patch=JSON.parse(init.body);
        assert.equal(patch.status,'admin_approved');
        assert.equal(patch.approval_status,'admin_approved');
        assert.equal(patch.verification_status,'community_submitted');
        assert.equal(patch.approved_by,'admin-1');
        return ok([{id:'evidence-1',...patch}]);
      }
      return ok([{id:'evidence-1',status:'needs_review',approval_status:'pending',verification_status:'community_submitted',subject_key:'Hibiscus rosa-sinensis',submitted_payload:{common_name:'Chinese hibiscus'}}]);
    }
    throw new Error('Unexpected upstream call: '+target);
  };
  const response=await worker.fetch(request('/engine/admin/review',{evidence_id:'00000000-0000-4000-8000-000000000001',decision:'approve',note:'Reviewed by administrator'}),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.immediately_retrievable,true);
  assert.equal(body.verification_status,'community_submitted');
  assert.ok(calls.some(c=>c.init.method==='PATCH'));
});

test('community support counts unique authenticated users and never publishes by itself', async () => {
  const supporters=new Set();
  globalThis.fetch=async (url,init={})=>{
    const target=String(url);
    if(target.includes('/auth/v1/user')) {
      const token=String(init.headers.Authorization||'').replace('Bearer ','');
      return ok({id:token,email:token+'@test'});
    }
    if(target.includes('botanical_evidence_queue?id=eq.')) return ok([{id:'evidence-2',approval_status:'pending'}]);
    if(target.includes('botanical_evidence_votes?on_conflict=')) {
      const vote=JSON.parse(init.body); supporters.add(vote.user_id); return ok([{id:'vote'}]);
    }
    if(target.includes('botanical_evidence_votes?evidence_id=')) return ok([...supporters].map(user_id=>({user_id})));
    throw new Error('Unexpected upstream call: '+target);
  };
  for (const token of ['user-a','user-a','user-b','user-c']) {
    const response=await worker.fetch(request('/engine/vote',{evidence_id:'00000000-0000-4000-8000-000000000002',vote:'support'},token),env);
    const body=await response.json();
    assert.equal(response.status,200);
    if(token==='user-c') {
      assert.equal(body.distinct_supporters,3);
      assert.equal(body.community_threshold_reached,true);
      assert.equal(body.requires_admin_approval_for_retrieval,true);
    }
  }
  assert.equal(supporters.size,3);
});

test('schema separates admin approval from verification and enforces one community vote per user', async () => {
  const {readFileSync}=await import('node:fs');
  const sql=readFileSync(new URL('../supabase/separate-review-db/rootwise_continuous_intelligence_schema.sql',import.meta.url),'utf8');
  assert.match(sql,/approval_status text not null default 'pending'/);
  assert.match(sql,/approved_by uuid/);
  assert.match(sql,/unique \(evidence_id, user_id\)/);
  assert.match(sql,/'admin_approved'/);
});
