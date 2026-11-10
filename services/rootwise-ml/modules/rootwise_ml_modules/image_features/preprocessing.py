"""Image validation and preprocessing for the RootWise embedding contract.

Pipeline: validate -> EXIF-orient -> RGB -> resize to 224x224 (bilinear, no aspect
preservation) -> float32 -> ``x / 127.5 - 1`` giving values in [-1, 1].
"""
from __future__ import annotations

import io
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple, Union

import numpy as np
from PIL import Image, ImageOps

from ..contract import INPUT_SIZE

ImageInput = Union[str, "os.PathLike[str]", bytes, bytearray, memoryview, Image.Image, np.ndarray]

DEFAULT_MAX_PIXELS = 100_000_000
DEFAULT_MIN_SIDE = 32


class ImageValidationError(ValueError):
    """Raised for an input that cannot be accepted as an RGB photograph."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PreprocessMetadata:
    """Processing metadata for one preprocessed image."""

    source_type: str
    original_width: int
    original_height: int
    original_mode: str
    output_width: int = INPUT_SIZE
    output_height: int = INPUT_SIZE
    resize_method: str = "bilinear_squash"
    normalization: str = "x/127.5-1.0"
    value_range: Tuple[float, float] = (-1.0, 1.0)
    dtype: str = "float32"

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["value_range"] = list(self.value_range)
        return d


@dataclass
class BatchPreprocessResult:
    """Result of :func:`preprocess_batch`."""

    array: np.ndarray  # [N_valid, 224, 224, 3] float32
    metadata: List[PreprocessMetadata]
    valid_indices: List[int]
    failures: List[Dict[str, Any]]


def _open_source(source: Any) -> Tuple[str, Image.Image]:
    try:
        if isinstance(source, (str, os.PathLike)):
            path = Path(source)
            if not path.is_file():
                raise ImageValidationError("file_not_found", f"No such file: {path}")
            with Image.open(path) as im:
                im.load()
                return "path", im.copy()
        if isinstance(source, (bytes, bytearray, memoryview)):
            data = bytes(source)
            if not data:
                raise ImageValidationError("empty_input", "Image bytes are empty.")
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                return "bytes", im.copy()
        if isinstance(source, Image.Image):
            source.load()
            return "pil", source.copy()
        if isinstance(source, np.ndarray):
            if source.dtype != np.uint8:
                raise ImageValidationError("bad_array_dtype", f"Array must be uint8, got {source.dtype}.")
            if source.ndim != 3 or source.shape[2] not in (3, 4):
                raise ImageValidationError("bad_array_shape", f"Array must be HxWx3 or HxWx4, got {source.shape}.")
            mode = "RGB" if source.shape[2] == 3 else "RGBA"
            return "ndarray", Image.fromarray(np.ascontiguousarray(source), mode)
    except ImageValidationError:
        raise
    except Exception as exc:
        raise ImageValidationError("corrupt_image", f"Cannot decode image: {type(exc).__name__}: {exc}") from exc
    raise ImageValidationError("unsupported_input_type", f"Unsupported input type: {type(source).__name__}")


def load_image(
    source: ImageInput,
    *,
    max_pixels: int = DEFAULT_MAX_PIXELS,
    min_side: int = DEFAULT_MIN_SIDE,
    allow_mode_conversion: bool = False,
) -> Tuple[Image.Image, str, str]:
    """Validate and decode an input into an RGB PIL image.

    Returns ``(rgb_image, source_type, original_mode)``. RGBA is composited on white.
    Other modes (L, P, CMYK, ...) are rejected unless ``allow_mode_conversion`` is True.
    """
    if max_pixels < 1 or min_side < 1:
        raise ValueError("max_pixels and min_side must be positive.")
    source_type, img = _open_source(source)
    width, height = img.size
    if width * height > max_pixels:
        raise ImageValidationError("image_too_large", f"{width}x{height} exceeds {max_pixels} pixels.")
    if min(width, height) < min_side:
        raise ImageValidationError("image_too_small", f"{width}x{height} has a side below {min_side}px.")
    try:
        img = ImageOps.exif_transpose(img) or img
    except Exception:
        pass  # malformed EXIF must not block an otherwise valid image
    original_mode = img.mode
    if img.mode == "RGB":
        pass
    elif img.mode == "RGBA":
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.getchannel("A"))
        img = background
    elif allow_mode_conversion:
        img = img.convert("RGB")
    else:
        raise ImageValidationError("unsupported_mode", f"Image mode {img.mode!r} is not RGB.")
    return img, source_type, original_mode


def preprocess_pil(img: Image.Image) -> np.ndarray:
    """Resize an RGB PIL image to 224x224 and normalise to float32 in [-1, 1]."""
    if img.mode != "RGB":
        raise ImageValidationError("unsupported_mode", f"Expected RGB, got {img.mode!r}.")
    resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.uint8)
    return (arr.astype(np.float32) / np.float32(127.5)) - np.float32(1.0)


def preprocess_image(
    source: ImageInput,
    *,
    max_pixels: int = DEFAULT_MAX_PIXELS,
    min_side: int = DEFAULT_MIN_SIDE,
    allow_mode_conversion: bool = False,
) -> Tuple[np.ndarray, PreprocessMetadata]:
    """Validate and preprocess one image to float32 ``[224, 224, 3]`` in [-1, 1]."""
    img, source_type, original_mode = load_image(
        source, max_pixels=max_pixels, min_side=min_side, allow_mode_conversion=allow_mode_conversion
    )
    meta = PreprocessMetadata(
        source_type=source_type,
        original_width=img.size[0],
        original_height=img.size[1],
        original_mode=original_mode,
    )
    return preprocess_pil(img), meta


def preprocess_batch(
    sources: Sequence[ImageInput],
    *,
    on_error: str = "raise",
    max_pixels: int = DEFAULT_MAX_PIXELS,
    min_side: int = DEFAULT_MIN_SIDE,
    allow_mode_conversion: bool = False,
) -> BatchPreprocessResult:
    """Preprocess many images. ``on_error`` is ``"raise"`` or ``"skip"``."""
    if on_error not in ("raise", "skip"):
        raise ValueError("on_error must be 'raise' or 'skip'.")
    if len(sources) == 0:
        raise ValueError("sources must not be empty.")
    arrays: List[np.ndarray] = []
    metas: List[PreprocessMetadata] = []
    valid: List[int] = []
    failures: List[Dict[str, Any]] = []
    for i, src in enumerate(sources):
        try:
            arr, meta = preprocess_image(
                src, max_pixels=max_pixels, min_side=min_side, allow_mode_conversion=allow_mode_conversion
            )
        except ImageValidationError as exc:
            if on_error == "raise":
                raise
            failures.append({"index": i, "code": exc.code, "message": exc.message})
            continue
        arrays.append(arr)
        metas.append(meta)
        valid.append(i)
    stacked = np.stack(arrays, axis=0) if arrays else np.zeros((0, INPUT_SIZE, INPUT_SIZE, 3), np.float32)
    return BatchPreprocessResult(stacked, metas, valid, failures)
