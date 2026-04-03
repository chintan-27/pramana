"""MCP tool implementations — wraps lenses and pipeline stages as callable tools.

Each tool function takes simple dict/string args and returns plain dicts.
The RunContext holds per-run state (corpus, evidence, query) so tools
can operate on the active analysis.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field

from pramana.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class RunContext:
    """Per-run state shared across tool calls."""

    hypothesis: str = ""
    action: str = ""
    settings: Settings | None = None
    corpus: object | None = None       # Corpus
    evidence: object | None = None     # NormalizedEvidence
    query: object | None = None        # HypothesisQuery
    _lock: threading.Lock = field(default_factory=threading.Lock)


# Global context store keyed by run_id
_contexts: dict[str, RunContext] = {}


def get_context(run_id: str) -> RunContext:
    if run_id not in _contexts:
        _contexts[run_id] = RunContext()
    return _contexts[run_id]


def set_context(
    run_id: str,
    hypothesis: str,
    action: str,
    settings: Settings,
    corpus: object,
    evidence: object,
    query: object,
) -> RunContext:
    ctx = RunContext(
        hypothesis=hypothesis,
        action=action,
        settings=settings,
        corpus=corpus,
        evidence=evidence,
        query=query,
    )
    _contexts[run_id] = ctx
    return ctx


def _run_lens(lens_name: str, ctx: RunContext) -> dict:
    """Run a single lens using the run context and return its content dict."""
    from pramana.pipeline.orchestrator import _LENS_BY_NAME

    lens = _LENS_BY_NAME.get(lens_name)
    if not lens:
        return {"error": f"Unknown lens: {lens_name}"}
    try:
        result = lens.analyze(ctx.corpus, ctx.evidence, ctx.query, ctx.settings)
        return {"lens": result.lens_name, "title": result.title,
                "summary": result.summary, "content": result.content}
    except Exception as e:
        logger.error("Lens %s failed: %s", lens_name, e)
        return {"error": str(e)}


# ── Individual tool functions (called by report designer via tool_use) ──


def tool_find_gaps(ctx: RunContext) -> dict:
    return _run_lens("gap_discovery", ctx)


def tool_find_contradictions(ctx: RunContext) -> dict:
    return _run_lens("contradiction", ctx)


def tool_write_lit_review(ctx: RunContext) -> dict:
    return _run_lens("lit_review", ctx)


def tool_verify_claim(ctx: RunContext) -> dict:
    return _run_lens("claim_verification", ctx)


def tool_analyze_statistics(ctx: RunContext) -> dict:
    return _run_lens("statistical_aggregation", ctx)


def tool_map_knowledge(ctx: RunContext) -> dict:
    return _run_lens("knowledge_graph", ctx)


def tool_plan_research(ctx: RunContext) -> dict:
    return _run_lens("research_planning", ctx)


def tool_write_proposal(ctx: RunContext) -> dict:
    return _run_lens("research_proposal", ctx)


def tool_detect_bias(ctx: RunContext) -> dict:
    return _run_lens("bias_detection", ctx)


def tool_review_paper(ctx: RunContext) -> dict:
    return _run_lens("peer_review", ctx)


def tool_trace_methods(ctx: RunContext) -> dict:
    return _run_lens("trace_ancestry", ctx)


def tool_check_replication(ctx: RunContext) -> dict:
    return _run_lens("replication", ctx)


def tool_aggregate_meta(ctx: RunContext) -> dict:
    return _run_lens("meta_analysis", ctx)


def tool_map_venues(ctx: RunContext) -> dict:
    return _run_lens("venue_mapping", ctx)


def tool_evidence_table(ctx: RunContext) -> dict:
    return _run_lens("evidence_table", ctx)


def tool_write_section(
    ctx: RunContext,
    title: str,
    instructions: str,
    data_summary: str = "",
) -> dict:
    """Write a custom narrative section using the LLM."""
    from pramana.llm.client import chat

    system = (
        "You are a scientific writer. Write a clear, evidence-grounded section "
        "for a research report. Use specific findings and cite paper titles when "
        "available. Be concise and direct."
    )
    user = f"Section title: {title}\n\nInstructions: {instructions}"
    if data_summary:
        user += f"\n\nData/evidence to incorporate:\n{data_summary}"

    text = chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        ctx.settings,
    )
    return {"title": title, "text": text}


def tool_generate_code_task(
    ctx: RunContext,
    task_title: str,
    task_description: str,
    language: str = "python",
) -> dict:
    """Generate executable code for a proposed research task."""
    from pramana.llm.client import chat

    system = (
        "You are a research automation engineer. Generate clean, runnable "
        f"{language} code for the described task. Include comments, error handling, "
        "and progress output. Use standard scientific libraries (numpy, pandas, "
        "scikit-learn, matplotlib, scipy, statsmodels). Output ONLY the code, "
        "no markdown fences."
    )
    user = f"Task: {task_title}\n\nDescription: {task_description}"

    code = chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        ctx.settings,
    )
    # Strip code fences if present
    if code.startswith("```"):
        lines = code.split("\n")
        lines = [ln for ln in lines if not ln.startswith("```")]
        code = "\n".join(lines)

    return {"title": task_title, "description": task_description,
            "code": code, "language": language}


# ── OpenAI-format tool definitions for the report designer agent ──

TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "find_gaps",
            "description": (
                "Identify research gaps, blind spots, "
                "and understudied areas in the literature."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_contradictions",
            "description": "Detect contradicting claims across papers.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_lit_review",
            "description": (
                "Generate a structured literature review "
                "with thematic groupings and citations."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_claim",
            "description": (
                "Check whether a specific claim is supported, "
                "refuted, or mixed in the literature."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_statistics",
            "description": (
                "Aggregate quantitative metrics across "
                "papers (means, ranges, distributions)."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "map_knowledge",
            "description": "Build a cross-paper knowledge graph of entities and relationships.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_research",
            "description": "Suggest concrete next-step research directions with design patterns.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_proposal",
            "description": "Generate a research/grant proposal outline with specific aims.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_bias",
            "description": "Identify corpus-level reporting biases and methodological homogeneity.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_paper",
            "description": (
                "Review the literature for supported/"
                "unsupported claims and methodological concerns."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trace_methods",
            "description": "Trace methodological evolution and identify paradigm shifts.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_replication",
            "description": "Classify findings as confirmed, challenged, or single-paper.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "aggregate_meta",
            "description": (
                "Quantitative meta-analysis: frequency stats, "
                "temporal trends, venue/term distributions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "map_venues",
            "description": "Map where research is published and analyze venue-level patterns.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "evidence_table",
            "description": "Build a structured table of all extracted facts with direct quotes.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_section",
            "description": "Write a custom narrative section for the report.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Section title"},
                    "instructions": {
                        "type": "string",
                        "description": "What this section should contain",
                    },
                    "data_summary": {
                        "type": "string",
                        "description": "Optional data/evidence to incorporate",
                    },
                },
                "required": ["title", "instructions"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_code_task",
            "description": "Generate executable code for a proposed research automation task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_title": {"type": "string", "description": "Task title"},
                    "task_description": {
                        "type": "string",
                        "description": "What the code should do",
                    },
                    "language": {
                        "type": "string",
                        "description": "Programming language",
                        "default": "python",
                    },
                },
                "required": ["task_title", "task_description"],
            },
        },
    },
]

# Map function names to callables (ctx is bound at dispatch time)
TOOL_DISPATCH_MAP: dict[str, str] = {
    "find_gaps": "tool_find_gaps",
    "find_contradictions": "tool_find_contradictions",
    "write_lit_review": "tool_write_lit_review",
    "verify_claim": "tool_verify_claim",
    "analyze_statistics": "tool_analyze_statistics",
    "map_knowledge": "tool_map_knowledge",
    "plan_research": "tool_plan_research",
    "write_proposal": "tool_write_proposal",
    "detect_bias": "tool_detect_bias",
    "review_paper": "tool_review_paper",
    "trace_methods": "tool_trace_methods",
    "check_replication": "tool_check_replication",
    "aggregate_meta": "tool_aggregate_meta",
    "map_venues": "tool_map_venues",
    "evidence_table": "tool_evidence_table",
    "write_section": "tool_write_section",
    "generate_code_task": "tool_generate_code_task",
}


def build_tool_dispatch(ctx: RunContext) -> dict:
    """Build a dispatch dict that binds the RunContext into each tool function."""
    import sys
    module = sys.modules[__name__]
    dispatch = {}
    for tool_name, fn_name in TOOL_DISPATCH_MAP.items():
        fn = getattr(module, fn_name)
        # Tools with extra params get ctx + kwargs; simple lens tools get just ctx
        if tool_name in ("write_section", "generate_code_task"):
            dispatch[tool_name] = lambda ctx=ctx, f=fn, **kw: f(ctx, **kw)
        else:
            dispatch[tool_name] = lambda ctx=ctx, f=fn, **kw: f(ctx)
    return dispatch
