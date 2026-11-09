# RootWise — AI Task Handoff

This file is the shared handoff between ChatGPT and Claude. Keep entries concise, dated, and factual. Update it whenever a substantial task starts, becomes blocked, requests review, or completes.

## Current project status — 2026-11-07

- Repository: https://github.com/brady347-lang/Verde-Roatan
- Default branch inspected: `main`
- Collaboration bootstrap branch: `chore/rootwise-ai-collaboration-foundation`
- Current task: establish shared AI collaboration protocol and audit the botanical knowledge learning pipeline.
- Tracking Issue: #37 — https://github.com/brady347-lang/Verde-Roatan/issues/37
- Status: documentation bootstrap in progress.
- Implementation owner: ChatGPT (initial documentation setup).
- Reviewer: Claude (requested independent review after these files are available).
- Owner approval: product direction and collaboration setup approved. No production deployment, production database migration, or main-branch merge is approved by this entry.

## Verified repository observations
- React 19 + TypeScript + Vite 8 frontend.
- Express 4 server, Cloudflare Workers, Supabase/PostgreSQL, Capacitor 7.
- Gemini integration and protected Gemini Worker already exist.
- A separate no-Gemini Botanical Knowledge Core Worker already exists. Its code explicitly says deterministic retrieval and approved-source retrieval do not call Gemini.
- Knowledge Center and identification-review workflows already exist.
- Current inspected root contains no Python service or FastAPI application.
- CI workflow runs Worker syntax checks, Worker regression tests, TypeScript check, and Vite build.
- Main branch contains active Knowledge Core changes; avoid assuming older feature branches are current or safe to merge.

## ChatGPT audit result — 2026-11-07

- Audit report: `CATALOG_KNOWLEDGE_INGESTION_AUDIT.md`.
- Issue #37 contains the detailed source-path findings and acceptance tests.
- Confirmed: PlantEditModal calls Gemini and uses the response to prefill catalog fields, but does not retain/persist the full AI result as a knowledge candidate.
- Confirmed: catalog save/photo update writes to `products` and `product-images`; no Knowledge Core ingestion call occurs.
- Confirmed: PDF Knowledge Center, manually uploaded botanical reference photos, customer identification review, and pest/disease evidence are separate workflows.
- Confirmed: Knowledge Core Worker has no catalog observation route.
- Proposed additive design: idempotent catalog observation record, post-save submission through Knowledge Core, admin Catalog Learning review queue, and approved-only retrieval. Keep Gemini Worker protected and avoid duplicate Gemini calls.
- No code, database, Worker, secrets, deployment, or Android release changes were made during this audit.

## Next task for Claude
Independently review:
1. `ROOTWISE_MASTER_CONTEXT.md`
2. `AI_COLLABORATION_PROTOCOL.md`
3. `BOTANICAL_KNOWLEDGE_PROTOCOL.md`
4. This handoff file.

Independently inspect the current catalog create/edit/photo-upload path, Gemini identification response handling, and Knowledge Center ingestion path. Compare your findings with `CATALOG_KNOWLEDGE_INGESTION_AUDIT.md`. Report:
- Whether catalog photographs are currently ingested into the Knowledge Center automatically.
- Whether Gemini identification results from catalog uploads are persisted as source-linked candidate knowledge.
- Existing tables, storage buckets, Worker routes, and UI paths involved.
- Gaps and a minimal additive implementation proposal.
- Tests and migration/deployment requirements.

Do not change production resources or edit the protected Gemini Worker during this audit. Submit findings in a GitHub Issue or Pull Request and update this handoff.

## Next task for ChatGPT
After Claude's independent review, reconcile any differences, finalize the schema/API contract, and prepare an additive implementation PR. Do not modify production resources or deploy until separately approved.

## Completion record
No application source code, production database, Worker deployment, secrets, or Android release was changed as part of this documentation bootstrap.

## Claude review entry — 2026-11-07
- Task: independent review of catalog-photo / Gemini ingestion pipeline (Issue #37).
- Status: review complete; report in `CLAUDE_INDEPENDENT_REVIEW.md`. Appended only; ChatGPT's entries untouched.
- Result: confirms ChatGPT's findings. Adds: live DB has no `catalog_items` (only `products`); no taxon link; hardcoded admin email in `is_app_admin()`.
- Next owner: ChatGPT reconciles and finalizes schema/API contract. Nothing in production was changed; owner approval still required before any migration or deploy.

## Claude entry — 2026-11-09 (order integrity, ML consolidation, light meter)
- Task: reconcile PR #67 with main; consolidate #51/#54; reconcile #64 with the newer light pipeline; staged merge/deploy.
- Status: review requested. Implementation owner: Claude. Reviewer: owner.
- #67 (`fix/rootwise-order-ledger-integrity`): merged with main; pending SQL corrected (stock returned on cancellation, mismatched checkout-token reuse rejected, zone share-lock, cancelled customer_order ledger row closed). New real-Postgres suite `npm run test:orders` (16 tests, runs in CI). Pending migrations remain unapplied. **The app code fails closed until the checkout-ledger migration is live, so apply the DB migrations before releasing the app.** Live production schema and function signatures were inspected read-only and match the pending SQL; the repo's migration files still cannot be replayed from scratch (4 of 5 missing sources, e.g. 20261108165627, 20261108165711, 20261108211210, 20261108211731, are unrecovered).
- #73 (`integrate/ml-service-and-integration`): #51 + #54 consolidated; worker uses `X-API-Key` and `ROOTWISE_ML_SERVICE_URL`. Touches the locked Gemini Worker; merging auto-deploys it. Awaiting explicit owner approval of the lock change.
- #72 (light meter): merged. Supersedes #64 (ToolsScreen rewrite intentionally not applied; sensor diagnostics + lux smoothing ported).
- Production database, Workers and secrets were not changed by this work.
