"""End-to-end training of the 512-d embedding network (requires TensorFlow).

Objective: a cosine-softmax classifier (unit-norm embedding x unit-norm class weights x scale)
trained on species labels; the classifier head is discarded afterwards and only the embedding
model (input [B,224,224,3] -> [B,512] unit vectors) is saved for export.

This module has to be run with suitable, licensed, labelled botanical images supplied by you.
It fabricates no data and reports only metrics it measures on your held-out splits.
"""
from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ..image_features.model import build_embedding_model, get_backbone
from .config import TrainingConfig
from .data import iterate_batches, make_tf_dataset
from .evaluation import classification_metrics, confusion_matrix_report
from .manifest import load_manifest, manifest_sha256, validate_manifest
from .metadata import TrainingRunMetadata
from .reporting import class_distribution
from .splits import SplitConfig, find_duplicate_groups, group_split


class TrainingDataError(RuntimeError):
    """Raised when the manifest or split cannot support training."""


@dataclass
class TrainingResult:
    output_dir: str
    embedding_model_path: str
    best_checkpoint_path: str
    metadata_path: str
    metrics: Dict[str, Any]


def set_global_seed(seed: int) -> None:
    import tensorflow as tf  # type: ignore

    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)


def _class_weights(train_labels: List[int], n_classes: int) -> Dict[int, float]:
    counts = Counter(train_labels)
    total = len(train_labels)
    return {c: total / (n_classes * counts[c]) for c in range(n_classes) if counts.get(c)}


def _set_trainable(embedding_model: Any, backbone: Any, *, backbone_trainable: bool, last_n: int) -> None:
    from tensorflow import keras  # type: ignore

    backbone.trainable = backbone_trainable
    if backbone_trainable:
        layers = backbone.layers
        for layer in layers[: max(0, len(layers) - last_n)]:
            layer.trainable = False
        for layer in layers:
            if isinstance(layer, keras.layers.BatchNormalization):
                layer.trainable = False  # keep BN statistics fixed while fine-tuning


def train(config: TrainingConfig) -> TrainingResult:
    """Run training and evaluation; write model, metrics, split and metadata files under ``config.output_dir``."""
    import tensorflow as tf  # type: ignore
    from tensorflow import keras  # type: ignore

    out_dir = Path(config.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    set_global_seed(config.seed)
    config.save(str(out_dir / "training_config.json"))

    entries = load_manifest(config.manifest_path)
    base_dir = config.base_dir or str(Path(config.manifest_path).resolve().parent)
    report = validate_manifest(entries, base_dir=base_dir, check_files=True, require_license=config.require_license)
    (out_dir / "manifest_validation.json").write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    if not report.ok:
        raise TrainingDataError(f"Manifest invalid: {[i.message for i in report.errors[:5]]} ...")

    dups = find_duplicate_groups(entries, base_dir=base_dir, near_duplicate_max_hamming=config.near_duplicate_max_hamming)
    if dups.conflicts:
        raise TrainingDataError(f"{len(dups.conflicts)} duplicate image pair(s) carry different species labels.")
    split = group_split(entries, dups.effective_groups, SplitConfig(config.val_fraction, config.test_fraction, config.seed))
    dist = class_distribution(entries, split)
    (out_dir / "class_distribution.json").write_text(json.dumps(dist, indent=2), encoding="utf-8")
    (out_dir / "split.json").write_text(
        json.dumps({"train": split.train, "val": split.val, "test": split.test, "warnings": split.warnings}), encoding="utf-8"
    )
    if not split.train or not split.val:
        raise TrainingDataError("Train and validation splits must both be non-empty; supply more data/groups.")

    labels = sorted({entries[i].species_id for i in split.train})
    label_to_index = {s: i for i, s in enumerate(labels)}
    if len(labels) < 2:
        raise TrainingDataError("Need at least 2 species in the training split.")
    val_idx = [i for i in split.val if entries[i].species_id in label_to_index]
    test_idx = [i for i in split.test if entries[i].species_id in label_to_index]
    (out_dir / "label_map.json").write_text(json.dumps(label_to_index, indent=2, sort_keys=True), encoding="utf-8")

    train_ds = make_tf_dataset(
        entries, split.train, label_to_index, batch_size=config.batch_size, base_dir=base_dir,
        shuffle=True, seed=config.seed, augmentation=config.augmentation_config(),
    )
    val_ds = make_tf_dataset(entries, val_idx, label_to_index, batch_size=config.batch_size, base_dir=base_dir)

    weights = "imagenet" if config.imagenet_weights else None
    embedding_model = build_embedding_model(weights=weights, seed=config.seed)
    backbone = get_backbone(embedding_model)
    n_classes = len(labels)
    head = keras.layers.Dense(
        n_classes, use_bias=False, kernel_constraint=keras.constraints.UnitNorm(axis=0), name="cosine_classifier"
    )(embedding_model.output)
    logits = keras.layers.Rescaling(config.cosine_scale, name="cosine_scale")(head)
    classifier = keras.Model(embedding_model.input, logits, name="rootwise_classifier")

    ckpt = out_dir / "best_checkpoint.weights.h5"
    class_weight = _class_weights([label_to_index[entries[i].species_id] for i in split.train], n_classes) if config.balanced_class_weights else None

    def compile_(lr: float) -> None:
        classifier.compile(
            optimizer=keras.optimizers.Adam(lr),
            loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True),
            metrics=[keras.metrics.SparseCategoricalAccuracy(name="accuracy")],
        )

    def callbacks(tag: str) -> List[Any]:
        cbs: List[Any] = [
            keras.callbacks.ModelCheckpoint(str(ckpt), monitor="val_loss", save_best_only=True, save_weights_only=True),
            keras.callbacks.CSVLogger(str(out_dir / f"history_{tag}.csv")),
        ]
        if config.early_stopping_patience > 0:
            cbs.append(keras.callbacks.EarlyStopping(monitor="val_loss", patience=config.early_stopping_patience))
        return cbs

    steps = -(-len(split.train) // config.batch_size)
    val_steps = -(-len(val_idx) // config.batch_size)
    histories: Dict[str, Any] = {}
    if config.epochs_head > 0:
        _set_trainable(embedding_model, backbone, backbone_trainable=False, last_n=0)
        compile_(config.learning_rate_head)
        h = classifier.fit(
            train_ds, validation_data=val_ds, epochs=config.epochs_head, steps_per_epoch=steps,
            validation_steps=val_steps, callbacks=callbacks("head"), class_weight=class_weight, verbose=2,
        )
        histories["head"] = {k: [float(v) for v in vs] for k, vs in h.history.items()}
    if config.epochs_finetune > 0:
        _set_trainable(embedding_model, backbone, backbone_trainable=True, last_n=config.finetune_last_n_layers)
        compile_(config.learning_rate_finetune)
        h = classifier.fit(
            train_ds, validation_data=val_ds, epochs=config.epochs_finetune, steps_per_epoch=steps,
            validation_steps=val_steps, callbacks=callbacks("finetune"), class_weight=class_weight, verbose=2,
        )
        histories["finetune"] = {k: [float(v) for v in vs] for k, vs in h.history.items()}
    if ckpt.exists():
        classifier.load_weights(str(ckpt))

    metrics: Dict[str, Any] = {"history": histories, "labels": labels}
    for name, idx in (("val", val_idx), ("test", test_idx)):
        if not idx:
            metrics[name] = {"status": "no_samples"}
            continue
        y_true: List[int] = []
        y_pred: List[int] = []
        scores: List[np.ndarray] = []
        for x, y in iterate_batches(entries, idx, label_to_index, batch_size=config.batch_size, base_dir=base_dir):
            logit = np.asarray(classifier(x, training=False))
            y_true += y.tolist()
            y_pred += logit.argmax(axis=1).tolist()
            scores.append(logit)
        metrics[name] = {
            "classification": classification_metrics(y_true, y_pred, labels, y_score=np.concatenate(scores)),
            "confusion": confusion_matrix_report(y_true, y_pred, labels),
        }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    model_path = out_dir / "embedding_model.keras"
    embedding_model.save(str(model_path))
    meta = TrainingRunMetadata.create(
        model_version=config.model_version,
        config_hash=config.config_hash(),
        manifest_sha256=manifest_sha256(entries),
        label_map=label_to_index,
        split_sizes={"train": len(split.train), "val": len(split.val), "test": len(split.test)},
        backbone_init="imagenet" if config.imagenet_weights else "random",
    )
    meta.metrics_files = {"metrics": "metrics.json", "class_distribution": "class_distribution.json"}
    meta.save(str(out_dir / "model_metadata.json"))
    return TrainingResult(str(out_dir), str(model_path), str(ckpt), str(out_dir / "model_metadata.json"), metrics)
