-- Supplier onboarding, single-use activation codes, and listing moderation.
-- Applied to production project tjzqxsyxvfdabfguezmu on 2026-11-08.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists private.supplier_activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  constraint supplier_activation_code_expiry check (expires_at > created_at)
);
alter table private.supplier_activation_codes enable row level security;
revoke all on private.supplier_activation_codes from public, anon, authenticated;

create table if not exists public.supplier_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  activation_code_id uuid not null unique references private.supplier_activation_codes(id),
  business_name text not null check (length(trim(business_name)) between 2 and 160),
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  phone text not null check (length(trim(phone)) between 5 and 40),
  email text not null check (length(trim(email)) between 3 and 254),
  island_location text not null check (length(trim(island_location)) between 2 and 120),
  physical_address text,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected','suspended')),
  supplier_id uuid references public.suppliers(id),
  nursery_id uuid references public.nurseries(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.supplier_applications enable row level security;
revoke all on public.supplier_applications from anon, public;
grant select, insert, update, delete on public.supplier_applications to authenticated;
drop policy if exists "Users read own supplier application" on public.supplier_applications;
create policy "Users read own supplier application"
  on public.supplier_applications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Admins manage supplier applications" on public.supplier_applications;
create policy "Admins manage supplier applications"
  on public.supplier_applications for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

alter table public.products
  add column if not exists listing_status text not null default 'pending_review'
    check (listing_status in ('pending_review','approved','rejected','suspended')),
  add column if not exists image_review_status text not null default 'pending'
    check (image_review_status in ('pending','approved','needs_replacement','rejected')),
  add column if not exists image_review_notes text,
  add column if not exists listing_review_notes text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

create or replace function public.guard_supplier_owned_records()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_admin() then return new; end if;
  if tg_table_name = 'nurseries' then
    if tg_op = 'INSERT' then
      if new.is_active then raise exception 'New supplier nurseries must remain inactive until administrator approval'; end if;
    elsif new.is_active is distinct from old.is_active then
      raise exception 'Only an administrator may activate or deactivate a nursery';
    end if;
  elsif tg_table_name = 'products' then
    if tg_op = 'INSERT' then
      new.is_active := false;
      new.listing_status := 'pending_review';
      new.image_review_status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      if new.is_active is distinct from old.is_active
        or new.listing_status is distinct from old.listing_status
        or new.image_review_status is distinct from old.image_review_status
        or new.reviewed_by is distinct from old.reviewed_by
        or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Only an administrator may change listing or image approval status';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_supplier_nursery_approval on public.nurseries;
create trigger guard_supplier_nursery_approval before insert or update on public.nurseries
for each row execute function public.guard_supplier_owned_records();
drop trigger if exists guard_supplier_product_approval on public.products;
create trigger guard_supplier_product_approval before insert or update on public.products
for each row execute function public.guard_supplier_owned_records();

create or replace function public.issue_supplier_activation_code(p_valid_hours integer default 72)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required'; end if;
  if p_valid_hours < 1 or p_valid_hours > 720 then raise exception 'Validity must be between 1 and 720 hours'; end if;
  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  insert into private.supplier_activation_codes(code_hash, created_by, expires_at)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + make_interval(hours => p_valid_hours));
  return v_code;
end;
$$;
revoke all on function public.issue_supplier_activation_code(integer) from public, anon;
grant execute on function public.issue_supplier_activation_code(integer) to authenticated;

create or replace function public.redeem_supplier_activation_code(
  p_code text, p_business_name text, p_contact_name text, p_phone text,
  p_email text, p_island_location text, p_physical_address text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code private.supplier_activation_codes%rowtype;
  v_application_id uuid;
  v_user_id uuid := auth.uid();
  v_hash text;
begin
  if v_user_id is null then raise exception 'Sign in before activating a supplier account'; end if;
  if p_code is null or length(trim(p_code)) < 16 or length(trim(p_code)) > 80 then
    raise exception 'Activation code is invalid or expired';
  end if;
  if exists (select 1 from public.supplier_applications where user_id = v_user_id) then
    raise exception 'A supplier application already exists for this account';
  end if;
  v_hash := encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
  select * into v_code from private.supplier_activation_codes
  where code_hash = v_hash and redeemed_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'Activation code is invalid, expired, or already used'; end if;
  insert into public.supplier_applications(
    user_id, activation_code_id, business_name, contact_name, phone, email, island_location, physical_address
  ) values (
    v_user_id, v_code.id, trim(p_business_name), trim(p_contact_name), trim(p_phone),
    lower(trim(p_email)), trim(p_island_location), nullif(trim(coalesce(p_physical_address, '')), '')
  ) returning id into v_application_id;
  update private.supplier_activation_codes set redeemed_by = v_user_id, redeemed_at = now() where id = v_code.id;
  return jsonb_build_object('application_id', v_application_id, 'status', 'pending_review',
    'message', 'Supplier application submitted. Listings remain private until administrator approval.');
end;
$$;
revoke all on function public.redeem_supplier_activation_code(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.redeem_supplier_activation_code(text,text,text,text,text,text,text) to authenticated;

create or replace function public.finalize_supplier_application_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_supplier_id uuid; v_nursery_id uuid;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if not public.is_app_admin() then raise exception 'Only an administrator can approve a supplier application'; end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    insert into public.suppliers(legal_name, display_name, contact_person, phone, email, physical_address, island_location, is_active)
    values (new.business_name, new.business_name, new.contact_name, new.phone, new.email, new.physical_address, new.island_location, true)
    returning id into v_supplier_id;
    insert into public.nurseries(owner_id, name, description, phone, address, is_active)
    values (new.user_id, new.business_name, 'Supplier nursery account approved by Verde Roatán administrator.',
      new.phone, coalesce(new.physical_address, new.island_location), false)
    returning id into v_nursery_id;
    update public.profiles set role = 'nursery_owner' where id = new.user_id;
    new.supplier_id := v_supplier_id;
    new.nursery_id := v_nursery_id;
  elsif new.status in ('rejected','suspended') and old.status is distinct from new.status then
    if not public.is_app_admin() then raise exception 'Only an administrator can change supplier application status'; end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists finalize_supplier_application_approval on public.supplier_applications;
create trigger finalize_supplier_application_approval before update of status on public.supplier_applications
for each row execute function public.finalize_supplier_application_approval();

create or replace function public.set_supplier_application_review_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_admin() then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists supplier_application_review_metadata on public.supplier_applications;
create trigger supplier_application_review_metadata before update on public.supplier_applications
for each row execute function public.set_supplier_application_review_metadata();

revoke all on function public.guard_supplier_owned_records() from public, anon, authenticated;
revoke all on function public.finalize_supplier_application_approval() from public, anon, authenticated;
revoke all on function public.set_supplier_application_review_metadata() from public, anon, authenticated;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

comment on table public.supplier_applications is 'Supplier onboarding applications. Applicants can read only their own row; administrators control review.';
comment on table private.supplier_activation_codes is 'Single-use supplier activation codes stored only as SHA-256 hashes; inaccessible to client roles.';
comment on column public.products.listing_status is 'Administrator-controlled supplier listing moderation state; owners cannot self-approve.';
comment on column public.products.image_review_status is 'Administrator-controlled image moderation state. Automated image scoring is not yet connected.';
