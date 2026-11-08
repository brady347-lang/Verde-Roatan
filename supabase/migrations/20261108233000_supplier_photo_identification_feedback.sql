alter table public.products
  add column if not exists ai_identified_common_name text,
  add column if not exists ai_identified_scientific_name text,
  add column if not exists ai_identification_confidence numeric(5,2),
  add column if not exists ai_identification_model text,
  add column if not exists ai_identification_status text not null default 'not_run'
    check (ai_identification_status in ('not_run','identified','uncertain','reported_incorrect'));

create table if not exists public.supplier_identification_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_user_id uuid not null references auth.users(id) on delete cascade,
  ai_common_name text,
  ai_scientific_name text,
  corrected_common_name text,
  corrected_scientific_name text,
  report_notes text not null,
  image_url text,
  status text not null default 'pending_review'
    check (status in ('pending_review','reviewed','resolved','dismissed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint supplier_identification_report_notes_nonempty check (length(trim(report_notes)) > 0)
);

create index if not exists supplier_identification_reports_product_idx
  on public.supplier_identification_reports(product_id, created_at desc);
create index if not exists supplier_identification_reports_status_idx
  on public.supplier_identification_reports(status, created_at desc);

alter table public.supplier_identification_reports enable row level security;

drop policy if exists "Suppliers read own identification reports" on public.supplier_identification_reports;
create policy "Suppliers read own identification reports"
  on public.supplier_identification_reports for select to authenticated
  using (supplier_user_id = (select auth.uid()) or public.is_app_admin());

drop policy if exists "Suppliers submit own identification reports" on public.supplier_identification_reports;
create policy "Suppliers submit own identification reports"
  on public.supplier_identification_reports for insert to authenticated
  with check (
    supplier_user_id = (select auth.uid())
    and exists (
      select 1 from public.products p
      left join public.nurseries n on n.id = p.nursery_id
      where p.id = product_id
        and (p.created_by = (select auth.uid()) or n.owner_id = (select auth.uid()))
    )
  );

drop policy if exists "Admins manage identification reports" on public.supplier_identification_reports;
create policy "Admins manage identification reports"
  on public.supplier_identification_reports for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

grant select, insert on public.supplier_identification_reports to authenticated;
revoke all on public.supplier_identification_reports from anon;

comment on table public.supplier_identification_reports is
  'Supplier-submitted reports that RootWise botanical photo identification was incorrect; retained for admin review and model-quality feedback.';
comment on column public.products.ai_identification_confidence is
  'Confidence score returned by botanical intelligence; informational only and not an approval signal.';
