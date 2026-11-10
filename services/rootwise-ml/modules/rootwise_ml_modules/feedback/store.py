"""In-memory feedback store with JSONL persistence and an explicit verify -> approve workflow."""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import replace
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Union

from .records import FeedbackRecord, FeedbackValidationError


class FeedbackStore:
    """Holds validated feedback. Records are immutable; updates create replaced copies."""

    def __init__(self) -> None:
        self._records: Dict[str, FeedbackRecord] = {}

    def __len__(self) -> int:
        return len(self._records)

    def get(self, feedback_id: str) -> Optional[FeedbackRecord]:
        return self._records.get(feedback_id)

    def all(self) -> List[FeedbackRecord]:
        return [self._records[k] for k in sorted(self._records)]

    def add(self, record: Union[FeedbackRecord, Mapping]) -> FeedbackRecord:
        """Validate and add. New feedback is always stored unverified and not approved."""
        rec = record if isinstance(record, FeedbackRecord) else FeedbackRecord.from_dict(record)
        rec.validate()
        if rec.feedback_id in self._records:
            raise ValueError(f"Duplicate feedback_id: {rec.feedback_id!r}")
        if rec.verification_status != "unverified" or rec.training_approved or rec.verified_species_id:
            raise FeedbackValidationError(
                ["new feedback must be unverified and unapproved; use verify() and approve_for_training()"]
            )
        self._records[rec.feedback_id] = rec
        return rec

    def verify(
        self,
        feedback_id: str,
        *,
        reviewer_id: str,
        verified_species_id: Optional[str] = None,
        status: str = "verified",
    ) -> FeedbackRecord:
        """Record a reviewer decision. ``status='disputed'`` keeps the record out of training."""
        rec = self._require(feedback_id)
        if not reviewer_id:
            raise ValueError("reviewer_id is required.")
        if status not in ("verified", "disputed"):
            raise ValueError("status must be 'verified' or 'disputed'.")
        if status == "verified" and not verified_species_id:
            raise ValueError("verified_species_id is required to verify.")
        new = replace(
            rec,
            reviewer_id=reviewer_id,
            verification_status=status,
            verified_species_id=verified_species_id if status == "verified" else None,
            training_approved=False,
            approved_by=None,
        ).validate()
        self._records[feedback_id] = new
        return new

    def approve_for_training(self, feedback_id: str, *, approved_by: str) -> FeedbackRecord:
        """Approve a VERIFIED record's reviewer label for training."""
        rec = self._require(feedback_id)
        if rec.verification_status != "verified":
            raise ValueError("Only verified feedback can be approved for training.")
        if not approved_by:
            raise ValueError("approved_by is required.")
        new = replace(rec, training_approved=True, approved_by=approved_by).validate()
        self._records[feedback_id] = new
        return new

    def unverified(self) -> List[FeedbackRecord]:
        return [r for r in self.all() if r.verification_status == "unverified"]

    def approved(self) -> List[FeedbackRecord]:
        """Records carrying an approved, reviewer-verified training label."""
        return [r for r in self.all() if r.training_label is not None]

    def _require(self, feedback_id: str) -> FeedbackRecord:
        rec = self._records.get(feedback_id)
        if rec is None:
            raise KeyError(f"Unknown feedback_id: {feedback_id!r}")
        return rec

    def save_jsonl(self, path: str) -> None:
        """Atomically write all records as JSON lines (sorted by feedback_id)."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                for r in self.all():
                    fh.write(json.dumps(r.to_dict(), sort_keys=True) + "\n")
            os.replace(tmp, p)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    @classmethod
    def load_jsonl(cls, path: str) -> "FeedbackStore":
        """Load and re-validate every record; raises with the offending line number."""
        store = cls()
        p = Path(path)
        if not p.is_file():
            raise FileNotFoundError(f"Feedback file not found: {p}")
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                rec = FeedbackRecord.from_dict(json.loads(line))
            except (json.JSONDecodeError, FeedbackValidationError) as exc:
                raise ValueError(f"{p}:{n}: {exc}") from exc
            if rec.feedback_id in store._records:
                raise ValueError(f"{p}:{n}: duplicate feedback_id {rec.feedback_id!r}")
            store._records[rec.feedback_id] = rec
        return store
