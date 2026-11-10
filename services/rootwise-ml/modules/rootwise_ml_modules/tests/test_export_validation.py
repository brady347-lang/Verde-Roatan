"""Tests of the LiteRT validation logic using fake interpreters (no TensorFlow required)."""
import numpy as np
import pytest

from rootwise_ml_modules.export import compare_outputs, inspect_interpreter, validate_normalization, validate_tflite
from rootwise_ml_modules.image_features import preprocess_image

from .helpers import FakeInterpreter, fake_embed


def failed(rep):
    return {c["name"] for c in rep.checks if not c["passed"]}


def test_compliant_model_passes_and_matches_reference():
    rep = validate_tflite(FakeInterpreter(), reference_fn=fake_embed)
    assert rep.passed and not rep.errors
    assert rep.metrics["max_abs_diff"] == pytest.approx(0.0, abs=1e-6) and rep.metrics["n_samples"] == 4
    names = {c["name"] for c in rep.checks}
    assert {"input_shape", "output_shape", "input_dtype", "output_dtype", "output_embedding_dim", "output_unit_norm"} <= names


def test_contract_violations_are_reported():
    assert "input_shape" in failed(validate_tflite(FakeInterpreter(in_shape=(1, 128, 128, 3))))
    assert "output_shape" in failed(validate_tflite(FakeInterpreter(out_shape=(1, 256))))
    assert "input_dtype" in failed(validate_tflite(FakeInterpreter(in_dtype=np.uint8)))
    assert "output_dtype" in failed(validate_tflite(FakeInterpreter(out_dtype=np.float16)))
    batch4 = validate_tflite(FakeInterpreter(in_shape=(4, 224, 224, 3), out_shape=(4, 512)))
    assert not batch4.passed and not batch4.passed
    rep = validate_tflite(FakeInterpreter(in_shape=(1, 128, 128, 3)))
    assert "inference" not in {c["name"] for c in rep.checks}  # no inference attempted on incompatible model


def test_numeric_problems_are_reported():
    nan = validate_tflite(FakeInterpreter(fn=lambda x: np.full((1, 512), np.nan)))
    assert "output_finite" in failed(nan)
    unnormalised = validate_tflite(FakeInterpreter(fn=lambda x: 5 * fake_embed(x)))
    assert "output_unit_norm" in failed(unnormalised)
    assert validate_tflite(FakeInterpreter(fn=lambda x: 5 * fake_embed(x)), expect_unit_norm=False).passed

    def boom(x):
        raise RuntimeError("invoke failed")

    assert "inference" in failed(validate_tflite(FakeInterpreter(fn=boom)))


def test_reference_mismatch_is_detected():
    other = lambda x: np.roll(fake_embed(x), 3, axis=1)  # noqa: E731
    rep = validate_tflite(FakeInterpreter(), reference_fn=other)
    assert {"matches_reference_max_abs_diff", "matches_reference_cosine"} <= failed(rep)
    slightly = lambda x: fake_embed(x) + 1e-5  # noqa: E731
    assert validate_tflite(FakeInterpreter(), reference_fn=slightly, expect_unit_norm=False).passed
    broken = lambda x: (_ for _ in ()).throw(ValueError("ref failed"))  # noqa: E731
    assert "reference_comparison" in failed(validate_tflite(FakeInterpreter(), reference_fn=broken))


def test_sample_input_validation():
    out_of_range = np.full((2, 224, 224, 3), 5.0, np.float32)
    assert "sample_input_range" in failed(validate_tflite(FakeInterpreter(), sample_inputs=out_of_range))
    assert "sample_input_shape" in failed(validate_tflite(FakeInterpreter(), sample_inputs=np.zeros((2, 10, 10, 3), np.float32)))


def test_missing_model_file_reports_load_failure(tmp_path):
    rep = validate_tflite(str(tmp_path / "nope.tflite"))
    assert not rep.passed and failed(rep) == {"load_model"}


def test_normalization_validation():
    assert validate_normalization().passed

    def zero_one(src):
        arr, meta = preprocess_image(src)
        return (arr + 1.0) / 2.0, meta  # wrong range [0, 1]: black->0 and mid-gray are wrong (white->1 happens to be right)

    bad = validate_normalization(zero_one)
    assert not bad.passed and {"black_maps_to_minus_one", "mid_gray_value"} <= failed(bad)


def test_compare_outputs_and_inspect():
    a = fake_embed(np.random.default_rng(0).uniform(-1, 1, (3, 224, 224, 3)))
    c = compare_outputs(a, a)
    assert c["max_abs_diff"] == 0 and c["min_cosine"] == pytest.approx(1.0)
    with pytest.raises(ValueError):
        compare_outputs(a, a[:2])
    ct = inspect_interpreter(FakeInterpreter())
    assert ct.input_shape == (1, 224, 224, 3) and ct.output_shape == (1, 512) and ct.input_dtype == "float32"
