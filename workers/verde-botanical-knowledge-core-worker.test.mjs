import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './verde-botanical-knowledge-core-worker.js';

const USER = '11111111-1111-4111-8111-111111111111';
const RECORD = '22222222-2222-4222-8222-222222222222';
const SUMMARY = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const ACTIVE_RULES = [
  { rule_key: 'approved_sources_only', title: 'Approved sources only' },
  { rule_key: 'cite_the_source', title: 'Cite the source' },
  { rule_key: 'never_false_information', title: 'Never give false information' },
  { rule_key: 'three_verification_levels', title: 'Three verification levels' },
  { rule_key: 'community_stays_separate', title: 'Community data stays separate' },
  { rule_key: 'humans_decide', title: 'Humans decide' },
  { rule_key: 'safety_first', title: 'Safety first' }
];
const env = {
  VERDE_PRIMARY_SUPABASE_URL: 'https://primary.test',
  VERDE_PRIMARY_SUPABASE_ANON_KEY: 'public-key',
  VERDE_REVIEW_SUPABASE_URL: 'https://review.test',
  VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  VERDE_ADMIN_EMAILS: 'admin@verde.test'
};
const ok = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const user = (email = 'admin@verde.test', appRole) => ({ id: USER, email, app_metadata: appRole ? { role: appRole } : {} });
function request(path, body = {}, token = 'valid-token') {
  return new Request('https://worker.test' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body)
  });
}
function setup(handler, currentUser = user()) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push({ url, init });
    if (url === env.VERDE_PRIMARY_SUPABASE_URL + '/auth/v1/user') return currentUser ? ok(currentUser) : ok({ message: 'bad token' }, 401);
    return handler(url, init, calls);
  };
  return calls;
}

test('health endpoint is available without database bindings and never advertises Gemini', async () => {
  const r = await worker.fetch(new Request('https://worker.test/health'), {});
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ai_used, false);
});

test('pest/disease evidence submission is private, pending and community-submitted', async () => {
  const calls = setup((url, init) => {
    if (url.includes('/storage/v1/object/botanical-health-evidence/')) return ok({});
    if (url.includes('/rest/v1/botanical_health_records') && init.method === 'POST') {
      const row = JSON.parse(init.body);
      assert.equal(row.record_type, 'pest');
      assert.equal(row.review_status, 'pending');
      assert.equal(row.verification_status, 'community_submitted');
      assert.equal(row.rag_indexed, false);
      assert.equal(row.visibility, 'private');
      assert.equal(row.submitted_by, USER);
      return ok([row], 201);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/health/submit', {
    record_type: 'pest', common_name: 'Scale insect', scientific_name: 'Coccus sp.',
    symptoms: 'Sticky honeydew on leaves', image: 'data:image/png;base64,YWJj'
  }), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.review_status, 'pending');
  assert.ok(calls.some(c => c.url.includes('/storage/v1/object/botanical-health-evidence/')));
  assert.ok(!calls.some(c => /generativelanguage|gemini/i.test(c.url)));
});

test('health submission rejects invalid record type and malformed images', async () => {
  setup(() => { throw new Error('No database request expected'); });
  let r = await worker.fetch(request('/health/submit', { record_type: 'plant', common_name: 'Hibiscus', image: 'data:image/png;base64,YWJj' }), env);
  assert.equal(r.status, 400);
  r = await worker.fetch(request('/health/submit', { record_type: 'disease', common_name: 'Leaf spot', image: 'bad' }), env);
  assert.equal(r.status, 400);
});

test('admin can create a first-class pest or disease knowledge record without publishing it', async () => {
  setup((url, init) => {
    if (url.includes('/rest/v1/botanical_health_records') && init.method === 'POST') {
      const row = JSON.parse(init.body);
      assert.equal(row.record_type, 'disease');
      assert.equal(row.common_name, 'Anthracnose');
      assert.equal(row.review_status, 'pending');
      assert.equal(row.rag_indexed, false);
      assert.equal(row.visibility, 'private');
      return ok([row], 201);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/health/admin/create', {
    record_type: 'disease', common_name: 'Anthracnose', symptoms: 'Dark lesions on leaves',
    treatment: 'Treatment pending source review'
  }), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).record.review_status, 'pending');
});

test('health admin queue rejects non-admin users', async () => {
  setup(() => { throw new Error('No database request expected'); }, user('customer@verde.test'));
  const r = await worker.fetch(request('/health/admin/list'), env);
  assert.equal(r.status, 403);
});

test('health review cannot scientifically verify without a written basis', async () => {
  setup((url, init) => {
    if (url.includes('/rest/v1/botanical_health_records?id=eq.' + RECORD) && (!init.method || init.method === 'GET')) {
      return ok([{ id: RECORD, review_status: 'pending', verification_status: 'community_submitted' }]);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/health/admin/review', {
    record_id: RECORD, status: 'approved', verification_status: 'scientifically_verified'
  }), env);
  assert.equal(r.status, 400);
});

test('scientific verification also requires a source reference', async () => {
  setup((url, init) => {
    if (url.includes('/rest/v1/botanical_health_records?id=eq.' + RECORD) && (!init.method || init.method === 'GET')) {
      return ok([{ id: RECORD, review_status: 'pending', verification_status: 'community_submitted' }]);
    }
    throw new Error('No update should run without a source reference: ' + url);
  });
  const r = await worker.fetch(request('/health/admin/review', {
    record_id: RECORD, status: 'approved', verification_status: 'scientifically_verified',
    verification_basis: 'Compared with a peer-reviewed university extension bulletin.'
  }), env);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /source reference/);
});

test('health review only indexes approved records and records reviewer identity', async () => {
  const calls = setup((url, init) => {
    if (url.includes('/rest/v1/botanical_health_records?id=eq.' + RECORD) && (!init.method || init.method === 'GET')) {
      return ok([{ id: RECORD, review_status: 'pending', verification_status: 'community_submitted' }]);
    }
    if (url.includes('/rest/v1/botanical_health_records?id=eq.' + RECORD) && init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      assert.equal(patch.review_status, 'approved');
      assert.equal(patch.rag_indexed, true);
      assert.equal(patch.visibility, 'public');
      assert.equal(patch.verification_status, 'scientifically_verified');
      assert.equal(patch.reviewed_by, USER);
      assert.equal(patch.verification_basis, 'Compared with a peer-reviewed extension bulletin.');
      assert.deepEqual(patch.source_references, [{ citation: 'University extension bulletin' }]);
      return ok([{ id: RECORD, ...patch }]);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/health/admin/review', {
    record_id: RECORD, status: 'approved', visibility: 'public', rag_indexed: true,
    verification_status: 'scientifically_verified',
    verification_basis: 'Compared with a peer-reviewed extension bulletin.',
    source_references: [{ citation: 'University extension bulletin' }]
  }), env);
  assert.equal(r.status, 200);
  assert.ok(!calls.some(c => /generativelanguage|gemini/i.test(c.url)));
});

test('summary creation creates a pending human-authored version', async () => {
  setup((url, init) => {
    if (url.includes('/rest/v1/knowledge_documents?id=eq.' + DOC)) return ok([{ id: DOC, status: 'approved', rag_indexed: true, original_name: 'Palm guide.pdf' }]);
    if (url.includes('/rest/v1/knowledge_document_summaries?document_id=eq.' + DOC)) return ok([{ version: 2 }]);
    if (url.includes('/rest/v1/knowledge_document_summaries') && init.method === 'POST') {
      const row = JSON.parse(init.body);
      assert.equal(row.version, 3);
      assert.equal(row.review_status, 'pending');
      assert.equal(row.generation_method, 'human');
      return ok([row], 201);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/knowledge/summaries/create', {
    document_id: DOC, summary: 'This is a sufficiently detailed summary of a scientific palm document for review.',
    source_pages: [3, 5]
  }), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).summary.version, 3);
});

test('summary approval requires the original document to be approved and RAG-indexed', async () => {
  setup((url, init) => {
    if (url.includes('/rest/v1/knowledge_document_summaries?id=eq.' + SUMMARY)) return ok([{ id: SUMMARY, document_id: DOC, review_status: 'pending', summary: 'Summary text long enough to make a useful searchable curated passage.', key_facts: [], critical_details: [], source_pages: [2] }]);
    if (url.includes('/rest/v1/rpc/approve_knowledge_document_summary')) return ok({ message: 'The original source document must be approved and indexed first' }, 409);
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/knowledge/summaries/review', { summary_id: SUMMARY, decision: 'approve' }), env);
  assert.equal(r.status, 409);
});

test('summary approval refuses to publish a summary without page provenance', async () => {
  setup((url) => {
    if (url.includes('/rest/v1/knowledge_document_summaries?id=eq.' + SUMMARY)) {
      return ok([{ id: SUMMARY, document_id: DOC, review_status: 'pending', summary: 'A long enough summary to be searchable, but no page citations were provided.', key_facts: [], critical_details: [], safety_warnings: [], source_pages: [] }]);
    }
    throw new Error('No approval RPC should run without source pages: ' + url);
  });
  const r = await worker.fetch(request('/knowledge/summaries/review', { summary_id: SUMMARY, decision: 'approve' }), env);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /source page/);
});

test('summary approval atomically indexes summary, critical details and safety warnings', async () => {
  const calls = setup((url, init) => {
    if (url.includes('/rest/v1/knowledge_document_summaries?id=eq.' + SUMMARY)) {
      return ok([{ id: SUMMARY, document_id: DOC, review_status: 'pending', summary: 'A reviewed summary about palm nutrition, potassium deficiency, and leaf symptoms.', key_facts: ['Potassium deficiency causes older frond symptoms.'], critical_details: ['Avoid applying fertilizer to dry soil.'], safety_warnings: ['Wear gloves.'], source_pages: [2, 4] }]);
    }
    if (url.includes('/rest/v1/rpc/approve_knowledge_document_summary')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_summary_id, SUMMARY);
      assert.equal(body.p_reviewed_by_email, 'admin@verde.test');
      assert.equal(body.p_chunks[0].page_start, 2);
      assert.equal(body.p_chunks[0].page_end, 4);
      assert.ok(body.p_chunks.some(row => row.content.includes('Safety warning: Wear gloves.')));
      return ok(null, 204);
    }
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/knowledge/summaries/review', { summary_id: SUMMARY, decision: 'approve' }), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).review_status, 'approved');
  assert.ok(!calls.some(c => /generativelanguage|gemini/i.test(c.url)));
});

test('public knowledge search excludes private data, reports no-AI retrieval and applies Constitution checks', async () => {
  const calls = setup((url, init) => {
    if (url.includes('/rest/v1/rpc/search_verde_knowledge')) {
      const body = JSON.parse(init.body);
      assert.equal(body.include_private, false);
      return ok([{ source_type: 'research', source_title: 'Palm guide.pdf', citation: 'University extension', page_start: 4, content: 'Potassium deficiency symptoms.', verification_status: 'source_supported', rank: 0.2 }]);
    }
    if (url.includes('/rest/v1/constitution_rules')) return ok(ACTIVE_RULES);
    throw new Error('Unexpected request: ' + url);
  }, null);
  const r = await worker.fetch(request('/knowledge/search', { query: 'palm potassium' }, null), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ai_used, false);
  assert.equal(j.answered, true);
  assert.match(j.answer, /Palm guide.pdf, pages 4/);
  assert.ok(j.constitution.checks.some(c => c.key === 'approved_sources_only' && c.passed));
  assert.ok(j.constitution.checks.some(c => c.key === 'community_stays_separate' && c.passed));
  assert.ok(j.constitution.checks.some(c => c.key === 'humans_decide' && c.passed));
  assert.ok(j.constitution.checks.some(c => c.key === 'safety_first' && c.passed));
  assert.ok(calls.every(c => !/generativelanguage|gemini/i.test(c.url)));
});

test('Knowledge Core fails closed when any required Constitution rule is missing', async () => {
  setup((url) => {
    if (url.includes('/rest/v1/rpc/search_verde_knowledge')) return ok([{ source_type: 'research', source_title: 'Palm guide.pdf', page_start: 2, content: 'Some source text.', verification_status: 'source_supported' }]);
    if (url.includes('/rest/v1/constitution_rules')) return ok([{ rule_key: 'approved_sources_only', title: 'Approved sources only' }]);
    throw new Error('Unexpected request: ' + url);
  }, null);
  const r = await worker.fetch(request('/knowledge/search', { query: 'palm care' }, null), env);
  const j = await r.json();
  assert.equal(r.status, 503);
  assert.match(j.error, /Constitution rules are unavailable/);
  assert.equal(j.answered, undefined);
});

test('safety questions without approved safety data return an explicit warning and no invented answer', async () => {
  setup((url) => {
    if (url.includes('/rest/v1/rpc/search_verde_knowledge')) return ok([]);
    if (url.includes('/rest/v1/constitution_rules')) return ok(ACTIVE_RULES);
    throw new Error('Unexpected request: ' + url);
  }, null);
  const r = await worker.fetch(request('/knowledge/search', { query: 'Is this plant toxic to cats?' }, null), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.answered, false);
  assert.match(j.answer, /Not recorded/);
  assert.match(j.safety_note, /Do not assume/);
  assert.ok(j.constitution.checks.some(c => c.key === 'safety_first' && c.passed));
});

test('plant names containing cat or dog do not count as safety evidence', async () => {
  setup((url) => {
    if (url.includes('/rest/v1/rpc/search_verde_knowledge')) {
      return ok([{
        source_type: 'research', source_title: 'Palm guide.pdf', citation: 'Botanical guide',
        page_start: 3, content: 'Cat palm grows in partial shade and prefers moist soil.',
        verification_status: 'source_supported', rank: 0.3
      }]);
    }
    if (url.includes('/rest/v1/constitution_rules')) return ok(ACTIVE_RULES);
    throw new Error('Unexpected request: ' + url);
  }, null);
  const r = await worker.fetch(request('/knowledge/search', { query: 'Is cat palm toxic to cats?' }, null), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.answered, true);
  assert.match(j.safety_note, /Do not assume/);
});

test('private knowledge search is allowed only for authenticated admins', async () => {
  const calls = setup((url, init) => {
    if (url.includes('/rest/v1/rpc/search_verde_knowledge')) {
      assert.equal(JSON.parse(init.body).include_private, true);
      return ok([]);
    }
    if (url.includes('/rest/v1/constitution_rules')) return ok(ACTIVE_RULES);
    throw new Error('Unexpected request: ' + url);
  });
  const r = await worker.fetch(request('/knowledge/search', { query: 'hibiscus leaf', include_private: true }), env);
  assert.equal(r.status, 200);
  assert.ok(calls.some(c => c.url.includes('/auth/v1/user')));
});

test('unknown route returns 404 and non-POST method returns 405', async () => {
  let r = await worker.fetch(request('/not-a-route'), env);
  assert.equal(r.status, 404);
  r = await worker.fetch(new Request('https://worker.test/knowledge/search'), env);
  assert.equal(r.status, 405);
});
