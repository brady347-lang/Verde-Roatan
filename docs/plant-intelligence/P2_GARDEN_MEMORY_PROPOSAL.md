# P2: Garden Intelligence storage (PROPOSAL, nothing applied)

Finding: the existing `public.rootwise_user_memory` table (empty, 0 rows) already has what is needed:
user_id, memory_type, payload jsonb, device_id, revision, deleted_at, owner-only RLS for select/insert/update/delete, plus the temporary-account guards.
No new table and no RLS change are required.

Client mapping: `src/lib/gardenMemory.ts` (memory types garden_plant, garden_observation, light_reading; no inline images; payload cap 16 KB; newest revision wins; tombstones respected).

## Optional migration for review (NOT applied)
```sql
-- Enables safe upsert per device-local record and restricts memory_type values. Does not touch RLS.
alter table public.rootwise_user_memory
  add constraint rootwise_user_memory_type_check
  check (memory_type in ('garden_plant','garden_observation','light_reading')) not valid;
create unique index if not exists rootwise_user_memory_record_uidx
  on public.rootwise_user_memory (user_id, memory_type, (payload->>'local_id'));
```
Because the table is empty, `not valid` can be validated immediately afterwards.

## Privacy
These rows are private. Shared learning only via `canEnterBotanicalMemory()` (consent + anonymized + reviewer approved + no private fields).
