"""Embedding and model-version validation."""
from __future__ import annotations

from typing import Any

import numpy as np

from ..contract import EMBEDDING_DIM


class EmbeddingValidationError(ValueError):
    """Raised for malformed, wrong-sized or non-finite embeddings."""


class ModelVersionMismatchError(ValueError):
    """Raised when embeddings from different model versions would be compared."""


def validate_embedding(
    vec: Any,
    *,
    dim: int = EMBEDDING_DIM,
    require_unit_norm: bool = False,
    unit_tol: float = 1e-3,
    name: str = "embedding",
) -> np.ndarray:
    """Return a float32 ``[dim]`` copy of ``vec`` or raise :class:`EmbeddingValidationError`.

    Accepts shape ``(dim,)`` or ``(1, dim)``. Rejects non-numeric dtypes, wrong sizes,
    NaN/inf values and zero vectors.
    """
    try:
        arr = np.asarray(vec)
    except Exception as exc:
        raise EmbeddingValidationError(f"{name}: cannot convert to array ({exc})") from exc
    if arr.dtype == object or arr.dtype.kind not in "fiu":
        raise EmbeddingValidationError(f"{name}: dtype {arr.dtype} is not numeric.")
    if arr.ndim == 2 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim != 1:
        raise EmbeddingValidationError(f"{name}: expected 1-D vector, got shape {arr.shape}.")
    if arr.shape[0] != dim:
        raise EmbeddingValidationError(f"{name}: dimension {arr.shape[0]} != expected {dim}.")
    arr = arr.astype(np.float32)
    if not np.all(np.isfinite(arr)):
        raise EmbeddingValidationError(f"{name}: contains NaN or infinite values.")
    norm = float(np.linalg.norm(arr))
    if norm <= 1e-12:
        raise EmbeddingValidationError(f"{name}: zero vector.")
    if require_unit_norm and abs(norm - 1.0) > unit_tol:
        raise EmbeddingValidationError(f"{name}: L2 norm {norm:.6f} is not 1 (tol {unit_tol}).")
    return arr


def validate_embedding_matrix(mat: Any, *, dim: int = EMBEDDING_DIM, name: str = "embeddings") -> np.ndarray:
    """Validate an ``[N, dim]`` matrix (N >= 1) and return float32."""
    arr = np.asarray(mat)
    if arr.dtype == object or arr.dtype.kind not in "fiu":
        raise EmbeddingValidationError(f"{name}: dtype {arr.dtype} is not numeric.")
    if arr.ndim != 2 or arr.shape[1] != dim or arr.shape[0] < 1:
        raise EmbeddingValidationError(f"{name}: expected shape [N>=1, {dim}], got {arr.shape}.")
    arr = arr.astype(np.float32)
    if not np.all(np.isfinite(arr)):
        raise EmbeddingValidationError(f"{name}: contains NaN or infinite values.")
    if np.any(np.linalg.norm(arr, axis=1) <= 1e-12):
        raise EmbeddingValidationError(f"{name}: contains zero vectors.")
    return arr


def validate_model_version(actual: str, expected: str) -> None:
    """Raise if model versions differ (embeddings from different versions are not comparable)."""
    if not isinstance(actual, str) or not actual:
        raise ModelVersionMismatchError("model_version must be a non-empty string.")
    if actual != expected:
        raise ModelVersionMismatchError(f"model_version {actual!r} != expected {expected!r}.")
