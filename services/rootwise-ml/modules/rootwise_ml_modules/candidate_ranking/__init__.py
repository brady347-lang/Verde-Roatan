"""Module C: species candidate ranking from multi-reference image evidence."""
from .catalog import SpeciesCatalog, SpeciesInfo
from .ranking import (
    DecisionPolicy,
    RankedCandidate,
    RankingConfig,
    RankingResult,
    ReferenceEvidence,
    identify_ambiguous_groups,
    rank_candidates,
)

__all__ = [
    "DecisionPolicy", "RankedCandidate", "RankingConfig", "RankingResult", "ReferenceEvidence",
    "SpeciesCatalog", "SpeciesInfo", "identify_ambiguous_groups", "rank_candidates",
]
