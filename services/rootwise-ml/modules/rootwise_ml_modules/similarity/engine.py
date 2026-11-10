"""Cosine similarity index over reference embeddings.

All scores are raw cosine similarities in [-1, 1]. They are NOT probabilities and have
not been calibrated; every serialised result carries a ``score_type`` marker.
"""
from __future__ import annotations

import json
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

import numpy as np

from ..contract import EMBEDDING_DIM, MODEL_VERSION, SIMILARITY_NOTE
from .validation import (
    EmbeddingValidationError,
    validate_embedding,
    validate_embedding_matrix,
    validate_model_version,
)

SCORE_TYPE = "cosine_similarity_uncalibrated"


def cosine_similarity(a: Any, b: Any, *, dim: int = EMBEDDING_DIM) -> float:
    """Cosine similarity between two validated embeddings."""
    va = validate_embedding(a, dim=dim, name="a")
    vb = validate_embedding(b, dim=dim, name="b")
    sim = float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb)))
    return float(np.clip(sim, -1.0, 1.0))


def cosine_similarity_matrix(a: Any, b: Any, *, dim: int = EMBEDDING_DIM) -> np.ndarray:
    """Pairwise cosine similarities, shape ``[len(a), len(b)]``."""
    ma = validate_embedding_matrix(a, dim=dim, name="a")
    mb = validate_embedding_matrix(b, dim=dim, name="b")
    ma = ma / np.linalg.norm(ma, axis=1, keepdims=True)
    mb = mb / np.linalg.norm(mb, axis=1, keepdims=True)
    return np.clip(ma @ mb.T, -1.0, 1.0)


@dataclass(frozen=True)
class Match:
    """One retrieved reference."""

    rank: int
    reference_id: str
    species_id: str
    cosine_similarity: float
    image_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rank": self.rank,
            "reference_id": self.reference_id,
            "species_id": self.species_id,
            "cosine_similarity": self.cosine_similarity,
            "score_type": SCORE_TYPE,
            "image_id": self.image_id,
        }


@dataclass(frozen=True)
class SpeciesCentroid:
    """L2-normalised mean embedding of a species' references."""

    species_id: str
    centroid: np.ndarray = field(compare=False, repr=False)
    n_references: int = 0


@dataclass(frozen=True)
class DuplicatePair:
    """Two references whose embeddings are (near) identical."""

    reference_a: str
    reference_b: str
    cosine_similarity: float
    kind: str  # "exact" or "near"
    same_species: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "reference_a": self.reference_a,
            "reference_b": self.reference_b,
            "cosine_similarity": self.cosine_similarity,
            "score_type": SCORE_TYPE,
            "kind": self.kind,
            "same_species": self.same_species,
        }


def group_matches_by_species(matches: Iterable[Match]) -> "OrderedDict[str, List[Match]]":
    """Group matches by species, preserving rank order of first appearance."""
    groups: "OrderedDict[str, List[Match]]" = OrderedDict()
    for m in matches:
        groups.setdefault(m.species_id, []).append(m)
    return groups


class SimilarityIndex:
    """In-memory exact cosine-similarity index (brute force; suitable for up to ~10^5 references)."""

    def __init__(
        self,
        model_version: str = MODEL_VERSION,
        embedding_dim: int = EMBEDDING_DIM,
        *,
        require_unit_norm: bool = False,
        unit_tol: float = 1e-3,
    ) -> None:
        if not model_version:
            raise ValueError("model_version must be non-empty.")
        self.model_version = model_version
        self.embedding_dim = embedding_dim
        self.require_unit_norm = require_unit_norm
        self.unit_tol = unit_tol
        self._reference_ids: List[str] = []
        self._species_ids: List[str] = []
        self._image_ids: List[Optional[str]] = []
        self._vectors: List[np.ndarray] = []
        self._index_of: Dict[str, int] = {}
        self._matrix: Optional[np.ndarray] = None

    def __len__(self) -> int:
        return len(self._reference_ids)

    @property
    def matrix(self) -> np.ndarray:
        if self._matrix is None:
            self._matrix = (
                np.stack(self._vectors, axis=0)
                if self._vectors
                else np.zeros((0, self.embedding_dim), np.float32)
            )
        return self._matrix

    @property
    def species_ids(self) -> List[str]:
        return sorted(set(self._species_ids))

    def add(
        self,
        reference_id: str,
        species_id: str,
        embedding: Any,
        *,
        model_version: Optional[str] = None,
        image_id: Optional[str] = None,
    ) -> None:
        """Add one reference. Embeddings are validated and stored L2-normalised."""
        if not reference_id or not isinstance(reference_id, str):
            raise ValueError("reference_id must be a non-empty string.")
        if not species_id or not isinstance(species_id, str):
            raise ValueError("species_id must be a non-empty string.")
        if reference_id in self._index_of:
            raise ValueError(f"Duplicate reference_id: {reference_id!r}")
        if model_version is not None:
            validate_model_version(model_version, self.model_version)
        vec = validate_embedding(
            embedding,
            dim=self.embedding_dim,
            require_unit_norm=self.require_unit_norm,
            unit_tol=self.unit_tol,
            name=f"reference {reference_id!r}",
        )
        vec = (vec / np.linalg.norm(vec)).astype(np.float32)
        self._index_of[reference_id] = len(self._reference_ids)
        self._reference_ids.append(reference_id)
        self._species_ids.append(species_id)
        self._image_ids.append(image_id)
        self._vectors.append(vec)
        self._matrix = None

    def add_many(self, items: Iterable[Mapping[str, Any]]) -> int:
        """Add references from mappings with keys reference_id, species_id, embedding[, model_version, image_id]."""
        n = 0
        for item in items:
            self.add(
                item["reference_id"],
                item["species_id"],
                item["embedding"],
                model_version=item.get("model_version"),
                image_id=item.get("image_id"),
            )
            n += 1
        return n

    def search(
        self,
        query: Any,
        top_k: int = 5,
        *,
        query_model_version: Optional[str] = None,
        species_ids: Optional[Iterable[str]] = None,
        min_similarity: Optional[float] = None,
    ) -> List[Match]:
        """Return the ``top_k`` most cosine-similar references (ties broken by insertion order)."""
        if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1:
            raise ValueError("top_k must be an integer >= 1.")
        if query_model_version is not None:
            validate_model_version(query_model_version, self.model_version)
        q = validate_embedding(query, dim=self.embedding_dim, name="query")
        q = q / np.linalg.norm(q)
        if len(self) == 0:
            return []
        sims = np.clip(self.matrix @ q, -1.0, 1.0)
        idx = np.arange(len(self))
        if species_ids is not None:
            allowed = set(species_ids)
            mask = np.array([s in allowed for s in self._species_ids], dtype=bool)
            idx = idx[mask]
        if min_similarity is not None:
            idx = idx[sims[idx] >= min_similarity]
        if idx.size == 0:
            return []
        order = np.lexsort((idx, -sims[idx]))
        chosen = idx[order][:top_k]
        return [
            Match(
                rank=r + 1,
                reference_id=self._reference_ids[i],
                species_id=self._species_ids[i],
                cosine_similarity=float(sims[i]),
                image_id=self._image_ids[i],
            )
            for r, i in enumerate(chosen)
        ]

    def species_centroids(self) -> Dict[str, SpeciesCentroid]:
        """Per-species L2-normalised mean embedding."""
        groups: Dict[str, List[int]] = {}
        for i, s in enumerate(self._species_ids):
            groups.setdefault(s, []).append(i)
        out: Dict[str, SpeciesCentroid] = {}
        for s, ids in sorted(groups.items()):
            mean = self.matrix[ids].mean(axis=0)
            norm = float(np.linalg.norm(mean))
            if norm <= 1e-9:
                raise EmbeddingValidationError(f"Centroid of species {s!r} has ~zero norm.")
            out[s] = SpeciesCentroid(s, (mean / norm).astype(np.float32), len(ids))
        return out

    def search_centroids(self, query: Any, top_k: int = 5) -> List[Dict[str, Any]]:
        """Rank species by cosine similarity of the query to each species centroid."""
        if top_k < 1:
            raise ValueError("top_k must be >= 1.")
        q = validate_embedding(query, dim=self.embedding_dim, name="query")
        q = q / np.linalg.norm(q)
        rows = [
            (s, float(np.clip(np.dot(c.centroid, q), -1, 1)), c.n_references)
            for s, c in self.species_centroids().items()
        ]
        rows.sort(key=lambda r: (-r[1], r[0]))
        return [
            {"rank": i + 1, "species_id": s, "cosine_similarity": v, "score_type": SCORE_TYPE, "n_references": n}
            for i, (s, v, n) in enumerate(rows[:top_k])
        ]

    def find_duplicates(
        self, *, near_threshold: float, exact_tolerance: float = 1e-6, chunk_size: int = 512
    ) -> List[DuplicatePair]:
        """Find reference pairs with cosine similarity >= ``near_threshold``.

        ``near_threshold`` has no default on purpose: choose it from your own data. Embedding
        similarity can miss duplicates and can flag distinct images; it is a screening aid.
        Pairs are labelled "exact" when similarity >= 1 - ``exact_tolerance``.
        """
        if not -1.0 <= near_threshold <= 1.0:
            raise ValueError("near_threshold must be in [-1, 1].")
        n = len(self)
        pairs: List[DuplicatePair] = []
        if n < 2:
            return pairs
        m = self.matrix
        for start in range(0, n, chunk_size):
            block = np.clip(m[start : start + chunk_size] @ m.T, -1.0, 1.0)
            rows, cols = np.nonzero(block >= near_threshold)
            for r, c in zip(rows, cols):
                i = start + int(r)
                j = int(c)
                if j <= i:
                    continue
                sim = float(block[r, c])
                pairs.append(
                    DuplicatePair(
                        self._reference_ids[i],
                        self._reference_ids[j],
                        sim,
                        "exact" if sim >= 1.0 - exact_tolerance else "near",
                        self._species_ids[i] == self._species_ids[j],
                    )
                )
        pairs.sort(key=lambda p: (-p.cosine_similarity, p.reference_a, p.reference_b))
        return pairs

    def check_duplicate(self, query: Any, *, near_threshold: float) -> List[Match]:
        """Return existing references at or above ``near_threshold`` similarity to ``query``."""
        if not -1.0 <= near_threshold <= 1.0:
            raise ValueError("near_threshold must be in [-1, 1].")
        return self.search(query, top_k=max(1, len(self)), min_similarity=near_threshold) if len(self) else []

    def save(self, path: str) -> None:
        """Save to a single ``.npz`` file (no pickles)."""
        meta = {"model_version": self.model_version, "embedding_dim": self.embedding_dim}
        np.savez_compressed(
            path,
            vectors=self.matrix,
            reference_ids=np.array(self._reference_ids, dtype=str),
            species_ids=np.array(self._species_ids, dtype=str),
            image_ids=np.array([i if i is not None else "" for i in self._image_ids], dtype=str),
            has_image_id=np.array([i is not None for i in self._image_ids], dtype=bool),
            meta=np.array(json.dumps(meta)),
        )

    @classmethod
    def load(cls, path: str, *, expected_model_version: Optional[str] = None) -> "SimilarityIndex":
        """Load an index saved by :meth:`save`, validating version and vectors."""
        p = Path(path)
        if not p.is_file():
            raise FileNotFoundError(f"Index file not found: {p}")
        with np.load(p, allow_pickle=False) as data:
            meta = json.loads(str(data["meta"]))
            if expected_model_version is not None:
                validate_model_version(meta["model_version"], expected_model_version)
            idx = cls(meta["model_version"], int(meta["embedding_dim"]))
            vectors = data["vectors"]
            has_img = data["has_image_id"]
            for i in range(len(data["reference_ids"])):
                idx.add(
                    str(data["reference_ids"][i]),
                    str(data["species_ids"][i]),
                    vectors[i],
                    image_id=str(data["image_ids"][i]) if bool(has_img[i]) else None,
                )
        return idx

    @staticmethod
    def score_note() -> str:
        return SIMILARITY_NOTE
