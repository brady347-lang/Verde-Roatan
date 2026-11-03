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

export interface CatalogItem {
  id: string;
  t: ItemType;
  name: string;
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
  photo: string | null;
  data: AIAnalysisResult;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
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
  total?: number;
  currency?: string;
  status?: string;
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
}
