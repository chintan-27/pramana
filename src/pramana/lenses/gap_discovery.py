"""Gap Discovery Lens — identify underreported areas and blind spots."""

import json

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import GAP_DISCOVERY_SYSTEM, GAP_DISCOVERY_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence


class GapDiscoveryLens(Lens):
    """Identifies gaps, blind spots, and underexplored areas in the evidence."""

    name = "gap_discovery"
    title = "Gap Discovery"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Always active — core value proposition

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # Build evidence summary for LLM
        evidence_summary = self._build_summary(evidence)
        hypothesis_text = " | ".join(query.topics) if query.topics else "General analysis"

        # RAG: retrieve semantically relevant evidence
        rag_results = retrieve_relevant_evidence(hypothesis_text, settings)
        retrieved_context = format_retrieved_context(rag_results)

        years = [p.get("year") for p in corpus.papers if p.get("year")]
        date_range = f"{min(years)}-{max(years)}" if years else "unknown"

        messages = [
            {"role": "system", "content": GAP_DISCOVERY_SYSTEM},
            {
                "role": "user",
                "content": GAP_DISCOVERY_USER.format(
                    hypothesis=hypothesis_text,
                    evidence_summary=evidence_summary,
                    retrieved_context=retrieved_context,
                    total_papers=len(corpus.papers),
                    date_range=date_range,
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            data = json.loads(response)
            gaps = data.get("gaps", [])
        except (json.JSONDecodeError, Exception):
            gaps = []

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={"gaps": gaps},
            summary=f"Identified {len(gaps)} gaps in the evidence corpus.",
        )

    def _build_summary(self, evidence: NormalizedEvidence) -> str:
        """Build a text summary of evidence for the LLM."""
        lines = []
        type_counts: dict[str, int] = {}
        for fact in evidence.facts:
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            type_counts.setdefault(fact.fact_type, 0)
            type_counts[fact.fact_type] += 1

        for ft, count in sorted(type_counts.items()):
            lines.append(f"- {ft}: {count} facts extracted")

        # List unique canonical terms per type
        by_type: dict[str, set[str]] = {}
        for fact in evidence.facts:
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            by_type.setdefault(fact.fact_type, set()).add(canonical)

        for ft, terms in sorted(by_type.items()):
            top_terms = sorted(terms)[:10]
            lines.append(f"  {ft} terms: {', '.join(top_terms)}")

        return "\n".join(lines) if lines else "No evidence extracted."
