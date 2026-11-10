"""Identify repeated identification-error patterns from feedback."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

from .records import FeedbackRecord


@dataclass(frozen=True)
class ErrorPattern:
    predicted_species_id: str
    actual_species_id: str  # reviewer label if verified; user suggestion otherwise (see basis)
    count: int
    basis: str  # "verified" | "user_suggested_unverified"
    feedback_ids: List[str]
    by_model_version: Dict[str, int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "predicted_species_id": self.predicted_species_id,
            "actual_species_id": self.actual_species_id,
            "count": self.count,
            "basis": self.basis,
            "feedback_ids": self.feedback_ids,
            "by_model_version": self.by_model_version,
        }


def find_repeated_errors(
    records: Iterable[FeedbackRecord], *, min_count: int = 2, verified_only: bool = True
) -> List[ErrorPattern]:
    """Count (predicted -> actual) confusions occurring at least ``min_count`` times.

    With ``verified_only=True`` (default) only reviewer-verified labels are used. With
    ``False`` user-suggested corrections are included but labelled
    ``user_suggested_unverified`` and are never mixed with verified counts.
    """
    if min_count < 1:
        raise ValueError("min_count must be >= 1.")
    groups: Dict[tuple, List[FeedbackRecord]] = defaultdict(list)
    for r in records:
        if not r.predicted_species_id:
            continue
        if r.verification_status == "verified" and r.verified_species_id:
            if r.verified_species_id != r.predicted_species_id:
                groups[(r.predicted_species_id, r.verified_species_id, "verified")].append(r)
        elif not verified_only and r.verification_status == "unverified" and r.corrected_species_id:
            groups[(r.predicted_species_id, r.corrected_species_id, "user_suggested_unverified")].append(r)
    out = []
    for (pred, actual, basis), recs in groups.items():
        if len(recs) >= min_count:
            out.append(
                ErrorPattern(
                    pred, actual, len(recs), basis,
                    sorted(x.feedback_id for x in recs),
                    dict(Counter(x.model_version for x in recs)),
                )
            )
    out.sort(key=lambda p: (-p.count, p.predicted_species_id, p.actual_species_id, p.basis))
    return out
