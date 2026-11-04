import {
  AI_WORKER_URL,
  API_URL,
  CURRENCY_WORKER_URL,
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
  IdentificationReviewRecord
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

function catalogBody(item: CatalogItem) {
  return { name: item.name, category: item.category || 'Outdoor', description: item.note || item.sci || '', price: Number(item.price), currency: item.currency || 'HNL', stock_quantity: Math.max(0, Number(item.stock_quantity) || 0), is_active: true };
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

/** Explain a failed catalog write. RLS blocks return 200 with zero rows, which is easy to mistake for success. */
function catalogWriteError(response: Response, rows: any, action: string): Error {
  if (response.status === 401 || response.status === 403) {
    return new Error('Your administrator session was rejected. Sign out, sign back in as the administrator, then try again.');
  }
  if (response.ok && Array.isArray(rows) && rows.length === 0) {
    return new Error('Supabase did not ' + action + ' this record: the database blocked the change (administrator permission) or the record no longer exists. Sign out and back in as the administrator, then try again.');
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
  if (!response.ok || !Array.isArray(rows) || rows.length !== 1) throw catalogWriteError(response, rows, 'save');
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
    if (!patch.ok || !Array.isArray(patched) || patched.length !== 1) throw new CatalogSaveError('Your changes were saved and the photo uploaded, but its link could not be stored on the record. ' + catalogWriteError(patch, patched, 'update').message, { ...saved, image_url: String(row.image_url || '') });
    saved = { ...saved, image_url: imageUrl };
  }
  return saved;
}

export async function deleteCatalogItem(id: string, token: string): Promise<void> {
  const response = await fetch(SUPABASE_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: catalogHeaders(token), cache: 'no-store' });
  if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.message || d.details || 'Supabase rejected catalog deletion (' + response.status + ').'); }
}

export async function updateCatalogStock(id: string, quantity: number, token: string): Promise<number> {
  const response = await fetch(SUPABASE_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: catalogHeaders(token), body: JSON.stringify({ stock_quantity: Math.max(0, Math.floor(quantity)) }), cache: 'no-store' });
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
  const patch = await fetch(SUPABASE_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(productId), { method: 'PATCH', headers: catalogHeaders(token), body: JSON.stringify({ image_url: publicUrl }), cache: 'no-store' });
  const rows = await patch.json().catch(() => []);
  if (!patch.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error('Photo uploaded but its link was not saved: ' + catalogWriteError(patch, rows, 'update').message);
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
          sci: String(p.description || ''),
          kind,
          salt: 2,
          sun: 'Full to partial sun',
          water: 'Standard tropical schedule',
          price: Number(p.price) || 250,
          currency: String(p.currency || 'HNL') as 'HNL' | 'USD',
          size: 'Nursery pot',
          stock: qty > 0 ? (qty <= 5 ? 'Low stock' : 'In stock') : 'Out of stock',
          stock_quantity: qty,
          nursery: 'Verde Roatán Nursery',
          pet: 'check',
          tags: [category.toLowerCase(), kind],
          note: String(p.description || 'Tropical island specimen acclimatized to Roatan.'),
          category,
          image_url: p.image_url || ''
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
    const timeoutId = setTimeout(() => controller.abort(), endpoint === '/api/analyze' ? 12000 : 20000);
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
    const timeoutId = setTimeout(() => controller.abort(), 18000);
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
  decision: 'confirmed' | 'corrected',
  correctedCommonName: string,
  correctedScientificName: string,
  accessToken: string
): Promise<{ review_id: string; review_status: string; message: string }> {
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
      }
    },
    decision,
    corrected_common_name: correctedCommonName.trim(),
    corrected_scientific_name: correctedScientificName.trim()
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
  adminNotes = ''
): Promise<void> {
  await callIdentificationReviewAdmin('admin/review', {
    review_id: reviewId,
    status,
    admin_notes: adminNotes
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
      exchange_rate_used: Number(row.exchange_rate_used || 26),
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

  // Local fallback heuristic if both server routes are unavailable
  const catalog = params.catalogItems.length > 0 ? params.catalogItems : INITIAL_CATALOG;
  const isEs = params.lang === 'es';
  const query = `${params.conditions} ${params.goals}`.toLowerCase();

  const scored = catalog
    .filter((c) => c.stock !== 'Out of stock')
    .map((item) => {
      let score = 70;
      const text = `${item.name} ${item.category} ${item.note} ${(item.tags || []).join(' ')}`.toLowerCase();
      if (query.includes('sun') || query.includes('sol')) {
        if (text.includes('sun') || text.includes('sol') || text.includes('full') || text.includes('palm')) score += 15;
      }
      if (query.includes('shade') || query.includes('sombra')) {
        if (text.includes('shade') || text.includes('sombra') || text.includes('monstera') || text.includes('indoor')) score += 20;
      }
      if (query.includes('salt') || query.includes('coastal') || query.includes('playa') || query.includes('mar')) {
        if (text.includes('salt') || text.includes('coastal') || text.includes('coconut') || text.includes('palm')) score += 20;
      }
      if (query.includes('flower') || query.includes('flor') || query.includes('color')) {
        if (text.includes('bloom') || text.includes('flower') || text.includes('hibiscus') || text.includes('ixora') || text.includes('bougainvillea')) score += 18;
      }
      if (query.includes('soil') || query.includes('tierra') || query.includes('fertilizer') || query.includes('abono')) {
        if (item.category === 'Soils & Substrates' || item.category === 'Nutrients & Care') score += 15;
      }
      return { item, score: Math.min(score, 98) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    status: 'success',
    summary: isEs
      ? 'Basado en las condiciones del microclima de Roatán, hemos seleccionado plantas y sustratos adaptados a suelos arenosos, brisa marina y sol tropical.'
      : 'Based on your Roatán microclimate conditions, we selected hardy tropical specimens and soil amendments tailored to island salinity, moisture, and sun exposure.',
    conditions_assessment: {
      sun_and_microclimate: isEs ? 'Exposición adecuada con resistencia a radiación UV costera.' : 'Balanced sun exposure with coastal UV resistance.',
      soil_and_drainage: isEs ? 'Requiere sustrato aireado con buen drenaje de arena o gravilla de coral.' : 'Requires high-aeration substrate with rapid coral gravel drainage.',
      wind_and_salt_tolerance: isEs ? 'Variedades con cutícula cerosa o tolerancia al viento alisio del mar Caribe.' : 'Foliage with wax cuticle or trade wind salt spray tolerance.'
    },
    island_pro_tips: [
      isEs
        ? 'En Roatán, mezcle tierra negra de cerro con bonote de coco o gravilla de río para evitar la compactación por lluvias torrenciales.'
        : 'In Roatán, blend rich volcanic highland soil with coconut coir or river pea gravel to prevent compaction during heavy tropical downpours.',
      isEs
        ? 'Riegue temprano en la mañana para evitar hongos foliares causados por la humedad nocturna de la isla.'
        : 'Water early in the morning to allow foliage to dry before dusk, curbing nocturnal island fungal growth.'
    ],
    recommendations: scored.map(({ item, score }) => ({
      product_id: item.id,
      product_name: item.name,
      match_score: score,
      why_it_fits: isEs
        ? `Excelente tolerancia para las condiciones descritas (${item.category}). Prospera con vigor en las islas de la Bahía.`
        : `Outstanding resilience for these specific conditions (${item.category}). Proven vigor across the Bay Islands.`,
      care_and_placement_tip: isEs
        ? 'Ubicar con drenaje adecuado y abonar cada 4 meses al inicio de temporadas de lluvia.'
        : 'Ensure free-draining roots and topdress organic fertilizer at the onset of island rainy seasons.',
      catalog_item: item
    }))
  };
}

