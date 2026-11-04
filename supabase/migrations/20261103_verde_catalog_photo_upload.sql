-- Verde Roatan: secure admin photo upload and catalog image URL updates.
-- Run this migration in the Supabase SQL Editor before testing uploads.
-- Admin authorization is based on the signed JWT app_metadata claim, not user-editable metadata.

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Verde admins can update products" ON public.products;
CREATE POLICY "Verde admins can update products" ON public.products
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- catalog_items only exists in some environments; skip it where it does not.
DO $$
BEGIN
  IF to_regclass('public.catalog_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Verde admins can update catalog items" ON public.catalog_items;
    CREATE POLICY "Verde admins can update catalog items" ON public.catalog_items
    FOR UPDATE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END $$;

DROP POLICY IF EXISTS "Verde admins can upload product images" ON storage.objects;
CREATE POLICY "Verde admins can upload product images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Verde admins can update product images" ON storage.objects;
CREATE POLICY "Verde admins can update product images" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Verde admins can delete product images" ON storage.objects;
CREATE POLICY "Verde admins can delete product images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
