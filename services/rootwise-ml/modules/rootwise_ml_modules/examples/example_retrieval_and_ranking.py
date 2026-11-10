"""Similarity retrieval -> species ranking -> abstention. NumPy only.

Vectors are SYNTHETIC random unit vectors: this demonstrates the API, not botanical accuracy.
Run from the parent directory of ``rootwise_ml_modules``:  python -m rootwise_ml_modules.examples.example_retrieval_and_ranking
"""
import numpy as np

from rootwise_ml_modules.candidate_ranking import DecisionPolicy, ReferenceEvidence, SpeciesCatalog, SpeciesInfo, rank_candidates
from rootwise_ml_modules.similarity import SimilarityIndex

rng = np.random.default_rng(0)
unit = lambda v: (v / np.linalg.norm(v)).astype(np.float32)
centres = {sp: unit(rng.standard_normal(512)) for sp in ("species_a", "species_b")}

index = SimilarityIndex()  # model_version defaults to rootwise_mobilenetv3_512d_v1
for sp, c in centres.items():
    for i in range(4):
        index.add(f"{sp}_{i}", sp, unit(c + 0.3 * rng.standard_normal(512)))

query = unit(centres["species_a"] + 0.3 * rng.standard_normal(512))
matches = index.search(query, top_k=6)
print("top matches:", [(m.reference_id, round(m.cosine_similarity, 3)) for m in matches[:3]])
print(SimilarityIndex.score_note())

catalog = SpeciesCatalog.from_dicts([
    {"species_id": "species_a", "scientific_name": "Synthetica alpha", "common_names": ["alpha plant"], "family": "Syntheticaceae"},
    {"species_id": "species_b", "scientific_name": "Synthetica beta"},
])
evidence = [ReferenceEvidence(m.reference_id, m.species_id, m.cosine_similarity) for m in matches]

# No policy supplied -> ranking only; the module never invents thresholds.
print(rank_candidates(evidence, catalog).to_dict()["decision"])

# Thresholds must come from measured validation data (see example_uncertainty.py). Values below are placeholders.
policy = DecisionPolicy(min_top_score=0.4, min_margin=0.05, source="EXAMPLE_ONLY_not_measured")
print(rank_candidates(evidence, catalog, policy=policy).to_dict()["decision"])
