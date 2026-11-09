# RootWise ML API integration contract

## Identification request

The trusted application server sends a multipart request to:

`POST {ROOTWISE_ML_SERVICE_URL}/v1/identify`

Headers (the only supported authentication is `X-API-Key`; `Authorization: Bearer` is not used):

- `X-API-Key: {ROOTWISE_ML_API_KEY}`
- `Accept: application/json`

Form fields:

- `file`: JPEG, PNG, or WebP image bytes.
- `top_k`: integer from 1 through 20 (optional; default 5).

The caller is the Gemini Worker (server-side). The browser must never call the Python host directly. The server owns the ML secret and forwards the image after checking the signed-in user's authorization and image access.

## Response handling

The ML response contains `top_predictions`, `decision`, `confidence`, `margin`, `entropy`, `model_version`, and `similar_catalog_entries`.

Application behavior:

- Treat `decision=review` as a suggestion requiring Gemini/expert review.
- Treat `decision=reject` or `OUT_OF_CATALOG` as no reliable ML match.
- Never present an ML candidate as a confirmed botanical identity solely because it has the highest score.
- Preserve Gemini's result and rationale independently; store model provenance and both outputs for review.
- A user upload, user-claimed name, or Gemini response is not automatically an expert-verified training label.
- Do not let ML results overwrite the user's catalog record without explicit user/admin action.

## Catalog event adapter

The current Kimi package accepts catalog events with image IDs, storage URIs, SHA-256, organ, capture time, optional coordinates, Gemini identification, uploader, and license. The existing app must construct these events on the trusted server using known database records.

Before enabling this route, implement a private-storage fetcher that resolves an internal storage object through authorized credentials. Do not pass arbitrary public URLs from the client to the ML service.

## Feedback

The initial package writes feedback to local JSONL as an audit fallback. That is not a production review database. Before production, replace it with a durable database-backed review queue and an authenticated actor identity derived from the application session, not a client-supplied `actor` string.

## Security requirements

- Keep the ML key server-side.
- Use HTTPS between services.
- Apply application-level authorization before proxying images.
- Bound image bytes and request duration.
- Return sanitized upstream errors; do not leak secrets, storage URLs, or stack traces.
- Do not expose the Python `/docs` endpoint publicly in production unless access-controlled.
