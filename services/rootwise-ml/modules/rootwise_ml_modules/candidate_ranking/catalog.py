"""Caller-supplied species catalogue. This module ships NO species data and invents none."""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple


def normalize_name(name: str) -> str:
    """Case-, accent- and whitespace-insensitive key for name matching."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s).strip().casefold()


@dataclass(frozen=True)
class SpeciesInfo:
    """Species metadata exactly as supplied by the caller."""

    species_id: str
    scientific_name: Optional[str] = None
    common_names: Tuple[str, ...] = ()
    taxon_id: Optional[str] = None
    taxon_id_source: Optional[str] = None  # e.g. the taxonomic authority supplying taxon_id
    family: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.species_id or not isinstance(self.species_id, str):
            raise ValueError("species_id must be a non-empty string.")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "species_id": self.species_id,
            "scientific_name": self.scientific_name,
            "common_names": list(self.common_names),
            "taxon_id": self.taxon_id,
            "taxon_id_source": self.taxon_id_source,
            "family": self.family,
        }

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "SpeciesInfo":
        if "species_id" not in d:
            raise ValueError("species record missing 'species_id'.")
        common = d.get("common_names") or ()
        if isinstance(common, str):
            common = (common,)
        return cls(
            species_id=str(d["species_id"]),
            scientific_name=d.get("scientific_name"),
            common_names=tuple(str(c) for c in common),
            taxon_id=None if d.get("taxon_id") is None else str(d["taxon_id"]),
            taxon_id_source=d.get("taxon_id_source"),
            family=d.get("family"),
        )


class SpeciesCatalog:
    """Lookup of :class:`SpeciesInfo` by id and by common/scientific name."""

    def __init__(self, species: Iterable[SpeciesInfo] = ()) -> None:
        self._by_id: Dict[str, SpeciesInfo] = {}
        self._by_name: Dict[str, List[str]] = {}
        for s in species:
            self.add(s)

    def __len__(self) -> int:
        return len(self._by_id)

    def __contains__(self, species_id: object) -> bool:
        return species_id in self._by_id

    def add(self, info: SpeciesInfo) -> None:
        if info.species_id in self._by_id:
            raise ValueError(f"Duplicate species_id: {info.species_id!r}")
        self._by_id[info.species_id] = info
        names = list(info.common_names) + ([info.scientific_name] if info.scientific_name else [])
        for n in names:
            key = normalize_name(n)
            if key:
                bucket = self._by_name.setdefault(key, [])
                if info.species_id not in bucket:
                    bucket.append(info.species_id)

    def get(self, species_id: str) -> Optional[SpeciesInfo]:
        return self._by_id.get(species_id)

    def find_by_name(self, name: str) -> List[SpeciesInfo]:
        """Exact (normalised) match on scientific or any common name. A common name can match several species."""
        return [self._by_id[i] for i in self._by_name.get(normalize_name(name), [])]

    def all(self) -> List[SpeciesInfo]:
        return [self._by_id[k] for k in sorted(self._by_id)]

    @classmethod
    def from_dicts(cls, records: Iterable[Mapping[str, Any]]) -> "SpeciesCatalog":
        return cls(SpeciesInfo.from_dict(r) for r in records)

    @classmethod
    def from_json(cls, path: str) -> "SpeciesCatalog":
        """Load a JSON list of species objects (or ``{"species": [...]}``)."""
        p = Path(path)
        if not p.is_file():
            raise FileNotFoundError(f"Catalog file not found: {p}")
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("species")
        if not isinstance(data, list):
            raise ValueError("Catalog JSON must be a list or an object with a 'species' list.")
        return cls.from_dicts(data)
