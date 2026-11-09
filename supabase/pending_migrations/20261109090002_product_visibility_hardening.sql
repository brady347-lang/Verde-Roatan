-- Remove the older broad public product policy.
-- PostgreSQL combines permissive policies with OR, so the old policy bypasses
-- the newer active-nursery check in "Public read active products".
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
