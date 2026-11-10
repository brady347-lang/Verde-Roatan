"""TensorFlow-dependent tests. Skipped automatically when TensorFlow is not installed.

These tests build the network with ``weights=None`` (random init, no download) and use only
synthetic images. They test software behaviour, NOT botanical accuracy.
"""
import numpy as np
import pytest

tf = pytest.importorskip("tensorflow")

from rootwise_ml_modules.export import export_to_tflite  # noqa: E402
from rootwise_ml_modules.image_features import FeatureExtractor  # noqa: E402
from rootwise_ml_modules.image_features.model import build_embedding_model, get_backbone, make_fixed_batch_model  # noqa: E402
from rootwise_ml_modules.training import TrainingConfig  # noqa: E402

from .helpers import make_dataset, noise_image  # noqa: E402


@pytest.fixture(scope="module")
def model():
    return build_embedding_model(weights=None, seed=1)


def test_model_contract(model):
    x = np.random.default_rng(0).uniform(-1, 1, (2, 224, 224, 3)).astype(np.float32)
    y = model.predict(x, verbose=0)
    assert y.shape == (2, 512) and y.dtype == np.float32
    assert np.allclose(np.linalg.norm(y, axis=1), 1.0, atol=1e-4)
    assert get_backbone(model).name.lower().startswith("mobilenet")
    fixed = make_fixed_batch_model(model, 1)
    assert tuple(fixed.input_shape) == (1, 224, 224, 3) and tuple(fixed.output_shape) == (1, 512)


def test_extractor_with_keras_backend(model):
    ex = FeatureExtractor.from_keras_model(model)
    r = ex.extract(noise_image(seed=1))
    assert r.embedding.shape == (512,) and abs(np.linalg.norm(r.embedding) - 1) < 1e-4


def test_export_and_validate_tflite(model, tmp_path):
    pytest.importorskip("tensorflow.lite")
    report = export_to_tflite(model, str(tmp_path / "m.tflite"))
    assert report.success, report.errors
    assert report.tflite_validation["passed"] and report.sha256
    meta = (tmp_path / "m.tflite.metadata.json").read_text()
    assert "rootwise_mobilenetv3_512d_v1" in meta


def test_export_rejects_incompatible_model(tmp_path):
    from tensorflow import keras

    inp = keras.Input(shape=(64, 64, 3))
    bad = keras.Model(inp, keras.layers.Dense(8)(keras.layers.GlobalAveragePooling2D()(inp)))
    report = export_to_tflite(bad, str(tmp_path / "bad.tflite"))
    assert not report.success and report.errors and report.tflite_path is None


def test_training_smoke_on_synthetic_data(tmp_path):
    """Smoke test of the training loop mechanics only; the data are synthetic colour patches."""
    from rootwise_ml_modules.training.trainer import train

    manifest = make_dataset(tmp_path, ["sp_a", "sp_b", "sp_c"], 6, 1)
    cfg = TrainingConfig(
        manifest_path=str(manifest), output_dir=str(tmp_path / "run"), imagenet_weights=False,
        batch_size=4, epochs_head=1, epochs_finetune=0, val_fraction=0.2, test_fraction=0.2,
    )
    result = train(cfg)
    assert (tmp_path / "run" / "embedding_model.keras").exists()
    assert (tmp_path / "run" / "metrics.json").exists() and (tmp_path / "run" / "model_metadata.json").exists()
    assert result.metrics["labels"] == ["sp_a", "sp_b", "sp_c"]
