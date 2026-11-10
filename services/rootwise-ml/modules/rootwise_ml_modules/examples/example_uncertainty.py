"""Select thresholds from validation data, measure FAR/FRR, and abstain. NumPy + scikit-learn.

The validation samples are SYNTHETIC; they exist to show the workflow. Real thresholds require a
real held-out validation set that includes out-of-catalog images.
"""
import numpy as np

from rootwise_ml_modules.uncertainty import ValidationSample, decide, fit_calibrator, observed_margin_grid, select_threshold

rng = np.random.default_rng(1)
samples = []
for i in range(120):  # in-catalog: mostly correct, higher scores
    ok = rng.random() > 0.2
    top = float(np.clip(rng.normal(0.8 if ok else 0.6, 0.07), 0.0, 1.0))
    samples.append(ValidationSample(f"in{i}", "sp_a", "sp_a" if ok else "sp_b", top, top - abs(rng.normal(0.15, 0.05))))
for i in range(80):  # out-of-catalog: lower scores
    top = float(np.clip(rng.normal(0.55, 0.08), 0.0, 1.0))
    samples.append(ValidationSample(f"ooc{i}", None, "sp_a", top, top - abs(rng.normal(0.05, 0.03))))

sel = select_threshold(samples, max_false_acceptance_rate=0.05, margin_grid=observed_margin_grid(samples))
print(sel.to_dict())  # includes measured FAR / FRR with Wilson intervals and sample counts
print(decide(0.9, 0.5, threshold=sel.threshold, margin=sel.margin))

in_cat = [s for s in samples if s.in_catalog]
cal = fit_calibrator([s.top_score for s in in_cat], [s.correct for s in in_cat], method="platt", dataset_id="synthetic")
print("empirical correctness rate at score 0.8 on this validation set:", float(cal.predict_correctness([0.8])[0]))
