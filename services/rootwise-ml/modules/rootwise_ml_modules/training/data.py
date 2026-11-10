"""Batch generation (NumPy) and an optional ``tf.data`` wrapper (TensorFlow imported lazily)."""
from __future__ import annotations

from typing import Any, Dict, Iterator, List, Mapping, Optional, Sequence, Tuple

import numpy as np

from ..contract import INPUT_SIZE
from ..image_features.preprocessing import ImageValidationError, load_image, preprocess_pil
from .augment import AugmentationConfig, augment_pil
from .manifest import ManifestEntry


def load_training_image(
    entry: ManifestEntry,
    *,
    base_dir: Optional[str] = None,
    rng: Optional[np.random.Generator] = None,
    augmentation: Optional[AugmentationConfig] = None,
) -> np.ndarray:
    """Load, optionally augment, and preprocess one manifest image to float32 [224,224,3] in [-1,1]."""
    img, _, _ = load_image(str(entry.resolved_path(base_dir)), allow_mode_conversion=True)
    if augmentation is not None:
        if rng is None:
            raise ValueError("rng is required when augmentation is enabled.")
        img = augment_pil(img, rng, augmentation)
    return preprocess_pil(img)


def iterate_batches(
    entries: Sequence[ManifestEntry],
    indices: Sequence[int],
    label_to_index: Mapping[str, int],
    *,
    batch_size: int,
    base_dir: Optional[str] = None,
    shuffle: bool = False,
    seed: int = 0,
    epoch: int = 0,
    augmentation: Optional[AugmentationConfig] = None,
    on_error: str = "raise",
) -> Iterator[Tuple[np.ndarray, np.ndarray]]:
    """Yield ``(images[B,224,224,3] float32, labels[B] int32)``; deterministic given (seed, epoch)."""
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1.")
    if on_error not in ("raise", "skip"):
        raise ValueError("on_error must be 'raise' or 'skip'.")
    order = np.array(list(indices), dtype=np.int64)
    rng = np.random.default_rng([seed, epoch])
    if shuffle:
        rng.shuffle(order)
    xs: List[np.ndarray] = []
    ys: List[int] = []
    for i in order:
        e = entries[int(i)]
        if e.species_id not in label_to_index:
            raise KeyError(f"species {e.species_id!r} missing from label map.")
        try:
            xs.append(load_training_image(e, base_dir=base_dir, rng=rng, augmentation=augmentation))
        except (ImageValidationError, FileNotFoundError):
            if on_error == "raise":
                raise
            continue
        ys.append(label_to_index[e.species_id])
        if len(xs) == batch_size:
            yield np.stack(xs).astype(np.float32), np.array(ys, dtype=np.int32)
            xs, ys = [], []
    if xs:
        yield np.stack(xs).astype(np.float32), np.array(ys, dtype=np.int32)


def make_tf_dataset(
    entries: Sequence[ManifestEntry],
    indices: Sequence[int],
    label_to_index: Mapping[str, int],
    *,
    batch_size: int,
    base_dir: Optional[str] = None,
    shuffle: bool = False,
    seed: int = 0,
    augmentation: Optional[AugmentationConfig] = None,
) -> Any:
    """Wrap :func:`iterate_batches` in a ``tf.data.Dataset``; the epoch counter advances on every pass."""
    try:
        import tensorflow as tf  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ImportError("TensorFlow is required for make_tf_dataset.") from exc
    state = {"epoch": 0}

    def gen() -> Iterator[Tuple[np.ndarray, np.ndarray]]:
        epoch = state["epoch"]
        state["epoch"] += 1
        yield from iterate_batches(
            entries, indices, label_to_index, batch_size=batch_size, base_dir=base_dir,
            shuffle=shuffle, seed=seed, epoch=epoch, augmentation=augmentation,
        )

    sig = (
        tf.TensorSpec(shape=(None, INPUT_SIZE, INPUT_SIZE, 3), dtype=tf.float32),
        tf.TensorSpec(shape=(None,), dtype=tf.int32),
    )
    return tf.data.Dataset.from_generator(gen, output_signature=sig).prefetch(2)
