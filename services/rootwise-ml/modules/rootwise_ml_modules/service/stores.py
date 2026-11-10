"""Stores for the existing ``rootwise_ml`` Postgres schema (migration 20261108161439).

Grants for ``rootwise_ml_runtime`` are SELECT + INSERT only, so every write here is an INSERT and
nothing is ever updated: feedback is an append-only log and an embedding is immutable once written.

Connections are injected (``connection_factory``) so the SQL is unit-testable; :func:`connect_from_dsn`
lazily imports ``psycopg`` (v3), which is an optional dependency. NOT exercised against a live database.
"""
from __future__ import annotations

import json
import math
from typing import Any, Callable, ContextManager, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np

from ..contract import EMBEDDING_DIM
from ..similarity import SimilarityIndex

ConnectionFactory = Callable[[], ContextManager[Any]]

FEEDBACK_INSERT_SQL = (
    "INSERT INTO rootwise_ml.feedback_events (event_id, image_id, action, actor, correct_label, comment, payload) "
    "SELECT %s, %s, %s, %s, %s, %s, %s::jsonb "
    "WHERE NOT EXISTS (SELECT 1 FROM rootwise_ml.feedback_events WHERE event_id = %s)"
)
EMBEDDING_INSERT_SQL = (
    "INSERT INTO rootwise_ml.image_embeddings (image_id, embedding, payload) "
    "VALUES (%s, %s::extensions.vector, %s::jsonb) ON CONFLICT (image_id) DO NOTHING"
)
EMBEDDING_EXISTS_SQL = "SELECT 1 FROM rootwise_ml.image_embeddings WHERE image_id = %s"
TRUSTED_EMBEDDINGS_SQL = (
    "SELECT image_id, embedding::text, payload FROM rootwise_ml.image_embeddings "
    "WHERE payload->>'model_version' = %s AND payload->>'index_tier' = 'trusted'"
)


def connect_from_dsn(dsn: str) -> Callable[[], Any]:
    """Return a factory producing ``psycopg`` connections (autocommit off; use ``with conn:`` to commit)."""
    try:
        import psycopg  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("psycopg (v3) is required for database-backed stores: pip install 'psycopg[binary]'") from exc
    return lambda: psycopg.connect(dsn)


def vector_literal(embedding: np.ndarray) -> str:
    v = np.asarray(embedding, dtype=np.float32)
    if v.ndim != 1 or v.shape[0] != EMBEDDING_DIM or not np.all(np.isfinite(v)):
        raise ValueError("embedding must be a finite 512-d vector.")
    return "[" + ",".join(repr(float(x)) for x in v) + "]"


def parse_vector_text(text: str) -> np.ndarray:
    """Parse pgvector's text form ``[0.1,0.2,...]``."""
    body = text.strip()
    if not (body.startswith("[") and body.endswith("]")):
        raise ValueError("not a pgvector literal")
    return np.asarray([float(x) for x in body[1:-1].split(",")], dtype=np.float32)


class PostgresFeedbackSink:
    """Appends to ``rootwise_ml.feedback_events``; idempotent on ``event_id`` (no UNIQUE index exists,
    so concurrent duplicate deliveries of the same id could in theory both insert)."""

    def __init__(self, connection_factory: ConnectionFactory) -> None:
        self._connect = connection_factory

    def record(self, event: Mapping[str, Any]) -> bool:
        params = (
            event["event_id"], event["image_id"], event["action"], event["actor"],
            event.get("correct_label"), event.get("comment"),
            json.dumps(event["payload"], sort_keys=True, default=str), event["event_id"],
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(FEEDBACK_INSERT_SQL, params)
                return cur.rowcount == 1


class PostgresEmbeddingStore:
    """Reads/writes ``rootwise_ml.image_embeddings``.

    The table has no model_version / tier / species columns, so those live in ``payload``
    (``model_version``, ``index_tier`` = ``pending`` | ``trusted``, ``species_id``). That convention is a
    PROPOSAL pending owner approval; promoting pending -> trusted needs an approved, audited path
    (the runtime role cannot UPDATE).
    """

    def __init__(self, connection_factory: ConnectionFactory) -> None:
        self._connect = connection_factory

    def exists(self, image_id: str) -> bool:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(EMBEDDING_EXISTS_SQL, (image_id,))
                return cur.fetchone() is not None

    def put(self, image_id: str, embedding: np.ndarray, payload: Mapping[str, Any]) -> bool:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(EMBEDDING_INSERT_SQL, (image_id, vector_literal(embedding), json.dumps(dict(payload), sort_keys=True, default=str)))
                return cur.rowcount == 1

    def load_trusted_index(self, model_version: str) -> Tuple[SimilarityIndex, List[Dict[str, str]]]:
        """Build an index from TRUSTED rows of ``model_version`` only. Returns ``(index, skipped)``."""
        index = SimilarityIndex(model_version=model_version)
        skipped: List[Dict[str, str]] = []
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(TRUSTED_EMBEDDINGS_SQL, (model_version,))
                rows: Sequence[Tuple[Any, ...]] = cur.fetchall()
        for image_id, vec_text, payload in rows:
            p = payload if isinstance(payload, dict) else json.loads(payload or "{}")
            try:
                if p.get("index_tier") != "trusted" or p.get("model_version") != model_version:
                    raise ValueError("row is not a trusted row of this model version")
                species = p.get("species_id")
                if not species or not isinstance(species, str):
                    raise ValueError("missing species_id")
                vec = parse_vector_text(vec_text)
                if vec.shape[0] != EMBEDDING_DIM or not np.all(np.isfinite(vec)):
                    raise ValueError("bad embedding")
                n = float(np.linalg.norm(vec))
                if not math.isfinite(n) or n < 1e-8:
                    raise ValueError("zero-norm embedding")
                index.add(str(image_id), species, vec / n, image_id=str(image_id))
            except Exception as exc:  # report, never fail the whole load
                skipped.append({"image_id": str(image_id), "reason": str(exc)[:120]})
        return index, skipped


class InMemoryEmbeddingStore:
    """Development/test store. Not durable; do not use as the production index."""

    def __init__(self) -> None:
        self.rows: Dict[str, Tuple[np.ndarray, Dict[str, Any]]] = {}

    def exists(self, image_id: str) -> bool:
        return image_id in self.rows

    def put(self, image_id: str, embedding: np.ndarray, payload: Mapping[str, Any]) -> bool:
        if image_id in self.rows:
            return False
        self.rows[image_id] = (np.asarray(embedding, dtype=np.float32).copy(), dict(payload))
        return True


class InMemoryFeedbackSink:
    """Development/test sink. Not durable."""

    def __init__(self) -> None:
        self.events: Dict[str, Dict[str, Any]] = {}

    def record(self, event: Mapping[str, Any]) -> bool:
        if event["event_id"] in self.events:
            return False
        self.events[event["event_id"]] = dict(event)
        return True
