"""Image quality heuristics and the feedback -> approved-manifest workflow."""
import tempfile, os
import numpy as np
from PIL import Image

from rootwise_ml_modules.feedback import FeedbackStore, export_training_manifest, find_repeated_errors
from rootwise_ml_modules.image_quality import assess_quality

img = Image.fromarray(np.random.default_rng(0).integers(0, 255, (300, 300, 3), dtype=np.uint8))
print(assess_quality(img).to_dict()["verdict"], "(technical quality only; not a plant detector)")

store = FeedbackStore()
base = dict(model_version="rootwise_mobilenetv3_512d_v1", timestamp="2026-11-09T12:00:00+00:00")
store.add({"feedback_id": "f1", "image_id": "img1", "source_id": "obs1", "user_action": "correct",
           "predicted_species_id": "sp_a", "corrected_species_id": "sp_b", **base})
print("approved before review:", len(store.approved()))          # 0: user corrections are unverified
store.verify("f1", reviewer_id="reviewer_1", verified_species_id="sp_b")
store.approve_for_training("f1", approved_by="reviewer_1")
with tempfile.TemporaryDirectory() as d:
    print(export_training_manifest(store.approved(), os.path.join(d, "manifest.json"), created_at="2026-11-09T00:00:00+00:00"))
print(find_repeated_errors(store.all(), min_count=1))
