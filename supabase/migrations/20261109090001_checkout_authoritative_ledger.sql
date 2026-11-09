-- Checkout results must return the values calculated from locked database rows.
-- The database, not the mobile catalog cache, is the source of truth for prices and totals.
-- Also persist the initial order history and customer-order ledger event exactly once.

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  p_checkout_token uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_zone_id uuid,
  p_delivery_address text,
  p_notes text,
  p_currency text,
  p_marketing_consent boolean,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_order_id uuid;
  v_rate numeric;
  v_zone public.delivery_zones%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item record;
  v_unit_price numeric;
  v_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_checkout_token IS NULL THEN RAISE EXCEPTION 'Checkout token is required'; END IF;
  IF NULLIF(TRIM(p_customer_name), '') IS NULL THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF NULLIF(TRIM(p_customer_phone), '') IS NULL
     OR LENGTH(REGEXP_REPLACE(p_customer_phone, '[^0-9]', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'A valid WhatsApp number is required';
  END IF;
  IF NULLIF(TRIM(p_delivery_address), '') IS NULL THEN RAISE EXCEPTION 'Delivery address is required'; END IF;
  IF p_currency NOT IN ('USD', 'HNL') THEN RAISE EXCEPTION 'Currency must be USD or HNL'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Your cart must contain between 1 and 50 items';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    WHERE product_id IS NULL OR quantity IS NULL OR quantity < 1 OR quantity > 10000
  ) THEN
    RAISE EXCEPTION 'Invalid product or quantity';
  END IF;

  IF EXISTS (
    SELECT product_id
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    GROUP BY product_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate products must be combined into one cart item';
  END IF;

  -- An identical retry returns the original order and its original server-calculated values.
  SELECT * INTO v_order FROM public.orders WHERE checkout_token = p_checkout_token;
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id,
      'product_name', oi.product_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'currency', oi.currency,
      'size', p.size,
      'image_url', p.image_url,
      'supplier_name', n.name
    ) ORDER BY oi.created_at), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.nurseries n ON n.id = oi.nursery_id
    WHERE oi.order_id = v_order.id;

    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'id', v_order.id, 'order_id', v_order.id,
      'status', v_order.status, 'canonical_status', v_order.canonical_status,
      'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
      'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
      'total', v_order.total, 'currency', v_order.currency,
      'usd_to_hnl_rate', v_order.usd_to_hnl_rate, 'items', v_items
    );
  END IF;

  SELECT * INTO v_zone
  FROM public.delivery_zones
  WHERE id = p_delivery_zone_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected delivery zone is unavailable'; END IF;
  IF v_zone.currency NOT IN ('USD', 'HNL') THEN RAISE EXCEPTION 'Unsupported delivery zone currency'; END IF;

  SELECT usd_to_hnl INTO v_rate
  FROM public.exchange_rate_history
  ORDER BY rate_date DESC, fetched_at DESC
  LIMIT 1;
  IF v_rate IS NULL OR v_rate <= 0 THEN RAISE EXCEPTION 'A valid exchange rate is unavailable'; END IF;

  IF v_zone.currency = p_currency THEN
    v_delivery_fee := v_zone.fee;
  ELSIF v_zone.currency = 'USD' AND p_currency = 'HNL' THEN
    v_delivery_fee := ROUND(v_zone.fee * v_rate, 2);
  ELSE
    v_delivery_fee := ROUND(v_zone.fee / v_rate, 2);
  END IF;

  INSERT INTO public.orders (
    checkout_token, customer_id, delivery_zone_id, status, payment_status,
    customer_name, customer_phone, delivery_address, notes, subtotal,
    delivery_fee, total, currency, usd_to_hnl_rate, marketing_consent
  ) VALUES (
    p_checkout_token, p_customer_id, p_delivery_zone_id, 'pending', 'pending',
    TRIM(p_customer_name), TRIM(p_customer_phone), TRIM(p_delivery_address),
    p_notes, 0, v_delivery_fee, v_delivery_fee, p_currency, v_rate,
    COALESCE(p_marketing_consent, false)
  )
  ON CONFLICT (checkout_token) DO NOTHING
  RETURNING id INTO v_order_id;

  -- If another request with this token won the race, return that order without deducting stock.
  IF v_order_id IS NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE checkout_token = p_checkout_token;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id, 'product_name', oi.product_name,
      'quantity', oi.quantity, 'unit_price', oi.unit_price, 'currency', oi.currency,
      'size', p.size, 'image_url', p.image_url, 'supplier_name', n.name
    ) ORDER BY oi.created_at), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.nurseries n ON n.id = oi.nursery_id
    WHERE oi.order_id = v_order.id;

    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'id', v_order.id, 'order_id', v_order.id,
      'status', v_order.status, 'canonical_status', v_order.canonical_status,
      'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
      'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
      'total', v_order.total, 'currency', v_order.currency,
      'usd_to_hnl_rate', v_order.usd_to_hnl_rate, 'items', v_items
    );
  END IF;

  -- Lock products in a deterministic order to prevent overselling and deadlocks.
  FOR v_item IN
    SELECT product_id, quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    ORDER BY product_id
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'A selected product is unavailable'; END IF;
    IF v_product.currency NOT IN ('USD', 'HNL') THEN RAISE EXCEPTION 'Unsupported product currency'; END IF;
    IF v_product.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product: %', v_product.name;
    END IF;

    IF v_product.currency = p_currency THEN
      v_unit_price := v_product.price;
    ELSIF v_product.currency = 'USD' AND p_currency = 'HNL' THEN
      v_unit_price := ROUND(v_product.price * v_rate, 2);
    ELSE
      v_unit_price := ROUND(v_product.price / v_rate, 2);
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, nursery_id, product_name, quantity, unit_price, currency
    ) VALUES (
      v_order_id, v_product.id, v_product.nursery_id, v_product.name,
      v_item.quantity, v_unit_price, p_currency
    );

    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity, updated_at = now()
    WHERE id = v_product.id;

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_total := v_subtotal + v_delivery_fee;

  UPDATE public.orders
  SET subtotal = v_subtotal, total = v_total, updated_at = now()
  WHERE id = v_order_id;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, responsible_role, responsible_name, notes
  ) VALUES (
    v_order_id, NULL, 'order_placed', 'customer', TRIM(p_customer_name),
    'Order placed through checkout'
  );

  INSERT INTO public.transaction_records (
    related_order_id, transaction_type, customer_name, amount, currency,
    exchange_rate, payment_method, status, responsible_name, responsible_role,
    notes, reference_number
  ) VALUES (
    v_order_id, 'customer_order', v_order.customer_name, v_order.total,
    v_order.currency, v_order.usd_to_hnl_rate, v_order.payment_method,
    'pending', v_order.customer_name, 'customer',
    'Customer order created through checkout', v_order_id::text
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id,
    'product_name', oi.product_name,
    'quantity', oi.quantity,
    'unit_price', oi.unit_price,
    'currency', oi.currency,
    'size', p.size,
    'image_url', p.image_url,
    'supplier_name', n.name
  ) ORDER BY oi.created_at), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.nurseries n ON n.id = oi.nursery_id
  WHERE oi.order_id = v_order_id;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'id', v_order_id, 'order_id', v_order_id,
    'status', v_order.status, 'canonical_status', v_order.canonical_status,
    'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
    'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
    'total', v_order.total, 'currency', v_order.currency,
    'usd_to_hnl_rate', v_order.usd_to_hnl_rate, 'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(uuid, uuid, text, text, uuid, text, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(uuid, uuid, text, text, uuid, text, text, text, boolean, jsonb) TO service_role;
