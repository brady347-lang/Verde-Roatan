"""Open-set evaluation, threshold selection from measured data, ambiguity and abstention.

Nothing here ships a default threshold. Thresholds are selected from a held-out validation
set that you supply, which must contain in-catalog images (``true_species_id`` set) and
out-of-catalog images (``true_species_id=None``). Scores are raw cosine-derived scores, not
probabilities.

Definitions (accept rule: ``top_score >= threshold`` and, when a runner-up exists,
``top_score - runner_up_score >= margin``):

* false acceptance rate (FAR): out-of-catalog samples accepted / out-of-catalog samples.
* false rejection rate (FRR): in-catalog samples whose top-1 was CORRECT but were rejected /
  in-catalog samples whose top-1 was correct.
* accepted error rate: accepted in-catalog samples with a WRONG top-1 plus accepted
  out-of-catalog samples, divided by all accepted samples.
* coverage: accepted samples / all samples.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np


class ThresholdSelectionError(RuntimeError):
    """Raised when no observed threshold satisfies the requested constraints."""


@dataclass(frozen=True)
class ValidationSample:
    """One held-out validation result.

    ``true_species_id=None`` marks an out-of-catalog image. ``top_score`` and
    ``runner_up_score`` are the aggregated scores of the first and second ranked species.
    """

    sample_id: str
    true_species_id: Optional[str]
    predicted_species_id: str
    top_score: float
    runner_up_score: Optional[float] = None

    def __post_init__(self) -> None:
        if not self.sample_id:
            raise ValueError("sample_id must be non-empty.")
        if not self.predicted_species_id:
            raise ValueError(f"{self.sample_id}: predicted_species_id must be non-empty (exclude samples with no prediction).")
        if not math.isfinite(self.top_score):
            raise ValueError(f"{self.sample_id}: top_score must be finite.")
        if self.runner_up_score is not None:
            if not math.isfinite(self.runner_up_score):
                raise ValueError(f"{self.sample_id}: runner_up_score must be finite.")
            if self.runner_up_score > self.top_score + 1e-9:
                raise ValueError(f"{self.sample_id}: runner_up_score exceeds top_score.")

    @property
    def in_catalog(self) -> bool:
        return self.true_species_id is not None

    @property
    def correct(self) -> bool:
        return self.in_catalog and self.predicted_species_id == self.true_species_id

    @property
    def margin(self) -> Optional[float]:
        return None if self.runner_up_score is None else self.top_score - self.runner_up_score


def sample_from_ranking(sample_id: str, true_species_id: Optional[str], ranking: Mapping[str, Any]) -> ValidationSample:
    """Build a sample from a ``RankingResult.to_dict()``-shaped mapping (needs >= 1 candidate)."""
    cands = ranking.get("candidates") or []
    if not cands:
        raise ValueError(f"{sample_id}: ranking has no candidates.")
    runner = cands[1]["aggregated_score"] if len(cands) > 1 else None
    return ValidationSample(sample_id, true_species_id, cands[0]["species_id"], float(cands[0]["aggregated_score"]), runner)


def wilson_interval(k: int, n: int, z: float = 1.96) -> Optional[Tuple[float, float]]:
    """Wilson score interval for a binomial proportion; ``None`` when ``n == 0``."""
    if n <= 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


@dataclass(frozen=True)
class OpenSetMetrics:
    threshold: float
    margin: float
    n_samples: int
    n_in_catalog: int
    n_out_of_catalog: int
    n_top1_correct: int
    accepted: int
    accepted_correct: int
    accepted_wrong_in_catalog: int
    accepted_out_of_catalog: int
    false_acceptance_rate: Optional[float]
    false_rejection_rate: Optional[float]
    accepted_error_rate: Optional[float]
    coverage: float
    far_wilson_95: Optional[Tuple[float, float]]
    frr_wilson_95: Optional[Tuple[float, float]]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _arrays(samples: Sequence[ValidationSample]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if len(samples) == 0:
        raise ValueError("No validation samples supplied.")
    ids = [s.sample_id for s in samples]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate sample_id in validation samples.")
    scores = np.array([s.top_score for s in samples], dtype=np.float64)
    margins = np.array([np.inf if s.margin is None else s.margin for s in samples], dtype=np.float64)
    kinds = np.array([0 if not s.in_catalog else (1 if s.correct else 2) for s in samples], dtype=np.int8)
    return scores, margins, kinds  # kinds: 0 out-of-catalog, 1 in-catalog correct, 2 in-catalog wrong


def _metrics(threshold: float, margin: float, scores: np.ndarray, margins: np.ndarray, kinds: np.ndarray) -> OpenSetMetrics:
    accept = (scores >= threshold) & (margins >= margin)
    n_out = int((kinds == 0).sum())
    n_correct = int((kinds == 1).sum())
    n_in = n_correct + int((kinds == 2).sum())
    acc_out = int((accept & (kinds == 0)).sum())
    acc_ok = int((accept & (kinds == 1)).sum())
    acc_bad = int((accept & (kinds == 2)).sum())
    accepted = acc_out + acc_ok + acc_bad
    far = acc_out / n_out if n_out else None
    frr = (n_correct - acc_ok) / n_correct if n_correct else None
    return OpenSetMetrics(
        threshold=float(threshold),
        margin=float(margin),
        n_samples=int(len(scores)),
        n_in_catalog=n_in,
        n_out_of_catalog=n_out,
        n_top1_correct=n_correct,
        accepted=accepted,
        accepted_correct=acc_ok,
        accepted_wrong_in_catalog=acc_bad,
        accepted_out_of_catalog=acc_out,
        false_acceptance_rate=far,
        false_rejection_rate=frr,
        accepted_error_rate=((acc_out + acc_bad) / accepted) if accepted else None,
        coverage=accepted / len(scores),
        far_wilson_95=wilson_interval(acc_out, n_out),
        frr_wilson_95=wilson_interval(n_correct - acc_ok, n_correct),
    )


def evaluate_open_set(samples: Sequence[ValidationSample], threshold: float, margin: float = 0.0) -> OpenSetMetrics:
    """Measure FAR/FRR and related rates at a given threshold and margin."""
    if not math.isfinite(threshold) or not math.isfinite(margin) or margin < 0:
        raise ValueError("threshold must be finite and margin must be finite and >= 0.")
    scores, margins, kinds = _arrays(samples)
    return _metrics(threshold, margin, scores, margins, kinds)


def observed_margin_grid(samples: Sequence[ValidationSample], n: int = 10) -> List[float]:
    """Quantiles of observed margins (plus 0.0), as a data-driven grid for :func:`select_threshold`."""
    vals = sorted({s.margin for s in samples if s.margin is not None})
    if not vals:
        return [0.0]
    qs = np.unique(np.quantile(np.array(vals), np.linspace(0, 1, max(2, n))))
    return sorted({0.0, *[float(q) for q in qs if q >= 0]})


@dataclass(frozen=True)
class ThresholdSelection:
    """A threshold/margin pair chosen from measured validation data."""

    threshold: float
    margin: float
    metrics: OpenSetMetrics
    constraints: Dict[str, Any]
    dataset_id: Optional[str]
    n_candidates_evaluated: int
    warnings: Tuple[str, ...] = ()

    def to_policy_dict(self, source: Optional[str] = None) -> Dict[str, Any]:
        """Dict accepted by ``candidate_ranking.DecisionPolicy.from_dict``."""
        return {
            "min_top_score": self.threshold,
            "min_margin": self.margin,
            "source": source or f"measured_on_validation:{self.dataset_id or 'unnamed'}",
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "threshold": self.threshold,
            "margin": self.margin,
            "metrics": self.metrics.to_dict(),
            "constraints": self.constraints,
            "dataset_id": self.dataset_id,
            "n_candidates_evaluated": self.n_candidates_evaluated,
            "warnings": list(self.warnings),
        }


def select_threshold(
    samples: Sequence[ValidationSample],
    *,
    max_false_acceptance_rate: float,
    max_accepted_error_rate: Optional[float] = None,
    margin_grid: Sequence[float] = (0.0,),
    dataset_id: Optional[str] = None,
    min_out_of_catalog: int = 1,
    min_top1_correct: int = 1,
) -> ThresholdSelection:
    """Choose (threshold, margin) from observed scores.

    Among pairs whose measured FAR (and optionally accepted error rate) satisfy the caller's
    limits, pick the one with the lowest FRR; ties prefer the higher threshold then the larger
    margin (more conservative). Candidate thresholds are the observed top scores. Raises
    :class:`ThresholdSelectionError` if no pair is feasible or the data cannot support the
    measurement (e.g. no out-of-catalog samples).
    """
    if not 0.0 <= max_false_acceptance_rate <= 1.0:
        raise ValueError("max_false_acceptance_rate must be in [0, 1].")
    if max_accepted_error_rate is not None and not 0.0 <= max_accepted_error_rate <= 1.0:
        raise ValueError("max_accepted_error_rate must be in [0, 1].")
    if any((not math.isfinite(m)) or m < 0 for m in margin_grid) or len(margin_grid) == 0:
        raise ValueError("margin_grid must be a non-empty sequence of finite values >= 0.")
    scores, margins, kinds = _arrays(samples)
    n_out = int((kinds == 0).sum())
    n_correct = int((kinds == 1).sum())
    if n_out < min_out_of_catalog:
        raise ThresholdSelectionError(f"Need at least {min_out_of_catalog} out-of-catalog samples, got {n_out}.")
    if n_correct < min_top1_correct:
        raise ThresholdSelectionError(f"Need at least {min_top1_correct} correct in-catalog samples, got {n_correct}.")

    thresholds = np.unique(scores)
    best: Optional[Tuple[Tuple[float, float, float], float, float]] = None
    evaluated = 0
    for m in sorted(set(float(g) for g in margin_grid)):
        eligible = margins >= m
        # accepted counts per threshold, vectorised via sorted scores per kind
        def accepted_count(kind: int) -> np.ndarray:
            s = np.sort(scores[eligible & (kinds == kind)])
            return len(s) - np.searchsorted(s, thresholds, side="left")

        acc_out, acc_ok, acc_bad = accepted_count(0), accepted_count(1), accepted_count(2)
        accepted = acc_out + acc_ok + acc_bad
        far = acc_out / n_out
        frr = (n_correct - acc_ok) / n_correct
        err = np.where(accepted > 0, (acc_out + acc_bad) / np.maximum(accepted, 1), 0.0)
        feasible = (far <= max_false_acceptance_rate) & (accepted > 0)
        if max_accepted_error_rate is not None:
            feasible &= err <= max_accepted_error_rate
        evaluated += len(thresholds)
        for i in np.nonzero(feasible)[0]:
            key = (float(frr[i]), -float(thresholds[i]), -m)
            if best is None or key < best[0]:
                best = (key, float(thresholds[i]), m)
    if best is None:
        raise ThresholdSelectionError(
            "No observed threshold/margin satisfies the constraints "
            f"(max FAR {max_false_acceptance_rate}, max accepted error rate {max_accepted_error_rate}). "
            "Relax the limits, improve the model/reference set, or abstain on everything."
        )
    _, thr, mar = best
    metrics = _metrics(thr, mar, scores, margins, kinds)
    warnings: List[str] = []
    if n_out < 30:
        warnings.append(f"Only {n_out} out-of-catalog samples: FAR estimate is very uncertain (see Wilson interval).")
    if n_correct < 30:
        warnings.append(f"Only {n_correct} correct in-catalog samples: FRR estimate is very uncertain.")
    warnings.append("Thresholds were selected and measured on the same samples; confirm on a separate test set.")
    return ThresholdSelection(
        thr, mar, metrics,
        {"max_false_acceptance_rate": max_false_acceptance_rate, "max_accepted_error_rate": max_accepted_error_rate, "margin_grid": list(margin_grid)},
        dataset_id, evaluated, tuple(warnings),
    )


def detect_ambiguous(top_score: float, runner_up_score: Optional[float], margin: float) -> bool:
    """True when the runner-up is closer than ``margin`` to the top score."""
    if margin < 0:
        raise ValueError("margin must be >= 0.")
    if runner_up_score is None:
        return False
    return (top_score - runner_up_score) < margin


def decide(top_score: float, runner_up_score: Optional[float], *, threshold: float, margin: float) -> Dict[str, Any]:
    """Accept or abstain, with reasons. Scores are uncalibrated similarity scores, not probabilities."""
    for name, v in (("top_score", top_score), ("threshold", threshold), ("margin", margin)):
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError(f"{name} must be a finite number.")
    reasons: List[str] = []
    if top_score < threshold:
        reasons.append("top_score_below_threshold")
    if detect_ambiguous(top_score, runner_up_score, margin):
        reasons.append("ambiguous_runner_up_too_close")
    return {"decision": "abstain" if reasons else "accept", "reasons": reasons or ["meets_thresholds"]}
