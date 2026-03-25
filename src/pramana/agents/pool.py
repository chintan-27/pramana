"""Expert pool — registry of domain-specialized agents and MoE execution."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from pramana.agents.base import Agent
from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)

# Registry: lens_name → list of agents (multiple experts for the same lens = ensemble)
_EXPERT_REGISTRY: dict[str, list[Agent]] = {}


def register_expert(lens_name: str, agent: Agent) -> None:
    """Register a domain-specialized agent for a given lens slot."""
    _EXPERT_REGISTRY.setdefault(lens_name, []).append(agent)


def get_experts(lens_name: str) -> list[Agent]:
    return _EXPERT_REGISTRY.get(lens_name, [])


def run_with_experts(
    lens: Lens,
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
) -> LensResult:
    """Run a lens, using domain-specialized expert agents when available.

    If multiple experts are registered for this lens:
    - Score each by activation_score(query)
    - Run all with score > 0 in parallel (thread pool)
    - Return the result from the highest-scoring expert
    If no experts registered, fall back to the base lens.
    """
    experts = [e for e in get_experts(lens.name) if isinstance(e, Agent)]

    if not experts:
        return lens.analyze(corpus, evidence, query, settings)

    # Score experts
    scored = [(e.activation_score(query), e) for e in experts]
    active = [(score, e) for score, e in scored if score > 0]

    if not active:
        return lens.analyze(corpus, evidence, query, settings)

    if len(active) == 1:
        return active[0][1].analyze(corpus, evidence, query, settings)

    # Multiple active experts — run in parallel and pick highest scorer
    best_score = max(s for s, _ in active)
    best_expert = next(e for s, e in active if s == best_score)

    logger.info(
        "MoE: %d experts active for lens '%s', using '%s' (score=%.2f)",
        len(active), lens.name, type(best_expert).__name__, best_score,
    )

    # Run the best expert (future: ensemble multiple)
    try:
        return best_expert.analyze(corpus, evidence, query, settings)
    except Exception as exc:
        logger.warning("Expert failed for '%s', falling back: %s", lens.name, exc)
        return lens.analyze(corpus, evidence, query, settings)


def run_parallel_experts(
    lenses: list[Lens],
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
    max_workers: int = 4,
) -> dict[str, LensResult]:
    """Run multiple lenses in parallel using thread pool, MoE routing per lens.

    Returns dict of lens_name → LensResult.
    """
    results: dict[str, LensResult] = {}

    def _run_one(lens: Lens) -> tuple[str, LensResult]:
        result = run_with_experts(lens, corpus, evidence, query, settings)
        return lens.name, result

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_one, lens): lens for lens in lenses}
        for future in as_completed(futures):
            lens = futures[future]
            try:
                name, result = future.result()
                results[name] = result
                logger.info("Lens '%s' completed via MoE pool", name)
            except Exception as exc:
                logger.error("Lens '%s' failed in MoE pool: %s", lens.name, exc)
                results[lens.name] = LensResult(
                    lens_name=lens.name,
                    title=lens.title,
                    summary=f"Analysis failed: {exc}",
                )

    return results
