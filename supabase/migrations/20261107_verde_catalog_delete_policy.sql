-- Catalog deletion permissions for the existing admin catalog UI.
-- Keep authorization tied to the trusted JWT app_metadata claim.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verde admins can delete products" ON public.products;
CREATE POLICY "Verde admins can delete products" ON public.products
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Legacy catalog rows use text IDs in catalog_items. Add the matching policy
-- when that compatibility table exists; do not force-enable RLS here because
-- some deployments still read it through the existing service-role worker.
DO $$
BEGIN
  IF to_regclass('public.catalog_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Verde admins can delete catalog items" ON public.catalog_items;
    CREATE POLICY "Verde admins can delete catalog items" ON public.catalog_items
    FOR DELETE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END $$;
