import numpy as np
import pytest

from rootwise_ml_modules.similarity import (
    EmbeddingValidationError,
    ModelVersionMismatchError,
    SimilarityIndex,
    cosine_similarity,
    cosine_similarity_matrix,
    group_matches_by_species,
    validate_embedding,
    validate_embedding_matrix,
)


def basis(i: int) -> np.ndarray:
    v = np.zeros(512, np.float32)
    v[i] = 1.0
    return v


def mix(i: int, j: int, wj: float) -> np.ndarray:
    v = basis(i) + wj * basis(j)
    return v / np.linalg.norm(v)


def test_cosine_basic():
    assert cosine_similarity(basis(0), basis(0)) == pytest.approx(1.0)
    assert cosine_similarity(basis(0), basis(1)) == pytest.approx(0.0)
    assert cosine_similarity(basis(0), -basis(0)) == pytest.approx(-1.0)
    assert cosine_similarity(5 * basis(0), basis(0)) == pytest.approx(1.0)
    m = cosine_similarity_matrix(np.stack([basis(0), basis(1)]), np.stack([basis(0), basis(1), mix(0, 1, 1)]))
    assert m.shape == (2, 3) and m[0, 2] == pytest.approx(2 ** -0.5, abs=1e-6)


@pytest.mark.parametrize(
    "bad",
    [
        np.ones(511), np.ones(513), np.full(512, np.nan), np.full(512, np.inf), np.zeros(512),
        np.array(["a"] * 512), np.ones((2, 512)), np.ones(512, dtype=bool), None, np.ones((512, 1)),
    ],
)
def test_validate_embedding_rejects_malformed(bad):
    with pytest.raises(EmbeddingValidationError):
        validate_embedding(bad)


def test_validate_embedding_accepts_row_vector_and_unit_norm_check():
    assert validate_embedding(basis(0)[None, :]).shape == (512,)
    with pytest.raises(EmbeddingValidationError):
        validate_embedding(3 * basis(0), require_unit_norm=True)
    validate_embedding(basis(0), require_unit_norm=True)
    with pytest.raises(EmbeddingValidationError):
        validate_embedding_matrix(np.zeros((2, 512)))
    with pytest.raises(EmbeddingValidationError):
        validate_embedding_matrix(np.ones((0, 512)))


def build_index():
    idx = SimilarityIndex()
    idx.add("r_a", "sp_a", basis(0), image_id="img1")
    idx.add("r_b", "sp_b", mix(0, 1, 1.0))
    idx.add("r_c", "sp_c", basis(1))
    return idx


def test_search_ranking_topk_and_fields():
    m = build_index().search(basis(0), top_k=2)
    assert [x.reference_id for x in m] == ["r_a", "r_b"] and [x.rank for x in m] == [1, 2]
    assert m[0].cosine_similarity == pytest.approx(1.0) and m[1].cosine_similarity == pytest.approx(2 ** -0.5, abs=1e-6)
    d = m[0].to_dict()
    assert d["score_type"] == "cosine_similarity_uncalibrated" and d["image_id"] == "img1"
    assert len(build_index().search(basis(0), top_k=10)) == 3


def test_search_filters_and_ties_and_empty():
    idx = build_index()
    assert [x.species_id for x in idx.search(basis(0), species_ids=["sp_c"])] == ["sp_c"]
    assert [x.reference_id for x in idx.search(basis(0), min_similarity=0.5)] == ["r_a", "r_b"]
    assert idx.search(basis(0), species_ids=["nope"]) == []
    assert SimilarityIndex().search(basis(0)) == []
    tie = SimilarityIndex()
    tie.add("first", "s", basis(0))
    tie.add("second", "s", basis(0))
    assert [x.reference_id for x in tie.search(basis(0))] == ["first", "second"]


def test_search_validation_and_versions():
    idx = build_index()
    for bad_k in (0, -1, 1.5, True):
        with pytest.raises(ValueError):
            idx.search(basis(0), top_k=bad_k)  # type: ignore[arg-type]
    with pytest.raises(EmbeddingValidationError):
        idx.search(np.ones(10))
    with pytest.raises(ModelVersionMismatchError):
        idx.search(basis(0), query_model_version="other")
    with pytest.raises(ModelVersionMismatchError):
        idx.add("x", "s", basis(2), model_version="other")
    with pytest.raises(ValueError):
        idx.add("r_a", "s", basis(2))  # duplicate id
    with pytest.raises(EmbeddingValidationError):
        idx.add("bad", "s", np.full(512, np.nan))
    assert len(idx) == 3


def test_require_unit_norm_option():
    idx = SimilarityIndex(require_unit_norm=True)
    with pytest.raises(EmbeddingValidationError):
        idx.add("a", "s", 2 * basis(0))
    idx.add("a", "s", basis(0))


def test_centroids_and_centroid_search():
    idx = SimilarityIndex()
    idx.add("x1", "sp_x", basis(0))
    idx.add("x2", "sp_x", mix(0, 2, 0.2))
    idx.add("y1", "sp_y", basis(1))
    cents = idx.species_centroids()
    assert set(cents) == {"sp_x", "sp_y"} and cents["sp_x"].n_references == 2
    assert np.linalg.norm(cents["sp_x"].centroid) == pytest.approx(1.0, abs=1e-5)
    res = idx.search_centroids(basis(0), top_k=2)
    assert res[0]["species_id"] == "sp_x" and res[0]["score_type"] == "cosine_similarity_uncalibrated"
    idx2 = SimilarityIndex()
    idx2.add("p", "s", basis(0))
    idx2.add("q", "s", -basis(0))
    with pytest.raises(EmbeddingValidationError):
        idx2.species_centroids()


def test_duplicate_detection():
    idx = SimilarityIndex()
    idx.add("a", "sp_x", basis(0))
    idx.add("b", "sp_x", basis(0))
    idx.add("c", "sp_y", mix(0, 1, 0.05))
    idx.add("d", "sp_z", basis(5))
    pairs = idx.find_duplicates(near_threshold=0.99)
    kinds = {(p.reference_a, p.reference_b): p for p in pairs}
    assert set(kinds) == {("a", "b"), ("a", "c"), ("b", "c")}
    assert kinds[("a", "b")].kind == "exact" and kinds[("a", "b")].same_species
    assert kinds[("a", "c")].kind == "near" and not kinds[("a", "c")].same_species
    assert [(p.reference_a, p.reference_b) for p in idx.find_duplicates(near_threshold=0.99999)] == [("a", "b")]
    assert [m.reference_id for m in idx.check_duplicate(basis(0), near_threshold=0.99999)] == ["a", "b"]
    with pytest.raises(ValueError):
        idx.find_duplicates(near_threshold=1.5)


def test_group_matches_by_species():
    g = group_matches_by_species(build_index().search(basis(0), top_k=3))
    assert list(g) == ["sp_a", "sp_b", "sp_c"]


def test_save_load_roundtrip(tmp_path):
    idx = build_index()
    p = str(tmp_path / "idx.npz")
    idx.save(p)
    loaded = SimilarityIndex.load(p, expected_model_version=idx.model_version)
    assert len(loaded) == 3
    a, b = idx.search(basis(0), top_k=3), loaded.search(basis(0), top_k=3)
    assert [(x.reference_id, x.image_id) for x in a] == [(x.reference_id, x.image_id) for x in b]
    with pytest.raises(ModelVersionMismatchError):
        SimilarityIndex.load(p, expected_model_version="other")
    with pytest.raises(FileNotFoundError):
        SimilarityIndex.load(str(tmp_path / "missing.npz"))


def test_add_many():
    idx = SimilarityIndex()
    n = idx.add_many([{"reference_id": f"r{i}", "species_id": "s", "embedding": basis(i)} for i in range(3)])
    assert n == 3 and len(idx) == 3 and idx.species_ids == ["s"]
