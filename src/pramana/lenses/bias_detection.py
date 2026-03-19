"""Bias Detection Lens — identify reporting biases and blind spots."""

import json

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import BIAS_DETECTION_SYSTEM, BIAS_DETECTION_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence


class BiasDetectionLens(Lens):
    """Detects reporting biases and systematic blind spots in the corpus."""

    name = "bias_detection"
    title = "Bias Detection"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Always active — important for research integrity

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        evidence_summary = self._build_summary(evidence)
        hypothesis_text = (
            " | ".join(query.topics) if query.topics else "General analysis"
        )

        rag_results = retrieve_relevant_evidence(hypothesis_text, settings)
        retrieved_context = format_retrieved_context(rag_results)

        years = [p.get("year") for p in corpus.papers if p.get("year")]
        date_range = f"{min(years)}-{max(years)}" if years else "unknown"

        messages = [
            {"role": "system", "content": BIAS_DETECTION_SYSTEM},
            {
                "role": "user",
                "content": BIAS_DETECTION_USER.format(
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
            biases = data.get("biases", [])
        except (json.JSONDecodeError, Exception):
            biases = []

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={"biases": biases},
            summary=f"Identified {len(biases)} potential biases.",
        )

    def _build_summary(self, evidence: NormalizedEvidence) -> str:
        """Build evidence summary focusing on distribution patterns."""
        type_counts: dict[str, int] = {}
        by_type: dict[str, set[str]] = {}
        for fact in evidence.facts:
            canonical = evidence.canonical_mappings.get(
                fact.content, fact.content
            )
            type_counts[fact.fact_type] = type_counts.get(fact.fact_type, 0) + 1
            by_type.setdefault(fact.fact_type, set()).add(canonical)

        lines = []
        for ft, count in sorted(type_counts.items()):
            terms = sorted(by_type.get(ft, set()))[:10]
            lines.append(f"- {ft}: {count} facts ({', '.join(terms)})")

        return "\n".join(lines) if lines else "No evidence extracted."
