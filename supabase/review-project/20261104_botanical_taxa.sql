-- Verde Roatan TV project (verde-roatan-db, moaqgqbqfeckeabigfha) ONLY. Do not run on the main project.
-- Structured botanical records that work without any AI provider (foundation for Issue 10) and the
-- target of the administrator-approved bulk import (Issue 6).
-- Access: service role only (through the Cloudflare worker). RLS is enabled with no policies, so
-- the anon and authenticated roles cannot read or write these tables directly.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.botanical_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  uploaded_by_email text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.botanical_taxa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scientific_name text NOT NULL,
  name_key text NOT NULL UNIQUE,
  genus text,
  species text,
  common_name text NOT NULL,
  family text,
  synonyms text[] NOT NULL DEFAULT '{}',
  description text,
  habitat text,
  distribution text,
  sunlight text,
  water text,
  soil text,
  propagation text,
  toxicity text,
  pests_diseases text,
  climate text,
  growth_habit text,
  native_to_bay_islands boolean,
  scientific_references text[] NOT NULL DEFAULT '{}',
  -- Botanical reference photo only. Nursery inventory photos live in the main project's product-images bucket.
  reference_photo_url text,
  taxonomy_check jsonb,
  record_status text NOT NULL DEFAULT 'published' CHECK (record_status IN ('draft','published','archived')),
  -- Where the record came from. Community/AI records are never promoted to scientifically verified automatically.
  source_type text NOT NULL DEFAULT 'bulk_import' CHECK (source_type IN ('bulk_import','manual','document_extraction')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','scientifically_verified')),
  import_batch_id uuid REFERENCES public.botanical_import_batches(id) ON DELETE SET NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS botanical_taxa_family_idx ON public.botanical_taxa (family);
CREATE INDEX IF NOT EXISTS botanical_taxa_sci_trgm ON public.botanical_taxa USING gin (scientific_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS botanical_taxa_common_trgm ON public.botanical_taxa USING gin (common_name extensions.gin_trgm_ops);

ALTER TABLE public.botanical_taxa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.botanical_taxa, public.botanical_import_batches FROM anon, authenticated;
