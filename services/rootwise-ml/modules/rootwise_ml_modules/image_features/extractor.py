"""Embedding extraction: preprocessing + backend inference + L2 normalisation + metadata."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

import numpy as np

from ..contract import BASELINE_NOTE, EMBEDDING_DIM, MODEL_VERSION
from .backends import KerasBackend, TFLiteBackend
from .preprocessing import (
    DEFAULT_MAX_PIXELS,
    DEFAULT_MIN_SIDE,
    ImageInput,
    ImageValidationError,
    PreprocessMetadata,
    preprocess_batch,
    preprocess_image,
)

Backend = Callable[[np.ndarray], np.ndarray]


class ModelOutputError(RuntimeError):
    """Raised when a backend returns a malformed or non-finite embedding."""


@dataclass
class EmbeddingResult:
    """Embedding for one image."""

    embedding: np.ndarray  # float32 [512], unit L2 norm
    model_version: str
    metadata: PreprocessMetadata
    processing_ms: float
    model_info: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self, include_embedding: bool = False) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "model_version": self.model_version,
            "embedding_dim": int(self.embedding.shape[0]),
            "l2_normalized": True,
            "preprocessing": self.metadata.to_dict(),
            "processing_ms": round(self.processing_ms, 3),
            "model_info": self.model_info,
        }
        if include_embedding:
            d["embedding"] = [float(v) for v in self.embedding]
        return d


@dataclass
class BatchEmbeddingResult:
    """Embeddings for a batch; failed inputs are listed in ``failures`` when ``on_error='skip'``."""

    embeddings: np.ndarray  # [M, 512]
    results: List[EmbeddingResult]
    valid_indices: List[int]
    failures: List[Dict[str, Any]]
    processing_ms: float

    def to_dict(self, include_embeddings: bool = False) -> Dict[str, Any]:
        return {
            "count": len(self.results),
            "valid_indices": self.valid_indices,
            "failures": self.failures,
            "processing_ms": round(self.processing_ms, 3),
            "results": [r.to_dict(include_embeddings) for r in self.results],
        }


def l2_normalize_rows(x: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    """L2-normalise rows; raise if any row is non-finite or has (near) zero norm."""
    x = np.asarray(x, dtype=np.float32)
    if not np.all(np.isfinite(x)):
        raise ModelOutputError("Embedding contains NaN or infinite values.")
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if np.any(norms < eps):
        raise ModelOutputError("Embedding has (near) zero norm and cannot be normalised.")
    return (x / norms).astype(np.float32)


class FeatureExtractor:
    """Extract 512-d L2-normalised embeddings from RGB plant photographs.

    ``backend`` is any callable mapping a float32 ``[N,224,224,3]`` batch in [-1,1] to ``[N,512]``.
    Use :meth:`from_keras_model` or :meth:`from_tflite` for the standard backends.
    """

    def __init__(
        self,
        backend: Backend,
        *,
        model_version: str = MODEL_VERSION,
        embedding_dim: int = EMBEDDING_DIM,
        batch_size: int = 32,
        model_info: Optional[Mapping[str, Any]] = None,
        max_pixels: int = DEFAULT_MAX_PIXELS,
        min_side: int = DEFAULT_MIN_SIDE,
        allow_mode_conversion: bool = False,
    ) -> None:
        if not callable(backend):
            raise TypeError("backend must be callable.")
        if batch_size < 1:
            raise ValueError("batch_size must be >= 1.")
        if not model_version:
            raise ValueError("model_version must be non-empty.")
        self.backend = backend
        self.model_version = model_version
        self.embedding_dim = embedding_dim
        self.batch_size = batch_size
        self.max_pixels = max_pixels
        self.min_side = min_side
        self.allow_mode_conversion = allow_mode_conversion
        self.model_info: Dict[str, Any] = dict(
            model_info
            if model_info is not None
            else {
                "architecture": "MobileNetV3Small + Dense(512) + L2",
                "backbone_init": "imagenet",
                "botanical_specialization": False,
                "note": BASELINE_NOTE,
            }
        )

    @classmethod
    def from_keras_model(cls, model: Any, **kwargs: Any) -> "FeatureExtractor":
        return cls(KerasBackend(model), **kwargs)

    @classmethod
    def from_tflite(cls, model_path: str, **kwargs: Any) -> "FeatureExtractor":
        return cls(TFLiteBackend(model_path=model_path), **kwargs)

    def _embed_array(self, arr: np.ndarray) -> np.ndarray:
        outs: List[np.ndarray] = []
        for start in range(0, len(arr), self.batch_size):
            chunk = arr[start : start + self.batch_size]
            out = np.asarray(self.backend(chunk), dtype=np.float32)
            if out.shape != (len(chunk), self.embedding_dim):
                raise ModelOutputError(
                    f"Backend returned shape {out.shape}, expected {(len(chunk), self.embedding_dim)}."
                )
            outs.append(out)
        return l2_normalize_rows(np.concatenate(outs, axis=0))

    def extract(self, source: ImageInput) -> EmbeddingResult:
        """Embed one image. Raises :class:`ImageValidationError` for bad input."""
        t0 = time.perf_counter()
        arr, meta = preprocess_image(
            source,
            max_pixels=self.max_pixels,
            min_side=self.min_side,
            allow_mode_conversion=self.allow_mode_conversion,
        )
        emb = self._embed_array(arr[None, ...])[0]
        return EmbeddingResult(emb, self.model_version, meta, (time.perf_counter() - t0) * 1000.0, dict(self.model_info))

    def extract_batch(self, sources: Sequence[ImageInput], on_error: str = "raise") -> BatchEmbeddingResult:
        """Embed many images. With ``on_error='skip'`` invalid inputs are reported in ``failures``."""
        t0 = time.perf_counter()
        pre = preprocess_batch(
            sources,
            on_error=on_error,
            max_pixels=self.max_pixels,
            min_side=self.min_side,
            allow_mode_conversion=self.allow_mode_conversion,
        )
        if len(pre.valid_indices) == 0:
            embs = np.zeros((0, self.embedding_dim), np.float32)
        else:
            embs = self._embed_array(pre.array)
        total_ms = (time.perf_counter() - t0) * 1000.0
        per = total_ms / max(1, len(pre.valid_indices))
        results = [
            EmbeddingResult(embs[i], self.model_version, pre.metadata[i], per, dict(self.model_info))
            for i in range(len(pre.valid_indices))
        ]
        return BatchEmbeddingResult(embs, results, pre.valid_indices, pre.failures, total_ms)
