-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Botanical Knowledge Center: scientific documents, extracted entities, text chunks with pgvector embeddings.
-- Access is service-role only (through the Cloudflare worker): RLS enabled, no policies.
-- Community identification submissions live in separate tables and are never indexed here.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_size_bytes bigint NOT NULL,
  content_sha256 text NOT NULL UNIQUE,
  uploaded_by_email text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN
    ('uploaded','processing','awaiting_review','approved','rejected','failed')),
  stage text NOT NULL DEFAULT 'uploaded',
  error_message text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  source_institution text,
  citation text,
  page_count integer,
  text_preview text,
  chunks_count integer NOT NULL DEFAULT 0,
  rag_indexed boolean NOT NULL DEFAULT false,
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('taxonomy','identification','horticulture','regional','health','source')),
  field_name text NOT NULL,
  scientific_name text,
  extracted_value jsonb NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source_page integer,
  source_snippet text,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','modified')),
  edited_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_entities_doc_idx ON public.knowledge_entities (document_id, approval_status);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  page_number integer,
  content text NOT NULL,
  token_estimate integer NOT NULL DEFAULT 0,
  embedding extensions.vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx ON public.knowledge_chunks USING gin (to_tsvector('simple', content));

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_documents, public.knowledge_entities, public.knowledge_chunks FROM anon, authenticated;

-- Retrieval is restricted to APPROVED documents. The public consultant passes include_private = false.
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding extensions.vector(768),
  match_count integer DEFAULT 6,
  min_similarity double precision DEFAULT 0.3,
  include_private boolean DEFAULT false
)
RETURNS TABLE (chunk_id uuid, document_id uuid, original_name text, citation text, page_number integer, content text, similarity double precision)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT c.id, d.id, d.original_name, d.citation, c.page_number, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d ON d.id = c.document_id
  WHERE d.status = 'approved' AND d.rag_indexed
    AND (include_private OR d.visibility = 'public')
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;
REVOKE ALL ON FUNCTION public.match_knowledge_chunks(extensions.vector, integer, double precision, boolean) FROM PUBLIC, anon, authenticated;

-- Private bucket for the original scientific documents (the existing verdedb bucket only allows images and is left unchanged).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('botanical-documents', 'botanical-documents', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
