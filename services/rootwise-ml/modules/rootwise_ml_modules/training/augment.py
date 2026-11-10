"""PIL-based, seedable data augmentation applied before the standard preprocessing.

Augmentations are deliberately conservative (no hue shifts: colour carries botanical
information). Whether they help must be measured on your own validation data.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from PIL import Image, ImageEnhance


@dataclass(frozen=True)
class AugmentationConfig:
    horizontal_flip: bool = True
    vertical_flip: bool = False
    max_rotation_deg: float = 20.0
    brightness_delta: float = 0.2  # factor drawn from [1-d, 1+d]
    contrast_delta: float = 0.2
    saturation_delta: float = 0.1
    crop_scale: Tuple[float, float] = (0.7, 1.0)  # area fraction of random crop

    def __post_init__(self) -> None:
        lo, hi = self.crop_scale
        if not 0 < lo <= hi <= 1:
            raise ValueError("crop_scale must satisfy 0 < lo <= hi <= 1.")
        for n in ("max_rotation_deg", "brightness_delta", "contrast_delta", "saturation_delta"):
            if getattr(self, n) < 0:
                raise ValueError(f"{n} must be >= 0.")

    @classmethod
    def disabled(cls) -> "AugmentationConfig":
        return cls(False, False, 0.0, 0.0, 0.0, 0.0, (1.0, 1.0))


def augment_pil(img: Image.Image, rng: np.random.Generator, config: AugmentationConfig = AugmentationConfig()) -> Image.Image:
    """Return an augmented RGB copy of ``img`` using the given RNG (deterministic for a seeded RNG)."""
    if img.mode != "RGB":
        raise ValueError("augment_pil expects an RGB image.")
    out = img
    if config.horizontal_flip and rng.random() < 0.5:
        out = out.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if config.vertical_flip and rng.random() < 0.5:
        out = out.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if config.max_rotation_deg > 0:
        angle = float(rng.uniform(-config.max_rotation_deg, config.max_rotation_deg))
        out = out.rotate(angle, resample=Image.Resampling.BILINEAR, fillcolor=(0, 0, 0))
    lo, hi = config.crop_scale
    if hi < 1.0 or lo < 1.0:
        area = float(rng.uniform(lo, hi))
        w, h = out.size
        cw, ch = max(1, int(round(w * area ** 0.5))), max(1, int(round(h * area ** 0.5)))
        x0 = int(rng.integers(0, w - cw + 1))
        y0 = int(rng.integers(0, h - ch + 1))
        out = out.crop((x0, y0, x0 + cw, y0 + ch)).resize((w, h), Image.Resampling.BILINEAR)
    for enhancer, delta in (
        (ImageEnhance.Brightness, config.brightness_delta),
        (ImageEnhance.Contrast, config.contrast_delta),
        (ImageEnhance.Color, config.saturation_delta),
    ):
        if delta > 0:
            out = enhancer(out).enhance(float(rng.uniform(1 - delta, 1 + delta)))
    return out
