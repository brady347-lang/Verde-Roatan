-- Production-shaped fixture for order/payment/inventory integration tests.
-- Column sets, constraints and defaults mirror the live verde-roatan project (inspected read-only 2026-11-09).
-- Supabase-provided pieces (roles, auth schema) are minimal stand-ins.
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Stand-in: the live function checks an admin identity; tests flag it with a custom setting.
CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce(current_setting('test.is_admin', true), '') = 'true' $$;

CREATE TABLE public.suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.nurseries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, name text NOT NULL, description text, phone text, address text, is_active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.delivery_zones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text, fee numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'USD', is_active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.exchange_rate_history (rate_date date NOT NULL, usd_to_hnl numeric NOT NULL, source text NOT NULL DEFAULT 'Banco Central de Honduras', indicator_id integer NOT NULL DEFAULT 97, fetched_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nursery_id uuid REFERENCES public.nurseries(id) ON DELETE SET NULL, created_by uuid,
  name text NOT NULL, category text NOT NULL DEFAULT 'plant', description text,
  price numeric NOT NULL CHECK (price >= 0), currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','HNL')),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0), image_url text, size text,
  is_active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES auth.users(id),
  delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','out_for_delivery','completed','cancelled')),
  customer_name text, customer_phone text, delivery_address text, notes text,
  subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0), delivery_fee numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0), total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','HNL')), created_at timestamptz NOT NULL DEFAULT now(),
  usd_to_hnl_rate numeric, payment_status text NOT NULL DEFAULT 'pending', marketing_consent boolean NOT NULL DEFAULT false,
  checkout_token uuid UNIQUE, updated_at timestamptz DEFAULT now(), preferred_timing text,
  canonical_status text DEFAULT 'order_placed', payment_method text DEFAULT 'cash_on_delivery', delivery_type text DEFAULT 'island_delivery',
  assigned_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, assigned_supplier_name text,
  supplier_cost numeric DEFAULT 0.00, supplier_cost_currency text DEFAULT 'HNL', supplier_paid boolean DEFAULT false,
  delivered_at timestamptz, confirmed_by_customer boolean DEFAULT false);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL, product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0), unit_price numeric NOT NULL CHECK (unit_price >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','HNL')), created_at timestamptz NOT NULL DEFAULT now(),
  nursery_id uuid REFERENCES public.nurseries(id));
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status text, new_status text NOT NULL, "timestamp" timestamptz NOT NULL DEFAULT now(),
  responsible_role text NOT NULL CHECK (responsible_role IN ('customer','admin','supplier','system','dispatcher')),
  responsible_name text NOT NULL, notes text, metadata jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.transaction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('customer_order','customer_payment','supplier_purchase','supplier_payment','deposit','refund','cancellation','discount','order_adjustment','delivery_fee','additional_fee','inventory_change','supplier_price_change','status_change')),
  customer_name text, supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, supplier_name text,
  amount numeric NOT NULL, currency text NOT NULL DEFAULT 'HNL' CHECK (currency IN ('HNL','USD')), exchange_rate numeric, payment_method text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','pending','failed','cancelled','refunded')),
  "timestamp" timestamptz NOT NULL DEFAULT now(), responsible_name text NOT NULL,
  responsible_role text NOT NULL CHECK (responsible_role IN ('customer','admin','supplier','system')), notes text NOT NULL, reference_number text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
