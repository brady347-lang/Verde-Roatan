# RootWise Python ML Service

This directory documents the separately deployed Python ML service. It is deliberately isolated from the existing React/TypeScript application, Express development server, Cloudflare Workers, Gemini worker, and Supabase schema.

## Architecture boundary

- Existing application remains the system of record for users, catalog entries, images, permissions, and product data.
- Gemini remains the botanical reasoning and knowledge-generation worker.
- Python ML provides image preprocessing, embeddings, similarity retrieval, classification, and model evaluation.
- The app/server calls Python over HTTPS. The browser must never receive the ML service API key.
- Catalog observations and Gemini outputs are unverified evidence until an authorized verification workflow confirms them.

## Package source

The initial implementation is supplied as the separate Kimi deliverable named **RootWise_ML_Fixed_Review_Copy.zip**. Import its `rootwise-ml/` project into this service directory as `services/rootwise-ml/app/` before building an image. Keep its package boundary intact; do not merge Python dependencies into the Node application.

The corrected package has a test suite and a local smoke test. Run these before deployment:

```bash
cd services/rootwise-ml/app
python -m pip install -e '.[dev]'
python -m pytest -q
python scripts/smoke_test.py
```

## Runtime contract

The FastAPI service exposes:

- `GET /health` — non-secret service health.
- `POST /v1/identify` — multipart image field `file`, optional form field `top_k`.
- `POST /v1/embed` — multipart image embedding.
- `POST /v1/catalog/events` — catalog event ingestion.
- `POST /v1/feedback` — verification feedback intake.

Authenticated calls use `X-API-Key`. Configure a high-entropy secret as `ROOTWISE_ML_API_KEY` in the ML host and in the server-side application environment as `ROOTWISE_ML_API_KEY`. Set `ROOTWISE_ML_SERVICE_URL` to the HTTPS base URL. Never put either secret in Vite `VITE_*` variables or client-side code.

## Deployment gates

Do not route production identification traffic to this service until all gates pass:

1. A real pretrained botanical model (BioCLIP/DINOv2) is installed and benchmarked; the default handcrafted color-layout embedder is development-only.
2. The embedding index and verification state are durable across restarts and shared across replicas.
3. Pending and trusted specimen indexes are isolated. Only expert-verified / explicitly approved labels may drive trusted retrieval.
4. Confidence thresholds are calibrated against a held-out, expert-labelled tropical plant dataset. Similarity-derived softmax values must not be described as calibrated probabilities.
5. The API key is configured and rotated through host secret management; upload limits, timeouts, logging, and rate limits are enabled.
6. The catalog event adapter uses private storage references and server-side authorization. Never fetch arbitrary user-provided URLs from an untrusted client.
7. End-to-end tests pass against a staging copy of the existing app and database.

## Existing integration (consolidated from PR #54)

The Gemini Worker is the trusted server-side caller. For `mode=plant` it posts the uploaded image to `POST {ROOTWISE_ML_SERVICE_URL}/v1/identify` (`X-API-Key`, 18 s timeout, 12 MB cap) and attaches a sanitized `ml_visual_evidence` object (`status`, `decision`, `model_version`, top labels only) to the response and to the Gemini prompt as a cautious cross-check. Scores, margins, entropy and similar-catalog entries are deliberately not forwarded to the client. Failures never block the Gemini result. `ROOTWISE_ML_URL` is accepted as a legacy alias for `ROOTWISE_ML_SERVICE_URL`.

Worker secrets: `ROOTWISE_ML_SERVICE_URL`, `ROOTWISE_ML_API_KEY`. Neither is ever exposed to the browser.

The persistent schema (`rootwise_ml.feedback_events`, `rootwise_ml.image_embeddings`, role `rootwise_ml_runtime`) is tracked in `supabase/migrations/20261108161439_rootwise_ml_feedback_embeddings.sql`. It is already applied in production; the file recovers the missing source and is idempotent.

## Deliberate non-changes

This integration does not add Python code to the Node application, does not change the Supabase schema beyond the tracked migration above, and does not put ML results into catalog records. The Gemini Worker lock was refreshed only for the ML evidence call; any further worker change needs separate owner approval.
