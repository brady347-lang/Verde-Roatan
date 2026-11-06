-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Additive foundation for curated botanical reference photographs.
-- The primary catalog, orders, inventory and customer data are not touched.
-- Photos are stored privately and exposed through short-lived signed URLs only
-- after a curator approves them for public visibility.

CREATE TABLE IF NOT EXISTS public.botanical_taxon_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxon_id uuid NOT NULL REFERENCES public.botanical_taxa(id) ON DELETE CASCADE,
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  storage_path text,
  image_type text NOT NULL DEFAULT 'mature_specimen'
    CHECK (image_type IN ('mature_specimen','foliage_detail','flower','fruit','bark','habitat','seedling','other')),
  source_name text,
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  attribution text,
  license text,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','rejected')),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','public')),
  uploaded_by_email text,
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT botanical_taxon_images_unique_url UNIQUE (taxon_id, image_url),
  CONSTRAINT botanical_taxon_images_has_source CHECK (image_url IS NOT NULL OR storage_path IS NOT NULL),
  CONSTRAINT botanical_taxon_images_public_requires_approval
    CHECK (visibility <> 'public' OR review_status = 'approved')
);

CREATE INDEX IF NOT EXISTS botanical_taxon_images_taxon_status_idx
  ON public.botanical_taxon_images (taxon_id, review_status, visibility);

ALTER TABLE public.botanical_taxon_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.botanical_taxon_images FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.botanical_taxon_images TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('botanical-reference-images', 'botanical-reference-images', false, 12582912,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.botanical_taxon_images IS
  'Curated reference photographs for botanical_taxa. Private storage is served with short-lived signed URLs only after approval; customer inventory photos remain in the primary project.';
