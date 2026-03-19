"""Knowledge Graph Lens — cross-paper entity relationships."""

import json

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import KNOWLEDGE_GRAPH_SYSTEM, KNOWLEDGE_GRAPH_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence


class KnowledgeGraphLens(Lens):
    """Builds cross-paper knowledge graph of entity relationships."""

    name = "knowledge_graph"
    title = "Knowledge Graph"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        evidence_data = self._build_evidence_data(evidence)
        hypothesis_text = (
            " | ".join(query.topics) if query.topics else "General analysis"
        )

        rag_results = retrieve_relevant_evidence(hypothesis_text, settings)
        retrieved_context = format_retrieved_context(rag_results)

        messages = [
            {"role": "system", "content": KNOWLEDGE_GRAPH_SYSTEM},
            {
                "role": "user",
                "content": KNOWLEDGE_GRAPH_USER.format(
                    hypothesis=hypothesis_text,
                    evidence_data=evidence_data,
                    retrieved_context=retrieved_context,
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            data = json.loads(response)
            entities = data.get("entities", [])
            relationships = data.get("relationships", [])
        except (json.JSONDecodeError, Exception):
            entities = []
            relationships = []

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "entities": entities,
                "relationships": relationships,
            },
            summary=(
                f"Found {len(entities)} shared entities "
                f"and {len(relationships)} cross-paper relationships."
            ),
        )

    def _build_evidence_data(self, evidence: NormalizedEvidence) -> str:
        """Build structured evidence data for the LLM."""
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
        for paper, facts in sorted(by_paper.items()):
            lines.append(f"\n{paper}:")
            for f in facts[:10]:  # Cap per paper
                lines.append(f"  - {f}")

        return "\n".join(lines) if lines else "No evidence."
