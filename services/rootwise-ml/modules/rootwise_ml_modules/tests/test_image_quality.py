import numpy as np
from PIL import Image, ImageFilter

from rootwise_ml_modules.image_quality import QualityConfig, assess_quality

from .helpers import noise_image, png_bytes


def codes(a):
    return {i.code for i in a.issues}


def test_sharp_textured_image_passes_heuristics():
    a = assess_quality(noise_image(300, 300, 1))
    assert a.verdict == "suitable" and a.issues == []
    assert "do not verify that the image contains a plant" in a.scope_note
    assert a.content_check["status"] == "not_assessed"  # heuristics never claim plant recognition


def test_blur_detected():
    blurred = Image.fromarray(noise_image(300, 300, 2)).filter(ImageFilter.GaussianBlur(10))
    a = assess_quality(blurred)
    assert "blurry" in codes(a) and a.verdict == "unsuitable"


def test_dark_and_bright_exposure():
    dark = (noise_image(300, 300, 3) * 0.08).astype(np.uint8)
    assert {"underexposed"} <= codes(assess_quality(dark)) and assess_quality(dark).verdict == "unsuitable"
    bright = 255 - dark
    assert {"overexposed"} <= codes(assess_quality(bright))


def test_low_resolution_and_low_contrast():
    small = assess_quality(noise_image(60, 60, 4))
    assert "low_resolution" in codes(small) and small.verdict == "unsuitable"
    flat = np.full((300, 300, 3), 128, np.uint8)
    assert "low_contrast" in codes(assess_quality(flat))


def test_marginal_verdict_for_warn_only():
    a = assess_quality(noise_image(150, 150, 5))  # 150 px: below warn (224) but above fail (96)
    assert a.verdict == "marginal" and all(i.severity == "warn" for i in a.issues)


def test_corrupt_inputs_do_not_raise():
    for bad in (b"garbage", b"", png_bytes(noise_image())[:40], "/no/such/file.png", 12345):
        a = assess_quality(bad)  # type: ignore[arg-type]
        assert a.verdict == "unsuitable" and codes(a) == {"corrupt_or_unreadable"}


def test_custom_thresholds_are_respected():
    strict = QualityConfig(min_side_warn=1000, min_side_fail=500)
    assert assess_quality(noise_image(300, 300, 6), strict).verdict == "unsuitable"


def test_trained_classifier_is_only_source_of_plant_judgement():
    class NotPlant:
        def predict(self, image):
            return {"is_plant": False, "score": 0.97}

    class Plant:
        def predict(self, image):
            return {"is_plant": True, "score": 0.9}

    class Broken:
        def predict(self, image):
            raise RuntimeError("boom")

    bad = assess_quality(noise_image(300, 300, 7), plant_classifier=NotPlant())
    assert "classifier_non_plant" in codes(bad) and bad.verdict == "unsuitable"
    assert bad.content_check["source"] == "trained_classifier"
    assert assess_quality(noise_image(300, 300, 7), plant_classifier=Plant()).verdict == "suitable"
    err = assess_quality(noise_image(300, 300, 7), plant_classifier=Broken())
    assert err.content_check["status"] == "classifier_error" and err.verdict == "suitable"


def test_green_fraction_is_informational_only():
    green = np.zeros((300, 300, 3), np.uint8)
    green[...] = (30, 160, 40)
    green = np.clip(green.astype(int) + np.random.default_rng(0).integers(-60, 60, green.shape), 0, 255).astype(np.uint8)
    a = assess_quality(green)
    assert "green_pixel_fraction_heuristic_only" in a.metrics
    assert all(i.metric != "green_pixel_fraction_heuristic_only" for i in a.issues)


def test_to_dict_is_json_serializable():
    import json

    d = assess_quality(noise_image(300, 300, 8)).to_dict()
    json.dumps(d)
    assert set(d) >= {"verdict", "reasons", "issues", "metrics", "content_check", "scope_note"}
