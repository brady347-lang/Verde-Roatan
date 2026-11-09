# Claude independent review — catalog photo & Gemini ingestion pipeline

Date: 2026-11-07 · Reviewer: Claude · Implementation owner: ChatGPT · Issue: #37 · Base: PR #38
Scope: read-only. No production, Worker, migration, secret or deploy changes were made for this review.

## 1. Answers to the handoff questions
1. **Catalog photos auto-ingested into the Knowledge Center?** No. Confirmed independently. `PlantEditModal` → `saveCatalogItem` (`src/services/api.ts`) writes `products` rows and uploads to the `product-images` bucket only.
2. **Gemini results from catalog uploads persisted as source-linked candidate knowledge?** No. `PlantEditModal` calls `analyzeBotanicalImage('plant', …)` and uses the result only to prefill form fields; it is discarded on save.
3. **Tables / buckets / routes / UI involved:** table `products`; bucket `product-images`; Gemini Worker `analyze` route (locked); admin Knowledge Center UI and Knowledge Core Worker are separate, with no catalog route.
4. Findings below agree with `CATALOG_KNOWLEDGE_INGESTION_AUDIT.md`; no contradictions found.

## 2. Additional findings (not in the first audit)
- **Live DB drift:** the live main Supabase project has **no `catalog_items` table**, only `products`, while the repo master migration defines both. Any design that targets `catalog_items` would fail live. Target `products` (or reconcile the migration first).
- **No taxon link:** catalog items have no foreign key to `botanical_taxa`, so a catalog observation cannot yet be tied to a published species record.
- **Admin check hardcodes an owner email:** `is_app_admin()` returns true for `app_metadata.role = 'admin'` OR a hardcoded email. Low risk, but recommend relying only on the role claim once confirmed. The client-side `isAdmin` in `src/App.tsx` also requires a real access token.
- **Catalog 403 saves (admin screen):** edge logs show `POST /rest/v1/products` 403 for a period, then 200/201 after a fresh sign-in. RLS allows writes only for `is_app_admin()`, so the likely cause is a stale or non-admin session (the second account is a customer). Not caused by the recent security hardening. Suggested improvement: show the signed-in account and prompt re-login on a 403.

## 3. Opportunities to improve botanical intelligence (additive)
1. Retain the Gemini candidate once (no second Gemini call): store it with the save, labelled `ai_candidate`.
2. Post-save, idempotent observation record (key: product id + image hash) submitted through the Knowledge Core Worker, not the Gemini Worker.
3. Admin **Catalog Learning** review queue; only approved items move to `source_supported`; user/admin confirmation never equals `scientifically_verified`.
4. Retrieval uses approved records only; candidates never reach Ask.
5. Usage instrumentation (documents vs Gemini answers) so the "90% internal / 10% Gemini" goal is measurable.
6. Python ML later, once approved, labelled observations exist.

## 4. Requirements
- Migration (additive): observation table + RLS (admin write, service role review), approved-only view. Needs separate owner approval to apply.
- Worker: new route in the Knowledge Core Worker; Gemini Worker stays locked.
- Tests: idempotency, approved-only retrieval, RLS denial for non-admin, no Gemini call on save.

## 5. Verification performed
Read PR #38 docs and Issue #37; inspected source paths above; queried live schema, RLS policies and edge logs read-only. Repo tests were not re-run (docs-only change).
