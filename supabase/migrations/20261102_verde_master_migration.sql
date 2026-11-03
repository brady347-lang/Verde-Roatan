-- ====================================================================
-- VERDE PLANT INTELLIGENCE & ROATÁN ECOSYSTEM MASTER MIGRATION
-- Database: Supabase PostgreSQL (pgvector, RLS, Audit Ledger, RAG Engine)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ====================================================================
-- 2. NON-DESTRUCTIVE SCHEMA UPGRADES FOR PRE-EXISTING SUPABASE TABLES
-- (Safely adds missing columns to existing tables without data loss)
-- ====================================================================

-- 2.1 Upgrade existing 'delivery_zones' table if present
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'HNL')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2.2 Upgrade existing 'suppliers' table if present
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY,
  island_location TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS delivery_days INT DEFAULT 1;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2.3 Upgrade existing 'landscapers' table if present
CREATE TABLE IF NOT EXISTS public.landscapers (
  id TEXT PRIMARY KEY,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS areas TEXT;
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS rate TEXT;
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS jobs INT DEFAULT 0;
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS svc TEXT[] DEFAULT '{}';
ALTER TABLE public.landscapers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2.4 Upgrade existing 'products' table if present
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  nursery_id TEXT,
  created_by TEXT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'HNL',
  stock_quantity INT NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'plant';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scientific_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'shrub';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS salt_tolerance INT DEFAULT 2;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sunlight TEXT DEFAULT 'Full sun';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS watering TEXT DEFAULT 'Moderate';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size TEXT DEFAULT '3 Gallon';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_status TEXT DEFAULT 'In stock';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nursery TEXT DEFAULT 'Verde Roatán Nursery';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pet_safety TEXT DEFAULT 'check';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS native_to_bay_islands BOOLEAN DEFAULT FALSE;

-- 2.5 Upgrade existing 'orders' table if present
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HNL',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'placed',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_user_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_zone_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_zone_name TEXT DEFAULT 'West End';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preferred_timing TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS canonical_status TEXT DEFAULT 'order_placed';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash_on_delivery';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'island_delivery';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS exchange_rate_used NUMERIC(8, 4) DEFAULT 24.8500;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_supplier_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_supplier_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_cost NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_cost_currency TEXT DEFAULT 'HNL';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_by_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill order_id and canonical_status for any legacy order rows
UPDATE public.orders 
SET order_id = 'VR-' || UPPER(SUBSTRING(REPLACE(COALESCE(id, gen_random_uuid()::text), '-', ''), 1, 8)) 
WHERE order_id IS NULL;

UPDATE public.orders 
SET canonical_status = 'order_placed' 
WHERE canonical_status IS NULL;

-- 2.6 Registered Suppliers Table (Module 25 & Supplier Portal)
CREATE TABLE IF NOT EXISTS public.registered_suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  delivery_days INT NOT NULL DEFAULT 1,
  contact TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 Commercial Catalog (Plants & Nursery Products)
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL DEFAULT 'plant' CHECK (item_type IN ('plant', 'product')),
  name TEXT NOT NULL,
  scientific_name TEXT,
  category TEXT NOT NULL DEFAULT 'Outdoor',
  kind TEXT NOT NULL DEFAULT 'shrub' CHECK (kind IN ('palm', 'shrub', 'flower', 'grass', 'bottle', 'bag')),
  salt_tolerance INT NOT NULL DEFAULT 2 CHECK (salt_tolerance BETWEEN 1 AND 3),
  sunlight TEXT NOT NULL DEFAULT 'Full sun',
  watering TEXT NOT NULL DEFAULT 'Moderate',
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'HNL' CHECK (currency IN ('HNL', 'USD')),
  size TEXT NOT NULL DEFAULT '3 Gallon',
  stock_status TEXT NOT NULL DEFAULT 'In stock' CHECK (stock_status IN ('In stock', 'Low stock', 'Out of stock')),
  stock_quantity INT NOT NULL DEFAULT 10,
  nursery TEXT NOT NULL DEFAULT 'Verde Roatán Nursery',
  pet_safety TEXT NOT NULL DEFAULT 'check' CHECK (pet_safety IN ('safe', 'check')),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  image_url TEXT,
  native_to_bay_islands BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 3. ORDER MANAGEMENT & LIFECYCLE ECOSYSTEM (MODULE 25)
-- ====================================================================

-- Master Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_zone_id TEXT REFERENCES public.delivery_zones(id) ON DELETE RESTRICT,
  delivery_zone_name TEXT NOT NULL,
  preferred_timing TEXT,
  notes TEXT,
  currency TEXT NOT NULL DEFAULT 'HNL' CHECK (currency IN ('HNL', 'USD')),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'placed',
  canonical_status TEXT NOT NULL DEFAULT 'order_placed' CHECK (
    canonical_status IN (
      'order_placed',
      'payment_pending',
      'payment_confirmed',
      'order_processing',
      'supplier_confirmation_required',
      'supplier_confirmed',
      'preparing_order',
      'ready_for_pickup',
      'out_for_delivery',
      'delivered',
      'completed',
      'cancelled',
      'refund_requested',
      'refunded'
    )
  ),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'confirmed', 'refund_requested', 'refunded', 'failed')
  ),
  payment_method TEXT DEFAULT 'cash_on_delivery' CHECK (
    payment_method IN (
      'cash_on_delivery',
      'card_pos',
      'bank_transfer_ficohsa',
      'bac_credomatic',
      'credit_card',
      'store_credit'
    )
  ),
  delivery_type TEXT NOT NULL DEFAULT 'island_delivery' CHECK (
    delivery_type IN ('island_delivery', 'nursery_pickup')
  ),
  exchange_rate_used NUMERIC(8, 4) NOT NULL DEFAULT 24.8500,
  assigned_supplier_id TEXT REFERENCES public.registered_suppliers(id) ON DELETE SET NULL,
  assigned_supplier_name TEXT,
  supplier_cost NUMERIC(12, 2) DEFAULT 0.00,
  supplier_cost_currency TEXT DEFAULT 'HNL',
  supplier_paid BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  confirmed_by_customer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchased Items Detail
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  catalog_item_id TEXT REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HNL',
  plant_size TEXT,
  image_url TEXT,
  supplier_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order Status History Audit Log (Immutable Event Stream)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responsible_role TEXT NOT NULL CHECK (
    responsible_role IN ('customer', 'admin', 'supplier', 'system', 'dispatcher')
  ),
  responsible_name TEXT NOT NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Order Internal & Customer Messages
CREATE TABLE IF NOT EXISTS public.order_messages (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin', 'supplier')),
  sender_name TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'admin', 'supplier', 'all')),
  supplier_id TEXT REFERENCES public.registered_suppliers(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_internal BOOLEAN NOT NULL DEFAULT FALSE
);

-- Supplier Purchase Requests
CREATE TABLE IF NOT EXISTS public.supplier_purchase_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES public.registered_suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  supplier_location TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK (
    status IN ('pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'rejected', 'fulfilled')
  ),
  estimated_prep_hours INT DEFAULT 24,
  estimated_ready_date TIMESTAMPTZ,
  supplier_notes TEXT,
  total_supplier_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'HNL' CHECK (currency IN ('HNL', 'USD')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 4. FINANCIAL & OPERATIONAL TRANSACTION HISTORY (AUDIT LEDGER)
-- ====================================================================

-- Permanent immutable transaction ledger. Never overwritten.
CREATE TABLE IF NOT EXISTS public.transaction_records (
  id TEXT PRIMARY KEY,
  related_order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'customer_order',
      'customer_payment',
      'supplier_purchase',
      'supplier_payment',
      'deposit',
      'refund',
      'cancellation',
      'discount',
      'order_adjustment',
      'delivery_fee',
      'additional_fee',
      'inventory_change',
      'supplier_price_change',
      'status_change'
    )
  ),
  customer_name TEXT,
  supplier_id TEXT REFERENCES public.registered_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HNL' CHECK (currency IN ('HNL', 'USD')),
  exchange_rate NUMERIC(8, 4) NOT NULL DEFAULT 24.8500,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'pending', 'failed', 'cancelled', 'refunded')
  ),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responsible_name TEXT NOT NULL,
  responsible_role TEXT NOT NULL CHECK (responsible_role IN ('customer', 'admin', 'supplier', 'system')),
  notes TEXT NOT NULL,
  reference_number TEXT
);

-- Central Notification Center
CREATE TABLE IF NOT EXISTS public.notification_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('customer', 'supplier', 'financial', 'operational')),
  event_type TEXT NOT NULL,
  related_order_id TEXT,
  related_transaction_id TEXT,
  entity_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent'))
);

-- ====================================================================
-- 5. BOTANICAL KNOWLEDGE CENTER & RAG ARCHITECTURE
-- ====================================================================

-- Botanical Ingested Documents
CREATE TABLE IF NOT EXISTS public.botanical_documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'xls', 'xlsx', 'txt', 'docx')),
  file_size_bytes BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT NOT NULL,
  processing_stage TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    processing_stage IN (
      'uploaded',
      'validating',
      'extracting_text',
      'parsing_botanical_info',
      'identifying_scientific_names',
      'extracting_botanical_characteristics',
      'extracting_horticultural_recommendations',
      'extracting_references_sources',
      'awaiting_review',
      'approved',
      'indexed_in_rag',
      'available_for_ai_retrieval',
      'failed',
      'reprocessing',
      'cancelled'
    )
  ),
  stage_progress_pct INT NOT NULL DEFAULT 0 CHECK (stage_progress_pct BETWEEN 0 AND 100),
  total_pages INT DEFAULT 1,
  processed_pages INT DEFAULT 0,
  extracted_plants_count INT DEFAULT 0,
  chunks_count INT DEFAULT 0,
  rag_indexed BOOLEAN NOT NULL DEFAULT FALSE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'restricted')),
  error_message TEXT,
  warning_message TEXT,
  is_duplicate_warning BOOLEAN DEFAULT FALSE,
  duplicate_of_id TEXT,
  source_institution TEXT,
  citation_license TEXT,
  extracted_taxa TEXT[] DEFAULT '{}',
  raw_text_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document Chunks for RAG Vector Indexing (pgvector)
CREATE TABLE IF NOT EXISTS public.botanical_document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES public.botanical_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_number INT,
  section_title TEXT,
  content TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    embedding_status IN ('pending', 'generated', 'indexed', 'failed')
  ),
  vector_id TEXT,
  identified_taxa TEXT[] DEFAULT '{}',
  embedding vector(1536), -- Compatible with text-embedding-004 / 1536-dim standard
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canonical Botanical Plant Profiles
CREATE TABLE IF NOT EXISTS public.botanical_profiles (
  id TEXT PRIMARY KEY,
  scientific_name TEXT UNIQUE NOT NULL,
  accepted_name TEXT NOT NULL,
  family TEXT NOT NULL,
  genus TEXT NOT NULL,
  species TEXT NOT NULL,
  taxonomic_status TEXT NOT NULL DEFAULT 'accepted' CHECK (
    taxonomic_status IN ('accepted', 'synonym', 'unresolved', 'provisional')
  ),
  author_citation TEXT,
  synonyms TEXT[] DEFAULT '{}',
  taxonomy JSONB NOT NULL DEFAULT '{}',
  identification JSONB NOT NULL DEFAULT '{}',
  horticulture JSONB NOT NULL DEFAULT '{}',
  regional JSONB NOT NULL DEFAULT '{}',
  health JSONB NOT NULL DEFAULT '{}',
  media JSONB NOT NULL DEFAULT '[]',
  sources JSONB NOT NULL DEFAULT '[]',
  linked_catalog_item_ids TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  verification_level TEXT NOT NULL DEFAULT 'verified_database' CHECK (
    verification_level IN ('verified_database', 'external_reference', 'ai_interpretation', 'provisional')
  ),
  internal_admin_notes TEXT,
  audit_version INT NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Extracted Botanical Entities Review Queue
CREATE TABLE IF NOT EXISTS public.extracted_botanical_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES public.botanical_documents(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('taxonomy', 'identification', 'horticulture', 'regional', 'health', 'source')
  ),
  extracted_value JSONB NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'modified')
  ),
  edited_value JSONB,
  source_page INT,
  source_snippet TEXT,
  conflict_with_existing JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 6. PERFORMANCE INDEXES
-- ====================================================================

-- Orders & Operations
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_canonical_status ON public.orders(canonical_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_supplier ON public.orders(assigned_supplier_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transaction_records(related_order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transaction_records(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transaction_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notification_events(is_read, timestamp DESC);

-- Botanical Knowledge & RAG
CREATE INDEX IF NOT EXISTS idx_botanical_profiles_family ON public.botanical_profiles(family);
CREATE INDEX IF NOT EXISTS idx_botanical_profiles_visibility ON public.botanical_profiles(visibility);
CREATE INDEX IF NOT EXISTS idx_botanical_profiles_sci_trgm ON public.botanical_profiles USING gin (scientific_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_botanical_chunks_doc_id ON public.botanical_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_botanical_chunks_content_trgm ON public.botanical_document_chunks USING gin (content gin_trgm_ops);

-- Vector Index (Cosine Distance for RAG Semantic Search)
CREATE INDEX IF NOT EXISTS idx_botanical_chunks_vector ON public.botanical_document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ====================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_botanical_entities ENABLE ROW LEVEL SECURITY;

-- 7.1 Public Read for Catalogs and Approved Botanical Profiles
DROP POLICY IF EXISTS "Public can view active delivery zones" ON public.delivery_zones;
CREATE POLICY "Public can view active delivery zones" ON public.delivery_zones
FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public can view catalog items" ON public.catalog_items;
CREATE POLICY "Public can view catalog items" ON public.catalog_items
FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public can view public verified botanical profiles" ON public.botanical_profiles;
CREATE POLICY "Public can view public verified botanical profiles" ON public.botanical_profiles
FOR SELECT USING (visibility = 'public');

DROP POLICY IF EXISTS "Public can view chunks of public documents" ON public.botanical_document_chunks;
CREATE POLICY "Public can view chunks of public documents" ON public.botanical_document_chunks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.botanical_documents d 
    WHERE d.id = botanical_document_chunks.document_id AND d.visibility = 'public'
  )
);

-- 7.2 Customer Access: Only Own Orders
DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
CREATE POLICY "Customers view own orders" ON public.orders
FOR SELECT USING (
  auth.uid() = customer_user_id 
  OR auth.jwt() ->> 'email' IN (SELECT email FROM auth.users WHERE id = customer_user_id)
);

DROP POLICY IF EXISTS "Customers insert own orders" ON public.orders;
CREATE POLICY "Customers insert own orders" ON public.orders
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL OR customer_user_id IS NULL
);

DROP POLICY IF EXISTS "Customers view own order items" ON public.order_items;
CREATE POLICY "Customers view own order items" ON public.order_items
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.customer_user_id = auth.uid() OR auth.uid() IS NULL))
);

-- 7.3 Financial Audit Records: Append-Only (NO UPDATE / NO DELETE for non-admins)
DROP POLICY IF EXISTS "Transactions are append only" ON public.transaction_records;
CREATE POLICY "Transactions are append only" ON public.transaction_records
FOR INSERT WITH CHECK (TRUE);

-- 7.4 Service Role & Admin Full Access Bypass
DROP POLICY IF EXISTS "Service role full access on all tables" ON public.orders;
CREATE POLICY "Service role full access on all tables" ON public.orders
FOR ALL USING (auth.role() = 'service_role' OR auth.jwt() ->> 'email' ILIKE '%@verde.hn' OR auth.jwt() ->> 'email' ILIKE '%brady%');

DROP POLICY IF EXISTS "Service role full access on transactions" ON public.transaction_records;
CREATE POLICY "Service role full access on transactions" ON public.transaction_records
FOR ALL USING (auth.role() = 'service_role' OR auth.jwt() ->> 'email' ILIKE '%@verde.hn' OR auth.jwt() ->> 'email' ILIKE '%brady%');

DROP POLICY IF EXISTS "Service role full access on botanical_profiles" ON public.botanical_profiles;
CREATE POLICY "Service role full access on botanical_profiles" ON public.botanical_profiles
FOR ALL USING (auth.role() = 'service_role' OR auth.jwt() ->> 'email' ILIKE '%@verde.hn' OR auth.jwt() ->> 'email' ILIKE '%brady%');

DROP POLICY IF EXISTS "Service role full access on botanical_documents" ON public.botanical_documents;
CREATE POLICY "Service role full access on botanical_documents" ON public.botanical_documents
FOR ALL USING (auth.role() = 'service_role' OR auth.jwt() ->> 'email' ILIKE '%@verde.hn' OR auth.jwt() ->> 'email' ILIKE '%brady%');

-- ====================================================================
-- 8. STORED PROCEDURES & RPC FUNCTIONS
-- ====================================================================

-- 8.1 Vector Similarity Match for RAG Retrieval
CREATE OR REPLACE FUNCTION public.match_botanical_chunks (
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id TEXT,
  document_id TEXT,
  content TEXT,
  page_number INT,
  section_title TEXT,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    chunks.id,
    chunks.document_id,
    chunks.content,
    chunks.page_number,
    chunks.section_title,
    1 - (chunks.embedding <=> query_embedding) AS similarity
  FROM public.botanical_document_chunks AS chunks
  JOIN public.botanical_documents AS docs ON docs.id = chunks.document_id
  WHERE docs.visibility = 'public' 
    AND 1 - (chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- 8.2 Atomic Order Status Advancement with Audit Logging
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id TEXT,
  p_next_status TEXT,
  p_responsible_role TEXT,
  p_responsible_name TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_history_id TEXT;
  v_order_record public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order_record FROM public.orders WHERE id = p_order_id OR order_id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_current_status := v_order_record.canonical_status;
  v_history_id := 'sh-' || extract(epoch from now())::bigint || '-' || floor(random()*900 + 100)::int;

  -- 1. Insert history entry
  INSERT INTO public.order_status_history (
    id, order_id, previous_status, new_status, timestamp, responsible_role, responsible_name, notes
  ) VALUES (
    v_history_id, v_order_record.id, v_current_status, p_next_status, NOW(), p_responsible_role, p_responsible_name, p_notes
  );

  -- 2. Update order
  UPDATE public.orders
  SET canonical_status = p_next_status,
      updated_at = NOW(),
      payment_status = CASE WHEN p_next_status = 'payment_confirmed' THEN 'confirmed' ELSE payment_status END,
      delivered_at = CASE WHEN p_next_status = 'delivered' THEN NOW() ELSE delivered_at END
  WHERE id = v_order_record.id;

  -- 3. Insert transaction record for financial state changes
  IF p_next_status IN ('payment_confirmed', 'delivered', 'cancelled', 'refunded') THEN
    INSERT INTO public.transaction_records (
      id, related_order_id, transaction_type, customer_name, supplier_name,
      amount, currency, exchange_rate, status, timestamp, responsible_name, responsible_role, notes, reference_number
    ) VALUES (
      'txn-' || extract(epoch from now())::bigint || '-' || floor(random()*900 + 100)::int,
      v_order_record.id,
      CASE 
        WHEN p_next_status = 'payment_confirmed' THEN 'customer_payment'
        WHEN p_next_status = 'delivered' THEN 'delivery_fee'
        WHEN p_next_status = 'cancelled' THEN 'cancellation'
        WHEN p_next_status = 'refunded' THEN 'refund'
        ELSE 'status_change'
      END,
      v_order_record.customer_name,
      v_order_record.assigned_supplier_name,
      v_order_record.total,
      v_order_record.currency,
      v_order_record.exchange_rate_used,
      'completed',
      NOW(),
      p_responsible_name,
      p_responsible_role,
      COALESCE(p_notes, 'Status changed to ' || p_next_status),
      v_order_record.order_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_record.order_id,
    'previous_status', v_current_status,
    'new_status', p_next_status
  );
END;
$$;

-- ====================================================================
-- 9. INITIAL DATA SEEDING (IDEMPOTENT UPSERTS)
-- ====================================================================

-- 9.1 Seed Delivery Zones (Roatan Island Zones)
INSERT INTO public.delivery_zones (id, name, description, fee, currency, is_active) VALUES
  ('z-we', 'West End', 'Village, Half Moon Bay & Point', 5.00, 'USD', TRUE),
  ('z-wb', 'West Bay', 'Beachfront, Lighthouse & Tamarind Drive', 7.00, 'USD', TRUE),
  ('z-sb', 'Sandy Bay', 'Main Road, Anthony''s Key & Lawson Rock', 6.00, 'USD', TRUE),
  ('z-ch', 'Coxen Hole / Airport', 'Port, Airport & Downtown', 10.00, 'USD', TRUE),
  ('z-fh', 'French Harbour', 'Brick Bay, French Cay & Mega Plaza', 12.00, 'USD', TRUE),
  ('z-pb', 'Pristine Bay', 'Golf Resort & Coral Views', 15.00, 'USD', TRUE),
  ('z-or', 'Oak Ridge', 'East End, Pandy Town & Cayo Venado', 20.00, 'USD', TRUE),
  ('z-pg', 'Punta Gorda', 'Garifuna Cultural Heritage & North Shore', 25.00, 'USD', TRUE)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  fee = EXCLUDED.fee,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active;

-- 9.2 Seed Registered Suppliers & Sync to Legacy Suppliers
INSERT INTO public.registered_suppliers (id, name, location, delivery_days, contact, active) VALUES
  ('sup-sb-main', 'Verde Roatán Nursery', 'Sandy Bay (Main Beds)', 1, '+504 9988-7711', TRUE),
  ('sup-fh-depot', 'Verde Roatán Nursery', 'French Harbour Staging Depot', 1, '+504 9988-7722', TRUE),
  ('sup-maya-palm', 'Maya Palm & Flora Growers', 'Oak Ridge East', 2, '+504 9876-5432', TRUE),
  ('sup-bay-botanical', 'Bay Islands Botanical Nursery', 'Coxen Hole Valley', 1, '+504 9765-4321', TRUE),
  ('sup-coral-ridge', 'Coral Ridge Farm & Sod Supply', 'West Bay Lighthouse Road', 2, '+504 9654-3210', TRUE),
  ('sup-eco-organics', 'Island Eco-Organics & Coir Works', 'Sandy Bay Hillside', 2, '+504 9543-2109', TRUE)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  location = EXCLUDED.location,
  delivery_days = EXCLUDED.delivery_days,
  active = EXCLUDED.active;

-- Mirror to legacy 'suppliers' table for backward compatibility
INSERT INTO public.suppliers (id, name, location, delivery_days, active, is_active)
SELECT id, name, location, delivery_days, active, active FROM public.registered_suppliers
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  location = EXCLUDED.location,
  active = EXCLUDED.active,
  is_active = EXCLUDED.is_active;

-- 9.3 Seed Verified Roatan Landscapers
INSERT INTO public.landscapers (id, name, areas, rate, jobs, reply, svc, is_active) VALUES
  ('l1', 'Green Cay Landscapes', 'West End to Sandy Bay', '4.9', 31, 'Replies in about an hour', ARRAY['Design', 'Planting', 'Maintenance'], TRUE),
  ('l2', 'Island Palm Care', 'Whole island', '4.8', 52, 'Replies same day', ARRAY['Pest treatment', 'Maintenance'], TRUE),
  ('l3', 'Coral Ridge Gardens', 'West Bay, Sandy Bay', '4.7', 18, 'Replies in about 2 hours', ARRAY['Irrigation', 'Planting', 'Design'], TRUE),
  ('l4', 'Bay Islands Yard Crew', 'French Harbour, Oak Ridge, Punta Gorda', '4.6', 40, 'Replies next morning', ARRAY['Maintenance', 'Pest treatment'], TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  areas = EXCLUDED.areas,
  rate = EXCLUDED.rate,
  jobs = EXCLUDED.jobs,
  reply = EXCLUDED.reply,
  svc = EXCLUDED.svc,
  is_active = EXCLUDED.is_active;

-- 9.4 Seed Commercial Catalog & Mirror to Products Table
INSERT INTO public.catalog_items (
  id, item_type, name, scientific_name, kind, salt_tolerance, sunlight, watering,
  price, currency, size, stock_status, stock_quantity, nursery, pet_safety, tags, notes, category, image_url, native_to_bay_islands
) VALUES
  (
    'p-areca', 'plant', 'Areca Palm', 'Dypsis lutescens', 'palm', 2, 'Bright indirect / Filtered light',
    'Moderate · Allow top 2" to dry', 380.00, 'HNL', '7 Gallon · 4-5 ft', 'In stock', 14,
    'Verde Roatán Nursery (Sandy Bay)', 'safe', ARRAY['palm', 'indoor', 'patio', 'air-purifier'],
    'Thrives in filtered island light. Feathery golden-green fronds create an instant tropical oasis.', 'Palms',
    'https://images.unsplash.com/photo-1596724803714-d8463e264663?w=800&auto=format&fit=crop&q=80', FALSE
  ),
  (
    'p-coco', 'plant', 'Dwarf Malayan Coconut Palm', 'Cocos nucifera var. nana', 'palm', 3, 'Full equatorial sun',
    'High when young · Highly drought resistant once rooted', 650.00, 'HNL', '15 Gallon · 5 ft Stems', 'In stock', 8,
    'Verde Roatán Nursery (Sandy Bay)', 'safe', ARRAY['palm', 'native', 'beachfront', 'edible'],
    'High salt tolerance, resistant to lethal yellowing. The quintessential Caribbean coastline palm.', 'Palms',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80', TRUE
  ),
  (
    'p-silver-button', 'plant', 'Silver Buttonwood', 'Conocarpus erectus var. sericeus', 'shrub', 3, 'Full coastal sun',
    'Low · Extreme drought & salt tolerance', 320.00, 'HNL', '5 Gallon · 3 ft Bush', 'In stock', 12,
    'Verde Roatán Nursery (Sandy Bay)', 'safe', ARRAY['shrub', 'native', 'silver-foliage', 'windbreak'],
    'Native Bay Islands coastal superstar with velvety silver-blue foliage. Supreme frontline ocean windbreak.', 'Shrubs',
    'https://images.unsplash.com/photo-1545241047-6083a3684587?w=800&auto=format&fit=crop&q=80', TRUE
  ),
  (
    'p-croton', 'plant', 'Petra Croton', 'Codiaeum variegatum', 'shrub', 1, 'Bright indirect / Morning sun',
    'Keep consistently moist', 195.00, 'HNL', '2 Gallon', 'Low stock', 4,
    'Verde Roatán Nursery (Sandy Bay)', 'check', ARRAY['shrub', 'colorful', 'foliage', 'patio'],
    'Fiery kaleidoscope leaves of crimson, gold, and emerald. Protect from salty offshore winds.', 'Shrubs',
    'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=800&auto=format&fit=crop&q=80', FALSE
  ),
  (
    'p-ginger', 'plant', 'Red Plume Ginger', 'Alpinia purpurata', 'flower', 1, 'Part shade / Filtered canopy',
    'High · Loves tropical moisture', 290.00, 'HNL', '3 Gallon', 'In stock', 8,
    'Verde Roatán Nursery (Sandy Bay)', 'safe', ARRAY['flower', 'tropical', 'cut-flower', 'shade'],
    'Magnificent long-lasting red plumes. Thrives in Roatan jungle ravines and shaded courtyard gardens.', 'Flowers',
    'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&auto=format&fit=crop&q=80', FALSE
  ),
  (
    'p-zoysia', 'plant', 'Empire Zoysia Sod (Per Sq Yd)', 'Zoysia japonica', 'grass', 2, 'Full sun to partial shade',
    'Moderate once rooted', 140.00, 'HNL', '1 Sq Yd Pallet Slab', 'In stock', 45,
    'Verde Roatán Nursery (Sandy Bay)', 'safe', ARRAY['grass', 'turf', 'chinch-resistant', 'lawn'],
    'Dense carpet lawn turf with superior weed resistance. Soft barefoot texture and salt spray tolerance.', 'Grass & Groundcover',
    'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=800&auto=format&fit=crop&q=80', FALSE
  ),
  (
    'prod-ferti-palm', 'product', 'Island Palm & Tropical Specimen Fertilizer', '8-2-12 + 4Mg Controlled Release Micro-nutrients', 'bag', 3, 'N/A',
    'Slow dissolve', 490.00, 'HNL', '10 lb Bucket', 'In stock', 16,
    'Verde Roatán Nursery (Sandy Bay)', 'check', ARRAY['fertilizer', 'palms', 'nutrients', 'iron'],
    'Engineered specifically for sandy and coralline limestone soils. High magnesium and manganese prevent yellowing fronds.', 'Fertilizer',
    'https://images.unsplash.com/photo-1628352081506-83c43123ed6d?w=800&auto=format&fit=crop&q=80', FALSE
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  scientific_name = EXCLUDED.scientific_name,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  stock_quantity = EXCLUDED.stock_quantity,
  is_active = EXCLUDED.is_active;

-- Mirror to legacy 'products' table
INSERT INTO public.products (
  id, name, category, description, price, currency, stock_quantity, image_url, is_active
)
SELECT id, name, category, notes, price, currency, stock_quantity, image_url, is_active
FROM public.catalog_items
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  stock_quantity = EXCLUDED.stock_quantity,
  is_active = EXCLUDED.is_active;

-- 9.5 Seed Canonical Botanical Profiles
INSERT INTO public.botanical_profiles (
  id, scientific_name, accepted_name, family, genus, species, author_citation,
  taxonomic_status, synonyms, visibility, is_verified, verification_level, created_by
) VALUES
  ('bp-cocos-nucifera', 'Cocos nucifera L.', 'Cocos nucifera L.', 'Arecaceae', 'Cocos', 'nucifera', 'L., Sp. Pl. 2: 1188 (1753)', 'accepted', ARRAY['Cocos indica Royle', 'Calappa nucifera (L.) Kuntze'], 'public', TRUE, 'verified_database', 'Verde Lead Taxonomist'),
  ('bp-monstera-deliciosa', 'Monstera deliciosa Liebm.', 'Monstera deliciosa Liebm.', 'Araceae', 'Monstera', 'deliciosa', 'Liebm. (1849)', 'accepted', ARRAY['Philodendron pertusum Carrière', 'Tornelia fragrans Gut.'], 'public', TRUE, 'verified_database', 'Verde Lead Taxonomist'),
  ('bp-swietenia-mahagoni', 'Swietenia mahagoni (L.) Jacq.', 'Swietenia mahagoni (L.) Jacq.', 'Meliaceae', 'Swietenia', 'mahagoni', 'Jacq. (1760)', 'accepted', ARRAY['Cedrus mahogani Mill.'], 'public', TRUE, 'verified_database', 'Verde Lead Taxonomist'),
  ('bp-rhizophora-mangle', 'Rhizophora mangle L.', 'Rhizophora mangle L.', 'Rhizophoraceae', 'Rhizophora', 'mangle', 'L. (1753)', 'accepted', ARRAY['Rhizophora americana J.F.Gmel.'], 'public', TRUE, 'verified_database', 'Verde Lead Taxonomist'),
  ('bp-heliconia-psittacorum', 'Heliconia psittacorum L.f.', 'Heliconia psittacorum L.f.', 'Heliconiaceae', 'Heliconia', 'psittacorum', 'L.f. (1782)', 'accepted', ARRAY['Bihai psittacorum Kuntze'], 'public', TRUE, 'verified_database', 'Verde Lead Taxonomist')
ON CONFLICT (scientific_name) DO NOTHING;

-- 9.6 Seed Ingestion Reference Document
INSERT INTO public.botanical_documents (
  id, filename, original_name, file_type, file_size_bytes, processing_stage,
  stage_progress_pct, total_pages, chunks_count, rag_indexed, visibility, uploaded_by
) VALUES (
  'doc-bay-islands-flora-2025',
  'Flora_of_the_Bay_Islands_Coastal_Ecosystems_2025.pdf',
  'Flora of the Bay Islands: Coastal & Mangrove Ecosystems.pdf',
  'pdf',
  14850200,
  'available_for_ai_retrieval',
  100,
  148,
  312,
  TRUE,
  'public',
  'dr_elena_botanist@verde.hn'
)
ON CONFLICT (id) DO NOTHING;

