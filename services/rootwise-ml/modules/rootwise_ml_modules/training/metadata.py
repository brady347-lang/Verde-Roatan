"""Model version / training-run metadata."""
from __future__ import annotations

import hashlib
import json
import platform
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def collect_environment() -> Dict[str, str]:
    """Versions of Python and the main libraries that are importable."""
    env = {"python": sys.version.split()[0], "platform": platform.platform()}
    for name in ("numpy", "PIL", "sklearn", "tensorflow", "cv2"):
        try:
            mod = __import__(name)
            env[name] = str(getattr(mod, "__version__", "unknown"))
        except Exception:
            env[name] = "not_installed"
    return env


@dataclass
class TrainingRunMetadata:
    model_version: str
    run_id: str
    created_at: str
    config_hash: str
    manifest_sha256: str
    label_map: Dict[str, int]
    split_sizes: Dict[str, int]
    backbone: str = "MobileNetV3Small"
    backbone_init: str = "imagenet"
    trained_on_user_supplied_data: bool = True
    botanical_specialization_claimed: bool = False
    metrics_files: Dict[str, str] = field(default_factory=dict)
    environment: Dict[str, str] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    @staticmethod
    def make_run_id(config_hash: str, manifest_sha: str) -> str:
        return hashlib.sha256(f"{config_hash}:{manifest_sha}".encode()).hexdigest()[:16]

    @classmethod
    def create(
        cls,
        *,
        model_version: str,
        config_hash: str,
        manifest_sha256: str,
        label_map: Dict[str, int],
        split_sizes: Dict[str, int],
        backbone_init: str,
        created_at: Optional[str] = None,
    ) -> "TrainingRunMetadata":
        return cls(
            model_version=model_version,
            run_id=cls.make_run_id(config_hash, manifest_sha256),
            created_at=created_at or datetime.now(timezone.utc).isoformat(),
            config_hash=config_hash,
            manifest_sha256=manifest_sha256,
            label_map=label_map,
            split_sizes=split_sizes,
            backbone_init=backbone_init,
            environment=collect_environment(),
            notes=[
                "Retraining changes the embedding space: reference embeddings computed with other weights are NOT comparable.",
                "Specialisation claims require held-out evaluation; see the metrics files. None are asserted here.",
            ],
        )

    def save(self, path: str) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: str) -> "TrainingRunMetadata":
        return cls(**json.loads(Path(path).read_text(encoding="utf-8")))
