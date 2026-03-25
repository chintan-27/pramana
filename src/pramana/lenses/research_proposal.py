"""Research Proposal Lens — generates a structured grant proposal outline."""

import json
import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import RESEARCH_PROPOSAL_SYSTEM, RESEARCH_PROPOSAL_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)


class ResearchProposalLens(Lens):
    """Generates a research proposal outline from hypothesis, gaps, and corpus."""

    name = "research_proposal"
    title = "Research Proposal Outline"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return query.initiation_context in ("new", "joining", "") or not query.initiation_context

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        active_papers = [p for p in corpus.papers if not p.get("screened_out")]

        # Collect gaps from GapDiscoveryLens if available (passed via evidence categories)
        gaps_text = "No gap analysis available."
        if hasattr(evidence, "_gap_summary"):
            gaps_text = evidence._gap_summary  # type: ignore[attr-defined]

        # Collect methods
        methods = [
            f.content for f in evidence.facts
            if f.fact_type == "method"
        ][:15]
        methods_text = "\n".join(f"- {m}" for m in methods) or "No methods extracted."

        # Paper summaries
        summaries = []
        for p in active_papers[:15]:
            title = p.get("title", "Unknown")
            year = p.get("year", "")
            authors = p.get("authors", [])
            author_str = authors[0].split()[-1] if authors else "Unknown"
            abstract = (p.get("abstract") or "")[:150]
            summaries.append(f"({author_str} et al., {year}) \"{title}\": {abstract}")

        hypothesis_text = " ".join(query.topics) or " ".join(query.domains)

        try:
            messages = [
                {"role": "system", "content": RESEARCH_PROPOSAL_SYSTEM},
                {
                    "role": "user",
                    "content": RESEARCH_PROPOSAL_USER.format(
                        hypothesis=hypothesis_text,
                        gaps=gaps_text,
                        methods=methods_text,
                        paper_summaries="\n\n".join(summaries),
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("ResearchProposalLens LLM call failed: %s", e)
            data = {
                "title": "", "background": "", "significance": "",
                "gap_statement": "", "aims": [], "methodology": "", "innovation": "",
            }

        aims = data.get("aims", [])
        summary = (
            f"Generated proposal outline: \"{data.get('title', 'Untitled')}\" "
            f"with {len(aims)} specific aims."
            if aims
            else "Could not generate proposal outline."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content=data,
            summary=summary,
        )
