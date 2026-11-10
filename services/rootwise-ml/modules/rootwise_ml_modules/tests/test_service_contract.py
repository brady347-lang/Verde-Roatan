"""Contract-adapter tests (pure handlers + SQL shape). Synthetic fixtures; say nothing about botanical accuracy."""
import hashlib
import io
import json

import numpy as np
import pytest
from PIL import Image

from rootwise_ml_modules.contract import MODEL_VERSION
from rootwise_ml_modules.image_features import FeatureExtractor
from rootwise_ml_modules.inference import InferenceConfig, RootWiseInference, build_reference_index
from rootwise_ml_modules.service import handlers as h
from rootwise_ml_modules.service.handlers import ApiError
from rootwise_ml_modules.service.provenance import to_evidence_queue_payload
from rootwise_ml_modules.service.settings import ServiceSettings
from rootwise_ml_modules.service.stores import (
    EMBEDDING_INSERT_SQL, FEEDBACK_INSERT_SQL, InMemoryEmbeddingStore, InMemoryFeedbackSink,
    PostgresEmbeddingStore, PostgresFeedbackSink, parse_vector_text, vector_literal,
)
from rootwise_ml_modules.uncertainty import fit_calibrator

from .helpers import SPECIES_COLORS, colored_image, fake_embed, png_bytes

KEY = "k" * 40
SETTINGS = ServiceSettings(api_key=KEY)
POLICY = {"min_top_score": 0.5, "min_margin": 0.1, "source": "synthetic_test_fixture"}


def jpeg_bytes(arr):
    b = io.BytesIO(); Image.fromarray(arr).save(b, "JPEG"); return b.getvalue()


def webp_bytes(arr):
    b = io.BytesIO(); Image.fromarray(arr).save(b, "WEBP"); return b.getvalue()


def make_engine(policy=POLICY):
    eng = RootWiseInference(InferenceConfig(embed_fn=fake_embed, decision_policy=policy, allow_mode_conversion=True))
    eng.initialize()
    items = [(f"{sp}_{i}", sp, colored_image(rgb, seed=10 * i + len(sp), size=(96, 96))) for sp, rgb in SPECIES_COLORS.items() for i in range(3)]
    index, failures = build_reference_index(FeatureExtractor(fake_embed), items)
    assert failures == []
    eng.set_index(index)
    return eng


def green_png():
    return png_bytes(colored_image(SPECIES_COLORS["sp_green"], seed=999, size=(120, 120)))


def worker_view(resp):
    """Python replica of fetchRootWiseMLEvidence() parsing in workers/verde-roatan-gemini-worker.js."""
    assert isinstance(resp["top_predictions"], list)
    decision = resp["decision"] if resp["decision"] in ("accept", "review", "reject") else "review"
    labels = [str(i.get("label") or "")[:120] for i in resp["top_predictions"][:5]]
    return decision, [x for x in labels if x]


# ---------------------------------------------------------------- settings / auth / upload
def test_settings_from_env_and_validation():
    s = ServiceSettings.from_env({"ROOTWISE_ML_API_KEY": KEY, "ROOTWISE_ML_MAX_IMAGE_BYTES": "1000", "ROOTWISE_ML_STORAGE_SCHEMES": "storage, supabase"})
    assert s.auth_configured and s.max_image_bytes == 1000 and s.allowed_storage_schemes == ("storage", "supabase") and not s.enable_docs
    assert not ServiceSettings.from_env({"ROOTWISE_ML_API_KEY": "short"}).auth_configured
    assert not ServiceSettings.from_env({}).auth_configured
    with pytest.raises(ValueError, match="ROOTWISE_ML_MAX_IMAGE_BYTES"):
        ServiceSettings.from_env({"ROOTWISE_ML_MAX_IMAGE_BYTES": "abc"})
    with pytest.raises(ValueError):
        ServiceSettings.from_env({"ROOTWISE_ML_INDEX_SOURCE": "elsewhere"})


def test_authentication_fails_closed():
    with pytest.raises(ApiError) as e:
        h.authenticate(KEY, ServiceSettings(api_key=None))
    assert e.value.status == 503
    for bad in (None, "", "wrong" * 10):
        with pytest.raises(ApiError) as e:
            h.authenticate(bad, SETTINGS)
        assert e.value.status == 401 and KEY not in json.dumps(e.value.to_body())
    h.authenticate(KEY, SETTINGS)


def test_top_k_bounds():
    assert h.parse_top_k(None, SETTINGS) == 5 and h.parse_top_k("20", SETTINGS) == 20 and h.parse_top_k("1", SETTINGS) == 1
    for bad in ("0", "21", "x", "2.5", "-1"):
        with pytest.raises(ApiError) as e:
            h.parse_top_k(bad, SETTINGS)
        assert e.value.status == 422


def test_upload_validation():
    a = colored_image(SPECIES_COLORS["sp_red"], size=(64, 64))
    assert h.validate_upload(png_bytes(a), "image/png", SETTINGS) == "image/png"
    assert h.validate_upload(jpeg_bytes(a), "image/jpeg", SETTINGS) == "image/jpeg"
    assert h.validate_upload(webp_bytes(a), "image/webp", SETTINGS) == "image/webp"
    assert h.validate_upload(png_bytes(a), None, SETTINGS) == "image/png"
    assert h.validate_upload(png_bytes(a), "application/octet-stream", SETTINGS) == "image/png"
    for data, ctype, status in [
        (b"", "image/png", 400), (b"GIF89a....", "image/gif", 415), (b"%PDF-1.4", "image/png", 415),
        (png_bytes(a), "image/jpeg", 415), (png_bytes(a), "image/png", 413),
    ]:
        s = ServiceSettings(api_key=KEY, max_image_bytes=100) if status == 413 else SETTINGS
        with pytest.raises(ApiError) as e:
            h.validate_upload(data, ctype, s)
        assert e.value.status == status


# ---------------------------------------------------------------- identify mapping
def test_identify_response_has_contract_fields_and_is_json():
    r = h.handle_identify(make_engine(), SETTINGS, green_png(), "image/png", "3")
    for key in ("top_predictions", "decision", "confidence", "margin", "entropy", "model_version", "similar_catalog_entries"):
        assert key in r
    assert r["decision"] == "accept" and r["model_version"] == MODEL_VERSION
    assert r["top_predictions"][0]["species_id"] == "sp_green" and len(r["top_predictions"]) <= 3
    assert r["verification_status"] == "unverified_ml_suggestion"
    json.dumps(r)


def test_scores_are_not_presented_as_probabilities():
    r = h.handle_identify(make_engine(), SETTINGS, green_png(), "image/png", "5")
    assert r["confidence"] is None and r["confidence_type"] == "not_calibrated" and r["entropy"] is None
    assert r["top_predictions"][0]["score_type"].endswith("uncalibrated")
    assert all(m["score_type"] == "cosine_similarity_uncalibrated" for m in r["similar_catalog_entries"])


def test_without_policy_never_auto_accepts_and_worker_sees_review():
    r = h.handle_identify(make_engine(policy=None), SETTINGS, green_png(), "image/png", None)
    assert r["decision"] == "review" and worker_view(r)[0] == "review"


@pytest.mark.parametrize("engine_decision,expected", [("accept", "accept"), ("ambiguous", "review"), ("review", "review"), ("unknown", "reject"), ("unsuitable_image", "reject"), ("???", "review")])
def test_decision_mapping_stays_within_worker_whitelist(engine_decision, expected):
    assert h.contract_decision(engine_decision) == expected
    res = {"ok": True, "decision": engine_decision, "candidates": [], "matches": [], "model_version": MODEL_VERSION}
    assert worker_view(h.build_identify_response(res, top_k=5))[0] == expected


def test_unknown_yields_out_of_catalog_and_unsuitable_yields_no_labels():
    cand = {"rank": 1, "species_id": "sp_a", "aggregated_score": 0.3, "score_type": "x", "species": None}
    unknown = h.build_identify_response({"ok": True, "decision": "unknown", "candidates": [cand], "matches": []}, top_k=5)
    assert unknown["decision"] == "reject" and worker_view(unknown)[1] == [h.OUT_OF_CATALOG]
    assert unknown["considered_candidates"][0]["species_id"] == "sp_a"
    bad = h.build_identify_response({"ok": True, "decision": "unsuitable_image", "decision_reasons": ["blurry"], "quality": {"verdict": "unsuitable", "reasons": ["blurry"]}}, top_k=5)
    assert bad["decision"] == "reject" and bad["top_predictions"] == [] and bad["quality"]["verdict"] == "unsuitable"


def test_margin_and_label_preference_for_scientific_name():
    c = [{"rank": 1, "species_id": "a", "aggregated_score": 0.9, "species": {"scientific_name": "Genus alpha"}},
         {"rank": 2, "species_id": "b", "aggregated_score": 0.6, "species": None}]
    r = h.build_identify_response({"ok": True, "decision": "review", "candidates": c, "matches": []}, top_k=5)
    assert r["top_predictions"][0]["label"] == "Genus alpha" and r["top_predictions"][1]["label"] == "b"
    assert r["margin"] == pytest.approx(0.3)


def test_calibrated_confidence_only_with_fitted_calibrator_and_not_on_reject():
    rng = np.random.default_rng(0)
    scores = rng.uniform(0.2, 0.95, 80)
    cal = fit_calibrator(scores, rng.random(80) < scores, method="platt", dataset_id="synthetic")
    c = [{"rank": 1, "species_id": "a", "aggregated_score": 0.8, "species": None}]
    ok = h.build_identify_response({"ok": True, "decision": "accept", "candidates": c, "matches": []}, top_k=5, calibrator=cal)
    assert 0.0 <= ok["confidence"] <= 1.0 and ok["confidence_type"].startswith("empirical")
    rej = h.build_identify_response({"ok": True, "decision": "unknown", "candidates": c, "matches": []}, top_k=5, calibrator=cal)
    assert rej["confidence"] is None


def test_engine_errors_are_sanitised():
    leaky = {"ok": False, "error": {"code": "embedding_failed", "message": "ValueError: /srv/secret/path.tflite"}}
    with pytest.raises(ApiError) as e:
        h.build_identify_response(leaky, top_k=5)
    assert e.value.status == 500 and "secret" not in json.dumps(e.value.to_body())
    for code, status in [("model_not_ready", 503), ("index_not_ready", 503), ("corrupt_image", 422), ("image_too_small", 422)]:
        with pytest.raises(ApiError) as e:
            h.raise_for_engine_error({"ok": False, "error": {"code": code, "message": "x"}})
        assert e.value.status == status


def test_identify_with_undecodable_image_is_422_not_500():
    with pytest.raises(ApiError) as e:
        h.handle_identify(make_engine(), SETTINGS, b"\x89PNG\r\n\x1a\n" + b"junk" * 20, "image/png", None)
    assert e.value.status == 422 and e.value.code == "image_not_processable"


def test_paletted_png_is_accepted_when_mode_conversion_enabled():
    pal = Image.fromarray(colored_image(SPECIES_COLORS["sp_green"], size=(96, 96))).convert("P")
    b = io.BytesIO(); pal.save(b, "PNG")
    assert h.handle_identify(make_engine(), SETTINGS, b.getvalue(), "image/png", None)["decision"] in ("accept", "review", "reject")


def test_embed_and_health():
    e = make_engine()
    out = h.handle_embed(e, SETTINGS, green_png(), "image/png")
    assert out["embedding_dim"] == 512 and len(out["embedding"]) == 512 and out["l2_normalized"] is True
    hl = h.handle_health(e, SETTINGS)
    assert hl["status"] == "ok" and hl["auth_configured"] and hl["reference_count"] == 9
    assert "path" not in json.dumps(hl).lower() and KEY not in json.dumps(hl)
    assert h.handle_health(RootWiseInference(InferenceConfig()), SETTINGS)["status"] == "degraded"


# ---------------------------------------------------------------- feedback
def fb(**kw):
    base = {"event_id": "e1", "image_id": "img1", "action": "correct", "actor": "user-uuid-1", "predicted_label": "sp_a", "correct_label": "sp_b", "comment": "looks different"}
    base.update(kw)
    return base


def test_feedback_recorded_unverified_and_not_training_approved():
    sink = InMemoryFeedbackSink()
    r = h.handle_feedback(fb(), sink)
    assert r == {"status": "recorded", "event_id": "e1", "verification_status": "unverified", "training_approved": False}
    ev = sink.events["e1"]
    assert ev["correct_label"] == "sp_b" and ev["actor"] == "user-uuid-1"
    assert ev["payload"]["training_approved"] is False and ev["payload"]["verification_status"] == "unverified"
    assert h.handle_feedback(fb(), sink)["status"] == "duplicate" and len(sink.events) == 1


def test_rejection_is_not_a_correction_and_confirm_cannot_carry_correction():
    sink = InMemoryFeedbackSink()
    h.handle_feedback(fb(event_id="r1", action="reject", correct_label=None), sink)
    assert sink.events["r1"]["correct_label"] is None
    with pytest.raises(ApiError) as e:
        h.handle_feedback(fb(event_id="c1", action="confirm"), sink)
    assert e.value.status == 422 and any("confirm" in d for d in e.value.details)


@pytest.mark.parametrize("patch", [{"actor": None}, {"actor": "  "}, {"action": "approve"}, {"image_id": ""}, {"correct_label": None}, {"comment": "x" * 2001}, {"correct_label": "sp_a"}])
def test_invalid_feedback_rejected(patch):
    with pytest.raises(ApiError) as e:
        h.handle_feedback(fb(**patch), InMemoryFeedbackSink())
    assert e.value.status == 422


def test_feedback_without_durable_sink_is_503_not_fake_success():
    with pytest.raises(ApiError) as e:
        h.handle_feedback(fb(), None)
    assert e.value.status == 503 and e.value.code == "feedback_store_not_configured"


def test_provenance_payload_matches_knowledge_core_route_and_stays_community_submitted():
    sink = InMemoryFeedbackSink(); h.handle_feedback(fb(), sink)
    p = to_evidence_queue_payload(sink.events["e1"])
    assert {"evidence_type", "evidence_fingerprint", "submitted_payload", "source_system", "source_record_id", "subject_key"} <= set(p)
    assert p["evidence_type"] == "community_correction" and p["submitted_payload"]["verification_status"] == "community_submitted"
    assert len(p["evidence_fingerprint"]) == 64 and p == to_evidence_queue_payload(sink.events["e1"])
    sink2 = InMemoryFeedbackSink(); h.handle_feedback(fb(event_id="r2", action="reject", correct_label=None), sink2)
    assert to_evidence_queue_payload(sink2.events["r2"])["evidence_type"] == "plant_identification"
    with pytest.raises(ValueError):
        to_evidence_queue_payload({"action": "approve", "image_id": "i", "event_id": "e"})


# ---------------------------------------------------------------- catalog events
class Fetcher:
    def __init__(self, data): self.data, self.calls = data, []
    def fetch(self, uri, *, max_bytes):
        self.calls.append(uri)
        if uri not in self.data:
            raise KeyError("secret-bucket/path")
        return self.data[uri]


def catalog_body(data, **kw):
    b = {"image_id": "img1", "storage_uri": "storage://private/a.png", "sha256": hashlib.sha256(data).hexdigest(), "uploader_id": "u1",
         "license": "CC-BY-4.0", "organ": "leaf", "captured_at": "2026-11-01T10:00:00Z", "latitude": 16.3, "longitude": -86.5,
         "gemini_identification": {"scientific_name": "Genus species"}}
    b.update(kw)
    return b


def test_catalog_event_goes_to_pending_tier_only():
    data = green_png(); store = InMemoryEmbeddingStore(); f = Fetcher({"storage://private/a.png": data})
    r = h.handle_catalog_event(catalog_body(data), engine=make_engine(), settings=SETTINGS, fetcher=f, store=store)
    assert r["status"] == "pending_review" and r["index_tier"] == "pending" and r["training_eligible"] is False
    emb, payload = store.rows["img1"]
    assert emb.shape == (512,) and payload["index_tier"] == "pending" and payload["species_id"] is None
    assert payload["label_status"] == "unverified_candidate" and payload["license"] == "CC-BY-4.0"
    again = h.handle_catalog_event(catalog_body(data), engine=make_engine(), settings=SETTINGS, fetcher=f, store=store)
    assert again["status"] == "already_ingested" and len(f.calls) == 1


def test_catalog_event_disabled_until_fetcher_and_store_exist():
    data = green_png()
    for kw in ({"fetcher": None, "store": InMemoryEmbeddingStore()}, {"fetcher": Fetcher({}), "store": None}):
        with pytest.raises(ApiError) as e:
            h.handle_catalog_event(catalog_body(data), engine=make_engine(), settings=SETTINGS, **kw)
        assert e.value.status == 503 and e.value.code == "catalog_ingestion_not_enabled"


@pytest.mark.parametrize("patch", [
    {"storage_uri": "https://evil.example/a.png"}, {"storage_uri": "http://169.254.169.254/x"}, {"storage_uri": "file:///etc/passwd"},
    {"storage_uri": "data:image/png;base64,AAAA"}, {"storage_uri": "other://bucket/a"}, {"storage_uri": "no-scheme/a.png"},
    {"sha256": "abc"}, {"license": ""}, {"uploader_id": None}, {"latitude": None}, {"longitude": None}, {"latitude": 123.0},
    {"captured_at": "yesterday"}, {"gemini_identification": "Genus species"},
])
def test_catalog_event_validation(patch):
    data = green_png()
    body = catalog_body(data); body.update(patch)
    if "latitude" in patch and patch["latitude"] is None:
        pass  # leaves longitude set -> must be rejected as incomplete pair
    f = Fetcher({"storage://private/a.png": data})
    with pytest.raises(ApiError) as e:
        h.handle_catalog_event(body, engine=make_engine(), settings=SETTINGS, fetcher=f, store=InMemoryEmbeddingStore())
    assert e.value.status == 422 and f.calls == []


def test_catalog_event_sha_mismatch_and_storage_failure_are_sanitised():
    data = green_png()
    with pytest.raises(ApiError) as e:
        h.handle_catalog_event(catalog_body(data, sha256="0" * 64), engine=make_engine(), settings=SETTINGS, fetcher=Fetcher({"storage://private/a.png": data}), store=InMemoryEmbeddingStore())
    assert e.value.code == "sha256_mismatch"
    with pytest.raises(ApiError) as e:
        h.handle_catalog_event(catalog_body(data), engine=make_engine(), settings=SETTINGS, fetcher=Fetcher({}), store=InMemoryEmbeddingStore())
    assert e.value.status == 502 and "secret" not in json.dumps(e.value.to_body())


# ---------------------------------------------------------------- SQL stores (fake connection; no live DB)
class FakeCursor:
    def __init__(self, conn): self.conn, self.rowcount, self._rows = conn, 0, []
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def execute(self, sql, params=()):
        self.conn.executed.append((sql, params))
        if sql == FEEDBACK_INSERT_SQL:
            new = params[0] not in self.conn.seen; self.conn.seen.add(params[0]); self.rowcount = 1 if new else 0
        elif sql == EMBEDDING_INSERT_SQL:
            new = params[0] not in self.conn.seen; self.conn.seen.add(params[0]); self.rowcount = 1 if new else 0
        elif sql.startswith("SELECT 1"):
            self._rows = [(1,)] if params[0] in self.conn.seen else []
        else:
            self._rows = self.conn.rows
    def fetchone(self): return self._rows[0] if self._rows else None
    def fetchall(self): return list(self._rows)


class FakeConn:
    def __init__(self, rows=()): self.executed, self.seen, self.rows = [], set(), list(rows)
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def cursor(self): return FakeCursor(self)


def test_feedback_sql_is_insert_only_idempotent_and_parameterised():
    conn = FakeConn(); sink = PostgresFeedbackSink(lambda: conn)
    sink2 = InMemoryFeedbackSink(); h.handle_feedback(fb(), sink2)
    ev = sink2.events["e1"]
    assert sink.record(ev) is True and sink.record(ev) is False
    sql, params = conn.executed[0]
    assert sql.startswith("INSERT INTO rootwise_ml.feedback_events") and "NOT EXISTS" in sql and "UPDATE" not in sql.upper()
    assert "user-uuid-1" not in sql and params[3] == "user-uuid-1" and json.loads(params[6])["training_approved"] is False


def test_embedding_store_insert_exists_and_vector_roundtrip():
    v = np.random.default_rng(1).standard_normal(512).astype(np.float32); v /= np.linalg.norm(v)
    assert np.allclose(parse_vector_text(vector_literal(v)), v, atol=1e-6)
    conn = FakeConn(); st = PostgresEmbeddingStore(lambda: conn)
    assert st.exists("i1") is False and st.put("i1", v, {"index_tier": "pending"}) is True
    assert st.exists("i1") is True and st.put("i1", v, {}) is False
    assert "ON CONFLICT (image_id) DO NOTHING" in EMBEDDING_INSERT_SQL and "UPDATE" not in EMBEDDING_INSERT_SQL.upper()
    for bad in (np.zeros(10, np.float32), np.full(512, np.nan, np.float32)):
        with pytest.raises(ValueError):
            vector_literal(bad)


def test_load_trusted_index_filters_and_reports_skipped_rows():
    rng = np.random.default_rng(2)
    def unit(): v = rng.standard_normal(512).astype(np.float32); return v / np.linalg.norm(v)
    ok = {"index_tier": "trusted", "model_version": MODEL_VERSION, "species_id": "sp_a"}
    rows = [
        ("good", vector_literal(unit()), ok),
        ("pending", vector_literal(unit()), {**ok, "index_tier": "pending"}),
        ("other_model", vector_literal(unit()), {**ok, "model_version": "other"}),
        ("no_species", vector_literal(unit()), {**ok, "species_id": None}),
        ("bad_dim", "[1.0,2.0]", ok),
        ("zero", "[" + ",".join(["0.0"] * 512) + "]", ok),
        ("json_payload", vector_literal(unit()), json.dumps({**ok, "species_id": "sp_b"})),
    ]
    index, skipped = PostgresEmbeddingStore(lambda: FakeConn(rows)).load_trusted_index(MODEL_VERSION)
    assert len(index) == 2 and {s["image_id"] for s in skipped} == {"pending", "other_model", "no_species", "bad_dim", "zero"}
    assert set(index.species_ids) == {"sp_a", "sp_b"}
