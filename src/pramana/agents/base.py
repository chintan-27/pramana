"""Base Agent — extends Lens with domain specialization and confidence scoring."""
from __future__ import annotations

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence


class Agent(Lens):
    """A Lens with domain-aware prompt injection and confidence output.

    Subclasses define `base_system_prompt` and optionally `domain_prompts`
    (a dict of domain keyword → extra system prompt text).

    The gating function `activation_score` returns a float [0, 1] indicating
    how strongly this agent should activate for the given query — used by the
    MoE orchestrator for weighted ensembling.
    """

    base_system_prompt: str = ""

    # domain keyword (lowercase) → additional system prompt text
    domain_prompts: dict[str, str] = {}

    def domain_system_prompt(self, query: HypothesisQuery) -> str:
        """Return the system prompt augmented with domain-specific context."""
        prompt = self.base_system_prompt
        domain = (query.declared_domain or " ".join(query.domains)).lower()
        for keyword, extra in self.domain_prompts.items():
            if keyword in domain:
                prompt = prompt + "\n\n" + extra
                break
        return prompt

    def activation_score(self, query: HypothesisQuery) -> float:
        """Return a confidence score [0, 1] for how relevant this agent is.

        Default: 1.0 if should_activate, else 0.0.
        Subclasses can return intermediate values for soft routing.
        """
        return 1.0 if self.should_activate(query) else 0.0

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        raise NotImplementedError
