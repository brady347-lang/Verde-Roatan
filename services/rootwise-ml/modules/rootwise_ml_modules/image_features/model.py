"""Keras model builder for the baseline embedding network (TensorFlow imported lazily).

Architecture: MobileNetV3Small (ImageNet-initialised, ``include_preprocessing=False`` so it
expects inputs in [-1, 1]) -> global average pooling -> Dense(512) -> L2 normalisation.

The Dense(512) projection head is NOT pretrained: it is randomly (seeded) initialised.
Until the network is trained on suitable botanical data, the embedding is a generic
baseline and must not be called botanically specialised.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from ..contract import BASELINE_NOTE, EMBEDDING_DIM, INPUT_SIZE, MODEL_VERSION


def _keras() -> Any:
    try:
        from tensorflow import keras  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise ImportError("TensorFlow is required for this function: pip install tensorflow") from exc
    return keras


def build_embedding_model(
    *,
    weights: Optional[str] = "imagenet",
    embedding_dim: int = EMBEDDING_DIM,
    seed: int = 1234,
    batch_size: Optional[int] = None,
    name: str = "rootwise_embedding",
) -> Any:
    """Build the embedding model: input ``[B,224,224,3]`` float32 in [-1,1] -> ``[B,512]`` unit vectors.

    ``weights="imagenet"`` downloads ImageNet weights on first use (network required);
    ``weights=None`` gives random initialisation (useful for tests and offline use).
    The backbone is always called with ``training=False`` so BatchNorm stays in inference mode.
    """
    if embedding_dim < 1:
        raise ValueError("embedding_dim must be positive.")
    keras = _keras()
    backbone = keras.applications.MobileNetV3Small(
        input_shape=(INPUT_SIZE, INPUT_SIZE, 3),
        include_top=False,
        weights=weights,
        include_preprocessing=False,
        pooling="avg",
    )
    inputs = keras.Input(shape=(INPUT_SIZE, INPUT_SIZE, 3), batch_size=batch_size, dtype="float32", name="image")
    x = backbone(inputs, training=False)
    x = keras.layers.Dense(
        embedding_dim,
        kernel_initializer=keras.initializers.GlorotUniform(seed=seed),
        name="embedding_projection",
    )(x)
    outputs = keras.layers.UnitNormalization(axis=-1, name="l2_normalize")(x)
    return keras.Model(inputs, outputs, name=name)


def get_backbone(model: Any) -> Any:
    """Return the nested MobileNetV3Small sub-model of a model built by :func:`build_embedding_model`."""
    keras = _keras()
    for layer in model.layers:
        if isinstance(layer, keras.Model):
            return layer
    raise ValueError("No nested backbone model found.")


def make_fixed_batch_model(model: Any, batch_size: int = 1) -> Any:
    """Return a model sharing weights with ``model`` but with a fixed batch dimension (for TFLite)."""
    keras = _keras()
    inputs = keras.Input(
        shape=(INPUT_SIZE, INPUT_SIZE, 3), batch_size=batch_size, dtype="float32", name="image"
    )
    return keras.Model(inputs, model(inputs), name=f"{model.name}_b{batch_size}")


def describe_model(*, trained_on_botanical_data: bool = False, weights: Optional[str] = "imagenet") -> Dict[str, Any]:
    """Return honest model-info metadata for a model built here."""
    return {
        "model_version": MODEL_VERSION,
        "architecture": "MobileNetV3Small + Dense(512) + L2 normalisation",
        "backbone_init": weights or "random",
        "projection_head_init": "random_seeded" if not trained_on_botanical_data else "trained",
        "trained_on_botanical_data": trained_on_botanical_data,
        "botanical_specialization": trained_on_botanical_data,
        "note": None if trained_on_botanical_data else BASELINE_NOTE,
    }
