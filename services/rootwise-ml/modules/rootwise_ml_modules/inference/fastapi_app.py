"""Optional thin FastAPI wrapper around :class:`RootWiseInference` (independent service component).

Requires ``fastapi``, ``uvicorn`` and ``python-multipart``. It assumes no database, authentication
or RootWise API; add those in the host application.
"""
from __future__ import annotations

from typing import Any, Dict

from .engine import RootWiseInference


def create_app(engine: RootWiseInference) -> Any:
    """Build a FastAPI app exposing /ready, /embed, /identify and /feedback/validate."""
    from fastapi import Body, FastAPI, File, Query, UploadFile  # type: ignore

    app = FastAPI(title="RootWise ML inference (standalone)", version="0.1.0")

    @app.get("/ready")
    def ready() -> Dict[str, Any]:
        return engine.readiness()

    @app.post("/embed")
    async def embed(file: UploadFile = File(...), include_embedding: bool = Query(False)) -> Dict[str, Any]:
        return engine.embed(await file.read(), include_embedding=include_embedding)

    @app.post("/identify")
    async def identify(file: UploadFile = File(...), top_k: int = Query(5, ge=1, le=50)) -> Dict[str, Any]:
        return engine.identify(await file.read(), top_k_matches=top_k)

    @app.post("/feedback/validate")
    def feedback_validate(record: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        return engine.validate_feedback(record)

    return app
