"""Feedback record schema and validation.

Principles
* A user's rejection or suggested correction is stored as UNVERIFIED feedback.
* Only a record that has been verified by an identified reviewer AND explicitly approved
  carries a training label, and that label is the reviewer's ``verified_species_id`` - never
  the user's suggestion.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional

USER_ACTIONS = ("confirm", "correct", "reject")
VERIFICATION_STATUSES = ("unverified", "verified", "disputed")


class FeedbackValidationError(ValueError):
    """Raised with a list of problems when a feedback record is invalid."""

    def __init__(self, problems: List[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timestamp must include a timezone offset")
    return dt


@dataclass(frozen=True)
class FeedbackRecord:
    feedback_id: str
    image_id: str
    source_id: str
    model_version: str
    timestamp: str  # ISO-8601 with timezone
    user_action: str  # confirm | correct | reject
    predicted_species_id: Optional[str] = None
    corrected_species_id: Optional[str] = None  # user-suggested; NOT a verified label
    reviewer_id: Optional[str] = None
    verification_status: str = "unverified"
    verified_species_id: Optional[str] = None  # reviewer's final label
    training_approved: bool = False
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def problems(self) -> List[str]:
        p: List[str] = []
        for name in ("feedback_id", "image_id", "source_id", "model_version"):
            v = getattr(self, name)
            if not isinstance(v, str) or not v.strip():
                p.append(f"{name} must be a non-empty string")
        try:
            _parse_ts(self.timestamp)
        except Exception as exc:
            p.append(f"timestamp invalid: {exc}")
        if self.user_action not in USER_ACTIONS:
            p.append(f"user_action must be one of {USER_ACTIONS}")
        if self.verification_status not in VERIFICATION_STATUSES:
            p.append(f"verification_status must be one of {VERIFICATION_STATUSES}")
        if self.user_action == "confirm":
            if not self.predicted_species_id:
                p.append("confirm requires predicted_species_id")
            if self.corrected_species_id:
                p.append("confirm must not carry corrected_species_id")
        if self.user_action == "correct":
            if not self.corrected_species_id:
                p.append("correct requires corrected_species_id")
            elif self.corrected_species_id == self.predicted_species_id:
                p.append("corrected_species_id equals predicted_species_id")
        if self.user_action == "reject" and self.corrected_species_id and self.corrected_species_id == self.predicted_species_id:
            p.append("corrected_species_id equals predicted_species_id")
        if self.verification_status == "verified":
            if not self.reviewer_id:
                p.append("verified status requires reviewer_id")
            if not self.verified_species_id:
                p.append("verified status requires verified_species_id")
        elif self.verified_species_id:
            p.append("verified_species_id is only allowed when verification_status is 'verified'")
        if self.training_approved:
            if self.verification_status != "verified":
                p.append("training_approved requires verification_status 'verified'")
            if not self.approved_by:
                p.append("training_approved requires approved_by")
        if not isinstance(self.extra, dict):
            p.append("extra must be a dict")
        return p

    def validate(self) -> "FeedbackRecord":
        problems = self.problems()
        if problems:
            raise FeedbackValidationError(problems)
        return self

    @property
    def training_label(self) -> Optional[str]:
        """The species label usable for training, or ``None``. Never derived from user input."""
        if self.training_approved and self.verification_status == "verified":
            return self.verified_species_id
        return None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "FeedbackRecord":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        unknown = set(d) - known
        if unknown:
            raise FeedbackValidationError([f"unknown fields: {sorted(unknown)}"])
        missing = [k for k in ("feedback_id", "image_id", "source_id", "model_version", "timestamp", "user_action") if k not in d]
        if missing:
            raise FeedbackValidationError([f"missing required fields: {missing}"])
        return cls(**dict(d)).validate()


def validate_feedback_dict(d: Mapping[str, Any]) -> Dict[str, Any]:
    """Validate a raw dict; return ``{"valid": bool, "problems": [...]}`` (never raises)."""
    try:
        FeedbackRecord.from_dict(d)
        return {"valid": True, "problems": []}
    except FeedbackValidationError as exc:
        return {"valid": False, "problems": exc.problems}
    except TypeError as exc:
        return {"valid": False, "problems": [str(exc)]}
