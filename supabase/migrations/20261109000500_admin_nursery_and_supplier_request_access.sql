-- Align nursery administration and supplier order visibility with verified ownership.
-- Preserve the narrower public product policy; remove the older permissive policy
-- that allowed active products from inactive nurseries to be publicly visible.

DROP POLICY IF EXISTS "Public can view active products" ON public.products;

DROP POLICY IF EXISTS "Admins manage all nurseries" ON public.nurseries;
CREATE POLICY "Admins manage all nurseries"
  ON public.nurseries
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Approved suppliers read own purchase requests" ON public.supplier_purchase_requests;
CREATE POLICY "Approved suppliers read own purchase requests"
  ON public.supplier_purchase_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.supplier_applications AS application
      WHERE application.user_id = (SELECT auth.uid())
        AND application.supplier_id = supplier_purchase_requests.supplier_id
        AND application.status = 'approved'
    )
  );
