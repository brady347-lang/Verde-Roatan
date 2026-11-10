"""Module E: calibration, open-set evaluation, threshold selection and abstention."""
from .calibration import CalibrationMetrics, ScoreCalibrator, evaluate_calibrator, fit_calibrator
from .openset import (
    OpenSetMetrics,
    ThresholdSelection,
    ThresholdSelectionError,
    ValidationSample,
    decide,
    detect_ambiguous,
    evaluate_open_set,
    observed_margin_grid,
    sample_from_ranking,
    select_threshold,
    wilson_interval,
)

__all__ = [
    "CalibrationMetrics", "OpenSetMetrics", "ScoreCalibrator", "ThresholdSelection",
    "ThresholdSelectionError", "ValidationSample", "decide", "detect_ambiguous",
    "evaluate_calibrator", "evaluate_open_set", "fit_calibrator", "observed_margin_grid",
    "sample_from_ranking", "select_threshold", "wilson_interval",
]
