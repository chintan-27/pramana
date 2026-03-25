"""Contradiction Detection Lens — surfaces opposing claims across papers."""

import json
import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import CONTRADICTION_SYSTEM, CONTRADICTION_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)


class ContradictionLens(Lens):
    """Identifies direct contradictions between papers in the corpus."""

    name = "contradiction"
    title = "Contradiction Detection"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Activated when enough facts exist (checked in analyze)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        relevant_facts = [
            f for f in evidence.facts
            if f.fact_type in ("finding", "metric", "method")
        ]

        if len(relevant_facts) < 4:
            return LensResult(
                lens_name=self.name,
                title=self.title,
                content={"contradictions": [], "total_contradictions": 0},
                summary="Insufficient facts for contradiction analysis (need ≥ 4).",
            )

        # Build a per-paper facts summary
        by_paper: dict[str, list[str]] = {}
        for f in relevant_facts:
            paper_key = f.paper_title or f"paper_{f.paper_id}"
            by_paper.setdefault(paper_key, []).append(
                f"[{f.fact_type}] {f.content}"
            )

        facts_by_paper = "\n\n".join(
            f"Paper: {paper}\n" + "\n".join(f"  - {fact}" for fact in facts[:10])
            for paper, facts in list(by_paper.items())[:20]
        )

        hypothesis_text = " ".join(query.topics) or " ".join(query.domains)

        try:
            messages = [
                {"role": "system", "content": CONTRADICTION_SYSTEM},
                {
                    "role": "user",
                    "content": CONTRADICTION_USER.format(
                        hypothesis=hypothesis_text,
                        facts_by_paper=facts_by_paper,
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("ContradictionLens LLM call failed: %s", e)
            data = {"contradictions": [], "total_contradictions": 0, "summary": ""}

        contradictions = data.get("contradictions", [])
        summary = data.get("summary") or (
            f"Found {len(contradictions)} contradiction(s) across {len(by_paper)} papers."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "contradictions": contradictions,
                "total_contradictions": len(contradictions),
                "papers_analyzed": len(by_paper),
            },
            summary=summary,
        )
