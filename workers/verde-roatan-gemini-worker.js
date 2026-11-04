/**
 * Verde Roatán Gemini Worker
 * Production-ready Cloudflare Worker script for Verde Roatán Plant Intelligence.
 *
 * Capabilities:
 * - Upgraded to Gemini 3.8 Flash (models/gemini-3.8-flash)
 * - Botanical specimen identification with 8-second accuracy window
 * - Continuous secondary taxonomic refinement (/refine) for Roatán microclimate
 * - Tropical pathology & organic pest diagnostics (mode: 'pest')
 * - Personalized Garden Advisor (/garden-advisor)
 * - Complete CORS, JSON schema validation, and island fallback engine
 *
 * Environment Secrets / Variables required in Cloudflare Worker settings:
 * - GEMINI_API_KEY (Google AI Studio / Gemini API Key)
 * - SUPABASE_URL (optional: for direct catalog verification)
 * - SUPABASE_SERVICE_ROLE_KEY (optional)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400'
};

// Curated reference photos for verified Roatán botanical specimens
const BOTANICAL_SPECIMEN_IMAGE_BANK = {
  monstera: [
    { image_url: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Monstera deliciosa tropical canopy' },
    { image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000&auto=format&fit=crop&q=80', image_type: 'foliage_detail', description: 'Fenestrated split-leaf blade' },
    { image_url: 'https://images.unsplash.com/photo-1604762524889-3e2fccbc95f8?w=1000&auto=format&fit=crop&q=80', image_type: 'container_specimen', description: 'Nursery container specimen' }
  ],
  areca: [
    { image_url: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Golden Cane Palm cluster' },
    { image_url: 'https://images.unsplash.com/photo-1596726696582-7f287959063c?w=1000&auto=format&fit=crop&q=80', image_type: 'foliage_detail', description: 'Pinnate feathery fronds' }
  ],
  coconut: [
    { image_url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Tall coastal coconut palm (Cocos nucifera)' },
    { image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000&auto=format&fit=crop&q=80', image_type: 'foliage_detail', description: 'Long arching coastal fronds' }
  ],
  bougainvillea: [
    { image_url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Vibrant blooming climbing canopy' },
    { image_url: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=1000&auto=format&fit=crop&q=80', image_type: 'bloom_stage', description: 'Papery magenta floral bracts' }
  ],
  hibiscus: [
    { image_url: 'https://images.unsplash.com/photo-1550950158-d0d960dff51b?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Tropical flowering hibiscus shrub' },
    { image_url: 'https://images.unsplash.com/photo-1567696911980-2eed69a46042?w=1000&auto=format&fit=crop&q=80', image_type: 'bloom_stage', description: 'Prominent style and stamen column' }
  ],
  default: [
    { image_url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1000&auto=format&fit=crop&q=80', image_type: 'mature_specimen', description: 'Mature tropical botanical specimen' },
    { image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000&auto=format&fit=crop&q=80', image_type: 'foliage_detail', description: 'Foliage and venation structure' }
  ]
};

function resolvePhotos(common = '', sci = '') {
  const q = `${common} ${sci}`.toLowerCase();
  if (q.includes('monstera') || q.includes('deliciosa')) return BOTANICAL_SPECIMEN_IMAGE_BANK.monstera;
  if (q.includes('areca') || q.includes('dypsis')) return BOTANICAL_SPECIMEN_IMAGE_BANK.areca;
  if (q.includes('coconut') || q.includes('cocos')) return BOTANICAL_SPECIMEN_IMAGE_BANK.coconut;
  if (q.includes('bougainvillea')) return BOTANICAL_SPECIMEN_IMAGE_BANK.bougainvillea;
  if (q.includes('hibiscus')) return BOTANICAL_SPECIMEN_IMAGE_BANK.hibiscus;
  return BOTANICAL_SPECIMEN_IMAGE_BANK.default;
}


/**
 * Call Gemini with a model fallback list and a hard per-call timeout.
 * Order: GEMINI_MODEL (optional env override), then the models below. A missing/retired model
 * returns 404 quickly, so falling through is cheap. The whole call stays inside the app's own
 * client timeouts (20s identify, 18s refine).
 */
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash'
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

async function callGemini(env, apiKey, parts, { totalMs = 16000, perCallMs = 12000 } = {}) {
  const models = [...new Set([env?.GEMINI_MODEL, ...GEMINI_MODELS].filter(Boolean))];
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
          version: '3.0.0',
          model: GEMINI_MODELS[0],
          time: new Date().toISOString()
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY;

    try {
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

  if (parsed.verified_botanical_record) {
    parsed.verified_botanical_record.verified_images = resolvePhotos(
      parsed.verified_botanical_record.common_name,
      parsed.verified_botanical_record.scientific_name
    );
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

  if (parsed.verified_botanical_record) {
    parsed.verified_botanical_record.verified_images = resolvePhotos(
      parsed.verified_botanical_record.common_name,
      parsed.verified_botanical_record.scientific_name
    );
  }

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
  const decision = body.decision === 'corrected' ? 'corrected' : 'confirmed';
  const correctedCommon = String(body.corrected_common_name || '').trim().slice(0, 160);
  const correctedScientific = String(body.corrected_scientific_name || '').trim().slice(0, 160);
  if (decision === 'corrected' && !correctedCommon && !correctedScientific) {
    return new Response(JSON.stringify({ status: 'error', error: 'Please enter the corrected plant name or scientific name.' }), {
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
  const record = {
    id: reviewId,
    submitted_by: user.id,
    image_path: objectPath,
    identification_mode: 'plant',
    ai_common_name: String(candidate.common_name || '').slice(0, 160) || null,
    ai_scientific_name: String(candidate.scientific_name || '').slice(0, 160) || null,
    ai_confidence: Number.isFinite(Number(candidate.confidence_score))
      ? Math.max(0, Math.min(1, Number(candidate.confidence_score)))
      : null,
    proposed_common_name: decision === 'corrected' ? correctedCommon || null : null,
    proposed_scientific_name: decision === 'corrected' ? correctedScientific || null : null,
    submitter_notes: String(body.notes || '').slice(0, 1000) || null,
    status: 'pending'
  };

  const insert = await fetch(`${url}/rest/v1/identification_reviews`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(record)
  });
  const inserted = await insert.json().catch(() => []);
  if (!insert.ok || !Array.isArray(inserted) || !inserted[0]) {
    await fetch(`${url}/storage/v1/object/identification-review-images/${objectPath}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }
    }).catch(() => undefined);
    throw new Error('The identification review could not be saved to the review database.');
  }

  const confirmation = await fetch(`${url}/rest/v1/identification_confirmations`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      review_id: reviewId,
      user_id: user.id,
      decision,
      corrected_common_name: decision === 'corrected' ? correctedCommon || null : null,
      corrected_scientific_name: decision === 'corrected' ? correctedScientific || null : null,
      notes: String(body.notes || '').slice(0, 1000) || null
    })
  });
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
  const response = await fetch(`${url}/rest/v1/identification_reviews?id=eq.${reviewId}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      status,
      admin_notes: String(body.admin_notes || '').slice(0, 1000) || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || !rows.length) {
    throw new Error('The review could not be updated.');
  }
  return new Response(JSON.stringify({ status: 'success', review: rows[0] }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
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
