# RootWise Botanical Training

This is the source-controlled training pipeline for RootWise's own botanical image embedding model. It is separate from the Google AI Studio engine and does not change that engine.

## Model we train

- Backbone: Keras MobileNetV3Small with ImageNet initialization as a general visual starting point; RootWise trains the species classifier and 512-dimensional botanical embedding head on our labelled data.
- Input: RGB FLOAT32 `[1,224,224,3]`, normalized to [-1,1].
- Embedding: FLOAT32 `[1,512]`, L2-normalized.
- Android export: TensorFlow Lite / LiteRT, float32 first; quantization only after accuracy and device tests.
- Version: `rootwise_mobilenetv3_512d_v1`.

This is transfer learning, not training a vision backbone from random weights. The botanical recognition head and embedding space are trained by RootWise. The exact exported encoder generates the Android reference catalog.

## Dataset layout

Keep image files out of Git. Store them in private/local data storage and provide a CSV manifest:

```csv
image_path,species_id,common_name,scientific_name,family,observation_group,source_id,license,license_url,split
```

- `species_id`: stable taxonomic identifier (prefer a stable external taxon ID).
- `observation_group`: groups photos from the same observation, individual plant, or capture session; all images in a group stay in one split.
- `source_id`: traceable observation/photo record.
- `license` and `license_url`: required source and reuse terms.
- `split`: optional `train`, `validation`, or `test`; if absent, deterministic group splitting is used.

Do not mix images of the same individual/observation across train and test. Remove duplicates, blurry/non-plant images, wrong labels, and images with uncertain taxonomy. Keep a human-reviewed holdout test set.

## Train

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/train.py --manifest data/manifest.csv --output artifacts/rootwise_mobilenetv3_512d_v1 --epochs 30
```

The training script checks class/group coverage, writes the exact training manifest and label map, trains a species classifier with a 512D embedding head, saves the Keras encoder, and exports a float32 LiteRT model.

## Build reference catalog

Prepare a separate curated reference manifest with columns:

```csv
image_path,species_id,common_name,scientific_name,family,source_id,license,license_url,review_status,expert_verified,verification_source
```

Only `review_status=approved` records are included. A row marked `expert_verified=true` must have a non-empty `verification_source`. Multiple curated reference photographs are embedded with the exact exported encoder and averaged into one normalized centroid per species; source IDs and licenses are retained.

```bash
python scripts/build_reference_catalog.py \
  --manifest data/reference_manifest.csv \
  --encoder artifacts/rootwise_mobilenetv3_512d_v1/encoder.keras \
  --output artifacts/rootwise_mobilenetv3_512d_v1/botanical_reference_embeddings.json
```

Copy both generated artifacts into the Android plugin assets directory only after evaluation and approval:

- `rootwise_mobilenetv3_512d.tflite`
- `botanical_reference_embeddings.json`

## Quality gates before release

1. Check species-level precision/recall and top-1/top-3 accuracy on the untouched holdout set.
2. Inspect confusion pairs, especially visually similar species.
3. Test on real Roatán/Bay Islands field photographs from different phones, seasons, lighting, backgrounds, and growth stages.
4. Calibrate an abstention threshold on validation data; do not call cosine similarity a probability.
5. Confirm model/catalog version equality and provenance.
6. Test model size, latency, and memory on supported Android devices.
7. Obtain botanical expert review for any species presented as verified.

The Android adapter returns candidate evidence only. Expert verification remains a separate catalog property and is never inferred from model confidence.

## Data and licensing

Public observations are not automatically public-domain. Retain each image's attribution and license metadata, confirm that commercial use and derivative model training are permitted, and exclude records with unclear rights. Do not scrape protected nursery/customer images without permission.
