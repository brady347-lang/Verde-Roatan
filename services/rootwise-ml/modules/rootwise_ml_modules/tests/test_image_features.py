import numpy as np
import pytest
from PIL import Image

from rootwise_ml_modules.contract import MODEL_VERSION
from rootwise_ml_modules.image_features import (
    FeatureExtractor,
    ImageValidationError,
    ModelOutputError,
    TFLiteBackend,
    color_texture_descriptor,
    preprocess_batch,
    preprocess_image,
)

from .helpers import FakeInterpreter, colored_image, fake_embed, noise_image, png_bytes


def test_output_contract_shape_dtype_range():
    arr, meta = preprocess_image(noise_image())
    assert arr.shape == (224, 224, 3) and arr.dtype == np.float32
    assert -1.0 <= arr.min() and arr.max() <= 1.0
    assert meta.normalization == "x/127.5-1.0" and meta.output_width == 224


def test_black_white_map_to_minus_one_plus_one():
    b, _ = preprocess_image(np.zeros((64, 64, 3), np.uint8))
    w, _ = preprocess_image(np.full((64, 64, 3), 255, np.uint8))
    assert np.allclose(b, -1.0) and np.allclose(w, 1.0)


def test_accepts_path_bytes_pil_ndarray(tmp_path):
    arr = noise_image(120, 90, 1)
    p = tmp_path / "a.png"
    Image.fromarray(arr).save(p)
    outs = [preprocess_image(x)[0] for x in (p, str(p), png_bytes(arr), Image.fromarray(arr), arr)]
    for o in outs[1:]:
        assert np.allclose(o, outs[0])
    assert preprocess_image(p)[1].source_type == "path"


def test_rgba_composited_on_white():
    rgba = np.zeros((64, 64, 4), np.uint8)  # fully transparent black
    out, meta = preprocess_image(rgba)
    assert np.allclose(out, 1.0) and meta.original_mode == "RGBA"


def test_exif_orientation_applied(tmp_path):
    img = Image.fromarray(noise_image(100, 60, 2))
    exif = img.getexif()
    exif[0x0112] = 6
    p = tmp_path / "rot.jpg"
    img.save(p, exif=exif)
    _, meta = preprocess_image(p)
    assert (meta.original_width, meta.original_height) == (60, 100)


@pytest.mark.parametrize(
    "bad, code",
    [
        (b"not an image", "corrupt_image"),
        (b"", "empty_input"),
        (np.zeros((64, 64, 3), np.float32), "bad_array_dtype"),
        (np.zeros((64, 64), np.uint8), "bad_array_shape"),
        (np.zeros((10, 10, 3), np.uint8), "image_too_small"),
        ([1, 2, 3], "unsupported_input_type"),
    ],
)
def test_rejects_bad_inputs(bad, code):
    with pytest.raises(ImageValidationError) as ei:
        preprocess_image(bad)
    assert ei.value.code == code


def test_missing_file_and_truncated_png(tmp_path):
    with pytest.raises(ImageValidationError) as ei:
        preprocess_image(tmp_path / "nope.png")
    assert ei.value.code == "file_not_found"
    with pytest.raises(ImageValidationError) as ei:
        preprocess_image(png_bytes(noise_image())[:50])
    assert ei.value.code == "corrupt_image"


def test_grayscale_rejected_unless_conversion_allowed():
    gray = Image.fromarray(noise_image()[:, :, 0])
    with pytest.raises(ImageValidationError) as ei:
        preprocess_image(gray)
    assert ei.value.code == "unsupported_mode"
    arr, meta = preprocess_image(gray, allow_mode_conversion=True)
    assert arr.shape == (224, 224, 3) and meta.original_mode == "L"


def test_max_pixels_guard():
    with pytest.raises(ImageValidationError) as ei:
        preprocess_image(np.zeros((64, 64, 3), np.uint8), max_pixels=100)
    assert ei.value.code == "image_too_large"


def test_batch_skip_and_raise():
    srcs = [noise_image(seed=1), b"junk", noise_image(seed=2)]
    res = preprocess_batch(srcs, on_error="skip")
    assert res.array.shape == (2, 224, 224, 3) and res.valid_indices == [0, 2]
    assert res.failures[0]["index"] == 1 and res.failures[0]["code"] == "corrupt_image"
    with pytest.raises(ImageValidationError):
        preprocess_batch(srcs)
    with pytest.raises(ValueError):
        preprocess_batch([])


def test_extractor_single_embedding_contract():
    ex = FeatureExtractor(fake_embed)
    r = ex.extract(noise_image(seed=3))
    assert r.embedding.shape == (512,) and r.embedding.dtype == np.float32
    assert abs(np.linalg.norm(r.embedding) - 1.0) < 1e-5
    assert r.model_version == MODEL_VERSION == "rootwise_mobilenetv3_512d_v1"
    d = r.to_dict()
    assert "embedding" not in d and d["embedding_dim"] == 512 and d["l2_normalized"] is True
    assert len(r.to_dict(include_embedding=True)["embedding"]) == 512
    assert r.model_info["botanical_specialization"] is False  # baseline must not claim specialisation


def test_extractor_batch_matches_single_and_chunks():
    imgs = [noise_image(seed=s) for s in range(5)]
    ex = FeatureExtractor(fake_embed, batch_size=2)
    batch = ex.extract_batch(imgs)
    assert batch.embeddings.shape == (5, 512)
    for i, im in enumerate(imgs):
        assert np.allclose(batch.embeddings[i], ex.extract(im).embedding, atol=1e-6)


def test_extractor_batch_skip_reports_failures():
    ex = FeatureExtractor(fake_embed)
    res = ex.extract_batch([noise_image(), b"junk", noise_image(seed=9)], on_error="skip")
    assert res.valid_indices == [0, 2] and len(res.failures) == 1 and res.embeddings.shape == (2, 512)


def test_extractor_rejects_bad_backend_output():
    with pytest.raises(ModelOutputError):
        FeatureExtractor(lambda b: np.zeros((len(b), 10))).extract(noise_image())
    with pytest.raises(ModelOutputError):
        FeatureExtractor(lambda b: np.full((len(b), 512), np.nan)).extract(noise_image())
    with pytest.raises(ModelOutputError):
        FeatureExtractor(lambda b: np.zeros((len(b), 512))).extract(noise_image())
    with pytest.raises(TypeError):
        FeatureExtractor("not callable")  # type: ignore[arg-type]


def test_normalizes_unnormalized_backend_output():
    ex = FeatureExtractor(lambda b: 7.0 * fake_embed(b))
    assert abs(np.linalg.norm(ex.extract(noise_image()).embedding) - 1.0) < 1e-5


def test_tflite_backend_with_fake_interpreter_and_contract_checks():
    ex = FeatureExtractor(TFLiteBackend(interpreter=FakeInterpreter()))
    assert ex.extract(noise_image()).embedding.shape == (512,)
    with pytest.raises(ValueError):
        TFLiteBackend(interpreter=FakeInterpreter(in_shape=(1, 128, 128, 3)))
    with pytest.raises(ValueError):
        TFLiteBackend(interpreter=FakeInterpreter(out_shape=(1, 256)))
    with pytest.raises(ValueError):
        TFLiteBackend(interpreter=FakeInterpreter(out_dtype=np.float64))


def test_color_texture_descriptor_is_generic_statistics():
    green = color_texture_descriptor(colored_image((30, 160, 40)))
    red = color_texture_descriptor(colored_image((200, 30, 30)))
    assert green["green_pixel_fraction"] > 0.9 and red["green_pixel_fraction"] < 0.1
    assert "not validated for botanical identification" in green["note"]
