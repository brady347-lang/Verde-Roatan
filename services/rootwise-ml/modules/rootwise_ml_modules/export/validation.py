"""Validation of TFLite/LiteRT models against the RootWise tensor contract.

No TensorFlow import is needed here: functions operate on any interpreter-like object
(``get_input_details`` / ``get_output_details`` / ``set_tensor`` / ``invoke`` / ``get_tensor``),
so they can be tested with fakes and used with LiteRT, tflite_runtime or tf.lite.

Tolerances are software-equivalence checks you can tighten or loosen; they are not results.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .._tflite import load_interpreter
from ..contract import EMBEDDING_DIM, INPUT_DTYPE, INPUT_SHAPE, MODEL_VERSION, OUTPUT_DTYPE, OUTPUT_SHAPE
from ..image_features.preprocessing import preprocess_image


@dataclass(frozen=True)
class TensorContract:
    input_shape: Tuple[int, ...]
    input_dtype: str
    output_shape: Tuple[int, ...]
    output_dtype: str
    n_inputs: int = 1
    n_outputs: int = 1


@dataclass
class ValidationReport:
    passed: bool
    checks: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    model_version: str = MODEL_VERSION

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append({"name": name, "passed": bool(ok), "detail": detail})
        if not ok:
            self.errors.append(f"{name}: {detail}")
            self.passed = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "model_version": self.model_version,
            "checks": self.checks,
            "errors": self.errors,
            "metrics": self.metrics,
        }


def inspect_interpreter(interpreter: Any) -> TensorContract:
    ins, outs = interpreter.get_input_details(), interpreter.get_output_details()
    if not ins or not outs:
        raise ValueError("Model has no input or output tensors.")
    return TensorContract(
        tuple(int(v) for v in ins[0]["shape"]),
        str(np.dtype(ins[0]["dtype"])),
        tuple(int(v) for v in outs[0]["shape"]),
        str(np.dtype(outs[0]["dtype"])),
        len(ins),
        len(outs),
    )


def validate_normalization(preprocess: Callable[[Any], Tuple[np.ndarray, Any]] = preprocess_image, atol: float = 1e-6) -> ValidationReport:
    """Check that preprocessing yields float32 [224,224,3] with black -> -1 and white -> +1."""
    rep = ValidationReport(True)
    black = np.zeros((64, 64, 3), np.uint8)
    white = np.full((64, 64, 3), 255, np.uint8)
    mid = np.full((64, 64, 3), 128, np.uint8)
    b, _ = preprocess(black)
    w, _ = preprocess(white)
    m, _ = preprocess(mid)
    rep.add("preprocess_dtype_float32", b.dtype == np.float32, str(b.dtype))
    rep.add("preprocess_shape", b.shape == (224, 224, 3), str(b.shape))
    rep.add("black_maps_to_minus_one", bool(np.allclose(b, -1.0, atol=atol)), f"min={b.min()} max={b.max()}")
    rep.add("white_maps_to_plus_one", bool(np.allclose(w, 1.0, atol=atol)), f"min={w.min()} max={w.max()}")
    rep.add("mid_gray_value", bool(np.allclose(m, 128 / 127.5 - 1.0, atol=atol)), f"mean={m.mean()}")
    return rep


def compare_outputs(a: np.ndarray, b: np.ndarray) -> Dict[str, float]:
    """Max absolute difference and minimum row-wise cosine similarity between two ``[N,D]`` arrays."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.shape != b.shape:
        raise ValueError(f"Shape mismatch: {a.shape} vs {b.shape}")
    cos = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    return {"max_abs_diff": float(np.max(np.abs(a - b))), "min_cosine": float(cos.min()), "mean_cosine": float(cos.mean())}


def _synthetic_inputs(n: int, seed: int) -> np.ndarray:
    """Synthetic uint8 images run through the real preprocessing. For software testing only."""
    rng = np.random.default_rng(seed)
    return np.stack([preprocess_image(rng.integers(0, 256, (96, 96, 3), dtype=np.uint8))[0] for _ in range(n)])


def validate_tflite(
    model: Any,
    *,
    reference_fn: Optional[Callable[[np.ndarray], np.ndarray]] = None,
    sample_inputs: Optional[np.ndarray] = None,
    n_synthetic: int = 4,
    seed: int = 0,
    max_abs_diff_tol: float = 1e-3,
    min_cosine: float = 0.999,
    expect_unit_norm: bool = True,
    unit_norm_tol: float = 1e-3,
) -> ValidationReport:
    """Validate a TFLite model (path or interpreter) and optionally compare with a reference.

    Checks: single FLOAT32 input ``[1,224,224,3]``, single FLOAT32 output ``[1,512]``, finite
    outputs of dimension 512, optional unit L2 norm, and agreement with ``reference_fn`` (e.g. the
    Keras model's predict) on the same ``sample_inputs`` within the given tolerances.
    """
    rep = ValidationReport(True)
    try:
        interp = load_interpreter(model_path=str(model)) if isinstance(model, (str, bytes)) or hasattr(model, "__fspath__") else model
    except Exception as exc:
        rep.add("load_model", False, f"{type(exc).__name__}: {exc}")
        return rep
    rep.add("load_model", True)
    try:
        c = inspect_interpreter(interp)
    except Exception as exc:
        rep.add("inspect_tensors", False, f"{type(exc).__name__}: {exc}")
        return rep
    rep.add("single_input_output", c.n_inputs == 1 and c.n_outputs == 1, f"inputs={c.n_inputs} outputs={c.n_outputs}")
    rep.add("input_shape", c.input_shape == INPUT_SHAPE, f"{c.input_shape} expected {INPUT_SHAPE}")
    rep.add("output_shape", c.output_shape == OUTPUT_SHAPE, f"{c.output_shape} expected {OUTPUT_SHAPE}")
    rep.add("input_dtype", c.input_dtype == INPUT_DTYPE, f"{c.input_dtype} expected {INPUT_DTYPE}")
    rep.add("output_dtype", c.output_dtype == OUTPUT_DTYPE, f"{c.output_dtype} expected {OUTPUT_DTYPE}")
    if not rep.passed:
        return rep  # do not try inference on an incompatible model

    x = sample_inputs if sample_inputs is not None else _synthetic_inputs(n_synthetic, seed)
    x = np.asarray(x, dtype=np.float32)
    if x.ndim != 4 or x.shape[1:] != INPUT_SHAPE[1:]:
        rep.add("sample_input_shape", False, f"{x.shape}")
        return rep
    rep.add("sample_input_range", bool(x.min() >= -1.0 - 1e-6 and x.max() <= 1.0 + 1e-6), f"min={x.min():.4f} max={x.max():.4f}")
    in_idx = interp.get_input_details()[0]["index"]
    out_idx = interp.get_output_details()[0]["index"]
    outs: List[np.ndarray] = []
    try:
        for i in range(len(x)):
            interp.set_tensor(in_idx, x[i : i + 1])
            interp.invoke()
            outs.append(np.array(interp.get_tensor(out_idx), dtype=np.float32))
    except Exception as exc:
        rep.add("inference", False, f"{type(exc).__name__}: {exc}")
        return rep
    out = np.concatenate(outs, axis=0)
    rep.add("inference", True, f"{len(x)} samples")
    rep.add("output_embedding_dim", out.shape == (len(x), EMBEDDING_DIM), f"{out.shape}")
    finite = bool(np.isfinite(out).all())
    rep.add("output_finite", finite)
    if finite and expect_unit_norm:
        norms = np.linalg.norm(out, axis=1)
        dev = float(np.abs(norms - 1.0).max())
        rep.add("output_unit_norm", dev <= unit_norm_tol, f"max |norm-1| = {dev:.2e} (tol {unit_norm_tol})")
        rep.metrics["max_norm_deviation"] = dev
    if reference_fn is not None and finite:
        try:
            ref = np.asarray(reference_fn(x), dtype=np.float32)
            cmp = compare_outputs(out, ref)
            rep.metrics.update(cmp)
            rep.add("matches_reference_max_abs_diff", cmp["max_abs_diff"] <= max_abs_diff_tol, f"{cmp['max_abs_diff']:.3e} (tol {max_abs_diff_tol})")
            rep.add("matches_reference_cosine", cmp["min_cosine"] >= min_cosine, f"{cmp['min_cosine']:.6f} (min {min_cosine})")
        except Exception as exc:
            rep.add("reference_comparison", False, f"{type(exc).__name__}: {exc}")
    rep.metrics["n_samples"] = int(len(x))
    return rep
