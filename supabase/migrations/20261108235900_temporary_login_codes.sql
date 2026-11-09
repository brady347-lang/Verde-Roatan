create table if not exists private.temporary_login_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  access_role text not null check (access_role in ('customer','supplier')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table private.temporary_login_codes enable row level security;
revoke all on table private.temporary_login_codes from anon, authenticated;
grant all on table private.temporary_login_codes to service_role;

create index if not exists temporary_login_codes_active_idx
  on private.temporary_login_codes (expires_at)
  where revoked_at is null;

comment on table private.temporary_login_codes is
  'Hashed, reusable RootWise temporary access codes. Codes are role-scoped and expire after 30 days. Accessible only to the Edge Function service role.';
