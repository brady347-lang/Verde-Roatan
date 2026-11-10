# RootWise ML modules - alignment with the Verde-Roatan repository

Branch: `ai/claude/ml-modules-alignment` (local, **not pushed, not merged**). Additive only: no change to the
Gemini Worker, workflows, Supabase migrations, Node app or `services/rootwise-ml/app/` (reserved for the Kimi package).

## Where things live
- `services/rootwise-ml/modules/rootwise_ml_modules/` - the nine modules (A-I) plus `service/` (contract adapter).
- Install: `pip install -e 'services/rootwise-ml/modules[dev]'` then `python -m pytest services/rootwise-ml/modules`.
- Serve (needs `[service]` extra): `uvicorn rootwise_ml_modules.service.app:build_app_from_env --factory`.

## Contract matrix (`INTEGRATION_CONTRACT.md` / `services/rootwise-ml/README.md`)
| Requirement | Status |
|---|---|
| `POST /v1/identify`, multipart `file`, `top_k` 1-20 (default 5) | Implemented in `service/handlers.py`; unit-tested |
| `X-API-Key` only, `Authorization: Bearer` unused, fail closed if key unset/<32 chars, constant-time compare | Implemented; tested |
| JPEG/PNG/WebP only (magic bytes), 12 MB cap, declared type must match | Implemented; tested |
| Response fields `top_predictions, decision, confidence, margin, entropy, model_version, similar_catalog_entries` | Implemented; tested |
| `decision` limited to `accept\|review\|reject` (the Worker maps anything else to `review`) | Engine `ambiguous`->review, `unknown`/`unsuitable_image`->reject; tested against a Python replica of the Worker's parser |
| `reject` / `OUT_OF_CATALOG` = no reliable match | `unknown` returns label `OUT_OF_CATALOG`; tested |
| Similarity never presented as probability | `confidence` is `null` unless a held-out-fitted calibrator is loaded; `entropy` is `null`; tested |
| Sanitised errors, no stack traces/paths/secrets, `/docs` off by default | Handlers tested; FastAPI handlers **not executed** |
| `GET /health` non-secret | Implemented; tested |
| `POST /v1/embed` | Implemented; tested |
| `POST /v1/feedback` -> `rootwise_ml.feedback_events` | Append-only INSERT (role has no UPDATE); records are always `unverified`, never `training_approved`; reject != correction; **503 when no durable sink** (no fake success). SQL tested with a fake connection only |
| `POST /v1/catalog/events` | Disabled (503) until a **private-storage fetcher** is supplied. When enabled: internal storage scheme only (http/https/file/data rejected), sha256 verified, embedding stored in the **pending** tier only, license required, Gemini output kept as an unverified candidate |
| Embeddings in `rootwise_ml.image_embeddings` | Insert/exists/load-trusted implemented; fake-connection tests only |
| Evidence-queue payload for the Knowledge Core | `service/provenance.py` builds it (keys match the Worker route); never writes to the RLS-protected tables |
| Review-table adapter (`feedback/review_adapter.py`) | Implemented; synthetic-row tests only, not run against live data |
| Request timeout (< Worker's 18 s) | 15 s default; FastAPI shell only, **not executed** |

## Not executed here
FastAPI shell (`service/app.py`), real Postgres/pgvector, TensorFlow/Keras/TFLite paths, the Worker -> service call.
Executed: 200 pytest tests pass (1 TensorFlow test skipped) - synthetic fixtures, software correctness only.

## Decisions needed from the owner (not assumed)
1. **`confidence` / `entropy` are null.** The contract lists them; filling them from cosine similarity would break the "not calibrated probabilities" gate. They stay null until a calibrator is fitted on a held-out, expert-labelled set (module `uncertainty`).
2. **No existing caller for `/v1/feedback`, `/v1/embed`, `/v1/catalog/events`.** Only `/v1/identify` is called (Gemini Worker). The Worker is protected; wiring the rest needs a separately approved change. `actor` must come from the Worker's verified session - never the browser.
3. **Tier/species/model-version live in `payload`** (`index_tier: pending|trusted`, `species_id`, `model_version`) because the table has no such columns and the runtime role cannot UPDATE. This is a proposed convention; promoting pending -> trusted needs an approved audited path. No schema change was made.
4. **`rootwise_ml_runtime` is `NOLOGIN`.** A login role that is a member of it (and a DSN in `ROOTWISE_ML_DATABASE_URL`) must be created; the migration does not do this.
5. **Kimi package (`RootWise_ML_Fixed_Review_Copy.zip`) is not in the repo**, so I could not compare. Decide whether these modules become the engine behind it, replace it, or stay separate, to avoid two competing implementations.
6. **Backbone.** The deployment gates require a benchmarked botanical model (BioCLIP/DINOv2). The MobileNetV3 baseline here is untrained for botany and is not production-grade. Any other backbone/weights needs its own `model_version`; do not reuse `rootwise_mobilenetv3_512d_v1`.
7. **Private-storage fetcher** (which storage, credentials, URI scheme - default allowed scheme is `storage`) is not implemented. Catalog event field names are inferred from the contract's prose and need confirmation.
8. **Approved-label source.** `feedback/review_adapter.py` now converts `identification_reviews` / `identification_confirmations` rows into feedback records (admin approval != verification; only `scientifically_verified` with an admin and written basis becomes `verified`; nothing is training-approved). It is tested on synthetic rows only. The review tables do not record *which name* an admin verified when the AI name and the proposed name differ, so such reviews stay unverified unless a policy is passed (`verified_label_source`). They also hold no licence, so manifests carry `license: null` until rights are cleared.
9. **CI.** `validate.yml` has no Python job. Suggested: install `[dev]`, run `pytest services/rootwise-ml/modules`. Not added (workflow changes need approval).
10. Rate limiting, request logging and key rotation (deployment gate 5) are left to the host / reverse proxy.

## Environment variables (service side)
`ROOTWISE_ML_API_KEY` (>=32 chars), `ROOTWISE_ML_MODEL_PATH`, `ROOTWISE_ML_INDEX_PATH`, `ROOTWISE_ML_CATALOG_PATH`,
`ROOTWISE_ML_POLICY_PATH` (DecisionPolicy JSON measured on validation data), `ROOTWISE_ML_CALIBRATOR_PATH`,
`ROOTWISE_ML_DATABASE_URL`, `ROOTWISE_ML_INDEX_SOURCE` (`file`|`database`), `ROOTWISE_ML_MAX_IMAGE_BYTES`,
`ROOTWISE_ML_REQUEST_TIMEOUT_S`, `ROOTWISE_ML_STORAGE_SCHEMES`, `ROOTWISE_ML_ENABLE_DOCS`. Caller side (unchanged):
`ROOTWISE_ML_SERVICE_URL`, `ROOTWISE_ML_API_KEY`. Never expose any of them through `VITE_*`.

See `DEVELOPMENT_LOG.md` for the chronological record of what was built, executed and decided.
