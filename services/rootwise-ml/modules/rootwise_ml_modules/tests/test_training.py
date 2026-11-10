import csv
import json

import numpy as np
import pytest
from PIL import Image

from rootwise_ml_modules.training import (
    AugmentationConfig,
    ManifestEntry,
    SplitConfig,
    TrainingConfig,
    TrainingRunMetadata,
    augment_pil,
    class_distribution,
    classification_metrics,
    confusion_matrix_report,
    find_duplicate_groups,
    group_split,
    iterate_batches,
    load_manifest,
    manifest_sha256,
    retrieval_metrics,
    validate_manifest,
    verify_no_leakage,
)
from rootwise_ml_modules.training.splits import SplitResult

from .helpers import colored_image, make_dataset, structured_image


def codes(report):
    return {i.code for i in report.issues}


# ------------------------------------------------------------------ manifest
def test_load_manifest_formats_and_validate_ok(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a", "sp_b"], 3, 2)
    entries = load_manifest(str(manifest))
    assert len(entries) == 12
    rep = validate_manifest(entries, base_dir=str(tmp_path), verify_decode=True)
    assert rep.ok and rep.n_entries == 12
    jl = tmp_path / "m.jsonl"
    jl.write_text("\n".join(json.dumps({"image_path": e.image_path, "species_id": e.species_id, "group_id": e.group_id, "license": e.license}) for e in entries))
    assert [e.image_path for e in load_manifest(str(jl))] == [e.image_path for e in entries]
    js = tmp_path / "m.json"
    js.write_text(json.dumps({"entries": [{"image_path": "x.png", "species_id": "s", "group_id": "g", "license": "L", "custom": 1}]}))
    assert load_manifest(str(js))[0].extra == {"custom": 1}
    with pytest.raises(ValueError):
        load_manifest(str(tmp_path / "m.txt")) if (tmp_path / "m.txt").write_text("x") else None
    with pytest.raises(FileNotFoundError):
        load_manifest(str(tmp_path / "missing.csv"))


def test_manifest_validation_catches_problems(tmp_path):
    make_dataset(tmp_path, ["sp_a", "sp_b"], 2, 1)
    base = str(tmp_path)
    good = ManifestEntry("images/sp_a_g0_0.png", "sp_a", "g1", "CC0")
    cases = {
        "missing_group_id": [ManifestEntry("images/sp_a_g0_0.png", "sp_a", None, "CC0")],
        "missing_license": [ManifestEntry("images/sp_a_g0_0.png", "sp_a", "g", None)],
        "missing_species_id": [ManifestEntry("images/sp_a_g0_0.png", "", "g", "CC0")],
        "file_not_found": [ManifestEntry("images/nope.png", "sp_a", "g", "CC0")],
        "duplicate_path": [good, good],
        "conflicting_labels": [good, ManifestEntry("images/sp_a_g0_0.png", "sp_b", "g2", "CC0")],
        "group_spans_species": [good, ManifestEntry("images/sp_b_g0_0.png", "sp_b", "g1", "CC0")],
        "license_not_allowed": [ManifestEntry("images/sp_a_g0_0.png", "sp_a", "g", "GPL")],
        "empty_manifest": [],
    }
    for code, entries in cases.items():
        rep = validate_manifest(entries, base_dir=base, allowed_licenses=["CC0"])
        assert code in codes(rep) and not rep.ok, code
    assert validate_manifest(cases["missing_license"], base_dir=base, require_license=False).ok
    bad_img = tmp_path / "images" / "corrupt.png"
    bad_img.write_bytes(b"not a png")
    rep = validate_manifest([ManifestEntry("images/corrupt.png", "sp_a", "g", "CC0")], base_dir=base, verify_decode=True)
    assert "corrupt_image" in codes(rep)
    few = validate_manifest([good], base_dir=base, min_images_per_class=5)
    assert {"few_images", "single_class"} <= codes(few) and few.ok


def test_manifest_hash_is_order_independent():
    a = [ManifestEntry("1.png", "x", "g1", "L"), ManifestEntry("2.png", "y", "g2", "L")]
    assert manifest_sha256(a) == manifest_sha256(list(reversed(a)))
    assert manifest_sha256(a) != manifest_sha256([a[0], ManifestEntry("2.png", "z", "g2", "L")])


# -------------------------------------------------------------------- splits
def test_group_split_no_leakage_stratified_deterministic(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a", "sp_b", "sp_c"], 10, 2)
    entries = load_manifest(str(manifest))
    dups = find_duplicate_groups(entries, base_dir=str(tmp_path))
    assert dups.pairs == []
    cfg = SplitConfig(0.2, 0.2, seed=7)
    s1 = group_split(entries, dups.effective_groups, cfg)
    s2 = group_split(entries, dups.effective_groups, cfg)
    assert (s1.train, s1.val, s1.test) == (s2.train, s2.val, s2.test)
    verify_no_leakage(s1)
    assert len(s1.train) + len(s1.val) + len(s1.test) == len(entries)
    for part, n_groups in (("val", 2), ("test", 2), ("train", 6)):
        for sp in ("sp_a", "sp_b", "sp_c"):
            gs = {s1.groups[i] for i in s1.indices(part) if entries[i].species_id == sp}
            assert len(gs) == n_groups
    s3 = group_split(entries, dups.effective_groups, SplitConfig(0.2, 0.2, seed=8))
    assert s3.test != s1.test


def test_group_split_small_species_warns_and_stays_in_train(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a"], 1, 3)
    entries = load_manifest(str(manifest))
    s = group_split(entries, [e.group_id for e in entries], SplitConfig(0.2, 0.2))
    assert len(s.train) == 3 and s.val == [] and s.test == [] and s.warnings
    with pytest.raises(ValueError):
        group_split(entries, ["g"], SplitConfig())
    with pytest.raises(ValueError):
        SplitConfig(0.6, 0.5)


def test_verify_no_leakage_detects_leak():
    bad = SplitResult(train=[0], val=[1], test=[], groups=["g", "g"])
    with pytest.raises(AssertionError):
        verify_no_leakage(bad)
    with pytest.raises(AssertionError):
        verify_no_leakage(SplitResult(train=[0], val=[0], test=[], groups=["g"]))


def test_exact_duplicates_are_merged_into_one_group(tmp_path):
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    Image.fromarray(colored_image((10, 200, 10), 1, (64, 64))).save(img_dir / "a.png")
    (img_dir / "a_copy.png").write_bytes((img_dir / "a.png").read_bytes())
    Image.fromarray(colored_image((200, 10, 10), 2, (64, 64))).save(img_dir / "b.png")
    entries = [
        ManifestEntry("images/a.png", "sp_a", "grp1", "L"),
        ManifestEntry("images/a_copy.png", "sp_a", "grp2", "L"),
        ManifestEntry("images/b.png", "sp_b", "grp3", "L"),
    ]
    rep = find_duplicate_groups(entries, base_dir=str(tmp_path))
    assert rep.effective_groups[0] == rep.effective_groups[1] != rep.effective_groups[2]
    assert [(p["kind"], p["same_species"]) for p in rep.pairs] == [("exact", True)]
    # a duplicate carrying a different species label is reported as a conflict
    entries[1] = ManifestEntry("images/a_copy.png", "sp_b", "grp2", "L")
    assert len(find_duplicate_groups(entries, base_dir=str(tmp_path)).conflicts) == 1


def test_near_duplicates_by_perceptual_hash(tmp_path):
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    im = structured_image(5)
    im.save(img_dir / "orig.png")
    im.save(img_dir / "recompressed.jpg", quality=80)
    entries = [ManifestEntry("images/orig.png", "s", "g1", "L"), ManifestEntry("images/recompressed.jpg", "s", "g2", "L")]
    rep = find_duplicate_groups(entries, base_dir=str(tmp_path), near_duplicate_max_hamming=10)
    assert rep.effective_groups[0] == rep.effective_groups[1] and rep.pairs[0]["kind"] == "near"
    with pytest.raises(ValueError):
        find_duplicate_groups(entries, base_dir=str(tmp_path), near_duplicate_max_hamming=-1)


# ----------------------------------------------------------------- reporting
def test_class_distribution_report(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a", "sp_b"], 4, 1)
    entries = load_manifest(str(manifest))
    split = group_split(entries, [e.group_id for e in entries], SplitConfig(0.25, 0.25, 1))
    rep = class_distribution(entries, split, min_images_per_class=10)
    assert rep["overall"]["per_species"] == {"sp_a": 4, "sp_b": 4}
    assert rep["train"]["n_images"] + rep["val"]["n_images"] + rep["test"]["n_images"] == 8
    assert any("below 10" in w for w in rep["warnings"])
    json.dumps(rep)
    only = class_distribution(entries)
    assert "train" not in only and only["overall"]["imbalance_ratio"] == 1.0


# -------------------------------------------------------------- augmentation
def test_augmentation_is_seeded_and_size_preserving():
    img = Image.fromarray(colored_image((90, 160, 60), 3, (96, 96), noise=40))
    a = augment_pil(img, np.random.default_rng(5))
    b = augment_pil(img, np.random.default_rng(5))
    c = augment_pil(img, np.random.default_rng(6))
    assert a.size == img.size and a.mode == "RGB"
    assert np.array_equal(np.asarray(a), np.asarray(b)) and not np.array_equal(np.asarray(a), np.asarray(c))
    same = augment_pil(img, np.random.default_rng(1), AugmentationConfig.disabled())
    assert np.array_equal(np.asarray(same), np.asarray(img))
    with pytest.raises(ValueError):
        AugmentationConfig(crop_scale=(0.0, 1.0))
    with pytest.raises(ValueError):
        augment_pil(img.convert("L"), np.random.default_rng(0))


# ------------------------------------------------------------- batch iteration
def test_iterate_batches_shapes_ranges_determinism(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a", "sp_b"], 3, 2)
    entries = load_manifest(str(manifest))
    lm = {"sp_a": 0, "sp_b": 1}
    idx = list(range(len(entries)))
    kw = dict(batch_size=5, base_dir=str(tmp_path))
    batches = list(iterate_batches(entries, idx, lm, **kw))
    assert [b[0].shape[0] for b in batches] == [5, 5, 2]
    x, y = batches[0]
    assert x.shape[1:] == (224, 224, 3) and x.dtype == np.float32 and y.dtype == np.int32
    assert -1.0 <= x.min() and x.max() <= 1.0
    assert sorted(np.concatenate([b[1] for b in batches]).tolist()) == [0] * 6 + [1] * 6
    aug = AugmentationConfig()
    r1 = [b[1].tolist() for b in iterate_batches(entries, idx, lm, shuffle=True, seed=3, epoch=0, augmentation=aug, **kw)]
    r2 = [b[1].tolist() for b in iterate_batches(entries, idx, lm, shuffle=True, seed=3, epoch=0, augmentation=aug, **kw)]
    r3 = [b[1].tolist() for b in iterate_batches(entries, idx, lm, shuffle=True, seed=3, epoch=1, augmentation=aug, **kw)]
    assert r1 == r2 and r1 != r3
    a1 = next(iterate_batches(entries, idx, lm, shuffle=True, seed=3, epoch=0, augmentation=aug, **kw))[0]
    a2 = next(iterate_batches(entries, idx, lm, shuffle=True, seed=3, epoch=0, augmentation=aug, **kw))[0]
    assert np.array_equal(a1, a2)


def test_iterate_batches_errors(tmp_path):
    manifest = make_dataset(tmp_path, ["sp_a"], 1, 2)
    entries = load_manifest(str(manifest)) + [ManifestEntry("images/missing.png", "sp_a", "g", "L")]
    kw = dict(batch_size=4, base_dir=str(tmp_path))
    with pytest.raises(Exception):
        list(iterate_batches(entries, [0, 1, 2], {"sp_a": 0}, **kw))
    got = list(iterate_batches(entries, [0, 1, 2], {"sp_a": 0}, on_error="skip", **kw))
    assert got[0][0].shape[0] == 2
    with pytest.raises(KeyError):
        list(iterate_batches(entries, [0], {"other": 0}, **kw))
    with pytest.raises(ValueError):
        list(iterate_batches(entries, [0], {"sp_a": 0}, batch_size=0))


# ---------------------------------------------------------------- evaluation
def test_classification_metrics_and_confusion():
    labels = ["a", "b", "c"]
    yt = [0, 0, 1, 1, 2, 2]
    yp = [0, 1, 1, 1, 2, 0]
    m = classification_metrics(yt, yp, labels)
    assert m["accuracy"] == pytest.approx(4 / 6) and m["per_class"]["b"]["recall"] == 1.0
    assert m["per_class"]["a"]["precision"] == pytest.approx(0.5) and m["per_class"]["c"]["support"] == 2
    scores = np.eye(3)[yp]
    m2 = classification_metrics(yt, yp, labels, y_score=scores, top_k=(1, 2))
    assert m2["top_k_accuracy"]["1"] == pytest.approx(4 / 6)
    cm = confusion_matrix_report(yt, yp, labels)
    assert cm["matrix"] == [[1, 1, 0], [0, 2, 0], [1, 0, 1]]
    assert cm["top_confusions"][0]["count"] == 1
    with pytest.raises(ValueError):
        classification_metrics([0, 5], [0, 0], labels)
    with pytest.raises(ValueError):
        classification_metrics([], [], labels)


def test_retrieval_metrics():
    rng = np.random.default_rng(0)
    centers = rng.standard_normal((3, 512))
    refs = np.concatenate([c + 0.05 * rng.standard_normal((4, 512)) for c in centers])
    ref_labels = [f"s{i}" for i in range(3) for _ in range(4)]
    q = np.stack([c + 0.05 * rng.standard_normal(512) for c in centers])
    res = retrieval_metrics(q, ["s0", "s1", "s2"], refs, ref_labels, ks=(1, 2))
    assert res["top_k_species_accuracy"] == {"1": 1.0, "2": 1.0}
    with pytest.raises(ValueError):
        retrieval_metrics(q, ["s0"], refs, ref_labels)
    bad = q.copy()
    bad[0, 0] = np.nan
    with pytest.raises(ValueError):
        retrieval_metrics(bad, ["s0", "s1", "s2"], refs, ref_labels)


# ------------------------------------------------------------ config/metadata
def test_training_config_roundtrip_hash_validation(tmp_path):
    cfg = TrainingConfig(manifest_path="a.csv", output_dir=str(tmp_path / "out"), seed=5, augmentation={"crop_scale": [0.8, 1.0]})
    p = tmp_path / "cfg.json"
    cfg.save(str(p))
    again = TrainingConfig.load(str(p))
    assert again == cfg and again.config_hash() == cfg.config_hash()
    moved = TrainingConfig(manifest_path="b.csv", output_dir="elsewhere", seed=5, augmentation={"crop_scale": [0.8, 1.0]})
    assert moved.config_hash() == cfg.config_hash()  # paths do not change the hash
    assert TrainingConfig(manifest_path="a.csv", output_dir="o", seed=6).config_hash() != TrainingConfig(manifest_path="a.csv", output_dir="o", seed=5).config_hash()
    assert cfg.augmentation_config().crop_scale == (0.8, 1.0)
    assert cfg.model_version == "rootwise_mobilenetv3_512d_v1"
    for bad in ({"batch_size": 0}, {"epochs_head": 0, "epochs_finetune": 0}, {"learning_rate_head": 0}, {"label_smoothing": 1.0}, {"cosine_scale": -1}):
        with pytest.raises(ValueError):
            TrainingConfig(manifest_path="a", output_dir="o", **bad)
    with pytest.raises(ValueError):
        TrainingConfig.from_dict({"manifest_path": "a", "output_dir": "o", "bogus": 1})


def test_run_metadata_makes_no_specialisation_claim(tmp_path):
    meta = TrainingRunMetadata.create(
        model_version="rootwise_mobilenetv3_512d_v1", config_hash="c" * 8, manifest_sha256="m" * 8,
        label_map={"a": 0}, split_sizes={"train": 1, "val": 0, "test": 0}, backbone_init="imagenet",
        created_at="2026-01-01T00:00:00+00:00",
    )
    assert meta.botanical_specialization_claimed is False
    assert meta.run_id == TrainingRunMetadata.make_run_id("c" * 8, "m" * 8)
    assert "numpy" in meta.environment and meta.environment["python"]
    p = tmp_path / "meta.json"
    meta.save(str(p))
    assert TrainingRunMetadata.load(str(p)) == meta
