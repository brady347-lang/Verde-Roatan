-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Additive Knowledge Core layer. This migration is a REVIEW DRAFT and must not be run
-- until approved. It preserves original PDFs, raw knowledge_chunks, existing taxa,
-- existing Constitution tables, and all current Workers.
--
-- New curated layer:
--   knowledge_document_summaries + knowledge_curated_chunks
--   botanical_health_records (pests and diseases)
--   search_verde_knowledge() (deterministic lexical retrieval; no Gemini required)
--
-- All writes and reads are service-role-only through a dedicated Worker.

CREATE TABLE IF NOT EXISTS public.knowledge_document_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 40 AND 12000),
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(key_facts) = 'array'),
  critical_details jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_details) = 'array'),
  safety_warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(safety_warnings) = 'array'),
  source_pages integer[] NOT NULL DEFAULT '{}',
  generation_method text NOT NULL DEFAULT 'human' CHECK (generation_method IN ('human','ai_assisted','imported')),
  model_name text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected','superseded')),
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version),
  CONSTRAINT knowledge_summary_review_complete CHECK (
    review_status <> 'approved' OR (reviewed_at IS NOT NULL AND reviewed_by_email IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS knowledge_document_summaries_review_idx
  ON public.knowledge_document_summaries (review_status, document_id, version DESC);

CREATE TABLE IF NOT EXISTS public.knowledge_curated_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES public.knowledge_document_summaries(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  page_start integer,
  page_end integer,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 20 AND 6000),
  embedding extensions.vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (summary_id, chunk_index),
  CHECK (page_start IS NULL OR page_start > 0),
  CHECK (page_end IS NULL OR page_start IS NULL OR page_end >= page_start)
);
CREATE INDEX IF NOT EXISTS knowledge_curated_chunks_fts_idx
  ON public.knowledge_curated_chunks USING gin (to_tsvector('simple', content));
CREATE INDEX IF NOT EXISTS knowledge_curated_chunks_embedding_idx
  ON public.knowledge_curated_chunks USING hnsw (embedding extensions.vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.botanical_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('pest','disease')),
  common_name text NOT NULL CHECK (length(btrim(common_name)) BETWEEN 2 AND 180),
  scientific_name text,
  aliases text[] NOT NULL DEFAULT '{}',
  description text,
  identification_features text,
  symptoms text NOT NULL DEFAULT '',
  causes text,
  treatment text,
  prevention text,
  affected_plants text[] NOT NULL DEFAULT '{}',
  severity_guidance jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(safety_warnings) = 'array'),
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_storage_path text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected','archived')),
  verification_status text NOT NULL DEFAULT 'community_submitted'
    CHECK (verification_status IN ('ai_identified','community_submitted','source_supported','scientifically_verified')),
  verification_basis text,
  rag_indexed boolean NOT NULL DEFAULT false,
  submitted_by uuid,
  submitted_by_email text,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_record_verified_requires_basis CHECK (
    verification_status <> 'scientifically_verified'
    OR (review_status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND length(btrim(coalesce(verification_basis, ''))) >= 20)
  ),
  CONSTRAINT health_record_rag_requires_approval CHECK (NOT rag_indexed OR review_status = 'approved')
);
CREATE INDEX IF NOT EXISTS botanical_health_records_type_review_idx
  ON public.botanical_health_records (record_type, review_status, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS botanical_health_records_fts_idx
  ON public.botanical_health_records USING gin (
    to_tsvector('simple',
      coalesce(common_name,'') || ' ' || coalesce(scientific_name,'') || ' ' ||
      coalesce(array_to_string(aliases,' '),'') || ' ' || coalesce(description,'') || ' ' ||
      coalesce(identification_features,'') || ' ' || coalesce(symptoms,'') || ' ' ||
      coalesce(causes,'') || ' ' || coalesce(treatment,'') || ' ' ||
      coalesce(prevention,'') || ' ' || coalesce(array_to_string(affected_plants,' '),'')
    )
  );

CREATE TABLE IF NOT EXISTS public.botanical_health_record_taxa (
  health_record_id uuid NOT NULL REFERENCES public.botanical_health_records(id) ON DELETE CASCADE,
  taxon_id uuid NOT NULL REFERENCES public.botanical_taxa(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'affected_by' CHECK (relationship IN ('affected_by','host','vector','lookalike')),
  PRIMARY KEY (health_record_id, taxon_id, relationship)
);
CREATE INDEX IF NOT EXISTS botanical_health_record_taxa_taxon_idx
  ON public.botanical_health_record_taxa (taxon_id, relationship);

CREATE OR REPLACE FUNCTION public.verde_knowledge_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_document_summaries_touch ON public.knowledge_document_summaries;
CREATE TRIGGER knowledge_document_summaries_touch BEFORE UPDATE ON public.knowledge_document_summaries
FOR EACH ROW EXECUTE FUNCTION public.verde_knowledge_touch_updated_at();
DROP TRIGGER IF EXISTS botanical_health_records_touch ON public.botanical_health_records;
CREATE TRIGGER botanical_health_records_touch BEFORE UPDATE ON public.botanical_health_records
FOR EACH ROW EXECUTE FUNCTION public.verde_knowledge_touch_updated_at();

-- Database-level guard: an AI result or community submission cannot mark itself scientific truth.
CREATE OR REPLACE FUNCTION public.verde_health_verification_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.verification_status = 'scientifically_verified' THEN
    RAISE EXCEPTION 'A new health record cannot be scientifically verified on submission';
  END IF;
  IF NEW.verification_status = 'scientifically_verified'
     AND (NEW.review_status <> 'approved' OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
          OR length(btrim(coalesce(NEW.verification_basis, ''))) < 20) THEN
    RAISE EXCEPTION 'Scientific verification requires administrator approval and a written evidence basis';
  END IF;
  IF NEW.rag_indexed AND NEW.review_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved health records may be indexed in RAG';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS botanical_health_records_verification_guard ON public.botanical_health_records;
CREATE TRIGGER botanical_health_records_verification_guard
BEFORE INSERT OR UPDATE ON public.botanical_health_records
FOR EACH ROW EXECUTE FUNCTION public.verde_health_verification_guard();

ALTER TABLE public.knowledge_document_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_curated_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botanical_health_record_taxa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_document_summaries, public.knowledge_curated_chunks,
  public.botanical_health_records, public.botanical_health_record_taxa FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_document_summaries,
  public.knowledge_curated_chunks, public.botanical_health_records,
  public.botanical_health_record_taxa TO service_role;

-- A new, additive retrieval RPC. It never reads pending/rejected material. Existing
-- match_knowledge_chunks() and search_knowledge_text() remain unchanged for compatibility.
CREATE OR REPLACE FUNCTION public.search_verde_knowledge(
  q text,
  match_count integer DEFAULT 10,
  include_private boolean DEFAULT false
)
RETURNS TABLE (
  source_type text,
  source_id uuid,
  document_id uuid,
  source_title text,
  citation text,
  page_start integer,
  page_end integer,
  content text,
  verification_status text,
  rank real
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH terms AS (
    SELECT to_tsquery('simple', string_agg(quote_literal(w), ' | ')) AS tsq
    FROM (
      SELECT DISTINCT lower(m[1]) AS w
      FROM regexp_matches(coalesce(q, ''), '([[:alpha:]]{3,})', 'g') AS m
      LIMIT 16
    ) x
  ),
  document_hits AS (
    SELECT
      'research'::text AS source_type,
      c.id AS source_id,
      d.id AS document_id,
      d.original_name AS source_title,
      d.citation,
      c.page_start,
      c.page_end,
      c.content,
      'source_supported'::text AS verification_status,
      ts_rank(to_tsvector('simple', c.content), t.tsq) AS rank
    FROM public.knowledge_curated_chunks c
    JOIN public.knowledge_document_summaries s ON s.id = c.summary_id
    JOIN public.knowledge_documents d ON d.id = c.document_id
    CROSS JOIN terms t
    WHERE t.tsq IS NOT NULL
      AND s.review_status = 'approved'
      AND d.status = 'approved' AND d.rag_indexed
      AND (include_private OR d.visibility = 'public')
      AND to_tsvector('simple', c.content) @@ t.tsq
  ),
  health_hits AS (
    SELECT
      h.record_type::text AS source_type,
      h.id AS source_id,
      NULL::uuid AS document_id,
      h.common_name AS source_title,
      NULL::text AS citation,
      NULL::integer AS page_start,
      NULL::integer AS page_end,
      concat_ws(E'\n',
        h.common_name, h.scientific_name, array_to_string(h.aliases, ', '),
        h.description, h.identification_features, h.symptoms, h.causes,
        h.treatment, h.prevention, array_to_string(h.affected_plants, ', ')
      ) AS content,
      h.verification_status,
      ts_rank(
        to_tsvector('simple', concat_ws(' ',
          h.common_name, h.scientific_name, array_to_string(h.aliases, ' '),
          h.description, h.identification_features, h.symptoms, h.causes,
          h.treatment, h.prevention, array_to_string(h.affected_plants, ' ')
        )), t.tsq
      ) AS rank
    FROM public.botanical_health_records h
    CROSS JOIN terms t
    WHERE t.tsq IS NOT NULL
      AND h.review_status = 'approved' AND h.rag_indexed
      AND (include_private OR h.visibility = 'public')
      AND to_tsvector('simple', concat_ws(' ',
        h.common_name, h.scientific_name, array_to_string(h.aliases, ' '),
        h.description, h.identification_features, h.symptoms, h.causes,
        h.treatment, h.prevention, array_to_string(h.affected_plants, ' ')
      )) @@ t.tsq
  )
  SELECT * FROM (
    SELECT * FROM document_hits
    UNION ALL
    SELECT * FROM health_hits
  ) hits
  ORDER BY rank DESC, source_title
  LIMIT LEAST(GREATEST(match_count, 1), 30);
$$;
REVOKE ALL ON FUNCTION public.search_verde_knowledge(text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_verde_knowledge(text, integer, boolean) TO service_role;

-- Private evidence images for pest/disease submissions; originals are not made public by approval.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('botanical-health-evidence', 'botanical-health-evidence', false, 12582912,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.knowledge_document_summaries IS
  'Curated, administrator-reviewed summaries of original botanical documents. Original PDFs and raw chunks remain untouched.';
COMMENT ON TABLE public.knowledge_curated_chunks IS
  'RAG-ready chunks generated from approved summaries, with page provenance and optional embeddings.';
COMMENT ON TABLE public.botanical_health_records IS
  'Structured pest and disease knowledge. Community/AI submissions remain unapproved and unindexed until reviewed.';
