"""Framework-free request handlers implementing INTEGRATION_CONTRACT.md.

Every function here is pure Python and unit-tested without FastAPI. Error messages returned to
callers are generic and never contain exception text, storage URIs, paths or secrets.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Protocol
from urllib.parse import urlparse

import numpy as np

from ..contract import MODEL_VERSION, SIMILARITY_NOTE
from ..feedback import FeedbackRecord, FeedbackValidationError
from .settings import ALLOWED_IMAGE_MIME, ServiceSettings

# The Gemini Worker whitelists exactly these decisions and treats anything else as "review".
CONTRACT_DECISIONS = ("accept", "review", "reject")
OUT_OF_CATALOG = "OUT_OF_CATALOG"
_BLOCKED_URI_SCHEMES = {"http", "https", "file", "ftp", "data", "gopher", "javascript"}
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


class ApiError(Exception):
    """Sanitised error: ``public_message`` is safe to return to the caller."""

    def __init__(self, status: int, code: str, public_message: str, details: Optional[List[str]] = None) -> None:
        super().__init__(code)
        self.status, self.code, self.public_message, self.details = status, code, public_message, details or []

    def to_body(self) -> Dict[str, Any]:
        body: Dict[str, Any] = {"status": "error", "error": self.code, "message": self.public_message}
        if self.details:
            body["details"] = self.details
        return body


class FeedbackSink(Protocol):
    def record(self, event: Mapping[str, Any]) -> bool:
        """Persist one feedback event; return False if ``event_id`` already existed."""


class EmbeddingStore(Protocol):
    def exists(self, image_id: str) -> bool: ...
    def put(self, image_id: str, embedding: np.ndarray, payload: Mapping[str, Any]) -> bool: ...


class PrivateImageFetcher(Protocol):
    def fetch(self, storage_uri: str, *, max_bytes: int) -> bytes:
        """Resolve an INTERNAL storage reference with server-side credentials. Never fetch client URLs."""


# ------------------------------------------------------------------ auth / input
def authenticate(provided_key: Optional[str], settings: ServiceSettings) -> None:
    """``X-API-Key`` only (``Authorization: Bearer`` is intentionally unsupported). Fails closed."""
    if not settings.auth_configured:
        raise ApiError(503, "auth_not_configured", "The service is not configured.")
    if not provided_key or not hmac.compare_digest(provided_key.encode("utf-8"), (settings.api_key or "").encode("utf-8")):
        raise ApiError(401, "unauthorized", "Invalid or missing API key.")


def parse_top_k(value: Any, settings: ServiceSettings) -> int:
    """Integer 1..20, default 5 (contract)."""
    if value is None or value == "":
        return settings.default_top_k
    try:
        k = int(str(value).strip())
    except ValueError:
        raise ApiError(422, "invalid_top_k", f"top_k must be an integer from 1 to {settings.max_top_k}.") from None
    if not 1 <= k <= settings.max_top_k:
        raise ApiError(422, "invalid_top_k", f"top_k must be an integer from 1 to {settings.max_top_k}.")
    return k


def sniff_image_mime(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_upload(data: bytes, declared_content_type: Optional[str], settings: ServiceSettings) -> str:
    """Bound size, require JPEG/PNG/WebP by magic bytes, and reject a contradicting declared type."""
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    if len(data) > settings.max_image_bytes:
        raise ApiError(413, "file_too_large", "The uploaded image exceeds the size limit.")
    sniffed = sniff_image_mime(data)
    if sniffed not in ALLOWED_IMAGE_MIME:
        raise ApiError(415, "unsupported_image_type", "Only JPEG, PNG or WebP images are accepted.")
    declared = (declared_content_type or "").split(";")[0].strip().lower()
    if declared and declared not in ("application/octet-stream",) and declared != sniffed:
        raise ApiError(415, "content_type_mismatch", "The declared content type does not match the image data.")
    return sniffed  # type: ignore[return-value]


_CLIENT_ERROR_CODES = {
    "bad_request", "empty_input", "bad_array_dtype", "bad_array_shape", "corrupt_image",
    "unsupported_input_type", "image_too_large", "image_too_small", "unsupported_mode",
}


def raise_for_engine_error(result: Mapping[str, Any]) -> None:
    """Translate an engine ``{"ok": False}`` result into a sanitised :class:`ApiError`."""
    if result.get("ok", True):
        return
    code = str((result.get("error") or {}).get("code", "internal_error"))
    if code in ("model_not_ready", "index_not_ready"):
        raise ApiError(503, code, "The identification service is not ready.")
    if code in _CLIENT_ERROR_CODES:
        raise ApiError(422, "image_not_processable", "The image could not be processed.")
    raise ApiError(500, "internal_error", "The request could not be completed.")


# ------------------------------------------------------------------ identify
def contract_decision(engine_decision: str) -> str:
    """Map the engine decision (accept|ambiguous|review|unknown|unsuitable_image) to accept|review|reject."""
    return {"accept": "accept", "ambiguous": "review", "review": "review", "unknown": "reject", "unsuitable_image": "reject"}.get(
        engine_decision, "review"
    )


def _label(candidate: Mapping[str, Any]) -> str:
    sp = candidate.get("species") or {}
    return str(sp.get("scientific_name") or candidate.get("species_id") or "")


def build_identify_response(result: Mapping[str, Any], *, top_k: int, calibrator: Any = None) -> Dict[str, Any]:
    """Shape an engine ``identify`` result into the contract response.

    Fields: ``top_predictions, decision, confidence, margin, entropy, model_version, similar_catalog_entries``.
    ``confidence`` is ``None`` unless a calibrator fitted on held-out validation data is supplied;
    similarity scores are never relabelled as probabilities. ``entropy`` is not computed
    (a similarity-derived softmax would not be calibrated).
    """
    raise_for_engine_error(result)
    engine_decision = str(result.get("decision", "review"))
    decision = contract_decision(engine_decision)
    cands: List[Mapping[str, Any]] = list(result.get("candidates") or [])[:top_k]
    considered = [
        {"rank": c.get("rank"), "label": _label(c), "species_id": c.get("species_id"), "score": c.get("aggregated_score"),
         "score_type": c.get("score_type")}
        for c in cands
    ]
    if engine_decision == "unknown":
        top_predictions: List[Dict[str, Any]] = [{"label": OUT_OF_CATALOG, "rank": 1}]
    elif engine_decision == "unsuitable_image":
        top_predictions = []
    else:
        top_predictions = [dict(c) for c in considered if c["label"]]

    margin: Optional[float] = None
    top_score: Optional[float] = None
    all_cands = list(result.get("candidates") or [])
    if all_cands:
        top_score = float(all_cands[0]["aggregated_score"])
        if len(all_cands) > 1 and all_cands[1].get("aggregated_score") is not None:
            margin = top_score - float(all_cands[1]["aggregated_score"])

    confidence: Optional[float] = None
    confidence_type = "not_calibrated"
    if calibrator is not None and top_score is not None and decision != "reject":
        confidence = float(calibrator.predict_correctness([top_score])[0])
        confidence_type = "empirical_correctness_rate_on_validation_set"

    info = ((result.get("embedding") or {}).get("model_info")) or {}
    notes = list(result.get("notes") or [SIMILARITY_NOTE])
    return {
        "top_predictions": top_predictions,
        "decision": decision,
        "decision_reasons": list(result.get("decision_reasons") or []),
        "confidence": confidence,
        "confidence_type": confidence_type,
        "margin": margin,
        "margin_type": "aggregated_cosine_similarity_difference_uncalibrated",
        "entropy": None,
        "entropy_type": "not_computed",
        "model_version": str(result.get("model_version") or MODEL_VERSION),
        "model_info": {"botanical_specialization": bool(info.get("botanical_specialization", False)), "note": info.get("note")},
        "similar_catalog_entries": [
            {"image_id": m.get("image_id"), "species_id": m.get("species_id"), "reference_id": m.get("reference_id"),
             "cosine_similarity": m.get("cosine_similarity"), "score_type": m.get("score_type")}
            for m in (result.get("matches") or [])[:top_k]
        ],
        "considered_candidates": considered,
        "ambiguous_groups": result.get("ambiguous_groups") or [],
        "quality": _quality_summary(result.get("quality")),
        "notes": notes,
        "verification_status": "unverified_ml_suggestion",
    }


def _quality_summary(q: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(q, Mapping):
        return None
    return {"verdict": q.get("verdict"), "reasons": q.get("reasons", [])}


def handle_identify(engine: Any, settings: ServiceSettings, data: bytes, content_type: Optional[str], top_k: Any, *, calibrator: Any = None) -> Dict[str, Any]:
    k = parse_top_k(top_k, settings)
    validate_upload(data, content_type, settings)
    result = engine.identify(data, top_k_matches=k)
    return build_identify_response(result, top_k=k, calibrator=calibrator)


def handle_embed(engine: Any, settings: ServiceSettings, data: bytes, content_type: Optional[str]) -> Dict[str, Any]:
    validate_upload(data, content_type, settings)
    result = engine.embed(data, include_embedding=True)
    raise_for_engine_error(result)
    return {
        "model_version": result["model_version"],
        "embedding_dim": result["embedding_dim"],
        "l2_normalized": result["l2_normalized"],
        "embedding": result["embedding"],
        "model_info": {"botanical_specialization": bool((result.get("model_info") or {}).get("botanical_specialization", False))},
    }


def handle_health(engine: Any, settings: ServiceSettings) -> Dict[str, Any]:
    """Non-secret health only: no paths, no key material, no error strings."""
    r = engine.readiness()
    comp = r.get("components", {})
    return {
        "status": "ok" if r.get("ready_for_identification") else "degraded",
        "model_version": r.get("model_version"),
        "ready_for_embedding": bool(r.get("ready_for_embedding")),
        "ready_for_identification": bool(r.get("ready_for_identification")),
        "reference_count": int(comp.get("reference_count", 0)),
        "decision_policy_configured": bool(comp.get("decision_policy_configured")),
        "auth_configured": settings.auth_configured,
    }


# ------------------------------------------------------------------ feedback
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def handle_feedback(body: Mapping[str, Any], sink: Optional[FeedbackSink], *, default_model_version: str = MODEL_VERSION) -> Dict[str, Any]:
    """Record verification-feedback intake. Everything stored here is ``unverified`` and not training-approved.

    ``actor`` must be set by the trusted application server from the verified session (the Gemini
    Worker); this service never trusts a browser. A rejection is stored as a rejection, never as a correction.
    """
    if sink is None:
        raise ApiError(503, "feedback_store_not_configured", "Feedback storage is not configured.")
    if not isinstance(body, Mapping):
        raise ApiError(422, "invalid_feedback", "Request body must be a JSON object.")
    actor = body.get("actor")
    if not isinstance(actor, str) or not actor.strip() or len(actor) > 200:
        raise ApiError(422, "invalid_feedback", "A server-derived actor identity is required.")
    comment = body.get("comment")
    if comment is not None and (not isinstance(comment, str) or len(comment) > 2000):
        raise ApiError(422, "invalid_feedback", "comment must be a string of at most 2000 characters.")
    image_id = body.get("image_id")
    event_id = body.get("event_id") or str(uuid.uuid4())
    try:
        rec = FeedbackRecord(
            feedback_id=str(event_id),
            image_id=image_id if isinstance(image_id, str) else "",
            source_id=str(body.get("source_id") or image_id or ""),
            model_version=str(body.get("model_version") or default_model_version),
            timestamp=str(body.get("timestamp") or _now()),
            user_action=str(body.get("action", "")),
            predicted_species_id=body.get("predicted_label") or body.get("predicted_species_id") or None,
            corrected_species_id=body.get("correct_label") or None,
            verification_status="unverified",
            notes=comment,
        ).validate()
    except FeedbackValidationError as exc:
        raise ApiError(422, "invalid_feedback", "The feedback record is invalid.", exc.problems) from None
    event = {
        "event_id": rec.feedback_id,
        "image_id": rec.image_id,
        "action": rec.user_action,
        "actor": actor.strip(),
        "correct_label": rec.corrected_species_id,
        "comment": comment,
        "payload": {
            **rec.to_dict(),
            "verification_status": "unverified",
            "training_approved": False,
            "label_semantics": "correct_label is a user/actor suggestion, not a verified label",
        },
    }
    is_new = sink.record(event)
    return {
        "status": "recorded" if is_new else "duplicate",
        "event_id": rec.feedback_id,
        "verification_status": "unverified",
        "training_approved": False,
    }


# ------------------------------------------------------------------ catalog events
def validate_storage_uri(uri: Any, allowed_schemes: tuple) -> str:
    if not isinstance(uri, str) or not uri.strip() or len(uri) > 1024:
        raise ApiError(422, "invalid_catalog_event", "storage_uri is required.")
    scheme = urlparse(uri).scheme.lower()
    if not scheme or scheme in _BLOCKED_URI_SCHEMES or scheme not in allowed_schemes:
        raise ApiError(422, "invalid_catalog_event", "storage_uri must be an internal private-storage reference.")
    return uri


def _require_str(body: Mapping[str, Any], key: str, maxlen: int = 200) -> str:
    v = body.get(key)
    if not isinstance(v, str) or not v.strip() or len(v) > maxlen:
        raise ApiError(422, "invalid_catalog_event", f"{key} is required.")
    return v.strip()


def handle_catalog_event(
    body: Mapping[str, Any],
    *,
    engine: Any,
    settings: ServiceSettings,
    fetcher: Optional[PrivateImageFetcher],
    store: Optional[EmbeddingStore],
) -> Dict[str, Any]:
    """Ingest a catalog observation into the PENDING embedding tier only.

    Disabled (503) until a private-storage fetcher and embedding store are configured, as the contract
    requires. The Gemini identification is kept as an unverified candidate; nothing here can create a
    trusted, training-eligible label.
    """
    if fetcher is None or store is None:
        raise ApiError(503, "catalog_ingestion_not_enabled", "Catalog ingestion is not enabled.")
    if not isinstance(body, Mapping):
        raise ApiError(422, "invalid_catalog_event", "Request body must be a JSON object.")
    image_id = _require_str(body, "image_id")
    uploader = _require_str(body, "uploader_id")
    license_ = _require_str(body, "license", 120)
    uri = validate_storage_uri(body.get("storage_uri"), settings.allowed_storage_schemes)
    sha = body.get("sha256")
    if not isinstance(sha, str) or not _SHA256_RE.match(sha):
        raise ApiError(422, "invalid_catalog_event", "sha256 must be a 64-character hex digest.")
    lat, lon = body.get("latitude"), body.get("longitude")
    if (lat is None) != (lon is None):
        raise ApiError(422, "invalid_catalog_event", "latitude and longitude must be provided together.")
    if lat is not None and not (isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(422, "invalid_catalog_event", "Coordinates are out of range.")
    captured = body.get("captured_at")
    if captured is not None:
        try:
            datetime.fromisoformat(str(captured).replace("Z", "+00:00"))
        except ValueError:
            raise ApiError(422, "invalid_catalog_event", "captured_at must be ISO-8601.") from None
    gem = body.get("gemini_identification")
    if gem is not None and not isinstance(gem, Mapping):
        raise ApiError(422, "invalid_catalog_event", "gemini_identification must be an object.")

    if store.exists(image_id):
        return {"status": "already_ingested", "image_id": image_id, "index_tier": "pending"}
    try:
        data = fetcher.fetch(uri, max_bytes=settings.max_image_bytes)
    except Exception:
        raise ApiError(502, "storage_unavailable", "The image could not be retrieved from storage.") from None
    if hashlib.sha256(data).hexdigest() != sha.lower():
        raise ApiError(422, "sha256_mismatch", "The stored image does not match the supplied sha256.")
    validate_upload(data, None, settings)
    emb = engine.embed(data, include_embedding=True)
    raise_for_engine_error(emb)
    payload = {
        "model_version": emb["model_version"],
        "index_tier": "pending",
        "species_id": None,
        "sha256": sha.lower(),
        "organ": (str(body["organ"])[:40] if body.get("organ") else None),
        "captured_at": captured,
        "latitude": lat,
        "longitude": lon,
        "uploader_id": uploader,
        "license": license_,
        "gemini_identification": dict(gem) if gem is not None else None,
        "label_status": "unverified_candidate",
    }
    created = store.put(image_id, np.asarray(emb["embedding"], dtype=np.float32), payload)
    return {
        "status": "pending_review" if created else "already_ingested",
        "image_id": image_id,
        "model_version": emb["model_version"],
        "index_tier": "pending",
        "training_eligible": False,
    }
