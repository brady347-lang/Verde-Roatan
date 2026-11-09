# Pending production database migrations

These SQL files are intentionally stored outside `supabase/migrations/` so Supabase CLI commands cannot apply them accidentally.

The production project's migration ledger contains 17 version IDs that do not fully match the checked-in legacy migration filenames. Some applied production migrations also have no matching source file in the repository. Until the migration history is reconciled and the missing source files are recovered, **do not run `supabase db push` against production**.

Before applying either pending migration:

1. Reconcile every checked-in migration with the exact applied version in `supabase_migrations.schema_migrations`.
2. Recover the source for the applied versions `20261108161439`, `20261108165627`, `20261108165711`, `20261108211210`, and `20261108211731`.
3. Confirm the production schema and function signatures against the migration source.
4. Apply the order lifecycle migration and checkout-ledger migration in a controlled release.
5. Verify a test checkout, order status progression, retry idempotency, payment confirmation and refund behavior.

The pending files also include removal of an older permissive product policy that currently bypasses the active-nursery visibility rule. The pending files are regression-tested as source, but they have **not** been applied to the live Supabase project.
