"""Claim Verification Lens — verifies a specific claim against the literature."""

import json
import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import CLAIM_VERIFICATION_SYSTEM, CLAIM_VERIFICATION_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence

logger = logging.getLogger(__name__)


class ClaimVerificationLens(Lens):
    """Verifies a claim against corpus evidence, returning a supported/refuted verdict."""

    name = "claim_verification"
    title = "Claim Verification"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return query.initiation_context == "verify"

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # The original hypothesis is the claim to verify
        claim = " ".join(query.topics) or " ".join(query.domains)

        # Build evidence summary
        lines = []
        for f in evidence.facts[:60]:
            paper = f.paper_title or f"paper_{f.paper_id}"
            lines.append(f"[{f.fact_type}] ({paper}): {f.content}")
            if f.direct_quote:
                lines.append(f'  Quote: "{f.direct_quote[:150]}"')
        evidence_summary = "\n".join(lines) if lines else "No evidence extracted."

        # RAG retrieval
        try:
            rag_results = retrieve_relevant_evidence(claim, settings, n_results=15)
            retrieved_context = format_retrieved_context(rag_results, max_chars=4000)
        except Exception:
            retrieved_context = ""

        active_papers = [p for p in corpus.papers if not p.get("screened_out")]

        try:
            messages = [
                {"role": "system", "content": CLAIM_VERIFICATION_SYSTEM},
                {
                    "role": "user",
                    "content": CLAIM_VERIFICATION_USER.format(
                        claim=claim,
                        evidence_summary=evidence_summary[:6000],
                        retrieved_context=retrieved_context,
                        total_papers=len(active_papers),
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("ClaimVerificationLens LLM call failed: %s", e)
            data = {
                "verdict": "insufficient",
                "confidence": 0.0,
                "supporting_facts": [],
                "refuting_facts": [],
                "summary": f"Verification failed: {e}",
            }

        verdict = data.get("verdict", "insufficient")
        confidence = float(data.get("confidence", 0.0))
        summary = data.get("summary") or (
            f"Verdict: {verdict} (confidence: {confidence:.0%}) based on "
            f"{len(active_papers)} papers."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "verdict": verdict,
                "confidence": confidence,
                "supporting_facts": data.get("supporting_facts", []),
                "refuting_facts": data.get("refuting_facts", []),
                "papers_analyzed": len(active_papers),
            },
            summary=summary,
        )
