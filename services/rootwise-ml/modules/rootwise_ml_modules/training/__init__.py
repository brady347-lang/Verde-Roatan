"""Module G: training utilities. Only ``trainer`` / ``data.make_tf_dataset`` need TensorFlow (lazy)."""
from .augment import AugmentationConfig, augment_pil
from .config import TrainingConfig
from .data import iterate_batches, make_tf_dataset
from .evaluation import classification_metrics, confusion_matrix_report, retrieval_metrics
from .manifest import ManifestEntry, ManifestReport, load_manifest, manifest_sha256, validate_manifest
from .metadata import TrainingRunMetadata, collect_environment
from .reporting import class_distribution
from .splits import (
    DuplicateReport,
    SplitConfig,
    SplitResult,
    find_duplicate_groups,
    group_split,
    verify_no_leakage,
)

__all__ = [
    "AugmentationConfig", "DuplicateReport", "ManifestEntry", "ManifestReport", "SplitConfig",
    "SplitResult", "TrainingConfig", "TrainingRunMetadata", "augment_pil", "class_distribution",
    "classification_metrics", "collect_environment", "confusion_matrix_report",
    "find_duplicate_groups", "group_split", "iterate_batches", "load_manifest", "make_tf_dataset",
    "manifest_sha256", "retrieval_metrics", "validate_manifest", "verify_no_leakage",
]
