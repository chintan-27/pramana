"""Flow registry — named analysis workflows composed of lens subsets."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Flow:
    """A named bundle of analytical lenses."""

    name: str
    title: str
    description: str
    lens_names: list[str] = field(default_factory=list)


_FLOW_REGISTRY: dict[str, Flow] = {}


def register_flow(flow: Flow) -> None:
    _FLOW_REGISTRY[flow.name] = flow


def get_flow(name: str) -> Flow | None:
    return _FLOW_REGISTRY.get(name)


def all_flows() -> list[Flow]:
    return list(_FLOW_REGISTRY.values())


def _build_registry() -> None:
    flows = [
        Flow(
            name="meta_analysis",
            title="Meta-Analysis",
            description=(
                "Quantitative synthesis: frequency stats, temporal trends, "
                "replication patterns, and statistical aggregation across papers"
            ),
            lens_names=[
                "evidence_table", "meta_analysis", "statistical_aggregation", "replication"
            ],
        ),
        Flow(
            name="lit_review",
            title="Literature Review Draft",
            description=(
                "Generate a structured Related Work section with in-text citations "
                "and thematic groupings"
            ),
            lens_names=["evidence_table", "lit_review"],
        ),
        Flow(
            name="gap_discovery",
            title="Gap Discovery",
            description=(
                "Identify research gaps, blind spots, underexplored areas, "
                "and reporting biases in the literature"
            ),
            lens_names=["evidence_table", "gap_discovery", "bias_detection"],
        ),
        Flow(
            name="systematic_review",
            title="Systematic Review",
            description=(
                "Comprehensive synthesis: evidence extraction, meta-analysis, "
                "gap identification, contradiction detection, and replication analysis"
            ),
            lens_names=[
                "evidence_table",
                "meta_analysis",
                "gap_discovery",
                "contradiction",
                "replication",
            ],
        ),
        Flow(
            name="claim_verification",
            title="Claim Verification",
            description=(
                "Verify a specific claim against the literature: "
                "supported, refuted, mixed, or insufficient evidence"
            ),
            lens_names=["evidence_table", "claim_verification"],
        ),
        Flow(
            name="grant_preparation",
            title="Grant Preparation",
            description=(
                "Generate a research proposal outline with specific aims, "
                "background, gap statement, and methodology sketch"
            ),
            lens_names=[
                "evidence_table", "gap_discovery", "research_planning", "research_proposal"
            ],
        ),
        Flow(
            name="peer_review",
            title="Peer Review",
            description=(
                "Review an uploaded draft paper: identify supported/unsupported claims, "
                "missing citations, and methodological concerns"
            ),
            lens_names=["evidence_table", "peer_review"],
        ),
        Flow(
            name="contradiction_analysis",
            title="Contradiction Analysis",
            description=(
                "Detect direct contradictions across papers and classify "
                "which findings have been replicated, challenged, or appear only once"
            ),
            lens_names=["evidence_table", "contradiction", "replication"],
        ),
        Flow(
            name="domain_survey",
            title="Domain Survey",
            description=(
                "Map where research is published, analyze venue patterns, "
                "and survey knowledge structures across the domain"
            ),
            lens_names=["evidence_table", "venue_mapping", "meta_analysis", "knowledge_graph"],
        ),
        Flow(
            name="trend_analysis",
            title="Trend Analysis",
            description=(
                "Trace methodological evolution, identify paradigm shifts, "
                "and characterize the current research frontier"
            ),
            lens_names=["evidence_table", "trace_ancestry", "meta_analysis"],
        ),
        Flow(
            name="bias_audit",
            title="Bias Audit",
            description=(
                "Identify corpus-level reporting biases: dataset concentration, "
                "methodological homogeneity, negative result absence, geographic concentration"
            ),
            lens_names=["evidence_table", "bias_detection"],
        ),
        Flow(
            name="knowledge_mapping",
            title="Knowledge Mapping",
            description=(
                "Build a cross-paper knowledge graph: shared entities, method evolution, "
                "conflicting findings, and venue-level patterns"
            ),
            lens_names=["evidence_table", "knowledge_graph", "venue_mapping"],
        ),
        Flow(
            name="research_planning",
            title="Research Planning",
            description=(
                "Identify underexplored directions, evaluation expectations, "
                "and design patterns for future research"
            ),
            lens_names=["evidence_table", "gap_discovery", "research_planning"],
        ),
    ]
    for flow in flows:
        register_flow(flow)


_build_registry()
