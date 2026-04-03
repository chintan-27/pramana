"""Report Designer Agent — designs dynamic report structure using tool_use.

Instead of picking from fixed flows, this agent reads the user's action prompt
and evidence, then uses tool_use to call analysis tools and assemble a custom
report structure.
"""
from __future__ import annotations

import json
import logging

from pramana.config import Settings
from pramana.llm.client import chat_json, chat_with_tools
from pramana.llm.prompts import REPORT_DESIGNER_SYSTEM, REPORT_DESIGNER_USER
from pramana.mcp.tools import (
    TOOL_DEFINITIONS,
    build_tool_dispatch,
    set_context,
)
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)


def _build_evidence_summary(evidence: NormalizedEvidence, max_facts: int = 40) -> str:
    """Build a concise text summary of extracted evidence for context."""
    lines = []
    for f in evidence.facts[:max_facts]:
        paper = f.paper_title or f"paper_{f.paper_id}"
        lines.append(f"[{f.fact_type}] ({paper}): {f.content}")
    return "\n".join(lines) if lines else "No evidence extracted."


def design_report(
    hypothesis: str,
    action: str,
    corpus: Corpus,
    evidence: NormalizedEvidence,
    query: HypothesisQuery,
    settings: Settings,
    run_id: str = "default",
    feedback_summary: str = "",
) -> dict:
    """Use the report designer agent to create a dynamic report.

    Returns a dict with keys: title, reasoning, sections, tasks, executive_summary.
    """
    # Set up run context so tools can access corpus/evidence
    ctx = set_context(run_id, hypothesis, action, settings, corpus, evidence, query)

    # Build evidence summary for the agent
    active_papers = [p for p in corpus.papers if not p.get("screened_out")]
    ev_summary = _build_evidence_summary(evidence)

    tool_names = ", ".join(t["function"]["name"] for t in TOOL_DEFINITIONS)

    # Build feedback block for the prompt
    feedback_block = ""
    if feedback_summary:
        feedback_block = (
            "\nPrior feedback on reports for this hypothesis:\n"
            f"{feedback_summary}\n"
            "Use this to improve: avoid patterns rated <=2/5, "
            "expand patterns rated >=4/5.\n"
        )

    # Build messages
    messages = [
        {"role": "system", "content": REPORT_DESIGNER_SYSTEM},
        {
            "role": "user",
            "content": REPORT_DESIGNER_USER.format(
                hypothesis=hypothesis,
                action=action or "comprehensive research analysis",
                fact_count=len(evidence.facts),
                paper_count=len(active_papers),
                evidence_summary=ev_summary[:6000],
                tool_names=tool_names,
                feedback_block=feedback_block,
            ),
        },
    ]

    # Build tool dispatch (binds ctx into each tool function)
    dispatch = build_tool_dispatch(ctx)

    logger.info("Report designer agent starting (hypothesis=%s, action=%s)",
                hypothesis[:60], (action or "none")[:40])

    # Run the agent loop
    try:
        final_text = chat_with_tools(
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_dispatch=dispatch,
            settings=settings,
            max_rounds=12,
        )
    except Exception as e:
        logger.error("Report designer agent failed: %s", e)
        return _fallback_report(hypothesis, action)

    # Parse the agent's final JSON output
    report = _parse_agent_output(final_text)
    if not report:
        logger.warning("Agent output was not valid JSON, attempting extraction")
        report = _extract_json_from_text(final_text)

    if not report or "sections" not in report:
        logger.warning("Could not parse agent report, using fallback")
        return _fallback_report(hypothesis, action)

    # Ensure required fields
    report.setdefault("title", hypothesis[:100])
    report.setdefault("reasoning", "")
    report.setdefault("sections", [])
    report.setdefault("tasks", [])

    # Add section IDs if missing
    for i, sec in enumerate(report["sections"]):
        sec.setdefault("id", f"sec_{i + 1}")
        sec.setdefault("render_hint", _infer_render_hint(sec.get("type", "")))

    logger.info("Report designer produced %d sections, %d tasks",
                len(report["sections"]), len(report["tasks"]))

    return report


def _parse_agent_output(text: str) -> dict | None:
    """Try to parse the agent's output as JSON."""
    text = text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [ln for ln in lines if not ln.startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _extract_json_from_text(text: str) -> dict | None:
    """Try to extract a JSON object from mixed text."""
    # Find the first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return None


def _infer_render_hint(section_type: str) -> str:
    """Infer a render_hint from the section type."""
    mapping = {
        "narrative": "prose_card",
        "evidence": "fact_cards",
        "gaps": "gap_list",
        "contradictions": "comparison_grid",
        "statistics": "bar_chart",
        "proposal": "prose_card",
        "review": "prose_card",
        "tasks": "task_card",
        "table": "table",
    }
    return mapping.get(section_type, "prose_card")


def _fallback_report(hypothesis: str, action: str) -> dict:
    """Return a minimal fallback report when the agent fails."""
    return {
        "title": hypothesis[:100] if hypothesis else "Research Analysis",
        "reasoning": "Fallback report — agent could not produce a custom structure.",
        "sections": [
            {
                "id": "sec_fallback",
                "title": "Analysis Summary",
                "type": "narrative",
                "render_hint": "prose_card",
                "content": {
                    "text": (
                        f"The analysis examined: {hypothesis}\n\n"
                        f"Goal: {action or 'comprehensive analysis'}\n\n"
                        "The report designer could not produce a custom report. "
                        "Please try again or use a more specific action prompt."
                    ),
                },
            },
        ],
        "tasks": [],
    }


SECTION_REWRITE_PROMPT = """\
You are a research report editor. A code task was run and produced output. \
Rewrite the section content to incorporate the actual results.

Original section content:
{original_content}

Code task: {task_title}
Task output:
{task_output}

Rewrite the section content as JSON matching the render_hint "{render_hint}". \
Integrate the code results naturally. Output ONLY the JSON content object."""


def rewrite_section_with_results(
    section: dict,
    task_title: str,
    task_output: str,
    settings: Settings,
) -> dict | None:
    """Rewrite a report section incorporating code task results.

    Returns updated content dict, or None on failure.
    """
    prompt = SECTION_REWRITE_PROMPT.format(
        original_content=json.dumps(section.get("content", {}), indent=2)[:3000],
        task_title=task_title,
        task_output=task_output[:4000],
        render_hint=section.get("render_hint", "prose_card"),
    )

    try:
        result = chat_json(
            messages=[{"role": "user", "content": prompt}],
            settings=settings,
        )
        if isinstance(result, dict):
            return result
    except Exception as e:
        logger.error("Section rewrite failed: %s", e)

    return None
