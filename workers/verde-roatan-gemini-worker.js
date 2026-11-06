/**
 * Verde Roatán Gemini Worker
 * Production-ready Cloudflare Worker script for Verde Roatán Plant Intelligence.
 *
 * Capabilities:
 * - Gemini 3.8 Flash, falling back to 3.6 Flash only (see GEMINI_MODELS)
 * - Botanical specimen identification with 8-second accuracy window
 * - Continuous secondary taxonomic refinement (/refine) for Roatán microclimate
 * - Tropical pathology & organic pest diagnostics (mode: 'pest')
 * - Personalized Garden Advisor (/garden-advisor)
 * - Complete CORS, JSON schema validation, and island fallback engine
 *
 * Environment Secrets / Variables required in Cloudflare Worker settings:
 * - GEMINI_API_KEY (Google AI Studio / Gemini API Key)
 * - REVIEW_SUPABASE_URL (optional: curated botanical taxonomy cross-check)
 * - REVIEW_SUPABASE_SERVICE_ROLE_KEY (optional secret; never expose to the client)
 * - PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY (used by authenticated review routes)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400'
};

// Reference photos are never guessed or selected from a generic stock-photo bank.
// The recognition response may include only curator-approved images linked to an exact
// scientific-name match in the separate botanical reference database.

/**
 * Model policy: only the latest Gemini Flash model and the one before it. Older generations
 * (1.5, 2.0, 2.5) and moving aliases are not used anywhere. No environment override, so a stale
 * setting can never bring a retired model back. When Google ships a newer model, update this list.
 * (gemini-3.7-flash is only an alias of 3.8, so 3.6 is the real previous model.)
 */
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash'
];

function parseModelJson(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('The AI model returned a response that was not valid JSON.');
  }
}

async function callGemini(env, apiKey, parts, { totalMs = 30000, perCallMs = 12000 } = {}) {
  const models = GEMINI_MODELS;
  const deadline = Date.now() + totalMs;
  let lastError = 'No Gemini model responded.';

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(perCallMs, remaining));
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.2 }
          })
        }
      );
      if (!res.ok) {
        lastError = `Gemini ${model} error ${res.status}`;
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = `Gemini ${model} returned an empty response.`;
        continue;
      }
      return { parsed: parseModelJson(text), model };
    } catch (err) {
      lastError = err?.name === 'AbortError' ? `Gemini ${model} timed out.` : (err?.message || lastError);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Health check
    if (pathname === '/health' || pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: 'Verde Roatán Gemini Worker',
          version: '3.1.0',
          model: GEMINI_MODELS[0],
          time: new Date().toISOString()
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // App updates: the repository is private, so the app asks this worker (which holds a read-only
    // GitHub token) for the latest APK release. Needs GITHUB_RELEASE_TOKEN (secret) and GITHUB_REPO.
    if (request.method === 'GET' && pathname === '/app/update') return await handleAppUpdate(env);
    if (request.method === 'GET' && pathname === '/app/download') return await handleAppDownload(env);

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY;

    try {
      // The PDF upload sends raw bytes, so it must be handled before the JSON body is parsed.
      if (pathname === '/knowledge/upload') return await handleKnowledgeUpload(request, url, env);

      const body = await request.json().catch(() => ({}));

      // Authenticated review submission uses the primary app session and writes
      // through a server-only service-role key to the separate review project.
      if (pathname === '/identification-review') {
        return await handleIdentificationReview(request, body, env);
      }
      if (pathname === '/identification-review/admin/list') {
        return await handleIdentificationReviewAdminList(request, body, env);
      }
      if (pathname === '/identification-review/admin/review') {
        return await handleIdentificationReviewAdmin(request, body, env);
      }

      // Administrator-only bulk botanical import (records live in the separate TV project).
      if (pathname === '/botanical-import/existing') return await handleBotanicalImportExisting(request, env);
      if (pathname === '/botanical-import/validate') return await handleBotanicalImportValidate(request, body, env);
      if (pathname === '/botanical-import/commit') return await handleBotanicalImportCommit(request, body, env);

      // Public botanical intelligence: PostgreSQL search and care rules. No AI key is needed.
      if (pathname === '/botanical/search') return await handleBotanicalSearch(body, env);
      if (pathname === '/botanical/care') return await handleBotanicalCare(body, env);

      // Botanical Knowledge Center (administrators only) - documents, review, RAG.
      if (pathname.startsWith('/knowledge/')) {
        const handler = KNOWLEDGE_ROUTES[pathname.slice('/knowledge/'.length)];
        if (handler) return await handler(request, body, env);
      }

      // Review endpoints do not call Gemini and must remain available even if
      // the Gemini secret is temporarily missing or being rotated.
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            status: 'error',
            error: 'GEMINI_API_KEY is not configured in worker environment.'
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Route 0: AI-assisted column mapping for bulk imports (administrators only)
      if (pathname === '/botanical-import/map-columns') {
        return await handleBotanicalImportMapColumns(request, body, apiKey, env);
      }

      // Route 1: Refine Identification (Continuous Accuracy Pass)
      if (pathname === '/refine' || pathname === '/api/refine') {
        return await handleRefine(body, apiKey, env);
      }

      // Route 2: Garden Advisor
      if (pathname === '/garden-advisor' || pathname === '/api/garden-advisor') {
        return await handleGardenAdvisor(body, apiKey, env);
      }

      // Route 3: Initial Identification / Pest Diagnosis
      return await handleAnalyze(body, apiKey, env);
    } catch (err) {
      return new Response(
        JSON.stringify({ status: 'error', error: err.message || 'Worker processing failed' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }
};

/**
 * Cross-check Gemini's proposed taxon against the curated botanical reference database.
 * This is deliberately an exact scientific-name match: fuzzy search results are suggestions,
 * not proof. Database outages never block the original AI identification.
 */
async function crossCheckBotanicalIdentification(parsed, env) {
  const record = parsed?.verified_botanical_record;
  if (record) record.verified_images = [];
  const scientificName = String(record?.scientific_name || parsed?.candidates?.[0]?.scientific_name || '').trim();
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9×]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!scientificName) return { status: 'not_checked', reason: 'No scientific name was returned by the model.' };

  let tv;
  try { tv = reviewDatabaseConfig(env); }
  catch { return { status: 'unavailable', reason: 'The botanical reference database is not configured.' }; }

  try {
    const response = await tvJson(await fetch(`${tv.url}/rest/v1/rpc/botanical_search`, {
      method: 'POST',
      headers: tvHeaders(tv.key),
      body: JSON.stringify({
        q: scientificName, p_family: null, p_sun: null, p_water: null,
        p_min_salt: null, p_pet_safe: false, p_native: false, lim: 10
      })
    }));
    if (!response.ok || !Array.isArray(response.data)) {
      return { status: 'unavailable', reason: 'The botanical reference search is not available.' };
    }

    const target = normalize(scientificName);
    const exact = response.data.find((row) => normalize(row.scientific_name) === target);
    if (!exact) {
      if (record) record.verified_images = [];
      return {
        status: 'not_found',
        match_basis: 'exact_scientific_name',
        proposed_scientific_name: scientificName,
        message: 'No exact scientific-name match was found in the curated botanical database. The AI result remains an unverified suggestion.'
      };
    }

    let referenceImages = [];
    const imageResponse = await tvJson(await fetch(
      `${tv.url}/rest/v1/botanical_taxon_images?taxon_id=eq.${encodeURIComponent(exact.id)}&review_status=eq.approved&visibility=eq.public&select=image_url,image_type,source_name,source_url,attribution,license&order=created_at.asc&limit=8`,
      { headers: tvHeaders(tv.key) }
    ));
    if (imageResponse.ok && Array.isArray(imageResponse.data)) {
      referenceImages = imageResponse.data
        .filter((image) => typeof image.image_url === 'string' && /^https:\/\//i.test(image.image_url))
        .map((image) => ({
          image_url: image.image_url,
          image_type: image.image_type,
          description: image.attribution || image.source_name || 'Curator-approved botanical reference',
          source_url: image.source_url || null,
          license: image.license || null
        }));
    }

    if (record) {
      record.verified_images = referenceImages;
      record.reference_database = {
        taxon_id: exact.id,
        scientific_name: exact.scientific_name,
        common_name: exact.common_name,
        family: exact.family,
        verification_status: exact.verification_status
      };
    }
    return {
      status: 'exact_match',
      match_basis: 'exact_scientific_name',
      database_verification_status: exact.verification_status || 'unverified',
      reference_image_count: referenceImages.length,
      message: exact.verification_status === 'scientifically_verified'
        ? 'The exact scientific name exists in the curated database and is scientifically verified there.'
        : 'The exact scientific name exists in the curated database, but that record is not scientifically verified.'
    };
  } catch {
    return { status: 'unavailable', reason: 'The botanical reference database could not be reached.' };
  }
}

/**
 * Handle initial Plant / Pest Identification with Gemini 3.8 Flash
 */
async function handleAnalyze(body, apiKey, env) {
  const { mode = 'plant', image, lang = 'en' } = body;
  if (!image) {
    return new Response(JSON.stringify({ status: 'error', error: 'Missing image payload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  let mimeType = 'image/jpeg';
  let base64Data = image;
  if (image.includes(',')) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    } else {
      base64Data = image.split(',')[1];
    }
  }

  const prompt =
    mode === 'pest'
      ? `You are a tropical plant pathologist specializing in Roatán, Honduras ornamental diseases and pests.
Analyze this photo carefully for chlorosis, honeydew, sooty mold, mealybugs, scales, mites, or caterpillars.
Respond ONLY with a valid JSON object matching:
{
  "status": "success",
  "model_used": "Gemini 3.8 Flash Botanical Pathology",
  "matched": true,
  "result": {
    "primary_diagnosis": "Name of pest or disease",
    "scientific_name": "Scientific Latin genus/species",
    "severity": "Mild / Moderate / Severe",
    "symptoms": ["Detailed symptom 1", "Detailed symptom 2", "Detailed symptom 3"],
    "likely_cause": "Ecological causes in Roatán tropical climate and soil",
    "treatment": ["Step 1 organic treatment", "Step 2 organic treatment", "Step 3 maintenance"],
    "prevention": ["Prevention tip 1", "Prevention tip 2"]
  }
}
Language: ${lang === 'es' ? 'Spanish (Español)' : 'English'}`
      : `You are an expert tropical botanist and taxonomist with deep specialization in Caribbean and Roatán flora.
Carefully examine the specimen photo with high botanical rigor:
1. Examine leaf morphology, margins, and venation.
2. Examine stem, trunk, aerial roots, bark, or petiole structure.
3. Distinguish between different tropical families (Araceae, Arecaceae, Apocynaceae, Malvaceae, Nyctaginaceae, Euphorbiaceae, Asparagaceae).
DO NOT DEFAULT TO COCONUT PALM unless the specimen is genuinely Cocos nucifera.

Respond ONLY with a valid JSON object matching:
{
  "status": "success",
  "matched": true,
  "model_used": "Gemini 3.8 Flash Botanical Intelligence",
  "candidates": [
    { "common_name": "Accurate Primary Common Name", "scientific_name": "Genus species", "confidence_score": 0.96 }
  ],
  "verified_botanical_record": {
    "common_name": "Accurate Primary Common Name",
    "scientific_name": "Genus species var.",
    "plant_family": "Family Name",
    "alternative_names": ["Alternative Common Name 1"],
    "botanical_description": "Comprehensive botanical description covering distinctive leaves, flowers, growth habit, and landscape use in Roatán.",
    "characteristics": {
      "salt_tolerance_rating": 2,
      "native_to_bay_islands": false
    },
    "care": {
      "sunlight_requirement": "full_tropical_sun",
      "watering_frequency_days": 3,
      "watering_instructions": "Practical watering instructions for Roatan tropical climate",
      "soil_requirements": "Soil composition and drainage for Roatan coralline limestone or sandy loam",
      "fertilization_instructions": "Fertilizer formulation and frequency",
      "pruning_instructions": "Pruning guidelines"
    }
  }
}
Language: ${lang === 'es' ? 'Spanish (Español)' : 'English'}`;

  const { parsed, model } = await callGemini(env, apiKey, [
    { inline_data: { mime_type: mimeType, data: base64Data } },
    { text: prompt }
  ]);
  parsed.status = 'success';
  parsed.model_used = model;

  if (mode !== 'pest') {
    parsed.database_crosscheck = await crossCheckBotanicalIdentification(parsed, env);
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle Continuous Accuracy Refinement (/refine)
 */
async function handleRefine(body, apiKey, env) {
  const { mode = 'plant', image, initialResult, lang = 'en' } = body;
  const tentativeCommon =
    initialResult?.verified_botanical_record?.common_name ||
    initialResult?.candidates?.[0]?.common_name ||
    initialResult?.result?.primary_diagnosis ||
    'Specimen';
  const tentativeSci =
    initialResult?.verified_botanical_record?.scientific_name ||
    initialResult?.candidates?.[0]?.scientific_name ||
    '';

  let mimeType = 'image/jpeg';
  let base64Data = image;
  if (image && image.includes(',')) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    } else {
      base64Data = image.split(',')[1];
    }
  }

  const prompt = `You are the chief botanist at the Roatán Botanical Herbarium conducting a secondary deep accuracy verification.
Preliminary identification: "${tentativeCommon}" (${tentativeSci}).
Audit the specimen with highest taxonomic rigor:
1. Verify exact species vs Caribbean lookalikes.
2. Confirm the exact Latin binomial and current botanical family.
3. Validate Bay Islands native/naturalized status, and salt spray rating (1=Low, 2=Moderate, 3=Beachfront).
4. Provide Roatan-specific care guidelines tailored to local coralline limestone and seasonal tropical rain cycles.

Respond ONLY with a valid JSON object matching:
{
  "status": "success",
  "is_refined": true,
  "refinement_stage": "verified",
  "model_used": "Gemini 3.8 Flash Deep Herbarium Refinement",
  "matched": true,
  "candidates": [
    { "common_name": "Verified Common Name", "scientific_name": "Exact Genus species", "confidence_score": 0.98 }
  ],
  "verified_botanical_record": {
    "common_name": "Verified Common Name",
    "scientific_name": "Exact Genus species",
    "plant_family": "Accurate Family",
    "alternative_names": ["Alternative Name 1"],
    "botanical_description": "Exhaustive botanical description verifying distinctive morphology and landscaping role in Roatan.",
    "characteristics": {
      "salt_tolerance_rating": 2,
      "native_to_bay_islands": false
    },
    "care": {
      "sunlight_requirement": "full_tropical_sun",
      "watering_frequency_days": 3,
      "watering_instructions": "Refined watering guidelines for Roatan wet/dry cycles",
      "soil_requirements": "Refined soil and limestone drainage recipe",
      "fertilization_instructions": "Balanced tropical nutrient schedule",
      "pruning_instructions": "Detailed canopy maintenance advice"
    }
  }
}
Language: ${lang === 'es' ? 'Spanish (Español)' : 'English'}`;

  const { parsed, model } = await callGemini(env, apiKey, [
    ...(base64Data ? [{ inline_data: { mime_type: mimeType, data: base64Data } }] : []),
    { text: prompt }
  ]);
  parsed.status = 'success';
  parsed.model_used = model;
  parsed.is_refined = true;
  parsed.refinement_stage = 'verified';

  parsed.database_crosscheck = await crossCheckBotanicalIdentification(parsed, env);

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle Garden Advisor Recommendations
 */
async function handleGardenAdvisor(body, apiKey, env) {
  const { conditions = '', goals = '', catalogItems = [], lang = 'en' } = body;
  const prompt = `You are an expert tropical horticulturalist and landscape architect specializing in the island of Roatán, Honduras.
A shopper wants personalized recommendations from our nursery catalog based on their garden conditions and goals.

SHOPPER CONDITIONS: ${conditions || 'Tropical island garden'}
SHOPPER GOALS: ${goals || 'Lush tropical landscaping'}
CATALOG SUMMARY: ${JSON.stringify(catalogItems.slice(0, 25))}

Respond ONLY with a valid JSON object matching:
{
  "status": "success",
  "summary": "Overview of the tailored garden strategy",
  "conditions_assessment": {
    "sun_and_microclimate": "Assessment of sun & exposure",
    "soil_and_drainage": "Soil prep tips for Roatan limestone or clay",
    "wind_and_salt_tolerance": "Strategy for coastal winds and salt"
  },
  "recommendations": [
    {
      "product_id": "exact ID from catalog",
      "product_name": "exact Name from catalog",
      "match_score": 98,
      "why_it_fits": "Specific reason why this fits",
      "care_and_placement_tip": "Specific care tip"
    }
  ],
  "island_pro_tips": ["Practical Roatan tip 1", "Practical Roatan tip 2"]
}
Language: ${lang === 'es' ? 'Spanish (Español)' : 'English'}`;

  const { parsed, model } = await callGemini(env, apiKey, [{ text: prompt }]);
  parsed.status = 'success';
  parsed.model_used = model;

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}


/**
 * Verify the existing Verde app session, then store review evidence in the
 * separate Verde Roatan DB. Service-role credentials remain server-side.
 *
 * Required Cloudflare secrets/vars:
 * PRIMARY_SUPABASE_URL
 * PRIMARY_SUPABASE_ANON_KEY
 * REVIEW_SUPABASE_URL
 * REVIEW_SUPABASE_SERVICE_ROLE_KEY
 */
async function verifyPrimaryUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Please sign in before submitting identification feedback.');

  const primaryUrl = String(env.PRIMARY_SUPABASE_URL || '').replace(/\/$/, '');
  const primaryKey = env.PRIMARY_SUPABASE_ANON_KEY;
  if (!primaryUrl || !primaryKey) throw new Error('Identification review authentication is not configured.');

  const response = await fetch(`${primaryUrl}/auth/v1/user`, {
    headers: { apikey: primaryKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Your session could not be verified. Please sign in again.');
  const user = await response.json();
  if (!user?.id) throw new Error('Your signed-in account could not be verified.');
  return user;
}

function isVerifiedReviewAdmin(user, env) {
  const allowedEmails = String(env.VERDE_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return user.app_metadata?.role === 'admin' ||
    Boolean(user.email && allowedEmails.includes(String(user.email).toLowerCase()));
}

function reviewDatabaseConfig(env) {
  const url = String(env.REVIEW_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.REVIEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('The separate identification review database is not configured yet.');
  return { url, key };
}

async function handleIdentificationReview(request, body, env) {
  const user = await verifyPrimaryUser(request, env);
  const { url, key } = reviewDatabaseConfig(env);
  const image = String(body.image || '');
  if (!image.startsWith('data:image/')) {
    return new Response(JSON.stringify({ status: 'error', error: 'The original specimen photo is required.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  const imageMatch = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!imageMatch) {
    return new Response(JSON.stringify({ status: 'error', error: 'Use a JPEG, PNG, or WebP image.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const mimeType = imageMatch[1];
  const binary = atob(imageMatch[2]);
  if (binary.length > 12 * 1024 * 1024) {
    return new Response(JSON.stringify({ status: 'error', error: 'The review photo must be smaller than 12 MB.' }), {
      status: 413, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  const ai = body.identification || {};
  // 'corrected' is the older name for "Almost, but something is wrong".
  const decision = body.decision === 'corrected' ? 'almost' : String(body.decision || 'confirmed');
  if (!['confirmed', 'almost', 'not_my_plant'].includes(decision)) {
    return new Response(JSON.stringify({ status: 'error', error: 'Choose one of the three answers.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const correctedCommon = String(body.corrected_common_name || '').trim().slice(0, 160);
  const correctedScientific = String(body.corrected_scientific_name || '').trim().slice(0, 160);
  const noteText = String(body.notes || '').trim();
  if (decision === 'almost' && !correctedCommon && !correctedScientific && noteText.length < 3) {
    return new Response(JSON.stringify({ status: 'error', error: 'Please tell us what is wrong or enter the correct plant name.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const reviewId = crypto.randomUUID();
  const objectPath = `${user.id}/${reviewId}.${extension}`;
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const upload = await fetch(`${url}/storage/v1/object/identification-review-images/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': mimeType,
      'x-upsert': 'false'
    },
    body: bytes
  });
  if (!upload.ok) {
    const message = await upload.text();
    throw new Error(`Could not store the private review photo: ${message.slice(0, 240)}`);
  }

  const candidate = ai.candidate || {};
  const sciName = String(candidate.scientific_name || '').trim();
  const sciParts = sciName.split(/\s+/);
  const source = body.source && typeof body.source === 'object' ? body.source : {};
  const cut = (v, n) => (String(v || '').trim().slice(0, n) || null);
  const keepsSuggestion = decision !== 'confirmed';
  const baseRecord = {
    id: reviewId,
    submitted_by: user.id,
    image_path: objectPath,
    identification_mode: 'plant',
    ai_common_name: cut(candidate.common_name, 160),
    ai_scientific_name: cut(sciName, 160),
    ai_confidence: Number.isFinite(Number(candidate.confidence_score))
      ? Math.max(0, Math.min(1, Number(candidate.confidence_score)))
      : null,
    proposed_common_name: keepsSuggestion ? correctedCommon || null : null,
    proposed_scientific_name: keepsSuggestion ? correctedScientific || null : null,
    submitter_notes: noteText.slice(0, 1000) || null,
    status: 'pending'
  };
  // Added by the identification_verification migration. A user's "Yes" only reaches user_confirmed;
  // scientific verification is an administrator action and is never set here.
  const richRecord = {
    ...baseRecord,
    ai_family: cut(ai.family || candidate.family, 120),
    ai_genus: cut(ai.genus || (sciParts.length >= 1 ? sciParts[0] : ''), 80),
    ai_species: cut(ai.species || (sciParts.length >= 2 ? sciParts[1] : ''), 80),
    ai_model: cut(ai.model_used, 80),
    user_decision: decision,
    source_app: cut(source.app, 40),
    source_platform: cut(source.platform, 40),
    source_language: cut(source.language, 10),
    verification_level: decision === 'confirmed' ? 'user_confirmed' : 'ai_identified'
  };
  const postReview = (record) => fetch(`${url}/rest/v1/identification_reviews`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(record)
  });
  let insert = await postReview(richRecord);
  let inserted = await insert.json().catch(() => []);
  let migrated = true;
  if (!insert.ok && ['PGRST204', '42703', '23514'].includes(String(inserted?.code))) {
    // The verification migration has not been applied yet: save with the original columns so users are never blocked.
    migrated = false;
    insert = await postReview(baseRecord);
    inserted = await insert.json().catch(() => []);
  }
  if (!insert.ok || !Array.isArray(inserted) || !inserted[0]) {
    await fetch(`${url}/storage/v1/object/identification-review-images/${objectPath}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }
    }).catch(() => undefined);
    throw new Error('The identification review could not be saved to the review database.');
  }
  const postConfirmation = (decisionValue) => fetch(`${url}/rest/v1/identification_confirmations`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      review_id: reviewId,
      user_id: user.id,
      decision: decisionValue,
      corrected_common_name: keepsSuggestion ? correctedCommon || null : null,
      corrected_scientific_name: keepsSuggestion ? correctedScientific || null : null,
      notes: noteText.slice(0, 1000) || null
    })
  });
  let confirmation = await postConfirmation(decision);
  if (!confirmation.ok && !migrated) confirmation = await postConfirmation(decision === 'confirmed' ? 'confirmed' : 'corrected');
  if (!confirmation.ok) {
    // Roll back the pending review and private photo so the user is not left
    // with a review record that has no matching confirmation evidence.
    await fetch(`${url}/rest/v1/identification_reviews?id=eq.${reviewId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    }).catch(() => undefined);
    await fetch(`${url}/storage/v1/object/identification-review-images/${objectPath}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    }).catch(() => undefined);
    throw new Error('The review could not be completed. Please try again.');
  }

  return new Response(JSON.stringify({
    status: 'success',
    review_id: reviewId,
    review_status: 'pending',
    verification_level: migrated ? richRecord.verification_level : 'ai_identified',
    message: 'Thank you. Your feedback has been saved for botanical review.'
  }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

async function handleIdentificationReviewAdminList(request, body, env) {
  const user = await verifyPrimaryUser(request, env);
  if (!isVerifiedReviewAdmin(user, env)) {
    return new Response(JSON.stringify({ status: 'error', error: 'Administrator access is required.' }), {
      status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const { url, key } = reviewDatabaseConfig(env);
  const requestedStatus = ['pending', 'approved', 'rejected'].includes(body.status) ? body.status : 'pending';
  const response = await fetch(
    `${url}/rest/v1/identification_reviews?status=eq.${requestedStatus}&select=*&order=created_at.desc&limit=100`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) throw new Error('The identification review queue could not be loaded.');

  const reviews = await Promise.all(rows.map(async (row) => {
    const signed = await fetch(
      `${url}/storage/v1/object/sign/identification-review-images/${row.image_path}`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: 1800 })
      }
    );
    const signedData = await signed.json().catch(() => ({}));
    return {
      ...row,
      image_url: signed.ok && signedData.signedURL
        ? (String(signedData.signedURL).startsWith('http')
          ? signedData.signedURL
          : `${url}/storage/v1${signedData.signedURL}`)
        : null
    };
  }));

  return new Response(JSON.stringify({ status: 'success', reviews }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

async function handleIdentificationReviewAdmin(request, body, env) {
  const user = await verifyPrimaryUser(request, env);
  if (!isVerifiedReviewAdmin(user, env)) {
    return new Response(JSON.stringify({ status: 'error', error: 'Administrator access is required.' }), {
      status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const { url, key } = reviewDatabaseConfig(env);
  const reviewId = String(body.review_id || '');
  const status = body.status;
  if (!/^[0-9a-f-]{36}$/i.test(reviewId) || !['approved', 'rejected'].includes(status)) {
    return new Response(JSON.stringify({ status: 'error', error: 'A valid review ID and approval status are required.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
  const patch = {
    status,
    admin_notes: String(body.admin_notes || '').slice(0, 1000) || null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString()
  };
  // Approving a submission accepts it into the community dataset. It does NOT make it scientifically
  // verified. Verification is a separate, explicit act that needs a written basis.
  if (body.verify) {
    const basis = String(body.verify.basis || '').trim();
    if (status !== 'approved') return jsonResponse(400, { status: 'error', error: 'Only an approved submission can be scientifically verified.' });
    if (basis.length < 10) return jsonResponse(400, { status: 'error', error: 'Describe the scientific basis (reference, herbarium, expert) in at least 10 characters.' });
    patch.verification_level = 'scientifically_verified';
    patch.verified_by = user.id;
    patch.verified_at = patch.reviewed_at;
    patch.verification_basis = basis.slice(0, 1000);
  } else if (status === 'rejected') {
    // A rejected submission cannot keep a scientific verification.
    patch.verified_by = null; patch.verified_at = null; patch.verification_basis = null;
  }
  const response = await fetch(`${url}/rest/v1/identification_reviews?id=eq.${reviewId}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || !rows.length) {
    if (['PGRST204', '42703'].includes(String(rows?.code)) && (body.verify || status === 'rejected')) {
      return jsonResponse(409, { status: 'error', error: 'Scientific verification is not set up yet. Apply the identification_verification migration.' });
    }
    if (String(rows?.code) === '23514') return jsonResponse(409, { status: 'error', error: 'That change is not allowed for this record.' });
    throw new Error('The review could not be updated.');
  }
  return jsonResponse(200, { status: 'success', review: rows[0] });
}

// ---------------------------------------------------------------------------------------------
// App updates (latest APK from the private GitHub repository's newest release)
// ---------------------------------------------------------------------------------------------
async function latestApkRelease(env) {
  const repo = String(env.GITHUB_REPO || '').trim();
  const token = String(env.GITHUB_RELEASE_TOKEN || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return { error: 'not_configured' };
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'verde-roatan-worker' }
  });
  if (!res.ok) return { error: 'github_' + res.status };
  const release = await res.json().catch(() => null);
  const asset = (release?.assets || []).find((a) => /\.apk$/i.test(a.name));
  const match = /build_number=(\d+)/.exec(String(release?.body || ''));
  if (!asset || !match) return { error: 'no_apk_release' };
  return { release, asset, build: Number(match[1]), token };
}

async function handleAppUpdate(env) {
  const latest = await latestApkRelease(env);
  const headers = { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (latest.error) return new Response(JSON.stringify({ status: 'unavailable', reason: latest.error }), { status: 200, headers });
  const notes = String(latest.release.body || '').replace(/build_number=\d+\s*/, '').trim().slice(0, 300);
  return new Response(JSON.stringify({
    status: 'success',
    build_number: latest.build,
    version_name: String(latest.release.name || '').replace(/^Verde Roatan\s*/i, '') || String(latest.build),
    notes
  }), { status: 200, headers });
}

async function handleAppDownload(env) {
  const latest = await latestApkRelease(env);
  if (latest.error) return new Response('Update service is not available.', { status: 503, headers: CORS_HEADERS });
  const file = await fetch(latest.asset.url, {
    headers: { Authorization: `Bearer ${latest.token}`, Accept: 'application/octet-stream', 'User-Agent': 'verde-roatan-worker' },
    redirect: 'follow'
  });
  if (!file.ok || !file.body) return new Response('The update file could not be downloaded.', { status: 502, headers: CORS_HEADERS });
  return new Response(file.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="Verde-Roatan.apk"',
      'Cache-Control': 'no-store'
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Bulk botanical import (administrators only). Records are written to the TV project's
// botanical_taxa table with the server-only service-role key. Existing records are never
// overwritten, and prices / stock / suppliers are not part of the accepted fields.
// ---------------------------------------------------------------------------------------------
const IMPORT_TEXT_FIELDS = [
  'genus', 'species', 'family', 'description', 'habitat', 'distribution', 'sunlight', 'water',
  'soil', 'propagation', 'toxicity', 'pests_diseases', 'climate', 'growth_habit'
];
const IMPORT_MAP_TARGETS = [
  'scientific_name', 'common_name', 'family', 'genus', 'species', 'synonyms', 'description', 'habitat',
  'distribution', 'sunlight', 'water', 'soil', 'propagation', 'toxicity', 'pests_diseases', 'climate',
  'growth_habit', 'native_to_bay_islands', 'references', 'reference_photo_url'
];
const MAX_IMPORT_ROWS = 500;

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

async function requireImportAdmin(request, env) {
  let user;
  try {
    user = await verifyPrimaryUser(request, env);
  } catch (e) {
    return { response: jsonResponse(401, { status: 'error', error: e.message || 'Please sign in.' }) };
  }
  if (!isVerifiedReviewAdmin(user, env)) {
    return { response: jsonResponse(403, { status: 'error', error: 'Administrator access is required.' }) };
  }
  return { user };
}

function importNameKey(canonical) {
  return String(canonical || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function handleBotanicalImportExisting(request, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const { url, key } = reviewDatabaseConfig(env);
  const res = await fetch(
    `${url}/rest/v1/botanical_taxa?select=scientific_name,common_name&order=scientific_name.asc&limit=5000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(rows)) {
    return jsonResponse(502, { status: 'error', error: 'The botanical records database could not be read. Has the botanical_taxa migration been applied?' });
  }
  return jsonResponse(200, { status: 'success', records: rows });
}

async function handleBotanicalImportValidate(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const names = Array.isArray(body.names)
    ? [...new Set(body.names.map((n) => String(n || '').trim()).filter(Boolean))].slice(0, 40)
    : [];
  const results = await Promise.all(names.map(async (name) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(
        `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&kingdom=Plantae&verbose=false`,
        { signal: controller.signal, headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return { name, match: 'UNAVAILABLE' };
      const d = await res.json();
      return {
        name,
        match: d.matchType || 'NONE',
        status: d.status || null,
        canonical: d.canonicalName || null,
        family: d.family || null,
        kingdom: d.kingdom || null,
        confidence: typeof d.confidence === 'number' ? d.confidence : null
      };
    } catch {
      return { name, match: 'UNAVAILABLE' };
    } finally {
      clearTimeout(timer);
    }
  }));
  return jsonResponse(200, { status: 'success', source: 'GBIF Backbone Taxonomy', results });
}

async function handleBotanicalImportCommit(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const email = String(auth.user.email || 'unknown');
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return jsonResponse(400, { status: 'error', error: 'There are no approved rows to import.' });
  if (rows.length > MAX_IMPORT_ROWS) {
    return jsonResponse(400, { status: 'error', error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` });
  }
  const { url, key } = reviewDatabaseConfig(env);
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const text = (v, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 50) : []);

  const prepared = [];
  const rejected = [];
  const seen = new Set();
  for (const r of rows) {
    const scientific = text(r?.scientific_name, 200);
    const common = text(r?.common_name, 200);
    const nameKey = importNameKey(scientific);
    if (!scientific || !common || !/^[a-z×]/i.test(scientific) || !nameKey.includes(' ')) {
      rejected.push({ name: scientific || '(missing)', reason: 'Needs a scientific name (genus + species) and a common name.' });
      continue;
    }
    if (seen.has(nameKey)) { rejected.push({ name: scientific, reason: 'Duplicate inside this import.' }); continue; }
    seen.add(nameKey);
    const rec = {
      scientific_name: scientific,
      name_key: nameKey,
      common_name: common,
      synonyms: list(r.synonyms),
      scientific_references: list(r.references),
      native_to_bay_islands: typeof r.native_to_bay_islands === 'boolean' ? r.native_to_bay_islands : null,
      reference_photo_url: typeof r.reference_photo_url === 'string' && /^https:\/\//i.test(r.reference_photo_url)
        ? r.reference_photo_url.slice(0, 1000) : null,
      taxonomy_check: r.taxonomy_check && typeof r.taxonomy_check === 'object'
        ? { match: String(r.taxonomy_check.match || '').slice(0, 20), status: r.taxonomy_check.status ? String(r.taxonomy_check.status).slice(0, 20) : null,
            canonical: r.taxonomy_check.canonical ? String(r.taxonomy_check.canonical).slice(0, 200) : null, source: 'GBIF' }
        : null,
      record_status: 'published',
      source_type: 'bulk_import',
      verification_status: 'unverified',
      created_by_email: email
    };
    for (const f of IMPORT_TEXT_FIELDS) rec[f] = text(r[f]);
    prepared.push(rec);
  }
  if (prepared.length === 0) {
    return jsonResponse(400, { status: 'error', error: 'None of the rows could be imported.', rejected });
  }

  const batchRes = await fetch(`${url}/rest/v1/botanical_import_batches`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ filename: String(body.filename || 'import').slice(0, 200), uploaded_by_email: email, row_count: rows.length })
  });
  const batch = await batchRes.json().catch(() => null);
  if (!batchRes.ok || !Array.isArray(batch) || !batch[0]?.id) {
    return jsonResponse(502, { status: 'error', error: 'The import could not be recorded. Has the botanical_taxa migration been applied?' });
  }
  const batchId = batch[0].id;
  prepared.forEach((r) => { r.import_batch_id = batchId; });

  // ignore-duplicates: an existing record is skipped, never overwritten.
  const insRes = await fetch(`${url}/rest/v1/botanical_taxa?on_conflict=name_key`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(prepared)
  });
  const inserted = await insRes.json().catch(() => null);
  if (!insRes.ok || !Array.isArray(inserted)) {
    return jsonResponse(502, { status: 'error', error: 'The botanical records could not be saved. Nothing was overwritten.', detail: inserted?.message || null });
  }
  const insertedKeys = new Set(inserted.map((r) => r.name_key));
  for (const r of prepared) {
    if (!insertedKeys.has(r.name_key)) rejected.push({ name: r.scientific_name, reason: 'Already exists; left unchanged.' });
  }
  await fetch(`${url}/rest/v1/botanical_import_batches?id=eq.${batchId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ inserted_count: inserted.length, skipped_count: rows.length - inserted.length })
  }).catch(() => {});

  return jsonResponse(200, { status: 'success', batch_id: batchId, inserted: inserted.length, skipped: rows.length - inserted.length, rejected });
}

async function handleBotanicalImportMapColumns(request, body, apiKey, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h).slice(0, 80)).slice(0, 60) : [];
  const sample = Array.isArray(body.sample)
    ? body.sample.slice(0, 5).map((r) => (Array.isArray(r) ? r.map((c) => String(c).slice(0, 120)).slice(0, 60) : []))
    : [];
  if (headers.length === 0) return jsonResponse(400, { status: 'error', error: 'No column headers were provided.' });
  const prompt = `You map spreadsheet columns of a plant list to fixed botanical fields.
Allowed fields: ${IMPORT_MAP_TARGETS.join(', ')}.
Rules: use each field at most once. Use null for any column that does not clearly match, and ALWAYS null for prices, costs, stock, quantities, suppliers, nurseries, SKUs or inventory photos.
Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sample)}
Respond ONLY with JSON: {"mapping": {"<exact header>": "<field or null>"}}`;
  try {
    const { parsed } = await callGemini(env, apiKey, [{ text: prompt }], { totalMs: 14000, perCallMs: 10000 });
    const out = {};
    const used = new Set();
    for (const h of headers) {
      const f = parsed?.mapping?.[h];
      if (typeof f === 'string' && IMPORT_MAP_TARGETS.includes(f) && !used.has(f)) { out[h] = f; used.add(f); } else out[h] = null;
    }
    return jsonResponse(200, { status: 'success', mapping: out });
  } catch (e) {
    return jsonResponse(502, { status: 'error', error: e.message || 'AI column mapping is unavailable. Use the automatic mapping instead.' });
  }
}

// ---------------------------------------------------------------------------------------------
// Botanical Knowledge Center. Everything below is administrator-only and uses the TV project
// with the server-side service-role key. Only APPROVED documents are ever retrievable by RAG.
// ---------------------------------------------------------------------------------------------
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;
const MAX_PAGES_PER_INGEST = 25;

const ENTITY_FIELDS = {
  scientific_name: 'taxonomy', family: 'taxonomy', genus: 'taxonomy', species: 'taxonomy',
  synonyms: 'taxonomy', common_names: 'taxonomy',
  growth_habit: 'identification', description: 'identification',
  sunlight: 'horticulture', water: 'horticulture', soil: 'horticulture', propagation: 'horticulture',
  habitat: 'regional', distribution: 'regional', climate: 'regional', salt_tolerance: 'regional', native_status: 'regional',
  toxicity: 'health', pests_diseases: 'health',
  reference: 'source'
};

function tvHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

async function tvJson(res) {
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function chunkText(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'));
      if (cut > CHUNK_CHARS * 0.5) end = start + cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece.length >= 20) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

async function embedTexts(apiKey, texts, taskType) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: batch.map((t) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: t }] },
          taskType,
          outputDimensionality: EMBED_DIMS
        }))
      })
    });
    if (!res.ok) throw new Error(`The embedding service returned an error (${res.status}).`);
    const data = await res.json();
    const vectors = (data.embeddings || []).map((e) => e.values);
    if (vectors.length !== batch.length || vectors.some((v) => !Array.isArray(v) || v.length !== EMBED_DIMS)) {
      throw new Error('The embedding service returned an unexpected result.');
    }
    out.push(...vectors);
  }
  return out;
}

const vectorLiteral = (v) => `[${v.join(',')}]`;
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function getKnowledgeDoc(tv, id) {
  const r = await tvJson(await fetch(`${tv.url}/rest/v1/knowledge_documents?id=eq.${id}&select=*`, { headers: tvHeaders(tv.key) }));
  if (!r.ok || !Array.isArray(r.data)) throw new Error('The knowledge database could not be read. Has the knowledge_center migration been applied?');
  return r.data[0] || null;
}

async function patchKnowledgeDoc(tv, id, patch) {
  await fetch(`${tv.url}/rest/v1/knowledge_documents?id=eq.${id}`, {
    method: 'PATCH', headers: tvHeaders(tv.key), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
}

async function signDocumentUrl(tv, path) {
  const res = await fetch(`${tv.url}/storage/v1/object/sign/botanical-documents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: tvHeaders(tv.key), body: JSON.stringify({ expiresIn: 1800 })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.signedURL) return null;
  return String(d.signedURL).startsWith('http') ? d.signedURL : `${tv.url}/storage/v1${d.signedURL}`;
}

async function handleKnowledgeUpload(request, url, env) {
  if (request.method !== 'POST') return jsonResponse(405, { status: 'error', error: 'Method not allowed' });
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const tv = reviewDatabaseConfig(env);
  const name = String(url.searchParams.get('name') || 'document.pdf').replace(/[^\w.\- ()]+/g, '_').slice(0, 200);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) return jsonResponse(400, { status: 'error', error: 'The file is empty.' });
  if (buffer.byteLength > MAX_PDF_BYTES) return jsonResponse(413, { status: 'error', error: 'PDF files can be at most 20 MB.' });
  const head = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)));
  if (head !== '%PDF-') return jsonResponse(400, { status: 'error', error: 'That file is not a PDF.' });

  const sha = await sha256Hex(buffer);
  const dup = await tvJson(await fetch(
    `${tv.url}/rest/v1/knowledge_documents?content_sha256=eq.${sha}&select=id,original_name,status`, { headers: tvHeaders(tv.key) }));
  if (dup.ok && Array.isArray(dup.data) && dup.data[0]) {
    return jsonResponse(200, { status: 'success', duplicate: true, document: dup.data[0] });
  }

  const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.pdf`;
  const up = await fetch(`${tv.url}/storage/v1/object/botanical-documents/${path}`, {
    method: 'POST',
    headers: { apikey: tv.key, Authorization: `Bearer ${tv.key}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: buffer
  });
  if (!up.ok) {
    const d = await up.json().catch(() => ({}));
    return jsonResponse(502, { status: 'error', error: `The PDF could not be stored: ${d.message || d.error || up.status}` });
  }
  const ins = await tvJson(await fetch(`${tv.url}/rest/v1/knowledge_documents`, {
    method: 'POST', headers: tvHeaders(tv.key, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      original_name: name, storage_path: path, file_size_bytes: buffer.byteLength, content_sha256: sha,
      uploaded_by_email: String(auth.user.email || 'unknown')
    })
  }));
  if (!ins.ok || !Array.isArray(ins.data) || !ins.data[0]) {
    return jsonResponse(502, { status: 'error', error: 'The PDF was stored but its record could not be created.' });
  }
  return jsonResponse(200, { status: 'success', duplicate: false, document: ins.data[0] });
}

async function knowledgeIngest(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return jsonResponse(500, { status: 'error', error: 'GEMINI_API_KEY is not configured, so text cannot be indexed yet.' });
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const pages = Array.isArray(body.pages) ? body.pages.slice(0, MAX_PAGES_PER_INGEST) : [];
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  if (doc.status === 'approved') return jsonResponse(409, { status: 'error', error: 'An approved document cannot be re-indexed. Reject or retry it first.' });

  const pieces = [];
  for (const pg of pages) {
    const n = Number.isInteger(pg?.page) ? pg.page : null;
    for (const c of chunkText(String(pg?.text || '').slice(0, 60000))) pieces.push({ page: n, content: c });
  }
  try {
    if (pieces.length) {
      const startRes = await tvJson(await fetch(
        `${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}&select=chunk_index&order=chunk_index.desc&limit=1`, { headers: tvHeaders(tv.key) }));
      let next = Array.isArray(startRes.data) && startRes.data[0] ? startRes.data[0].chunk_index + 1 : 0;
      const vectors = await embedTexts(apiKey, pieces.map((p) => p.content), 'RETRIEVAL_DOCUMENT');
      const rows = pieces.map((p, i) => ({
        document_id: doc.id, chunk_index: next++, page_number: p.page, content: p.content,
        token_estimate: Math.ceil(p.content.length / 4), embedding: vectorLiteral(vectors[i])
      }));
      const ins = await fetch(`${tv.url}/rest/v1/knowledge_chunks`, { method: 'POST', headers: tvHeaders(tv.key), body: JSON.stringify(rows) });
      if (!ins.ok) throw new Error('The indexed text could not be saved.');
    }
    const countRes = await fetch(`${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}&select=id`, { headers: { ...tvHeaders(tv.key), Prefer: 'count=exact', Range: '0-0' } });
    const total = Number((countRes.headers.get('content-range') || '').split('/')[1]) || 0;
    const patch = { status: 'processing', stage: 'indexing_text', chunks_count: total, error_message: null };
    if (body.final) {
      patch.page_count = Number.isInteger(body.page_count) ? body.page_count : null;
      patch.stage = total > 0 ? 'text_indexed' : 'failed';
      if (total === 0) { patch.status = 'failed'; patch.error_message = 'No readable text was found. Scanned PDFs without a text layer are not supported yet.'; }
      if (pieces[0]) patch.text_preview = pieces[0].content.slice(0, 1500);
    }
    await patchKnowledgeDoc(tv, doc.id, patch);
    return jsonResponse(200, { status: 'success', chunks_total: total, document_status: patch.status });
  } catch (e) {
    await patchKnowledgeDoc(tv, doc.id, { status: 'failed', stage: 'failed', error_message: String(e.message || e).slice(0, 500) });
    return jsonResponse(502, { status: 'error', error: e.message || 'Indexing failed.' });
  }
}

function normalizeForMatch(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function knowledgeExtract(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  const chunkRes = await tvJson(await fetch(
    `${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}&select=chunk_index,page_number,content&order=chunk_index.asc&limit=400`, { headers: tvHeaders(tv.key) }));
  const chunks = Array.isArray(chunkRes.data) ? chunkRes.data : [];
  if (chunks.length === 0) return jsonResponse(400, { status: 'error', error: 'The document has no indexed text yet.' });
  const fullText = normalizeForMatch(chunks.map((c) => c.content).join(' '));

  // Entity extraction is an enhancement: if the AI is unavailable the indexed text is still reviewable.
  let warning = null;
  const entities = [];
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) warning = 'Automatic extraction is unavailable (no AI key). The text is indexed and can be reviewed and approved.';
  else {
    const windows = [];
    let cur = '';
    for (const c of chunks) {
      const line = `[page ${c.page_number ?? '?'}] ${c.content}\n`;
      if (cur.length + line.length > 20000 && cur) { windows.push(cur); cur = ''; }
      cur += line;
    }
    if (cur) windows.push(cur);
    try {
      for (const w of windows.slice(0, 6)) {
        const prompt = `You extract botanical facts from a scientific document. Use ONLY the text below. Never add knowledge from elsewhere.
For each fact return: field_name (one of ${Object.keys(ENTITY_FIELDS).join(', ')}), scientific_name of the plant the fact is about (Genus species), value (concise), confidence (0 to 1), page (number from the [page N] marker), snippet (an exact verbatim quote from the text, at most 200 characters, that supports the fact).
If a fact is not clearly stated, omit it. Respond ONLY with JSON: {"entities":[{"field_name":"","scientific_name":"","value":"","confidence":0.0,"page":1,"snippet":""}]}
TEXT:
${w}`;
        const { parsed } = await callGemini(env, apiKey, [{ text: prompt }], { totalMs: 25000, perCallMs: 20000 });
        for (const e of Array.isArray(parsed?.entities) ? parsed.entities : []) {
          const field = String(e.field_name || '');
          const snippet = String(e.snippet || '').trim();
          // Anti-hallucination: the quoted evidence must really occur in the document.
          if (!ENTITY_FIELDS[field] || !e.value || snippet.length < 8 || !fullText.includes(normalizeForMatch(snippet))) continue;
          entities.push({
            document_id: doc.id, category: ENTITY_FIELDS[field], field_name: field,
            scientific_name: e.scientific_name ? String(e.scientific_name).slice(0, 200) : null,
            extracted_value: { value: String(e.value).slice(0, 1500) },
            confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0.5)),
            source_page: Number.isInteger(e.page) ? e.page : null, source_snippet: snippet.slice(0, 400)
          });
        }
      }
    } catch (e) {
      warning = `Automatic extraction failed (${e.message}). The text is indexed and can still be reviewed and approved.`;
    }
  }
  await fetch(`${tv.url}/rest/v1/knowledge_entities?document_id=eq.${doc.id}`, { method: 'DELETE', headers: tvHeaders(tv.key) });
  if (entities.length) {
    const ins = await fetch(`${tv.url}/rest/v1/knowledge_entities`, { method: 'POST', headers: tvHeaders(tv.key), body: JSON.stringify(entities.slice(0, 300)) });
    if (!ins.ok) warning = 'Extracted facts could not be saved. The text is indexed and can still be reviewed.';
  }
  await patchKnowledgeDoc(tv, doc.id, { status: 'awaiting_review', stage: 'awaiting_review', error_message: warning });
  return jsonResponse(200, { status: 'success', entities: Math.min(entities.length, 300), warning });
}

async function knowledgeList(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const tv = reviewDatabaseConfig(env);
  const r = await tvJson(await fetch(
    `${tv.url}/rest/v1/knowledge_documents?select=id,original_name,file_size_bytes,status,stage,error_message,visibility,citation,source_institution,page_count,chunks_count,rag_indexed,uploaded_by_email,created_at,reviewed_at&order=created_at.desc&limit=200`,
    { headers: tvHeaders(tv.key) }));
  if (!r.ok || !Array.isArray(r.data)) return jsonResponse(502, { status: 'error', error: 'The knowledge database could not be read. Has the knowledge_center migration been applied?' });
  return jsonResponse(200, { status: 'success', documents: r.data });
}

async function knowledgeDocument(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  const [ents, chunks, signed] = await Promise.all([
    tvJson(await fetch(`${tv.url}/rest/v1/knowledge_entities?document_id=eq.${doc.id}&select=*&order=category.asc,confidence.desc&limit=400`, { headers: tvHeaders(tv.key) })),
    tvJson(await fetch(`${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}&select=chunk_index,page_number,content&order=chunk_index.asc&limit=80`, { headers: tvHeaders(tv.key) })),
    signDocumentUrl(tv, doc.storage_path)
  ]);
  return jsonResponse(200, {
    status: 'success',
    document: doc,
    entities: Array.isArray(ents.data) ? ents.data : [],
    chunks: Array.isArray(chunks.data) ? chunks.data : [],
    pdf_url: signed
  });
}

async function knowledgeReview(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id) || !['approve', 'reject'].includes(body.action)) {
    return jsonResponse(400, { status: 'error', error: 'Choose a document and approve or reject.' });
  }
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  const email = String(auth.user.email || 'unknown');

  // Free Cloudflare plans allow only 50 outgoing requests per call, so decisions are grouped:
  // one request per status (approved / rejected / pending) plus at most 30 individual edits.
  const decisions = (Array.isArray(body.entity_decisions) ? body.entity_decisions.slice(0, 400) : [])
    .filter((d) => isUuid(d?.id) && ['approved', 'rejected', 'modified', 'pending'].includes(d.status));
  const now = new Date().toISOString();
  for (const status of ['approved', 'rejected', 'pending']) {
    const ids = decisions.filter((d) => d.status === status).map((d) => d.id);
    if (ids.length === 0) continue;
    await fetch(`${tv.url}/rest/v1/knowledge_entities?document_id=eq.${doc.id}&id=in.(${ids.join(',')})`, {
      method: 'PATCH', headers: tvHeaders(tv.key), body: JSON.stringify({ approval_status: status, updated_at: now })
    });
  }
  const edits = decisions.filter((x) => x.status === 'modified');
  if (edits.length > 30) return jsonResponse(400, { status: 'error', error: 'Edit at most 30 facts per review. Approve them first, then continue.' });
  for (const d of edits) {
    const patch = { approval_status: 'modified', updated_at: now };
    if (d.edited_value && typeof d.edited_value === 'object') patch.edited_value = d.edited_value;
    await fetch(`${tv.url}/rest/v1/knowledge_entities?id=eq.${d.id}&document_id=eq.${doc.id}`, { method: 'PATCH', headers: tvHeaders(tv.key), body: JSON.stringify(patch) });
  }

  if (body.action === 'reject') {
    await patchKnowledgeDoc(tv, doc.id, { status: 'rejected', stage: 'rejected', rag_indexed: false, reviewed_by_email: email, reviewed_at: new Date().toISOString() });
    return jsonResponse(200, { status: 'success', document_status: 'rejected' });
  }
  if (!['awaiting_review', 'rejected'].includes(doc.status)) {
    return jsonResponse(409, { status: 'error', error: `A document that is "${doc.status}" cannot be approved.` });
  }
  if (!(doc.chunks_count > 0)) return jsonResponse(409, { status: 'error', error: 'The document has no indexed text.' });
  const missing = await fetch(`${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}&embedding=is.null&select=id`, { headers: { ...tvHeaders(tv.key), Prefer: 'count=exact', Range: '0-0' } });
  if (Number((missing.headers.get('content-range') || '').split('/')[1]) > 0) {
    return jsonResponse(409, { status: 'error', error: 'Some text has no embedding yet. Retry the document before approving it.' });
  }
  await patchKnowledgeDoc(tv, doc.id, {
    status: 'approved', stage: 'indexed', rag_indexed: true, reviewed_by_email: email, reviewed_at: new Date().toISOString(),
    visibility: body.visibility === 'public' ? 'public' : 'private',
    citation: typeof body.citation === 'string' ? body.citation.slice(0, 500) : doc.citation,
    source_institution: typeof body.source_institution === 'string' ? body.source_institution.slice(0, 200) : doc.source_institution
  });
  return jsonResponse(200, { status: 'success', document_status: 'approved' });
}

async function knowledgeRetry(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  if (doc.status === 'approved') return jsonResponse(409, { status: 'error', error: 'Reject the approved document before retrying it.' });
  await fetch(`${tv.url}/rest/v1/knowledge_chunks?document_id=eq.${doc.id}`, { method: 'DELETE', headers: tvHeaders(tv.key) });
  await fetch(`${tv.url}/rest/v1/knowledge_entities?document_id=eq.${doc.id}`, { method: 'DELETE', headers: tvHeaders(tv.key) });
  await patchKnowledgeDoc(tv, doc.id, { status: 'uploaded', stage: 'uploaded', error_message: null, chunks_count: 0, rag_indexed: false, text_preview: null });
  return jsonResponse(200, { status: 'success', document_id: doc.id, pdf_url: await signDocumentUrl(tv, doc.storage_path) });
}

async function knowledgeMarkFailed(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const tv = reviewDatabaseConfig(env);
  await patchKnowledgeDoc(tv, body.document_id, { status: 'failed', stage: 'failed', error_message: String(body.message || 'Processing failed.').slice(0, 500) });
  return jsonResponse(200, { status: 'success' });
}

async function knowledgeAsk(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return jsonResponse(500, { status: 'error', error: 'GEMINI_API_KEY is not configured.' });
  const question = String(body.question || '').trim().slice(0, 500);
  if (question.length < 3) return jsonResponse(400, { status: 'error', error: 'Ask a question first.' });
  const tv = reviewDatabaseConfig(env);
  try {
    const [qv] = await embedTexts(apiKey, [question], 'RETRIEVAL_QUERY');
    const match = await tvJson(await fetch(`${tv.url}/rest/v1/rpc/match_knowledge_chunks`, {
      method: 'POST', headers: tvHeaders(tv.key),
      body: JSON.stringify({ query_embedding: vectorLiteral(qv), match_count: 6, min_similarity: Number(body.min_similarity) > 0 ? Number(body.min_similarity) : 0.35, include_private: body.include_private !== false })
    }));
    if (!match.ok || !Array.isArray(match.data)) throw new Error('The knowledge search failed.');
    const hits = match.data;
    if (hits.length === 0) {
      return jsonResponse(200, { status: 'success', answered: false, answer: 'No approved document supports an answer to this question.', sources: [] });
    }
    const context = hits.map((h, i) => `[${i + 1}] (${h.original_name}, page ${h.page_number ?? '?'})\n${h.content}`).join('\n\n');
    const prompt = `Answer the question using ONLY the numbered sources. If they do not contain the answer, say so. Cite sources like [1].
Question: ${question}
Sources:
${context}
Respond ONLY with JSON: {"answer": "...", "used": [1]}`;
    const { parsed } = await callGemini(env, apiKey, [{ text: prompt }], { totalMs: 20000, perCallMs: 15000 });
    const used = Array.isArray(parsed?.used) ? parsed.used.filter((n) => Number.isInteger(n) && n >= 1 && n <= hits.length) : [];
    return jsonResponse(200, {
      status: 'success', answered: true, answer: String(parsed?.answer || '').slice(0, 4000),
      sources: hits.map((h, i) => ({
        n: i + 1, document_id: h.document_id, document: h.original_name, citation: h.citation, page: h.page_number,
        similarity: Math.round(h.similarity * 1000) / 1000, snippet: h.content.slice(0, 400), used: used.includes(i + 1)
      }))
    });
  } catch (e) {
    return jsonResponse(502, { status: 'error', error: e.message || 'The question could not be answered.' });
  }
}

// Turns the approved facts of an APPROVED document into DRAFT botanical records. Drafts are never
// published or verified automatically; existing records are never overwritten.
async function knowledgePromote(request, body, env) {
  const auth = await requireImportAdmin(request, env);
  if (auth.response) return auth.response;
  if (!isUuid(body.document_id)) return jsonResponse(400, { status: 'error', error: 'Missing document.' });
  const tv = reviewDatabaseConfig(env);
  const doc = await getKnowledgeDoc(tv, body.document_id);
  if (!doc) return jsonResponse(404, { status: 'error', error: 'Document not found.' });
  if (doc.status !== 'approved') return jsonResponse(409, { status: 'error', error: 'Approve the document first.' });
  const res = await tvJson(await fetch(
    `${tv.url}/rest/v1/knowledge_entities?document_id=eq.${doc.id}&approval_status=in.(approved,modified)&select=field_name,scientific_name,extracted_value,edited_value&limit=1000`,
    { headers: tvHeaders(tv.key) }
  ));
  if (!res.ok || !Array.isArray(res.data)) return jsonResponse(502, { status: 'error', error: 'The approved facts could not be read.' });

  const text = (v, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const groups = new Map();
  for (const e of res.data) {
    const sci = text(e.scientific_name, 200);
    const key = importNameKey(sci);
    if (!sci || !key.includes(' ') || !/^[a-z×]/i.test(sci)) continue;
    if (!groups.has(key)) groups.set(key, { sci, facts: {} });
    const value = text(e.edited_value?.value ?? e.extracted_value?.value, 1500);
    if (!value) continue;
    const g = groups.get(key);
    (g.facts[e.field_name] ||= []).push(value);
  }
  const splitList = (arr) => (arr || []).flatMap((v) => v.split(/[;,]/)).map((v) => v.trim()).filter(Boolean).slice(0, 20);
  const source = text(doc.citation || doc.original_name, 300);
  const email = String(auth.user.email || 'unknown');
  const prepared = [];
  for (const [key, g] of groups) {
    const f = g.facts;
    const names = splitList(f.common_names);
    const rec = {
      scientific_name: g.sci, name_key: key, common_name: names[0] || g.sci,
      synonyms: splitList(f.synonyms),
      scientific_references: [...new Set([...(f.reference || []).map((v) => v.slice(0, 300)), source].filter(Boolean))].slice(0, 10),
      native_to_bay_islands: null, reference_photo_url: null, taxonomy_check: null,
      record_status: 'draft', source_type: 'document_extraction', verification_status: 'unverified', created_by_email: email
    };
    for (const field of IMPORT_TEXT_FIELDS) rec[field] = f[field] ? text(f[field].join(' '), 1500) : null;
    prepared.push(rec);
  }
  if (!prepared.length) return jsonResponse(200, { status: 'success', created: 0, skipped: 0, message: 'No approved facts name a plant (genus + species).' });
  const ins = await fetch(`${tv.url}/rest/v1/botanical_taxa?on_conflict=name_key`, {
    method: 'POST', headers: tvHeaders(tv.key, { Prefer: 'resolution=ignore-duplicates,return=representation' }), body: JSON.stringify(prepared)
  });
  const inserted = await ins.json().catch(() => null);
  if (!ins.ok || !Array.isArray(inserted)) return jsonResponse(502, { status: 'error', error: 'The draft records could not be saved.' });
  return jsonResponse(200, { status: 'success', created: inserted.length, skipped: prepared.length - inserted.length });
}

const KNOWLEDGE_ROUTES = {
  ingest: knowledgeIngest,
  extract: knowledgeExtract,
  list: knowledgeList,
  document: knowledgeDocument,
  review: knowledgeReview,
  retry: knowledgeRetry,
  'mark-failed': knowledgeMarkFailed,
  ask: knowledgeAsk,
  promote: knowledgePromote
};

// ---------------------------------------------------------------------------------------------
// Public botanical intelligence (Issue 10). Reads PUBLISHED records only, through fixed SQL functions.
// Works without any AI provider.
// ---------------------------------------------------------------------------------------------
async function handleBotanicalSearch(body, env) {
  let tv;
  try { tv = reviewDatabaseConfig(env); } catch (e) { return jsonResponse(503, { status: 'error', error: e.message }); }
  const pick = (v, allowed) => (typeof v === 'string' && allowed.includes(v) ? v : null);
  const params = {
    q: typeof body.q === 'string' ? body.q.trim().slice(0, 100) : null,
    p_family: typeof body.family === 'string' && body.family.trim() ? body.family.trim().slice(0, 80) : null,
    p_sun: pick(body.sun, ['full', 'partial', 'shade']),
    p_water: pick(body.water, ['low', 'moderate', 'high']),
    p_min_salt: Number.isInteger(body.min_salt) && body.min_salt >= 1 && body.min_salt <= 3 ? body.min_salt : null,
    p_pet_safe: body.pet_safe === true,
    p_native: body.native === true,
    lim: Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), 25) : 25
  };
  const res = await tvJson(await fetch(`${tv.url}/rest/v1/rpc/botanical_search`, { method: 'POST', headers: tvHeaders(tv.key), body: JSON.stringify(params) }));
  if (!res.ok || !Array.isArray(res.data)) {
    return jsonResponse(503, { status: 'error', error: 'Botanical search is not set up yet. Apply the botanical_intelligence migration.' });
  }
  return jsonResponse(200, { status: 'success', source: 'postgresql', ai_used: false, results: res.data });
}

async function handleBotanicalCare(body, env) {
  if (!isUuid(body.id)) return jsonResponse(400, { status: 'error', error: 'Choose a plant.' });
  let tv;
  try { tv = reviewDatabaseConfig(env); } catch (e) { return jsonResponse(503, { status: 'error', error: e.message }); }
  const res = await tvJson(await fetch(`${tv.url}/rest/v1/rpc/botanical_care`, { method: 'POST', headers: tvHeaders(tv.key), body: JSON.stringify({ p_id: body.id }) }));
  if (!res.ok) return jsonResponse(503, { status: 'error', error: 'Botanical care rules are not set up yet. Apply the botanical_intelligence migration.' });
  if (!res.data) return jsonResponse(404, { status: 'error', error: 'Plant not found.' });
  return jsonResponse(200, { status: 'success', source: 'postgresql', ai_used: false, care: res.data });
}
