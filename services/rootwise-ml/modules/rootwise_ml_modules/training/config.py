"""Reproducible training configuration."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from ..contract import MODEL_VERSION
from .augment import AugmentationConfig


@dataclass(frozen=True)
class TrainingConfig:
    """All knobs that affect a training run. The config hash is stored with the model metadata.

    The default numeric values are ordinary starting points, not tuned or validated settings.
    """

    manifest_path: str
    output_dir: str
    base_dir: Optional[str] = None
    seed: int = 1234
    val_fraction: float = 0.15
    test_fraction: float = 0.15
    near_duplicate_max_hamming: int = 0
    require_license: bool = True
    imagenet_weights: bool = True
    batch_size: int = 32
    epochs_head: int = 5
    epochs_finetune: int = 0
    learning_rate_head: float = 1e-3
    learning_rate_finetune: float = 1e-4
    finetune_last_n_layers: int = 30
    cosine_scale: float = 16.0
    label_smoothing: float = 0.0
    balanced_class_weights: bool = False
    early_stopping_patience: int = 3
    model_version: str = MODEL_VERSION
    augmentation: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.manifest_path or not self.output_dir:
            raise ValueError("manifest_path and output_dir are required.")
        if self.batch_size < 1 or self.epochs_head < 0 or self.epochs_finetune < 0:
            raise ValueError("batch_size must be >= 1 and epoch counts >= 0.")
        if self.epochs_head + self.epochs_finetune < 1:
            raise ValueError("At least one training epoch is required.")
        if self.learning_rate_head <= 0 or self.learning_rate_finetune <= 0:
            raise ValueError("learning rates must be positive.")
        if self.cosine_scale <= 0:
            raise ValueError("cosine_scale must be positive.")
        if not 0 <= self.label_smoothing < 1:
            raise ValueError("label_smoothing must be in [0, 1).")
        if self.finetune_last_n_layers < 0 or self.early_stopping_patience < 0:
            raise ValueError("finetune_last_n_layers and early_stopping_patience must be >= 0.")
        if not self.model_version:
            raise ValueError("model_version must be non-empty.")

    def augmentation_config(self) -> AugmentationConfig:
        d = dict(self.augmentation)
        if "crop_scale" in d:
            d["crop_scale"] = tuple(d["crop_scale"])
        return AugmentationConfig(**d)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def config_hash(self) -> str:
        """Hash of all settings that influence results (paths excluded so runs are comparable)."""
        d = self.to_dict()
        for k in ("manifest_path", "output_dir", "base_dir"):
            d.pop(k)
        return hashlib.sha256(json.dumps(d, sort_keys=True).encode("utf-8")).hexdigest()

    def save(self, path: str) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "TrainingConfig":
        known = {f.name for f in fields(cls)}
        unknown = set(d) - known
        if unknown:
            raise ValueError(f"Unknown config keys: {sorted(unknown)}")
        return cls(**dict(d))

    @classmethod
    def load(cls, path: str) -> "TrainingConfig":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
