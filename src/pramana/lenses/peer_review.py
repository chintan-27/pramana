"""Peer Review Lens — reviews an uploaded draft against the literature corpus."""

import json
import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import PEER_REVIEW_SYSTEM, PEER_REVIEW_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence

logger = logging.getLogger(__name__)

_MIN_DRAFT_LENGTH = 500


class PeerReviewLens(Lens):
    """Compares an uploaded draft paper against the corpus for review feedback."""

    name = "peer_review"
    title = "Peer Review Feedback"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return len(query.prior_research or "") >= _MIN_DRAFT_LENGTH

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        draft_text = (query.prior_research or "")[:8000]

        # Build evidence summary
        lines = []
        for f in evidence.facts[:50]:
            paper = f.paper_title or f"paper_{f.paper_id}"
            lines.append(f"[{f.fact_type}] ({paper}): {f.content}")
        evidence_summary = "\n".join(lines) if lines else "No evidence extracted."

        # RAG: retrieve context relevant to the draft
        try:
            rag_results = retrieve_relevant_evidence(draft_text[:500], settings, n_results=15)
            retrieved_context = format_retrieved_context(rag_results, max_chars=3000)
        except Exception:
            retrieved_context = ""

        try:
            messages = [
                {"role": "system", "content": PEER_REVIEW_SYSTEM},
                {
                    "role": "user",
                    "content": PEER_REVIEW_USER.format(
                        draft_text=draft_text[:4000],
                        evidence_summary=evidence_summary[:4000],
                        retrieved_context=retrieved_context,
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("PeerReviewLens LLM call failed: %s", e)
            data = {
                "supported_claims": [],
                "unsupported_claims": [],
                "missing_citations": [],
                "methodological_concerns": [],
                "overall_assessment": f"Review failed: {e}",
            }

        supported = len(data.get("supported_claims", []))
        unsupported = len(data.get("unsupported_claims", []))
        concerns = len(data.get("methodological_concerns", []))
        summary = (
            f"{supported} supported claims, {unsupported} unsupported, "
            f"{concerns} methodological concern(s). "
            + (data.get("overall_assessment", "")[:150])
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content=data,
            summary=summary,
        )
