"""Inference backends: callables mapping ``[N,224,224,3]`` float32 -> ``[N,512]`` float32."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from .._tflite import load_interpreter
from ..contract import EMBEDDING_DIM, INPUT_SHAPE


class KerasBackend:
    """Wrap a Keras model whose output is the embedding."""

    def __init__(self, model: Any) -> None:
        self.model = model

    def __call__(self, batch: np.ndarray) -> np.ndarray:
        out = self.model.predict(batch, verbose=0, batch_size=max(1, len(batch)))
        return np.asarray(out, dtype=np.float32)


class TFLiteBackend:
    """Run a FLOAT32 ``[1,224,224,3] -> [1,512]`` TFLite/LiteRT model one image at a time."""

    def __init__(self, model_path: Optional[str] = None, interpreter: Any = None) -> None:
        if interpreter is None:
            if model_path is None:
                raise ValueError("Provide model_path or interpreter.")
            interpreter = load_interpreter(model_path=model_path)
        self.interpreter = interpreter
        self._in = interpreter.get_input_details()[0]
        self._out = interpreter.get_output_details()[0]
        in_shape = tuple(int(v) for v in self._in["shape"])
        out_shape = tuple(int(v) for v in self._out["shape"])
        if in_shape != INPUT_SHAPE:
            raise ValueError(f"TFLite input shape {in_shape} != {INPUT_SHAPE}")
        if out_shape != (1, EMBEDDING_DIM):
            raise ValueError(f"TFLite output shape {out_shape} != {(1, EMBEDDING_DIM)}")
        if np.dtype(self._in["dtype"]) != np.float32 or np.dtype(self._out["dtype"]) != np.float32:
            raise ValueError("TFLite input and output must be FLOAT32.")

    def __call__(self, batch: np.ndarray) -> np.ndarray:
        outputs = []
        for i in range(len(batch)):
            self.interpreter.set_tensor(self._in["index"], np.asarray(batch[i : i + 1], dtype=np.float32))
            self.interpreter.invoke()
            outputs.append(np.array(self.interpreter.get_tensor(self._out["index"]), dtype=np.float32))
        return np.concatenate(outputs, axis=0)
