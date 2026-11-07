-- No-AI text search over approved knowledge passages. Used by the constitution worker so the
-- Knowledge Center can answer from approved documents without Google/Gemini.
-- Same visibility rules as match_knowledge_chunks: approved + indexed documents only;
-- private documents only when include_private is true (administrators).
CREATE OR REPLACE FUNCTION public.search_knowledge_text(q text, match_count integer DEFAULT 6, include_private boolean DEFAULT false)
RETURNS TABLE(chunk_id uuid, document_id uuid, original_name text, citation text, page_number integer, content text, rank real)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH terms AS (
    -- Every word of 3+ letters (accents folded in the data side by unaccent-free simple matching),
    -- joined with OR so a partial match still surfaces the best passages.
    SELECT to_tsquery('simple', string_agg(quote_literal(w), ' | ')) AS tsq
    FROM (
      SELECT DISTINCT lower(m[1]) AS w
      FROM regexp_matches(coalesce(q, ''), '([[:alpha:]]{3,})', 'g') AS m
      LIMIT 12
    ) x
  )
  SELECT c.id, d.id, d.original_name, d.citation, c.page_number, c.content,
         ts_rank(to_tsvector('simple', c.content), t.tsq) AS rank
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d ON d.id = c.document_id
  CROSS JOIN terms t
  WHERE t.tsq IS NOT NULL
    AND d.status = 'approved' AND d.rag_indexed
    AND (include_private OR d.visibility = 'public')
    AND to_tsvector('simple', c.content) @@ t.tsq
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_knowledge_text(text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_text(text, integer, boolean) TO service_role;
