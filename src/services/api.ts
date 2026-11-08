import { scientificNameOf, toNameList } from '../lib/catalogLocale';
import { buildRuleBasedAdvice } from '../lib/botanicalRules';
import {
  AI_WORKER_URL,
  API_URL,
  CURRENCY_WORKER_URL,
  KNOWLEDGE_CORE_WORKER_URL,
  INITIAL_CATALOG,
  ROATAN_DELIVERY_ZONES,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from '../data/initialData';
import {
  AIAnalysisResult,
  AuthSession,
  ActiveOrder,
  TransactionRecord,
  CatalogItem,
  DeliveryZone,
  GardenAdvisorResult,
  OrderCheckoutResult,
  IdentificationReviewRecord,
  ServiceRequest,
  ServiceRequestEvent,
  ServiceRequestStatus
} from '../types';

export function compressImage(file: File, maxDimension = 800, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo file. Please try another photo.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('This photo format is not supported (for example HEIC). Please choose a JPG or PNG, or switch the camera to "Most Compatible".'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function catalogHeaders(token: string) {
  if (!token) throw new Error('Administrator sign-in is required.');
  return { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' };
}

/**
 * Translation columns come from supabase/migrations/20261108_catalog_bilingual_fields.sql. They are sent only when a
 * person entered a value, so saves keep working on a database that has not received that migration yet.
 */
export function catalogTranslationFields(item: CatalogItem): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value?: string) => { const v = String(value || '').trim(); if (v) out[key] = v; };
  put('name_es', item.name_es);
  put('description_en', item.description_en);
  put('description_es', item.description_es);
  put('care_instructions_en', item.care_instructions_en);
  put('care_instructions_es', item.care_instructions_es);
  return out;
}

function catalogBody(item: CatalogItem) {
  return { name: item.name, category: item.category || 'Outdoor', description: item.note || item.sci || '', price: Number(item.price), currency: item.currency || 'HNL', stock_quantity: Math.max(0, Number(item.stock_quantity) || 0), is_active: true, ...(item.material_spec ? { material_spec: item.material_spec } : {}), ...catalogTranslationFields(item) };
}

/** Thrown when the database row saved but a follow-up step (photo) failed, so the UI can still show what was saved. */
export class CatalogSaveError extends Error {
  saved?: CatalogItem;
  constructor(message: string, saved?: CatalogItem) {
    super(message);
    this.name = 'CatalogSaveError';
    this.saved = saved;
  }
}

/** Preserve the HTTP status so the UI can refresh an expired session without retrying permission failures. */
export class CatalogRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CatalogRequestError';
    this.status = status;
  }
}

/** Explain a failed catalog write. RLS blocks return 200 with zero rows, which is easy to mistake for success. */
function tokenEmail(token?: string): string {
  try {
    const part = (token || '').split('.')[1] || '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return String(JSON.parse(json).email || '');
  } catch {
    return '';
  }
}

function catalogWriteError(response: Response, rows: any, action: string, token?: string): Error {
  if (response.status === 401) {
    return new CatalogRequestError('Your administrator session has expired or is no longer valid. Refreshing the sign-in may fix this.', 401);
  }
  if (response.status === 403) {
    const who = tokenEmail(token);
    return new CatalogRequestError('Supabase denied this catalog change (403)' + (who ? ' for ' + who : '') + '. That account may not be the administrator, or its database role or Row Level Security policy does not permit this action. Sign in as the administrator and try again.', 403);
  }
  if (response.ok && Array.isArray(rows) && rows.length === 0) {
    return new Error('Supabase returned no saved row for this ' + action + '. The database may have blocked the change or the record may no longer exist. Check the administrator catalog permissions.');
  }
  return new Error(rows?.message || rows?.details || 'Supabase could not ' + action + ' the record (' + response.status + ').');
}

export async function saveCatalogItem(item: CatalogItem, token: string): Promise<CatalogItem> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);
  const id = uuid ? item.id : crypto.randomUUID();
  const body = { ...catalogBody(item), ...(uuid ? {} : { id }) };
  const url = SUPABASE_URL + '/rest/v1/products' + (uuid ? '?id=eq.' + encodeURIComponent(id) : '');
  const response = await fetch(url, { method: uuid ? 'PATCH' : 'POST', headers: catalogHeaders(token), body: JSON.stringify(body), cache: 'no-store' });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || rows.length !== 1) throw catalogWriteError(response, rows, 'save', token);
  const row = rows[0];
  let saved: CatalogItem = { ...item, id: String(row.id), name: String(row.name || item.name), category: String(row.category || item.category), price: Number(row.price ?? item.price), currency: (row.currency || item.currency) as 'HNL' | 'USD', stock_quantity: Number(row.stock_quantity ?? item.stock_quantity), image_url: String(row.image_url || item.image_url || '') };
  if (item.image_url?.startsWith('data:image/')) {
    const blob = await (await fetch(item.image_url)).blob();
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = id + '/' + Date.now() + '-' + crypto.randomUUID() + '.' + ext;
    const storage = SUPABASE_URL + '/storage/v1/object/product-images/' + path.split('/').map(encodeURIComponent).join('/');
    const upload = await fetch(storage, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'false' }, body: blob });
    const up = await upload.json().catch(() => ({}));
    if (!upload.ok) throw new CatalogSaveError('Your changes were saved, but the photo could not be uploaded: ' + (up.message || up.error || upload.status) + (upload.status === 401 || upload.status === 403 ? ' (administrator permission). Sign out and back in as the administrator.' : ''), { ...saved, image_url: String(row.image_url || '') });
    const imageUrl = SUPABASE_URL + '/storage/v1/object/public/product-images/' + path.split('/').map(encodeURIComponent).join('/');
    const patch = await fetch(SUPABASE_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: catalogHeaders(token), body: JSON.stringify({ image_url: imageUrl }), cache: 'no-store' });
    const patched = await patch.json().catch(() => []);
    if (!patch.ok || !Array.isArray(patched) || patched.length !== 1) throw new CatalogSaveError('Your changes were saved and the photo uploaded, but its link could not be stored on the record. ' + catalogWriteError(patch, patched, 'update', token).message, { ...saved, image_url: String(row.image_url || '') });
    saved = { ...saved, image_url: imageUrl };
  }
  return saved;
}

// Legacy seed/catalog IDs (for example "p-areca") belong to catalog_items, whose
// primary key is TEXT. Production products use UUID IDs. Never send a text slug
// to a UUID-backed column: Postgres rejects it before the request can run.
function catalogTableForId(id: string): 'products' | 'catalog_items' {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id));
  return isUuid ? 'products' : 'catalog_items';
}

export async function deleteCatalogItem(id: string, token: string): Promise<void> {
  if (!id || !String(id).trim()) throw new Error('A valid catalog item ID is required.');
  const table = catalogTableForId(id);
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: catalogHeaders(token),
    cache: 'no-store'
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || rows.length !== 1) {
    if (response.ok && Array.isArray(rows) && rows.length === 0) {
      throw new Error('No matching catalog record was deleted. Refresh the catalog and try again. If this is a legacy item, confirm that the catalog_items table exists in the connected Supabase project.');
    }
    throw new Error(rows?.message || rows?.details || 'Supabase rejected catalog deletion (' + response.status + ').');
  }
}

export async function updateCatalogStock(id: string, quantity: number, token: string): Promise<number> {
  const table = catalogTableForId(id);
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: catalogHeaders(token),
    body: JSON.stringify({ stock_quantity: Math.max(0, Math.floor(quantity)) }),
    cache: 'no-store'
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error(rows?.message || rows?.details || 'Supabase rejected stock update (' + response.status + ').');
  return Number(rows[0].stock_quantity);
}

export async function uploadCatalogPhoto(productId: string, file: File, token: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image must be smaller than 15 MB.');
  const compressed = await compressImage(file, 1400, 0.84);
  return uploadCatalogPhotoDataUrl(productId, compressed, token);
}

export async function uploadCatalogPhotoDataUrl(productId: string, dataUrl: string, token: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) throw new Error('A compressed catalog image is required.');
  const blob = await (await fetch(dataUrl)).blob();
  const path = productId + '/' + Date.now() + '-' + crypto.randomUUID() + '.jpg';
  const storage = SUPABASE_URL + '/storage/v1/object/product-images/' + path.split('/').map(encodeURIComponent).join('/');
  const upload = await fetch(storage, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'false' }, body: blob });
  const d = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(d.message || d.error || 'Photo upload failed (' + upload.status + ').');
  const publicUrl = SUPABASE_URL + '/storage/v1/object/public/product-images/' + path.split('/').map(encodeURIComponent).join('/');
  const table = catalogTableForId(productId);
  const patch = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(productId), { method: 'PATCH', headers: catalogHeaders(token), body: JSON.stringify({ image_url: publicUrl }), cache: 'no-store' });
  const rows = await patch.json().catch(() => []);
  if (!patch.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error('Photo uploaded but its link was not saved: ' + catalogWriteError(patch, rows, 'update', token).message);
  return publicUrl;
}
export interface BchRateResponse {
  hnlPerUsd: number;
  rateDate: string;
  fetchedAt: string;
  source: string;
}

export async function fetchBchRate(): Promise<BchRateResponse> {
  try {
    const res = await fetch(`${CURRENCY_WORKER_URL}/latest`, { method: 'GET', cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    const rate = Number(payload.usd_to_hnl);
    if (res.ok && payload.success === true && Number.isFinite(rate) && rate > 0) {
      return {
        hnlPerUsd: rate,
        rateDate: payload.rate_date || 'Today',
        fetchedAt: payload.fetched_at || new Date().toISOString(),
        source: 'Banco Central de Honduras'
      };
    }
  } catch (err) {
    console.warn('BCH Worker rate unavailable, using official benchmark rate:', err);
  }

  return {
    hnlPerUsd: 26,
    rateDate: 'Offline reference',
    fetchedAt: new Date().toISOString(),
    source: 'Manual fallback rate (not live)'
  };
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/delivery_zones?select=id,name,description,fee,currency&is_active=eq.true&order=name.asc`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      }
    );
    const rows = await response.json().catch(() => []);
    if (response.ok && Array.isArray(rows) && rows.length > 0) {
      return rows.map((z) => ({
        id: String(z.id),
        name: String(z.name),
        fee: Number(z.fee) || 0,
        currency: (z.currency || 'USD') as 'USD' | 'HNL',
        description: String(z.description || '')
      }));
    }
  } catch (err) {
    console.warn('Could not load delivery zones from Supabase, using Roatan defaults:', err);
  }
  return ROATAN_DELIVERY_ZONES;
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  try {
    const response = await fetch(`${API_URL}/plants`, { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok && payload.status === 'success' && Array.isArray(payload.plants)) {
      return payload.plants.map((p: any) => {
        const category = String(p.category || 'Outdoor');
        const name = String(p.name || 'Unnamed plant');
        const kind = /palm/i.test(name)
          ? 'palm'
          : /grass|sod|peanut/i.test(name)
          ? 'grass'
          : /flower|hibiscus|mussaenda|plumbago|ginger|boug/i.test(name)
          ? 'flower'
          : 'shrub';
        const qty = Number(p.stock_quantity) || 0;
        return {
          id: String(p.id),
          t: 'plant',
          name,
          name_es: String(p.name_es || p.common_name_es || p.spanish_name || '').trim() || undefined,
          scientific_name: String(p.scientific_name || '').trim() || undefined,
          description_en: String(p.description_en || '').trim() || undefined,
          description_es: String(p.description_es || '').trim() || undefined,
          care_instructions_en: String(p.care_instructions_en || '').trim() || undefined,
          care_instructions_es: String(p.care_instructions_es || '').trim() || undefined,
          alternative_names_en: toNameList(p.alternative_names_en),
          alternative_names_es: toNameList(p.alternative_names_es),
          sci: String(p.scientific_name || p.sci || p.description || ''),
          kind,
          salt: Number(p.salt_tolerance_rating) || 2,
          sun: String(p.sunlight_requirement || 'Full to partial sun'),
          water: String(p.watering_instructions || 'Standard tropical schedule'),
          price: Number(p.price) || 250,
          currency: String(p.currency || 'HNL') as 'HNL' | 'USD',
          size: String(p.size || 'Nursery pot'),
          stock: qty > 0 ? (qty <= 5 ? 'Low stock' : 'In stock') : 'Out of stock',
          stock_quantity: qty,
          nursery: 'Verde Roatán Nursery',
          pet: p.pet_safety === 'safe' ? 'safe' : 'check',
          tags: Array.isArray(p.tags) && p.tags.length ? p.tags.map(String) : [category.toLowerCase(), kind],
          note: String(p.description || 'Tropical island specimen acclimatized to Roatan.'),
          category,
          image_url: p.image_url || '',
          material_spec: p.material_spec && typeof p.material_spec === 'object' ? p.material_spec : undefined
        };
      });
    }
  } catch (err) {
    console.warn('Could not load catalog from API worker; retaining the last locally cached catalog:', err);
    throw err instanceof Error ? err : new Error('Catalog service is unavailable.');
  }
  throw new Error('Catalog service returned an invalid response.');
}

export async function submitOrderCheckout(
  body: {
    checkout_token: string;
    customer_name: string;
    customer_phone: string;
    delivery_zone_id: string;
    delivery_address: string;
    notes: string;
    currency: string;
    marketing_consent: boolean;
    items: Array<{ product_id: string; quantity: number }>;
  },
  token?: string
): Promise<OrderCheckoutResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && (payload.order_id || payload.order?.order_id || payload.order?.id)) {
      return payload.order || payload;
    }
    const message = payload.error || payload.message || payload.details || 'The order could not be confirmed by the server.';
    throw new Error(String(message));
  } catch (err) {
    console.error('Remote checkout failed; no local order confirmation was created:', err);
    throw err instanceof Error ? err : new Error('Checkout service is unavailable. Please try again.');
  }
}

/**
 * The relative /api/* routes only exist when the Express dev/web server is serving the app.
 * Inside the Android (Capacitor) app they point at nothing, so skip them and go straight to the
 * Cloudflare worker instead of burning seconds on a request that cannot succeed.
 */
function hasLocalApi(): boolean {
  try {
    return !(typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return true;
  }
}

export async function analyzeBotanicalImage(
  mode: 'plant' | 'pest',
  base64Image: string,
  lang: 'en' | 'es',
  token?: string
): Promise<AIAnalysisResult> {
  const payloadBody = JSON.stringify({ mode, image: base64Image, lang });
  const endpoints = hasLocalApi() ? ['/api/analyze', AI_WORKER_URL] : [AI_WORKER_URL];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 70000);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      };
      if (endpoint !== '/api/analyze') headers.apikey = SUPABASE_PUBLISHABLE_KEY;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(endpoint, {
        method: 'POST', headers, signal: controller.signal, body: payloadBody
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === 'success' && (result.verified_botanical_record || result.result || result.candidates)) {
        return result as AIAnalysisResult;
      }
      lastError = new Error(result.error || result.message || `Plant analysis failed (${response.status}).`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Plant analysis service is unavailable.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(lastError?.message || 'Plant intelligence is temporarily unavailable. Please try again.');
}

export async function refineBotanicalIdentification(
  mode: 'plant' | 'pest',
  base64Image: string,
  initialResult: AIAnalysisResult,
  lang: 'en' | 'es',
  token?: string
): Promise<AIAnalysisResult> {
  const body = JSON.stringify({ mode, image: base64Image, initialResult, lang });
  const endpoints = hasLocalApi()
    ? ['/api/refine-identification', `${AI_WORKER_URL}/refine`]
    : [`${AI_WORKER_URL}/refine`];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 70000);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      };
      if (endpoint !== '/api/refine-identification') headers.apikey = SUPABASE_PUBLISHABLE_KEY;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(endpoint, { method: 'POST', headers, signal: controller.signal, body });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === 'success' && (result.verified_botanical_record || result.result || result.candidates)) {
        return result as AIAnalysisResult;
      }
      lastError = new Error(result.error || result.message || `Refinement failed (${response.status}).`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Refinement service is unavailable.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(lastError?.message || 'The refinement service is unavailable. Your original identification has been kept unchanged.');
}

export async function submitIdentificationFeedback(
  mode: 'plant' | 'pest',
  image: string,
  result: AIAnalysisResult,
  decision: 'confirmed' | 'almost' | 'not_my_plant',
  correctedCommonName: string,
  correctedScientificName: string,
  accessToken: string,
  notes = '',
  language = 'en',
  shareForBotanicalLearning = false
): Promise<{ review_id: string; review_status: string; verification_level?: string; message: string }> {
  if (!accessToken) throw new Error('Please sign in before confirming an identification.');
  if (!image?.startsWith('data:image/')) throw new Error('The original specimen photo is missing.');
  if (mode !== 'plant') throw new Error('Plant identification feedback is currently available for plant specimens.');

  const record = result.verified_botanical_record;
  const candidate = result.candidates?.[0];
  const payload = {
    image,
    identification: {
      candidate: {
        common_name: record?.common_name || candidate?.common_name || '',
        scientific_name: record?.scientific_name || candidate?.scientific_name || '',
        confidence_score: candidate?.confidence_score
      },
      family: record?.plant_family || '',
      model_used: result.model_used || ''
    },
    decision,
    corrected_common_name: correctedCommonName.trim(),
    corrected_scientific_name: correctedScientificName.trim(),
    notes: notes.trim(),
    share_for_botanical_learning: shareForBotanicalLearning === true,
    source: { app: 'verde-roatan', platform: 'android', language }
  };

  const response = await fetch(`${AI_WORKER_URL}/identification-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.error || data.message || 'Your identification feedback could not be saved.');
  }
  return data;
}

async function callIdentificationReviewAdmin(
  route: 'admin/list' | 'admin/review',
  payload: Record<string, unknown>,
  accessToken: string
): Promise<any> {
  if (!accessToken) throw new Error('Administrator sign-in is required.');
  const response = await fetch(`${AI_WORKER_URL}/identification-review/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.error || data.message || 'The identification review service is unavailable.');
  }
  return data;
}

export async function fetchIdentificationReviewQueue(
  accessToken: string,
  status: 'pending' | 'approved' | 'rejected' = 'pending'
): Promise<IdentificationReviewRecord[]> {
  const data = await callIdentificationReviewAdmin('admin/list', { status }, accessToken);
  return Array.isArray(data.reviews) ? data.reviews as IdentificationReviewRecord[] : [];
}

export async function reviewIdentificationRecord(
  accessToken: string,
  reviewId: string,
  status: 'approved' | 'rejected',
  adminNotes = '',
  verificationBasis = ''
): Promise<void> {
  // Approving never verifies. Scientific verification is only sent with a written basis.
  await callIdentificationReviewAdmin('admin/review', {
    review_id: reviewId,
    status,
    admin_notes: adminNotes,
    ...(verificationBasis ? { verify: { basis: verificationBasis } } : {})
  }, accessToken);
}

export async function supabaseAuthRequest(path: string, payload: any, token?: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.msg || data.message || data.error_description || data.error || 'Authentication error.');
  }
  return data;
}

export async function fetchAdminOrders(token: string): Promise<ActiveOrder[]> {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };
  const base = `${SUPABASE_URL}/rest/v1`;
  const ordersResponse = await fetch(`${base}/orders?select=*&order=created_at.desc&limit=100`, {
    headers, cache: 'no-store'
  });
  const orderRows = await ordersResponse.json().catch(() => []);
  if (!ordersResponse.ok || !Array.isArray(orderRows)) {
    const message = Array.isArray(orderRows) ? 'Unable to read orders from Supabase.' : (orderRows.message || 'Unable to read orders from Supabase.');
    throw new Error(message);
  }
  if (!orderRows.length) return [];

  const ids = orderRows.map((row: any) => String(row.id || '')).filter(Boolean);
  const inFilter = `in.(${ids.join(',')})`;
  const readRelated = async (table: string) => {
    if (!ids.length) return [];
    try {
      const response = await fetch(`${base}/${table}?select=*&order_id=${encodeURIComponent(inFilter)}`, {
        headers, cache: 'no-store'
      });
      const rows = await response.json().catch(() => []);
      return response.ok && Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const [itemRows, historyRows, messageRows] = await Promise.all([
    readRelated('order_items'), readRelated('order_status_history'), readRelated('order_messages')
  ]);

  const displayStatus = (canonical: string): ActiveOrder['status'] => {
    if (['out_for_delivery'].includes(canonical)) return 'en_route';
    if (['delivered', 'completed'].includes(canonical)) return 'delivered';
    if (['cancelled', 'refunded', 'refund_requested'].includes(canonical)) return 'cancelled';
    if (['supplier_confirmation_required', 'supplier_confirmed', 'preparing_order', 'ready_for_pickup'].includes(canonical)) return 'staged';
    return 'placed';
  };

  return orderRows.map((row: any) => {
    const id = String(row.id || row.order_id || '');
    const canonical = String(row.canonical_status || row.status || 'order_placed');
    const items = itemRows.filter((item: any) => String(item.order_id) === id).map((item: any) => ({
      id: String(item.product_id || item.catalog_item_id || item.id || ''),
      name: String(item.item_name || item.product_name || item.name || 'Nursery item'),
      price: Number(item.unit_price ?? item.price ?? 0),
      currency: (item.currency || row.currency || 'HNL') as 'HNL' | 'USD',
      qty: Number(item.quantity ?? item.qty ?? 1),
      size: item.plant_size || item.size || undefined,
      image_url: item.image_url || undefined,
      supplier_name: item.supplier_name || row.assigned_supplier_name || undefined
    }));
    const history = historyRows.filter((entry: any) => String(entry.order_id) === id).map((entry: any) => ({
      id: String(entry.id || `${id}-${entry.timestamp}`),
      previous_status: entry.previous_status || undefined,
      new_status: String(entry.new_status || 'order_placed'),
      timestamp: String(entry.timestamp || row.created_at || new Date().toISOString()),
      responsible_role: entry.responsible_role || 'system',
      responsible_name: entry.responsible_name || 'Verde system',
      notes: entry.notes || undefined,
      metadata: entry.metadata || undefined
    }));
    const messages = messageRows.filter((message: any) => String(message.order_id) === id).map((message: any) => ({
      id: String(message.id || `${id}-message`),
      order_id: String(row.order_id || id),
      sender_role: message.sender_role || 'admin',
      sender_name: message.sender_name || 'Verde team',
      recipient_role: message.recipient_role || 'all',
      message: String(message.message || ''),
      timestamp: String(message.timestamp || row.created_at || new Date().toISOString()),
      is_internal: Boolean(message.is_internal)
    }));
    return {
      id,
      order_id: String(row.order_id || id),
      created_at: String(row.created_at || new Date().toISOString()),
      items,
      customer_name: String(row.customer_name || 'Customer'),
      phone: String(row.customer_phone || row.phone || ''),
      address: String(row.delivery_address || row.address || ''),
      zone_id: String(row.delivery_zone_id || row.zone_id || ''),
      zone_name: String(row.delivery_zone_name || row.zone_name || ''),
      timing: String(row.preferred_timing || row.timing || ''),
      notes: String(row.notes || ''),
      currency: (row.currency || 'HNL') as 'HNL' | 'USD',
      subtotal: Number(row.subtotal || 0),
      delivery_fee: Number(row.delivery_fee || 0),
      total: Number(row.total || 0),
      status: displayStatus(canonical),
      canonical_status: canonical as ActiveOrder['canonical_status'],
      payment_status: row.payment_status || 'pending',
      payment_method: row.payment_method || undefined,
      delivery_type: row.delivery_type || 'island_delivery',
      exchange_rate_used: Number(row.usd_to_hnl_rate || row.exchange_rate_used || 26),
      assigned_supplier_id: row.assigned_supplier_id || undefined,
      assigned_supplier_name: row.assigned_supplier_name || undefined,
      supplier_cost: Number(row.supplier_cost || 0),
      supplier_cost_currency: row.supplier_cost_currency || row.currency || 'HNL',
      supplier_paid: Boolean(row.supplier_paid),
      delivered_at: row.delivered_at || undefined,
      confirmed_by_customer: Boolean(row.confirmed_by_customer),
      status_history: history,
      messages
    } as ActiveOrder;
  });
}

// Customer reads use the same Supabase REST queries as the admin loader; RLS limits
// this authenticated request to the signed-in customer's own orders and related rows.
export async function fetchCustomerOrders(token: string): Promise<ActiveOrder[]> {
  return fetchAdminOrders(token);
}

export async function fetchAdminTransactions(token: string): Promise<TransactionRecord[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/transaction_records?select=*&order=timestamp.desc&limit=200`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) {
    throw new Error(rows?.message || 'Unable to load the financial transaction ledger.');
  }
  return rows.map((row: any) => ({
    id: String(row.id),
    related_order_id: String(row.related_order_id || row.reference_number || ''),
    type: row.transaction_type,
    customer_name: row.customer_name || undefined,
    supplier_id: row.supplier_id || undefined,
    supplier_name: row.supplier_name || undefined,
    amount: Number(row.amount || 0),
    currency: (row.currency || 'HNL') as 'HNL' | 'USD',
    exchange_rate: Number(row.exchange_rate || 26),
    payment_method: row.payment_method || undefined,
    status: row.status || 'pending',
    timestamp: String(row.timestamp || new Date().toISOString()),
    responsible_name: String(row.responsible_name || 'Verde system'),
    responsible_role: row.responsible_role || 'system',
    notes: String(row.notes || ''),
    reference_number: row.reference_number || undefined
  } as TransactionRecord));
}

export async function supabaseRpcRequest(functionName: string, args: Record<string, unknown>, token: string): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(args)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.details || data.hint || `Supabase operation failed (${response.status}).`);
  }
  return data;
}

export async function refreshSupabaseSession(refreshToken: string): Promise<any> {
  return supabaseAuthRequest('token?grant_type=refresh_token', { refresh_token: refreshToken });
}

export async function verifySupabaseUser(accessToken: string): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.msg || 'Your session has expired. Please sign in again.');
  return data;
}

export async function fetchGardenRecommendations(params: {
  conditions: string;
  goals: string;
  catalogItems: CatalogItem[];
  lang: 'en' | 'es';
}): Promise<GardenAdvisorResult> {
  if (hasLocalApi()) try {
    const res = await fetch('/api/garden-advisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conditions: params.conditions,
        goals: params.goals,
        catalogItems: params.catalogItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          price_usd: item.price,
          description: item.note,
          in_stock: item.stock !== 'Out of stock',
          tags: item.tags || []
        })),
        lang: params.lang
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success' && Array.isArray(data.recommendations)) {
        // Hydrate recommendation items with full catalog details
        const catalogMap = new Map(params.catalogItems.map((c) => [c.id, c]));
        data.recommendations = data.recommendations.map((rec: any) => {
          const matched = catalogMap.get(rec.product_id);
          return {
            ...rec,
            catalog_item: matched || undefined
          };
        });
        return data as GardenAdvisorResult;
      }
    }
    const errText = await res.text().catch(() => '');
    console.warn('/api/garden-advisor returned non-success, using local fallback:', errText);
  } catch (err) {
    console.warn('Network call to /api/garden-advisor failed, using local horticultural heuristics:', err);
  }

  // Try the already-deployed Gemini worker before using the offline horticultural fallback.
  try {
    const workerResponse = await fetch(`${AI_WORKER_URL}/garden-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({
        conditions: params.conditions,
        goals: params.goals,
        catalogItems: params.catalogItems.map((item) => ({
          id: item.id, name: item.name, category: item.category,
          price: item.price, currency: item.currency, description: item.note,
          in_stock: item.stock !== 'Out of stock', tags: item.tags || []
        })),
        lang: params.lang
      })
    });
    const workerData = await workerResponse.json().catch(() => ({}));
    if (workerResponse.ok && workerData.status === 'success' && Array.isArray(workerData.recommendations)) {
      const catalogMap = new Map(params.catalogItems.map((item) => [item.id, item]));
      workerData.recommendations = workerData.recommendations.map((rec: any) => ({
        ...rec, catalog_item: catalogMap.get(rec.product_id) || undefined
      }));
      return workerData as GardenAdvisorResult;
    }
    console.warn('Gemini garden-advisor worker returned no recommendations:', workerData.error || workerResponse.status);
  } catch (error) {
    console.warn('Gemini garden-advisor worker unavailable; using offline recommendations.', error);
  }

  // Deterministic, rule-based advice from the structured plant data. Needs no network and no AI.
  return buildRuleBasedAdvice({
    conditions: params.conditions,
    goals: params.goals,
    catalog: params.catalogItems.length > 0 ? params.catalogItems : INITIAL_CATALOG,
    lang: params.lang
  });
}


// ---------------------------------------------------------------------------
// Landscaping service requests (separate from product orders)
// ---------------------------------------------------------------------------

function serviceRequestError(data: any, status: number): Error {
  const code = String(data?.code || '');
  const msg = String(data?.message || '');
  // Tables / functions missing => the Supabase migration has not been applied yet.
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883' || /schema cache|does not exist/i.test(msg)) {
    return new Error(
      'Landscaping requests are not set up in the database yet. An administrator must run the latest Supabase migration (20261104_verde_landscaping_requests.sql).'
    );
  }
  if (code === '42501' || status === 401 || status === 403 || /row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error('Your session does not have permission for this action. Please sign out and sign in again.');
  }
  return new Error(msg || data?.details || data?.hint || `Request failed (${status}).`);
}

async function serviceRest(path: string, token: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<any> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.prefer) headers.Prefer = init.prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => (response.ok ? [] : {}));
  if (!response.ok) throw serviceRequestError(data, response.status);
  return data;
}

export interface NewServiceRequestInput {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceType: string;
  description: string;
  location: string;
  requestedTiming?: string;
  requestedDate?: string | null;
  landscaperRef?: string;
  landscaperName?: string;
}

/** Saves a landscaping request. Resolves only after the database confirms the new row. */
export async function submitServiceRequest(token: string, input: NewServiceRequestInput): Promise<ServiceRequest> {
  if (!token) throw new Error('Please sign in to request a landscaper.');
  if (!input.customerId) throw new Error('Your account could not be verified. Please sign in again.');
  const rows = await serviceRest('service_requests', token, {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      customer_id: input.customerId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      customer_email: input.customerEmail?.trim() || null,
      service_type: input.serviceType,
      description: input.description.trim(),
      location: input.location,
      requested_timing: input.requestedTiming || null,
      requested_date: input.requestedDate || null,
      requested_landscaper_ref: input.landscaperRef || null,
      requested_landscaper_name: input.landscaperName || null,
      status: 'new_request'
    }
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) throw new Error('The request was not saved. Please try again.');
  return row as ServiceRequest;
}

export async function fetchMyServiceRequests(token: string): Promise<ServiceRequest[]> {
  const rows = await serviceRest('service_requests?select=*&order=created_at.desc&limit=50', token);
  return Array.isArray(rows) ? (rows as ServiceRequest[]) : [];
}

export async function fetchAdminServiceRequests(token: string): Promise<ServiceRequest[]> {
  const rows = await serviceRest('service_requests?select=*&order=created_at.desc&limit=300', token);
  return Array.isArray(rows) ? (rows as ServiceRequest[]) : [];
}

export async function fetchServiceRequestEvents(token: string, requestId: string): Promise<ServiceRequestEvent[]> {
  const rows = await serviceRest(
    `service_request_events?select=*&request_id=eq.${encodeURIComponent(requestId)}&order=created_at.asc&limit=500`,
    token
  );
  return Array.isArray(rows) ? (rows as ServiceRequestEvent[]) : [];
}

export interface AdminServiceRequestUpdate {
  status?: ServiceRequestStatus;
  assignedRef?: string | null;
  assignedName?: string | null;
  clearAssignment?: boolean;
  quoteAmount?: number | null;
  quoteCurrency?: 'USD' | 'HNL' | null;
  quoteNotes?: string | null;
  customerResponse?: string | null;
  note?: string | null;
  channel?: 'whatsapp' | 'phone' | 'email' | 'in_app' | 'in_person' | null;
  direction?: 'inbound' | 'outbound' | 'internal' | null;
  internal?: boolean;
  actorName?: string | null;
}

/** Administrator update through the database function, which also writes the project history. */
export async function adminUpdateServiceRequest(token: string, requestId: string, u: AdminServiceRequestUpdate): Promise<void> {
  const result = await serviceRest('rpc/admin_update_service_request', token, {
    method: 'POST',
    body: {
      p_request_id: requestId,
      p_status: u.status ?? null,
      p_assigned_ref: u.assignedRef ?? null,
      p_assigned_name: u.assignedName ?? null,
      p_clear_assignment: u.clearAssignment ?? false,
      p_quote_amount: u.quoteAmount ?? null,
      p_quote_currency: u.quoteCurrency ?? null,
      p_quote_notes: u.quoteNotes ?? null,
      p_customer_response: u.customerResponse ?? null,
      p_note: u.note ?? null,
      p_channel: u.channel ?? null,
      p_direction: u.direction ?? null,
      p_internal: u.internal ?? false,
      p_actor_name: u.actorName ?? null
    }
  });
  if (!result || result.success !== true) throw new Error('The update was not confirmed by the database.');
}

export async function respondToServiceQuote(token: string, requestId: string, accept: boolean, message?: string): Promise<void> {
  const result = await serviceRest('rpc/customer_respond_to_service_quote', token, {
    method: 'POST',
    body: { p_request_id: requestId, p_accept: accept, p_message: message?.trim() || null }
  });
  if (!result || result.success !== true) throw new Error('Your response was not confirmed. Please try again.');
}


// ---------------------------------------------------------------------------
// Bulk botanical import (administrators only; served by the Cloudflare worker)
// ---------------------------------------------------------------------------
async function botanicalImportCall(route: string, payload: Record<string, unknown>, accessToken: string): Promise<any> {
  if (!accessToken) throw new Error('Administrator sign-in is required.');
  let response: Response;
  try {
    response = await fetch(`${AI_WORKER_URL}/botanical-import/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('Could not reach the Verde Roatán service. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || (response.status === 405)) {
    throw new Error('The import service is not deployed yet. Deploy the latest Cloudflare worker, then try again.');
  }
  if (!response.ok || data.status !== 'success') throw new Error(data.error || 'The import service returned an error (' + response.status + ').');
  return data;
}

export interface TaxonomyCheck { name: string; match: string; status?: string | null; canonical?: string | null; family?: string | null; kingdom?: string | null }

export async function fetchExistingBotanicalRecords(token: string): Promise<Array<{ scientific_name: string; common_name?: string }>> {
  return (await botanicalImportCall('existing', {}, token)).records || [];
}
export async function validateBotanicalNames(token: string, names: string[]): Promise<TaxonomyCheck[]> {
  return (await botanicalImportCall('validate', { names }, token)).results || [];
}
export async function suggestImportColumnMapping(token: string, headers: string[], sample: string[][]): Promise<Record<string, string | null>> {
  return (await botanicalImportCall('map-columns', { headers, sample }, token)).mapping || {};
}
export interface BotanicalImportResult { batch_id: string; inserted: number; skipped: number; rejected: Array<{ name: string; reason: string }> }
export async function commitBotanicalImport(token: string, filename: string, rows: unknown[]): Promise<BotanicalImportResult> {
  return await botanicalImportCall('commit', { filename, rows }, token);
}


// ---------------------------------------------------------------------------
// Botanical Knowledge Center (administrators only; served by the Cloudflare worker)
// ---------------------------------------------------------------------------
async function knowledgeCall(route: string, payload: Record<string, unknown>, token: string): Promise<any> {
  if (!token) throw new Error('Administrator sign-in is required.');
  let response: Response;
  try {
    response = await fetch(`${AI_WORKER_URL}/knowledge/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('Could not reach the Verde Roatán service. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || response.status === 405) throw new Error('The Knowledge Center service is not deployed yet. Deploy the latest Cloudflare worker, then try again.');
  if (!response.ok || data.status !== 'success') throw new Error(data.error || 'The Knowledge Center service returned an error (' + response.status + ').');
  return data;
}

export type KnowledgeStatus = 'uploaded' | 'processing' | 'awaiting_review' | 'approved' | 'rejected' | 'failed';
export interface KnowledgeDocument {
  id: string; original_name: string; file_size_bytes: number; status: KnowledgeStatus; stage: string;
  error_message?: string | null; visibility: 'private' | 'public'; citation?: string | null; source_institution?: string | null;
  page_count?: number | null; chunks_count: number; rag_indexed: boolean; uploaded_by_email?: string; created_at: string; reviewed_at?: string | null;
}
export interface KnowledgeEntity {
  id: string; category: string; field_name: string; scientific_name?: string | null; extracted_value: { value?: string };
  confidence: number; source_page?: number | null; source_snippet?: string | null;
  approval_status: 'pending' | 'approved' | 'rejected' | 'modified'; edited_value?: { value?: string } | null;
}
export interface KnowledgeSource { n: number; document_id: string; document: string; citation?: string | null; page?: number | null; similarity: number; snippet: string; used: boolean }

export async function uploadKnowledgePdf(token: string, file: File): Promise<{ duplicate: boolean; document: { id: string; original_name: string; status: string } }> {
  let response: Response;
  try {
    response = await fetch(`${AI_WORKER_URL}/knowledge/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      body: file
    });
  } catch {
    throw new Error('Could not reach the Verde Roatán service. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || response.status === 405) throw new Error('The Knowledge Center service is not deployed yet. Deploy the latest Cloudflare worker, then try again.');
  if (!response.ok || data.status !== 'success') throw new Error(data.error || 'The PDF upload failed (' + response.status + ').');
  return data;
}
export const listKnowledgeDocuments = async (token: string): Promise<KnowledgeDocument[]> => (await knowledgeCall('list', {}, token)).documents || [];
export const getKnowledgeDocument = async (token: string, id: string): Promise<{ document: KnowledgeDocument; entities: KnowledgeEntity[]; chunks: Array<{ chunk_index: number; page_number?: number | null; content: string }>; pdf_url: string | null }> => knowledgeCall('document', { document_id: id }, token);
export const ingestKnowledgePages = async (token: string, id: string, pages: Array<{ page: number; text: string }>, final: boolean, pageCount: number) => knowledgeCall('ingest', { document_id: id, pages, final, page_count: pageCount }, token);
export const extractKnowledgeEntities = async (token: string, id: string): Promise<{ entities: number; warning?: string | null }> => knowledgeCall('extract', { document_id: id }, token);
export const reviewKnowledgeDocument = async (token: string, payload: { document_id: string; action: 'approve' | 'reject'; visibility?: 'private' | 'public'; citation?: string; source_institution?: string; entity_decisions?: Array<{ id: string; status: string; edited_value?: { value: string } }> }) => knowledgeCall('review', payload, token);
export const retryKnowledgeDocument = async (token: string, id: string): Promise<{ pdf_url: string | null }> => knowledgeCall('retry', { document_id: id }, token);
export const promoteKnowledgeDocument = async (token: string, id: string): Promise<{ created: number; skipped: number; message?: string }> => knowledgeCall('promote', { document_id: id }, token);
export const markKnowledgeFailed = async (token: string, id: string, message: string) => knowledgeCall('mark-failed', { document_id: id, message }, token);
export interface BotanicalReferenceImage {
  id: string; taxon_id: string; image_type: string; source_name?: string | null; source_url?: string | null;
  attribution?: string | null; license?: string | null; review_status: 'pending' | 'approved' | 'rejected';
  visibility: 'private' | 'public'; preview_url?: string | null; created_at?: string;
}
export async function listBotanicalReferenceImages(token: string, review_status = 'pending'): Promise<BotanicalReferenceImage[]> {
  return (await knowledgeCall('reference-images/list', { review_status }, token)).images || [];
}
export async function uploadBotanicalReferenceImage(token: string, file: File, fields: {
  taxon_id: string; image_type: string; source_name?: string; source_url?: string; attribution?: string; license?: string;
}): Promise<BotanicalReferenceImage> {
  const form = new FormData();
  form.append('file', file); Object.entries(fields).forEach(([k,v]) => { if (v) form.append(k, v); });
  let response: Response;
  try {
    response = await fetch(`${AI_WORKER_URL}/knowledge/reference-images/upload`, {
      method: 'POST', headers: { Accept: 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, body: form
    });
  } catch { throw new Error('Could not reach the Verde Roatán service. Check your connection and try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success') throw new Error(data.error || 'The reference photo upload failed (' + response.status + ').');
  return data.image;
}
export async function reviewBotanicalReferenceImage(token: string, image_id: string, action: 'approve' | 'reject', visibility: 'private' | 'public' = 'private'): Promise<void> {
  await knowledgeCall('reference-images/review', { image_id, action, visibility }, token);
}
export interface BotanicalCatalogPhotoCandidate {
  product_id: string; product_name: string; scientific_name: string;
  taxon_id: string; common_name?: string | null; image_url: string;
}
export async function listBotanicalCatalogPhotoCandidates(token: string): Promise<BotanicalCatalogPhotoCandidate[]> {
  const data = await knowledgeCall('reference-images/catalog-candidates', {}, token);
  return Array.isArray(data.candidates) ? data.candidates : [];
}
export async function importBotanicalCatalogPhoto(token: string, candidate: BotanicalCatalogPhotoCandidate): Promise<{queued:boolean; review_status:string; visibility:string}> {
  return knowledgeCall('reference-images/import-catalog', {
    product_id: candidate.product_id, taxon_id: candidate.taxon_id
  }, token);
}
export async function searchBotanicalTaxa(token: string, q: string): Promise<Array<{id:string; scientific_name:string; common_name?:string}>> {
  const data = await knowledgeCall('reference-images/taxa-search', { q }, token);
  return data.results || [];
}

export interface BotanicalHealthRecord {
  id: string;
  record_type: 'pest' | 'disease';
  common_name: string;
  scientific_name?: string | null;
  aliases?: string[];
  description?: string | null;
  identification_features?: string | null;
  symptoms?: string;
  causes?: string | null;
  treatment?: string | null;
  prevention?: string | null;
  affected_plants?: string[];
  severity_guidance?: Record<string, unknown>;
  safety_warnings?: string[];
  source_references?: Array<Record<string, unknown>>;
  evidence?: Record<string, any>;
  evidence_image_url?: string | null;
  visibility: 'private' | 'public';
  review_status: 'pending' | 'approved' | 'rejected' | 'archived';
  verification_status: 'ai_identified' | 'community_submitted' | 'source_supported' | 'scientifically_verified';
  rag_indexed: boolean;
  created_at?: string;
}
export interface KnowledgeDocumentSummary {
  id: string;
  document_id: string;
  version: number;
  summary: string;
  key_facts: any[];
  critical_details: any[];
  safety_warnings: any[];
  source_pages: number[];
  generation_method: 'human' | 'ai_assisted' | 'imported';
  review_status: 'pending' | 'approved' | 'rejected' | 'superseded';
  reviewed_at?: string | null;
  created_at?: string;
}
export interface VerdeKnowledgeHit {
  source_type: 'research' | 'pest' | 'disease';
  source_id: string;
  document_id?: string | null;
  source_title: string;
  citation?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  content: string;
  verification_status: string;
  rank: number;
}
export interface VerdeKnowledgeSearchResult {
  status: string;
  source: string;
  ai_used: false;
  answered: boolean;
  answer: string;
  results: VerdeKnowledgeHit[];
  safety_note?: string | null;
  constitution?: { rules_in_force: number; checks: Array<{ key: string; title: string; passed: boolean; detail: string }> };
}

async function knowledgeCoreCall<T = any>(path: string, payload: Record<string, unknown>, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${KNOWLEDGE_CORE_WORKER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('The Botanical Knowledge Core is not reachable yet. The new Worker must be deployed before this feature can be used.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || response.status === 405) {
    throw new Error('The Botanical Knowledge Core Worker is not deployed yet.');
  }
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.error || data.message || 'The Botanical Knowledge Core request failed.');
  }
  return data as T;
}

export interface BotanicalEvidenceQueueItem {
  id: string; evidence_type: string; source_system: string; source_record_id?: string | null;
  subject_key?: string | null; submitted_payload: Record<string, unknown>;
  model_result?: Record<string, unknown> | null; status: string; approval_status: string;
  verification_status: string; created_at: string;
}
export async function listBotanicalEvidenceQueue(token: string): Promise<BotanicalEvidenceQueueItem[]> {
  const data = await knowledgeCoreCall<{ items: BotanicalEvidenceQueueItem[] }>('/engine/admin/list', {}, token);
  return data.items || [];
}
export async function reviewBotanicalEvidence(token: string, evidenceId: string, decision: 'approve' | 'reject', note = ''): Promise<void> {
  await knowledgeCoreCall('/engine/admin/review', { evidence_id: evidenceId, decision, note }, token);
}

export async function enqueueCatalogBotanicalEvidence(
  token: string,
  item: Pick<CatalogItem, 'id' | 'name' | 'name_es' | 'sci' | 'scientific_name' | 'image_url' | 'category'>
): Promise<void> {
  if (!item.image_url || !/^https:\/\//i.test(item.image_url)) return;
  const fingerprint = 'catalog-photo:' + String(item.id) + ':' + item.image_url.slice(-100);
  await knowledgeCoreCall('/engine/enqueue', {
    evidence_type: 'catalog_photo',
    source_system: 'rootwise-catalog',
    source_record_id: String(item.id),
    subject_key: scientificNameOf(item) || item.name,
    evidence_fingerprint: fingerprint,
    submitted_payload: {
      name: item.name,
      common_name: item.name,
      common_name_es: item.name_es || null,
      scientific_name: scientificNameOf(item),
      category: item.category || null,
      image_url: item.image_url,
      source_system: 'rootwise-catalog'
    }
  }, token);
}

export async function submitBotanicalHealthEvidence(
  recordType: 'pest' | 'disease',
  image: string,
  result: AIAnalysisResult,
  notes: string,
  accessToken: string
): Promise<{ record_id: string; review_status: string; verification_status: string }> {
  if (!accessToken) throw new Error('Please sign in before submitting a pest or disease report.');
  if (!image?.startsWith('data:image/')) throw new Error('The original evidence photo is missing.');
  const diagnosis = result.result || {};
  if (!diagnosis.primary_diagnosis) throw new Error('The diagnosis is missing. Analyze the photo again.');
  return knowledgeCoreCall('/health/submit', {
    record_type: recordType,
    common_name: diagnosis.primary_diagnosis,
    scientific_name: diagnosis.scientific_name || '',
    description: diagnosis.likely_cause || '',
    symptoms: Array.isArray(diagnosis.symptoms) ? diagnosis.symptoms.join('; ') : '',
    likely_cause: diagnosis.likely_cause || '',
    suggested_treatment: diagnosis.treatment || [],
    suggested_prevention: diagnosis.prevention || [],
    severity: diagnosis.severity || '',
    confidence: result.candidates?.[0]?.confidence_score,
    model: result.model_used || '',
    notes: notes.trim(),
    image
  }, accessToken);
}

export async function listBotanicalHealthRecords(
  token: string,
  status: 'pending' | 'approved' | 'rejected' | 'archived' = 'pending',
  recordType?: 'pest' | 'disease'
): Promise<BotanicalHealthRecord[]> {
  const data = await knowledgeCoreCall<{ records: BotanicalHealthRecord[] }>('/health/admin/list', {
    status, ...(recordType ? { record_type: recordType } : {})
  }, token);
  return data.records || [];
}
export async function createBotanicalHealthRecord(token: string, payload: Record<string, unknown>): Promise<BotanicalHealthRecord> {
  const data = await knowledgeCoreCall<{ record: BotanicalHealthRecord }>('/health/admin/create', payload, token);
  return data.record;
}
export async function reviewBotanicalHealthRecord(token: string, payload: Record<string, unknown>): Promise<void> {
  await knowledgeCoreCall('/health/admin/review', payload, token);
}
export async function listKnowledgeDocumentSummaries(token: string): Promise<KnowledgeDocumentSummary[]> {
  const data = await knowledgeCoreCall<{ summaries: KnowledgeDocumentSummary[] }>('/knowledge/summaries/list', {}, token);
  return data.summaries || [];
}
export async function createKnowledgeDocumentSummary(token: string, payload: Record<string, unknown>): Promise<KnowledgeDocumentSummary> {
  const data = await knowledgeCoreCall<{ summary: KnowledgeDocumentSummary }>('/knowledge/summaries/create', payload, token);
  return data.summary;
}
export async function reviewKnowledgeDocumentSummary(token: string, summaryId: string, decision: 'approve' | 'reject', reviewNote = ''): Promise<void> {
  await knowledgeCoreCall('/knowledge/summaries/review', { summary_id: summaryId, decision, review_note: reviewNote }, token);
}
export async function searchVerdeKnowledge(token: string | undefined, query: string, includePrivate = false): Promise<VerdeKnowledgeSearchResult> {
  return knowledgeCoreCall('/knowledge/search', { query, include_private: includePrivate }, token);
}

export const askKnowledge = async (token: string, question: string, opts: { includePrivate: boolean; minSimilarity: number }): Promise<{ answered: boolean; answer: string; sources: KnowledgeSource[] }> => knowledgeCall('ask', { question, include_private: opts.includePrivate, min_similarity: opts.minSimilarity }, token);
