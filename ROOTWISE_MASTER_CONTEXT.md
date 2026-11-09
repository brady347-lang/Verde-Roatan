# RootWise — Master Project Context

## Product direction
RootWise is the next product identity for the Verde Roatán plant-intelligence application. The existing repository and deployed services remain the source of truth during the transition; do not rename packages, app identifiers, domains, databases, or deployed resources without an explicitly approved migration plan.

RootWise is intended to become a professional botanical intelligence platform for nurseries, landscapers, horticultural professionals, and plant customers, with Caribbean and tropical horticulture as a strong area of expertise.

## Long-term capabilities
1. Plant identification and image interpretation.
2. A traceable Botanical Knowledge Center that learns from approved documents, catalog records and photographs, Gemini outputs, user corrections, nursery observations, and landscaping project observations.
3. Specialized Python machine-learning services for image classification, plant health analysis, and recommendations when suitable datasets and evaluation evidence exist.
4. Professional landscaping intelligence: plant suitability, compatibility, spacing, soil, light, irrigation, maintenance, and tropical planting design.
5. Nursery and commercial intelligence: catalog, inventory, supplier, pricing, substitutions, and availability.

## Current repository facts (verified from the repository on 2026-11-07)
- Frontend: React 19 + TypeScript, built with Vite 8.
- Mobile packaging: Capacitor 7 / Android.
- Server-side application: Express 4 with TypeScript execution via tsx.
- Cloud backend: multiple Cloudflare Workers, with Wrangler configuration and GitHub Actions deployment workflows.
- Data/auth/storage: Supabase and PostgreSQL.
- AI integration: Google Gemini via `@google/genai` and the existing Gemini Cloudflare Worker.
- Existing tests: Worker regression tests, TypeScript check, Vite production build, and GitHub Actions validation.
- Existing botanical foundations: `workers/verde-botanical-knowledge-core-worker.js`, `workers/verde-roatan-gemini-worker.js`, botanical recognition engine tests, Knowledge Center UI/docs, Supabase migrations, and separate Knowledge Core deployment workflow.
- Python/FastAPI/PyTorch service: not present in the inspected repository root as of this date. This is a future addition, not an existing capability.

## AI contributor roles
- ChatGPT: architecture, repository audits, implementation planning, code changes when authorized, integration, documentation, testing strategy, and coordination.
- Claude: independent engineering implementation, debugging, code review, architecture challenge, and documentation.
- Gemini: the internal/runtime AI provider for selected plant-image interpretation, identification, and other explicitly approved AI tasks. The owner's desired operating posture is light/selective usage (roughly 10% of the overall AI workload as a planning target) with background work only where useful. Do not interpret 10% as a measured quota until a metric and budget are defined.
- Python services: future deterministic/scientific processing and specialized ML inference/training. Do not introduce Python just for ordinary API/database operations.

ChatGPT and Claude are development collaborators, not automatically connected agents. They do not see each other's private chats. Shared GitHub files, Issues, Pull Requests, commit messages, and explicit handoff notes are the coordination channel. Gemini is not a substitute for engineering review.

## Botanical knowledge rules
- Separate raw evidence, AI-generated candidate information, community observations, source-supported facts, and scientifically verified facts.
- Every knowledge item should retain provenance: source type, source identifier, image/document reference, page where applicable, model/provider and model version where applicable, contributor, timestamp, confidence, review state, and correction history.
- AI-generated outputs are candidates, not scientific verification.
- Catalog photos should become eligible learning evidence through an explicit ingestion workflow; verify current implementation before claiming catalog images automatically feed the Knowledge Center.
- Knowledge-base ingestion and machine-learning model training are separate operations.
- Only reviewed, properly labeled, rights-cleared examples may enter training/evaluation datasets.
- Never fabricate taxonomy, treatment, dosage, toxicity, safety, or source citations.
- Preserve existing Knowledge Core approval gates and source/page provenance.

## Protected systems and safety boundaries
- Treat the existing Gemini Worker as protected. It has a lock/check script and CI guard; do not edit or redeploy it without an explicit owner-approved task and updating the lock according to the repository's documented process.
- Do not apply production Supabase migrations, alter production data, change secrets, deploy Workers, publish Android builds, or merge to main without explicit approval for that specific operation.
- Never commit secrets, service-role keys, database passwords, private customer images, or real personal data.
- Prefer additive changes and review branches. Preserve working features and existing schemas.
- Review existing branches and current main before creating overlapping work.

## Current first objective
Establish durable ChatGPT/Claude collaboration and botanical-learning documentation, then audit the existing catalog-photo-to-Knowledge-Center path. Produce a gap report before implementing new ingestion or Python infrastructure.
