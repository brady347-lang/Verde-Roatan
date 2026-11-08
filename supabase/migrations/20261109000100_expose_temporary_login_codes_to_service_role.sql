alter table private.temporary_login_codes set schema public;
revoke all on table public.temporary_login_codes from anon, authenticated;
grant all on table public.temporary_login_codes to service_role;
alter table public.temporary_login_codes enable row level security;