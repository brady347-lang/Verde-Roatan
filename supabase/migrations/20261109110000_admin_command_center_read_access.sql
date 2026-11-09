-- Administrator command-center access to operational records.
-- Access is restricted to authenticated users whose trusted app metadata passes is_app_admin().
-- Financial records remain append-only; this migration grants administrators read access only.

DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders"
  ON public.orders FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Admins read order items" ON public.order_items;
CREATE POLICY "Admins read order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "Admins read order status history" ON public.order_status_history;
CREATE POLICY "Admins read order status history"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage order messages" ON public.order_messages;
CREATE POLICY "Admins manage order messages"
  ON public.order_messages FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage supplier purchase requests" ON public.supplier_purchase_requests;
CREATE POLICY "Admins manage supplier purchase requests"
  ON public.supplier_purchase_requests FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Admins read transaction records" ON public.transaction_records;
CREATE POLICY "Admins read transaction records"
  ON public.transaction_records FOR SELECT TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage notification events" ON public.notification_events;
CREATE POLICY "Admins manage notification events"
  ON public.notification_events FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT ON public.order_items, public.order_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_purchase_requests TO authenticated;
GRANT SELECT ON public.transaction_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO authenticated;
