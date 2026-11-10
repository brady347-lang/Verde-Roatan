"""Export approved feedback as a reproducible training manifest.

Only records with ``training_label`` (verified by a reviewer and explicitly approved) are
exported. Output is deterministic: entries are sorted and the content hash excludes
``created_at``. Conflicting approved labels for one image are excluded and reported.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

from .records import FeedbackRecord

MANIFEST_FORMAT = "rootwise_feedback_manifest_v1"


def _canonical(entries: List[Dict[str, Any]]) -> str:
    return json.dumps(entries, sort_keys=True, separators=(",", ":"))


def export_training_manifest(
    records: Iterable[FeedbackRecord],
    path: str,
    *,
    image_path_resolver: Optional[Callable[[str], str]] = None,
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Write the manifest JSON and return a summary (entry count, hash, exclusions).

    ``image_path_resolver`` maps an ``image_id`` to a file path so the manifest can feed the
    ``training`` module. ``group_id`` defaults to ``source_id`` unless ``extra['group_id']``
    is set; ``license`` comes from ``extra['license']`` (the training validator requires it).
    """
    by_image: Dict[str, List[FeedbackRecord]] = {}
    skipped = 0
    for r in records:
        r.validate()
        if r.training_label is None:
            skipped += 1
            continue
        by_image.setdefault(r.image_id, []).append(r)

    entries: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    for image_id in sorted(by_image):
        recs = sorted(by_image[image_id], key=lambda x: x.feedback_id)
        labels = {x.training_label for x in recs}
        if len(labels) > 1:
            conflicts.append({"image_id": image_id, "labels": sorted(labels), "feedback_ids": [x.feedback_id for x in recs]})
            continue
        r = recs[0]
        entry: Dict[str, Any] = {
            "image_id": image_id,
            "species_id": r.training_label,
            "source_id": r.source_id,
            "group_id": r.extra.get("group_id", r.source_id),
            "license": r.extra.get("license"),
            "feedback_id": r.feedback_id,
            "reviewer_id": r.reviewer_id,
            "approved_by": r.approved_by,
            "model_version_at_prediction": r.model_version,
            "feedback_timestamp": r.timestamp,
            "supporting_feedback_ids": [x.feedback_id for x in recs],
        }
        if image_path_resolver is not None:
            entry["image_path"] = image_path_resolver(image_id)
        entries.append(entry)

    digest = hashlib.sha256(_canonical(entries).encode("utf-8")).hexdigest()
    doc = {
        "manifest_format": MANIFEST_FORMAT,
        "entry_count": len(entries),
        "content_sha256": digest,
        "created_at": created_at,
        "conflicts": conflicts,
        "entries": entries,
    }
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "path": str(p),
        "entry_count": len(entries),
        "content_sha256": digest,
        "skipped_not_approved": skipped,
        "conflicts": conflicts,
    }
