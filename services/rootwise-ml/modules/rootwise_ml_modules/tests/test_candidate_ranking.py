import json

import pytest

from rootwise_ml_modules.candidate_ranking import (
    DecisionPolicy,
    RankingConfig,
    ReferenceEvidence,
    SpeciesCatalog,
    SpeciesInfo,
    identify_ambiguous_groups,
    rank_candidates,
)

POLICY = DecisionPolicy(min_top_score=0.5, min_margin=0.1, source="synthetic_test_fixture")


def ev(sid, sims, prefix=None):
    return [ReferenceEvidence(f"{prefix or sid}_{i}", sid, s, f"img_{sid}_{i}") for i, s in enumerate(sims)]


def test_aggregation_modes_change_order():
    evidence = ev("A", [0.9, 0.89, 0.88]) + ev("B", [0.95, 0.2, 0.1])
    assert rank_candidates(evidence, config=RankingConfig("max")).candidates[0].species_id == "B"
    assert rank_candidates(evidence, config=RankingConfig("top_n_mean", top_n=2)).candidates[0].species_id == "A"
    mean = rank_candidates(evidence, config=RankingConfig("mean"))
    assert mean.candidates[0].species_id == "A"
    top = rank_candidates(ev("A", [0.9, 0.8, 0.1, 0.05]), config=RankingConfig(top_n=2)).candidates[0]
    assert top.aggregated_score == pytest.approx(0.85) and top.n_references == 4 and top.explanation["references_used"] == 2


def test_dedup_by_reference_id_and_restriction():
    evidence = [ReferenceEvidence("r1", "A", 0.2), ReferenceEvidence("r1", "A", 0.9)] + ev("B", [0.5])
    res = rank_candidates(evidence)
    assert res.candidates[0].species_id == "A" and res.candidates[0].n_references == 1
    assert res.candidates[0].aggregated_score == pytest.approx(0.9)
    only_b = rank_candidates(evidence, candidate_species_ids=["B"])
    assert [c.species_id for c in only_b.candidates] == ["B"]
    assert len(rank_candidates(evidence, config=RankingConfig(max_candidates=1)).candidates) == 1


def test_no_policy_never_accepts():
    res = rank_candidates(ev("A", [0.99]) + ev("B", [0.1]))
    assert res.decision == "review" and res.reasons == ["no_decision_policy_configured"] and res.candidates


def test_no_evidence_is_unknown():
    res = rank_candidates([], policy=POLICY)
    assert res.decision == "unknown" and res.reasons == ["no_evidence"] and res.candidates == []


def test_policy_decisions():
    assert rank_candidates(ev("A", [0.9]) + ev("B", [0.5]), policy=POLICY).decision == "accept"
    amb = rank_candidates(ev("A", [0.9]) + ev("B", [0.85]), policy=POLICY)
    assert amb.decision == "ambiguous" and amb.ambiguous_groups == [["A", "B"]]
    assert rank_candidates(ev("A", [0.3]), policy=POLICY).decision == "unknown"
    p2 = DecisionPolicy(0.5, 0.1, "synthetic_test_fixture", min_supporting_references=2)
    r = rank_candidates(ev("A", [0.9]), policy=p2)
    assert r.decision == "review" and r.reasons == ["insufficient_supporting_references"]
    assert rank_candidates(ev("A", [0.9, 0.9]), policy=p2).decision == "accept"


def test_ambiguity_group_and_family_note():
    cat = SpeciesCatalog([SpeciesInfo("A", family="Fam1"), SpeciesInfo("B", family="Fam1"), SpeciesInfo("C", family="Fam2")])
    pol = DecisionPolicy(0.5, 0.01, "synthetic_test_fixture", ambiguity_margin=0.12)
    res = rank_candidates(ev("A", [0.9]) + ev("B", [0.85]) + ev("C", [0.8]), cat, policy=pol)
    assert res.decision == "ambiguous" and res.ambiguous_groups == [["A", "B", "C"]]
    assert "close_competitors_within_ambiguity_margin" in res.reasons
    res2 = rank_candidates(ev("A", [0.9]) + ev("B", [0.85]), cat, policy=pol)
    assert "ambiguous_candidates_share_family_as_supplied" in res2.reasons
    assert identify_ambiguous_groups(res.candidates, 0.0) == []
    with pytest.raises(ValueError):
        identify_ambiguous_groups(res.candidates, -1)


def test_catalog_lookup_and_metadata():
    info = SpeciesInfo("sp_a", "Testus alpha", ("Alpha plant", "Café plant"), taxon_id="TX1", taxon_id_source="synthetic", family="Testaceae")
    other = SpeciesInfo("sp_b", "Testus beta", ("alpha plant",))
    cat = SpeciesCatalog([info, other])
    assert [s.species_id for s in cat.find_by_name("TESTUS  alpha")] == ["sp_a"]
    assert {s.species_id for s in cat.find_by_name("alpha PLANT")} == {"sp_a", "sp_b"}  # common names may be shared
    assert [s.species_id for s in cat.find_by_name("cafe plant")] == ["sp_a"]
    assert cat.find_by_name("unknown") == [] and "sp_a" in cat and len(cat) == 2
    with pytest.raises(ValueError):
        cat.add(SpeciesInfo("sp_a"))
    res = rank_candidates(ev("sp_a", [0.9]), cat, policy=POLICY)
    sp = res.candidates[0].species
    assert sp["taxon_id"] == "TX1" and sp["family"] == "Testaceae" and sp["common_names"] == ["Alpha plant", "Café plant"]


def test_unknown_species_warns_but_is_not_invented():
    res = rank_candidates(ev("zzz", [0.9]), SpeciesCatalog([SpeciesInfo("sp_a")]), policy=POLICY)
    assert res.candidates[0].species is None and any("zzz" in w for w in res.warnings)


def test_catalog_json_loading(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"species": [{"species_id": "s1", "scientific_name": "Testus one", "common_names": "One", "taxon_id": 7}]}))
    cat = SpeciesCatalog.from_json(str(p))
    assert cat.get("s1").taxon_id == "7" and cat.get("s1").common_names == ("One",)
    p.write_text("123")
    with pytest.raises(ValueError):
        SpeciesCatalog.from_json(str(p))
    with pytest.raises(FileNotFoundError):
        SpeciesCatalog.from_json(str(tmp_path / "none.json"))
    with pytest.raises(ValueError):
        SpeciesInfo.from_dict({"scientific_name": "x"})


def test_validation_errors():
    with pytest.raises(ValueError):
        rank_candidates([ReferenceEvidence("r", "A", 1.5)])
    with pytest.raises(ValueError):
        rank_candidates([ReferenceEvidence("r", "A", float("nan"))])
    with pytest.raises(ValueError):
        rank_candidates([ReferenceEvidence("", "A", 0.5)])
    with pytest.raises(ValueError):
        RankingConfig(aggregation="median")
    with pytest.raises(ValueError):
        RankingConfig(top_n=0)
    with pytest.raises(ValueError):
        DecisionPolicy(float("nan"), 0.1, "s")
    with pytest.raises(ValueError):
        DecisionPolicy(0.5, -0.1, "s")
    with pytest.raises(ValueError):
        DecisionPolicy(0.5, 0.1, "")
    assert DecisionPolicy.from_dict(POLICY.to_dict()) == POLICY


def test_result_is_json_serializable_and_labels_scores_uncalibrated():
    res = rank_candidates(ev("A", [0.9]) + ev("B", [0.5]), SpeciesCatalog([SpeciesInfo("A")]), policy=POLICY)
    d = json.loads(json.dumps(res.to_dict()))
    assert d["candidates"][0]["score_type"] == "aggregated_cosine_similarity_uncalibrated"
    assert "not a probability" in d["note"]
