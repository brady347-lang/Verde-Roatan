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
- `knowledge_documents`, `knowledge_entities`, `knowledge_chunks`: original documents, extracted facts and existing RAG chunks.
- `search_knowledge_text()`: lexical search over approved raw document chunks.
- `match_knowledge_chunks()`: vector search over approved raw chunks.
- Constitution: locked core rules, versioned amendments, admin-only self-study, and a no-AI lexical question route.
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

## Delivery stages
- Stage 1: migration draft + schema review (this branch).
- Stage 2: independent no-Gemini Knowledge Core Worker and tests.
- Stage 3: document summary review UI and pest/disease review UI.
- Stage 4: RAG integration and Constitution policy checks.
- Stage 5: app integration, offline/provider-failure tests, regression tests and Android build.

## Explicit non-goals for this stage
- No production SQL execution.
- No Worker deployment or secrets changes.
- No Gemini Worker edits.
- No removal or replacement of existing raw chunks or legacy retrieval routes.
