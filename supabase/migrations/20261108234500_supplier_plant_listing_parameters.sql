alter table public.products
  add column if not exists size text,
  add column if not exists salt_tolerance_rating integer check (salt_tolerance_rating between 1 and 3),
  add column if not exists sunlight_requirement text,
  add column if not exists watering_instructions text,
  add column if not exists pet_safety text check (pet_safety in ('safe','check','toxic')),
  add column if not exists native_to_bay_islands boolean,
  add column if not exists tags text[];