# RootWise — Model Training and Evaluation Log

This file records actual dataset and model experiments. Do not record planned work as completed training.

## Current status — 2026-11-07
- Python ML service: not yet present in the inspected repository.
- Custom model training: not established by this repository audit.
- Dataset readiness: not assessed; catalog and identification data require provenance, rights, quality, and labeling review.
- No model has been trained or deployed as part of the AI collaboration documentation setup.

## Experiment template
For every experiment, record:

- Experiment ID:
- Date:
- Owner:
- Goal and intended use:
- Model family / architecture:
- Framework and versions:
- Dataset version and source:
- Image/document rights and consent review:
- Number of examples and class distribution:
- Labeling protocol and reviewer:
- Train/validation/test split method:
- Baseline:
- Metrics (include per-class precision/recall/F1 and confusion matrix where relevant):
- Known limitations and failure cases:
- Safety review:
- Model artifact/version:
- Deployment target:
- Rollback plan:
- Approval status:

## Dataset rules
- AI-generated labels remain candidate labels until reviewed.
- Keep source image IDs and original storage references.
- Deduplicate images and prevent near-identical photographs of the same specimen from leaking across train/test splits.
- Preserve class imbalance and unknown/other classes; do not force uncertain images into a species label.
- Use only data with documented rights/consent and a legitimate project purpose.
- Keep test data held out from training and model selection.
- Record geographic and environmental limits; Caribbean/tropical performance must be evaluated rather than assumed.

## Planned first model candidates
These are candidates for later evaluation, not approved commitments:
1. Image quality/specimen suitability classifier.
2. Plant taxon classification for a bounded, curated nursery/tropical species set.
3. Plant-health symptom classifier, only after expert-reviewed diagnostic image data exists.

Do not build a general disease diagnosis model before adequate expert labels and safety evaluation exist.
