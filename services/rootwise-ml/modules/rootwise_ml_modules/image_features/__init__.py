"""Module A: botanical image preprocessing and 512-d embedding extraction."""
from .backends import KerasBackend, TFLiteBackend
from .descriptors import color_texture_descriptor
from .extractor import BatchEmbeddingResult, EmbeddingResult, FeatureExtractor, ModelOutputError
from .preprocessing import (
    BatchPreprocessResult,
    ImageValidationError,
    PreprocessMetadata,
    load_image,
    preprocess_batch,
    preprocess_image,
    preprocess_pil,
)

__all__ = [
    "BatchEmbeddingResult", "BatchPreprocessResult", "EmbeddingResult", "FeatureExtractor",
    "ImageValidationError", "KerasBackend", "ModelOutputError", "PreprocessMetadata",
    "TFLiteBackend", "color_texture_descriptor", "load_image", "preprocess_batch",
    "preprocess_image", "preprocess_pil",
]
