"""Aggregate multi-reference evidence into a ranked, explainable species candidate list.

No thresholds are built in. Accept/ambiguous/unknown decisions require a
:class:`DecisionPolicy` whose values the caller derived from measured validation data
(see the ``uncertainty`` module). Without a policy the decision is always ``review``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

from ..contract import SIMILARITY_NOTE
from .catalog import SpeciesCatalog

AGGREGATIONS = ("top_n_mean", "max", "mean")


@dataclass(frozen=True)
class ReferenceEvidence:
    """Similarity of the query image to one reference image of a species."""

    reference_id: str
    species_id: str
    similarity: float
    image_id: Optional[str] = None


@dataclass(frozen=True)
class RankingConfig:
    """How evidence is aggregated per species."""

    aggregation: str = "top_n_mean"
    top_n: int = 3
    max_candidates: Optional[int] = None

    def __post_init__(self) -> None:
        if self.aggregation not in AGGREGATIONS:
            raise ValueError(f"aggregation must be one of {AGGREGATIONS}.")
        if self.top_n < 1:
            raise ValueError("top_n must be >= 1.")
        if self.max_candidates is not None and self.max_candidates < 1:
            raise ValueError("max_candidates must be >= 1 or None.")


@dataclass(frozen=True)
class DecisionPolicy:
    """Decision thresholds. Must come from measured validation data (never hard-coded guesses).

    ``source`` documents where the numbers came from (e.g. a validation dataset id).
    """

    min_top_score: float
    min_margin: float
    source: str
    ambiguity_margin: Optional[float] = None  # defaults to min_margin
    min_supporting_references: int = 1

    def __post_init__(self) -> None:
        for name in ("min_top_score", "min_margin"):
            v = getattr(self, name)
            if not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError(f"{name} must be a finite number.")
        if self.min_margin < 0:
            raise ValueError("min_margin must be >= 0.")
        if self.ambiguity_margin is not None and self.ambiguity_margin < 0:
            raise ValueError("ambiguity_margin must be >= 0.")
        if self.min_supporting_references < 1:
            raise ValueError("min_supporting_references must be >= 1.")
        if not self.source:
            raise ValueError("source must describe where the thresholds were measured.")

    @property
    def effective_ambiguity_margin(self) -> float:
        return self.min_margin if self.ambiguity_margin is None else self.ambiguity_margin

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "DecisionPolicy":
        return cls(
            min_top_score=float(d["min_top_score"]),
            min_margin=float(d["min_margin"]),
            source=str(d["source"]),
            ambiguity_margin=None if d.get("ambiguity_margin") is None else float(d["ambiguity_margin"]),
            min_supporting_references=int(d.get("min_supporting_references", 1)),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "min_top_score": self.min_top_score,
            "min_margin": self.min_margin,
            "ambiguity_margin": self.ambiguity_margin,
            "min_supporting_references": self.min_supporting_references,
            "source": self.source,
        }


@dataclass
class RankedCandidate:
    rank: int
    species_id: str
    aggregated_score: float
    n_references: int
    supporting_references: List[Dict[str, Any]]
    species: Optional[Dict[str, Any]]
    explanation: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rank": self.rank,
            "species_id": self.species_id,
            "aggregated_score": self.aggregated_score,
            "score_type": "aggregated_cosine_similarity_uncalibrated",
            "n_references": self.n_references,
            "supporting_references": self.supporting_references,
            "species": self.species,
            "explanation": self.explanation,
        }


@dataclass
class RankingResult:
    decision: str  # "accept" | "ambiguous" | "review" | "unknown"
    reasons: List[str]
    candidates: List[RankedCandidate]
    ambiguous_groups: List[List[str]]
    policy: Optional[Dict[str, Any]]
    config: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)

    @property
    def top(self) -> Optional[RankedCandidate]:
        return self.candidates[0] if self.candidates else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "decision": self.decision,
            "reasons": self.reasons,
            "candidates": [c.to_dict() for c in self.candidates],
            "ambiguous_groups": self.ambiguous_groups,
            "policy": self.policy,
            "config": self.config,
            "warnings": self.warnings,
            "note": SIMILARITY_NOTE,
        }


def _aggregate(sims: Sequence[float], config: RankingConfig) -> float:
    ordered = sorted(sims, reverse=True)
    if config.aggregation == "max":
        return ordered[0]
    if config.aggregation == "mean":
        return sum(ordered) / len(ordered)
    used = ordered[: config.top_n]
    return sum(used) / len(used)


def identify_ambiguous_groups(candidates: Sequence[RankedCandidate], margin: float) -> List[List[str]]:
    """Group candidates whose aggregated score is within ``margin`` of the top candidate.

    Returns ``[]`` or a single group ``[top, ...close competitors]`` (length >= 2).
    """
    if margin < 0:
        raise ValueError("margin must be >= 0.")
    if len(candidates) < 2:
        return []
    top = candidates[0].aggregated_score
    group = [c.species_id for c in candidates if top - c.aggregated_score <= margin]
    return [group] if len(group) >= 2 else []


def rank_candidates(
    evidence: Iterable[ReferenceEvidence],
    catalog: Optional[SpeciesCatalog] = None,
    *,
    config: RankingConfig = RankingConfig(),
    policy: Optional[DecisionPolicy] = None,
    candidate_species_ids: Optional[Iterable[str]] = None,
) -> RankingResult:
    """Rank candidate species from reference-level similarity evidence.

    Evidence is de-duplicated by ``reference_id`` (highest similarity kept), optionally
    restricted to ``candidate_species_ids``, aggregated per species, sorted, and then a
    decision is made using ``policy`` (if any).
    """
    warnings: List[str] = []
    allowed = None if candidate_species_ids is None else set(candidate_species_ids)
    best: Dict[str, ReferenceEvidence] = {}
    for ev in evidence:
        if not isinstance(ev.similarity, (int, float)) or not math.isfinite(ev.similarity):
            raise ValueError(f"Non-finite similarity for reference {ev.reference_id!r}.")
        if not -1.0 - 1e-6 <= ev.similarity <= 1.0 + 1e-6:
            raise ValueError(f"Similarity {ev.similarity} for {ev.reference_id!r} outside [-1, 1].")
        if not ev.species_id or not ev.reference_id:
            raise ValueError("Evidence requires non-empty species_id and reference_id.")
        if allowed is not None and ev.species_id not in allowed:
            continue
        cur = best.get(ev.reference_id)
        if cur is None or ev.similarity > cur.similarity:
            best[ev.reference_id] = ev

    by_species: Dict[str, List[ReferenceEvidence]] = {}
    for ev in best.values():
        by_species.setdefault(ev.species_id, []).append(ev)

    rows = []
    for sid, evs in by_species.items():
        evs_sorted = sorted(evs, key=lambda e: (-e.similarity, e.reference_id))
        rows.append((sid, _aggregate([e.similarity for e in evs_sorted], config), evs_sorted))
    rows.sort(key=lambda r: (-r[1], r[0]))
    if config.max_candidates is not None:
        rows = rows[: config.max_candidates]

    candidates: List[RankedCandidate] = []
    top_score = rows[0][1] if rows else 0.0
    for i, (sid, score, evs) in enumerate(rows):
        info = catalog.get(sid) if catalog is not None else None
        if catalog is not None and info is None:
            warnings.append(f"species_id {sid!r} not found in catalogue.")
        n_used = len(evs) if config.aggregation == "mean" else (1 if config.aggregation == "max" else min(config.top_n, len(evs)))
        candidates.append(
            RankedCandidate(
                rank=i + 1,
                species_id=sid,
                aggregated_score=float(score),
                n_references=len(evs),
                supporting_references=[
                    {"reference_id": e.reference_id, "image_id": e.image_id, "cosine_similarity": float(e.similarity)}
                    for e in evs[: max(n_used, 1)]
                ],
                species=info.to_dict() if info else None,
                explanation={
                    "aggregation": config.aggregation,
                    "top_n": config.top_n if config.aggregation == "top_n_mean" else None,
                    "references_used": n_used,
                    "references_total": len(evs),
                    "gap_to_top": float(top_score - score),
                },
            )
        )

    reasons: List[str] = []
    groups: List[List[str]] = []
    if not candidates:
        return RankingResult("unknown", ["no_evidence"], [], [], policy.to_dict() if policy else None, _cfg(config), warnings)
    if policy is None:
        return RankingResult(
            "review", ["no_decision_policy_configured"], candidates, [], None, _cfg(config), warnings
        )

    groups = identify_ambiguous_groups(candidates, policy.effective_ambiguity_margin)
    top = candidates[0]
    if top.n_references < policy.min_supporting_references:
        decision = "review"
        reasons.append("insufficient_supporting_references")
    elif top.aggregated_score < policy.min_top_score:
        decision = "unknown"
        reasons.append("top_score_below_threshold")
    elif len(candidates) > 1 and (top.aggregated_score - candidates[1].aggregated_score) < policy.min_margin:
        decision = "ambiguous"
        reasons.append("margin_to_runner_up_below_threshold")
    elif groups:
        decision = "ambiguous"
        reasons.append("close_competitors_within_ambiguity_margin")
    else:
        decision = "accept"
        reasons.append("meets_policy_thresholds")
    if groups and catalog is not None:
        fams = {(catalog.get(s).family if catalog.get(s) else None) for s in groups[0]}
        if len(fams) == 1 and None not in fams:
            reasons.append("ambiguous_candidates_share_family_as_supplied")
    return RankingResult(decision, reasons, candidates, groups, policy.to_dict(), _cfg(config), warnings)


def _cfg(c: RankingConfig) -> Dict[str, Any]:
    return {"aggregation": c.aggregation, "top_n": c.top_n, "max_candidates": c.max_candidates}
