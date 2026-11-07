-- Verde Roatan MAIN project (tjzqxsyxvfdabfguezmu) ONLY.
-- Security hardening found in the 2026-11-07 audit. Revocations only: no data, tables or policies change.
--
-- 1. customer_plant_availability / customer_supplier_availability are SECURITY DEFINER views on purpose
--    (customers see a safe subset of inventory without any access to the base tables). But Supabase's
--    default privileges also gave anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE on them, and
--    customer_plant_availability is an auto-updatable single-table view, so a signed-out request could
--    have written to plant_inventory through it, bypassing row level security. Make both read-only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.customer_plant_availability, public.customer_supplier_availability
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_plant_availability, public.customer_supplier_availability
  TO anon, authenticated, service_role;

-- 2. advance_order_status already refuses non-admins, but a signed-out visitor should not even reach it.
REVOKE EXECUTE ON FUNCTION public.advance_order_status(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, text, text, text, text) TO authenticated, service_role;

-- 3. Trigger / event-trigger helpers are never meant to be called over the REST API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- NOT changed on purpose: public.is_app_admin() stays callable by anon, because the public-read policies
-- on botanical_plants and plant_images call it. It only reports whether the caller is an admin.
