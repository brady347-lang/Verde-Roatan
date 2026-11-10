"""Map ML feedback events to the Knowledge Core evidence-queue payload.

This only BUILDS the payload (keys match ``POST`` evidence route in
``workers/verde-botanical-knowledge-core-worker.js``: evidence_type, evidence_fingerprint,
submitted_payload, source_system, source_record_id, subject_key). The queue tables deny direct
anon/authenticated access (RLS), so the trusted Worker submits it; this module never writes to them.
Everything produced is ``community_submitted`` / pending: ML output and user input are not verification.
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, Mapping

SOURCE_SYSTEM = "rootwise-ml"
_EVIDENCE_TYPE = {"correct": "community_correction", "confirm": "plant_identification", "reject": "plant_identification"}


def to_evidence_queue_payload(event: Mapping[str, Any]) -> Dict[str, Any]:
    """Build the queue submission for a feedback event produced by ``handle_feedback``."""
    action = str(event["action"])
    if action not in _EVIDENCE_TYPE:
        raise ValueError(f"unsupported action {action!r}")
    evidence_type = _EVIDENCE_TYPE[action]
    label = event.get("correct_label") or (event.get("payload") or {}).get("predicted_species_id") or ""
    fingerprint = hashlib.sha256(f"{SOURCE_SYSTEM}:{evidence_type}:{event['image_id']}:{action}:{label}:{event['event_id']}".encode()).hexdigest()
    return {
        "evidence_type": evidence_type,
        "source_system": SOURCE_SYSTEM,
        "source_record_id": str(event["image_id"])[:180],
        "subject_key": (str(label)[:240] or None),
        "evidence_fingerprint": fingerprint,
        "submitted_payload": {
            "action": action,
            "event_id": event["event_id"],
            "model_version": (event.get("payload") or {}).get("model_version"),
            "predicted_species_id": (event.get("payload") or {}).get("predicted_species_id"),
            "suggested_label": event.get("correct_label"),
            "comment": event.get("comment"),
            "verification_status": "community_submitted",
            "note": "Unverified. A rejection is not a correction; a suggested label is not a verified label.",
        },
    }
