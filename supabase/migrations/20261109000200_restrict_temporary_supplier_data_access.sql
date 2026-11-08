do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('products', 'nurseries', 'supplier_identification_reports')
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using (coalesce((auth.jwt()->''app_metadata''->>''temporary_access_role''), '''') <> ''supplier'') with check (coalesce((auth.jwt()->''app_metadata''->>''temporary_access_role''), '''') <> ''supplier'')',
      'temporary_supplier_workspace_only', item.schemaname, item.tablename
    );
  end loop;
end $$;

create policy temporary_supplier_product_images_only
on storage.objects as restrictive
for all to authenticated
using (
  coalesce((auth.jwt()->'app_metadata'->>'temporary_access_role'), '') <> 'supplier'
  or (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
)
with check (
  coalesce((auth.jwt()->'app_metadata'->>'temporary_access_role'), '') <> 'supplier'
  or (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
);