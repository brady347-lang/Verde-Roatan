"""Shared embedding contract constants (no third-party dependencies)."""
from __future__ import annotations

MODEL_VERSION = "rootwise_mobilenetv3_512d_v1"
EMBEDDING_DIM = 512
INPUT_SIZE = 224
INPUT_SHAPE = (1, INPUT_SIZE, INPUT_SIZE, 3)
OUTPUT_SHAPE = (1, EMBEDDING_DIM)
INPUT_DTYPE = "float32"
OUTPUT_DTYPE = "float32"
NORMALIZED_RANGE = (-1.0, 1.0)

SIMILARITY_NOTE = (
    "Cosine similarity is an uncalibrated geometric score between embeddings. "
    "It is not a probability and not a scientifically calibrated confidence."
)
BASELINE_NOTE = (
    "Baseline embedding: MobileNetV3Small with ImageNet-initialised backbone and an "
    "untrained 512-d projection head. It has NOT been trained on botanical images and "
    "must not be described as botanically specialised until it is."
)
