"""Contract adapter between the RootWise ML modules and ``services/rootwise-ml/INTEGRATION_CONTRACT.md``.

* ``handlers``  - framework-free request logic (auth, upload validation, response mapping, feedback, catalog events).
* ``stores``    - Postgres-backed stores for ``rootwise_ml.feedback_events`` / ``rootwise_ml.image_embeddings`` (injectable).
* ``provenance``- mapping to the Knowledge Core evidence-queue payload (produced, never written, by this service).
* ``app``       - thin FastAPI shell (needs ``fastapi``); everything testable lives in ``handlers``.
"""
from .handlers import ApiError
from .settings import ServiceSettings

__all__ = ["ApiError", "ServiceSettings"]
