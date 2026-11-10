# RootWise ML modules - development log

Append-only. Newest entries last. "Executed" means actually run in the authoring environment; "supplied" means
written but not run. Test counts are from `python -m pytest rootwise_ml_modules/tests`. All fixtures are synthetic
(software correctness only); no model has been trained and no accuracy, calibration or threshold result exists.

## Current status (2026-11-10)
| Item | State |
|---|---|
| Modules A-I (features, similarity, ranking, quality, uncertainty, feedback, training, export, inference) | Implemented; NumPy/Pillow/sklearn paths tested |
| Contract adapter `service/` (identify, embed, feedback, catalog events, health) | Implemented; handlers tested, FastAPI shell not executed |
| Identification-review adapter `feedback/review_adapter.py` | Implemented; tested against synthetic rows, not live data |
| Tests | **200 passed, 1 skipped** (TensorFlow test skipped: TensorFlow not installed) |
| Not executed | FastAPI shell, real Postgres/pgvector, TensorFlow/Keras/TFLite paths, Worker -> service calls, any live Supabase data |
| Trained models / measured metrics | None |
| Branch / PR | `ai/claude/ml-modules-alignment`, draft PR #78 (not merged; owner decisions pending) |

## 2026-11-09 - Baseline modules
- Found an earlier build (~6,000 lines, modules A-I and tests) already in the working folder; continued from it instead of rewriting. (An earlier statement that no code existed was wrong and was corrected.)
- Ran the existing suite: 133 passed, 2 failed, 1 skipped. Both failures were test bugs, not library bugs:
  - normalization test expected a [0,1] mapping to send white away from +1 (it maps to +1); now asserts black->-1 and mid-gray, which do fail;
  - an inference test queried with an all-zero vector that the fake backend projects to NaN; the library correctly rejected it; the test now uses a non-zero query.
- Result: 135 passed, 1 skipped. Added `requirements.txt`, `README.md` (executed vs not-executed vs not-measured), four NumPy-only examples (executed) and one TensorFlow example (not executed). Fixed one example (`Match.cosine_similarity` field name). ZIP delivered to the owner.

## 2026-11-09 - Alignment with the Verde-Roatan repository
- Repository located after the owner chose `brady347-lang/Verde-Roatan` (no repo was literally named RootWise). Read: `INTEGRATION_CONTRACT.md`, `services/rootwise-ml/README.md`, `AI_COLLABORATION_PROTOCOL.md`, `ROOTWISE_MASTER_CONTEXT.md`, `MODEL_TRAINING_LOG.md`, the `rootwise_ml` migration, and the Worker's ML call (`fetchRootWiseMLEvidence`). Repo cloned read-only; protected Gemini Worker untouched (lock check passes).
- Findings that shaped the design: the Worker accepts only `accept|review|reject`; the runtime DB role has SELECT/INSERT only; `rootwise_ml_runtime` is NOLOGIN; the Kimi FastAPI package is not in the repo; only `/v1/identify` has a caller.
- Added `service/` (settings, handlers, stores, provenance, FastAPI shell), `pyproject.toml`, `README_ALIGNMENT.md`, and a handoff entry in `AI_TASK_HANDOFF.md`.
- Added `allow_mode_conversion` to `InferenceConfig` (default False, behaviour unchanged) so L/P/CMYK uploads can be accepted by the service.
- Tests: 51 new contract tests; first run 50 passed / 1 failed (test called a property as a method); fixed. Full suite 186 passed, 1 skipped. Includes a Python replica of the Worker's response parsing.
- Design decisions recorded: `confidence` and `entropy` are `null` (no calibrated source); feedback is stored only as `unverified`; no durable sink -> 503 rather than fake success; catalog ingestion disabled until a private-storage fetcher exists and writes only to a `pending` tier.

## 2026-11-09/10 - Publishing
- Owner approved push. Attached the repo with write access, re-applied the commit onto a fresh clone, pushed only `ai/claude/ml-modules-alignment`, opened **draft** PR #78 via the REST API (GraphQL `gh pr create` is blocked in this environment). Not merged.
- Repo CI on the branch: `validate` and `web-build` succeeded (no Python job exists, so the ML tests are not run by CI).
- A stop hook reported "unpushed commits" three times. Cause: single-branch clones keep no remote-tracking ref (and one stale duplicate commit in the first clone). Verified remote == local (`3d55811`), aligned both clones; nothing needed pushing.

## 2026-11-10 - Identification-review adapter
- Read `identification_review_schema.sql`, `20261105_identification_verification.sql` and the Worker's review-decision route.
- Rules taken from the repo, not invented: `approved` != verified; `scientifically_verified` needs admin + written basis (>= 10 chars); a user "confirmed" is not verification.
- Built `feedback/review_adapter.py`: converts reviews + confirmations into unverified `FeedbackRecord`s and *planned* verifications; applying them uses `FeedbackStore.verify`; it never sets `training_approved`. Admin rejection -> `disputed`. Unresolved species are skipped with a reason. User ids are not copied. No licence exists in the review tables, so exported manifests carry `license: null` until rights are cleared.
- Found and handled a schema gap: the verification columns do not say which name was verified when the AI name and the proposed name differ. Default is to leave such reviews unverified; caller may declare `verified_label_source="ai"|"proposed"`.
- Tests: 14 new, all passed first run; full suite **200 passed, 1 skipped**.

## Open decisions (owner) - see `README_ALIGNMENT.md`
1. Null `confidence`/`entropy` until a calibrator is fitted on held-out expert-labelled data.
2. Wiring `/v1/feedback`, `/v1/embed`, `/v1/catalog/events` needs a separately approved change to the protected Worker.
3. `index_tier`/`species_id`/`model_version` live in `payload` (proposed convention; no schema change).
4. Create a login role that is a member of `rootwise_ml_runtime` for the service's DSN.
5. Reconcile with the Kimi package (not in the repo).
6. Production backbone (benchmarked botanical model) and its own `model_version`.
7. Private-storage fetcher and URI scheme; confirm catalog-event field names.
8. Which name an admin verification refers to when AI and proposed names differ (new, from the review adapter).
9. Rights/licence for community review photos before any training use.
10. Approve a Python CI job (not added; workflow changes need approval).

## Next steps (not started)
- Run the TensorFlow-dependent tests and examples on a machine with TensorFlow; fix whatever breaks.
- Exercise the FastAPI shell with `httpx`/TestClient where FastAPI is installed.
- Build an evaluation set (held-out, expert-labelled, including out-of-catalog) and measure FAR/FRR before setting any threshold.
