-- RootWise continuous intelligence evidence queue and durable reference archive.
-- TARGET: separate botanical review/knowledge project only (moaqgqbqfeckeabigfha).
-- Never run against the primary shop/orders project.
begin;

create table if not exists public.botanical_evidence_queue (
  id uuid primary key default gen_random_uuid(),
  evidence_type text not null check (evidence_type in (
    'catalog_photo','catalog_record','plant_identification','pest_disease_identification',
    'community_correction','document','field_observation'
  )),
  source_system text not null,
  source_record_id text,
  subject_key text,
  submitted_payload jsonb not null default '{}'::jsonb,
  evidence_fingerprint text not null unique,
  status text not null default 'pending' check (status in (
    'pending','processing','corroborated','needs_review','rejected','failed','admin_approved'
  )),
  approval_status text not null default 'pending' check (approval_status in ('pending','admin_approved','community_corroborated','rejected')),
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  approval_note text,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  model_name text,
  model_result jsonb,
  verification_status text not null default 'community_submitted' check (verification_status in (
    'community_submitted','ai_suggested','source_supported','corroborated','scientifically_verified'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
-- Safe on an already-created queue: the migration may be applied after the original foundation.
alter table public.botanical_evidence_queue
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid,
  add column if not exists approved_by_email text,
  add column if not exists approved_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approval_note text;
alter table public.botanical_evidence_queue drop constraint if exists botanical_evidence_queue_status_check;
alter table public.botanical_evidence_queue add constraint botanical_evidence_queue_status_check
  check (status in ('pending','processing','corroborated','needs_review','rejected','failed','admin_approved'));
alter table public.botanical_evidence_queue drop constraint if exists botanical_evidence_queue_approval_status_check;
alter table public.botanical_evidence_queue add constraint botanical_evidence_queue_approval_status_check
  check (approval_status in ('pending','admin_approved','community_corroborated','rejected'));
create index if not exists botanical_evidence_queue_ready_idx
  on public.botanical_evidence_queue(status, available_at, created_at)
  where status in ('pending','failed');
create index if not exists botanical_evidence_queue_subject_idx
  on public.botanical_evidence_queue(subject_key, created_at desc);

-- Atomically lease a batch. SKIP LOCKED lets overlapping scheduled runs
-- work on different rows without ever processing the same evidence twice.
create or replace function public.claim_botanical_evidence_batch(p_batch_size integer default 10)
returns setof public.botanical_evidence_queue
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select id
    from public.botanical_evidence_queue
    where status in ('pending', 'failed')
      and attempts < 5
      and available_at <= now()
    order by created_at asc
    limit greatest(1, least(coalesce(p_batch_size, 10), 25))
    for update skip locked
  )
  update public.botanical_evidence_queue as queue
  set status = 'processing',
      locked_at = now(),
      attempts = queue.attempts + 1
  from candidates
  where queue.id = candidates.id
  returning queue.*;
$$;
revoke all on function public.claim_botanical_evidence_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_botanical_evidence_batch(integer) to service_role;

-- Independent community votes are unique per evidence item and authenticated user.
create table if not exists public.botanical_evidence_votes (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.botanical_evidence_queue(id) on delete cascade,
  user_id uuid not null,
  vote text not null check (vote in ('support','flag')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evidence_id, user_id)
);
create index if not exists botanical_evidence_votes_evidence_idx
  on public.botanical_evidence_votes(evidence_id, vote);
alter table public.botanical_evidence_votes enable row level security;
revoke all on public.botanical_evidence_votes from anon, authenticated;
grant select, insert, update, delete on public.botanical_evidence_votes to service_role;


create table if not exists public.botanical_reference_images (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_record_id text,
  source_name text,
  scientific_name text,
  image_url text not null,
  image_storage_path text,
  image_fingerprint text,
  evidence_status text not null default 'community_submitted' check (evidence_status in (
    'community_submitted','ai_suggested','source_supported','corroborated','scientifically_verified'
  )),
  is_reference_eligible boolean not null default false,
  verification_basis text,
  source_metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_system, source_record_id, image_url)
);
create index if not exists botanical_reference_images_name_idx
  on public.botanical_reference_images(scientific_name, evidence_status);
create index if not exists botanical_reference_images_eligible_idx
  on public.botanical_reference_images(scientific_name, created_at desc)
  where is_reference_eligible = true;

create or replace function public.set_botanical_evidence_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists botanical_evidence_queue_updated_at on public.botanical_evidence_queue;
create trigger botanical_evidence_queue_updated_at before update on public.botanical_evidence_queue
for each row execute function public.set_botanical_evidence_updated_at();

alter table public.botanical_evidence_queue enable row level security;
alter table public.botanical_reference_images enable row level security;
revoke all on public.botanical_evidence_queue from anon, authenticated;
revoke all on public.botanical_reference_images from anon, authenticated;
grant select, insert, update, delete on public.botanical_evidence_queue to service_role;
grant select, insert, update, delete on public.botanical_reference_images to service_role;


create table if not exists public.botanical_engine_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('idle','completed','failed')),
  evidence_reviewed integer not null default 0,
  escalated integer not null default 0,
  corroborated integer not null default 0,
  failed integer not null default 0,
  error_summary text,
  created_at timestamptz not null default now()
);
create index if not exists botanical_engine_runs_started_idx on public.botanical_engine_runs(started_at desc);
alter table public.botanical_engine_runs enable row level security;
revoke all on public.botanical_engine_runs from anon, authenticated;
grant select, insert on public.botanical_engine_runs to service_role;

commit;
