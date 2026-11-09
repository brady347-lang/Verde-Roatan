export type Language = 'en' | 'es';

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  currency: 'USD' | 'HNL';
  description?: string;
}

export type PlantCategory = 'palm' | 'shrub' | 'flower' | 'grass' | 'bottle' | 'bag';
export type ItemType = 'plant' | 'product';
export type StockStatus = 'In stock' | 'Low stock' | 'Out of stock';

/** Explicit, verified selling-unit coverage for landscaping estimates. */
export interface CatalogMaterialSpec {
  /** Usable volume supplied by one package, in liters. */
  package_volume_liters?: number;
  /** Surface area covered by one selling unit, in square meters. */
  coverage_area_m2?: number;
  /** Customer-facing name for one selling unit (e.g. bag, slab, paver). */
  unit_label?: string;
}

export interface CatalogItem {
  id: string;
  t: ItemType;
  name: string;
  /** Optional verified Spanish common name; never machine-invented. */
  name_es?: string;
  /** Scientific (Latin) name. Never translated. Legacy rows keep it in `sci`. */
  scientific_name?: string;
  /** Optional per-language texts. Empty means "fall back to the legacy `note` / `name`". */
  description_en?: string;
  description_es?: string;
  care_instructions_en?: string;
  care_instructions_es?: string;
  alternative_names_en?: string[];
  alternative_names_es?: string[];
  sci: string;
  kind: PlantCategory;
  salt: number; // 1 to 3
  sun: string;
  water: string;
  price: number;
  currency: 'HNL' | 'USD';
  size: string;
  stock: StockStatus;
  stock_quantity: number;
  nursery: string;
  pet: 'safe' | 'check';
  tags: string[];
  note: string;
  category: string;
  image_url?: string;
  native_to_bay_islands?: boolean;
  /** Optional explicit package volume or surface coverage; never infer from display text. */
  material_spec?: CatalogMaterialSpec;
}

export interface CartItem {
  id: string;
  qty: number;
}

export interface Landscaper {
  id: string;
  name: string;
  ini: string;
  areas: string;
  rate: string;
  jobs: number;
  reply: string;
  svc: string[];
}

export interface RegisteredSupplier {
  id: string;
  name: string;
  location: string;
  delivery_days?: number;
  contact?: string;
  active: boolean;
}

export interface PlantCareInfo {
  sunlight_requirement: string;
  watering_frequency_days: number;
  watering_instructions: string;
  soil_requirements: string;
  fertilization_instructions: string;
  pruning_instructions: string;
}

export interface VerifiedBotanicalRecord {
  id?: string;
  common_name: string;
  scientific_name: string;
  plant_family: string;
  alternative_names?: string[];
  botanical_description: string;
  characteristics?: {
    salt_tolerance_rating: number;
    native_to_bay_islands: boolean;
  };
  verified_images?: Array<{
    image_url: string;
    image_type: string;
    description?: string;
    source_name?: string;
    source_url?: string;
    photographer?: string;
    license_name?: string;
    license_url?: string;
  }>;
  care?: PlantCareInfo;
  pest_resilience?: string;
}

export interface NurseryStockItem {
  store_product_id: string;
  plant_size: string;
  nursery_location: string;
  selling_price: number;
  currency: 'HNL' | 'USD';
  available_quantity: number;
}

export interface SupplierSourcingItem {
  supplier_name: string;
  island_location: string;
  estimated_delivery_days: number;
}

export interface AIAnalysisResult {
  status: 'success' | 'error';
  matched?: boolean;
  model_used?: string;
  notice?: string;
  is_refined?: boolean;
  refinement_stage?: 'initial' | 'refining' | 'verified';
  candidates?: Array<{
    common_name: string;
    scientific_name: string;
    confidence_score: number;
    match_photo?: string;
  }>;
  verified_botanical_record?: VerifiedBotanicalRecord;
  commercial_availability?: {
    nursery_stock?: NurseryStockItem[];
    supplier_sourcing?: SupplierSourcingItem[];
  };
  result?: {
    primary_diagnosis?: string;
    scientific_name?: string;
    severity?: string;
    symptoms?: string[];
    likely_cause?: string;
    treatment?: string[];
    prevention?: string[];
    recommended_products?: string[];
  };
  error?: string;
}

export interface GardenRecommendationItem {
  product_id: string;
  product_name: string;
  match_score: number;
  why_it_fits: string;
  care_and_placement_tip?: string;
  catalog_item?: CatalogItem;
}

export interface GardenAdvisorResult {
  status: 'success' | 'error';
  summary: string;
  conditions_assessment?: {
    sun_and_microclimate?: string;
    soil_and_drainage?: string;
    wind_and_salt_tolerance?: string;
  };
  recommendations: GardenRecommendationItem[];
  island_pro_tips?: string[];
  error?: string;
}

export interface GardenItem {
  id: string;
  date: string;
  mode: 'plant' | 'pest';
  name: string;
  /** Legacy: inline base64 photo from older versions. Migrated to IndexedDB on startup. */
  photo: string | null;
  /** Key of the photo stored in IndexedDB (see src/lib/photoStore.ts). */
  photoId?: string | null;
  data: AIAnalysisResult;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  temporary_role?: 'customer' | 'supplier';
  temporary_expires_at?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: AuthUser;
}

export interface OrderCheckoutResult {
  id?: string;
  order_id?: string;
  subtotal?: number;
  delivery_fee?: number;
  total?: number;
  currency?: 'USD' | 'HNL' | string;
  status?: string;
  canonical_status?: string;
  payment_status?: string;
  payment_method?: string;
  usd_to_hnl_rate?: number;
  duplicate?: boolean;
  items?: Array<{
    product_id?: string | null;
    product_name?: string;
    quantity: number;
    unit_price: number;
    currency?: 'USD' | 'HNL' | string;
    size?: string | null;
    image_url?: string | null;
    supplier_name?: string | null;
  }>;
}

export type OrderDeliveryStatus =
  | 'placed'
  | 'staged'
  | 'en_route'
  | 'delivered'
  | 'order_placed'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'order_processing'
  | 'supplier_confirmation_required'
  | 'supplier_confirmed'
  | 'preparing_order'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded';

export type CanonicalOrderStatus =
  | 'order_placed'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'order_processing'
  | 'supplier_confirmation_required'
  | 'supplier_confirmed'
  | 'preparing_order'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded';

export interface OrderStatusHistoryEntry {
  id: string;
  previous_status?: string;
  new_status: CanonicalOrderStatus | string;
  timestamp: string;
  responsible_role: 'customer' | 'admin' | 'supplier' | 'system' | 'dispatcher';
  responsible_name: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface OrderMessage {
  id: string;
  order_id: string;
  sender_role: 'customer' | 'admin' | 'supplier';
  sender_name: string;
  recipient_role: 'customer' | 'admin' | 'supplier' | 'all';
  supplier_id?: string;
  message: string;
  timestamp: string;
  is_internal?: boolean;
}

export interface SupplierPurchaseRequestItem {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  currency: 'HNL' | 'USD';
  status: 'pending' | 'confirmed' | 'unavailable' | 'alternative_proposed';
  notes?: string;
  alternative_name?: string;
  alternative_price?: number;
}

export interface SupplierPurchaseRequest {
  id: string;
  order_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_location: string;
  created_at: string;
  updated_at?: string;
  items: SupplierPurchaseRequestItem[];
  status: 'pending_confirmation' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'rejected' | 'fulfilled';
  estimated_prep_hours?: number;
  estimated_ready_date?: string;
  supplier_notes?: string;
  total_supplier_cost: number;
  currency: 'HNL' | 'USD';
  payment_status: 'unpaid' | 'paid' | 'pending';
}

export type TransactionType =
  | 'customer_order'
  | 'customer_payment'
  | 'supplier_purchase'
  | 'supplier_payment'
  | 'deposit'
  | 'refund'
  | 'cancellation'
  | 'discount'
  | 'order_adjustment'
  | 'delivery_fee'
  | 'additional_fee'
  | 'inventory_change'
  | 'supplier_price_change'
  | 'status_change';

export interface TransactionRecord {
  id: string;
  related_order_id: string;
  type: TransactionType;
  customer_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  amount: number;
  currency: 'HNL' | 'USD';
  exchange_rate: number; // HNL per USD at time of transaction
  payment_method?: 'cash_on_delivery' | 'card_pos' | 'bank_transfer_ficohsa' | 'bac_credomatic' | 'credit_card' | 'store_credit';
  status: 'completed' | 'pending' | 'failed' | 'cancelled' | 'refunded';
  timestamp: string;
  responsible_name: string;
  responsible_role: 'customer' | 'admin' | 'supplier' | 'system';
  notes: string;
  reference_number?: string;
}

export interface NotificationEvent {
  id: string;
  category: 'customer' | 'supplier' | 'financial' | 'operational';
  event_type: string;
  related_order_id?: string;
  related_transaction_id?: string;
  entity_name: string; // Customer or Supplier Name
  title: string;
  description: string;
  timestamp: string;
  is_read: boolean;
  priority?: 'normal' | 'high' | 'urgent';
}

export interface ActiveOrder {
  id: string;
  order_id: string;
  created_at: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    currency: 'HNL' | 'USD';
    qty: number;
    size?: string;
    image_url?: string;
    supplier_name?: string;
  }>;
  customer_name: string;
  phone: string;
  address: string;
  zone_id: string;
  zone_name: string;
  timing: string;
  notes: string;
  currency: 'HNL' | 'USD';
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: OrderDeliveryStatus;
  canonical_status?: CanonicalOrderStatus;
  delivered_at?: string;
  confirmed_by_customer?: boolean;
  payment_status?: 'pending' | 'confirmed' | 'refund_requested' | 'refunded' | 'failed';
  payment_method?: 'cash_on_delivery' | 'card_pos' | 'bank_transfer_ficohsa' | 'bac_credomatic' | 'credit_card';
  delivery_type?: 'island_delivery' | 'nursery_pickup';
  exchange_rate_used?: number;
  assigned_supplier_id?: string;
  assigned_supplier_name?: string;
  supplier_cost?: number;
  supplier_cost_currency?: 'HNL' | 'USD';
  supplier_paid?: boolean;
  status_history?: OrderStatusHistoryEntry[];
  messages?: OrderMessage[];
}



export interface IdentificationReviewRecord {
  id: string;
  submitted_by: string;
  image_path: string;
  image_url?: string | null;
  identification_mode: 'plant' | 'pest';
  ai_common_name?: string | null;
  ai_scientific_name?: string | null;
  ai_confidence?: number | null;
  proposed_common_name?: string | null;
  proposed_scientific_name?: string | null;
  submitter_notes?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  ai_family?: string | null;
  ai_genus?: string | null;
  ai_species?: string | null;
  ai_model?: string | null;
  user_decision?: 'confirmed' | 'almost' | 'not_my_plant' | null;
  source_app?: string | null;
  source_platform?: string | null;
  source_language?: string | null;
  verification_level?: IdentificationVerificationLevel;
  verified_at?: string | null;
  verification_basis?: string | null;
}
export type IdentificationVerificationLevel = 'ai_identified' | 'user_confirmed' | 'scientifically_verified';

// --- Landscaping service requests (kept separate from product orders) ---
export type ServiceRequestStatus =
  | 'new_request'
  | 'pending_review'
  | 'quote_preparation'
  | 'quote_sent'
  | 'awaiting_response'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ServiceRequest {
  id: string;
  request_number: string | null;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_type: string;
  description: string | null;
  location: string | null;
  requested_date: string | null;
  requested_timing: string | null;
  requested_landscaper_ref: string | null;
  requested_landscaper_name: string | null;
  assigned_landscaper_ref: string | null;
  assigned_landscaper_name: string | null;
  budget: number | null;
  currency: 'USD' | 'HNL';
  status: ServiceRequestStatus;
  quote_amount: number | null;
  quote_currency: 'USD' | 'HNL' | null;
  quote_notes: string | null;
  quote_sent_at: string | null;
  customer_response: string | null;
  customer_response_at: string | null;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestEvent {
  id: string;
  request_id: string;
  event_type:
    | 'created'
    | 'status_change'
    | 'assignment'
    | 'quote'
    | 'communication'
    | 'note'
    | 'customer_response'
    | 'cancellation'
    | 'delay';
  from_status: ServiceRequestStatus | null;
  to_status: ServiceRequestStatus | null;
  channel: 'whatsapp' | 'phone' | 'email' | 'in_app' | 'in_person' | 'system' | null;
  direction: 'inbound' | 'outbound' | 'internal' | null;
  message: string | null;
  actor_role: 'customer' | 'admin' | 'landscaper' | 'system';
  actor_name: string | null;
  is_internal: boolean;
  created_at: string;
}
