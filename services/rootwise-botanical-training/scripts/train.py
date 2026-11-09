#!/usr/bin/env python3
"""Train RootWise's 512D botanical embedding model and export float32 LiteRT."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

MODEL_VERSION = "rootwise_mobilenetv3_512d_v1"
IMAGE_SIZE = (224, 224)
EMBEDDING_DIM = 512
REQUIRED = {
    "image_path", "species_id", "common_name", "scientific_name",
    "family", "observation_group", "source_id", "license", "license_url"
}


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    tf.keras.utils.set_random_seed(seed)


def load_manifest(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path).fillna("")
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Manifest is missing columns: {sorted(missing)}")
    for col in REQUIRED:
        frame[col] = frame[col].astype(str).str.strip()
    if (frame[list(REQUIRED)] == "").any().any():
        bad = [c for c in REQUIRED if (frame[c] == "").any()]
        raise ValueError(f"Required metadata is blank in columns: {bad}")
    frame["image_path"] = frame["image_path"].map(
        lambda value: str((path.parent / value).resolve()) if not Path(value).is_absolute() else value
    )
    missing_images = [p for p in frame["image_path"] if not Path(p).is_file()]
    if missing_images:
        raise FileNotFoundError(f"{len(missing_images)} manifest image(s) are missing; first: {missing_images[0]}")
    if frame["source_id"].duplicated().any():
        raise ValueError("source_id must uniquely identify each source observation/photo row.")
    return frame


def assign_group_splits(frame: pd.DataFrame, seed: int) -> pd.DataFrame:
    if "split" in frame.columns and frame["split"].astype(str).str.strip().ne("").all():
        result = frame.copy()
        result["split"] = result["split"].astype(str).str.lower().str.strip()
        if not set(result["split"]).issubset({"train", "validation", "test"}):
            raise ValueError("split values must be train, validation, or test.")
        group_counts = result.groupby("observation_group")["split"].nunique()
        if (group_counts > 1).any():
            raise ValueError("An observation_group appears in more than one split.")
        return result

    # Deterministic group split within each species to avoid image/individual leakage.
    rng = np.random.default_rng(seed)
    parts = []
    for species_id, group in frame.groupby("species_id"):
        groups = np.array(sorted(group["observation_group"].unique()))
        if len(groups) < 3:
            raise ValueError(
                f"Species {species_id} has {len(groups)} observation groups; at least 3 are required "
                "for train/validation/test separation."
            )
        rng.shuffle(groups)
        n = len(groups)
        n_test = max(1, round(n * 0.15))
        n_val = max(1, round(n * 0.15))
        if n_test + n_val >= n:
            n_test, n_val = 1, 1
        test_groups = set(groups[:n_test])
        val_groups = set(groups[n_test:n_test + n_val])
        part = group.copy()
        part["split"] = part["observation_group"].map(
            lambda value: "test" if value in test_groups else
            "validation" if value in val_groups else "train"
        )
        parts.append(part)
    return pd.concat(parts, ignore_index=True)


def make_dataset(frame: pd.DataFrame, class_to_index: dict[str, int], training: bool, batch_size: int) -> tf.data.Dataset:
    paths = frame["image_path"].tolist()
    labels = frame["species_id"].map(class_to_index).to_numpy(dtype=np.int32)
    ds = tf.data.Dataset.from_tensor_slices((paths, labels))

    def decode(path: tf.Tensor, label: tf.Tensor):
        image = tf.io.read_file(path)
        image = tf.io.decode_image(image, channels=3, expand_animations=False)
        image.set_shape([None, None, 3])
        image = tf.image.resize(image, IMAGE_SIZE, antialias=True)
        image = tf.cast(image, tf.float32)
        image = (image - 127.5) / 127.5
        if training:
            image = tf.image.random_flip_left_right(image)
            image = tf.image.random_brightness(image, max_delta=0.12)
            image = tf.image.random_contrast(image, lower=0.85, upper=1.15)
            image = tf.clip_by_value(image, -1.0, 1.0)
        return image, label

    ds = ds.map(decode, num_parallel_calls=tf.data.AUTOTUNE)
    if training:
        ds = ds.shuffle(min(len(frame), 4096), reshuffle_each_iteration=True)
    return ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)


def build_models(class_count: int):
    inputs = keras.Input(shape=(224, 224, 3), dtype=tf.float32, name="image")
    backbone = keras.applications.MobileNetV3Small(
        input_shape=(224, 224, 3), include_top=False, weights="imagenet",
        include_preprocessing=False
    )
    backbone.trainable = False
    features = backbone(inputs, training=False)
    features = layers.GlobalAveragePooling2D(name="global_pool")(features)
    features = layers.Dropout(0.25)(features)
    embedding = layers.Dense(EMBEDDING_DIM, use_bias=False, name="embedding_projection")(features)
    embedding = layers.UnitNormalization(axis=1, name="embedding")(embedding)
    classifier = layers.Dense(class_count, activation="softmax", name="species_classifier")(embedding)
    training_model = keras.Model(inputs, classifier, name="rootwise_botanical_classifier")
    encoder = keras.Model(inputs, embedding, name="rootwise_botanical_encoder")
    return training_model, encoder, backbone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    seed_everything(args.seed)
    frame = assign_group_splits(load_manifest(args.manifest), args.seed)
    classes = sorted(frame["species_id"].unique())
    if len(classes) < 2:
        raise ValueError("At least two species classes are required.")
    class_to_index = {species: index for index, species in enumerate(classes)}
    for split in ("train", "validation", "test"):
        subset = frame[frame["split"] == split]
        if subset.empty:
            raise ValueError(f"The {split} split is empty.")
        absent = set(classes) - set(subset["species_id"])
        if absent:
            raise ValueError(
                f"{len(absent)} species are missing from {split}. Add more independent observation groups "
                "or provide a carefully reviewed split manifest."
            )

    args.output.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output / "training_manifest.csv", index=False)
    label_map = (
        frame.sort_values("species_id")
        .drop_duplicates("species_id")[["species_id", "common_name", "scientific_name", "family"]]
        .to_dict(orient="records")
    )
    (args.output / "label_map.json").write_text(json.dumps(label_map, indent=2), encoding="utf-8")

    train_ds = make_dataset(frame[frame.split == "train"], class_to_index, True, args.batch_size)
    val_ds = make_dataset(frame[frame.split == "validation"], class_to_index, False, args.batch_size)
    test_ds = make_dataset(frame[frame.split == "test"], class_to_index, False, args.batch_size)

    model, encoder, backbone = build_models(len(classes))
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy", keras.metrics.SparseTopKCategoricalAccuracy(k=min(3, len(classes)), name="top3_accuracy")]
    )
    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=6, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint(args.output / "best_classifier.keras", monitor="val_accuracy", save_best_only=True),
        keras.callbacks.CSVLogger(args.output / "training_history.csv")
    ]
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks)

    # Fine-tune only the upper portion of the visual backbone with a low learning rate.
    backbone.trainable = True
    for layer in backbone.layers[:-30]:
        layer.trainable = False
    model.compile(
        optimizer=keras.optimizers.Adam(1e-5),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy", keras.metrics.SparseTopKCategoricalAccuracy(k=min(3, len(classes)), name="top3_accuracy")]
    )
    model.fit(train_ds, validation_data=val_ds, epochs=max(5, args.epochs // 2), callbacks=callbacks)

    metrics = model.evaluate(test_ds, return_dict=True, verbose=1)
    (args.output / "holdout_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    encoder.save(args.output / "encoder.keras")

    # Float32 LiteRT output must remain exactly [1, 512] for the Android bridge.
    converter = tf.lite.TFLiteConverter.from_keras_model(encoder)
    converter.optimizations = []
    tflite_model = converter.convert()
    model_path = args.output / "rootwise_mobilenetv3_512d.tflite"
    model_path.write_bytes(tflite_model)

    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    input_shape = interpreter.get_input_details()[0]["shape"].tolist()
    output_shape = interpreter.get_output_details()[0]["shape"].tolist()
    if input_shape != [1, 224, 224, 3] or output_shape != [1, EMBEDDING_DIM]:
        raise RuntimeError(f"Exported LiteRT contract mismatch: input={input_shape}, output={output_shape}")

    metadata = {
        "model_version": MODEL_VERSION,
        "architecture": "MobileNetV3Small + trained 512D L2-normalized embedding head",
        "input": {"shape": [1, 224, 224, 3], "dtype": "float32", "normalization": "minus_one_to_one"},
        "output": {"shape": [1, 512], "dtype": "float32", "normalization": "l2"},
        "class_count": len(classes),
        "test_metrics": metrics,
        "seed": args.seed
    }
    (args.output / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "metadata": metadata}, indent=2))


if __name__ == "__main__":
    main()
