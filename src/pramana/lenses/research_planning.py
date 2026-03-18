"""Research Planning Lens — suggests directions and planning guidance."""

import json

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import RESEARCH_PLANNING_SYSTEM, RESEARCH_PLANNING_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence

ACTIVATION_TYPES = {"new", "joining"}


class ResearchPlanningLens(Lens):
    """Provides research planning guidance based on evidence gaps."""

    name = "research_planning"
    title = "Research Planning"

    def should_activate(self, query: HypothesisQuery) -> bool:
        # Activated for new projects or RA joining
        ctx = query.initiation_context.lower()
        return any(t in ctx for t in ACTIVATION_TYPES)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # Build evidence summary
        evidence_summary = self._summarize(evidence)
        hypothesis_text = " | ".join(query.topics) if query.topics else "General"

        # RAG: retrieve semantically relevant evidence
        rag_results = retrieve_relevant_evidence(hypothesis_text, settings)
        retrieved_context = format_retrieved_context(rag_results)

        messages = [
            {"role": "system", "content": RESEARCH_PLANNING_SYSTEM},
            {
                "role": "user",
                "content": RESEARCH_PLANNING_USER.format(
                    hypothesis=hypothesis_text,
                    initiation_type=query.initiation_context,
                    gaps="See evidence summary for patterns.",
                    evidence_summary=evidence_summary,
                    retrieved_context=retrieved_context,
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            data = json.loads(response)
        except (json.JSONDecodeError, Exception):
            data = {}

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content=data,
            summary=(
                f"Generated {len(data.get('directions', []))} research directions "
                f"and {len(data.get('recommendations', []))} recommendations."
            ),
        )

    def _summarize(self, evidence: NormalizedEvidence) -> str:
        """Brief summary of evidence for planning context."""
        from collections import Counter
        type_counts = Counter(f.fact_type for f in evidence.facts)
        term_counts = Counter(
            evidence.canonical_mappings.get(f.content, f.content)
            for f in evidence.facts
        )

        lines = [f"Total facts: {len(evidence.facts)}"]
        for ft, count in type_counts.most_common(10):
            lines.append(f"  {ft}: {count}")
        lines.append("Top terms:")
        for term, count in term_counts.most_common(15):
            lines.append(f"  {term}: {count}")
        return "\n".join(lines)
