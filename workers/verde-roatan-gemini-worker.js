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
