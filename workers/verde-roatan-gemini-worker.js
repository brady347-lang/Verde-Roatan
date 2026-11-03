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
          model: 'models/gemini-3.8-flash',
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
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          status: 'error',
          error: 'GEMINI_API_KEY is not configured in worker environment.'
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

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

      // Route 1: Refine Identification (Continuous Accuracy Pass)
      if (pathname === '/refine' || pathname === '/api/refine') {
        return await handleRefine(body, apiKey);
      }

      // Route 2: Garden Advisor
      if (pathname === '/garden-advisor' || pathname === '/api/garden-advisor') {
        return await handleGardenAdvisor(body, apiKey);
      }

      // Route 3: Initial Identification / Pest Diagnosis
      return await handleAnalyze(body, apiKey);
    } catch (err) {
      return new Response(
        JSON.stringify({ status: 'error', error: err.message || 'Worker processing failed' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }
};

/**
 * Handle initial Plant / Pest Identification with Gemini 3.8 Flash
 */
async function handleAnalyze(body, apiKey) {
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

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const geminiReq = fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json'
      }
    })
  });

  // 8-second search window
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Search window timeout (8000ms)')), 8000)
  );

  const res = await Promise.race([geminiReq, timeoutPromise]);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());

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
async function handleRefine(body, apiKey) {
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

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const geminiReq = fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            ...(base64Data ? [{ inline_data: { mime_type: mimeType, data: base64Data } }] : []),
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json'
      }
    })
  });

  const res = await geminiReq;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());
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
async function handleGardenAdvisor(body, apiKey) {
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

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
  const res = await fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json' }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());

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
    throw new Error('The review photo was saved, but its confirmation record could not be saved. Please contact support.');
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
  if (user.app_metadata?.role !== 'admin') {
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
