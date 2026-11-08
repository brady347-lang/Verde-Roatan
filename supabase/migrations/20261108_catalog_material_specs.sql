-- PREPARED, NOT APPLIED. Owner approval is required before running this on the production project.
-- Stores supplier-confirmed package volume and surface coverage for accurate landscaping estimates.
-- Existing products remain NULL and are never assigned inferred measurements.
begin;

alter table public.products
  add column if not exists material_spec jsonb;

comment on column public.products.material_spec is
  'Optional verified selling-unit specification: package_volume_liters, coverage_area_m2, and unit_label. Never infer from display text.';

alter table public.products
  drop constraint if exists products_material_spec_valid;

alter table public.products
  add constraint products_material_spec_valid check (
    material_spec is null
    or (
      jsonb_typeof(material_spec) = 'object'
      and (
        (
          material_spec ? 'package_volume_liters'
          and jsonb_typeof(material_spec->'package_volume_liters') = 'number'
          and (material_spec->>'package_volume_liters')::numeric > 0
        )
        or
        (
          material_spec ? 'coverage_area_m2'
          and jsonb_typeof(material_spec->'coverage_area_m2') = 'number'
          and (material_spec->>'coverage_area_m2')::numeric > 0
        )
      )
      and (
        not (material_spec ? 'unit_label')
        or (
          jsonb_typeof(material_spec->'unit_label') = 'string'
          and length(material_spec->>'unit_label') between 1 and 60
        )
      )
    )
  ) not valid;

commit;

-- Rollback (manual):
-- alter table public.products drop constraint if exists products_material_spec_valid;
-- alter table public.products drop column if exists material_spec;
