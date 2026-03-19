"""TRACE/Ancestry Lens — methodological lineage and evolution."""

import json

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import TRACE_ANCESTRY_SYSTEM, TRACE_ANCESTRY_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence


class TraceAncestryLens(Lens):
    """Traces methodological ancestry and evolution across the corpus."""

    name = "trace_ancestry"
    title = "Methodological Ancestry"

    def should_activate(self, query: HypothesisQuery) -> bool:
        # Activate when we have temporal data to analyze
        return True

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        evidence_data = self._build_evidence_data(evidence, corpus)
        hypothesis_text = (
            " | ".join(query.topics) if query.topics else "General analysis"
        )

        rag_results = retrieve_relevant_evidence(hypothesis_text, settings)
        retrieved_context = format_retrieved_context(rag_results)

        years = [p.get("year") for p in corpus.papers if p.get("year")]
        date_range = f"{min(years)}-{max(years)}" if years else "unknown"

        messages = [
            {"role": "system", "content": TRACE_ANCESTRY_SYSTEM},
            {
                "role": "user",
                "content": TRACE_ANCESTRY_USER.format(
                    hypothesis=hypothesis_text,
                    evidence_data=evidence_data,
                    retrieved_context=retrieved_context,
                    total_papers=len(corpus.papers),
                    date_range=date_range,
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            data = json.loads(response)
            lineages = data.get("lineages", [])
            shifts = data.get("paradigm_shifts", [])
            frontier = data.get("current_frontier", [])
        except (json.JSONDecodeError, Exception):
            lineages = []
            shifts = []
            frontier = []

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "lineages": lineages,
                "paradigm_shifts": shifts,
                "current_frontier": frontier,
            },
            summary=(
                f"Traced {len(lineages)} method lineages, "
                f"{len(shifts)} paradigm shifts."
            ),
        )

    def _build_evidence_data(
        self, evidence: NormalizedEvidence, corpus: Corpus,
    ) -> str:
        """Build evidence data with temporal context."""
        year_map: dict[str, int] = {}
        for p in corpus.papers:
            title = p.get("title", "")
            year = p.get("year")
            if title and year:
                year_map[title] = year

        by_paper: dict[str, list[str]] = {}
        for fact in evidence.facts:
            canonical = evidence.canonical_mappings.get(
                fact.content, fact.content
            )
            paper = fact.paper_title or "Unknown"
            by_paper.setdefault(paper, []).append(
                f"[{fact.fact_type}] {canonical}"
            )

        lines = []
        for paper, facts in sorted(
            by_paper.items(), key=lambda x: year_map.get(x[0], 9999),
        ):
            year = year_map.get(paper, "?")
            lines.append(f"\n{paper} ({year}):")
            for f in facts[:10]:
                lines.append(f"  - {f}")

        return "\n".join(lines) if lines else "No evidence."
