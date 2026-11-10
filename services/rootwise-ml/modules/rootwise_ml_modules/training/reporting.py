"""Class-distribution reporting."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional, Sequence

from .manifest import ManifestEntry
from .splits import SplitResult


def class_distribution(
    entries: Sequence[ManifestEntry],
    split: Optional[SplitResult] = None,
    *,
    min_images_per_class: int = 1,
) -> Dict[str, Any]:
    """Per-species counts overall and per split, group counts, imbalance and warnings."""
    def summarise(idx: Sequence[int], groups: Optional[Sequence[str]]) -> Dict[str, Any]:
        c = Counter(entries[i].species_id for i in idx)
        out: Dict[str, Any] = {
            "n_images": len(idx),
            "n_species": len(c),
            "per_species": dict(sorted(c.items())),
            "imbalance_ratio": (max(c.values()) / min(c.values())) if c else None,
        }
        if groups is not None:
            out["n_groups"] = len({groups[i] for i in idx})
        return out

    all_idx = list(range(len(entries)))
    report: Dict[str, Any] = {"overall": summarise(all_idx, split.groups if split else None)}
    warnings: List[str] = []
    for sp, n in report["overall"]["per_species"].items():
        if n < min_images_per_class:
            warnings.append(f"species {sp!r} has {n} image(s), below {min_images_per_class}.")
    if split is not None:
        for name in ("train", "val", "test"):
            report[name] = summarise(split.indices(name), split.groups)
        train_sp = set(report["train"]["per_species"])
        for name in ("val", "test"):
            missing_eval = sorted(train_sp - set(report[name]["per_species"]))
            if missing_eval and report[name]["n_images"] > 0:
                warnings.append(f"{len(missing_eval)} species in train are absent from {name}: {missing_eval[:10]}")
            unseen = sorted(set(report[name]["per_species"]) - train_sp)
            if unseen:
                warnings.append(f"{name} contains species not in train: {unseen[:10]}")
    report["warnings"] = warnings
    return report
