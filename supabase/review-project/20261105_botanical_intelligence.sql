-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Independent botanical intelligence (Issue 10): deterministic classification, search, filtering and care
-- summaries computed entirely in PostgreSQL. No AI provider is involved, and missing facts are reported as
-- "not recorded" instead of being guessed.

ALTER TABLE public.botanical_taxa
  ADD COLUMN IF NOT EXISTS sun_levels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS water_level text CHECK (water_level IN ('low','moderate','high')),
  ADD COLUMN IF NOT EXISTS salt_level smallint CHECK (salt_level BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS toxicity_level text CHECK (toxicity_level IN ('safe','toxic'));

CREATE OR REPLACE FUNCTION public.botanical_fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT translate(lower(coalesce(t, '')), 'áéíóúñüàèìòù', 'aeiounuaeiou') $$;

-- Fixed, readable rules that turn free text into comparable levels.
CREATE OR REPLACE FUNCTION public.botanical_derive() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  sun text := public.botanical_fold(NEW.sunlight);
  wat text := public.botanical_fold(NEW.water);
  env text := public.botanical_fold(coalesce(NEW.climate, '') || ' ' || coalesce(NEW.habitat, '') || ' ' || coalesce(NEW.description, ''));
  tox text := public.botanical_fold(NEW.toxicity);
BEGIN
  NEW.sun_levels := array_remove(ARRAY[
    CASE WHEN sun ~ 'full|direct|pleno|all.day' THEN 'full' END,
    CASE WHEN sun ~ 'partial|filtered|bright|dappled|parcial|morning' THEN 'partial' END,
    CASE WHEN sun ~ 'shade|sombra|low light' THEN 'shade' END
  ], NULL);
  NEW.water_level := CASE
    WHEN wat = '' THEN NULL
    WHEN wat ~ 'low|drought|sparing|poco|minimal' THEN 'low'
    WHEN wat ~ 'high|moist|frequent|daily|diario|humedo|keep wet|constant' THEN 'high'
    ELSE 'moderate' END;
  NEW.salt_level := CASE
    WHEN env ~ 'highly salt|very salt|excellent salt|salt.spray|oceanfront|beachfront' THEN 3
    WHEN env ~ 'salt.tolerant|salt tolerance|tolerates salt|coastal|beach' THEN 2
    ELSE NULL END;
  NEW.toxicity_level := CASE
    WHEN tox = '' THEN NULL
    WHEN tox ~ 'non.?toxic|not toxic|pet.?safe|safe for|no toxicity|nontoxic' THEN 'safe'
    WHEN tox ~ 'toxic|poison|harmful|irritant|venom' THEN 'toxic'
    ELSE NULL END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS botanical_taxa_derive ON public.botanical_taxa;
CREATE TRIGGER botanical_taxa_derive BEFORE INSERT OR UPDATE ON public.botanical_taxa
FOR EACH ROW EXECUTE FUNCTION public.botanical_derive();

-- Re-derive for any rows that already exist.
UPDATE public.botanical_taxa SET id = id;

CREATE OR REPLACE FUNCTION public.botanical_search(
  q text DEFAULT NULL,
  p_family text DEFAULT NULL,
  p_sun text DEFAULT NULL,
  p_water text DEFAULT NULL,
  p_min_salt integer DEFAULT NULL,
  p_pet_safe boolean DEFAULT false,
  p_native boolean DEFAULT false,
  lim integer DEFAULT 25
)
RETURNS TABLE (
  id uuid, scientific_name text, common_name text, family text, sunlight text, water text,
  sun_levels text[], water_level text, salt_level smallint, toxicity_level text,
  native_to_bay_islands boolean, verification_status text, reference_photo_url text, rank real
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH t AS (SELECT public.botanical_fold(nullif(trim(q), '')) AS needle)
  SELECT b.id, b.scientific_name, b.common_name, b.family, b.sunlight, b.water,
         b.sun_levels, b.water_level, b.salt_level, b.toxicity_level,
         b.native_to_bay_islands, b.verification_status, b.reference_photo_url,
         CASE WHEN t.needle = '' THEN 0::real ELSE greatest(
           similarity(public.botanical_fold(b.scientific_name), t.needle),
           similarity(public.botanical_fold(b.common_name), t.needle),
           CASE WHEN public.botanical_fold(b.scientific_name) LIKE '%' || t.needle || '%'
                  OR public.botanical_fold(b.common_name) LIKE '%' || t.needle || '%' THEN 0.8 ELSE 0 END,
           CASE WHEN EXISTS (SELECT 1 FROM unnest(b.synonyms) s WHERE public.botanical_fold(s) = t.needle) THEN 1.0 ELSE 0 END
         )::real END AS rank
  FROM public.botanical_taxa b, t
  WHERE b.record_status = 'published'
    AND (t.needle = '' OR greatest(
           similarity(public.botanical_fold(b.scientific_name), t.needle),
           similarity(public.botanical_fold(b.common_name), t.needle),
           CASE WHEN public.botanical_fold(b.scientific_name) LIKE '%' || t.needle || '%'
                  OR public.botanical_fold(b.common_name) LIKE '%' || t.needle || '%' THEN 0.8 ELSE 0 END,
           CASE WHEN EXISTS (SELECT 1 FROM unnest(b.synonyms) s WHERE public.botanical_fold(s) = t.needle) THEN 1.0 ELSE 0 END
         ) >= 0.25)
    AND (p_family IS NULL OR public.botanical_fold(b.family) = public.botanical_fold(p_family))
    AND (p_sun IS NULL OR p_sun = ANY (b.sun_levels))
    AND (p_water IS NULL OR b.water_level = p_water)
    AND (p_min_salt IS NULL OR b.salt_level >= p_min_salt)
    AND (NOT p_pet_safe OR b.toxicity_level = 'safe')
    AND (NOT p_native OR b.native_to_bay_islands IS TRUE)
  ORDER BY rank DESC, b.scientific_name
  LIMIT LEAST(GREATEST(lim, 1), 25);
$$;

-- Deterministic care summary. Anything that was never recorded is listed under "missing", never guessed.
CREATE OR REPLACE FUNCTION public.botanical_care(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE b public.botanical_taxa%ROWTYPE; missing text[] := '{}'; out jsonb;
BEGIN
  SELECT * INTO b FROM public.botanical_taxa WHERE id = p_id AND record_status = 'published';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF b.sunlight IS NULL THEN missing := missing || 'sunlight'; END IF;
  IF b.water IS NULL THEN missing := missing || 'water'; END IF;
  IF b.soil IS NULL THEN missing := missing || 'soil'; END IF;
  IF b.propagation IS NULL THEN missing := missing || 'propagation'; END IF;
  IF b.toxicity IS NULL THEN missing := missing || 'toxicity'; END IF;
  IF b.pests_diseases IS NULL THEN missing := missing || 'pests_diseases'; END IF;
  out := jsonb_build_object(
    'id', b.id, 'scientific_name', b.scientific_name, 'common_name', b.common_name, 'family', b.family,
    'light', b.sunlight, 'light_levels', to_jsonb(b.sun_levels),
    'water', b.water, 'water_level', b.water_level,
    'soil', b.soil, 'propagation', b.propagation,
    'toxicity', b.toxicity, 'pet_safe', CASE b.toxicity_level WHEN 'safe' THEN true WHEN 'toxic' THEN false ELSE NULL END,
    'pests_diseases', b.pests_diseases, 'climate', b.climate, 'habitat', b.habitat, 'distribution', b.distribution,
    'salt_level', b.salt_level, 'native_to_bay_islands', b.native_to_bay_islands,
    'references', to_jsonb(b.scientific_references),
    'verification_status', b.verification_status,
    'missing', to_jsonb(missing));
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION public.botanical_search(text,text,text,text,integer,boolean,boolean,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.botanical_care(uuid) FROM PUBLIC, anon, authenticated;
