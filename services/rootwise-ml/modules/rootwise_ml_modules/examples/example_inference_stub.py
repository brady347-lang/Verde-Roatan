"""Inference wrapper with an injected STUB backend (no TensorFlow). The stub has no botanical meaning.

With TensorFlow, use InferenceConfig(model_path="model.tflite" or "embedding_model.keras") instead.
"""
import json
import numpy as np
from PIL import Image

from rootwise_ml_modules.inference import InferenceConfig, RootWiseInference, build_reference_index
from rootwise_ml_modules.image_features import FeatureExtractor

W = np.random.default_rng(0).standard_normal((12, 512)).astype(np.float32)
def stub_embed(batch):
    pooled = batch.reshape(len(batch), 2, 112, 2, 112, 3).mean(axis=(2, 4)).reshape(len(batch), -1)
    out = pooled @ W
    return out / np.linalg.norm(out, axis=1, keepdims=True)

def photo(rgb, seed):
    noise = np.random.default_rng(seed).integers(-25, 25, (160, 160, 3))
    return Image.fromarray(np.clip(np.array(rgb) + noise, 0, 255).astype(np.uint8))

engine = RootWiseInference(InferenceConfig(embed_fn=stub_embed))
print(json.dumps(engine.initialize()["notes"], indent=1))
refs = [(f"{n}_{i}", n, photo(c, i)) for n, c in {"green": (40, 160, 60), "red": (190, 40, 40)}.items() for i in range(3)]
index, failures = build_reference_index(FeatureExtractor(stub_embed), refs)
engine.set_index(index)
out = engine.identify(photo((40, 160, 60), 99))
print(out["decision"], out["decision_reasons"])  # "review": no measured policy was configured, so it never auto-accepts
