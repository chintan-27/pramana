"""Literature Review Lens — generates a Related Work section draft."""

import json
import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import LIT_REVIEW_SYSTEM, LIT_REVIEW_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)


class LitReviewLens(Lens):
    """Generates a draft Related Work / Literature Review section."""

    name = "lit_review"
    title = "Literature Review Draft"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Activated when enough papers exist (checked in analyze)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        active_papers = [p for p in corpus.papers if not p.get("screened_out")]

        if len(active_papers) < 3:
            return LensResult(
                lens_name=self.name,
                title=self.title,
                content={"draft": "", "themes": [], "citation_list": []},
                summary="Insufficient papers for literature review (need ≥ 3).",
            )

        # Build paper summaries with key facts
        paper_facts: dict[str, list[str]] = {}
        for f in evidence.facts:
            key = f.paper_title or f"paper_{f.paper_id}"
            paper_facts.setdefault(key, []).append(f.content)

        summaries = []
        for paper in active_papers[:20]:
            title = paper.get("title", "Unknown")
            authors = paper.get("authors", [])
            year = paper.get("year", "")
            author_str = authors[0].split()[-1] if authors else "Unknown"
            facts = paper_facts.get(title, [])[:3]
            facts_str = "; ".join(facts) if facts else paper.get("abstract", "")[:200]
            summaries.append(
                f"({author_str} et al., {year}) \"{title}\": {facts_str}"
            )

        hypothesis_text = " ".join(query.topics) or " ".join(query.domains)

        try:
            messages = [
                {"role": "system", "content": LIT_REVIEW_SYSTEM},
                {
                    "role": "user",
                    "content": LIT_REVIEW_USER.format(
                        hypothesis=hypothesis_text,
                        paper_summaries="\n\n".join(summaries),
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("LitReviewLens LLM call failed: %s", e)
            data = {"draft": "", "themes": [], "citation_list": []}

        draft = data.get("draft", "")
        themes = data.get("themes", [])
        summary = (
            f"Generated {len(draft.split())} word draft covering "
            f"{len(themes)} themes from {len(active_papers)} papers."
            if draft
            else "Could not generate literature review draft."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "draft": draft,
                "themes": themes,
                "citation_list": data.get("citation_list", []),
                "papers_included": len(active_papers),
            },
            summary=summary,
        )
