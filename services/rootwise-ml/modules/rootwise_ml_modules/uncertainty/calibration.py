"""Calibrate a score into an EMPIRICAL correctness rate using held-out validation data.

The output is "estimated rate at which top-1 identifications with this score were correct
on the validation distribution". It is only meaningful for the same model version, the same
reference set and a similar data distribution. It is never a property of cosine similarity
itself. Fit on one split and evaluate on a different split; metrics on the fitting data are
optimistic.
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from ..contract import MODEL_VERSION

METHODS = ("platt", "isotonic")


@dataclass(frozen=True)
class CalibrationMetrics:
    n: int
    brier_score: float
    log_loss: float
    expected_calibration_error: float
    n_bins: int
    reliability: List[Dict[str, float]]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScoreCalibrator:
    """Fitted score -> empirical-correctness mapping."""

    method: str
    params: Dict[str, Any]
    model_version: str
    n_fit: int
    dataset_id: Optional[str] = None
    note: str = (
        "Estimated empirical correctness rate on the calibration dataset; valid only for this "
        "model version, reference set and data distribution."
    )

    def predict_correctness(self, scores: Any) -> np.ndarray:
        s = np.asarray(scores, dtype=np.float64)
        if not np.all(np.isfinite(s)):
            raise ValueError("scores must be finite.")
        if self.method == "platt":
            z = self.params["coef"] * s + self.params["intercept"]
            return 1.0 / (1.0 + np.exp(-z))
        x = np.asarray(self.params["x"], dtype=np.float64)
        y = np.asarray(self.params["y"], dtype=np.float64)
        return np.interp(s, x, y)

    def to_json(self) -> str:
        return json.dumps(
            {
                "method": self.method,
                "params": self.params,
                "model_version": self.model_version,
                "n_fit": self.n_fit,
                "dataset_id": self.dataset_id,
                "note": self.note,
            },
            sort_keys=True,
        )

    @classmethod
    def from_json(cls, text: str) -> "ScoreCalibrator":
        d = json.loads(text)
        if d.get("method") not in METHODS:
            raise ValueError("Unknown calibrator method.")
        return cls(d["method"], d["params"], d["model_version"], int(d["n_fit"]), d.get("dataset_id"), d.get("note", ""))


def _validate(scores: Sequence[float], correct: Sequence[bool], min_samples: int) -> tuple:
    s = np.asarray(scores, dtype=np.float64)
    y = np.asarray(correct, dtype=bool)
    if s.ndim != 1 or s.shape != y.shape:
        raise ValueError("scores and correct must be 1-D and the same length.")
    if not np.all(np.isfinite(s)):
        raise ValueError("scores must be finite.")
    if len(s) < min_samples:
        raise ValueError(f"Need at least {min_samples} validation samples, got {len(s)}.")
    if y.all() or (~y).all():
        raise ValueError("Calibration needs both correct and incorrect examples.")
    return s, y


def fit_calibrator(
    scores: Sequence[float],
    correct: Sequence[bool],
    *,
    method: str = "platt",
    min_samples: int = 30,
    dataset_id: Optional[str] = None,
    model_version: str = MODEL_VERSION,
) -> ScoreCalibrator:
    """Fit on held-out (top-1 score, was-correct) pairs from in-catalog validation images."""
    if method not in METHODS:
        raise ValueError(f"method must be one of {METHODS}.")
    s, y = _validate(scores, correct, min_samples)
    if method == "platt":
        from sklearn.linear_model import LogisticRegression

        lr = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000)
        lr.fit(s.reshape(-1, 1), y.astype(int))
        params = {"coef": float(lr.coef_[0, 0]), "intercept": float(lr.intercept_[0])}
    else:
        from sklearn.isotonic import IsotonicRegression

        iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
        iso.fit(s, y.astype(float))
        params = {"x": [float(v) for v in iso.X_thresholds_], "y": [float(v) for v in iso.y_thresholds_]}
    return ScoreCalibrator(method, params, model_version, int(len(s)), dataset_id)


def evaluate_calibrator(
    calibrator: ScoreCalibrator, scores: Sequence[float], correct: Sequence[bool], *, n_bins: int = 10
) -> CalibrationMetrics:
    """Measure Brier score, log loss and ECE of ``calibrator`` on (ideally separate) data."""
    if n_bins < 1:
        raise ValueError("n_bins must be >= 1.")
    s = np.asarray(scores, dtype=np.float64)
    y = np.asarray(correct, dtype=bool).astype(float)
    if s.ndim != 1 or s.shape != y.shape or len(s) == 0:
        raise ValueError("scores and correct must be non-empty, 1-D and the same length.")
    p = np.clip(calibrator.predict_correctness(s), 1e-12, 1 - 1e-12)
    brier = float(np.mean((p - y) ** 2))
    ll = float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    edges = np.linspace(0, 1, n_bins + 1)
    bins = np.clip(np.digitize(p, edges[1:-1], right=False), 0, n_bins - 1)
    ece = 0.0
    rel: List[Dict[str, float]] = []
    for b in range(n_bins):
        m = bins == b
        if not m.any():
            continue
        conf, acc = float(p[m].mean()), float(y[m].mean())
        ece += m.mean() * abs(conf - acc)
        rel.append({"bin": b, "n": int(m.sum()), "mean_estimate": conf, "observed_rate": acc})
    return CalibrationMetrics(int(len(s)), brier, ll, float(ece), n_bins, rel)
