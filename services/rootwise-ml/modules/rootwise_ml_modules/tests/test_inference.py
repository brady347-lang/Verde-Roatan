import json

import numpy as np
import pytest

from rootwise_ml_modules.image_features import FeatureExtractor
from rootwise_ml_modules.inference import InferenceConfig, RootWiseInference, build_reference_index, jsonable
from rootwise_ml_modules.similarity import ModelVersionMismatchError, SimilarityIndex

from .helpers import SPECIES_COLORS, colored_image, fake_embed, noise_image, png_bytes

POLICY = {"min_top_score": 0.5, "min_margin": 0.1, "source": "synthetic_test_fixture"}


def make_index():
    ex = FeatureExtractor(fake_embed)
    items = [(f"{sp}_{i}", sp, colored_image(rgb, seed=10 * i + len(sp), size=(96, 96))) for sp, rgb in SPECIES_COLORS.items() for i in range(3)]
    index, failures = build_reference_index(ex, items)
    assert failures == []
    return index


def make_engine(**cfg):
    eng = RootWiseInference(InferenceConfig(embed_fn=fake_embed, decision_policy=POLICY, **cfg))
    eng.initialize()
    eng.set_index(make_index())
    return eng


def test_readiness_states():
    eng = RootWiseInference(InferenceConfig())
    r = eng.initialize()
    assert r["ready_for_embedding"] is False and r["errors"] and r["initialized"]
    eng2 = RootWiseInference(InferenceConfig(embed_fn=fake_embed))
    r2 = eng2.initialize()
    assert r2["ready_for_embedding"] and not r2["ready_for_identification"]
    assert r2["notes"] and r2["components"]["decision_policy_configured"] is False
    eng2.set_index(make_index())
    r3 = eng2.readiness()
    assert r3["ready_for_identification"] and r3["components"]["reference_count"] == 9
    json.dumps(r3)


def test_embed_returns_contract_dict():
    eng = make_engine()
    out = eng.embed(noise_image(seed=1))
    assert out["ok"] and out["model_version"] == "rootwise_mobilenetv3_512d_v1" and len(out["embedding"]) == 512
    assert abs(np.linalg.norm(out["embedding"]) - 1) < 1e-5
    assert "embedding" not in eng.embed(noise_image(seed=1), include_embedding=False)
    batch = eng.embed_batch([noise_image(seed=1), b"junk"])
    assert batch["ok"] and batch["count"] == 1 and batch["failures"][0]["index"] == 1
    json.dumps(out)


def test_identify_returns_structured_json_with_honest_notes():
    eng = make_engine()
    q = colored_image(SPECIES_COLORS["sp_green"], seed=999, size=(120, 120))
    res = eng.identify(png_bytes(q))
    assert res["ok"] and res["decision"] == "accept" and res["candidates"][0]["species_id"] == "sp_green"
    assert res["matches"][0]["score_type"] == "cosine_similarity_uncalibrated"
    assert res["candidates"][0]["score_type"] == "aggregated_cosine_similarity_uncalibrated"
    assert any("not a probability" in n for n in res["notes"])
    assert any("NOT been trained on botanical images" in n for n in res["notes"])
    assert res["quality"]["verdict"] in ("suitable", "marginal", "unsuitable") and res["embedding"]["embedding_dim"] == 512
    assert "embedding" not in res["embedding"]
    json.dumps(res)


def test_identify_without_policy_requests_review():
    eng = RootWiseInference(InferenceConfig(embed_fn=fake_embed))
    eng.initialize()
    eng.set_index(make_index())
    res = eng.identify(colored_image(SPECIES_COLORS["sp_red"], seed=5, size=(96, 96)))
    assert res["decision"] == "review" and res["decision_reasons"] == ["no_decision_policy_configured"]


def test_identify_candidate_restriction_and_rank_candidates():
    eng = make_engine()
    q = colored_image(SPECIES_COLORS["sp_red"], seed=77, size=(96, 96))
    res = eng.identify(q, candidate_species_ids=["sp_blue", "sp_green"])
    assert {c["species_id"] for c in res["candidates"]} <= {"sp_blue", "sp_green"}
    emb = eng.embed(q)["embedding"]
    r = eng.rank_candidates(embedding=emb)
    assert r["ok"] and r["candidates"][0]["species_id"] == "sp_red"
    sim = eng.retrieve_similar(embedding=emb, top_k=3)
    assert sim["ok"] and len(sim["matches"]) == 3 and sim["matches"][0]["species_id"] == "sp_red"
    assert "not a probability" in sim["note"]


def test_structured_errors_instead_of_exceptions():
    eng = make_engine()
    assert eng.identify(b"junk")["error"]["code"] == "corrupt_image" or eng.identify(b"junk")["decision"]
    bad = eng.embed(b"junk")
    assert bad == {"ok": False, "error": {"code": "corrupt_image", "message": bad["error"]["message"]}}
    assert eng.retrieve_similar(image=noise_image(), embedding=[0.0])["error"]["code"] == "bad_request"
    assert eng.retrieve_similar()["error"]["code"] == "bad_request"
    assert eng.retrieve_similar(embedding=[1.0, 2.0])["error"]["code"] == "retrieval_failed"
    no_model = RootWiseInference(InferenceConfig())
    no_model.initialize()
    assert no_model.embed(noise_image())["error"]["code"] == "model_not_ready"
    no_index = RootWiseInference(InferenceConfig(embed_fn=fake_embed))
    no_index.initialize()
    assert no_index.identify(noise_image())["error"]["code"] == "index_not_ready"
    assert no_index.retrieve_similar(embedding=np.ones(512))["error"]["code"] == "index_not_ready"


def test_quality_gate_block_and_off():
    dark = (noise_image(300, 300, 3) * 0.05).astype(np.uint8)
    blocked = make_engine(quality_gate="block").identify(dark)
    assert blocked["decision"] == "unsuitable_image" and blocked["candidates"] == [] and blocked["decision_reasons"]
    warned = make_engine(quality_gate="warn").identify(dark)
    assert warned["decision"] != "unsuitable_image" and warned["quality"]["verdict"] == "unsuitable"
    assert make_engine(quality_gate="off").identify(dark)["quality"] is None
    with pytest.raises(ValueError):
        RootWiseInference(InferenceConfig(quality_gate="maybe"))


def test_set_index_version_mismatch():
    eng = RootWiseInference(InferenceConfig(embed_fn=fake_embed))
    with pytest.raises(ModelVersionMismatchError):
        eng.set_index(SimilarityIndex(model_version="other_version"))


def test_index_loaded_from_path_through_initialize(tmp_path):
    p = str(tmp_path / "idx.npz")
    make_index().save(p)
    eng = RootWiseInference(InferenceConfig(embed_fn=fake_embed, reference_index_path=p, decision_policy=POLICY))
    assert eng.initialize()["ready_for_identification"]
    bad = RootWiseInference(InferenceConfig(embed_fn=fake_embed, reference_index_path=str(tmp_path / "none.npz")))
    assert any("index" in e for e in bad.initialize()["errors"])
    bad_policy = RootWiseInference(InferenceConfig(embed_fn=fake_embed, decision_policy={"min_top_score": 0.5}))
    assert any("policy" in e for e in bad_policy.initialize()["errors"])


def test_validate_feedback_passthrough():
    eng = make_engine()
    good = dict(feedback_id="f", image_id="i", source_id="s", model_version="v", timestamp="2026-01-01T00:00:00+00:00", user_action="reject", predicted_species_id="sp_red")
    assert eng.validate_feedback(good) == {"ok": True, "valid": True, "problems": []}
    assert eng.validate_feedback({**good, "user_action": "correct"})["valid"] is False


def test_jsonable_handles_numpy_dataclasses_and_nonfinite():
    from dataclasses import dataclass

    @dataclass
    class D:
        a: np.ndarray
        b: np.float32

    out = jsonable({"x": D(np.arange(3), np.float32(1.5)), "n": float("nan"), "t": (1, 2), "i": np.int64(4)})
    assert out == {"x": {"a": [0, 1, 2], "b": 1.5}, "n": None, "t": [1, 2], "i": 4}
    json.dumps(out)


def test_build_reference_index_reports_failures():
    ex = FeatureExtractor(fake_embed)
    index, failures = build_reference_index(
        ex, [("r1", "sp", noise_image(seed=1)), ("r2", "sp", b"junk"), ("r3", "sp2", noise_image(seed=3))], image_ids=["i1", "i2", "i3"]
    )
    assert len(index) == 2 and failures[0]["reference_id"] == "r2"
    assert {m.image_id for m in index.search(fake_embed(np.random.default_rng(5).uniform(-1, 1, (1, 224, 224, 3)).astype(np.float32))[0], top_k=2)} == {"i1", "i3"}
