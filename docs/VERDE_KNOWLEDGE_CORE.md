# Verde Knowledge Core — Development Plan

## Purpose
Make Verde's approved botanical knowledge, retrieval and Constitution the primary intelligence layer. Gemini is an optional assistant for image interpretation and document summarization, not the authority or retrieval dependency.

## Protected systems
- Do not edit or redeploy `workers/verde-roatan-gemini-worker.js`.
- Do not overwrite existing raw `knowledge_chunks`, PDFs, `knowledge_entities`, published taxa or Constitution rules.
- Do not change production Supabase until the review-project migration is approved.
- The existing Constitution Worker remains separate. New functionality will be introduced additively and regression-tested.

## Existing capabilities confirmed
- `botanical_taxa`: structured plant reference records with deterministic PostgreSQL search and care summaries.
- `KnowledgeCenterPanel`: PDF upload, page extraction, fact extraction/review, document approval, raw chunk indexing, reference-photo review and a retrieval playground. These workflows are retained.
- `knowledge_documents`, `knowledge_entities`, `knowledge_chunks`: original documents, extracted facts and existing RAG chunks.
- `search_knowledge_text()`: lexical search over approved raw document chunks.
- `match_knowledge_chunks()`: vector search over approved raw chunks.
- Identification Review Queue: customer confirmations/corrections, pending/approved/rejected states and administrator scientific-verification workflow. Audit found the submission route hard-codes `identification_mode: 'plant'`; the app feedback API rejects pest mode, so it is not a pest/disease evidence workflow.
- Constitution: locked core rules, versioned amendments, admin-only self-study, and a no-AI lexical question route over existing raw chunks and published plant taxa.
- Existing document ingestion embeds original extracted text; this is retained as source evidence, not silently replaced.

## New curated layer (migration draft only)
1. `knowledge_document_summaries`: versioned summaries, structured key facts, critical treatment details, safety warnings, source pages, generation metadata and independent admin review.
2. `knowledge_curated_chunks`: concise RAG chunks derived from an approved summary; optional 768-dimensional embeddings; original page provenance.
3. `botanical_health_records`: first-class pest and disease records with symptoms, host plants, identification features, causes, treatments, prevention, safety warnings, evidence, image reference, visibility and review status.
4. `botanical_health_record_taxa`: explicit relationship to published plant taxa.
5. `search_verde_knowledge()`: additive lexical retrieval over approved curated document chunks and approved/indexed health records. Existing search RPCs remain intact.
6. Private `botanical-health-evidence` storage bucket.

## Verification model
- AI identified
- Community submitted / user confirmed
- Source supported
- Scientifically verified

Approval for public/RAG use and scientific verification are separate. Scientific verification requires an administrator, a written evidence basis and an approved record. A community confirmation cannot become scientific verification.

## Retrieval behavior
- Only approved + indexed content is eligible.
- Public queries exclude private content; administrator queries may include it.
- Every research passage carries its document and page range.
- Health records carry their record type and verification status.
- Missing evidence is reported as not recorded; no invented treatment, dosage, toxicity or safety claim.
- Gemini is not called by lexical retrieval.

## Document workflow
1. Keep the original PDF in private storage.
2. Extract raw text/pages and preserve the current source chunks.
3. Create a concise, versioned summary and structured facts.
4. Preserve dosage, concentration, application intervals, contraindications, safety warnings, species names and evidence limits.
5. Admin reviews summary against original page references; edits, approves or rejects.
6. Only approved summary versions produce curated chunks and enter curated RAG.
7. Revisions create a new version; prior approved version remains auditable.

## Pest/disease workflow
1. Identify screen sends the photo and diagnosis as an unverified submission.
2. Store submission evidence privately.
3. Admin reviews pest/disease queue, edits/corrects, adds source evidence and chooses review/verification status.
4. Only approved + indexed records enter RAG.
5. Rejected or pending records remain out of all public answers.

## GitHub audit findings and implementation
The current app already had the document-ingestion and plant-identification review foundations. The new work is additive:
- `workers/verde-botanical-knowledge-core-worker.js`: separate no-Gemini Worker for community evidence submission, administrator health-record creation/review, versioned document summaries, deterministic retrieval and Constitution rule checks. It has its own `VERDE_*` environment bindings; it does not read or reuse Gemini Worker secrets.
- `workers/verde-botanical-knowledge-core-worker.test.mjs`: focused tests for authentication, private evidence, review gates, atomic summary approval, private retrieval and no-Gemini behavior. Added to `npm run test:worker`.
- `src/components/botanical/BotanicalKnowledgeCorePanel.tsx`: admin panel for summary versions and pest/disease records; existing Knowledge Center and Identification Review Queue remain in place.
- `IdentifyScreen.tsx` and `App.tsx`: pest/disease reports can now be submitted as private, unverified evidence for admin review. Plant feedback remains on its existing workflow.
- `KnowledgeCenterPanel.tsx`: the new curated Knowledge Core search is attempted first, then the existing Constitution/raw-document route, with the existing clearly labeled Gemini-assisted fallback preserved.
- `src/services/api.ts` and `src/data/initialData.ts`: additive client methods and a dedicated Worker URL.

## Delivery stages
- Stage 1: migration draft + schema review — drafted; not applied.
- Stage 2: independent no-Gemini Worker and regression tests — implemented in this branch; test execution still required.
- Stage 3: document summary review UI and pest/disease review UI — implemented in this branch.
- Stage 4: curated retrieval + active Constitution rule checks — implemented in the new Worker and connected to the admin playground.
- Stage 5: run worker tests, TypeScript/build checks, review migration against the live schema, and complete Android regression validation.
- Deployment and production migration remain separate approval gates.
## Runtime and provenance notes
- Summary chunks inherit the complete source-page range supplied for the summary; they do not claim a more precise page mapping than the reviewer entered.
- Community/AI diagnosis details are stored as unverified evidence. The review UI must preserve that label until an administrator adds adequate source evidence or scientific verification.
- New Worker bindings are `VERDE_PRIMARY_SUPABASE_URL`, `VERDE_PRIMARY_SUPABASE_ANON_KEY`, `VERDE_REVIEW_SUPABASE_URL`, `VERDE_REVIEW_SUPABASE_SERVICE_ROLE_KEY` and `VERDE_ADMIN_EMAILS`. No secrets have been configured.
- The Worker URL in app source is a future endpoint reference only; the Worker has not been deployed.

## Explicit non-goals for this stage
- No production SQL execution.
- No Worker deployment or secrets changes.
- No Gemini Worker edits.
- No removal or replacement of existing raw chunks or legacy retrieval routes.
