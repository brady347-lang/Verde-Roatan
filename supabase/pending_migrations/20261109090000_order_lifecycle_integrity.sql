-- RootWise order lifecycle and financial ledger integrity.
-- This migration is additive: it replaces the existing admin-only order status RPC.
-- Apply only after reconciling the production Supabase migration ledger with the checked-in files.

CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id uuid,
  p_next_status text,
  p_responsible_role text,
  p_responsible_name text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_current text;
  v_responsible_name text := COALESCE(NULLIF(trim(p_responsible_name), ''), 'Verde Administrator');
  v_transaction_type text := NULL;
  v_transaction_amount numeric := 0;
  v_transaction_status text := 'completed';
  v_transaction_created boolean := false;
  v_allowed boolean := false;
  v_item record;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'A valid order ID is required';
  END IF;

  IF NOT (public.is_app_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_next_status NOT IN (
    'order_placed', 'payment_pending', 'payment_confirmed', 'order_processing',
    'supplier_confirmation_required', 'supplier_confirmed', 'preparing_order',
    'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed',
    'cancelled', 'refund_requested', 'refunded'
  ) THEN
    RAISE EXCEPTION 'Unknown order status %', p_next_status;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_current := COALESCE(v_order.canonical_status, 'order_placed');

  -- Idempotent retry: a repeated request must not append another history or payment row.
  IF v_current = p_next_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'order_id', v_order.id,
      'previous_status', v_current,
      'new_status', p_next_status,
      'transaction_created', false
    );
  END IF;

  v_allowed := CASE v_current
    WHEN 'order_placed' THEN p_next_status IN ('payment_pending', 'payment_confirmed', 'cancelled')
    WHEN 'payment_pending' THEN p_next_status IN ('payment_confirmed', 'cancelled')
    WHEN 'payment_confirmed' THEN p_next_status IN (
      'order_processing', 'supplier_confirmation_required', 'supplier_confirmed',
      'cancelled', 'refund_requested'
    )
    WHEN 'order_processing' THEN p_next_status IN (
      'supplier_confirmation_required', 'supplier_confirmed', 'cancelled', 'refund_requested'
    )
    WHEN 'supplier_confirmation_required' THEN p_next_status IN ('supplier_confirmed', 'cancelled', 'refund_requested')
    WHEN 'supplier_confirmed' THEN p_next_status IN ('preparing_order', 'cancelled', 'refund_requested')
    WHEN 'preparing_order' THEN p_next_status IN ('ready_for_pickup', 'cancelled', 'refund_requested')
    WHEN 'ready_for_pickup' THEN p_next_status IN ('out_for_delivery', 'cancelled', 'refund_requested')
    WHEN 'out_for_delivery' THEN p_next_status IN ('delivered', 'refund_requested')
    WHEN 'delivered' THEN p_next_status IN ('completed', 'refund_requested')
    WHEN 'completed' THEN p_next_status = 'refund_requested'
    WHEN 'cancelled' THEN p_next_status = 'refund_requested' AND v_order.payment_status = 'confirmed'
    WHEN 'refund_requested' THEN p_next_status = 'refunded'
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', v_current, p_next_status;
  END IF;

  IF p_next_status = 'refund_requested' AND v_order.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed payment can be sent for refund';
  END IF;

  IF p_next_status = 'refunded' AND v_order.payment_status <> 'refund_requested' THEN
    RAISE EXCEPTION 'A refund must be requested before it can be recorded as refunded';
  END IF;

  IF p_next_status = 'payment_confirmed' THEN
    IF v_order.payment_status = 'refunded' THEN
      RAISE EXCEPTION 'A refunded order cannot be marked as paid again';
    END IF;
    v_transaction_type := 'customer_payment';
    v_transaction_amount := v_order.total;
    v_transaction_status := 'completed';
  ELSIF p_next_status = 'cancelled' THEN
    -- Cancellation is an audit event, not a cash movement.
    v_transaction_type := 'cancellation';
    v_transaction_amount := 0;
    v_transaction_status := 'cancelled';
  ELSIF p_next_status = 'refunded' THEN
    v_transaction_type := 'refund';
    v_transaction_amount := v_order.total;
    v_transaction_status := 'refunded';
  END IF;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, responsible_role, responsible_name, notes
  ) VALUES (
    v_order.id, v_current, p_next_status, 'admin',
    v_responsible_name, p_notes
  );

  UPDATE public.orders
  SET canonical_status = p_next_status,
      updated_at = now(),
      payment_status = CASE
        WHEN p_next_status = 'payment_confirmed' THEN 'confirmed'
        WHEN p_next_status = 'refund_requested' THEN 'refund_requested'
        WHEN p_next_status = 'refunded' THEN 'refunded'
        ELSE payment_status
      END,
      delivered_at = CASE
        WHEN p_next_status = 'delivered' THEN COALESCE(delivered_at, now())
        ELSE delivered_at
      END,
      status = CASE
        WHEN p_next_status IN ('order_placed', 'payment_pending') THEN 'pending'
        WHEN p_next_status IN ('payment_confirmed', 'supplier_confirmation_required', 'supplier_confirmed') THEN 'confirmed'
        WHEN p_next_status IN ('order_processing', 'preparing_order', 'ready_for_pickup') THEN 'preparing'
        WHEN p_next_status = 'out_for_delivery' THEN 'out_for_delivery'
        WHEN p_next_status IN ('delivered', 'completed') THEN 'completed'
        WHEN p_next_status IN ('cancelled', 'refund_requested', 'refunded') THEN 'cancelled'
        ELSE status
      END
  WHERE id = v_order.id;

  -- Cancellation returns the stock that checkout reserved, exactly once.
  -- The same-status guard above makes 'cancelled' reachable only once per order.
  -- Products are locked in id order, matching checkout, to avoid deadlocks.
  IF p_next_status = 'cancelled' THEN
    FOR v_item IN
      SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
      ORDER BY oi.product_id
    LOOP
      PERFORM 1 FROM public.products WHERE id = v_item.product_id FOR UPDATE;
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id;
    END LOOP;

    -- The order-level ledger entry was never paid; do not leave it pending forever.
    UPDATE public.transaction_records
    SET status = 'cancelled'
    WHERE related_order_id = v_order.id
      AND transaction_type = 'customer_order'
      AND status = 'pending';
  END IF;

  IF v_transaction_type IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_records tr
    WHERE tr.related_order_id = v_order.id
      AND tr.transaction_type = v_transaction_type
  ) THEN
    INSERT INTO public.transaction_records (
      related_order_id, transaction_type, customer_name, supplier_id, supplier_name,
      amount, currency, exchange_rate, payment_method, status, responsible_name, responsible_role,
      notes, reference_number
    ) VALUES (
      v_order.id, v_transaction_type, v_order.customer_name,
      v_order.assigned_supplier_id, v_order.assigned_supplier_name,
      v_transaction_amount,
      CASE WHEN v_order.currency IN ('HNL', 'USD') THEN v_order.currency ELSE 'HNL' END,
      v_order.usd_to_hnl_rate, v_order.payment_method, v_transaction_status, v_responsible_name, 'admin',
      COALESCE(p_notes, 'Order status changed to ' || p_next_status),
      v_order.id::text
    );
    v_transaction_created := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'order_id', v_order.id,
    'previous_status', v_current,
    'new_status', p_next_status,
    'transaction_created', v_transaction_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_order_status(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, text, text, text, text) TO authenticated, service_role;
