"""Group-based, species-stratified dataset splitting with duplicate-aware grouping.

Images that are byte-identical (SHA-256) or perceptually identical (dHash within
``near_duplicate_max_hamming``) are merged into one group before splitting, so duplicates
can never be separated into train and validation/test.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

from .manifest import ManifestEntry

_POPCOUNT = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dhash(path: Path, hash_size: int = 8) -> int:
    """64-bit (for size 8) difference hash of the image content."""
    with Image.open(path) as im:
        g = im.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.BILINEAR)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    v = 0
    for b in bits:
        v = (v << 1) | int(b)
    return v


@dataclass
class DuplicateReport:
    pairs: List[Dict[str, object]]  # {"a": idx, "b": idx, "kind": "exact"|"near", "same_species": bool}
    effective_groups: List[str]  # per-entry group id after merging duplicates
    conflicts: List[Dict[str, object]]  # duplicate pairs that carry different species labels


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def find_duplicate_groups(
    entries: Sequence[ManifestEntry],
    *,
    base_dir: Optional[str] = None,
    near_duplicate_max_hamming: int = 0,
) -> DuplicateReport:
    """Detect duplicates and return per-entry effective group ids (declared groups merged with duplicates)."""
    if near_duplicate_max_hamming < 0:
        raise ValueError("near_duplicate_max_hamming must be >= 0.")
    n = len(entries)
    uf = _UnionFind(n)
    first: Dict[str, int] = {}
    for i, e in enumerate(entries):  # merge declared groups
        key = f"declared:{e.group_id or e.image_path}"
        if key in first:
            uf.union(first[key], i)
        else:
            first[key] = i
    pairs: List[Dict[str, object]] = []
    sha_seen: Dict[str, int] = {}
    hashes: List[int] = []
    for i, e in enumerate(entries):
        fp = e.resolved_path(base_dir)
        digest = file_sha256(fp)
        if digest in sha_seen:
            j = sha_seen[digest]
            pairs.append({"a": j, "b": i, "kind": "exact", "same_species": entries[j].species_id == e.species_id})
            uf.union(j, i)
        else:
            sha_seen[digest] = i
        hashes.append(dhash(fp))
    exact_pairs = {(p["a"], p["b"]) for p in pairs}
    h = np.array(hashes, dtype=np.uint64)
    if n > 1:
        if near_duplicate_max_hamming == 0:
            buckets: Dict[int, List[int]] = {}
            for i, v in enumerate(hashes):
                buckets.setdefault(v, []).append(i)
            cand = [(a, b) for ids in buckets.values() for ai, a in enumerate(ids) for b in ids[ai + 1 :]]
        else:
            cand = []
            for i in range(n):
                x = np.bitwise_xor(h[i], h[i + 1 :])
                dist = _POPCOUNT[x.view(np.uint8).reshape(-1, 8)].sum(axis=1)
                for k in np.nonzero(dist <= near_duplicate_max_hamming)[0]:
                    cand.append((i, i + 1 + int(k)))
        for a, b in cand:
            if (a, b) in exact_pairs:
                continue
            pairs.append({"a": a, "b": b, "kind": "near", "same_species": entries[a].species_id == entries[b].species_id})
            uf.union(a, b)
    groups = [f"g{uf.find(i)}" for i in range(n)]
    conflicts = [p for p in pairs if not p["same_species"]]
    return DuplicateReport(pairs, groups, conflicts)


@dataclass(frozen=True)
class SplitConfig:
    val_fraction: float = 0.15
    test_fraction: float = 0.15
    seed: int = 1234

    def __post_init__(self) -> None:
        if not (0 <= self.val_fraction < 1 and 0 <= self.test_fraction < 1):
            raise ValueError("fractions must be in [0, 1).")
        if self.val_fraction + self.test_fraction >= 1:
            raise ValueError("val_fraction + test_fraction must be < 1.")


@dataclass
class SplitResult:
    train: List[int]
    val: List[int]
    test: List[int]
    groups: List[str]  # effective group per entry
    warnings: List[str] = field(default_factory=list)

    def indices(self, name: str) -> List[int]:
        return getattr(self, name)


def group_split(entries: Sequence[ManifestEntry], groups: Sequence[str], config: SplitConfig = SplitConfig()) -> SplitResult:
    """Deterministic species-stratified split at group level.

    For each species with ``n`` groups, ``round(fraction * n)`` groups go to val/test (at least
    one each when ``n >= 3`` and the fraction is > 0); train always keeps at least one group.
    A group is never split across partitions.
    """
    if len(entries) != len(groups):
        raise ValueError("entries and groups must have the same length.")
    if len(entries) == 0:
        raise ValueError("No entries to split.")
    rng = np.random.default_rng(config.seed)
    members: Dict[str, List[int]] = {}
    for i, g in enumerate(groups):
        members.setdefault(g, []).append(i)
    species_groups: Dict[str, List[str]] = {}
    warnings: List[str] = []
    for g, idx in sorted(members.items()):
        sps = sorted({entries[i].species_id for i in idx})
        if len(sps) > 1:
            warnings.append(f"group {g} spans species {sps}; assigned by {sps[0]}.")
        species_groups.setdefault(sps[0], []).append(g)
    assign: Dict[str, str] = {}
    for sp in sorted(species_groups):
        gl = sorted(species_groups[sp])
        rng.shuffle(gl)
        n = len(gl)
        n_test = int(round(config.test_fraction * n))
        n_val = int(round(config.val_fraction * n))
        if n >= 3:
            if config.test_fraction > 0:
                n_test = max(1, n_test)
            if config.val_fraction > 0:
                n_val = max(1, n_val)
        while n_test + n_val > n - 1:
            if n_test >= n_val and n_test > 0:
                n_test -= 1
            elif n_val > 0:
                n_val -= 1
            else:
                break
        if n < 3 and (config.val_fraction > 0 or config.test_fraction > 0) and (n_test == 0 or n_val == 0):
            warnings.append(f"species {sp!r} has only {n} group(s); it may be missing from validation and/or test.")
        for k, g in enumerate(gl):
            assign[g] = "test" if k < n_test else ("val" if k < n_test + n_val else "train")
    out = {"train": [], "val": [], "test": []}  # type: Dict[str, List[int]]
    for g, idx in members.items():
        out[assign[g]].extend(idx)
    for k in out:
        out[k].sort()
    result = SplitResult(out["train"], out["val"], out["test"], list(groups), warnings)
    verify_no_leakage(result)
    return result


def verify_no_leakage(split: SplitResult) -> None:
    """Raise ``AssertionError`` if any group appears in more than one partition or indices overlap."""
    where: Dict[str, str] = {}
    for name in ("train", "val", "test"):
        for i in split.indices(name):
            g = split.groups[i]
            if g in where and where[g] != name:
                raise AssertionError(f"Group {g} appears in both {where[g]} and {name}.")
            where[g] = name
    all_idx = split.train + split.val + split.test
    if len(all_idx) != len(set(all_idx)):
        raise AssertionError("An entry appears in more than one partition.")
