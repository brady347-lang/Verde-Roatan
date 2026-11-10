"""Convert the Keras embedding model to a FLOAT32 TFLite/LiteRT file and validate it (needs TensorFlow)."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ..contract import EMBEDDING_DIM, INPUT_SIZE, MODEL_VERSION
from .validation import ValidationReport, validate_normalization, validate_tflite


@dataclass
class ExportReport:
    success: bool
    model_version: str
    tflite_path: Optional[str] = None
    sha256: Optional[str] = None
    size_bytes: Optional[int] = None
    errors: List[str] = field(default_factory=list)
    keras_contract: Dict[str, Any] = field(default_factory=dict)
    normalization: Optional[Dict[str, Any]] = None
    tflite_validation: Optional[Dict[str, Any]] = None
    metadata_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


def _check_keras_contract(model: Any) -> List[str]:
    problems: List[str] = []
    ins, outs = model.inputs, model.outputs
    if len(ins) != 1 or len(outs) != 1:
        return [f"Expected 1 input and 1 output, got {len(ins)} and {len(outs)}."]
    i, o = tuple(ins[0].shape), tuple(outs[0].shape)
    if i[1:] != (INPUT_SIZE, INPUT_SIZE, 3):
        problems.append(f"Input shape {i} incompatible with [*,{INPUT_SIZE},{INPUT_SIZE},3].")
    if o[1:] != (EMBEDDING_DIM,):
        problems.append(f"Output shape {o} incompatible with [*,{EMBEDDING_DIM}].")
    if "float32" not in str(ins[0].dtype) or "float32" not in str(outs[0].dtype):
        problems.append("Input and output dtypes must be float32.")
    return problems


def export_to_tflite(
    keras_model: Any,
    output_path: str,
    *,
    model_version: str = MODEL_VERSION,
    validate: bool = True,
    n_synthetic: int = 4,
    max_abs_diff_tol: float = 1e-3,
    min_cosine: float = 0.999,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> ExportReport:
    """Export ``keras_model`` as FLOAT32 ``[1,224,224,3] -> [1,512]`` and write ``<path>.metadata.json``.

    No quantisation is applied. Conversion failures are captured in the report rather than raised.
    """
    report = ExportReport(False, model_version)
    problems = _check_keras_contract(keras_model)
    report.keras_contract = {"input_shape": str(keras_model.input_shape), "output_shape": str(keras_model.output_shape)}
    if problems:
        report.errors.extend(problems)
        return report
    try:
        import tensorflow as tf  # type: ignore
        from ..image_features.model import make_fixed_batch_model

        fixed = make_fixed_batch_model(keras_model, 1)
        converter = tf.lite.TFLiteConverter.from_keras_model(fixed)
        converter.optimizations = []
        converter.target_spec.supported_types = [tf.float32]
        flatbuffer = converter.convert()
    except Exception as exc:
        report.errors.append(f"conversion_failed: {type(exc).__name__}: {exc}")
        return report

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(flatbuffer)
    report.tflite_path = str(out)
    report.size_bytes = len(flatbuffer)
    report.sha256 = hashlib.sha256(flatbuffer).hexdigest()

    ok = True
    if validate:
        norm = validate_normalization()
        report.normalization = norm.to_dict()
        ok &= norm.passed

        def reference(x: np.ndarray) -> np.ndarray:
            return np.asarray(keras_model.predict(x, verbose=0), dtype=np.float32)

        val: ValidationReport = validate_tflite(
            str(out), reference_fn=reference, n_synthetic=n_synthetic,
            max_abs_diff_tol=max_abs_diff_tol, min_cosine=min_cosine,
        )
        report.tflite_validation = val.to_dict()
        ok &= val.passed
        report.errors.extend(val.errors + norm.errors)

    meta = {
        "model_version": model_version,
        "input": {"shape": [1, INPUT_SIZE, INPUT_SIZE, 3], "dtype": "float32", "range": [-1.0, 1.0]},
        "output": {"shape": [1, EMBEDDING_DIM], "dtype": "float32", "l2_normalized": True},
        "sha256": report.sha256,
        "validated": bool(validate and ok),
        "quantization": "none (FLOAT32)",
        **(extra_metadata or {}),
    }
    meta_path = out.with_suffix(out.suffix + ".metadata.json")
    meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report.metadata_path = str(meta_path)
    report.success = ok
    return report
