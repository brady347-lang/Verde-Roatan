-- Verde Roatan: plant-identification review records
-- TARGET: the separate "Verde Roatan DB" project only.
-- Expected project ref: moaqgqbqfeckeabigfha
-- DO NOT run this file against the established production database.
--
-- This script is intentionally limited to review/confirmation data and a private
-- image bucket. It does not alter products, orders, inventory, or the main catalog.

create extension if not exists pgcrypto;

create or replace function public.is_verde_review_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

grant execute on function public.is_verde_review_admin() to authenticated;

create table if not exists public.identification_reviews (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  image_path text not null,
  identification_mode text not null default 'plant'
    check (identification_mode in ('plant', 'pest')),
  ai_common_name text,
  ai_scientific_name text,
  ai_confidence numeric(5,4)
    check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  proposed_common_name text,
  proposed_scientific_name text,
  submitter_notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identification_reviews_status_created_idx
  on public.identification_reviews (status, created_at desc);
create index if not exists identification_reviews_submitter_created_idx
  on public.identification_reviews (submitted_by, created_at desc);

create table if not exists public.identification_confirmations (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.identification_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('confirmed', 'corrected')),
  corrected_common_name text,
  corrected_scientific_name text,
  notes text,
  created_at timestamptz not null default now(),
  constraint identification_confirmations_one_per_user
    unique (review_id, user_id)
);

create index if not exists identification_confirmations_review_idx
  on public.identification_confirmations (review_id, created_at desc);

create or replace function public.set_identification_review_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists identification_reviews_updated_at
  on public.identification_reviews;
create trigger identification_reviews_updated_at
before update on public.identification_reviews
for each row execute function public.set_identification_review_updated_at();

alter table public.identification_reviews enable row level security;
alter table public.identification_confirmations enable row level security;

drop policy if exists "review owners and admins can read reviews"
  on public.identification_reviews;
create policy "review owners and admins can read reviews"
on public.identification_reviews
for select to authenticated
using (submitted_by = auth.uid() or public.is_verde_review_admin());

drop policy if exists "authenticated users can submit reviews"
  on public.identification_reviews;
create policy "authenticated users can submit reviews"
on public.identification_reviews
for insert to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "admins can update reviews"
  on public.identification_reviews;
create policy "admins can update reviews"
on public.identification_reviews
for update to authenticated
using (public.is_verde_review_admin())
with check (public.is_verde_review_admin());

drop policy if exists "admins can delete reviews"
  on public.identification_reviews;
create policy "admins can delete reviews"
on public.identification_reviews
for delete to authenticated
using (public.is_verde_review_admin());

drop policy if exists "users and admins can read confirmations"
  on public.identification_confirmations;
create policy "users and admins can read confirmations"
on public.identification_confirmations
for select to authenticated
using (user_id = auth.uid() or public.is_verde_review_admin());

drop policy if exists "users can submit their own confirmation"
  on public.identification_confirmations;
create policy "users can submit their own confirmation"
on public.identification_confirmations
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.identification_reviews r
    where r.id = review_id
      and (r.submitted_by = auth.uid() or public.is_verde_review_admin())
  )
);

drop policy if exists "admins can delete confirmations"
  on public.identification_confirmations;
create policy "admins can delete confirmations"
on public.identification_confirmations
for delete to authenticated
using (public.is_verde_review_admin());

grant select, insert, update, delete
  on public.identification_reviews to authenticated;
grant select, insert, delete
  on public.identification_confirmations to authenticated;

-- Private storage: each authenticated user may upload/read/delete only within
-- their own UUID folder. Admins may read and manage all review images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identification-review-images',
  'identification-review-images',
  false,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own identification review images"
  on storage.objects;
create policy "users upload own identification review images"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'identification-review-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users read own and admins read all review images"
  on storage.objects;
create policy "users read own and admins read all review images"
on storage.objects
for select to authenticated
using (
  bucket_id = 'identification-review-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_verde_review_admin()
  )
);

drop policy if exists "users delete own and admins delete review images"
  on storage.objects;
create policy "users delete own and admins delete review images"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'identification-review-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_verde_review_admin()
  )
);
