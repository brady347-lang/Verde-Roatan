import json

import numpy as np
import pytest

from rootwise_ml_modules.candidate_ranking import DecisionPolicy
from rootwise_ml_modules.uncertainty import (
    ThresholdSelectionError,
    ValidationSample,
    decide,
    detect_ambiguous,
    evaluate_calibrator,
    evaluate_open_set,
    fit_calibrator,
    observed_margin_grid,
    sample_from_ranking,
    select_threshold,
    wilson_interval,
)
from rootwise_ml_modules.uncertainty.calibration import ScoreCalibrator


def S(i, true, pred, top, runner=None):
    return ValidationSample(f"s{i}", true, pred, top, runner)


HAND = [
    S(1, "a", "a", 0.9),   # in-catalog, correct
    S(2, "b", "b", 0.6),   # in-catalog, correct
    S(3, "c", "a", 0.7),   # in-catalog, wrong
    S(4, None, "a", 0.8),  # out-of-catalog
    S(5, None, "b", 0.4),  # out-of-catalog
]


def test_open_set_metrics_by_hand():
    m = evaluate_open_set(HAND, threshold=0.65)
    assert (m.n_in_catalog, m.n_out_of_catalog, m.n_top1_correct) == (3, 2, 2)
    assert m.accepted == 3 and m.accepted_out_of_catalog == 1 and m.accepted_wrong_in_catalog == 1
    assert m.false_acceptance_rate == pytest.approx(0.5)
    assert m.false_rejection_rate == pytest.approx(0.5)
    assert m.accepted_error_rate == pytest.approx(2 / 3)
    assert m.coverage == pytest.approx(0.6)
    assert m.far_wilson_95 is not None and m.far_wilson_95[0] <= 0.5 <= m.far_wilson_95[1]


def test_select_threshold_uses_measured_data():
    strict = select_threshold(HAND, max_false_acceptance_rate=0.0, dataset_id="hand")
    assert strict.threshold == pytest.approx(0.9) and strict.metrics.false_acceptance_rate == 0.0
    assert strict.metrics.false_rejection_rate == pytest.approx(0.5)
    loose = select_threshold(HAND, max_false_acceptance_rate=0.5)
    assert loose.threshold == pytest.approx(0.6) and loose.metrics.false_rejection_rate == 0.0
    assert any("same samples" in w for w in loose.warnings)
    with_err = select_threshold(HAND, max_false_acceptance_rate=0.5, max_accepted_error_rate=0.0)
    assert with_err.metrics.accepted_error_rate == 0.0
    assert strict.to_policy_dict()["source"] == "measured_on_validation:hand"
    json.dumps(strict.to_dict())


def test_selection_feeds_decision_policy():
    sel = select_threshold(HAND, max_false_acceptance_rate=0.5)
    pol = DecisionPolicy.from_dict(sel.to_policy_dict())
    assert pol.min_top_score == sel.threshold


def test_select_threshold_infeasible_and_insufficient_data():
    out_high = [S(1, "a", "a", 0.5), S(2, None, "a", 0.9)]
    with pytest.raises(ThresholdSelectionError):
        select_threshold(out_high, max_false_acceptance_rate=0.0)
    with pytest.raises(ThresholdSelectionError):
        select_threshold([S(1, "a", "a", 0.9)], max_false_acceptance_rate=0.1)  # no out-of-catalog samples
    with pytest.raises(ThresholdSelectionError):
        select_threshold([S(1, None, "a", 0.9)], max_false_acceptance_rate=0.1)  # nothing correct
    with pytest.raises(ValueError):
        select_threshold(HAND, max_false_acceptance_rate=2.0)
    with pytest.raises(ValueError):
        select_threshold(HAND, max_false_acceptance_rate=0.1, margin_grid=[])


def test_vectorised_selection_matches_brute_force():
    rng = np.random.default_rng(42)
    samples = []
    for i in range(80):
        kind = rng.choice(["ok", "wrong", "out"], p=[0.45, 0.2, 0.35])
        top = float(rng.uniform(0.2, 0.95))
        runner = float(top - rng.uniform(0, 0.3)) if rng.random() < 0.8 else None
        true = None if kind == "out" else "a"
        pred = "a" if kind == "ok" else "b"
        samples.append(S(i, true, pred, top, runner))
    grid = [0.0, 0.05, 0.1]
    for max_far in (0.1, 0.3):
        sel = select_threshold(samples, max_false_acceptance_rate=max_far, margin_grid=grid)
        best = None
        for thr in sorted({s.top_score for s in samples}):
            for mg in grid:
                m = evaluate_open_set(samples, thr, mg)
                if m.false_acceptance_rate <= max_far and m.accepted > 0:
                    key = (m.false_rejection_rate, -thr, -mg)
                    if best is None or key < best[0]:
                        best = (key, thr, mg)
        assert (sel.threshold, sel.margin) == (best[1], best[2])
        assert sel.metrics == evaluate_open_set(samples, sel.threshold, sel.margin)


def test_margin_rule_rejects_close_runner_up():
    samples = [S(1, "a", "a", 0.9, 0.89), S(2, "a", "a", 0.9, 0.2)]
    assert evaluate_open_set(samples, 0.5, margin=0.0).accepted == 2
    assert evaluate_open_set(samples, 0.5, margin=0.1).accepted == 1


def test_sample_validation():
    with pytest.raises(ValueError):
        S(1, "a", "a", 0.5, 0.9)  # runner-up above top
    with pytest.raises(ValueError):
        S(1, "a", "a", float("nan"))
    with pytest.raises(ValueError):
        S(1, "a", "", 0.5)
    with pytest.raises(ValueError):
        evaluate_open_set([S(1, "a", "a", 0.5), S(1, "a", "a", 0.6)], 0.5)  # duplicate id
    with pytest.raises(ValueError):
        evaluate_open_set([], 0.5)
    with pytest.raises(ValueError):
        evaluate_open_set(HAND, 0.5, margin=-1)


def test_wilson_interval():
    assert wilson_interval(0, 0) is None
    lo, hi = wilson_interval(5, 10)
    assert 0 < lo < 0.5 < hi < 1
    lo0, hi0 = wilson_interval(0, 20)
    assert lo0 == 0.0 and 0 < hi0 < 0.2


def test_ambiguity_and_decide():
    assert detect_ambiguous(0.9, 0.85, 0.1) and not detect_ambiguous(0.9, 0.5, 0.1) and not detect_ambiguous(0.9, None, 0.1)
    assert decide(0.9, 0.2, threshold=0.5, margin=0.1) == {"decision": "accept", "reasons": ["meets_thresholds"]}
    r = decide(0.4, 0.39, threshold=0.5, margin=0.1)
    assert r["decision"] == "abstain" and set(r["reasons"]) == {"top_score_below_threshold", "ambiguous_runner_up_too_close"}
    with pytest.raises(ValueError):
        decide(float("nan"), None, threshold=0.5, margin=0.1)


def test_observed_margin_grid_and_sample_from_ranking():
    g = observed_margin_grid([S(1, "a", "a", 0.9, 0.8), S(2, "a", "a", 0.9, 0.1)], n=3)
    assert g[0] == 0.0 and g == sorted(g)
    assert observed_margin_grid([S(1, "a", "a", 0.9)]) == [0.0]
    s = sample_from_ranking("x", None, {"candidates": [{"species_id": "a", "aggregated_score": 0.7}, {"species_id": "b", "aggregated_score": 0.6}]})
    assert s.runner_up_score == 0.6 and not s.in_catalog
    with pytest.raises(ValueError):
        sample_from_ranking("x", "a", {"candidates": []})


# -------------------------- calibration (synthetic data: software test only) --------------------------
def synthetic_scores(n, seed):
    rng = np.random.default_rng(seed)
    s = rng.uniform(0.2, 0.95, n)
    y = rng.random(n) < 1 / (1 + np.exp(-12 * (s - 0.6)))
    return s, y


@pytest.mark.parametrize("method", ["platt", "isotonic"])
def test_calibrators_are_monotone_bounded_and_serialisable(method):
    s, y = synthetic_scores(2000, 1)
    cal = fit_calibrator(s, y, method=method, dataset_id="synthetic")
    grid = np.linspace(0, 1, 50)
    p = cal.predict_correctness(grid)
    assert np.all(np.diff(p) >= -1e-12) and p.min() >= 0 and p.max() <= 1
    again = ScoreCalibrator.from_json(cal.to_json())
    assert np.allclose(again.predict_correctness(grid), p)
    assert "empirical" in cal.note.lower() and cal.dataset_id == "synthetic"
    s2, y2 = synthetic_scores(2000, 2)
    m = evaluate_calibrator(cal, s2, y2)
    assert m.n == 2000 and 0 <= m.expected_calibration_error < 0.1 and 0 <= m.brier_score < 0.25
    assert sum(b["n"] for b in m.reliability) == 2000


def test_calibration_input_validation():
    s, y = synthetic_scores(100, 3)
    with pytest.raises(ValueError):
        fit_calibrator(s[:10], y[:10])  # below min_samples
    with pytest.raises(ValueError):
        fit_calibrator(s, np.ones(100, bool))  # one class only
    with pytest.raises(ValueError):
        fit_calibrator(np.where(np.arange(100) == 0, np.nan, s), y)
    with pytest.raises(ValueError):
        fit_calibrator(s, y, method="magic")
    with pytest.raises(ValueError):
        fit_calibrator(s, y[:-1])
    cal = fit_calibrator(s, y)
    with pytest.raises(ValueError):
        cal.predict_correctness([np.inf])
    with pytest.raises(ValueError):
        ScoreCalibrator.from_json('{"method": "x"}')
