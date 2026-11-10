"""Module B: cosine similarity, retrieval, centroids and duplicate detection."""
from .engine import (
    DuplicatePair,
    Match,
    SimilarityIndex,
    SpeciesCentroid,
    cosine_similarity,
    cosine_similarity_matrix,
    group_matches_by_species,
)
from .validation import (
    EmbeddingValidationError,
    ModelVersionMismatchError,
    validate_embedding,
    validate_embedding_matrix,
    validate_model_version,
)

__all__ = [
    "DuplicatePair", "EmbeddingValidationError", "Match", "ModelVersionMismatchError",
    "SimilarityIndex", "SpeciesCentroid", "cosine_similarity", "cosine_similarity_matrix",
    "group_matches_by_species", "validate_embedding", "validate_embedding_matrix",
    "validate_model_version",
]
