"""Thin FastAPI shell for INTEGRATION_CONTRACT.md. Requires ``fastapi`` (+ ``python-multipart``, ``uvicorn``).

NOT EXECUTED in the authoring environment (FastAPI was unavailable); all logic it calls is in
``handlers`` and is unit-tested. Run: ``uvicorn rootwise_ml_modules.service.app:build_app_from_env --factory``.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Optional

from ..inference import InferenceConfig, RootWiseInference
from . import handlers as h
from .handlers import ApiError
from .settings import ServiceSettings

_CHUNK = 1024 * 1024


def create_app(
    engine: RootWiseInference,
    settings: ServiceSettings,
    *,
    feedback_sink: Optional[h.FeedbackSink] = None,
    embedding_store: Optional[h.EmbeddingStore] = None,
    fetcher: Optional[h.PrivateImageFetcher] = None,
    calibrator: Any = None,
) -> Any:
    """Build the app. Docs/OpenAPI are disabled unless ``settings.enable_docs`` (contract requirement)."""
    from fastapi import Body, FastAPI, File, Form, Header, Request, UploadFile  # type: ignore
    from fastapi.responses import JSONResponse  # type: ignore
    from starlette.concurrency import run_in_threadpool  # type: ignore

    off = {} if settings.enable_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(title="RootWise ML service", version="0.1.0", **off)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> Any:
        return JSONResponse(exc.to_body(), status_code=exc.status)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, __: Exception) -> Any:  # never leak stack traces or messages
        return JSONResponse(ApiError(500, "internal_error", "The request could not be completed.").to_body(), status_code=500)

    async def _run(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        try:
            return await asyncio.wait_for(run_in_threadpool(fn, *args, **kwargs), timeout=settings.request_timeout_s)
        except asyncio.TimeoutError:
            raise ApiError(504, "timeout", "The request timed out.") from None

    async def _read_limited(file: Any, request: Request) -> bytes:
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.max_image_bytes + 64 * 1024:
            raise ApiError(413, "file_too_large", "The uploaded image exceeds the size limit.")
        buf = bytearray()
        while True:
            chunk = await file.read(_CHUNK)
            if not chunk:
                break
            buf += chunk
            if len(buf) > settings.max_image_bytes:
                raise ApiError(413, "file_too_large", "The uploaded image exceeds the size limit.")
        return bytes(buf)

    @app.get("/health")
    async def health() -> Any:
        return h.handle_health(engine, settings)

    @app.post("/v1/identify")
    async def identify(request: Request, file: UploadFile = File(...), top_k: Optional[str] = Form(None),
                       x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> Any:
        h.authenticate(x_api_key, settings)
        data = await _read_limited(file, request)
        return await _run(h.handle_identify, engine, settings, data, file.content_type, top_k, calibrator=calibrator)

    @app.post("/v1/embed")
    async def embed(request: Request, file: UploadFile = File(...), x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> Any:
        h.authenticate(x_api_key, settings)
        data = await _read_limited(file, request)
        return await _run(h.handle_embed, engine, settings, data, file.content_type)

    @app.post("/v1/feedback")
    async def feedback(body: dict = Body(...), x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> Any:
        h.authenticate(x_api_key, settings)
        return await _run(h.handle_feedback, body, feedback_sink, default_model_version=engine.config.model_version)

    @app.post("/v1/catalog/events")
    async def catalog_events(body: dict = Body(...), x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> Any:
        h.authenticate(x_api_key, settings)
        return await _run(h.handle_catalog_event, body, engine=engine, settings=settings, fetcher=fetcher, store=embedding_store)

    return app


def build_app_from_env() -> Any:  # pragma: no cover - needs fastapi, model files and (optionally) Postgres
    """Assemble engine + stores from ``ROOTWISE_ML_*`` environment variables (see ../README_ALIGNMENT.md)."""
    from ..uncertainty import ScoreCalibrator
    from .stores import PostgresEmbeddingStore, PostgresFeedbackSink, connect_from_dsn

    s = ServiceSettings.from_env()
    policy = None
    if s.decision_policy_path:
        with open(s.decision_policy_path, encoding="utf-8") as fh:
            policy = json.load(fh)
    engine = RootWiseInference(InferenceConfig(
        model_path=s.model_path, reference_index_path=s.reference_index_path, catalog_path=s.catalog_path,
        decision_policy=policy, allow_mode_conversion=True, quality_gate="warn",
    ))
    engine.initialize()
    sink = store = None
    if s.database_url:
        factory = connect_from_dsn(s.database_url)
        sink, store = PostgresFeedbackSink(factory), PostgresEmbeddingStore(factory)
        if s.index_source == "database":
            index, _skipped = store.load_trusted_index(engine.config.model_version)
            engine.set_index(index)
    calibrator = None
    if s.calibrator_path:
        with open(s.calibrator_path, encoding="utf-8") as fh:
            calibrator = ScoreCalibrator.from_json(fh.read())
    return create_app(engine, s, feedback_sink=sink, embedding_store=store, fetcher=None, calibrator=calibrator)
