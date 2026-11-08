-- PREPARED, NOT APPLIED. Owner approval is required before running this on the production project.
--
-- Adds optional bilingual and scientific fields to public.products. Every column is nullable and has no default,
-- so existing rows and the existing app keep working unchanged. Nothing is translated automatically: a column
-- stays NULL until a person enters a verified value. Scientific names are stored once and never localized.
begin;

alter table public.products
  add column if not exists name_es text,
  add column if not exists scientific_name text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists care_instructions_en text,
  add column if not exists care_instructions_es text,
  add column if not exists alternative_names_en text[],
  add column if not exists alternative_names_es text[];

comment on column public.products.name_es is 'Verified Spanish common name. NULL when none is verified; never machine-invented.';
comment on column public.products.scientific_name is 'Latin binomial. Not translated.';

-- Sizes are bounded so one admin edit cannot store an unbounded blob in a public catalog row.
alter table public.products
  add constraint products_bilingual_text_lengths check (
    coalesce(length(name_es), 0) <= 200
    and coalesce(length(scientific_name), 0) <= 200
    and coalesce(length(description_en), 0) <= 4000
    and coalesce(length(description_es), 0) <= 4000
    and coalesce(length(care_instructions_en), 0) <= 4000
    and coalesce(length(care_instructions_es), 0) <= 4000
  ) not valid;

-- Existing RLS applies unchanged: public SELECT of active rows, admin-only writes (is_app_admin()).
commit;

-- Rollback (manual):
--   alter table public.products drop constraint if exists products_bilingual_text_lengths;
--   alter table public.products drop column if exists name_es, drop column if exists scientific_name,
--     drop column if exists description_en, drop column if exists description_es,
--     drop column if exists care_instructions_en, drop column if exists care_instructions_es,
--     drop column if exists alternative_names_en, drop column if exists alternative_names_es;
