"""Tests for the identification-review adapter. Synthetic rows shaped like the Verde-Roatan review tables."""
import json

import pytest

from rootwise_ml_modules.feedback import FeedbackStore, apply_conversion, convert_review, convert_reviews, export_training_manifest
from rootwise_ml_modules.feedback.review_adapter import DEFAULT_MODEL_VERSION

NAMES = {"genus alpha": "sp_alpha", "genus beta": "sp_beta"}
resolve = lambda name: NAMES.get(" ".join(str(name).lower().split()))  # noqa: E731
USER = "11111111-1111-1111-1111-111111111111"
ADMIN = "99999999-9999-9999-9999-999999999999"


def review(**kw):
    r = {"id": "rev1", "submitted_by": USER, "image_path": "reviews/rev1.jpg", "ai_scientific_name": "Genus alpha",
         "proposed_scientific_name": None, "status": "pending", "verification_level": "ai_identified",
         "reviewed_by": None, "verified_by": None, "verified_at": None, "verification_basis": None,
         "created_at": "2026-11-05T12:00:00+00:00"}
    r.update(kw)
    return r


def conf(decision, cid="c1", corrected=None, ts="2026-11-05T12:30:00Z"):
    return {"id": cid, "decision": decision, "corrected_scientific_name": corrected, "created_at": ts, "user_id": USER}


def verified(**kw):
    base = dict(status="approved", verification_level="scientifically_verified", reviewed_by=ADMIN, verified_by=ADMIN,
                verified_at="2026-11-06T09:00:00+00:00", verification_basis="Checked against herbarium specimen 123")
    base.update(kw)
    return review(**base)


def test_decisions_map_to_actions_without_inventing_labels():
    c = convert_review(review(), [conf("confirmed", "a"), conf("not_my_plant", "b"), conf("almost", "c"), conf("corrected", "d", "Genus beta")], resolve_species=resolve)
    by = {r.feedback_id.rsplit(":", 1)[1]: r for r in c.records}
    assert by["a"].user_action == "confirm" and by["a"].predicted_species_id == "sp_alpha"
    assert by["b"].user_action == "reject" and by["c"].user_action == "reject" and by["c"].extra["user_decision"] == "almost"
    assert by["d"].user_action == "correct" and by["d"].corrected_species_id == "sp_beta"
    assert all(r.verification_status == "unverified" and not r.training_approved and r.model_version == DEFAULT_MODEL_VERSION for r in c.records)
    assert c.verifications == [] and c.skipped == []


def test_unresolved_unknown_and_degenerate_claims_are_skipped_with_reasons():
    c = convert_review(
        review(ai_scientific_name="Unknown plantus"),
        [conf("confirmed", "a"), conf("corrected", "b", "Not in catalog"), conf("corrected", "c", None), conf("corrected", "d", "Genus alpha"), conf("maybe", "e")],
        resolve_species=resolve,
    )
    reasons = {s["ref"].rsplit(":", 1)[1]: s["reason"] for s in c.skipped}
    assert reasons["a"] == "confirm_without_resolvable_ai_species" and reasons["b"] == "unresolved_species"
    assert reasons["c"] == "corrected_without_scientific_name" and reasons["e"].startswith("unknown_decision")
    assert [r.feedback_id.rsplit(":", 1)[1] for r in c.records] == ["d"]  # AI name unresolved, so 'Genus alpha' is a valid correction


def test_submitter_proposal_becomes_unverified_correction():
    c = convert_review(review(proposed_scientific_name="Genus beta"), resolve_species=resolve)
    assert [(r.user_action, r.corrected_species_id) for r in c.records] == [("correct", "sp_beta")]
    same = convert_review(review(proposed_scientific_name="genus  ALPHA"), resolve_species=resolve)
    assert same.records == []  # proposal equals the AI name: no new information


def test_admin_approval_alone_is_not_verification():
    c = convert_review(review(status="approved", reviewed_by=ADMIN, verification_level="user_confirmed"), [conf("confirmed")], resolve_species=resolve)
    assert c.verifications == [] and c.records[0].verification_status == "unverified"
    store = FeedbackStore(); apply_conversion(store, c)
    assert store.approved() == [] and len(store.unverified()) == 1


def test_scientific_verification_yields_verified_but_not_training_approved():
    store = FeedbackStore()
    c = convert_review(verified(), [conf("confirmed")], resolve_species=resolve)
    assert c.records[0].extra["review_verification"]["basis"].startswith("Checked against")
    assert apply_conversion(store, c) == {"added": 1, "already_present": 0, "verified": 1, "disputed": 0}
    rec = store.all()[0]
    assert rec.verification_status == "verified" and rec.verified_species_id == "sp_alpha" and rec.reviewer_id == ADMIN
    assert rec.training_approved is False and store.approved() == []        # still needs the explicit approval step
    store.approve_for_training(rec.feedback_id, approved_by="owner-1")
    assert [r.training_label for r in store.approved()] == ["sp_alpha"]


def test_ambiguous_verified_name_is_left_unverified_unless_policy_given():
    row = verified(proposed_scientific_name="Genus beta")
    default = convert_review(row, resolve_species=resolve)
    assert default.verifications == [] and any("cannot be determined" in w for w in default.warnings)
    for source, expected in (("ai", "sp_alpha"), ("proposed", "sp_beta")):
        c = convert_review(row, resolve_species=resolve, verified_label_source=source)
        assert [(v.status, v.verified_species_id) for v in c.verifications] == [("verified", expected)]
    agree = convert_review(verified(proposed_scientific_name="Genus alpha"), [conf("confirmed")], resolve_species=resolve)
    assert agree.verifications[0].verified_species_id == "sp_alpha"
    with pytest.raises(ValueError):
        convert_review(row, resolve_species=resolve, verified_label_source="guess")


@pytest.mark.parametrize("patch", [{"status": "pending"}, {"verification_basis": "short"}, {"verified_by": None}, {"verified_at": None}])
def test_inconsistent_verification_fields_are_not_trusted(patch):
    c = convert_review(verified(**patch), [conf("confirmed")], resolve_species=resolve)
    assert c.verifications == [] and any("left unverified" in w for w in c.warnings)


def test_admin_rejection_marks_records_disputed_and_never_trainable():
    store = FeedbackStore()
    c = convert_review(review(status="rejected", reviewed_by=ADMIN), [conf("confirmed")], resolve_species=resolve)
    assert apply_conversion(store, c)["disputed"] == 1
    rec = store.all()[0]
    assert rec.verification_status == "disputed" and rec.reviewer_id == ADMIN and store.approved() == []
    with pytest.raises(ValueError):
        store.approve_for_training(rec.feedback_id, approved_by="owner-1")


def test_apply_is_idempotent_and_batch_reports_bad_reviews():
    store = FeedbackStore()
    batch = convert_reviews([verified(), {"id": "", "image_path": ""}], {"rev1": [conf("confirmed")]}, resolve_species=resolve)
    assert len(batch.skipped) == 1 and "requires" in batch.skipped[0]["reason"]
    assert apply_conversion(store, batch)["added"] == 1
    again = apply_conversion(store, batch)
    assert again == {"added": 0, "already_present": 1, "verified": 0, "disputed": 0} and len(store) == 1


def test_bad_timestamp_is_skipped_and_user_ids_are_not_copied():
    c = convert_review(review(), [conf("confirmed", "a", ts="not-a-time"), conf("confirmed", "b")], resolve_species=resolve)
    assert [r.feedback_id.rsplit(":", 1)[1] for r in c.records] == ["b"] and c.skipped[0]["reason"].startswith("invalid_record")
    blob = json.dumps([r.to_dict() for r in c.records])
    assert USER not in blob and ADMIN not in blob
    naive = convert_review(review(created_at="2026-11-05T12:00:00"), [conf("confirmed", "n", ts=None)], resolve_species=resolve)
    assert naive.records == [] and naive.skipped


def test_manifest_from_verified_review_requires_rights_clearance(tmp_path):
    store = FeedbackStore()
    apply_conversion(store, convert_review(verified(), [conf("confirmed")], resolve_species=resolve))
    store.approve_for_training(store.all()[0].feedback_id, approved_by="owner-1")
    summary = export_training_manifest(store.approved(), str(tmp_path / "m.json"), image_path_resolver=lambda i: "/data/" + i, created_at="2026-11-10T00:00:00+00:00")
    doc = json.loads((tmp_path / "m.json").read_text())
    assert summary["entry_count"] == 1 and doc["entries"][0]["license"] is None  # no licence recorded -> must be cleared before training
