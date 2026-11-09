# RootWise — Botanical Knowledge Ingestion Protocol

## Goal
Build a continuously improving, traceable botanical knowledge base from approved research, catalog records and photographs, AI identification outputs, verified user corrections, nursery observations, and landscaping project observations.

## Knowledge sources
1. Research documents: PDFs, manuals, scientific papers, books, and approved reference material.
2. Catalog records: common/scientific names, cultivar, taxonomy, plant description, care attributes, supplier/catalog identifiers, and product-photo references.
3. Catalog photographs: original image reference, upload timestamp, uploader role, catalog item ID, image rights/source where known, and image-quality metadata.
4. Gemini results: raw response or safe structured subset, model name/version, prompt/workflow version where appropriate, timestamp, confidence, and image/catalog references.
5. User feedback: confirmation, correction, or disagreement, retained with contributor and review status.
6. Nursery observations: locally observed growth, flowering, pests, performance, and care notes with location/context where appropriate and consent.
7. Landscaping projects: species combinations, spacing, soil/light/water conditions, survival/performance observations, and maintenance outcomes.

## Pipeline
1. Capture the source and immutable source reference.
2. Validate file type, size, permissions, consent, and image/document rights.
3. Extract candidate information using deterministic parsers and/or an approved AI service.
4. Normalize names and taxonomy against existing records; preserve original submitted names.
5. Deduplicate without discarding conflicting evidence.
6. Store candidate facts with provenance, confidence, and review state.
7. Route uncertain, conflicting, safety-critical, or high-impact claims to review.
8. Publish only approved records to curated search/RAG.
9. Keep original evidence and full audit history; corrections create new versions rather than erasing history.
10. Export only eligible, labeled, rights-cleared examples to ML dataset staging.

## Verification states
- `ai_candidate`: generated or inferred by an AI system; not verified.
- `user_submitted`: observation/correction submitted by a user; not verified.
- `source_supported`: supported by a cited, reviewable source.
- `scientifically_verified`: reviewed and approved by an authorized qualified reviewer with written evidence basis.
- `rejected`: rejected or contradicted; excluded from public retrieval and training.

Approval for public/RAG use and scientific verification are distinct decisions. A user confirmation or repeated AI answer is not scientific verification.

## Required provenance fields
Where applicable, record:
- source type and stable source ID;
- catalog item/taxon/document/observation ID;
- original image/document object path (private where needed);
- document title, citation, page start/end;
- contributor type (ChatGPT, Claude, Gemini, user, administrator, importer, or external source);
- AI provider/model/version and processing timestamp;
- prompt/parser/pipeline version;
- confidence and uncertainty notes;
- review status, reviewer, review timestamp, and evidence basis;
- supersedes/version relationship.

Never store secrets, private conversation transcripts, or unnecessary personal data as botanical evidence.

## Catalog photograph handling
A catalog upload should be eligible to trigger a knowledge-ingestion job, but do not assume this integration is already implemented. First audit the actual upload and Gemini paths. The ingestion job should link the image to its catalog record, preserve its original storage reference, create an AI candidate identification only when an identification result is available, and route it through review. Avoid duplicate records when the same image is retried or updated.

## Gemini usage
Gemini is a selective internal assistant for image interpretation, identification, and approved extraction tasks. Do not call Gemini for deterministic database lookup, lexical/vector retrieval, ordinary data validation, or routine CRUD. The product owner's approximate 10% usage goal is a qualitative budget direction; instrument calls, latency, cost, and success before setting an enforceable percentage.

## Knowledge base versus model training
Knowledge ingestion makes evidence searchable and traceable. It does not train Gemini, ChatGPT, Claude, or a Python model.
Model training is a separate lifecycle:
- dataset eligibility and consent/rights review;
- expert labels and taxonomy normalization;
- train/validation/test split that avoids near-duplicate leakage;
- baseline model and metrics;
- model card, intended use, limitations, and failure analysis;
- approval and versioned deployment;
- monitoring and rollback.
Never train on unreviewed AI guesses as ground truth.

## Safety
Do not infer edible status, toxicity, medicinal use, pesticide dosage, fertilizer dosage, or treatment safety without appropriate sources and review. Report missing evidence as unknown/not recorded. Preserve contradictory findings and uncertainty.
