-- Verde Roatan: landscaping service request workflow (Issue 8).
-- Landscaping requests live in public.service_requests and are kept completely separate from
-- product orders. This migration is additive: it extends service_requests, adds a history table,
-- admin-only update functions, and an admin notification on every new request.
-- Run in the MAIN Verde Roatan Supabase project only.

-- ---------------------------------------------------------------------------
-- 1. Extend service_requests
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.service_request_number_seq;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS request_number text DEFAULT ('LS-' || lpad(nextval('public.service_request_number_seq')::text, 5, '0')),
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS requested_timing text,
  ADD COLUMN IF NOT EXISTS requested_landscaper_ref text,
  ADD COLUMN IF NOT EXISTS requested_landscaper_name text,
  ADD COLUMN IF NOT EXISTS assigned_landscaper_ref text,
  ADD COLUMN IF NOT EXISTS assigned_landscaper_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS quote_currency text,
  ADD COLUMN IF NOT EXISTS quote_notes text,
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_response text,
  ADD COLUMN IF NOT EXISTS customer_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_request_number_key ON public.service_requests (request_number);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON public.service_requests (status, created_at DESC);

-- New status list (the table was empty when this was written).
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
UPDATE public.service_requests SET status = CASE status
  WHEN 'pending' THEN 'new_request'
  WHEN 'contacted' THEN 'pending_review'
  WHEN 'quoted' THEN 'quote_sent'
  ELSE status END;
ALTER TABLE public.service_requests ALTER COLUMN status SET DEFAULT 'new_request';
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check CHECK (status = ANY (ARRAY[
  'new_request','pending_review','quote_preparation','quote_sent','awaiting_response',
  'accepted','in_progress','completed','cancelled'
]));
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_quote_currency_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_quote_currency_check
  CHECK (quote_currency IS NULL OR quote_currency = ANY (ARRAY['USD','HNL']));

-- ---------------------------------------------------------------------------
-- 2. History / communication log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'created','status_change','assignment','quote','communication','note','customer_response','cancellation','delay'
  ])),
  from_status text,
  to_status text,
  channel text CHECK (channel IS NULL OR channel = ANY (ARRAY['whatsapp','phone','email','in_app','in_person','system'])),
  direction text CHECK (direction IS NULL OR direction = ANY (ARRAY['inbound','outbound','internal'])),
  message text,
  actor_role text NOT NULL DEFAULT 'system' CHECK (actor_role = ANY (ARRAY['customer','admin','landscaper','system'])),
  actor_name text,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_request_events_request_idx ON public.service_request_events (request_id, created_at);
ALTER TABLE public.service_request_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
-- Customers may only create a brand-new request for themselves. They cannot pre-fill a status,
-- an assignment, a quote or a response.
DROP POLICY IF EXISTS "Customers create own service requests" ON public.service_requests;
CREATE POLICY "Customers create own service requests" ON public.service_requests
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = customer_id
  AND status = 'new_request'
  AND quote_amount IS NULL
  AND quote_sent_at IS NULL
  AND assigned_landscaper_name IS NULL
  AND assigned_landscaper_ref IS NULL
  AND customer_response IS NULL
  AND landscaper_id IS NULL
);

DROP POLICY IF EXISTS "Admins manage service requests" ON public.service_requests;
CREATE POLICY "Admins manage service requests" ON public.service_requests
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage service request events" ON public.service_request_events;
CREATE POLICY "Admins manage service request events" ON public.service_request_events
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Customers read own non-internal service events" ON public.service_request_events;
CREATE POLICY "Customers read own non-internal service events" ON public.service_request_events
FOR SELECT TO authenticated
USING (
  is_internal = false
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = service_request_events.request_id AND r.customer_id = (SELECT auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 4. New request: history entry + administrator notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_request_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.service_request_events (request_id, event_type, to_status, channel, direction, message, actor_role, actor_name)
  VALUES (NEW.id, 'created', NEW.status, 'in_app', 'inbound',
          'Request submitted by customer' || COALESCE(' for ' || NEW.requested_landscaper_name, ''),
          'customer', NEW.customer_name);

  INSERT INTO public.notification_events (category, event_type, entity_name, title, description, priority)
  VALUES ('service', 'new_landscaper_request',
          COALESCE(NEW.customer_name, 'Customer'),
          'New landscaping request ' || COALESCE(NEW.request_number, ''),
          COALESCE(NEW.service_type, 'Landscaping') || COALESCE(' - ' || NEW.location, '')
            || COALESCE(' (requested: ' || NEW.requested_landscaper_name || ')', ''),
          'high');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.service_request_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_request_after_insert ON public.service_requests;
CREATE TRIGGER service_request_after_insert
AFTER INSERT ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.service_request_after_insert();

-- ---------------------------------------------------------------------------
-- 5. Administrator update function (status, assignment, quote, communication)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_service_request(
  p_request_id uuid,
  p_status text DEFAULT NULL,
  p_assigned_ref text DEFAULT NULL,
  p_assigned_name text DEFAULT NULL,
  p_clear_assignment boolean DEFAULT false,
  p_quote_amount numeric DEFAULT NULL,
  p_quote_currency text DEFAULT NULL,
  p_quote_notes text DEFAULT NULL,
  p_customer_response text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_internal boolean DEFAULT false,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r public.service_requests%ROWTYPE;
  v_old_status text;
  v_actor text := COALESCE(NULLIF(trim(p_actor_name), ''), 'Administrator');
  v_new_status text;
BEGIN
  IF NOT (public.is_app_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request % not found', p_request_id;
  END IF;
  v_old_status := r.status;

  IF p_status IS NOT NULL AND p_status <> v_old_status THEN
    IF v_old_status IN ('completed') THEN
      RAISE EXCEPTION 'A completed project cannot change status';
    END IF;
    IF p_status NOT IN ('new_request','pending_review','quote_preparation','quote_sent','awaiting_response','accepted','in_progress','completed','cancelled') THEN
      RAISE EXCEPTION 'Unknown status %', p_status;
    END IF;
    IF p_status = 'quote_sent' AND COALESCE(p_quote_amount, r.quote_amount) IS NULL THEN
      RAISE EXCEPTION 'Record the quote amount before marking the quote as sent';
    END IF;
    v_new_status := p_status;
  ELSE
    v_new_status := v_old_status;
  END IF;

  -- Assignment / reassignment
  IF p_clear_assignment AND r.assigned_landscaper_name IS NOT NULL THEN
    INSERT INTO public.service_request_events (request_id, event_type, message, actor_role, actor_name)
    VALUES (r.id, 'assignment', 'Landscaper unassigned (was ' || r.assigned_landscaper_name || ')', 'admin', v_actor);
    r.assigned_landscaper_ref := NULL;
    r.assigned_landscaper_name := NULL;
  ELSIF p_assigned_name IS NOT NULL AND trim(p_assigned_name) <> ''
        AND COALESCE(r.assigned_landscaper_name, '') <> trim(p_assigned_name) THEN
    INSERT INTO public.service_request_events (request_id, event_type, message, actor_role, actor_name)
    VALUES (r.id, 'assignment',
            CASE WHEN r.assigned_landscaper_name IS NULL
                 THEN 'Assigned to ' || trim(p_assigned_name)
                 ELSE 'Reassigned from ' || r.assigned_landscaper_name || ' to ' || trim(p_assigned_name) END,
            'admin', v_actor);
    r.assigned_landscaper_ref := p_assigned_ref;
    r.assigned_landscaper_name := trim(p_assigned_name);
  END IF;

  -- Quote
  IF p_quote_amount IS NOT NULL THEN
    IF p_quote_amount < 0 THEN RAISE EXCEPTION 'Quote amount cannot be negative'; END IF;
    r.quote_amount := p_quote_amount;
    r.quote_currency := COALESCE(p_quote_currency, r.quote_currency, 'USD');
    r.quote_notes := COALESCE(p_quote_notes, r.quote_notes);
    INSERT INTO public.service_request_events (request_id, event_type, message, actor_role, actor_name)
    VALUES (r.id, 'quote', 'Quote recorded: ' || p_quote_amount::text || ' ' || r.quote_currency
            || COALESCE(' - ' || NULLIF(trim(p_quote_notes), ''), ''), 'admin', v_actor);
  ELSIF p_quote_notes IS NOT NULL THEN
    r.quote_notes := p_quote_notes;
  END IF;

  IF v_new_status = 'quote_sent' AND v_old_status <> 'quote_sent' THEN
    r.quote_sent_at := now();
  END IF;

  -- Customer response recorded by the administrator (e.g. received over WhatsApp)
  IF p_customer_response IS NOT NULL AND trim(p_customer_response) <> '' THEN
    r.customer_response := trim(p_customer_response);
    r.customer_response_at := now();
    INSERT INTO public.service_request_events (request_id, event_type, channel, direction, message, actor_role, actor_name)
    VALUES (r.id, 'customer_response', COALESCE(p_channel, 'whatsapp'), 'inbound', trim(p_customer_response), 'customer', r.customer_name);
  END IF;

  -- Status change history
  IF v_new_status <> v_old_status THEN
    INSERT INTO public.service_request_events (request_id, event_type, from_status, to_status, message, actor_role, actor_name)
    VALUES (r.id,
            CASE v_new_status WHEN 'cancelled' THEN 'cancellation' ELSE 'status_change' END,
            v_old_status, v_new_status,
            CASE WHEN v_new_status = 'cancelled' THEN COALESCE(NULLIF(trim(p_note), ''), 'Project cancelled') ELSE NULL END,
            'admin', v_actor);
  END IF;

  -- Free-text note or recorded communication (call, WhatsApp, delay, ...)
  IF p_note IS NOT NULL AND trim(p_note) <> '' AND v_new_status <> 'cancelled' THEN
    INSERT INTO public.service_request_events (request_id, event_type, channel, direction, message, actor_role, actor_name, is_internal)
    VALUES (r.id,
            CASE WHEN p_channel IS NOT NULL THEN 'communication' ELSE 'note' END,
            p_channel, COALESCE(p_direction, CASE WHEN p_channel IS NULL THEN 'internal' ELSE 'outbound' END),
            trim(p_note), 'admin', v_actor, COALESCE(p_internal, false) OR p_channel IS NULL);
  END IF;

  UPDATE public.service_requests SET
    status = v_new_status,
    assigned_landscaper_ref = r.assigned_landscaper_ref,
    assigned_landscaper_name = r.assigned_landscaper_name,
    quote_amount = r.quote_amount,
    quote_currency = r.quote_currency,
    quote_notes = r.quote_notes,
    quote_sent_at = r.quote_sent_at,
    customer_response = r.customer_response,
    customer_response_at = r.customer_response_at,
    status_updated_at = CASE WHEN v_new_status <> v_old_status THEN now() ELSE status_updated_at END,
    updated_at = now()
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true, 'id', r.id, 'previous_status', v_old_status, 'status', v_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_service_request(uuid,text,text,text,boolean,numeric,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_service_request(uuid,text,text,text,boolean,numeric,text,text,text,text,text,text,boolean,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Customer accepts or declines a quote that was sent to them
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_respond_to_service_quote(
  p_request_id uuid,
  p_accept boolean,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r public.service_requests%ROWTYPE;
  v_next text;
BEGIN
  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Service request not found';
  END IF;
  IF r.status NOT IN ('quote_sent', 'awaiting_response') THEN
    RAISE EXCEPTION 'There is no open quote to respond to';
  END IF;

  v_next := CASE WHEN p_accept THEN 'accepted' ELSE 'cancelled' END;
  UPDATE public.service_requests SET
    status = v_next,
    customer_response = CASE WHEN p_accept THEN 'Accepted' ELSE 'Declined' END
                        || COALESCE(': ' || NULLIF(trim(p_message), ''), ''),
    customer_response_at = now(),
    status_updated_at = now(),
    updated_at = now()
  WHERE id = r.id;

  INSERT INTO public.service_request_events (request_id, event_type, from_status, to_status, channel, direction, message, actor_role, actor_name)
  VALUES (r.id, 'customer_response', r.status, v_next, 'in_app', 'inbound',
          CASE WHEN p_accept THEN 'Customer accepted the quote' ELSE 'Customer declined the quote' END
            || COALESCE(': ' || NULLIF(trim(p_message), ''), ''),
          'customer', r.customer_name);

  INSERT INTO public.notification_events (category, event_type, entity_name, title, description, priority)
  VALUES ('service', 'service_quote_response', COALESCE(r.customer_name, 'Customer'),
          'Quote ' || CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END || ' - ' || COALESCE(r.request_number, ''),
          COALESCE(r.service_type, 'Landscaping'), 'high');

  RETURN jsonb_build_object('success', true, 'status', v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.customer_respond_to_service_quote(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_service_quote(uuid,boolean,text) TO authenticated;
