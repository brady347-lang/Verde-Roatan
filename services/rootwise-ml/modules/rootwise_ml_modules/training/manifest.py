"""Training manifest loading and validation.

Required columns/keys per entry: ``image_path``, ``species_id``, ``group_id`` (all images of the
same physical plant/observation share a group so they never straddle train/val/test) and,
by default, ``license``. Supported formats: CSV, JSONL, and the JSON produced by
``feedback.export_training_manifest``.
"""
from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from PIL import Image


@dataclass(frozen=True)
class ManifestEntry:
    image_path: str
    species_id: str
    group_id: Optional[str] = None
    license: Optional[str] = None
    source_id: Optional[str] = None
    image_id: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def resolved_path(self, base_dir: Optional[str]) -> Path:
        p = Path(self.image_path)
        return p if p.is_absolute() or base_dir is None else Path(base_dir) / p


@dataclass
class ManifestIssue:
    level: str  # "error" | "warning"
    code: str
    message: str
    index: Optional[int] = None


@dataclass
class ManifestReport:
    n_entries: int
    issues: List[ManifestIssue]

    @property
    def errors(self) -> List[ManifestIssue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> List[ManifestIssue]:
        return [i for i in self.issues if i.level == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "n_entries": self.n_entries,
            "issues": [i.__dict__ for i in self.issues],
        }


_KNOWN = {"image_path", "species_id", "group_id", "license", "source_id", "image_id"}


def _entry(row: Dict[str, Any]) -> ManifestEntry:
    def s(k: str) -> Optional[str]:
        v = row.get(k)
        return None if v is None or str(v).strip() == "" else str(v).strip()

    return ManifestEntry(
        image_path=s("image_path") or "",
        species_id=s("species_id") or "",
        group_id=s("group_id"),
        license=s("license"),
        source_id=s("source_id"),
        image_id=s("image_id"),
        extra={k: v for k, v in row.items() if k not in _KNOWN},
    )


def load_manifest(path: str) -> List[ManifestEntry]:
    """Load a manifest (CSV / JSONL / JSON). Structural validation is done by :func:`validate_manifest`."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Manifest not found: {p}")
    suffix = p.suffix.lower()
    if suffix == ".csv":
        with p.open(newline="", encoding="utf-8") as fh:
            return [_entry(r) for r in csv.DictReader(fh)]
    if suffix == ".jsonl":
        rows = []
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), start=1):
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{p}:{n}: invalid JSON ({exc})") from exc
        return [_entry(r) for r in rows]
    if suffix == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        rows = data["entries"] if isinstance(data, dict) and "entries" in data else data
        if not isinstance(rows, list):
            raise ValueError("JSON manifest must be a list or an object with 'entries'.")
        return [_entry(r) for r in rows]
    raise ValueError(f"Unsupported manifest format: {suffix!r} (use .csv, .jsonl or .json)")


def validate_manifest(
    entries: Sequence[ManifestEntry],
    *,
    base_dir: Optional[str] = None,
    check_files: bool = True,
    verify_decode: bool = False,
    require_license: bool = True,
    allowed_licenses: Optional[Iterable[str]] = None,
    min_images_per_class: Optional[int] = None,
) -> ManifestReport:
    """Validate structure, labels, groups, licences and (optionally) files."""
    issues: List[ManifestIssue] = []

    def err(code: str, msg: str, i: Optional[int] = None) -> None:
        issues.append(ManifestIssue("error", code, msg, i))

    def warn(code: str, msg: str, i: Optional[int] = None) -> None:
        issues.append(ManifestIssue("warning", code, msg, i))

    if len(entries) == 0:
        err("empty_manifest", "Manifest has no entries.")
    allowed = None if allowed_licenses is None else {a.casefold() for a in allowed_licenses}
    seen_path: Dict[str, int] = {}
    path_label: Dict[str, str] = {}
    group_species: Dict[str, set] = {}
    counts: Dict[str, int] = {}
    for i, e in enumerate(entries):
        if not e.image_path:
            err("missing_image_path", "image_path is empty.", i)
            continue
        if not e.species_id:
            err("missing_species_id", f"species_id is empty for {e.image_path}.", i)
        if not e.group_id:
            err("missing_group_id", f"group_id is empty for {e.image_path} (needed to prevent split leakage).", i)
        if require_license and not e.license:
            err("missing_license", f"license is empty for {e.image_path}.", i)
        if e.license and allowed is not None and e.license.casefold() not in allowed:
            err("license_not_allowed", f"license {e.license!r} is not in the allowed list for {e.image_path}.", i)
        if e.image_path in seen_path:
            if path_label.get(e.image_path) != e.species_id:
                err("conflicting_labels", f"{e.image_path} appears with different species_id values.", i)
            else:
                err("duplicate_path", f"{e.image_path} is listed more than once (first at {seen_path[e.image_path]}).", i)
        else:
            seen_path[e.image_path] = i
            path_label[e.image_path] = e.species_id
        if e.group_id and e.species_id:
            group_species.setdefault(e.group_id, set()).add(e.species_id)
        if e.species_id:
            counts[e.species_id] = counts.get(e.species_id, 0) + 1
        if check_files:
            fp = e.resolved_path(base_dir)
            if not fp.is_file():
                err("file_not_found", f"{fp} does not exist.", i)
            elif verify_decode:
                try:
                    with Image.open(fp) as im:
                        im.verify()
                except Exception as exc:
                    err("corrupt_image", f"{fp} cannot be decoded: {type(exc).__name__}: {exc}", i)
    for g, sp in sorted(group_species.items()):
        if len(sp) > 1:
            err("group_spans_species", f"group_id {g!r} has multiple species: {sorted(sp)}.")
    if min_images_per_class is not None:
        for sp, n in sorted(counts.items()):
            if n < min_images_per_class:
                warn("few_images", f"species {sp!r} has {n} images (< {min_images_per_class}).")
    if len(counts) < 2 and entries:
        warn("single_class", "Manifest contains fewer than 2 species; classification training is not meaningful.")
    return ManifestReport(len(entries), issues)


def manifest_sha256(entries: Sequence[ManifestEntry]) -> str:
    """Order-independent content hash of the manifest (paths, labels, groups, licences)."""
    rows = sorted(
        (e.image_path, e.species_id, e.group_id or "", e.license or "", e.source_id or "", e.image_id or "")
        for e in entries
    )
    return hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode("utf-8")).hexdigest()
