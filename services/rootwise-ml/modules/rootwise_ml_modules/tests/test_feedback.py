import json

import pytest

from rootwise_ml_modules.feedback import (
    FeedbackRecord,
    FeedbackStore,
    FeedbackValidationError,
    export_training_manifest,
    find_repeated_errors,
    validate_feedback_dict,
)

TS = "2026-01-01T12:00:00+00:00"


def raw(i="f1", **kw):
    d = dict(feedback_id=i, image_id=f"img_{i}", source_id="src1", model_version="rootwise_mobilenetv3_512d_v1",
             timestamp=TS, user_action="reject", predicted_species_id="sp_a")
    d.update(kw)
    return d


def test_valid_records_and_fields_preserved():
    r = FeedbackRecord.from_dict(raw(user_action="correct", corrected_species_id="sp_b", extra={"license": "CC0"}))
    assert (r.image_id, r.source_id, r.model_version, r.timestamp) == ("img_f1", "src1", "rootwise_mobilenetv3_512d_v1", TS)
    assert r.verification_status == "unverified" and r.training_label is None
    assert FeedbackRecord.from_dict(raw(timestamp="2026-01-01T12:00:00Z")).timestamp.endswith("Z")


@pytest.mark.parametrize(
    "patch",
    [
        {"timestamp": "2026-01-01T12:00:00"},       # no timezone
        {"timestamp": "yesterday"},
        {"user_action": "maybe"},
        {"user_action": "confirm", "corrected_species_id": "sp_b"},
        {"user_action": "confirm", "predicted_species_id": None},
        {"user_action": "correct"},
        {"user_action": "correct", "corrected_species_id": "sp_a"},
        {"verification_status": "verified"},         # no reviewer / label
        {"verification_status": "unverified", "verified_species_id": "sp_b"},
        {"training_approved": True},
        {"image_id": " "},
        {"extra": "nope"},
    ],
)
def test_invalid_records(patch):
    with pytest.raises(FeedbackValidationError):
        FeedbackRecord.from_dict(raw(**patch))


def test_unknown_and_missing_fields():
    with pytest.raises(FeedbackValidationError):
        FeedbackRecord.from_dict(raw(surprise=1))
    d = raw()
    del d["image_id"]
    with pytest.raises(FeedbackValidationError):
        FeedbackRecord.from_dict(d)
    assert validate_feedback_dict(raw()) == {"valid": True, "problems": []}
    res = validate_feedback_dict(raw(user_action="correct"))
    assert res["valid"] is False and res["problems"]


def test_rejection_is_not_a_verified_correction():
    store = FeedbackStore()
    store.add(raw("f1", user_action="reject", corrected_species_id="sp_user_guess"))
    r = store.get("f1")
    assert r.training_label is None and store.approved() == [] and len(store.unverified()) == 1
    with pytest.raises(ValueError):
        store.approve_for_training("f1", approved_by="admin")  # cannot approve unverified feedback
    store.verify("f1", reviewer_id="rev1", verified_species_id="sp_reviewer")
    assert store.approved() == []  # verified but not yet approved
    store.approve_for_training("f1", approved_by="admin")
    assert store.approved()[0].training_label == "sp_reviewer"  # reviewer's label, never the user's guess


def test_store_rejects_pre_verified_and_duplicates():
    store = FeedbackStore()
    pre = FeedbackRecord(**raw("f9", verification_status="verified", reviewer_id="r", verified_species_id="sp_x"))
    with pytest.raises(FeedbackValidationError):
        store.add(pre)
    store.add(raw("f1"))
    with pytest.raises(ValueError):
        store.add(raw("f1"))
    with pytest.raises(KeyError):
        store.verify("nope", reviewer_id="r", verified_species_id="x")
    with pytest.raises(ValueError):
        store.verify("f1", reviewer_id="", verified_species_id="x")
    with pytest.raises(ValueError):
        store.verify("f1", reviewer_id="r")  # no label


def test_disputed_and_reverification_clear_approval():
    store = FeedbackStore()
    store.add(raw("f1"))
    store.verify("f1", reviewer_id="r1", verified_species_id="sp_b")
    store.approve_for_training("f1", approved_by="admin")
    assert len(store.approved()) == 1
    store.verify("f1", reviewer_id="r2", status="disputed")
    assert store.approved() == [] and store.get("f1").verified_species_id is None


def approved_store(order):
    store = FeedbackStore()
    for i, label in order:
        store.add(raw(i, extra={"license": "CC0-test"}))
        store.verify(i, reviewer_id="rev", verified_species_id=label)
        store.approve_for_training(i, approved_by="admin")
    return store


def test_manifest_export_is_deterministic_and_filters(tmp_path):
    items = [("f1", "sp_a"), ("f2", "sp_b"), ("f3", "sp_c")]
    s1, s2 = approved_store(items), approved_store(list(reversed(items)))
    s1.add(raw("f_unverified", extra={"license": "CC0"}))  # must not be exported
    p1, p2 = tmp_path / "m1.json", tmp_path / "m2.json"
    a = export_training_manifest(s1.all(), str(p1), created_at="2026-01-01T00:00:00Z")
    b = export_training_manifest(s2.all(), str(p2), created_at="2030-05-05T00:00:00Z")
    assert a["content_sha256"] == b["content_sha256"] and a["entry_count"] == 3 and a["skipped_not_approved"] == 1
    doc = json.loads(p1.read_text())
    assert doc["manifest_format"] == "rootwise_feedback_manifest_v1"
    assert [e["image_id"] for e in doc["entries"]] == ["img_f1", "img_f2", "img_f3"]
    e0 = doc["entries"][0]
    assert e0["species_id"] == "sp_a" and e0["license"] == "CC0-test" and e0["group_id"] == "src1"
    assert e0["model_version_at_prediction"] == "rootwise_mobilenetv3_512d_v1" and e0["feedback_timestamp"] == TS


def test_manifest_conflicts_and_resolver(tmp_path):
    store = FeedbackStore()
    for fid, label in (("fa", "sp_a"), ("fb", "sp_b")):
        store.add(raw(fid, image_id="same_img"))
        store.verify(fid, reviewer_id="rev", verified_species_id=label)
        store.approve_for_training(fid, approved_by="admin")
    res = export_training_manifest(store.all(), str(tmp_path / "m.json"))
    assert res["entry_count"] == 0 and res["conflicts"][0]["labels"] == ["sp_a", "sp_b"]
    ok = approved_store([("f1", "sp_a")])
    res2 = export_training_manifest(ok.all(), str(tmp_path / "m2.json"), image_path_resolver=lambda i: f"imgs/{i}.jpg")
    assert json.loads((tmp_path / "m2.json").read_text())["entries"][0]["image_path"] == "imgs/img_f1.jpg"
    assert res2["entry_count"] == 1


def test_manifest_loadable_by_training_module(tmp_path):
    from rootwise_ml_modules.training import load_manifest

    ok = approved_store([("f1", "sp_a")])
    export_training_manifest(ok.all(), str(tmp_path / "m.json"), image_path_resolver=lambda i: f"{i}.jpg")
    entries = load_manifest(str(tmp_path / "m.json"))
    assert entries[0].species_id == "sp_a" and entries[0].license == "CC0-test" and entries[0].group_id == "src1"


def test_repeated_error_patterns():
    store = FeedbackStore()
    for i in range(3):
        store.add(raw(f"v{i}", predicted_species_id="sp_a"))
        store.verify(f"v{i}", reviewer_id="r", verified_species_id="sp_b")
    store.add(raw("single", predicted_species_id="sp_c"))
    store.verify("single", reviewer_id="r", verified_species_id="sp_d")
    for i in range(2):
        store.add(raw(f"u{i}", predicted_species_id="sp_a", user_action="correct", corrected_species_id="sp_e"))
    verified = find_repeated_errors(store.all())
    assert [(p.predicted_species_id, p.actual_species_id, p.count, p.basis) for p in verified] == [("sp_a", "sp_b", 3, "verified")]
    both = find_repeated_errors(store.all(), verified_only=False)
    assert [(p.actual_species_id, p.basis) for p in both] == [("sp_b", "verified"), ("sp_e", "user_suggested_unverified")]
    assert find_repeated_errors(store.all(), min_count=1)[-1].count == 1
    with pytest.raises(ValueError):
        find_repeated_errors(store.all(), min_count=0)
    assert verified[0].by_model_version == {"rootwise_mobilenetv3_512d_v1": 3}


def test_jsonl_roundtrip_and_corruption(tmp_path):
    store = approved_store([("f1", "sp_a"), ("f2", "sp_b")])
    p = tmp_path / "fb.jsonl"
    store.save_jsonl(str(p))
    loaded = FeedbackStore.load_jsonl(str(p))
    assert [r.to_dict() for r in loaded.all()] == [r.to_dict() for r in store.all()]
    assert len(loaded.approved()) == 2
    bad = tmp_path / "bad.jsonl"
    bad.write_text(p.read_text() + '{"feedback_id": "x"}\n')
    with pytest.raises(ValueError, match="bad.jsonl:3"):
        FeedbackStore.load_jsonl(str(bad))
    with pytest.raises(FileNotFoundError):
        FeedbackStore.load_jsonl(str(tmp_path / "none.jsonl"))
