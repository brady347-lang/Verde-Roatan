alter table public.products
  add column if not exists photo_quality_score integer,
  add column if not exists photo_quality_status text not null default 'not_checked'
    check (photo_quality_status in ('not_checked','acceptable','needs_attention')),
  add column if not exists photo_quality_notes text,
  add column if not exists photo_width integer,
  add column if not exists photo_height integer,
  add column if not exists photo_file_size_bytes bigint;

alter table public.products
  drop constraint if exists products_active_requires_approval;
alter table public.products
  add constraint products_active_requires_approval
  check (is_active = false or (listing_status = 'approved' and image_review_status = 'approved')) not valid;

comment on column public.products.photo_quality_score is
  'Client-side image quality heuristic score (0-100); advisory and never a substitute for admin review.';
comment on column public.products.photo_quality_status is
  'Automated technical photo checks only; botanical relevance is separately suggested by RootWise Intelligence.';