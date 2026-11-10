"""Simple colour/texture statistics.

These are generic image statistics. They are NOT botanical identification features and
are not part of the embedding; they are supplied as optional, human-readable context.
"""
from __future__ import annotations

from typing import Dict, Union

import numpy as np
from PIL import Image

from .preprocessing import ImageInput, load_image

DESCRIPTOR_NOTE = (
    "Generic colour/texture statistics with heuristic thresholds; not validated for "
    "botanical identification."
)


def color_texture_descriptor(source: ImageInput) -> Dict[str, Union[float, str]]:
    """Return mean RGB, a green-pixel fraction, and gradient-based edge density."""
    img, _, _ = load_image(source)
    small = img.resize((224, 224), Image.Resampling.BILINEAR)
    rgb = np.asarray(small, dtype=np.float32) / 255.0
    hsv = np.asarray(small.convert("HSV"), dtype=np.float32)  # PIL hue spans 0..255 for 0..360 deg
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    green = (h >= 60) & (h <= 131) & (s >= 40) & (v >= 40)  # ~85-185 deg
    gray = np.asarray(small.convert("L"), dtype=np.float32) / 255.0
    gx = np.abs(np.diff(gray, axis=1)).mean()
    gy = np.abs(np.diff(gray, axis=0)).mean()
    return {
        "mean_r": float(rgb[..., 0].mean()),
        "mean_g": float(rgb[..., 1].mean()),
        "mean_b": float(rgb[..., 2].mean()),
        "green_pixel_fraction": float(green.mean()),
        "edge_density": float((gx + gy) / 2.0),
        "note": DESCRIPTOR_NOTE,
    }
