"""Private helper: load a TFLite/LiteRT interpreter from whichever runtime is installed."""
from __future__ import annotations

import importlib
from typing import Any, List, Optional

_CANDIDATES = (
    ("ai_edge_litert.interpreter", "Interpreter"),
    ("tflite_runtime.interpreter", "Interpreter"),
    ("tensorflow", "lite.Interpreter"),
)


class InterpreterUnavailableError(RuntimeError):
    """Raised when no TFLite/LiteRT runtime can be imported or the model cannot be loaded."""


def load_interpreter(model_path: Optional[str] = None, model_content: Optional[bytes] = None) -> Any:
    """Create and allocate an interpreter using the first available runtime.

    Order: ``ai_edge_litert`` (LiteRT), ``tflite_runtime``, ``tensorflow.lite``.
    """
    if (model_path is None) == (model_content is None):
        raise ValueError("Provide exactly one of model_path or model_content.")
    errors: List[str] = []
    for module_name, attr_path in _CANDIDATES:
        try:
            obj: Any = importlib.import_module(module_name)
            for part in attr_path.split("."):
                obj = getattr(obj, part)
        except Exception as exc:  # runtime not installed or broken
            errors.append(f"{module_name}: {type(exc).__name__}: {exc}")
            continue
        try:
            if model_path is not None:
                interpreter = obj(model_path=str(model_path))
            else:
                interpreter = obj(model_content=model_content)
            interpreter.allocate_tensors()
            return interpreter
        except Exception as exc:
            errors.append(f"{module_name} failed to load model: {type(exc).__name__}: {exc}")
    raise InterpreterUnavailableError("No usable TFLite/LiteRT runtime. Tried: " + " | ".join(errors))
