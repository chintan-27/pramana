"""Meta-Analysis Lens — frequency stats, trends, concentration patterns."""

import json
from collections import Counter

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import META_ANALYSIS_SYSTEM, META_ANALYSIS_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

ACTIVATION_KEYWORDS = {"frequency", "trend", "rate", "prevalence", "common", "proportion", "how often"}


class MetaAnalysisLens(Lens):
    """Produces quantitative synthesis: frequencies, trends, concentration."""

    name = "meta_analysis"
    title = "Meta-Analysis"

    def should_activate(self, query: HypothesisQuery) -> bool:
        all_text = " ".join(query.topics + query.evaluation_focus).lower()
        return any(kw in all_text for kw in ACTIVATION_KEYWORDS)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # Compute basic statistics from evidence
        stats = self._compute_stats(corpus, evidence)

        # Use LLM for deeper synthesis
        hypothesis_text = " | ".join(query.topics) if query.topics else "General"
        messages = [
            {"role": "system", "content": META_ANALYSIS_SYSTEM},
            {
                "role": "user",
                "content": META_ANALYSIS_USER.format(
                    hypothesis=hypothesis_text,
                    evidence_data=json.dumps(stats, indent=2),
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            llm_analysis = json.loads(response)
        except (json.JSONDecodeError, Exception):
            llm_analysis = {}

        combined = {**stats, **llm_analysis}

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content=combined,
            summary=self._make_summary(stats),
        )

    def _compute_stats(self, corpus: Corpus, evidence: NormalizedEvidence) -> dict:
        """Compute basic frequency and distribution stats."""
        # Fact type distribution
        type_counter = Counter(f.fact_type for f in evidence.facts)

        # Canonical term frequency
        term_counter = Counter(
            evidence.canonical_mappings.get(f.content, f.content)
            for f in evidence.facts
        )

        # Year distribution
        year_counter = Counter(
            p.get("year") for p in corpus.papers if p.get("year")
        )

        # Venue distribution
        venue_counter = Counter(
            p.get("venue") for p in corpus.papers if p.get("venue")
        )

        return {
            "fact_type_distribution": dict(type_counter.most_common(20)),
            "top_terms": dict(term_counter.most_common(30)),
            "year_distribution": dict(sorted(year_counter.items())),
            "venue_distribution": dict(venue_counter.most_common(15)),
            "total_papers": len(corpus.papers),
            "total_facts": len(evidence.facts),
        }

    def _make_summary(self, stats: dict) -> str:
        top_terms = list(stats.get("top_terms", {}).items())[:5]
        term_str = ", ".join(f"{t} ({c})" for t, c in top_terms)
        return f"Analyzed {stats.get('total_facts', 0)} facts across {stats.get('total_papers', 0)} papers. Top terms: {term_str}."
