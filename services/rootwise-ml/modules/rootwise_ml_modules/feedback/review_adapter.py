"""Adapter: Verde-Roatan ``identification_reviews`` / ``identification_confirmations`` rows -> FeedbackRecords.

Source schema: ``supabase/separate-review-db/identification_review_schema.sql`` plus
``supabase/review-project/20261105_identification_verification.sql``.

Rules carried over from the repository (not invented here):
* ``status = 'approved'`` only accepts a submission into the community dataset; it is NOT verification.
* Only ``verification_level = 'scientifically_verified'`` (admin + written basis >= 10 chars) can become a
  verified record. A user's "confirmed" is evidence, never verification.
* Nothing here sets ``training_approved``; that stays a separate, explicit step (``FeedbackStore.approve_for_training``).
* Species are resolved through a caller-supplied resolver; unresolved names are skipped, never invented.
* The review tables record the AI *name* but not which name an administrator verified when the AI name and the
  submitter's proposed name differ. By default such reviews are left unverified (``verified_label_source``).
* User identifiers are NOT copied into records. No licence is recorded in the review tables, so exported
  manifests will lack one until rights are cleared.

Pure Python; no database access. NOT run against live data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

from .records import FeedbackRecord, FeedbackValidationError, _parse_ts
from .store import FeedbackStore

DEFAULT_MODEL_VERSION = "gemini:unrecorded"  # the review rows hold ai_model (free text) at best; version is not recorded
VERIFIED_LABEL_SOURCES = ("reject_ambiguous", "ai", "proposed")
_DECISION_TO_ACTION = {"confirmed": "confirm", "corrected": "correct", "not_my_plant": "reject", "almost": "reject"}

SpeciesResolver = Callable[[str], Optional[str]]


@dataclass(frozen=True)
class PlannedVerification:
    """A reviewer decision to apply with ``FeedbackStore.verify`` after the record has been added."""

    feedback_id: str
    status: str  # "verified" | "disputed"
    reviewer_id: str
    verified_species_id: Optional[str] = None


@dataclass
class ReviewConversion:
    records: List[FeedbackRecord] = field(default_factory=list)  # all unverified and not training-approved
    verifications: List[PlannedVerification] = field(default_factory=list)
    skipped: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def extend(self, other: "ReviewConversion") -> None:
        self.records += other.records
        self.verifications += other.verifications
        self.skipped += other.skipped
        self.warnings += other.warnings


def _clean(v: Any) -> Optional[str]:
    s = str(v).strip() if v is not None else ""
    return s or None


def _verified_label(ai_name: Optional[str], proposed: Optional[str], resolve: SpeciesResolver, source: str) -> Optional[str]:
    ai_id = resolve(ai_name) if ai_name else None
    prop_id = resolve(proposed) if proposed else None
    if proposed and ai_name:
        if ai_id and prop_id and ai_id == prop_id:
            return ai_id
        return {"ai": ai_id, "proposed": prop_id}.get(source)  # "reject_ambiguous" -> None
    return prop_id if proposed else ai_id


def convert_review(
    review: Mapping[str, Any],
    confirmations: Sequence[Mapping[str, Any]] = (),
    *,
    resolve_species: SpeciesResolver,
    model_version: str = DEFAULT_MODEL_VERSION,
    verified_label_source: str = "reject_ambiguous",
) -> ReviewConversion:
    """Convert one review (+ its confirmations) into unverified feedback records and planned verifications."""
    if verified_label_source not in VERIFIED_LABEL_SOURCES:
        raise ValueError(f"verified_label_source must be one of {VERIFIED_LABEL_SOURCES}")
    rid = _clean(review.get("id"))
    image_id = _clean(review.get("image_path"))
    if not rid or not image_id:
        raise ValueError("review requires 'id' and 'image_path'")
    out = ReviewConversion()
    ai_name = _clean(review.get("ai_scientific_name"))
    proposed = _clean(review.get("proposed_scientific_name"))
    predicted = resolve_species(ai_name) if ai_name else None
    status = _clean(review.get("status")) or "pending"
    level = _clean(review.get("verification_level")) or "ai_identified"

    # --- plan the reviewer decision first (it is stored on each record's `extra`)
    plan_status: Optional[str] = None
    plan_reviewer: Optional[str] = None
    plan_label: Optional[str] = None
    extra_verif: Optional[Dict[str, Any]] = None
    if status == "rejected" and _clean(review.get("reviewed_by")):
        plan_status, plan_reviewer = "disputed", str(review["reviewed_by"])
    elif level == "scientifically_verified":
        basis = _clean(review.get("verification_basis")) or ""
        vby = _clean(review.get("verified_by"))
        if not (status == "approved" and vby and _clean(review.get("verified_at")) and len(basis) >= 10):
            out.warnings.append(f"review {rid}: scientifically_verified without approved status, verifier, time and >=10-char basis; left unverified")
        else:
            label = _verified_label(ai_name, proposed, resolve_species, verified_label_source)
            if label is None:
                out.warnings.append(
                    f"review {rid}: verified label cannot be determined (AI and proposed names differ or are unresolved; "
                    f"verified_label_source={verified_label_source!r}); left unverified"
                )
            else:
                plan_status, plan_reviewer, plan_label = "verified", vby, label
                extra_verif = {"level": level, "basis": basis[:1000], "verified_at": str(review.get("verified_at"))}

    base_ts = _clean(review.get("created_at"))
    claims: List[Dict[str, Any]] = []
    for i, c in enumerate(sorted(confirmations, key=lambda x: (str(x.get("created_at") or ""), str(x.get("id") or "")))):
        decision = _clean(c.get("decision"))
        action = _DECISION_TO_ACTION.get(decision or "")
        cid = _clean(c.get("id")) or str(i)
        if action is None:
            out.skipped.append({"ref": f"confirmation:{cid}", "reason": f"unknown_decision:{decision}"})
            continue
        claim = {"fid": f"identification_review:{rid}:confirmation:{cid}", "action": action, "decision": decision,
                 "ts": _clean(c.get("created_at")) or base_ts, "corrected": None}
        if action == "correct":
            name = _clean(c.get("corrected_scientific_name"))
            corrected = resolve_species(name) if name else None
            if not name:
                out.skipped.append({"ref": claim["fid"], "reason": "corrected_without_scientific_name"}); continue
            if corrected is None:
                out.skipped.append({"ref": claim["fid"], "reason": "unresolved_species"}); continue
            claim["corrected"] = corrected
        if action == "confirm" and predicted is None:
            out.skipped.append({"ref": claim["fid"], "reason": "confirm_without_resolvable_ai_species"}); continue
        claims.append(claim)
    if proposed:
        pid = resolve_species(proposed)
        if pid is None:
            out.skipped.append({"ref": f"identification_review:{rid}:proposal", "reason": "unresolved_species"})
        elif pid != predicted:
            claims.append({"fid": f"identification_review:{rid}:proposal", "action": "correct", "decision": "proposed",
                           "ts": base_ts, "corrected": pid})

    for cl in claims:
        extra: Dict[str, Any] = {"origin": "identification_reviews", "review_id": rid, "user_decision": cl["decision"],
                                 "review_status": status, "verification_level": level}
        if extra_verif:
            extra["review_verification"] = extra_verif
        try:
            _parse_ts(cl["ts"] or "")
            rec = FeedbackRecord(
                feedback_id=cl["fid"], image_id=image_id, source_id=f"identification_review:{rid}", model_version=model_version,
                timestamp=cl["ts"], user_action=cl["action"], predicted_species_id=predicted,
                corrected_species_id=cl["corrected"], extra=extra,
            ).validate()
        except (FeedbackValidationError, ValueError) as exc:
            out.skipped.append({"ref": cl["fid"], "reason": f"invalid_record:{str(exc)[:100]}"})
            continue
        out.records.append(rec)
        if plan_status:
            out.verifications.append(PlannedVerification(rec.feedback_id, plan_status, str(plan_reviewer), plan_label))
    if plan_status and not out.records:
        out.warnings.append(f"review {rid}: reviewer decision present but no usable feedback records were produced")
    return out


def convert_reviews(
    reviews: Sequence[Mapping[str, Any]],
    confirmations_by_review: Mapping[str, Sequence[Mapping[str, Any]]],
    **kwargs: Any,
) -> ReviewConversion:
    """Batch form. A malformed review is reported in ``skipped`` instead of aborting the batch."""
    total = ReviewConversion()
    for r in reviews:
        try:
            total.extend(convert_review(r, confirmations_by_review.get(str(r.get("id")), ()), **kwargs))
        except ValueError as exc:
            total.skipped.append({"ref": f"review:{r.get('id')}", "reason": str(exc)[:100]})
    return total


def apply_conversion(store: FeedbackStore, conversion: ReviewConversion) -> Dict[str, int]:
    """Add records to ``store`` and apply planned verifications. Idempotent; never approves for training."""
    added = 0
    new_ids = set()
    for rec in conversion.records:
        try:
            store.add(rec)
        except ValueError:  # duplicate feedback_id: already imported
            continue
        added += 1
        new_ids.add(rec.feedback_id)
    verified = disputed = 0
    for v in conversion.verifications:
        if v.feedback_id not in new_ids:
            continue
        store.verify(v.feedback_id, reviewer_id=v.reviewer_id, verified_species_id=v.verified_species_id, status=v.status)
        verified += v.status == "verified"
        disputed += v.status == "disputed"
    return {"added": added, "already_present": len(conversion.records) - added, "verified": verified, "disputed": disputed}
