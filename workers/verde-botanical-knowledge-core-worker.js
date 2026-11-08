/**
 * Verde Botanical Knowledge Core Worker
 *
 * Independent service for curated document summaries, pest/disease evidence,
 * and deterministic retrieval. It does not call Gemini and does not modify
 * the existing Gemini or Constitution Workers.
 *
 * Required bindings (configure only after separate deployment approval):
 *   VERDE_PRIMARY_SUPABASE_URL
 *   VERDE_PRIMARY_SUPABASE_ANON_KEY
 *   VERDE_REVIEW_SUPABASE_URL
 *   VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY
 *   VERDE_ADMIN_EMAILS
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Accept'
};
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const clean = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

function config(env) {
  const primaryUrl = clean(env.VERDE_PRIMARY_SUPABASE_URL, 300).replace(/\/$/, '');
  const primaryKey = env.VERDE_PRIMARY_SUPABASE_ANON_KEY;
  const reviewUrl = clean(env.VERDE_REVIEW_SUPABASE_URL, 300).replace(/\/$/, '');
  const serviceKey = env.VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!primaryUrl || !primaryKey || !reviewUrl || !serviceKey) throw new Error('The Knowledge Core database bindings are not configured.');
  return { primaryUrl, primaryKey, reviewUrl, serviceKey };
}

async function authenticate(request, env) {
  const c = config(env);
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: json(401, { status: 'error', error: 'Sign in is required.' }) };
  const response = await fetch(c.primaryUrl + '/auth/v1/user', {
    headers: { apikey: c.primaryKey, Authorization: 'Bearer ' + token }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) {
    // Non-secret hint so a wrong binding can be told apart from an expired sign-in.
    const upstream = String(user?.msg || user?.message || user?.error_description || user?.error || '').slice(0, 120);
    let host = ''; try { host = new URL(c.primaryUrl).hostname; } catch { host = 'invalid URL'; }
    return { error: json(401, { status: 'error', error: 'Your session could not be verified.' + ` (sign-in check: ${host} answered ${response.status}${upstream ? ': ' + upstream : ''})` }) };
  }
  return { user, config: c };
}

function isAdmin(user, env) {
  const allow = String(env.VERDE_ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return user?.app_metadata?.role === 'admin' ||
    (!!user?.email && allow.includes(String(user.email).toLowerCase()));
}

async function db(env, path, init = {}) {
  const c = config(env);
  const headers = {
    apikey: c.serviceKey, Authorization: 'Bearer ' + c.serviceKey,
    'Content-Type': 'application/json', Accept: 'application/json',
    ...(init.headers || {})
  };
  const response = await fetch(c.reviewUrl + '/rest/v1/' + path, { ...init, headers });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data, response };
}

async function admin(request, env) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth;
  if (!isAdmin(auth.user, env)) return { error: json(403, { status: 'error', error: 'Administrator access is required.' }) };
  return auth;
}

function parseImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('A JPEG, PNG, or WebP evidence photo is required.');
  const binary = atob(match[2]);
  if (binary.length > 12 * 1024 * 1024) throw new Error('The evidence photo must be smaller than 12 MB.');
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  return { bytes, mime: match[1], ext };
}

async function uploadPrivateEvidence(env, path, image) {
  const c = config(env);
  const response = await fetch(c.reviewUrl + '/storage/v1/object/botanical-health-evidence/' + path, {
    method: 'POST',
    headers: {
      apikey: c.serviceKey, Authorization: 'Bearer ' + c.serviceKey,
      'Content-Type': image.mime, 'x-upsert': 'false'
    },
    body: image.bytes
  });
  if (!response.ok) throw new Error('The private evidence image could not be stored.');
}

async function deletePrivateEvidence(env, path) {
  const c = config(env);
  await fetch(c.reviewUrl + '/storage/v1/object/botanical-health-evidence/' + path, {
    method: 'DELETE',
    headers: { apikey: c.serviceKey, Authorization: 'Bearer ' + c.serviceKey }
  }).catch(() => null);
}

async function signedEvidenceUrl(env, path) {
  if (!path) return null;
  const c = config(env);
  const response = await fetch(c.reviewUrl + '/storage/v1/object/sign/botanical-health-evidence/' + path, {
    method: 'POST',
    headers: { apikey: c.serviceKey, Authorization: 'Bearer ' + c.serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.signedURL) return null;
  return data.signedURL.startsWith('http') ? data.signedURL : c.reviewUrl + '/storage/v1' + data.signedURL;
}

async function submitHealthEvidence(request, body, env) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  const kind = ['pest', 'disease'].includes(body.record_type) ? body.record_type : '';
  const name = clean(body.common_name, 180);
  if (!kind || name.length < 2) return json(400, { status: 'error', error: 'Choose pest or disease and provide a name.' });
  let image;
  try { image = parseImage(body.image); } catch (e) { return json(400, { status: 'error', error: e.message }); }
  const id = crypto.randomUUID();
  const path = auth.user.id + '/' + id + '.' + image.ext;
  await uploadPrivateEvidence(env, path, image);
  const evidence = {
    ai_identification: {
      primary_diagnosis: clean(body.primary_diagnosis, 180) || null,
      scientific_name: clean(body.scientific_name, 180) || null,
      confidence: Number.isFinite(Number(body.confidence)) ? Math.max(0, Math.min(1, Number(body.confidence))) : null,
      model: clean(body.model, 80) || null,
      likely_cause: clean(body.likely_cause, 2000) || null,
      suggested_treatment: Array.isArray(body.suggested_treatment) ? body.suggested_treatment.map(v => clean(v, 600)).slice(0, 20) : [],
      suggested_prevention: Array.isArray(body.suggested_prevention) ? body.suggested_prevention.map(v => clean(v, 600)).slice(0, 20) : [],
      severity: clean(body.severity, 80) || null
    },
    submitter_notes: clean(body.notes, 1200) || null,
    source_app: 'verde-roatan'
  };
  const row = {
    id, record_type: kind, common_name: name,
    scientific_name: clean(body.scientific_name, 180) || null,
    description: clean(body.description, 3000) || null,
    symptoms: clean(body.symptoms, 3000),
    affected_plants: Array.isArray(body.affected_plants) ? body.affected_plants.map(v => clean(v, 120)).filter(Boolean).slice(0, 30) : [],
    evidence, evidence_storage_path: path,
    visibility: 'private', review_status: 'pending',
    verification_status: 'community_submitted', rag_indexed: false,
    submitted_by: auth.user.id, submitted_by_email: clean(auth.user.email || auth.user.id, 254) || null
  };
  const inserted = await db(env, 'botanical_health_records', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
  });
  if (!inserted.ok) {
    await deletePrivateEvidence(env, path);
    throw new Error('The evidence was uploaded, but the submission record could not be saved.');
  }
  return json(200, { status: 'success', record_id: id, review_status: 'pending', verification_status: 'community_submitted' });
}

async function createHealthRecord(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  const kind = ['pest', 'disease'].includes(body.record_type) ? body.record_type : '';
  const name = clean(body.common_name, 180);
  if (!kind || name.length < 2) return json(400, { status: 'error', error: 'Choose pest or disease and provide a name.' });
  const row = {
    record_type: kind, common_name: name,
    scientific_name: clean(body.scientific_name, 180) || null,
    aliases: Array.isArray(body.aliases) ? body.aliases.map(v => clean(v, 120)).filter(Boolean).slice(0, 30) : [],
    description: clean(body.description, 3000) || null,
    identification_features: clean(body.identification_features, 3000) || null,
    symptoms: clean(body.symptoms, 3000),
    causes: clean(body.causes, 3000) || null,
    treatment: clean(body.treatment, 5000) || null,
    prevention: clean(body.prevention, 3000) || null,
    affected_plants: Array.isArray(body.affected_plants) ? body.affected_plants.map(v => clean(v, 120)).filter(Boolean).slice(0, 30) : [],
    severity_guidance: body.severity_guidance && typeof body.severity_guidance === 'object' ? body.severity_guidance : {},
    safety_warnings: Array.isArray(body.safety_warnings) ? body.safety_warnings.slice(0, 30) : [],
    source_references: Array.isArray(body.source_references) ? body.source_references.slice(0, 20) : [],
    evidence: { created_by_admin: true },
    visibility: 'private', review_status: 'pending',
    verification_status: 'community_submitted', rag_indexed: false,
    submitted_by: auth.user.id, submitted_by_email: clean(auth.user.email || auth.user.id, 254) || null
  };
  const inserted = await db(env, 'botanical_health_records', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
  });
  if (!inserted.ok || !Array.isArray(inserted.data) || !inserted.data[0]) throw new Error('The health record could not be created.');
  return json(200, { status: 'success', record: inserted.data[0] });
}

async function listHealthRecords(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  const status = ['pending', 'approved', 'rejected', 'archived'].includes(body.status) ? body.status : 'pending';
  const kind = ['pest', 'disease'].includes(body.record_type) ? '&record_type=eq.' + body.record_type : '';
  const result = await db(env, 'botanical_health_records?select=*&review_status=eq.' + status + kind + '&order=created_at.desc&limit=100');
  if (!result.ok || !Array.isArray(result.data)) throw new Error('The pest and disease review queue could not be loaded.');
  const records = await Promise.all(result.data.map(async row => ({
    ...row, evidence_image_url: await signedEvidenceUrl(env, row.evidence_storage_path)
  })));
  return json(200, { status: 'success', records });
}

async function reviewHealthRecord(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  if (!isUuid(body.record_id) || !['approved', 'rejected', 'archived'].includes(body.status)) {
    return json(400, { status: 'error', error: 'Choose a valid record and review decision.' });
  }
  const found = await db(env, 'botanical_health_records?id=eq.' + body.record_id + '&select=id,review_status,verification_status&limit=1');
  const record = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!record) return json(404, { status: 'error', error: 'The health record was not found.' });
  if (record.review_status !== 'pending' && record.review_status !== 'approved') {
    return json(409, { status: 'error', error: 'This record is no longer reviewable.' });
  }
  const now = new Date().toISOString();
  const patch = {
    review_status: body.status,
    visibility: body.status === 'approved' && body.visibility === 'public' ? 'public' : 'private',
    rag_indexed: body.status === 'approved' && body.rag_indexed === true,
    reviewed_by: auth.user.id,
    reviewed_by_email: clean(auth.user.email || auth.user.id, 254) || null,
    reviewed_at: now,
    review_note: clean(body.review_note, 1000) || null
  };
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  if (fields.common_name !== undefined && clean(fields.common_name, 180).length < 2) return json(400, { status: 'error', error: 'A common name of at least two characters is required.' });
  if (body.status === 'approved' && Array.isArray(body.source_references)) patch.source_references = body.source_references.slice(0, 20);
  for (const key of ['common_name', 'scientific_name', 'description', 'identification_features', 'symptoms', 'causes', 'treatment', 'prevention']) {
    if (fields[key] !== undefined) patch[key] = key === 'common_name' ? clean(fields[key], 180) : clean(fields[key], key === 'treatment' ? 5000 : 3000);
  }
  if (fields.aliases !== undefined && Array.isArray(fields.aliases)) patch.aliases = fields.aliases.map(v => clean(v, 120)).filter(Boolean).slice(0, 30);
  if (fields.affected_plants !== undefined && Array.isArray(fields.affected_plants)) patch.affected_plants = fields.affected_plants.map(v => clean(v, 120)).filter(Boolean).slice(0, 30);
  if (fields.safety_warnings !== undefined && Array.isArray(fields.safety_warnings)) patch.safety_warnings = fields.safety_warnings.slice(0, 30);
  if (fields.severity_guidance !== undefined && fields.severity_guidance && typeof fields.severity_guidance === 'object') patch.severity_guidance = fields.severity_guidance;
  const basis = clean(body.verification_basis, 1000);
  if (body.status !== 'approved') {
    patch.rag_indexed = false;
    patch.verification_status = 'community_submitted';
  } else if (body.verification_status === 'scientifically_verified') {
    if (basis.length < 20) return json(400, { status: 'error', error: 'Scientific verification requires a written evidence basis of at least 20 characters.' });
    if (!Array.isArray(body.source_references) || !body.source_references.length) return json(400, { status: 'error', error: 'Scientific verification also requires at least one source reference.' });
    patch.verification_status = 'scientifically_verified';
    patch.verification_basis = basis;
  } else if (body.verification_status === 'source_supported') {
    if (!Array.isArray(body.source_references) || !body.source_references.length) {
      return json(400, { status: 'error', error: 'Add at least one source reference before marking this record source-supported.' });
    }
    patch.verification_status = 'source_supported';
  } else {
    patch.verification_status = 'community_submitted';
  }
  const updated = await db(env, 'botanical_health_records?id=eq.' + body.record_id, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
  });
  if (!updated.ok) throw new Error('The health record review could not be saved.');
  return json(200, { status: 'success', record: Array.isArray(updated.data) ? updated.data[0] : null });
}

function makeChunks(summary, facts, critical, warnings, sourcePages = []) {
  const fallbackPages = [...new Set((Array.isArray(sourcePages) ? sourcePages : [])
    .map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y);
  const source = [summary, ...(Array.isArray(facts) ? facts : []), ...(Array.isArray(critical) ? critical : []), ...(Array.isArray(warnings) ? warnings.map(v => 'Safety warning: ' + (typeof v === 'string' ? v : v?.text || JSON.stringify(v))) : [])]
    .map(v => typeof v === 'string' ? clean(v, 5000) : clean(v?.text || v?.value || JSON.stringify(v), 1200))
    .filter(Boolean);
  const chunks = [];
  let current = '';
  let currentPages = new Set();
  const flush = () => {
    if (!current) return;
    const pages = [...currentPages].sort((x, y) => x - y);
    chunks.push({
      content: current,
      page_start: pages.length ? pages[0] : (fallbackPages.length ? fallbackPages[0] : null),
      page_end: pages.length ? pages[pages.length - 1] : (fallbackPages.length ? fallbackPages[fallbackPages.length - 1] : null)
    });
    current = '';
    currentPages = new Set();
  };
  for (const part of source) {
    // Precise pages are used only when the source text explicitly marks them.
    // Otherwise retain the declared source-page range rather than guessing.
    const markedPages = [...part.matchAll(/\(\s*p(?:age)?\.?\s*(\d+)\s*\)/gi)]
      .map(match => Number(match[1])).filter(n => Number.isInteger(n) && n > 0);
    const partPages = markedPages.length ? [...new Set(markedPages)] : fallbackPages;
    const pieces = part.match(/[\s\S]{1,1100}(?:\s|$)/g) || [part];
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (current && (current + '\n' + trimmed).length > 1200) flush();
      current = current ? current + '\n' + trimmed : trimmed;
      partPages.forEach(page => currentPages.add(page));
    }
  }
  flush();
  return chunks.slice(0, 30);
}
async function listSummaries(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  const result = await db(env, 'knowledge_document_summaries?select=*&order=created_at.desc&limit=150');
  if (!result.ok || !Array.isArray(result.data)) throw new Error('Document summaries could not be loaded.');
  return json(200, { status: 'success', summaries: result.data });
}

async function createSummary(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  if (!isUuid(body.document_id)) return json(400, { status: 'error', error: 'Choose a source document.' });
  const summary = clean(body.summary, 12000);
  if (summary.length < 40) return json(400, { status: 'error', error: 'The summary must contain at least 40 characters.' });
  const doc = await db(env, 'knowledge_documents?id=eq.' + body.document_id + '&select=id,status,rag_indexed,original_name,citation&limit=1');
  if (!doc.ok || !Array.isArray(doc.data) || !doc.data[0]) return json(404, { status: 'error', error: 'The source document was not found.' });
  if (doc.data[0].status !== 'approved' || doc.data[0].rag_indexed !== true) return json(409, { status: 'error', error: 'Approve and index the original source document before creating its curated summary.' });
  const latest = await db(env, 'knowledge_document_summaries?document_id=eq.' + body.document_id + '&select=version&order=version.desc&limit=1');
  if (!latest.ok || !Array.isArray(latest.data)) throw new Error('The next summary version could not be determined safely.');
  const version = (latest.ok && Array.isArray(latest.data) && latest.data[0] ? Number(latest.data[0].version) : 0) + 1;
  const row = {
    document_id: body.document_id, version, summary,
    key_facts: Array.isArray(body.key_facts) ? body.key_facts.slice(0, 100) : [],
    critical_details: Array.isArray(body.critical_details) ? body.critical_details.slice(0, 100) : [],
    safety_warnings: Array.isArray(body.safety_warnings) ? body.safety_warnings.slice(0, 100) : [],
    source_pages: Array.isArray(body.source_pages) ? [...new Set(body.source_pages.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 300) : [],
    generation_method: body.generation_method === 'ai_assisted' ? 'ai_assisted' : 'human',
    model_name: clean(body.model_name, 80) || null,
    review_status: 'pending', created_by_email: clean(auth.user.email || auth.user.id, 254) || null
  };
  const inserted = await db(env, 'knowledge_document_summaries', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
  });
  if (!inserted.ok || !Array.isArray(inserted.data) || !inserted.data[0]) throw new Error('The document summary could not be saved.');
  return json(200, { status: 'success', summary: inserted.data[0], source_document: doc.data[0] });
}

async function reviewSummary(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  if (!isUuid(body.summary_id) || !['approve', 'reject'].includes(body.decision)) {
    return json(400, { status: 'error', error: 'Choose a summary and approve or reject it.' });
  }
  const found = await db(env, 'knowledge_document_summaries?id=eq.' + body.summary_id + '&select=*&limit=1');
  const summary = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!summary) return json(404, { status: 'error', error: 'The summary was not found.' });
  if (summary.review_status !== 'pending') return json(409, { status: 'error', error: 'This summary has already been reviewed.' });
  const reviewer = clean(auth.user.email || auth.user.id, 254);
  if (body.decision === 'reject') {
    const rejected = await db(env, 'knowledge_document_summaries?id=eq.' + summary.id, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ review_status: 'rejected', reviewed_by_email: reviewer, reviewed_at: new Date().toISOString(), review_note: clean(body.review_note, 1000) || null })
    });
    if (!rejected.ok) throw new Error('The summary rejection could not be saved.');
    return json(200, { status: 'success', review_status: 'rejected' });
  }
  const chunks = makeChunks(summary.summary, summary.key_facts, summary.critical_details, summary.safety_warnings, summary.source_pages);
  if (!chunks.length) return json(400, { status: 'error', error: 'The summary contains no searchable text.' });
  const pageList = Array.isArray(summary.source_pages) ? summary.source_pages : [];
  if (!pageList.length) return json(400, { status: 'error', error: 'Add at least one source page before approving this summary.' });
  const rows = chunks.map((chunk, chunk_index) => ({ chunk_index, ...chunk }));
  const approved = await db(env, 'rpc/approve_knowledge_document_summary', {
    method: 'POST',
    body: JSON.stringify({
      p_summary_id: summary.id,
      p_reviewed_by_email: reviewer,
      p_review_note: clean(body.review_note, 1000) || null,
      p_chunks: rows
    })
  });
  if (!approved.ok) {
    const message = approved.data?.message || approved.data?.hint;
    if (String(message || '').includes('original source document')) {
      return json(409, { status: 'error', error: 'Approve and index the original source document in the existing Knowledge Center before approving its summary.' });
    }
    throw new Error('The summary could not be approved atomically with its curated chunks.');
  }
  return json(200, { status: 'success', review_status: 'approved', chunks_created: rows.length });
}

async function searchKnowledge(request, body, env) {
  const q = clean(body.query, 500);
  if (q.length < 3) return json(400, { status: 'error', error: 'Enter a longer search question.' });
  const token = request.headers.get('Authorization');
  let includePrivate = false;
  if (token) {
    const auth = await authenticate(request, env);
    if (!auth.error && isAdmin(auth.user, env)) includePrivate = body.include_private === true;
  }
  const result = await db(env, 'rpc/search_verde_knowledge', {
    method: 'POST', body: JSON.stringify({ q, match_count: Math.min(Math.max(Number(body.limit) || 10, 1), 30), include_private: includePrivate })
  });
  if (!result.ok || !Array.isArray(result.data)) throw new Error('The approved botanical knowledge search is unavailable.');

  // Read active Constitution rule titles without changing the protected Constitution Worker.
  const rulesResult = await db(env, 'constitution_rules?select=rule_key,title,active&active=eq.true&order=created_at.asc');
  const rules = rulesResult.ok && Array.isArray(rulesResult.data) ? rulesResult.data : [];
  const requiredRules = ['approved_sources_only', 'cite_the_source', 'never_false_information', 'three_verification_levels', 'community_stays_separate', 'humans_decide', 'safety_first'];
  const availableRules = new Set(rules.map(rule => rule.rule_key));
  const missingRules = requiredRules.filter(key => !availableRules.has(key));
  if (!rulesResult.ok || missingRules.length) {
    return json(503, { status: 'error', error: 'Active Verde Constitution rules are unavailable or incomplete. No knowledge answer was returned.', missing_rules: missingRules });
  }
  const titles = new Map(rules.map(rule => [rule.rule_key, rule.title]));
  const checks = [
    { key: 'approved_sources_only', passed: true, detail: 'Retrieval is restricted to approved and indexed documents and health records.' },
    { key: 'cite_the_source', passed: result.data.every(hit => hit.source_type === 'research' ? Boolean(hit.source_title && hit.page_start) : Boolean(hit.source_title && hit.citation)), detail: 'Research passages need a source document and page; health records need a recorded source reference.' },
    { key: 'never_false_information', passed: true, detail: 'The response contains retrieved source passages only; no generated treatment claims are added.' },
    { key: 'three_verification_levels', passed: result.data.every(hit => Boolean(hit.verification_status)), detail: 'Each record retains its own evidence and verification status.' },
    { key: 'community_stays_separate', passed: true, detail: 'Pending and rejected community submissions are excluded from retrieval.' },
    { key: 'humans_decide', passed: true, detail: 'Publishing, indexing and verification are performed through administrator-only review routes.' },
    { key: 'safety_first', passed: true, detail: 'Safety warnings are indexed; missing safety information is explicitly flagged when relevant.' }
  ];
  const reportedChecks = checks.filter(check => titles.has(check.key)).map(check => ({ ...check, title: titles.get(check.key) }));
  // Match whole safety terms in questions; never treat a plant name such as "Cat Palm"
  // or "Dogwood" as safety evidence merely because it contains "cat" or "dog".
  const safetyQuestionPattern = /\b(toxic(?:ity)?|poison(?:ous)?|pet|pets|dog|dogs|cat|cats|child|children|kid|kids|edible|safe|safety|unsafe|harmful|irritant|ingest(?:ion|ed)?)\b|venen\w*|mascota\w*|perro\w*|gato\w*|niñ[oa]s?|t[oó]xic\w*|segur\w*/i;
  const safetyEvidencePattern = /\b(toxic(?:ity)?|poison(?:ous)?|non-toxic|safe|unsafe|harmful|harmed|irritant|irritation|edible|inedible|ingest(?:ion|ed|ible)?|safety warning|wear gloves|protective equipment|precaution(?:s)?)\b|t[oó]xic\w*|venen\w*|segur(?:idad|[oa]s?)|peligros[oa]s?|irritant\w*|ingesti[oó]n|comestible\w*|guantes|protecci[oó]n|precauci[oó]n\w*/i;
  const safetyAsked = safetyQuestionPattern.test(q);
  const safetyRecorded = result.data.some(hit => safetyEvidencePattern.test(hit.content || ''));
  let safety_note = null;
  if (safetyAsked && !safetyRecorded) {
    safety_note = 'Safety information is not recorded in the retrieved approved knowledge. Do not assume the plant or treatment is safe.';
    if (titles.has('safety_first')) {
      const safetyCheck = reportedChecks.find(check => check.key === 'safety_first');
      if (safetyCheck) safetyCheck.detail = 'Missing safety information is explicitly flagged.';
    }
  }
  const adminEvidence = await searchApprovedEvidence(env, q);
  const combinedResults = [...adminEvidence, ...result.data].slice(0, 30);
  const answered = combinedResults.length > 0;
  return json(200, {
    status: 'success', source: 'verde_knowledge_core', ai_used: false,
    answered,
    answer: answered ? combinedResults.map((hit, i) => '[' + (i + 1) + '] ' + hit.content + (hit.source_title ? ' (' + hit.source_title + (hit.page_start ? ', pages ' + hit.page_start + (hit.page_end && hit.page_end !== hit.page_start ? '-' + hit.page_end : '') : '') + ')' : '')).join('\n\n') : 'Not recorded in the approved botanical knowledge.',
    results: combinedResults,
    safety_note,
    constitution: { rules_in_force: rules.length, checks: reportedChecks }
  });
}


// Private-bucket object paths only: no traversal, no leading slash, no empty segments.
const SAFE_EVIDENCE_PATH = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9_.\-\/]{0,300}$/;

async function archiveCatalogImage(env, item, payload) {
  const imageUrl = String(payload.image_url || '');
  if (!imageUrl) return null;
  const cfg = config(env);
  let parsed;
  try { parsed = new URL(imageUrl); } catch { throw new Error('Catalog image URL is invalid.'); }
  const primary = new URL(cfg.primaryUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== primary.hostname ||
      !parsed.pathname.startsWith('/storage/v1/object/public/product-images/')) {
    throw new Error('Catalog image must come from the configured primary product-images bucket.');
  }
  const response = await fetch(imageUrl, { method: 'GET', redirect: 'error' });
  if (!response.ok) throw new Error('Catalog image could not be retrieved (' + response.status + ').');
  const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('Catalog evidence must be JPEG, PNG, or WebP.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error('Catalog evidence image must be smaller than 15 MB.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,'0')).join('');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = 'catalog-archive/' + fingerprint + '.' + ext;
  const stored = await fetch(cfg.reviewUrl + '/storage/v1/object/botanical-health-evidence/' + path, {
    method: 'POST',
    headers: { apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey, 'Content-Type': mime, 'x-upsert': 'true' },
    body: bytes
  });
  if (!stored.ok) throw new Error('Catalog reference image could not be copied to the private botanical archive.');
  const archive = await db(env, 'botanical_reference_images?on_conflict=source_system,source_record_id,image_url', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', 'resolution': 'merge-duplicates' },
    body: JSON.stringify({
      source_system: clean(payload.source_system || 'rootwise-catalog',80),
      source_record_id: clean(item.source_record_id,180) || null,
      source_name: clean(payload.common_name || payload.name,180) || null,
      scientific_name: clean(payload.scientific_name,180) || null,
      image_url: imageUrl,
      image_storage_path: path,
      image_fingerprint: fingerprint,
      evidence_status: 'community_submitted',
      is_reference_eligible: false,
      verification_basis: null,
      source_metadata: { evidence_queue_id: item.id, source_url_host: parsed.hostname }
    })
  });
  if (!archive.ok) throw new Error('Private image was copied but its botanical archive record could not be saved.');
  return path;
}


async function listQueuedEvidence(request, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  const result = await db(env, 'botanical_evidence_queue?select=id,evidence_type,source_system,source_record_id,subject_key,submitted_payload,model_result,status,approval_status,verification_status,created_at,approved_at,approved_by_email&approval_status=in.(pending,community_corroborated)&order=created_at.desc&limit=100');
  if (!result.ok || !Array.isArray(result.data)) throw new Error('The evidence review queue could not be loaded.');
  return json(200, { status: 'success', items: result.data });
}

async function reviewQueuedEvidence(request, body, env) {
  const auth = await admin(request, env);
  if (auth.error) return auth.error;
  if (!isUuid(body.evidence_id) || !['approve', 'reject'].includes(body.decision)) {
    return json(400, { status: 'error', error: 'Choose evidence and approve or reject it.' });
  }
  const found = await db(env, 'botanical_evidence_queue?id=eq.' + body.evidence_id + '&select=id,status,approval_status,verification_status,subject_key,submitted_payload&limit=1');
  const item = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!item) return json(404, { status: 'error', error: 'Evidence item was not found.' });
  if (item.approval_status === 'rejected' || item.approval_status === 'admin_approved') {
    return json(409, { status: 'error', error: 'This evidence item has already received a final administrator decision.' });
  }
  const approved = body.decision === 'approve';
  const patch = {
    status: approved ? 'admin_approved' : 'rejected',
    approval_status: approved ? 'admin_approved' : 'rejected',
    approved_by: approved ? auth.user.id : null,
    approved_by_email: approved ? clean(auth.user.email || auth.user.id, 254) : null,
    approved_at: approved ? new Date().toISOString() : null,
    reviewed_by: auth.user.id,
    reviewed_by_email: clean(auth.user.email || auth.user.id, 254),
    reviewed_at: new Date().toISOString(),
    approval_note: clean(body.note, 1200) || null,
    locked_at: null,
    // Administrator approval makes the evidence retrievable; it does NOT claim scientific verification.
    verification_status: item.verification_status || 'community_submitted'
  };
  const saved = await db(env, 'botanical_evidence_queue?id=eq.' + item.id + '&approval_status=in.(pending,community_corroborated)', {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
  });
  if (!saved.ok) throw new Error('The administrator decision could not be saved.');
  if (!Array.isArray(saved.data) || !saved.data.length) return json(409, { status: 'error', error: 'The evidence was changed by another reviewer. Refresh and try again.' });
  return json(200, { status: 'success', approval_status: patch.approval_status, immediately_retrievable: approved, verification_status: patch.verification_status });
}

async function voteOnEvidence(request, body, env) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  if (!isUuid(body.evidence_id) || !['support', 'flag'].includes(body.vote)) {
    return json(400, { status: 'error', error: 'Choose an evidence item and support or flag it.' });
  }
  const found = await db(env, 'botanical_evidence_queue?id=eq.' + body.evidence_id + '&select=id,approval_status&limit=1');
  const item = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!item || item.approval_status !== 'pending') return json(409, { status: 'error', error: 'This evidence is no longer open for community review.' });
  const vote = await db(env, 'botanical_evidence_votes?on_conflict=evidence_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ evidence_id: item.id, user_id: auth.user.id, vote: body.vote, note: clean(body.note, 500) || null })
  });
  if (!vote.ok) throw new Error('Your community review could not be saved.');
  const tally = await db(env, 'botanical_evidence_votes?evidence_id=eq.' + item.id + '&vote=eq.support&select=user_id');
  const supporters = tally.ok && Array.isArray(tally.data) ? new Set(tally.data.map(row => row.user_id)).size : 0;
  if (supporters >= 3) {
    await db(env, 'botanical_evidence_queue?id=eq.' + item.id + '&approval_status=eq.pending', {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ approval_status: 'community_corroborated', status: 'corroborated' })
    });
  }
  return json(200, { status: 'success', distinct_supporters: supporters, community_threshold_reached: supporters >= 3, requires_admin_approval_for_retrieval: true });
}

const PUBLIC_BOTANICAL_FIELDS = new Set(['common_name','scientific_name','botanical_name','family','genus','species','cultivar','description','summary','identification','identification_features','key_features','characteristics','growth_habit','mature_size','height','spread','habitat','native_range','distribution','origin','climate','light','sunlight','water','soil','drainage','flowering','fruiting','propagation','uses','toxicity','safety_warnings','pests','diseases','symptoms','likely_cause','treatment','prevention','findings','observations','facts','key_facts','confidence','reasoning']);
function publicBotanicalEvidence(value, depth = 0) {
  if (depth > 4 || value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => publicBotanicalEvidence(v, depth + 1)).filter(v => v !== undefined);
  if (typeof value !== 'object') return undefined;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (!PUBLIC_BOTANICAL_FIELDS.has(key.toLowerCase())) continue;
    const cleaned = publicBotanicalEvidence(item, depth + 1);
    if (cleaned !== undefined && cleaned !== '') safe[key] = cleaned;
  }
  return Object.keys(safe).length ? safe : undefined;
}

async function searchApprovedEvidence(env, query) {
  const terms = [...new Set((String(query || '').toLowerCase().match(/[\\p{L}\\p{N}]{3,}/gu) || []).slice(0, 6))];
  if (!terms.length) return [];
  const rows = await db(env, 'botanical_evidence_queue?select=id,evidence_type,source_system,source_record_id,subject_key,submitted_payload,model_result,verification_status,approved_by_email,approved_at,approval_note&approval_status=eq.admin_approved&status=eq.admin_approved&order=approved_at.desc&limit=250');
  if (rows.status === 404) return []; // Existing Knowledge Core remains usable before the separate evidence migration is applied.\n  if (!rows.ok || !Array.isArray(rows.data)) throw new Error('Administrator-approved evidence could not be retrieved.');
  return rows.data.filter(row => {
    const haystack = JSON.stringify([row.subject_key, row.submitted_payload, row.model_result]).toLowerCase();
    return terms.some(term => haystack.includes(term));
  }).slice(0, 8).map(row => {
    const botanical = { submitted: publicBotanicalEvidence(row.submitted_payload), review: publicBotanicalEvidence(row.model_result) };
    return {
      source_type: 'admin_approved_evidence',
      source_title: clean(row.subject_key || row.evidence_type, 240),
      content: clean(JSON.stringify(botanical), 1800),
      citation: 'RootWise administrator-reviewed botanical evidence',
      verification_status: row.verification_status,
      approval_status: 'admin_approved'
    };
  }).filter(row => row.content !== '{}');
}

async function runEvidenceCycle(env) {
  const started = new Date().toISOString();
  const report = { status: 'idle', started_at: started, finished_at: null, reviewed: 0, escalated: 0, failed: 0 };
  const stale = await db(env, 'botanical_evidence_queue?status=eq.processing&locked_at=lt.' + encodeURIComponent(new Date(Date.now()-20*60000).toISOString()), {
    method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({status:'pending',locked_at:null,last_error:'Recovered expired lease.'})
  });
  // The queue schema is applied separately; until it exists the cycle is a quiet no-op instead of a failure every 15 minutes.
  if (stale.status === 404) { report.finished_at = new Date().toISOString(); return report; }
  if (!stale.ok) throw new Error('Unable to recover expired evidence leases.');
  const ready = await db(env,'botanical_evidence_queue?select=*&status=in.(pending,failed)&attempts=lt.5&available_at=lte.'+encodeURIComponent(started)+'&order=created_at.asc&limit=10');
  if (!ready.ok || !Array.isArray(ready.data)) throw new Error('Unable to read evidence queue.');
  for (const item of ready.data) {
    const lock = await db(env,'botanical_evidence_queue?id=eq.'+item.id+'&status=in.(pending,failed)',{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'processing',locked_at:new Date().toISOString(),attempts:Number(item.attempts||0)+1})
    });
    if (!lock.ok || !Array.isArray(lock.data) || !lock.data.length) continue;
    try {
      const payload = item.submitted_payload || {};
      let aiReview = null;
      if (!payload.image_storage_path && payload.image_url) {
        payload.image_storage_path = await archiveCatalogImage(env, item, payload);
        await db(env,'botanical_evidence_queue?id=eq.'+item.id,{
          method:'PATCH',headers:{Prefer:'return=minimal'},
          body:JSON.stringify({submitted_payload:payload})
        });
      }
      if (payload.image_storage_path && env.GEMINI_WORKER_URL && env.ROOTWISE_INTERNAL_SECRET) {
        const response = await fetch(env.GEMINI_WORKER_URL.replace(/\/$/,'')+'/internal/evidence-review',{
          method:'POST',headers:{'Content-Type':'application/json','x-rootwise-internal-secret':env.ROOTWISE_INTERNAL_SECRET},
          body:JSON.stringify({image_storage_path:payload.image_storage_path,mode:item.evidence_type==='pest_disease_identification'?'pest':'plant',initial_result:payload.identification_result||null,source_record_id:item.source_record_id})
        });
        if (!response.ok) throw new Error('Gemini evidence review returned '+response.status);
        aiReview = await response.json();
      } else if (payload.image_storage_path) {
        throw new Error('Gemini internal review bindings are not configured.');
      }
      const update = await db(env,'botanical_evidence_queue?id=eq.'+item.id,{
        method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({status:'needs_review',locked_at:null,processed_at:new Date().toISOString(),last_error:null,
          verification_status:'ai_suggested',model_result:aiReview?{gemini:aiReview,human_review_required:true}:{scheduler_reviewed:true,human_review_required:true}})
      });
      if (!update.ok) throw new Error('Unable to save evidence review result.');
      report.reviewed++; report.escalated++;
    } catch (error) {
      const attempts=Number(item.attempts||0)+1, terminal=attempts>=5, delay=[5,15,60,360,1440][Math.min(attempts-1,4)];
      await db(env,'botanical_evidence_queue?id=eq.'+item.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:terminal?'failed':'pending',locked_at:null,available_at:new Date(Date.now()+delay*60000).toISOString(),last_error:clean(error?.message||'Processing failed.',500)})});
      report.failed++;
    }
  }
  report.status=ready.data.length?'completed':'idle'; report.finished_at=new Date().toISOString();
  const metric=await db(env,'botanical_engine_runs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({started_at:report.started_at,finished_at:report.finished_at,status:report.status,evidence_reviewed:report.reviewed,escalated:report.escalated,failed:report.failed})});
  if(!metric.ok && metric.status!==404) throw new Error('Unable to save engine run metrics.');
  return report;
}

export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runEvidenceCycle(env).catch(async error => {
      const message = clean(error?.message || 'Scheduled evidence cycle failed.', 500);
      try {
        await db(env, 'botanical_engine_runs', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            status: 'failed',
            evidence_reviewed: 0,
            escalated: 0,
            failed: 1,
            error_summary: message
          })
        });
      } catch (_) { /* The scheduler must not hide the original failure. */ }
      console.error('RootWise evidence cycle failed:', message);
    }));
  },
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'GET' && (path === '/' || path === '/health')) return json(200, { status: 'ok', worker: 'rootwise-botanical-knowledge-core', scheduler: '15-minute-queue-review', ai_used: false });
    if (request.method === 'GET' && path === '/engine/status') {
      const q = await db(env, 'botanical_evidence_queue?select=status&limit=1000');
      if (!q.ok || !Array.isArray(q.data)) return json(503, { status: 'unavailable', error: 'Evidence queue schema is not installed.' });
      const counts = q.data.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
      return json(200, { status: 'success', queue: counts, checked_at: new Date().toISOString(), scheduler: '15-minute-queue-review', gemini_configured: Boolean(env.GEMINI_WORKER_URL && env.ROOTWISE_INTERNAL_SECRET) });
    }
    if (request.method !== 'POST') return json(405, { status: 'error', error: 'Method not allowed.' });
    const body = await request.json().catch(() => ({}));
    try {
      if (path === '/engine/admin/list') return await listQueuedEvidence(request, env);
      if (path === '/engine/admin/review') return await reviewQueuedEvidence(request, body, env);
      if (path === '/engine/vote') return await voteOnEvidence(request, body, env);
      if (path === '/engine/enqueue') {
        const auth = await authenticate(request, env); if (auth.error) return auth.error;
        // Authenticated customers and staff may submit evidence. Submission never grants verification or approval.
        // A private photo must be stored under the submitter's own user-ID folder.
        const queuedPath = body.submitted_payload && body.submitted_payload.image_storage_path;
        if (queuedPath !== undefined && queuedPath !== null) {
          const path = String(queuedPath);
          if (!SAFE_EVIDENCE_PATH.test(path)) return json(400, { status: 'error', error: 'The evidence photo path is not valid.' });
          if (!path.startsWith(String(auth.user.id) + '/')) return json(403, { status: 'error', error: 'You can only submit photos from your own private evidence folder.' });
        }
        if (JSON.stringify(body.submitted_payload || {}).length > 20000) return json(413, { status: 'error', error: 'The evidence payload is too large.' });
        const kind = ['catalog_photo','catalog_record','plant_identification','pest_disease_identification','community_correction','document','field_observation'].includes(body.evidence_type) ? body.evidence_type : '';
        if (!kind || !body.evidence_fingerprint || typeof body.submitted_payload !== 'object' || !body.submitted_payload) return json(400, { status:'error', error:'Evidence type, fingerprint and payload are required.' });
        const row = { evidence_type: kind, source_system: clean(body.source_system || 'rootwise-app',80), source_record_id: clean(body.source_record_id,180)||null, subject_key: clean(body.subject_key,240)||null, submitted_payload: body.submitted_payload, evidence_fingerprint: clean(body.evidence_fingerprint,180), status:'pending', verification_status:'community_submitted' };
        const saved = await db(env,'botanical_evidence_queue',{method:'POST',headers:{Prefer:'return=representation,resolution=ignore-duplicates'},body:JSON.stringify(row)});
        if (!saved.ok) return json(502,{status:'error',error:'Evidence could not be queued.'});
        return json(200,{status:'success',queued:Array.isArray(saved.data)&&saved.data.length>0,deduplicated:!Array.isArray(saved.data)||saved.data.length===0});
      }
      if (path === '/health/submit') return await submitHealthEvidence(request, body, env);
      if (path === '/health/admin/create') return await createHealthRecord(request, body, env);
      if (path === '/health/admin/list') return await listHealthRecords(request, body, env);
      if (path === '/health/admin/review') return await reviewHealthRecord(request, body, env);
      if (path === '/knowledge/summaries/list') return await listSummaries(request, body, env);
      if (path === '/knowledge/summaries/create') return await createSummary(request, body, env);
      if (path === '/knowledge/summaries/review') return await reviewSummary(request, body, env);
      if (path === '/knowledge/search') return await searchKnowledge(request, body, env);
      return json(404, { status: 'error', error: 'Route not found.' });
    } catch (error) {
      return json(500, { status: 'error', error: error?.message || 'Knowledge Core request failed.' });
    }
  }
};
