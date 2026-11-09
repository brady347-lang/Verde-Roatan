do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using (coalesce((auth.jwt()->''app_metadata''->>''temporary_access_role''), '''') not in (''customer'', ''supplier'') or coalesce((auth.jwt()->''app_metadata''->>''temporary_access_expires_at'')::timestamptz > now(), false)) with check (coalesce((auth.jwt()->''app_metadata''->>''temporary_access_role''), '''') not in (''customer'', ''supplier'') or coalesce((auth.jwt()->''app_metadata''->>''temporary_access_expires_at'')::timestamptz > now(), false))',
      'temporary_account_expiry_guard', item.schemaname, item.tablename
    );
  end loop;
end $$;

create policy temporary_account_expiry_guard
on storage.objects as restrictive
for all to authenticated
using (
  coalesce((auth.jwt()->'app_metadata'->>'temporary_access_role'), '') not in ('customer', 'supplier')
  or coalesce((auth.jwt()->'app_metadata'->>'temporary_access_expires_at')::timestamptz > now(), false)
)
with check (
  coalesce((auth.jwt()->'app_metadata'->>'temporary_access_role'), '') not in ('customer', 'supplier')
  or coalesce((auth.jwt()->'app_metadata'->>'temporary_access_expires_at')::timestamptz > now(), false)
);