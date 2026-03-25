"""Domain-specialized expert agents — MoE variants of core lenses."""
from __future__ import annotations

import json
import logging

from pramana.agents.base import Agent
from pramana.agents.domain_prompts import (
    BIOMEDICAL,
    COMPUTER_SCIENCE,
    ECONOMICS,
    SOCIAL_SCIENCE,
    get_domain_context,
)
from pramana.config import Settings
from pramana.lenses.base import LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import GAP_DISCOVERY_SYSTEM, GAP_DISCOVERY_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence

logger = logging.getLogger(__name__)


class DomainGapAgent(Agent):
    """Gap discovery expert with domain-specialized prompting."""

    name = "gap_discovery"
    title = "Gap Discovery"

    base_system_prompt = GAP_DISCOVERY_SYSTEM
    domain_prompts = {
        "biomedical": BIOMEDICAL,
        "clinical": BIOMEDICAL,
        "medical": BIOMEDICAL,
        "computer science": COMPUTER_SCIENCE,
        "machine learning": COMPUTER_SCIENCE,
        "economics": ECONOMICS,
        "social science": SOCIAL_SCIENCE,
        "psychology": SOCIAL_SCIENCE,
    }

    def activation_score(self, query: HypothesisQuery) -> float:
        domain = (query.declared_domain + " " + " ".join(query.domains)).lower()
        # Score higher when domain is well-known (we have specialized context)
        for keyword in self.domain_prompts:
            if keyword in domain:
                return 1.0
        return 0.8  # Still useful even without domain match

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        active_papers = [p for p in corpus.papers if not p.get("screened_out")]
        facts = evidence.facts

        lines = []
        for f in facts[:80]:
            paper = f.paper_title or f"paper_{f.paper_id}"
            lines.append(f"[{f.fact_type}] ({paper}): {f.content}")
        evidence_summary = "\n".join(lines) if lines else "No evidence extracted."

        try:
            rag_results = retrieve_relevant_evidence(
                " ".join(query.topics), settings, n_results=20
            )
            retrieved_context = format_retrieved_context(rag_results, max_chars=3000)
        except Exception:
            retrieved_context = ""

        years = [p.get("year") for p in active_papers if p.get("year")]
        date_range = f"{min(years)}–{max(years)}" if years else "unknown"

        # Domain-augmented system prompt
        domain_context = get_domain_context(query.declared_domain, query.domains)
        system_prompt = GAP_DISCOVERY_SYSTEM
        if domain_context:
            system_prompt = system_prompt + "\n\n" + domain_context

        hypothesis_text = " ".join(query.topics) or " ".join(query.domains)

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": GAP_DISCOVERY_USER.format(
                        hypothesis=hypothesis_text,
                        evidence_summary=evidence_summary[:5000],
                        retrieved_context=retrieved_context,
                        total_papers=len(active_papers),
                        date_range=date_range,
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("DomainGapAgent failed: %s", e)
            data = {"gaps": []}

        gaps = data.get("gaps", [])
        high = sum(1 for g in gaps if g.get("severity") == "high")
        med = sum(1 for g in gaps if g.get("severity") == "medium")
        domain_label = query.declared_domain or "general"

        # Store for ResearchProposalLens
        try:
            evidence._gap_summary = "\n".join(  # type: ignore[attr-defined]
                f"- [{g.get('severity','?')}] {g.get('description','')}"
                for g in gaps[:10]
            )
        except Exception:
            pass

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content=data,
            summary=(
                f"{len(gaps)} gaps identified ({high} high, {med} medium) "
                f"in {domain_label} literature."
            ),
        )


# ── Register all specialists on module import ──────────────────────────────

from pramana.agents.pool import register_expert  # noqa: E402

register_expert("gap_discovery", DomainGapAgent())
