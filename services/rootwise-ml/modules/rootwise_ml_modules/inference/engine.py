"""High-level inference interface composing Modules A-F.

Every public method returns a JSON-compatible ``dict`` and never raises for bad input: errors
are returned as ``{"ok": False, "error": {"code": ..., "message": ...}}``. No database,
authentication or RootWise-specific API is assumed.
"""
from __future__ import annotations

import dataclasses
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np

from ..candidate_ranking import DecisionPolicy, RankingConfig, ReferenceEvidence, SpeciesCatalog, rank_candidates
from ..contract import BASELINE_NOTE, EMBEDDING_DIM, MODEL_VERSION, SIMILARITY_NOTE
from ..feedback import validate_feedback_dict
from ..image_features import FeatureExtractor, ImageValidationError
from ..image_features.extractor import ModelOutputError
from ..image_quality import QualityConfig, assess_quality
from ..similarity import (
    EmbeddingValidationError,
    ModelVersionMismatchError,
    SimilarityIndex,
)


def jsonable(obj: Any) -> Any:
    """Recursively convert NumPy types, dataclasses, tuples and paths to JSON-compatible values."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        if hasattr(obj, "to_dict"):
            return jsonable(obj.to_dict())
        return jsonable(dataclasses.asdict(obj))
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return jsonable(obj.tolist())
    if isinstance(obj, np.generic):
        return jsonable(obj.item())
    if isinstance(obj, float):
        return obj if np.isfinite(obj) else None
    if isinstance(obj, Path):
        return str(obj)
    return obj


def _error(code: str, message: str) -> Dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


@dataclass
class InferenceConfig:
    """Configuration. Provide ``model_path`` (``.tflite`` or Keras file) or an injected ``embed_fn``."""

    model_path: Optional[str] = None
    reference_index_path: Optional[str] = None
    catalog_path: Optional[str] = None
    decision_policy: Optional[Dict[str, Any]] = None  # DecisionPolicy fields, measured on validation data
    model_version: str = MODEL_VERSION
    quality_gate: str = "warn"  # "off" | "warn" | "block"
    ranking: Optional[Dict[str, Any]] = None  # RankingConfig fields
    retrieval_depth: int = 25  # references retrieved per query before species aggregation
    embed_fn: Optional[Callable[[np.ndarray], np.ndarray]] = None  # injected backend (testing / custom runtimes)
    model_info: Optional[Dict[str, Any]] = None
    allow_mode_conversion: bool = False  # accept L/P/CMYK uploads (converted to RGB; original mode is recorded in metadata)


class RootWiseInference:
    """Stateful inference service object; call :meth:`initialize` once, then use the methods."""

    def __init__(self, config: InferenceConfig) -> None:
        if config.quality_gate not in ("off", "warn", "block"):
            raise ValueError("quality_gate must be 'off', 'warn' or 'block'.")
        self.config = config
        self.extractor: Optional[FeatureExtractor] = None
        self.index: Optional[SimilarityIndex] = None
        self.catalog: Optional[SpeciesCatalog] = None
        self.policy: Optional[DecisionPolicy] = None
        self.quality_config = QualityConfig()
        self._init_errors: List[str] = []
        self._initialized = False

    # ------------------------------------------------------------------ setup
    def initialize(self) -> Dict[str, Any]:
        """Load the model, index, catalogue and policy. Failures are recorded, not raised."""
        c = self.config
        self._init_errors = []
        try:
            info = dict(c.model_info) if c.model_info else self._sidecar_info(c.model_path)
            kw = dict(model_version=c.model_version, model_info=info or None, allow_mode_conversion=c.allow_mode_conversion)
            if c.embed_fn is not None:
                self.extractor = FeatureExtractor(c.embed_fn, **kw)
            elif c.model_path:
                if c.model_path.lower().endswith(".tflite"):
                    self.extractor = FeatureExtractor.from_tflite(c.model_path, **kw)
                else:
                    from tensorflow import keras  # type: ignore

                    self.extractor = FeatureExtractor.from_keras_model(keras.models.load_model(c.model_path, compile=False), **kw)
            else:
                self._init_errors.append("No model_path or embed_fn configured.")
        except Exception as exc:
            self._init_errors.append(f"model: {type(exc).__name__}: {exc}")
        try:
            if c.reference_index_path:
                self.index = SimilarityIndex.load(c.reference_index_path, expected_model_version=c.model_version)
        except Exception as exc:
            self._init_errors.append(f"index: {type(exc).__name__}: {exc}")
        try:
            if c.catalog_path:
                self.catalog = SpeciesCatalog.from_json(c.catalog_path)
        except Exception as exc:
            self._init_errors.append(f"catalog: {type(exc).__name__}: {exc}")
        try:
            if c.decision_policy:
                self.policy = DecisionPolicy.from_dict(c.decision_policy)
        except Exception as exc:
            self._init_errors.append(f"policy: {type(exc).__name__}: {exc}")
        self._initialized = True
        return self.readiness()

    @staticmethod
    def _sidecar_info(model_path: Optional[str]) -> Optional[Dict[str, Any]]:
        if not model_path:
            return None
        side = Path(str(model_path) + ".metadata.json")
        if side.is_file():
            try:
                return json.loads(side.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def set_index(self, index: SimilarityIndex) -> None:
        if index.model_version != self.config.model_version:
            raise ModelVersionMismatchError(f"Index model_version {index.model_version!r} != {self.config.model_version!r}")
        self.index = index

    def readiness(self) -> Dict[str, Any]:
        """Readiness report. ``ready_for_embedding`` needs a model; ``ready_for_identification`` also an index."""
        embed_ok = self.extractor is not None
        ident_ok = embed_ok and self.index is not None and len(self.index) > 0
        return jsonable({
            "ok": True,
            "initialized": self._initialized,
            "model_version": self.config.model_version,
            "ready_for_embedding": embed_ok,
            "ready_for_identification": ident_ok,
            "components": {
                "model_loaded": embed_ok,
                "reference_index_loaded": self.index is not None,
                "reference_count": len(self.index) if self.index is not None else 0,
                "catalog_loaded": self.catalog is not None,
                "decision_policy_configured": self.policy is not None,
            },
            "errors": list(self._init_errors),
            "notes": [] if self.policy is not None else ["No decision policy configured: identify() will return decision 'review'."],
        })

    def _need_model(self) -> Optional[Dict[str, Any]]:
        if self.extractor is None:
            return _error("model_not_ready", "No embedding model is loaded; call initialize() and check readiness().")
        return None

    # --------------------------------------------------------------- embedding
    def embed(self, image: Any, *, include_embedding: bool = True) -> Dict[str, Any]:
        """Embed one image (path, bytes, PIL image or uint8 array)."""
        bad = self._need_model()
        if bad:
            return bad
        try:
            res = self.extractor.extract(image)  # type: ignore[union-attr]
        except ImageValidationError as exc:
            return _error(exc.code, exc.message)
        except (ModelOutputError, Exception) as exc:
            return _error("embedding_failed", f"{type(exc).__name__}: {exc}")
        return jsonable({"ok": True, **res.to_dict(include_embedding=include_embedding)})

    def embed_batch(self, images: Sequence[Any], *, include_embeddings: bool = False) -> Dict[str, Any]:
        bad = self._need_model()
        if bad:
            return bad
        try:
            res = self.extractor.extract_batch(images, on_error="skip")  # type: ignore[union-attr]
        except Exception as exc:
            return _error("embedding_failed", f"{type(exc).__name__}: {exc}")
        return jsonable({"ok": True, "model_version": self.config.model_version, **res.to_dict(include_embeddings)})

    # --------------------------------------------------------------- retrieval
    def _query_vector(self, image: Any, embedding: Any) -> Tuple[Optional[np.ndarray], Optional[Dict[str, Any]], Optional[Any]]:
        if (image is None) == (embedding is None):
            return None, _error("bad_request", "Provide exactly one of image or embedding."), None
        if embedding is not None:
            return np.asarray(embedding, dtype=np.float32), None, None
        bad = self._need_model()
        if bad:
            return None, bad, None
        try:
            res = self.extractor.extract(image)  # type: ignore[union-attr]
        except ImageValidationError as exc:
            return None, _error(exc.code, exc.message), None
        except Exception as exc:
            return None, _error("embedding_failed", f"{type(exc).__name__}: {exc}"), None
        return res.embedding, None, res

    def retrieve_similar(self, *, image: Any = None, embedding: Any = None, top_k: int = 5, species_ids: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        """Return the ``top_k`` most cosine-similar reference images."""
        if self.index is None or len(self.index) == 0:
            return _error("index_not_ready", "No reference index is loaded.")
        vec, err, _ = self._query_vector(image, embedding)
        if err:
            return err
        try:
            matches = self.index.search(vec, top_k=top_k, species_ids=species_ids)
        except (EmbeddingValidationError, ModelVersionMismatchError, ValueError) as exc:
            return _error("retrieval_failed", str(exc))
        return jsonable({"ok": True, "model_version": self.config.model_version, "matches": [m.to_dict() for m in matches], "note": SIMILARITY_NOTE})

    # ----------------------------------------------------------------- ranking
    def _rank(self, matches: Sequence[Any], candidate_species_ids: Optional[Iterable[str]]) -> Any:
        ev = [ReferenceEvidence(m.reference_id, m.species_id, m.cosine_similarity, m.image_id) for m in matches]
        rc = RankingConfig(**self.config.ranking) if self.config.ranking else RankingConfig()
        return rank_candidates(ev, self.catalog, config=rc, policy=self.policy, candidate_species_ids=candidate_species_ids)

    def rank_candidates(self, *, image: Any = None, embedding: Any = None, candidate_species_ids: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        """Retrieve references and rank species candidates (decision per the configured policy)."""
        if self.index is None or len(self.index) == 0:
            return _error("index_not_ready", "No reference index is loaded.")
        vec, err, _ = self._query_vector(image, embedding)
        if err:
            return err
        try:
            allowed = None if candidate_species_ids is None else list(candidate_species_ids)
            matches = self.index.search(vec, top_k=self.config.retrieval_depth, species_ids=allowed)
            ranking = self._rank(matches, allowed)
        except Exception as exc:
            return _error("ranking_failed", f"{type(exc).__name__}: {exc}")
        return jsonable({"ok": True, "model_version": self.config.model_version, **ranking.to_dict()})

    # ---------------------------------------------------------- identification
    def identify(self, image: Any, *, candidate_species_ids: Optional[Iterable[str]] = None, top_k_matches: int = 5, include_embedding: bool = False) -> Dict[str, Any]:
        """Full pipeline: quality check -> embedding -> retrieval -> ranking -> decision."""
        t0 = time.perf_counter()
        if self.index is None or len(self.index) == 0:
            return _error("index_not_ready", "No reference index is loaded.")
        bad = self._need_model()
        if bad:
            return bad
        quality = None
        if self.config.quality_gate != "off":
            quality = assess_quality(image, self.quality_config)
            if self.config.quality_gate == "block" and quality.verdict == "unsuitable":
                return jsonable({
                    "ok": True, "decision": "unsuitable_image", "decision_reasons": quality.reasons,
                    "quality": quality.to_dict(), "model_version": self.config.model_version, "candidates": [],
                })
        vec, err, res = self._query_vector(image, None)
        if err:
            return err
        try:
            allowed = None if candidate_species_ids is None else list(candidate_species_ids)
            matches = self.index.search(vec, top_k=max(self.config.retrieval_depth, top_k_matches), species_ids=allowed)
            ranking = self._rank(matches, allowed)
        except Exception as exc:
            return _error("identification_failed", f"{type(exc).__name__}: {exc}")
        notes = [SIMILARITY_NOTE]
        info = res.model_info if res is not None else {}
        if not info.get("botanical_specialization"):
            notes.append(BASELINE_NOTE if not info.get("note") else str(info["note"]))
        return jsonable({
            "ok": True,
            "model_version": self.config.model_version,
            "decision": ranking.decision,
            "decision_reasons": ranking.reasons,
            "candidates": [c.to_dict() for c in ranking.candidates],
            "ambiguous_groups": ranking.ambiguous_groups,
            "matches": [m.to_dict() for m in matches[:top_k_matches]],
            "quality": quality.to_dict() if quality is not None else None,
            "embedding": res.to_dict(include_embedding=include_embedding) if res is not None else None,
            "policy": ranking.policy,
            "warnings": ranking.warnings,
            "notes": notes,
            "processing_ms": round((time.perf_counter() - t0) * 1000.0, 3),
        })

    # ---------------------------------------------------------------- feedback
    def validate_feedback(self, record: Mapping[str, Any]) -> Dict[str, Any]:
        """Validate a feedback dict (does not store it)."""
        return {"ok": True, **validate_feedback_dict(record)}


def build_reference_index(
    extractor: FeatureExtractor,
    items: Sequence[Tuple[str, str, Any]],
    *,
    image_ids: Optional[Sequence[Optional[str]]] = None,
) -> Tuple[SimilarityIndex, List[Dict[str, Any]]]:
    """Embed ``(reference_id, species_id, image)`` items into a new index; returns ``(index, failures)``."""
    index = SimilarityIndex(model_version=extractor.model_version, embedding_dim=extractor.embedding_dim)
    failures: List[Dict[str, Any]] = []
    res = extractor.extract_batch([it[2] for it in items], on_error="skip")
    failures.extend({"reference_id": items[f["index"]][0], **f} for f in res.failures)
    for pos, src_idx in enumerate(res.valid_indices):
        rid, sid, _ = items[src_idx]
        index.add(rid, sid, res.embeddings[pos], image_id=image_ids[src_idx] if image_ids else None)
    return index, failures
