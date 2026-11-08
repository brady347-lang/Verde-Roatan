-- Align the legacy products table with the server-side admin authorization
-- used by the rest of Verde Roatan.
--
-- The former UPDATE-only policy depended exclusively on the app_metadata JWT
-- claim. The app's administrator allowlist and the existing is_app_admin()
-- database function also verify the authenticated user's auth.users record.
-- Using that function avoids false 403s from an older JWT while retaining a
-- server-side identity check. The ALL policy also permits admin INSERTs,
-- which the former UPDATE-only policy did not permit.
--
-- This is a migration artifact only. It must be reviewed and explicitly
-- applied to the intended Supabase project before catalog writes change.

DROP POLICY IF EXISTS "Verde admins can update products" ON public.products;
DROP POLICY IF EXISTS "Verde admins manage products" ON public.products;

CREATE POLICY "Verde admins manage products"
ON public.products
FOR ALL
TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());
