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
  OrderCheckoutResult
} from '../types';

export function compressImage(file: File, maxDimension = 800, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
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

export async function uploadCatalogPhoto(
  productId: string,
  file: File,
  accessToken: string
): Promise<string> {
  if (!productId || !accessToken) throw new Error('A valid product and signed-in admin session are required.');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image must be smaller than 15 MB.');

  const compressedDataUrl = await compressImage(file, 1400, 0.84);
  const imageBlob = await (await fetch(compressedDataUrl)).blob();
  const extension = imageBlob.type === 'image/webp' ? 'webp' : 'jpg';
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const objectPath = `${safeProductId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const storageUrl = `${SUPABASE_URL}/storage/v1/object/product-images/${encodedPath}`;

  const uploadResponse = await fetch(storageUrl, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': imageBlob.type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'false'
    },
    body: imageBlob
  });
  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    const message = uploadPayload.message || uploadPayload.error || uploadPayload.statusCode;
    if (uploadResponse.status === 403 || uploadResponse.status === 401) {
      throw new Error('Supabase rejected this upload. Confirm the admin app_metadata role and run the photo-upload SQL migration.');
    }
    throw new Error(String(message || `Photo upload failed (${uploadResponse.status}).`));
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${encodedPath}`;
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  const patchBody = JSON.stringify({ image_url: publicUrl, updated_at: new Date().toISOString() });
  const filter = encodeURIComponent(`eq.${productId}`);
  let productUpdated = false;
  let lastError = '';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?id=${filter}`, {
      method: 'PATCH', headers, body: patchBody
    });
    const rows = await response.json().catch(() => []);
    productUpdated = response.ok && Array.isArray(rows) && rows.length > 0;
    if (!response.ok) lastError = rows.message || rows.details || 'Could not update the products catalog.';
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Catalog update failed.';
  }

  if (!productUpdated) {
    // Remove the newly uploaded object so failed catalog writes do not leave orphaned files.
    await fetch(storageUrl, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    }).catch(() => undefined);
    throw new Error(lastError || 'The image uploaded, but no matching products catalog record could be updated.');
  }

  // Keep the secondary catalog table in sync when a matching row exists.
  await fetch(`${SUPABASE_URL}/rest/v1/catalog_items?id=${filter}`, {
    method: 'PATCH', headers, body: patchBody
  }).catch((error) => console.warn('Secondary catalog_items image sync skipped:', error));

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

export async function analyzeBotanicalImage(
  mode: 'plant' | 'pest',
  base64Image: string,
  lang: 'en' | 'es',
  token?: string
): Promise<AIAnalysisResult> {
  const payloadBody = JSON.stringify({ mode, image: base64Image, lang });
  const endpoints = ['/api/analyze', AI_WORKER_URL];
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
  const endpoints = ['/api/refine-identification', `${AI_WORKER_URL}/refine`];
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
  try {
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

