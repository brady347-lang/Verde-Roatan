-- Ensure every approved research hit has a usable source citation.
-- Preserve publisher citations when present; otherwise identify the original source file.
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
      COALESCE(NULLIF(btrim(d.citation), ''), d.original_name || ' (source document)') AS citation,
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
      CASE WHEN jsonb_array_length(h.source_references) > 0 THEN h.source_references::text ELSE 'Community submission record ' || h.id::text END AS citation,
      NULL::integer AS page_start,
      NULL::integer AS page_end,
      concat_ws(E'\\n',
        h.common_name, h.scientific_name, array_to_string(h.aliases, ', '),
        h.description, h.identification_features, h.symptoms, h.causes,
        h.treatment, h.prevention, array_to_string(h.affected_plants, ', '),
        CASE WHEN h.severity_guidance <> '{}'::jsonb THEN 'Severity guidance: ' || h.severity_guidance::text END,
        CASE WHEN jsonb_array_length(h.safety_warnings) > 0 THEN 'Safety warnings: ' || h.safety_warnings::text END
      ) AS content,
      h.verification_status,
      ts_rank(
        to_tsvector('simple', concat_ws(' ',
          h.common_name, h.scientific_name, array_to_string(h.aliases, ' '),
          h.description, h.identification_features, h.symptoms, h.causes,
          h.treatment, h.prevention, array_to_string(h.affected_plants, ' '),
          h.severity_guidance::text, h.safety_warnings::text
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
        h.treatment, h.prevention, array_to_string(h.affected_plants, ' '),
        h.severity_guidance::text, h.safety_warnings::text
      )) @@ t.tsq
  )
  SELECT * FROM (
    SELECT * FROM document_hits
    UNION ALL
    SELECT * FROM health_hits
  ) hits
  ORDER BY rank DESC, source_title
  LIMIT LEAST(GREATEST(coalesce(match_count, 10), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.search_verde_knowledge(text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_verde_knowledge(text, integer, boolean) TO service_role;
