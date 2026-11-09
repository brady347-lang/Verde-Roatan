#!/usr/bin/env python3
"""Build provenance-bearing species centroids with the exact trained RootWise encoder."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf

MODEL_VERSION = "rootwise_mobilenetv3_512d_v1"
REQUIRED = {
    "image_path", "species_id", "common_name", "scientific_name", "family",
    "source_id", "license", "license_url", "review_status", "expert_verified",
    "verification_source"
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--encoder", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--calibration", type=Path)
    args = parser.parse_args()

    frame = pd.read_csv(args.manifest).fillna("")
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Reference manifest is missing columns: {sorted(missing)}")
    frame["image_path"] = frame["image_path"].map(
        lambda value: str((args.manifest.parent / value).resolve()) if not Path(value).is_absolute() else value
    )
    frame = frame[frame["review_status"].astype(str).str.lower().str.strip() == "approved"].copy()
    if frame.empty:
        raise ValueError("No approved reference records were supplied.")
    for column in ("source_id", "license", "license_url", "species_id", "common_name", "scientific_name", "family"):
        if frame[column].astype(str).str.strip().eq("").any():
            raise ValueError(f"Approved reference rows must have non-empty {column}.")
    if frame["source_id"].duplicated().any():
        raise ValueError("Each source_id must be unique.")
    for row in frame.itertuples():
        if not Path(row.image_path).is_file():
            raise FileNotFoundError(f"Missing reference image: {row.image_path}")
        if str(row.expert_verified).lower() in {"true", "1", "yes"} and not str(row.verification_source).strip():
            raise ValueError(f"Expert-verified row {row.source_id} needs verification_source.")

    encoder = tf.keras.models.load_model(args.encoder, compile=False)
    if encoder.output_shape != (None, 512):
        raise ValueError(f"Encoder must output 512 dimensions, got {encoder.output_shape}")

    records = []
    for species_id, group in frame.groupby("species_id", sort=True):
        embeddings = []
        for row in group.itertuples():
            image = tf.io.read_file(row.image_path)
            image = tf.io.decode_image(image, channels=3, expand_animations=False)
            image.set_shape([None, None, 3])
            image = tf.image.resize(image, (224, 224), antialias=True)
            image = (tf.cast(image, tf.float32) - 127.5) / 127.5
            vector = encoder(tf.expand_dims(image, 0), training=False).numpy()[0]
            if vector.shape != (512,) or not np.isfinite(vector).all():
                raise ValueError(f"Invalid embedding for reference {row.source_id}.")
            embeddings.append(vector.astype(np.float64))
        centroid = np.mean(np.stack(embeddings), axis=0)
        norm = np.linalg.norm(centroid)
        if norm <= 0 or not np.isfinite(norm):
            raise ValueError(f"Invalid centroid for species {species_id}.")
        centroid = (centroid / norm).astype(np.float32)
        first = group.iloc[0]
        expert_verified = bool(
            group["expert_verified"].astype(str).str.lower().isin({"true", "1", "yes"}).all()
        )
        verification_sources = sorted({
            str(value).strip() for value in group["verification_source"] if str(value).strip()
        })
        if expert_verified and not verification_sources:
            raise ValueError(f"Species {species_id} is marked expert-verified without a verification source.")
        records.append({
            "id": str(species_id),
            "common_name": str(first["common_name"]),
            "scientific_name": str(first["scientific_name"]),
            "family": str(first["family"]),
            "source_id": ";".join(sorted(group["source_id"].astype(str).unique())),
            "source_records": [
                {
                    "source_id": str(row.source_id),
                    "license": str(row.license),
                    "license_url": str(row.license_url)
                } for row in group.itertuples()
            ],
            "expert_verified": expert_verified,
            "verification_source": ";".join(verification_sources),
            "reference_image_count": len(group),
            "embedding": [float(value) for value in centroid]
        })

    payload = {
        "model_version": MODEL_VERSION,
        "embedding_dimension": 512,
        "normalization": "minus_one_to_one",
        "embedding_normalization": "l2",
        "entries": records
    }
    # First pass: omit --calibration to generate reference centroids for calibration.
    # Second pass: provide the calibrated report to create the Android-ready catalog.
    if args.calibration:
        calibration = json.loads(args.calibration.read_text(encoding="utf-8"))
        if calibration.get("model_version") != MODEL_VERSION:
            raise ValueError("Calibration model_version does not match the reference encoder.")
        if calibration.get("calibration_method") != "global_max_cosine_threshold_on_separate_negative_set":
            raise ValueError("Calibration method is missing or unsupported.")
        threshold = float(calibration.get("global_acceptance_threshold", -1))
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("Calibration threshold must be between 0 and 1.")
        if int(calibration.get("negative_sample_count", 0)) < 1000:
            raise ValueError("At least 1,000 negative calibration images are required.")
        if int(calibration.get("positive_validation_count", 0)) < 100:
            raise ValueError("At least 100 positive validation images are required.")
        payload["calibration"] = calibration

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(records)} species centroids to {args.output}")


if __name__ == "__main__":
    main()
