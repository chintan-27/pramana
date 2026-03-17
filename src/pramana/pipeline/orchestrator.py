"""Research Assistant Orchestrator — selects and runs analytical lenses."""

import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.lenses.evidence_table import EvidenceTableLens
from pramana.lenses.gap_discovery import GapDiscoveryLens
from pramana.lenses.meta_analysis import MetaAnalysisLens
from pramana.lenses.research_planning import ResearchPlanningLens
from pramana.lenses.venue_mapping import VenueMappingLens
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)

# All available lenses in priority order
ALL_LENSES: list[Lens] = [
    EvidenceTableLens(),
    GapDiscoveryLens(),
    MetaAnalysisLens(),
    VenueMappingLens(),
    ResearchPlanningLens(),
]


class AnalysisResults:
    """Container for all lens results."""

    def __init__(self) -> None:
        self.lens_results: list[LensResult] = []
        self.active_lenses: list[str] = []

    def add(self, result: LensResult) -> None:
        self.lens_results.append(result)
        self.active_lenses.append(result.lens_name)

    def get(self, lens_name: str) -> LensResult | None:
        for r in self.lens_results:
            if r.lens_name == lens_name:
                return r
        return None


def run_analysis(
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
) -> AnalysisResults:
    """Run all activated lenses and return combined results."""
    results = AnalysisResults()

    for lens in ALL_LENSES:
        if lens.should_activate(query):
            logger.info(f"Activating lens: {lens.name}")
            try:
                result = lens.analyze(corpus, evidence, query, settings)
                results.add(result)
            except Exception as e:
                logger.error(f"Lens {lens.name} failed: {e}")
                results.add(LensResult(
                    lens_name=lens.name,
                    title=lens.title,
                    summary=f"Analysis failed: {e}",
                ))
        else:
            logger.info(f"Skipping lens: {lens.name} (not activated)")

    return results
