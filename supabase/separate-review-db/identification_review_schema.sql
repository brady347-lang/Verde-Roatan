-- Verde Roatan: plant-identification review records
-- TARGET: separate "Verde Roatan DB" project only.
-- Expected project ref: moaqgqbqfeckeabigfha
-- NEVER run against the established production catalog/orders project.
--
-- Access model: the app calls the Cloudflare Gemini Worker. That worker verifies
-- the user's JWT against the primary project and writes here with a server-only
-- service-role key. No customer JWT is accepted directly by this project.

create extension if not exists pgcrypto;

create table if not exists public.identification_reviews (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null,
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
  reviewed_by uuid,
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
  user_id uuid not null,
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

-- No direct anon/authenticated access. Only the Cloudflare Worker service role
-- accesses these tables after verifying the user's primary-project session.
alter table public.identification_reviews enable row level security;
alter table public.identification_confirmations enable row level security;

drop policy if exists "review owners and admins can read reviews" on public.identification_reviews;
drop policy if exists "authenticated users can submit reviews" on public.identification_reviews;
drop policy if exists "admins can update reviews" on public.identification_reviews;
drop policy if exists "admins can delete reviews" on public.identification_reviews;
drop policy if exists "users and admins can read confirmations" on public.identification_confirmations;
drop policy if exists "users can submit their own confirmation" on public.identification_confirmations;
drop policy if exists "admins can delete confirmations" on public.identification_confirmations;

revoke all on public.identification_reviews from anon, authenticated;
revoke all on public.identification_confirmations from anon, authenticated;
grant select, insert, update, delete on public.identification_reviews to service_role;
grant select, insert, update, delete on public.identification_confirmations to service_role;

-- Private evidence photos. The service role is the only permitted API writer/reader.
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

drop policy if exists "users upload own identification review images" on storage.objects;
drop policy if exists "users read own and admins read all review images" on storage.objects;
drop policy if exists "users delete own and admins delete review images" on storage.objects;

-- No anon/authenticated storage policies are created. Cloudflare uses service_role.
