"""Heuristic image-quality assessment for botanical photographs.

IMPORTANT: everything here is a generic heuristic. The default thresholds are unvalidated
starting values and must be tuned on your own data. These heuristics measure technical
image quality only; they cannot tell whether an image actually shows a plant. Plant /
non-plant content recognition is only reported if you supply a trained classifier.
"""
from __future__ import annotations

import io
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Protocol, Tuple, Union

import numpy as np
from PIL import Image, ImageOps

try:  # OpenCV is optional; a NumPy fallback is used when absent.
    import cv2  # type: ignore
except ImportError:  # pragma: no cover
    cv2 = None

QualityInput = Union[str, "os.PathLike[str]", bytes, bytearray, Image.Image, np.ndarray]

SCOPE_NOTE = (
    "Heuristic technical-quality checks only. They do not verify that the image contains a plant; "
    "default thresholds are unvalidated and should be tuned on your own data."
)


class PlantContentClassifier(Protocol):
    """Optional TRAINED classifier. Must return ``{"is_plant": bool, "score": float, ...}``."""

    def predict(self, image: Image.Image) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class QualityConfig:
    """Thresholds (unvalidated defaults). 'fail' thresholds mark unsuitable images; 'warn' mark marginal ones."""

    min_side_warn: int = 224
    min_side_fail: int = 96
    blur_var_warn: float = 100.0  # variance of Laplacian on the analysis image
    blur_var_fail: float = 25.0
    mean_luma_dark_warn: float = 60.0
    mean_luma_dark_fail: float = 35.0
    mean_luma_bright_warn: float = 200.0
    mean_luma_bright_fail: float = 225.0
    clipped_fraction_warn: float = 0.25  # fraction of pixels <=5 or >=250
    clipped_fraction_fail: float = 0.50
    contrast_std_warn: float = 35.0  # std-dev of luma (0-255)
    contrast_std_fail: float = 15.0
    analysis_max_side: int = 512  # image is downscaled to this before blur/exposure metrics
    max_pixels: int = 100_000_000


@dataclass(frozen=True)
class QualityIssue:
    code: str
    severity: str  # "warn" | "fail"
    metric: str
    value: Optional[float]
    threshold: Optional[float]
    message: str


@dataclass
class QualityAssessment:
    verdict: str  # "suitable" | "marginal" | "unsuitable"
    issues: List[QualityIssue]
    metrics: Dict[str, Any]
    content_check: Dict[str, Any]
    scope_note: str = SCOPE_NOTE

    @property
    def reasons(self) -> List[str]:
        return [i.message for i in self.issues]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "verdict": self.verdict,
            "reasons": self.reasons,
            "issues": [asdict(i) for i in self.issues],
            "metrics": self.metrics,
            "content_check": self.content_check,
            "scope_note": self.scope_note,
        }


def _decode(source: QualityInput, max_pixels: int) -> Image.Image:
    if isinstance(source, (str, os.PathLike)):
        p = Path(source)
        if not p.is_file():
            raise FileNotFoundError(f"No such file: {p}")
        with Image.open(p) as im:
            _guard(im.size, max_pixels)
            im.load()
            return im.copy()
    if isinstance(source, (bytes, bytearray)):
        if not source:
            raise ValueError("empty image bytes")
        with Image.open(io.BytesIO(bytes(source))) as im:
            _guard(im.size, max_pixels)
            im.load()
            return im.copy()
    if isinstance(source, Image.Image):
        source.load()
        return source.copy()
    if isinstance(source, np.ndarray):
        if source.dtype != np.uint8 or source.ndim != 3 or source.shape[2] not in (3, 4):
            raise ValueError("array must be uint8 HxWx3 or HxWx4")
        return Image.fromarray(np.ascontiguousarray(source))
    raise TypeError(f"unsupported input type {type(source).__name__}")


def _guard(size: Tuple[int, int], max_pixels: int) -> None:
    if size[0] * size[1] > max_pixels:
        raise ValueError(f"image has {size[0] * size[1]} pixels, above limit {max_pixels}")


def _laplacian_variance(gray: np.ndarray) -> float:
    if cv2 is not None:
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())
    g = gray.astype(np.float64)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def assess_quality(
    source: QualityInput,
    config: QualityConfig = QualityConfig(),
    *,
    plant_classifier: Optional[PlantContentClassifier] = None,
) -> QualityAssessment:
    """Assess blur, exposure, resolution, contrast and corruption.

    Never raises for bad images: undecodable input yields verdict ``unsuitable`` with a
    ``corrupt_or_unreadable`` issue. ``plant_classifier`` (trained, optional) is the only
    thing that can contribute a plant / non-plant judgement.
    """
    content_check: Dict[str, Any] = {"status": "not_assessed", "source": None}
    try:
        img = _decode(source, config.max_pixels)
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.getchannel("A"))
            img = bg
        img = (ImageOps.exif_transpose(img) or img)
        img = img.convert("RGB")
    except Exception as exc:
        issue = QualityIssue("corrupt_or_unreadable", "fail", "decode", None, None, f"Image cannot be decoded: {type(exc).__name__}: {exc}")
        return QualityAssessment("unsuitable", [issue], {}, content_check)

    width, height = img.size
    issues: List[QualityIssue] = []
    metrics: Dict[str, Any] = {"width": width, "height": height, "min_side": min(width, height)}

    def grade(metric: str, value: float, warn: float, fail: float, code: str, text: str, low_is_bad: bool) -> None:
        bad = (lambda v, t: v < t) if low_is_bad else (lambda v, t: v > t)
        if bad(value, fail):
            issues.append(QualityIssue(code, "fail", metric, float(value), fail, f"{text} (value {value:.2f}, fail threshold {fail})"))
        elif bad(value, warn):
            issues.append(QualityIssue(code, "warn", metric, float(value), warn, f"{text} (value {value:.2f}, warn threshold {warn})"))

    grade("min_side", float(min(width, height)), config.min_side_warn, config.min_side_fail, "low_resolution", "Image resolution is low", True)

    scale = config.analysis_max_side / max(width, height)
    small = img.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.BILINEAR) if scale < 1 else img
    gray = np.asarray(small.convert("L"), dtype=np.uint8)

    lap_var = _laplacian_variance(gray)
    mean_luma = float(gray.mean())
    contrast = float(gray.std())
    clipped = float(((gray <= 5) | (gray >= 250)).mean())
    metrics.update(
        laplacian_variance=lap_var,
        mean_luma=mean_luma,
        contrast_std=contrast,
        clipped_fraction=clipped,
        analysis_size=[small.size[0], small.size[1]],
    )
    grade("laplacian_variance", lap_var, config.blur_var_warn, config.blur_var_fail, "blurry", "Image appears blurry", True)
    grade("mean_luma", mean_luma, config.mean_luma_dark_warn, config.mean_luma_dark_fail, "underexposed", "Image is dark", True)
    grade("mean_luma", mean_luma, config.mean_luma_bright_warn, config.mean_luma_bright_fail, "overexposed", "Image is very bright", False)
    grade("clipped_fraction", clipped, config.clipped_fraction_warn, config.clipped_fraction_fail, "clipped_exposure", "Many pixels are clipped to black or white", False)
    grade("contrast_std", contrast, config.contrast_std_warn, config.contrast_std_fail, "low_contrast", "Image contrast is low", True)

    # Informational heuristic only: never used in the verdict.
    hsv = np.asarray(small.convert("HSV"), dtype=np.uint8)
    green = (hsv[..., 0] >= 60) & (hsv[..., 0] <= 131) & (hsv[..., 1] >= 40) & (hsv[..., 2] >= 40)
    metrics["green_pixel_fraction_heuristic_only"] = float(green.mean())

    if plant_classifier is not None:
        try:
            out = dict(plant_classifier.predict(img))
            content_check = {"status": "assessed", "source": "trained_classifier", **out}
            if out.get("is_plant") is False:
                issues.append(QualityIssue("classifier_non_plant", "fail", "plant_classifier", out.get("score"), None, "Trained classifier reports the image does not show a plant"))
        except Exception as exc:
            content_check = {"status": "classifier_error", "source": "trained_classifier", "error": f"{type(exc).__name__}: {exc}"}

    if any(i.severity == "fail" for i in issues):
        verdict = "unsuitable"
    elif any(i.severity == "warn" for i in issues):
        verdict = "marginal"
    else:
        verdict = "suitable"
    return QualityAssessment(verdict, issues, metrics, content_check)
