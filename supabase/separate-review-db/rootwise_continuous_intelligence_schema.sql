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
    'pending','processing','corroborated','needs_review','rejected','failed'
  )),
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
create index if not exists botanical_evidence_queue_ready_idx
  on public.botanical_evidence_queue(status, available_at, created_at)
  where status in ('pending','failed');
create index if not exists botanical_evidence_queue_subject_idx
  on public.botanical_evidence_queue(subject_key, created_at desc);

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

commit;
