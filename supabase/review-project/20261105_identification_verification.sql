-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Community identification verification (Issue 9).
-- Three clearly separate levels:
--   ai_identified          the AI proposed a name (every submission starts here)
--   user_confirmed         the user said "Yes, that's correct!" (still NOT scientific verification)
--   scientifically_verified an administrator verified it, with a written basis. Never automatic.
-- These tables are separate from knowledge_* (documents / RAG): community data is never indexed for RAG.

ALTER TABLE public.identification_confirmations DROP CONSTRAINT IF EXISTS identification_confirmations_decision_check;
ALTER TABLE public.identification_confirmations ADD CONSTRAINT identification_confirmations_decision_check
  CHECK (decision = ANY (ARRAY['confirmed','almost','not_my_plant','corrected']));

ALTER TABLE public.identification_reviews
  ADD COLUMN IF NOT EXISTS ai_family text,
  ADD COLUMN IF NOT EXISTS ai_genus text,
  ADD COLUMN IF NOT EXISTS ai_species text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS user_decision text CHECK (user_decision IN ('confirmed','almost','not_my_plant')),
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS verification_level text NOT NULL DEFAULT 'ai_identified'
    CHECK (verification_level IN ('ai_identified','user_confirmed','scientifically_verified')),
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_basis text;

ALTER TABLE public.identification_reviews DROP CONSTRAINT IF EXISTS identification_verified_requires_admin_basis;
ALTER TABLE public.identification_reviews ADD CONSTRAINT identification_verified_requires_admin_basis
  CHECK (
    verification_level <> 'scientifically_verified'
    OR (status = 'approved' AND verified_by IS NOT NULL AND verified_at IS NOT NULL
        AND length(btrim(coalesce(verification_basis, ''))) >= 10)
  );

-- A new submission can never arrive already scientifically verified.
CREATE OR REPLACE FUNCTION public.identification_no_self_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.verification_level = 'scientifically_verified' THEN
    RAISE EXCEPTION 'A new identification cannot be scientifically verified on submission';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS identification_no_self_verification ON public.identification_reviews;
CREATE TRIGGER identification_no_self_verification BEFORE INSERT ON public.identification_reviews
FOR EACH ROW EXECUTE FUNCTION public.identification_no_self_verification();

CREATE INDEX IF NOT EXISTS identification_reviews_level_idx ON public.identification_reviews (verification_level, status, created_at DESC);
