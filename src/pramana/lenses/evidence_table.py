"""Evidence Table Lens — always active, structured evidence tables."""

from collections import defaultdict

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence


class EvidenceTableLens(Lens):
    """Produces structured evidence tables organized by fact type."""

    name = "evidence_table"
    title = "Evidence Table"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Always active

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # Organize facts by type
        by_type: dict[str, list[dict]] = defaultdict(list)
        for fact in evidence.facts:
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            by_type[fact.fact_type].append({
                "content": canonical,
                "original": fact.content,
                "direct_quote": fact.direct_quote,
                "location": fact.location,
                "paper_title": fact.paper_title,
                "paper_id": fact.paper_id,
            })

        # Build summary stats
        total_facts = len(evidence.facts)
        papers_with_evidence = len({f.paper_id for f in evidence.facts if f.paper_id})
        fact_type_counts = {k: len(v) for k, v in by_type.items()}

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "tables": dict(by_type),
                "fact_type_counts": fact_type_counts,
                "total_facts": total_facts,
                "papers_with_evidence": papers_with_evidence,
            },
            summary=(
                f"Extracted {total_facts} facts from {papers_with_evidence} papers "
                f"across {len(by_type)} categories: {', '.join(sorted(by_type.keys()))}."
            ),
        )
