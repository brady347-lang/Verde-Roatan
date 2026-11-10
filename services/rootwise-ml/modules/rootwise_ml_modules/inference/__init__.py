"""Module I: API-ready inference wrapper returning JSON-compatible dicts."""
from .engine import InferenceConfig, RootWiseInference, build_reference_index, jsonable

__all__ = ["InferenceConfig", "RootWiseInference", "build_reference_index", "jsonable"]
