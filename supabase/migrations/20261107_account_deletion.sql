-- Google Play requires an in-app way to delete an account and its data.
-- delete_my_account(): a signed-in customer deletes THEIR OWN account. Admins are blocked
-- (they must be demoted by another administrator first) so the business cannot be locked out.
-- Orders are financial records: they are kept but anonymised (no name, phone, address, notes, owner).
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin')
     OR coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' THEN
    RAISE EXCEPTION 'Administrator accounts cannot be deleted here';
  END IF;

  UPDATE public.orders
     SET customer_id = NULL, customer_name = 'Deleted customer', customer_phone = NULL,
         delivery_address = NULL, notes = NULL
   WHERE customer_id = uid;
  DELETE FROM public.service_requests WHERE customer_id = uid;
  DELETE FROM public.plant_identifications WHERE user_id = uid;
  DELETE FROM public.identification_history WHERE user_id = uid;
  UPDATE public.stock_movements SET performed_by = NULL WHERE performed_by = uid;

  DELETE FROM auth.users WHERE id = uid;   -- profiles row is removed by ON DELETE CASCADE
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
