import {
  ActiveOrder,
  CanonicalOrderStatus,
  NotificationEvent,
  OrderMessage,
  OrderStatusHistoryEntry,
  RegisteredSupplier,
  SupplierPurchaseRequest,
  TransactionRecord,
  TransactionType
} from '../types';

export const ORDER_LIFECYCLE_STATUS_LABELS: Record<CanonicalOrderStatus, { en: string; es: string; step: number; color: string }> = {
  order_placed: { en: 'Order Placed', es: 'Pedido Realizado', step: 1, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
  payment_pending: { en: 'Payment Pending', es: 'Pago Pendiente', step: 2, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  payment_confirmed: { en: 'Payment Confirmed', es: 'Pago Confirmado', step: 3, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
  order_processing: { en: 'Order Processing', es: 'En Procesamiento', step: 4, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30' },
  supplier_confirmation_required: { en: 'Supplier Confirmation Required', es: 'Confirmación de Proveedor Requerida', step: 5, color: 'text-purple-500 bg-purple-500/10 border-purple-500/30' },
  supplier_confirmed: { en: 'Supplier Confirmed', es: 'Proveedor Confirmado', step: 6, color: 'text-teal-500 bg-teal-500/10 border-teal-500/30' },
  preparing_order: { en: 'Preparing Order', es: 'Preparando Plantas', step: 7, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30' },
  ready_for_pickup: { en: 'Ready for Pickup', es: 'Listo para Recolección', step: 8, color: 'text-lime-500 bg-lime-500/10 border-lime-500/30' },
  out_for_delivery: { en: 'Out for Delivery', es: 'En Camino a Entrega', step: 9, color: 'text-amber-600 bg-amber-600/10 border-amber-600/30' },
  delivered: { en: 'Delivered', es: 'Entregado en Sitio', step: 10, color: 'text-emerald-600 bg-emerald-600/10 border-emerald-600/30' },
  completed: { en: 'Completed', es: 'Completado', step: 11, color: 'text-emerald-700 bg-emerald-700/10 border-emerald-700/30' },
  cancelled: { en: 'Cancelled', es: 'Cancelado', step: 12, color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  refund_requested: { en: 'Refund Requested', es: 'Reembolso Solicitado', step: 13, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
  refunded: { en: 'Refunded', es: 'Reembolsado', step: 14, color: 'text-red-600 bg-red-600/10 border-red-600/30' }
};

export const INITIAL_ORDERS: ActiveOrder[] = [
  {
    id: 'ord-1001',
    order_id: 'ROA-892401',
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    items: [
      { id: 'p-1', name: 'Areca Palm (Dypsis lutescens)', price: 350, currency: 'HNL', qty: 4, size: '5 Gallon · 4-5 ft', image_url: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600&auto=format&fit=crop&q=80', supplier_name: 'Verde Roatán Nursery (Sandy Bay)' },
      { id: 'prod-1', name: 'Roatán Organic Potting Soil Blend', price: 280, currency: 'HNL', qty: 2, size: '40 Liter Bag', image_url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&auto=format&fit=crop&q=80', supplier_name: 'Verde Roatán Nursery (Sandy Bay)' }
    ],
    customer_name: 'Capt. Mateo Cardona',
    phone: '+504 9845-2219',
    address: 'Lot 14, Sunset Villas, West End',
    zone_id: 'z-we',
    zone_name: 'West End / Sunset Villas',
    timing: 'Morning delivery (8am - 12pm)',
    notes: 'Please stage pots near beachfront deck cistern.',
    currency: 'HNL',
    subtotal: 1960,
    delivery_fee: 250,
    total: 2210,
    status: 'en_route',
    canonical_status: 'out_for_delivery',
    payment_status: 'confirmed',
    payment_method: 'card_pos',
    delivery_type: 'island_delivery',
    exchange_rate_used: 24.85,
    assigned_supplier_id: 'sup-1',
    assigned_supplier_name: 'Maya Palm & Flora Growers (French Harbour)',
    supplier_cost: 1100,
    supplier_cost_currency: 'HNL',
    supplier_paid: false,
    status_history: [
      { id: 'sh-1', new_status: 'order_placed', timestamp: new Date(Date.now() - 3600000 * 28).toISOString(), responsible_role: 'customer', responsible_name: 'Capt. Mateo Cardona', notes: 'Order submitted online' },
      { id: 'sh-2', previous_status: 'order_placed', new_status: 'payment_confirmed', timestamp: new Date(Date.now() - 3600000 * 27).toISOString(), responsible_role: 'admin', responsible_name: 'Admin System', notes: 'Credit card payment confirmed via POS voucher' },
      { id: 'sh-3', previous_status: 'payment_confirmed', new_status: 'supplier_confirmed', timestamp: new Date(Date.now() - 3600000 * 18).toISOString(), responsible_role: 'supplier', responsible_name: 'Maya Palm Growers', notes: '4 Areca palms ready in Sandy Bay bed' },
      { id: 'sh-4', previous_status: 'supplier_confirmed', new_status: 'out_for_delivery', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), responsible_role: 'dispatcher', responsible_name: 'Carlos Dispatch', notes: 'Loaded onto flatbed truck #2 heading to West End' }
    ],
    messages: [
      { id: 'msg-1', order_id: 'ROA-892401', sender_role: 'customer', sender_name: 'Capt. Mateo', recipient_role: 'admin', message: 'Good morning, please make sure the soil bags are water-resistant wrapped in case of tropical drizzle.', timestamp: new Date(Date.now() - 3600000 * 25).toISOString() },
      { id: 'msg-2', order_id: 'ROA-892401', sender_role: 'admin', sender_name: 'Verde Dispatcher', recipient_role: 'customer', message: 'Hello Captain Mateo, absolutely! All soil bags are tarped and strapped in the covered transport bay.', timestamp: new Date(Date.now() - 3600000 * 24).toISOString() }
    ]
  },
  {
    id: 'ord-1002',
    order_id: 'ROA-892402',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    items: [
      { id: 'p-3', name: 'Bougainvillea Royal Magenta', price: 290, currency: 'HNL', qty: 6, size: '3 Gallon Bush', image_url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&auto=format&fit=crop&q=80', supplier_name: 'Bay Islands Botanical Nursery' }
    ],
    customer_name: 'Elena Vance-Cooper',
    phone: '+504 9471-0082',
    address: 'Villa Coral Ridge, Sandy Bay',
    zone_id: 'z-sb',
    zone_name: 'Sandy Bay',
    timing: 'Afternoon (1pm - 5pm)',
    notes: 'Gate code 4092, leave near retaining wall.',
    currency: 'HNL',
    subtotal: 1740,
    delivery_fee: 200,
    total: 1940,
    status: 'staged',
    canonical_status: 'supplier_confirmation_required',
    payment_status: 'pending',
    payment_method: 'cash_on_delivery',
    delivery_type: 'island_delivery',
    exchange_rate_used: 24.85,
    assigned_supplier_id: 'sup-2',
    assigned_supplier_name: 'Bay Islands Botanical Nursery (Sandy Bay)',
    supplier_cost: 960,
    supplier_cost_currency: 'HNL',
    supplier_paid: false,
    status_history: [
      { id: 'sh-5', new_status: 'order_placed', timestamp: new Date(Date.now() - 3600000 * 8).toISOString(), responsible_role: 'customer', responsible_name: 'Elena Vance-Cooper', notes: 'Placed via online catalog' },
      { id: 'sh-6', previous_status: 'order_placed', new_status: 'supplier_confirmation_required', timestamp: new Date(Date.now() - 3600000 * 7).toISOString(), responsible_role: 'system', responsible_name: 'Verde Automated Workflow', notes: 'Purchase request dispatched to Bay Islands Botanical Nursery' }
    ],
    messages: [
      { id: 'msg-3', order_id: 'ROA-892402', sender_role: 'admin', sender_name: 'Verde Operations', recipient_role: 'supplier', supplier_id: 'sup-2', message: 'Requesting 6x Bougainvillea Royal Magenta in 3 Gal. Please confirm availability and pickup window.', timestamp: new Date(Date.now() - 3600000 * 7).toISOString() }
    ]
  }
];

export const INITIAL_TRANSACTIONS: TransactionRecord[] = [
  {
    id: 'TXN-90141',
    related_order_id: 'ROA-892401',
    type: 'customer_order',
    customer_name: 'Capt. Mateo Cardona',
    amount: 2210,
    currency: 'HNL',
    exchange_rate: 24.85,
    payment_method: 'card_pos',
    status: 'completed',
    timestamp: new Date(Date.now() - 3600000 * 28).toISOString(),
    responsible_name: 'System Checkout Gateway',
    responsible_role: 'system',
    notes: 'Online checkout: 4 Areca Palms + 2 Potting Soil + Island delivery fee',
    reference_number: 'POS-AUTH-772910'
  },
  {
    id: 'TXN-90142',
    related_order_id: 'ROA-892401',
    type: 'customer_payment',
    customer_name: 'Capt. Mateo Cardona',
    amount: 2210,
    currency: 'HNL',
    exchange_rate: 24.85,
    payment_method: 'card_pos',
    status: 'completed',
    timestamp: new Date(Date.now() - 3600000 * 27).toISOString(),
    responsible_name: 'Ficohsa Merchant POS',
    responsible_role: 'system',
    notes: 'Captured payment confirmation',
    reference_number: 'FIC-BATCH-8902'
  },
  {
    id: 'TXN-90143',
    related_order_id: 'ROA-892401',
    type: 'supplier_purchase',
    customer_name: 'Capt. Mateo Cardona',
    supplier_id: 'sup-1',
    supplier_name: 'Maya Palm & Flora Growers',
    amount: 1100,
    currency: 'HNL',
    exchange_rate: 24.85,
    status: 'pending',
    timestamp: new Date(Date.now() - 3600000 * 26).toISOString(),
    responsible_name: 'Admin Purchasing',
    responsible_role: 'admin',
    notes: 'Purchase order commitment: 4 specimens reserved at wholesale rate',
    reference_number: 'PO-MAY-1049'
  },
  {
    id: 'TXN-90144',
    related_order_id: 'ROA-892402',
    type: 'customer_order',
    customer_name: 'Elena Vance-Cooper',
    amount: 1940,
    currency: 'HNL',
    exchange_rate: 24.85,
    payment_method: 'cash_on_delivery',
    status: 'pending',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    responsible_name: 'System Checkout Gateway',
    responsible_role: 'system',
    notes: 'Order placed: 6 Bougainvillea Magenta + Sandy Bay delivery',
    reference_number: 'COD-PEND-4410'
  }
];

export const INITIAL_SUPPLIER_PURCHASE_REQUESTS: SupplierPurchaseRequest[] = [
  {
    id: 'spr-201',
    order_id: 'ROA-892401',
    supplier_id: 'sup-1',
    supplier_name: 'Maya Palm & Flora Growers',
    supplier_location: 'French Harbour',
    created_at: new Date(Date.now() - 3600000 * 26).toISOString(),
    items: [
      { id: 'spri-1', product_id: 'p-1', name: 'Areca Palm (Dypsis lutescens)', quantity: 4, unit_price: 275, currency: 'HNL', status: 'confirmed', notes: '4 specimens tagged at Bed 3' }
    ],
    status: 'ready_for_pickup',
    estimated_prep_hours: 4,
    supplier_notes: 'Fronds washed and pots bagged for transport.',
    total_supplier_cost: 1100,
    currency: 'HNL',
    payment_status: 'unpaid'
  },
  {
    id: 'spr-202',
    order_id: 'ROA-892402',
    supplier_id: 'sup-2',
    supplier_name: 'Bay Islands Botanical Nursery',
    supplier_location: 'Sandy Bay',
    created_at: new Date(Date.now() - 3600000 * 7).toISOString(),
    items: [
      { id: 'spri-2', product_id: 'p-3', name: 'Bougainvillea Royal Magenta', quantity: 6, unit_price: 160, currency: 'HNL', status: 'pending', notes: 'Awaiting nurseryman confirmation' }
    ],
    status: 'pending_confirmation',
    estimated_prep_hours: 6,
    supplier_notes: 'Checking blooming status in greenhouse.',
    total_supplier_cost: 960,
    currency: 'HNL',
    payment_status: 'unpaid'
  }
];

export const INITIAL_NOTIFICATIONS: NotificationEvent[] = [
  {
    id: 'notif-1',
    category: 'customer',
    event_type: 'new_order',
    related_order_id: 'ROA-892402',
    entity_name: 'Elena Vance-Cooper',
    title: 'New Customer Order Received',
    description: 'Order ROA-892402 for 6x Bougainvillea Royal Magenta in Sandy Bay.',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    is_read: false,
    priority: 'high'
  },
  {
    id: 'notif-2',
    category: 'supplier',
    event_type: 'supplier_confirmed',
    related_order_id: 'ROA-892401',
    entity_name: 'Maya Palm & Flora Growers',
    title: 'Supplier Ready for Pickup',
    description: 'Maya Palm confirmed 4x Areca Palms are ready for flatbed collection.',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    is_read: true,
    priority: 'normal'
  },
  {
    id: 'notif-3',
    category: 'operational',
    event_type: 'out_for_delivery',
    related_order_id: 'ROA-892401',
    entity_name: 'Capt. Mateo Cardona',
    title: 'Delivery En Route',
    description: 'Flatbed truck #2 en route to West End / Sunset Villas.',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    is_read: false,
    priority: 'normal'
  }
];

// Account-scoped local cache. Never read the old global keys: they can contain
// another signed-in person's orders, financial data, supplier requests, or notifications.
const STORAGE_ORDERS_KEY = 'verde_orders_v2';
const STORAGE_TXNS_KEY = 'verde_transactions_v2';
const STORAGE_SUP_REQ_KEY = 'verde_supplier_requests_v2';
const STORAGE_NOTIFS_KEY = 'verde_notifications_v2';

function scopedStorageKey(base: string): string {
  try {
    const session = JSON.parse(localStorage.getItem('verde_auth_session') || 'null');
    const userId = typeof session?.user?.id === 'string' ? session.user.id : '';
    return userId ? base + '_user_' + userId : base + '_guest';
  } catch {
    return base + '_guest';
  }
}

function loadScoped<T>(base: string): T[] {
  try {
    const raw = localStorage.getItem(scopedStorageKey(base));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScoped<T>(base: string, value: T[]): void {
  try {
    localStorage.setItem(scopedStorageKey(base), JSON.stringify(value));
  } catch (err) {
    console.error('Failed to save account-scoped local data', err);
  }
}

export function loadSavedOrders(): ActiveOrder[] { return loadScoped<ActiveOrder>(STORAGE_ORDERS_KEY); }
export function saveOrders(orders: ActiveOrder[]): void { saveScoped(STORAGE_ORDERS_KEY, orders); }

export function loadSavedTransactions(): TransactionRecord[] { return loadScoped<TransactionRecord>(STORAGE_TXNS_KEY); }
export function saveTransactions(txns: TransactionRecord[]): void { saveScoped(STORAGE_TXNS_KEY, txns); }

export function loadSavedSupplierRequests(): SupplierPurchaseRequest[] { return loadScoped<SupplierPurchaseRequest>(STORAGE_SUP_REQ_KEY); }
export function saveSupplierRequests(requests: SupplierPurchaseRequest[]): void { saveScoped(STORAGE_SUP_REQ_KEY, requests); }

export function loadSavedNotifications(): NotificationEvent[] { return loadScoped<NotificationEvent>(STORAGE_NOTIFS_KEY); }
export function saveNotifications(notifs: NotificationEvent[]): void { saveScoped(STORAGE_NOTIFS_KEY, notifs);}

export function createTransactionRecord(params: Omit<TransactionRecord, 'id' | 'timestamp'>): TransactionRecord {
  return {
    id: `TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    ...params
  };
}

export function createNotificationEvent(params: Omit<NotificationEvent, 'id' | 'timestamp' | 'is_read'>): NotificationEvent {
  return {
    id: `notif-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    timestamp: new Date().toISOString(),
    is_read: false,
    ...params
  };
}
