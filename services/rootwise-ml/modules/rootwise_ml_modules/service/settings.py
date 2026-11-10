"""Environment-driven settings. Secrets are only ever read from the environment, never logged or returned."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional, Tuple

MIN_API_KEY_LENGTH = 32
# Mirrors the Gemini Worker (workers/verde-roatan-gemini-worker.js): 12 MB cap, 18 s abort.
MAX_IMAGE_BYTES_DEFAULT = 12 * 1024 * 1024
REQUEST_TIMEOUT_S_DEFAULT = 15.0  # stays below the Worker's 18 s abort so the caller gets a clean 504
ALLOWED_IMAGE_MIME = ("image/jpeg", "image/png", "image/webp")


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = env.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc


def _float(env: Mapping[str, str], name: str, default: float) -> float:
    raw = env.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number.") from exc


@dataclass(frozen=True)
class ServiceSettings:
    """Runtime settings for the HTTP adapter."""

    api_key: Optional[str] = None
    max_image_bytes: int = MAX_IMAGE_BYTES_DEFAULT
    request_timeout_s: float = REQUEST_TIMEOUT_S_DEFAULT
    default_top_k: int = 5
    max_top_k: int = 20
    enable_docs: bool = False  # contract: do not expose /docs publicly in production
    model_path: Optional[str] = None
    reference_index_path: Optional[str] = None
    catalog_path: Optional[str] = None
    decision_policy_path: Optional[str] = None  # JSON of DecisionPolicy fields, measured on validation data
    calibrator_path: Optional[str] = None  # JSON from ScoreCalibrator.to_json()
    database_url: Optional[str] = None  # direct Postgres DSN for the rootwise_ml schema
    index_source: str = "file"  # "file" | "database"
    allowed_storage_schemes: Tuple[str, ...] = ("storage",)

    @property
    def auth_configured(self) -> bool:
        return bool(self.api_key) and len(self.api_key or "") >= MIN_API_KEY_LENGTH

    @classmethod
    def from_env(cls, env: Optional[Mapping[str, str]] = None) -> "ServiceSettings":
        e = os.environ if env is None else env
        schemes = tuple(s.strip().lower() for s in (e.get("ROOTWISE_ML_STORAGE_SCHEMES") or "storage").split(",") if s.strip())
        s = cls(
            api_key=e.get("ROOTWISE_ML_API_KEY") or None,
            max_image_bytes=_int(e, "ROOTWISE_ML_MAX_IMAGE_BYTES", MAX_IMAGE_BYTES_DEFAULT),
            request_timeout_s=_float(e, "ROOTWISE_ML_REQUEST_TIMEOUT_S", REQUEST_TIMEOUT_S_DEFAULT),
            enable_docs=(e.get("ROOTWISE_ML_ENABLE_DOCS", "").strip().lower() in ("1", "true", "yes")),
            model_path=e.get("ROOTWISE_ML_MODEL_PATH") or None,
            reference_index_path=e.get("ROOTWISE_ML_INDEX_PATH") or None,
            catalog_path=e.get("ROOTWISE_ML_CATALOG_PATH") or None,
            decision_policy_path=e.get("ROOTWISE_ML_POLICY_PATH") or None,
            calibrator_path=e.get("ROOTWISE_ML_CALIBRATOR_PATH") or None,
            database_url=e.get("ROOTWISE_ML_DATABASE_URL") or None,
            index_source=(e.get("ROOTWISE_ML_INDEX_SOURCE") or "file").strip().lower(),
            allowed_storage_schemes=schemes,
        )
        if s.max_image_bytes < 1 or s.request_timeout_s <= 0:
            raise ValueError("ROOTWISE_ML_MAX_IMAGE_BYTES and ROOTWISE_ML_REQUEST_TIMEOUT_S must be positive.")
        if s.index_source not in ("file", "database"):
            raise ValueError("ROOTWISE_ML_INDEX_SOURCE must be 'file' or 'database'.")
        return s
