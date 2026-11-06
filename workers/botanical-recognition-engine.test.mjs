import worker from './verde-roatan-gemini-worker.js';
import assert from 'node:assert/strict';

const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const ENV = {
  GEMINI_API_KEY: 'test-key',
  REVIEW_SUPABASE_URL: 'https://tv.test',
  REVIEW_SUPABASE_SERVICE_ROLE_KEY: 'service-test'
};
const TAXON_ID = '11111111-1111-4111-8111-111111111111';
const aiResult = {
  candidates: [{ common_name: 'Frangipani', scientific_name: 'Plumeria rubra', confidence_score: 0.91 }],
  verified_botanical_record: {
    common_name: 'Frangipani', scientific_name: 'Plumeria rubra',
    plant_family: 'Apocynaceae', care: {}
  }
};
const geminiResponse = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(aiResult) }] } }]
}), { status: 200 });
const call = () => worker.fetch(new Request('https://worker.test/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'plant', image: IMAGE })
}), ENV);
let passed = 0;
async function test(name, fn) {
  await fn();
  console.log('ok', ++passed, name);
}

await test('exact taxon match returns only curator-approved public reference images', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push({ url, init });
    if (url.includes('generativelanguage.googleapis.com')) {
      assert.equal(init.headers['x-goog-api-key'], 'test-key');
      return geminiResponse();
    }
    if (url.endsWith('/rest/v1/rpc/botanical_search')) {
      const body = JSON.parse(init.body);
      assert.equal(body.q, 'Plumeria rubra');
      return new Response(JSON.stringify([{
        id: TAXON_ID, scientific_name: 'Plumeria rubra', common_name: 'Frangipani',
        family: 'Apocynaceae', verification_status: 'scientifically_verified'
      }]), { status: 200 });
    }
    if (url.includes('/rest/v1/botanical_taxon_images?')) {
      assert.match(url, /review_status=eq\.approved/);
      assert.match(url, /visibility=eq\.public/);
      return new Response(JSON.stringify([{
        image_url: 'https://plants.example.org/plumeria-rubra.jpg',
        image_type: 'flower', source_name: 'Botanical Garden',
        source_url: 'https://plants.example.org/specimen', license: 'CC BY 4.0'
      }]), { status: 200 });
    }
    throw new Error('Unexpected request: ' + url);
  };
  const response = await call();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.database_crosscheck.status, 'exact_match');
  assert.equal(result.database_crosscheck.identification_status, 'ai_suggestion_only');
  assert.equal(result.database_crosscheck.database_verification_status, 'scientifically_verified');
  assert.equal(result.verified_botanical_record.verified_images.length, 1);
  assert.equal(result.verified_botanical_record.verified_images[0].image_url, 'https://plants.example.org/plumeria-rubra.jpg');
  assert.equal(calls.filter((entry) => entry.url.includes('/botanical_taxon_images?')).length, 1);
});

await test('private storage reference photos are exposed only through short-lived signed URLs', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push({ url, init });
    if (url.includes('generativelanguage.googleapis.com')) return geminiResponse();
    if (url.endsWith('/rest/v1/rpc/botanical_search')) {
      return new Response(JSON.stringify([{
        id: TAXON_ID, scientific_name: 'Plumeria rubra', common_name: 'Frangipani',
        family: 'Apocynaceae', verification_status: 'unverified'
      }]), { status: 200 });
    }
    if (url.includes('/rest/v1/botanical_taxon_images?')) {
      assert.match(url, /review_status=eq\.approved/);
      assert.match(url, /visibility=eq\.public/);
      return new Response(JSON.stringify([{
        image_url: null, storage_path: 'taxon/reference.jpg', image_type: 'flower',
        source_name: 'Herbarium', attribution: 'Reference specimen', license: 'CC BY 4.0'
      }]), { status: 200 });
    }
    if (url.includes('/storage/v1/object/sign/botanical-reference-images/')) {
      assert.equal(JSON.parse(init.body).expiresIn, 3600);
      return new Response(JSON.stringify({ signedURL: '/object/sign/botanical-reference-images/taxon/reference.jpg?token=temporary' }), { status: 200 });
    }
    throw new Error('Unexpected request: ' + url);
  };
  const result = await (await call()).json();
  assert.equal(result.verified_botanical_record.verified_images.length, 1);
  assert.match(result.verified_botanical_record.verified_images[0].image_url, /^https:\/\/tv\.test\/storage\/v1\/object\/sign\//);
  assert.equal(calls.filter((entry) => entry.url.includes('/storage/v1/object/sign/')).length, 1);
});

await test('fuzzy database results are not treated as exact identification matches', async () => {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes('generativelanguage.googleapis.com')) return geminiResponse();
    if (url.endsWith('/rest/v1/rpc/botanical_search')) {
      return new Response(JSON.stringify([{
        id: TAXON_ID, scientific_name: 'Plumeria alba', common_name: 'White Frangipani',
        verification_status: 'scientifically_verified'
      }]), { status: 200 });
    }
    throw new Error('An image lookup must not occur without an exact taxon match.');
  };
  const result = await (await call()).json();
  assert.equal(result.database_crosscheck.status, 'not_found');
  assert.equal(result.database_crosscheck.identification_status, 'ai_suggestion_only');
  assert.equal(result.verified_botanical_record.verified_images.length, 0);
  assert.match(result.database_crosscheck.message, /unverified suggestion/);
});

await test('reference database outage never blocks the Gemini identification', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) return geminiResponse();
    throw new Error('database offline');
  };
  const response = await call();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, 'success');
  assert.equal(result.database_crosscheck.status, 'unavailable');
  assert.equal(result.database_crosscheck.identification_status, 'ai_suggestion_only');
  assert.equal(result.candidates[0].scientific_name, 'Plumeria rubra');
});

await test('a stalled reference database times out without blocking the AI result', async () => {
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('generativelanguage.googleapis.com')) return geminiResponse();
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    });
  };
  const started = Date.now();
  const response = await call();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, 'success');
  assert.equal(result.database_crosscheck.status, 'unavailable');
  assert.equal(result.database_crosscheck.identification_status, 'ai_suggestion_only');
  assert.ok(Date.now() - started < 4000, 'reference lookup exceeded its timeout budget');
});

console.log(`ALL ${passed} BOTANICAL RECOGNITION TESTS PASSED`);
