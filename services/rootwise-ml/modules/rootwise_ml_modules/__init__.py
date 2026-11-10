"""RootWise standalone ML modules.

Each sub-package is independently importable. No sub-package imports TensorFlow
at import time; TensorFlow / LiteRT are only imported lazily inside the functions
that need them, so the similarity, ranking, quality, uncertainty, feedback and
manifest/split utilities work in a NumPy-only environment.
"""
from .contract import EMBEDDING_DIM, MODEL_VERSION

__version__ = "0.1.0"
__all__ = ["EMBEDDING_DIM", "MODEL_VERSION", "__version__"]
