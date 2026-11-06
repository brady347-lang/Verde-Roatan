import assert from 'node:assert/strict';
import worker from './verde-roatan-constitution-worker.js';

const env = { PRIMARY_SUPABASE_URL: 'https://main.test', PRIMARY_SUPABASE_ANON_KEY: 'anon', REVIEW_SUPABASE_URL: 'https://tv.test', REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'svc', VERDE_ADMIN_EMAILS: 'boss@x.com' };
let n = 0; const t = async (name, fn) => { await fn(); console.log('ok', ++n, name); };
const call = (path, body, { token = 'good', method = 'POST' } = {}) => worker.fetch(new Request('https://w.test' + path, { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }), env);

const A = '11111111-1111-4111-8111-111111111111';
function mock(db) {
  db.log = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const m = init.method || 'GET'; db.log.push({ url, m, body: init.body ? JSON.parse(init.body) : null });
    if (url.startsWith('https://main.test/auth/v1/user')) {
      const tok = init.headers.Authorization;
      if (tok === 'Bearer good') return new Response(JSON.stringify({ id: 'u1', email: 'boss@x.com' }), { status: 200 });
      if (tok === 'Bearer cust') return new Response(JSON.stringify({ id: 'u2', email: 'cust@x.com' }), { status: 200 });
      return new Response('{}', { status: 401 });
    }
    const ok = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (url.includes('/knowledge_entities?')) return ok(db.entities || []);
    if (url.includes('/identification_reviews?')) return ok(db.reviews || []);
    if (url.includes('/botanical_taxa?')) return ok(db.taxa || []);
    if (url.includes('/constitution_amendments?') && m === 'GET' && url.includes('signal_key=in.')) return ok(db.existing || []);
    if (url.includes('/constitution_amendments?') && m === 'GET' && url.includes('id=eq.')) return ok(db.amendment ? [db.amendment] : []);
    if (url.includes('/constitution_amendments?') && m === 'GET') return ok(db.amendments || []);
    if (url.includes('/constitution_amendments') && m === 'POST') return ok(JSON.parse(init.body), 201);
    if (url.includes('/constitution_amendments?') && m === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('/constitution_rules?rule_key=eq.')) return ok(db.clash ? [{ id: 'x' }] : []);
    if (url.includes('/constitution_rules?id=eq.') && m === 'GET') return ok(db.rule ? [db.rule] : []);
    if (url.includes('/constitution_rules?id=eq.') && m === 'PATCH') return ok([{ ...db.rule, ...JSON.parse(init.body) }]);
    if (url.includes('/constitution_rules?') && m === 'GET') return ok(db.rules || []);
    if (url.includes('/constitution_rules') && m === 'POST') return ok([{ id: A, ...JSON.parse(init.body) }], 201);
    if (url.includes('/constitution_rule_versions')) return new Response(null, { status: 201 });
    throw new Error('unexpected ' + m + ' ' + url);
  };
  return db;
}
const ents = (field, rejected, modified, approved) => [
  ...Array.from({ length: rejected }, (_, i) => ({ id: `r${i}`, field_name: field, approval_status: 'rejected' })),
  ...Array.from({ length: modified }, (_, i) => ({ id: `m${i}`, field_name: field, approval_status: 'modified' })),
  ...Array.from({ length: approved }, (_, i) => ({ id: `a${i}`, field_name: field, approval_status: 'approved' }))];

await t('public rules show only active rules, no sign-in needed, no secrets', async () => {
  mock({ rules: [{ rule_key: 'a', title: 'A', body: 'body body body', locked: true, active: true }, { rule_key: 'b', title: 'B', body: 'body body body', locked: false, active: false }] });
  const j = await (await call('/constitution/public', null, { method: 'GET', token: null })).json();
  assert.deepEqual(j.rules.map((r) => r.key), ['a']);
});
await t('every admin route rejects signed-out users and customers', async () => {
  mock({});
  for (const p of ['/constitution/rules', '/constitution/lessons', '/constitution/propose', '/constitution/amendments', '/constitution/decide', '/constitution/edit-rule']) {
    assert.equal((await call(p, {}, { token: null })).status, 401, p);
    assert.equal((await call(p, {}, { token: 'cust' })).status, 403, p);
  }
});
await t('lessons: a repeated extraction mistake is found; a rare one is ignored', async () => {
  mock({ entities: [...ents('water', 4, 3, 8), ...ents('sunlight', 1, 0, 30)], reviews: [] });
  const j = await (await call('/constitution/lessons', {})).json();
  assert.equal(j.signals.length, 1); assert.match(j.signals[0].title, /water/); assert.equal(j.signals[0].evidence.rejected, 4);
  assert.match(j.signals[0].body, /7 times out of 15/);
});
await t('lessons: customer doubt needs 3 DIFFERENT people (one person repeating is not enough)', async () => {
  const same = Array.from({ length: 6 }, (_, i) => ({ id: 'i' + i, ai_scientific_name: 'Monstera deliciosa', user_decision: 'not_my_plant', status: 'pending', submitted_by: 'p1' }));
  mock({ entities: [], reviews: same });
  assert.equal((await (await call('/constitution/lessons', {})).json()).signals.length, 0);
  const three = ['p1', 'p2', 'p3'].map((p, i) => ({ id: 'j' + i, ai_scientific_name: 'Monstera deliciosa', user_decision: 'almost', status: 'pending', submitted_by: p }));
  mock({ entities: [], reviews: three });
  const s = (await (await call('/constitution/lessons', {})).json()).signals;
  assert.equal(s.length, 1); assert.match(s[0].body, /hint only/);
});
await t('lessons: admin rejections alone can trigger (2 rejections)', async () => {
  mock({ entities: [], reviews: [1, 2].map((i) => ({ id: 'k' + i, ai_scientific_name: 'Ficus lyrata', user_decision: 'confirmed', status: 'rejected', submitted_by: 'p' + i })) });
  assert.equal((await (await call('/constitution/lessons', {})).json()).signals.length, 1);
});
await t('lessons: three distinct customer confirmations flag a missing taxonomy record for expert review', async () => {
  const reviews = ['p1', 'p2', 'p3'].map((person, i) => ({
    id: 'gap' + i, ai_scientific_name: 'Plumeria alba', user_decision: 'confirmed',
    status: 'pending', submitted_by: person
  }));
  mock({ entities: [], reviews, taxa: [] });
  const j = await (await call('/constitution/lessons', {})).json();
  const gap = j.signals.find((signal) => signal.signal_key.startsWith('taxonomy_coverage:'));
  assert.ok(gap);
  assert.match(gap.title, /Plumeria alba/);
  assert.match(gap.body, /not scientific verification/);
  assert.equal(j.stats.published_taxa, 0);
});

await t('propose: saves new proposals as PENDING add_rule, skips ones already proposed, never touches rules', async () => {
  const db = mock({ entities: ents('water', 5, 0, 5), reviews: [] });
  const j = await (await call('/constitution/propose', {})).json();
  assert.equal(j.created, 1);
  const post = db.log.find((c) => c.url.includes('/constitution_amendments') && c.m === 'POST');
  assert.equal(post.body[0].status, 'pending'); assert.equal(post.body[0].kind, 'add_rule');
  assert.ok(!db.log.some((c) => c.url.includes('/constitution_rules') && c.m !== 'GET'));
  const db2 = mock({ entities: ents('water', 5, 0, 5), reviews: [], existing: [{ signal_key: 'extraction_field:water:5' }] });
  assert.equal((await (await call('/constitution/propose', {})).json()).created, 0);
  assert.ok(!db2.log.some((c) => c.m === 'POST'));
});
await t('decide: approve add_rule creates an unlocked rule + version 1 history; admin can polish wording', async () => {
  const db = mock({ amendment: { id: A, kind: 'add_rule', status: 'pending', proposed_key: 'check_water', proposed_title: 'T title', proposed_body: 'original wording here', rationale: 'because' } });
  const j = await (await call('/constitution/decide', { amendment_id: A, decision: 'approve', body: 'polished wording here' })).json();
  assert.equal(j.decision, 'approved'); assert.equal(j.rule.locked, false); assert.equal(j.rule.body, 'polished wording here');
  assert.ok(db.log.some((c) => c.url.includes('constitution_rule_versions') && c.m === 'POST'));
  assert.ok(db.log.some((c) => c.url.includes('constitution_amendments?id=eq.') && c.m === 'PATCH' && c.body.status === 'approved' && c.body.decided_by === 'boss@x.com'));
});
await t('decide: reject changes no rule; deciding twice is refused', async () => {
  const db = mock({ amendment: { id: A, kind: 'add_rule', status: 'pending', proposed_title: 'T title', proposed_body: 'x'.repeat(20), rationale: 'r' } });
  assert.equal((await (await call('/constitution/decide', { amendment_id: A, decision: 'reject' })).json()).decision, 'rejected');
  assert.ok(!db.log.some((c) => c.url.includes('/constitution_rules') && c.m !== 'GET'));
  mock({ amendment: { id: A, kind: 'add_rule', status: 'approved' } });
  assert.equal((await call('/constitution/decide', { amendment_id: A, decision: 'approve' })).status, 409);
});
await t('locked core rules cannot be revised or edited', async () => {
  const locked = { id: A, rule_key: 'never_false_information', locked: true, version: 1, title: 'T title', body: 'body body body' };
  const db = mock({ rule: locked, amendment: { id: A, kind: 'revise_rule', status: 'pending', target_rule_id: A, proposed_title: 'weaker', proposed_body: 'a weaker rule text' , rationale: 'r' } });
  assert.equal((await call('/constitution/decide', { amendment_id: A, decision: 'approve' })).status, 409);
  assert.equal((await call('/constitution/edit-rule', { rule_id: A, body: 'something weaker than before' })).status, 409);
  assert.ok(!db.log.some((c) => c.url.includes('/constitution_rules') && ['PATCH', 'DELETE'].includes(c.m)));
});
await t('editing an unlocked rule bumps the version and keeps history', async () => {
  const db = mock({ rule: { id: A, rule_key: 'x_rule', locked: false, version: 2, title: 'Old title', body: 'old body text here' } });
  const j = await (await call('/constitution/edit-rule', { rule_id: A, body: 'new better wording here' })).json();
  assert.equal(j.rule.version, 3);
  assert.ok(db.log.some((c) => c.url.includes('constitution_rule_versions') && c.body.version === 3));
});
console.log(`ALL ${n} PASSED`);
