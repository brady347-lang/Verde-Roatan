# rootwise_ml_modules

Standalone, reusable Python ML modules for integration into RootWise by another developer.
Written without access to the RootWise repository; nothing here assumes RootWise tables, auth or APIs.

**Contract:** FLOAT32 input `[1,224,224,3]` (RGB, `x/127.5 - 1` → [-1, 1]) → FLOAT32 output `[1,512]`
(L2-normalised). Model version identifier: `rootwise_mobilenetv3_512d_v1`.

## Layout and dependencies

| Package | Purpose | Needs |
|---|---|---|
| `image_features` (A) | validate/preprocess, 512-d L2 embedding, batch, metadata, Keras model builder | numpy, Pillow (TF lazily) |
| `similarity` (B) | cosine, top-k, species grouping, centroids, duplicates, version/dimension/NaN checks | numpy |
| `candidate_ranking` (C) | multi-reference species ranking, names/taxon/family, ambiguity, accept/review/unknown | numpy |
| `image_quality` (D) | blur, exposure, resolution, contrast, corruption, suitability + reasons | numpy, Pillow (OpenCV optional) |
| `uncertainty` (E) | calibration, open-set FAR/FRR, measured thresholds, ambiguity, abstention | numpy, scikit-learn |
| `feedback` (F) | feedback records, verification, approved-only manifests, repeated-error patterns | stdlib |
| `training` (G) | manifest validation, group splits, duplicate prevention, augmentation, metrics, trainer | numpy, Pillow, sklearn (TF for trainer) |
| `export` (H) | FLOAT32 TFLite export + contract/normalisation/Keras-vs-TFLite validation | TF or LiteRT |
| `inference` (I) | JSON-compatible wrapper: init, readiness, embed, retrieve, rank, identify, feedback validation; optional FastAPI app | numpy (+ the above) |

Put the folder on your import path (parent directory of `rootwise_ml_modules`) and `pip install -r requirements.txt`
(TensorFlow, FastAPI and LiteRT are only needed for the parts listed above). No sub-package imports TensorFlow at import time.

## Honest status

**Baseline embedding is not botanically specialised.** It is MobileNetV3Small with an ImageNet-initialised backbone and an
*untrained* 512-d projection. No model has been trained, and no accuracy, calibration or threshold results exist.
Do not describe the embeddings as botanical until a model is trained on suitable, licensed, labeled data and evaluated.

### Tests actually executed (authoring environment: Python 3.13, numpy, Pillow, OpenCV, scikit-learn, pytest)
`python -m pytest rootwise_ml_modules/tests` → **135 passed, 1 skipped**. These cover modules A–I through the injected-backend path
using **synthetic fixtures** (software correctness only; they say nothing about botanical accuracy). The four NumPy-only examples were also run.

### Supplied but NOT executed (TensorFlow, LiteRT and FastAPI were not installed; package installs were blocked)
- `image_features.model.build_embedding_model` (real MobileNetV3Small graph, ImageNet weight download), `KerasBackend`, `TFLiteBackend` against a real interpreter
- `training.trainer.train`, `training.data.make_tf_dataset` (batch iteration / augmentation / splits **are** tested)
- `export.export_to_tflite` and `validate_tflite` against a real converted model (validation logic is tested with a fake interpreter)
- `inference.fastapi_app.create_app`
- `tests/test_tensorflow_optional.py` (skipped here; run it where TensorFlow is installed)
- `examples/example_keras_training_and_export.py`

Expect to fix small integration issues in these untested paths on first run with TensorFlow.

### Not available / not measured
Trained models, validation accuracy, confusion matrices, calibration curves, FAR/FRR, and any decision thresholds. Every threshold must be
measured on your held-out validation set that includes out-of-catalog images (`uncertainty.select_threshold`). Until a `DecisionPolicy`
is supplied, ranking and `identify()` return `review` and never auto-accept.

## Design rules enforced in code
- Cosine similarity is reported as `cosine_similarity_uncalibrated`, never as a probability.
- Malformed, wrong-dimension, zero-norm or non-finite vectors, and mismatched model versions, are rejected.
- A rejected identification is not a correction; user corrections stay `unverified` until a reviewer verifies them **and** training approval is recorded. Only approved records reach training manifests.
- Image-quality heuristics assess technical quality only; plant/non-plant judgement requires an optional, separately trained classifier.
- Embeddings from different weights are not comparable even under the same version string; use a distinct `model_version` after training.

## Quick start
See `examples/`. Typical flow: `FeatureExtractor` → `SimilarityIndex` → `rank_candidates` → thresholds from `uncertainty` → `RootWiseInference.identify()`.
