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
  const primaryUrl = clean(env.VERDE_PRIMARY_SUPABASE_URL || env.PRIMARY_SUPABASE_URL, 300).replace(/\/$/, '');
  const primaryKey = env.VERDE_PRIMARY_SUPABASE_ANON_KEY || env.PRIMARY_SUPABASE_ANON_KEY;
  const reviewUrl = clean(env.VERDE_REVIEW_SUPABASE_URL || env.REVIEW_SUPABASE_URL, 300).replace(/\/$/, '');
  const serviceKey = env.VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY || env.REVIEW_SUPABASE_SERVICE_ROLE_KEY;
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
  if (!response.ok || !user?.id) return { error: json(401, { status: 'error', error: 'Your session could not be verified.' }) };
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
    submitted_by: auth.user.id, submitted_by_email: clean(auth.user.email, 254) || null
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
    patch.verification_status = 'scientifically_verified';
    patch.verification_basis = basis;
  } else if (body.verification_status === 'source_supported') {
    if (!Array.isArray(body.source_references) || !body.source_references.length) {
      return json(400, { status: 'error', error: 'Add at least one source reference before marking this record source-supported.' });
    }
    patch.verification_status = 'source_supported';
    patch.source_references = body.source_references.slice(0, 20);
  } else {
    patch.verification_status = 'community_submitted';
  }
  const updated = await db(env, 'botanical_health_records?id=eq.' + body.record_id, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
  });
  if (!updated.ok) throw new Error('The health record review could not be saved.');
  return json(200, { status: 'success', record: Array.isArray(updated.data) ? updated.data[0] : null });
}

function makeChunks(summary, facts, critical, warnings) {
  const source = [summary, ...(Array.isArray(facts) ? facts : []), ...(Array.isArray(critical) ? critical : []), ...(Array.isArray(warnings) ? warnings.map(v => 'Safety warning: ' + (typeof v === 'string' ? v : v?.text || JSON.stringify(v))) : [])]
    .map(v => typeof v === 'string' ? clean(v, 5000) : clean(v?.text || v?.value || JSON.stringify(v), 1200))
    .filter(Boolean);
  const chunks = [];
  let current = '';
  for (const part of source) {
    const pieces = part.match(/[\s\S]{1,1100}(?:\s|$)/g) || [part];
    for (const piece of pieces) {
      const next = (current ? current + '\n' : '') + piece.trim();
      if (next.length > 1200 && current) { chunks.push(current); current = piece.trim(); }
      else current = next;
    }
  }
  if (current) {
    if (current.length < 20 && chunks.length) chunks[chunks.length - 1] += '\n' + current;
    else chunks.push(current);
  }
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
  const doc = await db(env, 'knowledge_documents?id=eq.' + body.document_id + '&select=id,status,original_name,citation&limit=1');
  if (!doc.ok || !Array.isArray(doc.data) || !doc.data[0]) return json(404, { status: 'error', error: 'The source document was not found.' });
  const latest = await db(env, 'knowledge_document_summaries?document_id=eq.' + body.document_id + '&select=version&order=version.desc&limit=1');
  const version = (latest.ok && Array.isArray(latest.data) && latest.data[0] ? Number(latest.data[0].version) : 0) + 1;
  const row = {
    document_id: body.document_id, version, summary,
    key_facts: Array.isArray(body.key_facts) ? body.key_facts.slice(0, 100) : [],
    critical_details: Array.isArray(body.critical_details) ? body.critical_details.slice(0, 100) : [],
    safety_warnings: Array.isArray(body.safety_warnings) ? body.safety_warnings.slice(0, 100) : [],
    source_pages: Array.isArray(body.source_pages) ? [...new Set(body.source_pages.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 300) : [],
    generation_method: body.generation_method === 'ai_assisted' ? 'ai_assisted' : 'human',
    model_name: clean(body.model_name, 80) || null,
    review_status: 'pending', created_by_email: clean(auth.user.email, 254) || null
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
  const chunks = makeChunks(summary.summary, summary.key_facts, summary.critical_details, summary.safety_warnings);
  if (!chunks.length) return json(400, { status: 'error', error: 'The summary contains no searchable text.' });
  const pageList = Array.isArray(summary.source_pages) ? summary.source_pages : [];
  const pageStart = pageList.length ? Math.min(...pageList) : null;
  const pageEnd = pageList.length ? Math.max(...pageList) : null;
  const rows = chunks.map((content, chunk_index) => ({ chunk_index, page_start: pageStart, page_end: pageEnd, content }));
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
  return json(200, {
    status: 'success', source: 'verde_knowledge_core', ai_used: false,
    answered: result.data.length > 0,
    answer: result.data.length ? result.data.map((hit, i) => '[' + (i + 1) + '] ' + hit.content + (hit.source_title ? ' (' + hit.source_title + (hit.page_start ? ', pages ' + hit.page_start + (hit.page_end && hit.page_end !== hit.page_start ? '-' + hit.page_end : '') : '') + ')' : '')).join('\n\n') : 'Not recorded in the approved botanical knowledge.',
    results: result.data
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'GET' && (path === '/' || path === '/health')) return json(200, { status: 'ok', worker: 'verde-botanical-knowledge-core', ai_used: false });
    if (request.method !== 'POST') return json(405, { status: 'error', error: 'Method not allowed.' });
    const body = await request.json().catch(() => ({}));
    try {
      if (path === '/health/submit') return await submitHealthEvidence(request, body, env);\n      if (path === '/health/admin/create') return await createHealthRecord(request, body, env);
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
