#!/usr/bin/env python3
"""Calibrate open-set acceptance against a separate, rights-cleared negative image set."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf

DIMENSION = 512
REQUIRED_VALIDATION = {"image_path", "species_id"}
REQUIRED_NEGATIVE = {"image_path", "source_id", "license", "license_url"}


def resolve_images(frame: pd.DataFrame, manifest: Path) -> pd.DataFrame:
    frame = frame.copy()
    frame["image_path"] = frame["image_path"].map(
        lambda value: str((manifest.parent / value).resolve()) if not Path(value).is_absolute() else value
    )
    missing = [path for path in frame["image_path"] if not Path(path).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing image: {missing[0]} ({len(missing)} total)")
    return frame


def embed(encoder, image_path: str) -> np.ndarray:
    raw = tf.io.read_file(image_path)
    image = tf.io.decode_image(raw, channels=3, expand_animations=False)
    image.set_shape([None, None, 3])
    image = tf.image.resize(image, (224, 224), antialias=True)
    image = (tf.cast(image, tf.float32) - 127.5) / 127.5
    vector = encoder(tf.expand_dims(image, 0), training=False).numpy()[0].astype(np.float64)
    if vector.shape != (DIMENSION,) or not np.isfinite(vector).all():
        raise ValueError(f"Invalid embedding generated for {image_path}")
    norm = np.linalg.norm(vector)
    if norm <= 0:
        raise ValueError(f"Empty embedding generated for {image_path}")
    return vector / norm


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--validation-manifest", required=True, type=Path)
    parser.add_argument("--negative-manifest", required=True, type=Path)
    parser.add_argument("--encoder", required=True, type=Path)
    parser.add_argument("--reference-catalog", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-false-accept-rate", type=float, default=0.01)
    args = parser.parse_args()

    if not 0 < args.target_false_accept_rate < 0.1:
        raise ValueError("target-false-accept-rate must be between 0 and 0.1.")

    validation = pd.read_csv(args.validation_manifest).fillna("")
    negative = pd.read_csv(args.negative_manifest).fillna("")
    if REQUIRED_VALIDATION - set(validation.columns):
        raise ValueError(f"Validation manifest needs {sorted(REQUIRED_VALIDATION)}")
    if REQUIRED_NEGATIVE - set(negative.columns):
        raise ValueError(f"Negative manifest needs {sorted(REQUIRED_NEGATIVE)}")
    if "split" in validation.columns:
        validation = validation[validation["split"].astype(str).str.lower() == "validation"]
    validation = resolve_images(validation, args.validation_manifest)
    negative = resolve_images(negative, args.negative_manifest)
    if len(validation) < 100:
        raise ValueError("At least 100 independent positive validation images are required.")
    if len(negative) < 1000:
        raise ValueError("At least 1,000 diverse, rights-cleared negative images are required.")
    if negative["source_id"].astype(str).str.strip().eq("").any():
        raise ValueError("Every negative image needs a traceable source_id.")
    if negative["source_id"].duplicated().any():
        raise ValueError("Negative source_id values must be unique.")
    for column in ("license", "license_url"):
        if negative[column].astype(str).str.strip().eq("").any():
            raise ValueError(f"Every negative image must include {column}.")
    if "source_id" in validation.columns:
        positive_sources = set(validation["source_id"].astype(str).str.strip())
        negative_sources = set(negative["source_id"].astype(str).str.strip())
        overlap = positive_sources.intersection(negative_sources)
        if overlap:
            raise ValueError(f"Positive and negative calibration sets share {len(overlap)} source IDs.")

    catalog = json.loads(args.reference_catalog.read_text(encoding="utf-8"))
    if catalog.get("model_version") != "rootwise_mobilenetv3_512d_v1":
        raise ValueError("Reference catalog model version does not match this training pipeline.")
    entries = catalog.get("entries", [])
    if not entries:
        raise ValueError("Reference catalog is empty.")
    species_ids = [entry["id"] for entry in entries]
    centroids = np.asarray([entry["embedding"] for entry in entries], dtype=np.float64)
    if centroids.shape != (len(entries), DIMENSION):
        raise ValueError("Reference catalog must contain one 512D centroid per species.")
    centroids /= np.linalg.norm(centroids, axis=1, keepdims=True).clip(min=1e-12)
    index_by_species = {species_id: index for index, species_id in enumerate(species_ids)}

    encoder = tf.keras.models.load_model(args.encoder, compile=False)
    if encoder.output_shape != (None, DIMENSION):
        raise ValueError("Encoder output must be 512D.")

    positive_scores = []
    positive_correct = 0
    for row in validation.itertuples():
        species_id = str(row.species_id)
        if species_id not in index_by_species:
            continue
        vector = embed(encoder, row.image_path)
        scores = centroids @ vector
        predicted_index = int(np.argmax(scores))
        target_index = index_by_species[species_id]
        if predicted_index == target_index:
            positive_correct += 1
            positive_scores.append(float(scores[target_index]))
        else:
            positive_scores.append(-1.0)

    if len(positive_scores) < 100:
        raise ValueError("Fewer than 100 validation photos matched species present in the reference catalog.")

    negative_scores = []
    for row in negative.itertuples():
        vector = embed(encoder, row.image_path)
        negative_scores.append(float(np.max(centroids @ vector)))

    # Select the lowest threshold whose measured false-accept rate on this negative
    # calibration set is at or below the requested target. This is not a guarantee
    # for future field data; it is an empirical calibration report.
    candidates = sorted(set(negative_scores))
    eligible = [
        threshold for threshold in candidates
        if float(np.mean(np.asarray(negative_scores) >= threshold)) <= args.target_false_accept_rate
    ]
    if not eligible:
        raise ValueError("Negative calibration scores cannot meet the requested false-accept target.")
    threshold = float(min(eligible))
    false_accept = float(np.mean(np.asarray(negative_scores) >= threshold))
    accepted_correct = [
        score for score in positive_scores if score >= threshold
    ]
    result = {
        "model_version": "rootwise_mobilenetv3_512d_v1",
        "calibration_method": "global_max_cosine_threshold_on_separate_negative_set",
        "global_acceptance_threshold": threshold,
        "target_false_accept_rate": args.target_false_accept_rate,
        "measured_negative_false_accept_rate": false_accept,
        "negative_sample_count": len(negative_scores),
        "positive_validation_count": len(positive_scores),
        "positive_top1_accuracy": positive_correct / len(positive_scores),
        "accepted_positive_recall": len(accepted_correct) / len(positive_scores),
        "warning": "Empirical calibration only; not a guarantee of field accuracy or scientific verification."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
