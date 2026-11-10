"""Train on a licensed manifest and export to FLOAT32 TFLite. REQUIRES TensorFlow.

NOT EXECUTED in the authoring environment (TensorFlow was unavailable). Needs real, licensed, labeled
botanical images listed in a manifest with columns: image_path, species_id, group_id, license.
"""
import sys

from rootwise_ml_modules.export import export_to_tflite
from rootwise_ml_modules.training import TrainingConfig
from rootwise_ml_modules.training.trainer import train

manifest, out = sys.argv[1], sys.argv[2]
result = train(TrainingConfig(manifest_path=manifest, output_dir=out, epochs_head=5, epochs_finetune=5))
print(result.metrics)  # measured on YOUR validation/test splits only

import tensorflow as tf  # noqa: E402
model = tf.keras.models.load_model(result.embedding_model_path)
report = export_to_tflite(model, f"{out}/rootwise_embedding_fp32.tflite")
print(report.to_dict())
