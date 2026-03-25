"""Research Assistant Orchestrator — selects and runs analytical lenses."""
from __future__ import annotations

import logging

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.lenses.bias_detection import BiasDetectionLens
from pramana.lenses.claim_verification import ClaimVerificationLens
from pramana.lenses.contradiction import ContradictionLens
from pramana.lenses.evidence_table import EvidenceTableLens
from pramana.lenses.gap_discovery import GapDiscoveryLens
from pramana.lenses.knowledge_graph import KnowledgeGraphLens
from pramana.lenses.lit_review import LitReviewLens
from pramana.lenses.meta_analysis import MetaAnalysisLens
from pramana.lenses.peer_review import PeerReviewLens
from pramana.lenses.replication import ReplicationLens
from pramana.lenses.research_planning import ResearchPlanningLens
from pramana.lenses.research_proposal import ResearchProposalLens
from pramana.lenses.statistical import StatisticalAggregationLens
from pramana.lenses.trace_ancestry import TraceAncestryLens
from pramana.lenses.venue_mapping import VenueMappingLens
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)

# All available lenses — order matters for default (non-flow) run
ALL_LENSES: list[Lens] = [
    EvidenceTableLens(),
    ClaimVerificationLens(),
    GapDiscoveryLens(),
    ContradictionLens(),
    ReplicationLens(),
    StatisticalAggregationLens(),
    BiasDetectionLens(),
    MetaAnalysisLens(),
    VenueMappingLens(),
    KnowledgeGraphLens(),
    TraceAncestryLens(),
    ResearchPlanningLens(),
    ResearchProposalLens(),
    LitReviewLens(),
    PeerReviewLens(),
]

# Lookup by name for flow execution
_LENS_BY_NAME: dict[str, Lens] = {lens.name: lens for lens in ALL_LENSES}


class FlowResult:
    """Results for a single analysis flow."""

    def __init__(self, flow_name: str, flow_title: str, description: str) -> None:
        self.flow_name = flow_name
        self.flow_title = flow_title
        self.description = description
        self.lens_results: list[LensResult] = []
        self.active_lenses: list[str] = []

    def add(self, result: LensResult) -> None:
        self.lens_results.append(result)
        self.active_lenses.append(result.lens_name)


class AnalysisResults:
    """Container for all lens results, optionally organized by flow."""

    def __init__(self) -> None:
        self.lens_results: list[LensResult] = []
        self.active_lenses: list[str] = []
        # Flow-level fields (populated when run_flows is used)
        self.flows: dict[str, FlowResult] = {}
        self.selected_flows: list[str] = []
        self.routing_reasoning: str = ""
        # Executive summary (populated by synthesize_summary)
        self.executive_summary: dict = {}

    def add(self, result: LensResult) -> None:
        if result.lens_name not in self.active_lenses:
            self.lens_results.append(result)
            self.active_lenses.append(result.lens_name)

    def get(self, lens_name: str) -> LensResult | None:
        for r in self.lens_results:
            if r.lens_name == lens_name:
                return r
        return None


def synthesize_summary(
    results: AnalysisResults,
    query: HypothesisQuery,
    settings: Settings,
) -> dict:
    """Run a single LLM call to produce an executive summary across all lens results."""
    import json as _json

    from pramana.llm.client import chat_json as _chat_json
    from pramana.llm.prompts import EXECUTIVE_SUMMARY_SYSTEM, EXECUTIVE_SUMMARY_USER

    hypothesis_text = " ".join(query.topics) or " ".join(query.domains) or query.initiation_context

    lines = []
    for r in results.lens_results:
        if r.summary and r.lens_name != "evidence_table":
            lines.append(f"[{r.title}] {r.summary}")

    if not lines:
        return {}

    try:
        messages = [
            {"role": "system", "content": EXECUTIVE_SUMMARY_SYSTEM},
            {
                "role": "user",
                "content": EXECUTIVE_SUMMARY_USER.format(
                    hypothesis=hypothesis_text,
                    summaries="\n".join(lines[:20]),
                ),
            },
        ]
        response = _chat_json(messages, settings)
        return _json.loads(response)
    except Exception as e:
        logger.warning("Executive summary failed: %s", e)
        return {}


def run_analysis(
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
) -> AnalysisResults:
    """Run all activated lenses (legacy flat execution, no flow routing)."""
    results = AnalysisResults()

    for lens in ALL_LENSES:
        if lens.should_activate(query):
            logger.info("Activating lens: %s", lens.name)
            try:
                result = lens.analyze(corpus, evidence, query, settings)
                results.add(result)
                logger.info("Lens '%s' completed: %s", lens.name, result.summary[:100])
            except Exception as e:
                logger.error("Lens '%s' failed: %s", lens.name, e, exc_info=True)
                results.add(LensResult(
                    lens_name=lens.name,
                    title=lens.title,
                    summary=f"Analysis failed: {e}",
                ))
        else:
            logger.debug("Skipping lens: %s (not activated)", lens.name)

    return results


def run_flows(
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
    flows: list,  # list[Flow] — avoid circular import by using list
    routing_reasoning: str = "",
) -> AnalysisResults:
    """Run selected analysis flows, sharing lens results across flows via cache."""
    results = AnalysisResults()
    results.selected_flows = [f.name for f in flows]
    results.routing_reasoning = routing_reasoning

    # Collect unique lens names needed across all flows, preserving order
    needed: list[str] = []
    seen: set[str] = set()
    for flow in flows:
        for ln in flow.lens_names:
            if ln not in seen:
                needed.append(ln)
                seen.add(ln)

    # Load expert pool (domain-specialized MoE agents)
    import pramana.agents.specialists  # noqa: F401 — triggers registration
    from pramana.agents.pool import run_parallel_experts

    # Collect active lens objects
    active_lenses: list[Lens] = []
    for lens_name in needed:
        lens = _LENS_BY_NAME.get(lens_name)
        if lens is None:
            logger.warning("Flow references unknown lens '%s', skipping", lens_name)
            continue
        if not lens.should_activate(query):
            logger.debug("Lens '%s' not activated for this query", lens_name)
            continue
        active_lenses.append(lens)

    logger.info(
        "Running %d lenses in parallel via MoE pool: %s",
        len(active_lenses), ", ".join(ln.name for ln in active_lenses),
    )

    # Run all lenses in parallel, MoE routing per lens
    parallel_results = run_parallel_experts(
        active_lenses, corpus, evidence, query, settings, max_workers=4
    )

    # Cache results in needed order
    lens_cache: dict[str, LensResult] = {}
    for lens_name in needed:
        if lens_name in parallel_results:
            result = parallel_results[lens_name]
            lens_cache[lens_name] = result
            results.add(result)
            logger.info("Lens '%s' done: %s", lens_name, result.summary[:100])

    # Organize results into per-flow buckets
    for flow in flows:
        flow_result = FlowResult(flow.name, flow.title, flow.description)
        for ln in flow.lens_names:
            if ln in lens_cache:
                flow_result.add(lens_cache[ln])
        results.flows[flow.name] = flow_result
        logger.info(
            "Flow '%s' assembled: %d lenses", flow.name, len(flow_result.lens_results)
        )

    return results
