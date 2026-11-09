# RootWise — Catalog-to-Knowledge Learning Audit

**Audit date:** 2026-11-07  
**Repository branch inspected:** `main`  
**Scope:** Catalog plant/product photo flows, Gemini plant identification, existing identification feedback, Botanical Knowledge Center and Knowledge Core Worker.  
**Result:** Catalog photo and catalog Gemini outputs are not automatically ingested into the Botanical Knowledge Center.

## Executive summary

The repository has working building blocks, but they currently operate as separate workflows:

- Catalog plant photo selection can invoke Gemini and use its response to populate editable catalog fields.
- Catalog save persists the commercial catalog record and photo.
- Customer plant identification feedback is stored in a separate pending identification-review system.
- The PDF Knowledge Center extracts and indexes documents.
- Botanical reference photos are uploaded manually against an existing botanical taxon and reviewed separately.
- Pest/disease reports are submitted to the separate Knowledge Core Worker as private, pending evidence.

There is no automatic bridge from a catalog photo or its Gemini result to the Knowledge Core.

## Verified source paths

### Catalog plant photo and Gemini
- `src/components/PlantEditModal.tsx`
  - `runAutoBotanicalDetection` calls `analyzeBotanicalImage('plant', base64Data, lang)`.
  - It reads the first candidate and `verified_botanical_record`, then uses the result to populate name, scientific name, category, kind, salt tolerance, sunlight, watering, native status, description and tags.
  - The full response is not retained in the saved `CatalogItem`; the response is used as form-fill data.
- `src/App.tsx`
  - `handleSavePlant` calls `saveCatalogItem` and merges the returned catalog item into UI state.
  - No Knowledge Core call is made after save.

### Product photos and catalog persistence
- `src/components/ProductEditModal.tsx`
  - Compresses and previews product photos. It does not call Gemini.
- `src/services/api.ts`
  - `saveCatalogItem` writes the row to `public.products`.
  - For a data URL, it uploads the image to Supabase Storage bucket `product-images`, then patches `products.image_url`.
  - `uploadCatalogPhoto` / `uploadCatalogPhotoDataUrl` also upload and patch the catalog photo URL.
- `src/App.tsx`
  - `handleAdminPhotoUpdate` calls `uploadCatalogPhoto` and updates the catalog UI only.
  - `handleSaveProduct` mirrors the plant save flow, without botanical ingestion.

### Existing Knowledge Center
- `src/components/botanical/KnowledgeCenterPanel.tsx`
  - Uploads PDFs, extracts pages in the browser, sends pages for indexing, asks for fact extraction, and presents document/fact review.
- `src/services/api.ts`
  - Existing PDF and document methods call the Gemini Worker's `/knowledge/*` endpoints.
- `workers/verde-roatan-gemini-worker.js`
  - `KNOWLEDGE_ROUTES` includes document ingest/extract/list/document/review/retry/mark-failed/ask/promote and botanical reference-photo routes.
  - `knowledgeReferenceImageUpload` requires a valid `botanical_taxa` UUID and metadata such as image type, source, attribution and license.
  - It writes to `botanical-reference-images` and creates a pending `botanical_taxon_images` row.
  - The reference-photo workflow is manual and does not automatically link to a commercial catalog item.

### Plant identification feedback
- `src/services/api.ts` — `submitIdentificationFeedback`
  - Requires explicit user confirmation/correction and sends it to `/identification-review`.
- `workers/verde-roatan-gemini-worker.js` — `handleIdentificationReview`
  - Stores the original image privately in `identification-review-images`.
  - Creates a pending `identification_reviews` record and a related `identification_confirmations` record.
  - User confirmation is not scientific verification. This path is separate from catalog save and does not automatically publish into Knowledge Core.

### Pest/disease evidence
- `src/App.tsx` — `handleSubmitHealthEvidence`
- `workers/verde-botanical-knowledge-core-worker.js` — `submitHealthEvidence`
  - Stores evidence images privately in `botanical-health-evidence`.
  - Creates a pending, private, community-submitted `botanical_health_records` row with AI diagnosis details.
  - Public retrieval remains gated by review and indexing.

### Knowledge Core routes
The separate no-Gemini Worker currently exposes:
- `/health/submit`
- `/health/admin/create`
- `/health/admin/list`
- `/health/admin/review`
- `/knowledge/summaries/list`
- `/knowledge/summaries/create`
- `/knowledge/summaries/review`
- `/knowledge/search`

There is no catalog-photo or catalog-observation ingestion route.

## Data-model considerations

The inspected master migration defines both `public.products` and `public.catalog_items`. The inspected `saveCatalogItem` path writes to `public.products`. The commercial catalog and botanical taxonomy/reference-image system are separate domains. Their identifiers must not be assumed interchangeable.

Relevant image stores include:
- `product-images`: public commercial catalog images.
- `botanical-reference-images`: reviewed botanical reference images.
- `identification-review-images`: private customer identification evidence.
- `botanical-health-evidence`: private pest/disease evidence.

## Recommended additive architecture

### A. Capture a candidate result once
When `PlantEditModal` calls Gemini, retain a structured candidate payload in component state. Include:
- candidate common/scientific names and family;
- confidence and any returned database cross-check;
- useful description/care fields as claims, not established facts;
- model identifier and processing timestamp;
- image fingerprint and the form's eventual catalog item ID.

Do not call Gemini a second time simply to feed the Knowledge Center.

### B. Persist only after successful catalog save
After `saveCatalogItem` has confirmed the database row and permanent photo URL:
- submit the catalog item ID and image reference;
- include the captured Gemini candidate payload when available;
- record uploader identity/role, source, time, item type and a stable photo fingerprint;
- do not create a false observation if the catalog row or photo upload failed.

For photo updates without a Gemini result, create an image-only observation or offer an explicit optional analysis action. Exclude non-plant products from botanical learning unless an administrator explicitly classifies them as botanical specimens.

### C. Add a dedicated observation record
Preferred first implementation: a new `botanical_catalog_observations` table (name subject to schema review) with:
- UUID primary key;
- catalog product/item ID and source table;
- photo URL/storage object path and SHA-256 fingerprint;
- captured AI candidate JSON and model metadata;
- optional matched `botanical_taxa` ID;
- review status, verification status and visibility;
- submitted/reviewed timestamps and reviewer;
- supersedes/previous-observation link for photo replacement;
- idempotency constraint on catalog item + image fingerprint.

This preserves the distinction between commercial catalog data and botanical taxonomic knowledge. A reviewed observation can subsequently be linked to `botanical_taxon_images` and/or approved curated knowledge.

### D. Add an admin review queue
Add a Catalog Learning tab to the existing Botanical Knowledge Center. Display:
- actual catalog photo and catalog record;
- AI identification and confidence;
- cross-check evidence;
- review/edit/correct actions;
- source/verification labels;
- explicit approve/reject and visibility controls.

Approval for RAG/public use must remain separate from scientific verification. An AI result or a catalog administrator's save must not silently become scientifically verified.

### E. Keep Knowledge Core deterministic
The Knowledge Core should authenticate the caller, validate and persist evidence, enforce idempotency and review gates, and expose only approved/indexed records to retrieval. It should not call Gemini. Existing document, Constitution, identification-review and health-evidence workflows remain intact.

## Implementation order

1. Schema design and migration draft only; inspect existing deployed/review database schema before applying.
2. Add authenticated catalog-observation endpoint to the Knowledge Core Worker, plus unit tests.
3. Retain plant form Gemini result and submit it after successful catalog save.
4. Add image-only observation support for authorized catalog photo updates, avoiding non-plant products.
5. Add Catalog Learning admin review UI and review operations.
6. Extend approved retrieval only after review/schema tests demonstrate correct provenance and visibility.
7. Run Worker regression tests, TypeScript check, Vite build, and Android regression tests.
8. Production migration, Worker deployment and Android release remain separate explicit approval gates.

## Acceptance tests

- Plant photo plus successful save creates exactly one pending candidate observation.
- Candidate includes source catalog ID, permanent image reference, fingerprint and Gemini model/provenance.
- A failed save or failed photo upload creates no false successful observation.
- Retry is idempotent.
- Photo replacement preserves prior observation and records the new image version.
- Product/non-botanical images are excluded.
- Manual plant photo without Gemini result is retained as image-only evidence.
- Pending/rejected observations never enter public search.
- Approved observations appear with source and catalog provenance.
- Scientific verification requires an explicit reviewer decision and written evidence basis.
- Existing Gemini identification, catalog, PDF ingestion, reference photo, health evidence, Knowledge Core and Android workflows pass regression tests.

## Audit boundary

This was a read-only source audit. No application code, production database, Cloudflare Worker, secrets, deployment or Android release was changed.
