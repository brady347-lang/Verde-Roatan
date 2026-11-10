"""Synthetic fixtures for SOFTWARE tests only. They say nothing about botanical accuracy."""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw

_W = np.random.default_rng(0).standard_normal((192, 512)).astype(np.float32)


def fake_embed(batch: np.ndarray) -> np.ndarray:
    """Deterministic fake backend: 8x8 colour-layout pooling projected to 512-d (unit norm)."""
    b = np.asarray(batch, dtype=np.float32)
    n = b.shape[0]
    pooled = b.reshape(n, 8, 28, 8, 28, 3).mean(axis=(2, 4)).reshape(n, -1)
    out = pooled @ _W
    return out / np.linalg.norm(out, axis=1, keepdims=True)


class FakeInterpreter:
    """Minimal stand-in for a TFLite interpreter."""

    def __init__(
        self,
        in_shape: Tuple[int, ...] = (1, 224, 224, 3),
        out_shape: Tuple[int, ...] = (1, 512),
        in_dtype: Any = np.float32,
        out_dtype: Any = np.float32,
        fn: Optional[Callable[[np.ndarray], np.ndarray]] = None,
    ) -> None:
        self.in_shape, self.out_shape = in_shape, out_shape
        self.in_dtype, self.out_dtype = in_dtype, out_dtype
        self.fn = fn or (lambda x: fake_embed(x))
        self._x: Optional[np.ndarray] = None
        self._y: Optional[np.ndarray] = None

    def get_input_details(self) -> List[Dict[str, Any]]:
        return [{"index": 0, "shape": np.array(self.in_shape), "dtype": self.in_dtype}]

    def get_output_details(self) -> List[Dict[str, Any]]:
        return [{"index": 1, "shape": np.array(self.out_shape), "dtype": self.out_dtype}]

    def set_tensor(self, index: int, x: np.ndarray) -> None:
        self._x = x

    def invoke(self) -> None:
        self._y = np.asarray(self.fn(self._x), dtype=self.out_dtype)

    def get_tensor(self, index: int) -> np.ndarray:
        return self._y  # type: ignore[return-value]


def noise_image(w: int = 256, h: int = 256, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 256, (h, w, 3), dtype=np.uint8)


def colored_image(rgb: Tuple[int, int, int], seed: int = 0, size: Tuple[int, int] = (256, 256), noise: int = 12) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = np.empty((size[1], size[0], 3), np.int16)
    base[:] = rgb
    base += rng.integers(-noise, noise + 1, base.shape, dtype=np.int16)
    return np.clip(base, 0, 255).astype(np.uint8)


def structured_image(seed: int, size: Tuple[int, int] = (160, 160)) -> Image.Image:
    """Smooth horizontal gradient with random shapes: stable under JPEG re-encoding."""
    rng = np.random.default_rng(seed)
    w, h = size
    grad = np.tile(np.linspace(30, 220, w, dtype=np.uint8), (h, 1))
    img = Image.fromarray(np.stack([grad] * 3, axis=-1), "RGB")
    d = ImageDraw.Draw(img)
    for _ in range(4):
        x0, y0 = int(rng.integers(0, w - 40)), int(rng.integers(0, h - 40))
        d.rectangle([x0, y0, x0 + int(rng.integers(20, 60)), y0 + int(rng.integers(20, 60))], fill=tuple(int(v) for v in rng.integers(0, 256, 3)))
    return img


def png_bytes(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return buf.getvalue()


SPECIES_COLORS = {"sp_red": (200, 40, 40), "sp_green": (40, 200, 60), "sp_blue": (50, 60, 210)}


def make_dataset(
    root: Path,
    species: List[str],
    groups_per_species: int,
    images_per_group: int,
    *,
    license_name: Optional[str] = "CC0-synthetic",
) -> Path:
    """Write synthetic images + a CSV manifest. Returns the manifest path."""
    img_dir = root / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    palette = [(200, 40, 40), (40, 200, 60), (50, 60, 210), (200, 200, 40), (160, 40, 200), (40, 200, 200)]
    seed = 0
    for si, sp in enumerate(species):
        for g in range(groups_per_species):
            for k in range(images_per_group):
                seed += 1
                name = f"{sp}_g{g}_{k}.png"
                Image.fromarray(colored_image(palette[si % len(palette)], seed=seed, size=(64, 64))).save(img_dir / name)
                rows.append({"image_path": f"images/{name}", "species_id": sp, "group_id": f"{sp}_grp{g}", "license": license_name or ""})
    manifest = root / "manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["image_path", "species_id", "group_id", "license"])
        w.writeheader()
        w.writerows(rows)
    return manifest
