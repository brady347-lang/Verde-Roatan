/**
 * Verde Roatan - Botanical Constitution Worker (standalone; separate from the Gemini worker).
 *
 * The constitution is the written set of rules the Botanical Knowledge Center follows. This worker
 * lets administrators read and amend it, and lets the system STUDY ITSELF: it reads approvals,
 * rejections and identification results that already exist in the TV project and PROPOSES
 * amendments. It never changes a rule on its own, never edits a locked core rule, and its proposals
 * are written by fixed templates from counted facts, so it cannot invent anything.
 *
 * Worker variables (Cloudflare > Settings > Variables and Secrets):
 *   PRIMARY_SUPABASE_URL, PRIMARY_SUPABASE_ANON_KEY   (to verify the signed-in admin)
 *   REVIEW_SUPABASE_URL, REVIEW_SUPABASE_SERVICE_ROLE_KEY (secret)   (TV project, verde-roatan-db)
 *   VERDE_ADMIN_EMAILS
 * No AI key is used or needed.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400'
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// Thresholds: a pattern must be repeated before the system even proposes a rule.
const MIN_FIELD_EVENTS = 5;      // rejected/edited extractions for one field
const MIN_FIELD_RATE = 0.3;      // ...and at least 30% of that field's extractions
const MIN_DOUBTING_PEOPLE = 3;   // different customers who doubted the same AI identification
const MIN_ADMIN_REJECTIONS = 2;  // or administrators who rejected it

function tv(env) {
  const url = String(env.REVIEW_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.REVIEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('The botanical database is not configured.');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function rest(env, path, init = {}) {
  const c = tv(env);
  const res = await fetch(`${c.url}/rest/v1/${path}`, { ...init, headers: { ...c.headers, ...(init.headers || {}) } });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function requireAdmin(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { response: json(401, { status: 'error', error: 'Please sign in.' }) };
  const url = String(env.PRIMARY_SUPABASE_URL || '').replace(/\/$/, '');
  if (!url || !env.PRIMARY_SUPABASE_ANON_KEY) return { response: json(500, { status: 'error', error: 'Sign-in checking is not configured.' }) };
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: env.PRIMARY_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = res.ok ? await res.json().catch(() => null) : null;
  if (!user?.id) return { response: json(401, { status: 'error', error: 'Your session could not be verified. Please sign in again.' }) };
  const allowed = String(env.VERDE_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user.app_metadata?.role === 'admin' || (user.email && allowed.includes(String(user.email).toLowerCase()));
  if (!isAdmin) return { response: json(403, { status: 'error', error: 'Administrator access is required.' }) };
  return { user };
}

// ---- Self-study: counted facts from data that already exists. Read-only. ----
async function studySignals(env) {
  const [entities, reviews] = await Promise.all([
    rest(env, 'knowledge_entities?select=id,field_name,approval_status&limit=5000'),
    rest(env, 'identification_reviews?select=id,ai_scientific_name,user_decision,status,submitted_by&limit=5000')
  ]);
  if (!entities.ok || !Array.isArray(entities.data) || !reviews.ok || !Array.isArray(reviews.data)) {
    throw new Error('The botanical data could not be read.');
  }
  const signals = [];

  // 1. Extraction weak spots: which fields do reviewers reject or edit most?
  const byField = new Map();
  for (const e of entities.data) {
    const f = byField.get(e.field_name) || { total: 0, rejected: 0, modified: 0, ids: [] };
    f.total++;
    if (e.approval_status === 'rejected') { f.rejected++; if (f.ids.length < 5) f.ids.push(e.id); }
    if (e.approval_status === 'modified') { f.modified++; if (f.ids.length < 5) f.ids.push(e.id); }
    byField.set(e.field_name, f);
  }
  for (const [field, f] of byField) {
    const bad = f.rejected + f.modified;
    if (bad >= MIN_FIELD_EVENTS && bad / f.total >= MIN_FIELD_RATE) {
      const bucket = Math.floor(bad / MIN_FIELD_EVENTS) * MIN_FIELD_EVENTS;
      signals.push({
        signal_key: `extraction_field:${field}:${bucket}`,
        proposed_key: `check_${field}`.replace(/[^a-z0-9_]/g, '_').slice(0, 60),
        title: `Double-check extracted "${field}" facts`,
        body: `Extracted "${field}" facts were rejected or edited ${bad} times out of ${f.total} during review (${f.rejected} rejected, ${f.modified} edited). Treat every extracted "${field}" value as low confidence until an administrator has compared it with the quoted source snippet.`,
        rationale: `Reviewers changed or rejected ${bad} of ${f.total} extracted "${field}" facts.`,
        evidence: { source: 'knowledge_entities', field, total: f.total, rejected: f.rejected, modified: f.modified, sample_ids: f.ids }
      });
    }
  }

  // 2. Identifications that people or reviewers keep questioning (customer feedback = a hint only).
  const byName = new Map();
  for (const r of reviews.data) {
    const name = clean(r.ai_scientific_name, 160);
    if (!name) continue;
    const n = byName.get(name) || { doubters: new Set(), rejected: 0, ids: [] };
    if (['almost', 'not_my_plant'].includes(r.user_decision)) { n.doubters.add(r.submitted_by); if (n.ids.length < 5) n.ids.push(r.id); }
    if (r.status === 'rejected') { n.rejected++; if (n.ids.length < 5) n.ids.push(r.id); }
    byName.set(name, n);
  }
  for (const [name, n] of byName) {
    if (n.doubters.size >= MIN_DOUBTING_PEOPLE || n.rejected >= MIN_ADMIN_REJECTIONS) {
      const score = n.doubters.size + n.rejected * 2;
      const bucket = Math.floor(score / 3) * 3;
      signals.push({
        signal_key: `identification:${name.toLowerCase()}:${bucket}`,
        proposed_key: `caution_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.slice(0, 60),
        title: `Be cautious when identifying ${name}`,
        body: `AI identifications of "${name}" were questioned by ${n.doubters.size} different customers and rejected by reviewers ${n.rejected} times. Present this result as a possibility, never as certain, and ask for a clearer photo of leaves, flowers or fruit. Customer doubt is a hint only; it does not prove the identification wrong.`,
        rationale: `${n.doubters.size} customers doubted and ${n.rejected} reviews were rejected for "${name}".`,
        evidence: { source: 'identification_reviews', scientific_name: name, doubting_customers: n.doubters.size, admin_rejections: n.rejected, sample_ids: n.ids }
      });
    }
  }

  return {
    stats: {
      extracted_facts: entities.data.length,
      facts_rejected_or_edited: entities.data.filter((e) => ['rejected', 'modified'].includes(e.approval_status)).length,
      identification_submissions: reviews.data.length,
      identifications_doubted: reviews.data.filter((r) => ['almost', 'not_my_plant'].includes(r.user_decision)).length
    },
    signals
  };
}

// ---- Routes ----
async function listRules(env) {
  const r = await rest(env, 'constitution_rules?select=id,rule_key,title,body,locked,active,version,updated_by,updated_at&order=locked.desc,created_at.asc');
  if (!r.ok || !Array.isArray(r.data)) throw new Error('The constitution could not be read.');
  return r.data;
}

async function lessons(request, env) {
  const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
  const study = await studySignals(env);
  return json(200, { status: 'success', ...study });
}

async function propose(request, env) {
  const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
  const study = await studySignals(env);
  if (!study.signals.length) return json(200, { status: 'success', created: 0, message: 'No repeated mistakes found yet.', stats: study.stats });
  const keys = study.signals.map((s) => `"${s.signal_key.replace(/"/g, '')}"`).join(',');
  const existing = await rest(env, `constitution_amendments?select=signal_key&signal_key=in.(${encodeURIComponent(keys)})`);
  const seen = new Set((existing.ok && Array.isArray(existing.data) ? existing.data : []).map((e) => e.signal_key));
  const fresh = study.signals.filter((s) => !seen.has(s.signal_key));
  if (!fresh.length) return json(200, { status: 'success', created: 0, message: 'Everything found has already been proposed.', stats: study.stats });
  const rows = fresh.map((s) => ({
    kind: 'add_rule', proposed_key: s.proposed_key, proposed_title: s.title.slice(0, 160), proposed_body: s.body.slice(0, 2000),
    rationale: s.rationale.slice(0, 500), signal_key: s.signal_key, evidence: s.evidence, status: 'pending'
  }));
  const ins = await rest(env, 'constitution_amendments?on_conflict=signal_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows)
  });
  if (!ins.ok || !Array.isArray(ins.data)) throw new Error('The proposals could not be saved.');
  return json(200, { status: 'success', created: ins.data.length, stats: study.stats });
}

async function amendments(request, body, env) {
  const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
  const status = ['pending', 'approved', 'rejected'].includes(body.status) ? body.status : 'pending';
  const r = await rest(env, `constitution_amendments?status=eq.${status}&select=*&order=created_at.desc&limit=100`);
  if (!r.ok || !Array.isArray(r.data)) throw new Error('The proposals could not be read.');
  return json(200, { status: 'success', amendments: r.data });
}

async function saveRuleVersion(env, rule, by, note) {
  return rest(env, 'constitution_rule_versions', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ rule_id: rule.id, version: rule.version, title: rule.title, body: rule.body, changed_by: by, change_note: clean(note, 300) || null })
  });
}

async function decide(request, body, env) {
  const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
  if (!isUuid(body.amendment_id) || !['approve', 'reject'].includes(body.decision)) return json(400, { status: 'error', error: 'Choose an amendment and approve or reject.' });
  const found = await rest(env, `constitution_amendments?id=eq.${body.amendment_id}&select=*&limit=1`);
  const a = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!a) return json(404, { status: 'error', error: 'Proposal not found.' });
  if (a.status !== 'pending') return json(409, { status: 'error', error: 'This proposal was already decided.' });
  const by = String(auth.user.email || auth.user.id);
  const note = clean(body.note, 500) || null;
  const now = new Date().toISOString();
  const finish = (status) => rest(env, `constitution_amendments?id=eq.${a.id}&status=eq.pending`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, decided_by: by, decided_at: now, decision_note: note })
  });

  if (body.decision === 'reject') { await finish('rejected'); return json(200, { status: 'success', decision: 'rejected' }); }

  // The administrator may polish the wording before approving.
  const title = clean(body.title, 160) || a.proposed_title;
  const text = clean(body.body, 2000) || a.proposed_body;
  if (title.length < 3 || text.length < 10) return json(400, { status: 'error', error: 'The rule needs a title and some wording.' });

  if (a.kind === 'add_rule') {
    let key = a.proposed_key || 'rule';
    const clash = await rest(env, `constitution_rules?rule_key=eq.${encodeURIComponent(key)}&select=id&limit=1`);
    if (clash.ok && Array.isArray(clash.data) && clash.data.length) key = `${key}_${Date.now().toString(36)}`.slice(0, 60);
    const ins = await rest(env, 'constitution_rules', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ rule_key: key, title, body: text, locked: false, active: true, version: 1, updated_by: by })
    });
    if (!ins.ok || !Array.isArray(ins.data) || !ins.data[0]) throw new Error('The new rule could not be saved.');
    await saveRuleVersion(env, ins.data[0], by, `Approved amendment: ${a.rationale}`);
    await finish('approved');
    return json(200, { status: 'success', decision: 'approved', rule: ins.data[0] });
  }

  // revise_rule
  const target = await rest(env, `constitution_rules?id=eq.${a.target_rule_id}&select=*&limit=1`);
  const rule = target.ok && Array.isArray(target.data) ? target.data[0] : null;
  if (!rule) return json(404, { status: 'error', error: 'The rule to revise no longer exists.' });
  if (rule.locked) return json(409, { status: 'error', error: 'Core rules are locked and cannot be revised.' });
  const upd = await rest(env, `constitution_rules?id=eq.${rule.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ title, body: text, version: rule.version + 1, updated_by: by, updated_at: now })
  });
  if (!upd.ok || !Array.isArray(upd.data) || !upd.data[0]) throw new Error('The rule could not be updated.');
  await saveRuleVersion(env, upd.data[0], by, `Approved amendment: ${a.rationale}`);
  await finish('approved');
  return json(200, { status: 'success', decision: 'approved', rule: upd.data[0] });
}

// Direct edit of a NON-locked rule by an administrator (keeps history).
async function editRule(request, body, env) {
  const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
  if (!isUuid(body.rule_id)) return json(400, { status: 'error', error: 'Choose a rule.' });
  const found = await rest(env, `constitution_rules?id=eq.${body.rule_id}&select=*&limit=1`);
  const rule = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!rule) return json(404, { status: 'error', error: 'Rule not found.' });
  if (rule.locked) return json(409, { status: 'error', error: 'Core rules are locked and cannot be changed.' });
  const patch = { version: rule.version + 1, updated_by: String(auth.user.email || auth.user.id), updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = clean(body.title, 160);
  if (body.body !== undefined) patch.body = clean(body.body, 2000);
  if (typeof body.active === 'boolean') patch.active = body.active;
  if ((patch.title !== undefined && patch.title.length < 3) || (patch.body !== undefined && patch.body.length < 10)) return json(400, { status: 'error', error: 'The rule needs a title and some wording.' });
  const upd = await rest(env, `constitution_rules?id=eq.${rule.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  if (!upd.ok || !Array.isArray(upd.data) || !upd.data[0]) throw new Error('The rule could not be updated.');
  await saveRuleVersion(env, upd.data[0], patch.updated_by, body.note || 'Edited by administrator');
  return json(200, { status: 'success', rule: upd.data[0] });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && (path === '/' || path === '/health')) return json(200, { status: 'ok', worker: 'verde-roatan-constitution-worker' });
      // Public, read-only: the active rules, so the app or consultant can show them.
      if (request.method === 'GET' && path === '/constitution/public') {
        const rules = (await listRules(env)).filter((r) => r.active).map((r) => ({ key: r.rule_key, title: r.title, body: r.body, core: r.locked }));
        return json(200, { status: 'success', rules });
      }
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
      const body = await request.json().catch(() => ({}));
      if (path === '/constitution/rules') {
        const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
        return json(200, { status: 'success', rules: await listRules(env) });
      }
      if (path === '/constitution/lessons') return await lessons(request, env);
      if (path === '/constitution/propose') return await propose(request, env);
      if (path === '/constitution/amendments') return await amendments(request, body, env);
      if (path === '/constitution/decide') return await decide(request, body, env);
      if (path === '/constitution/edit-rule') return await editRule(request, body, env);
      return json(404, { error: 'Route not found' });
    } catch (e) {
      return json(500, { status: 'error', error: e?.message || 'Unexpected error' });
    }
  }
};
