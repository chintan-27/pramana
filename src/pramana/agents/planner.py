"""Experiment Planner Agent — designs the analysis plan before execution.

Given a hypothesis and action prompt, the planner decides which pipeline steps
and analytical lenses to run, what code tasks to propose, and what the report
structure should look like.  The plan is shown to the user as a flowchart for
approval before the pipeline starts.
"""
from __future__ import annotations

import json
import logging

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import EXPERIMENT_PLANNER_SYSTEM

logger = logging.getLogger(__name__)

# Available lenses the planner can choose from
AVAILABLE_LENSES = [
    {"id": "find_gaps", "label": "Find research gaps",
     "detail": "Identify understudied areas and blind spots"},
    {"id": "find_contradictions", "label": "Map contradictions",
     "detail": "Detect conflicting claims across papers"},
    {"id": "verify_claim", "label": "Verify the hypothesis",
     "detail": "Check evidence for and against"},
    {"id": "write_lit_review", "label": "Write literature review",
     "detail": "Thematic synthesis with citations"},
    {"id": "analyze_statistics", "label": "Aggregate statistics",
     "detail": "Quantitative metrics across papers"},
    {"id": "map_knowledge", "label": "Build knowledge graph",
     "detail": "Cross-paper entity relationships"},
    {"id": "plan_research", "label": "Plan next research steps",
     "detail": "Concrete future research directions"},
    {"id": "write_proposal", "label": "Write grant proposal",
     "detail": "Research proposal with specific aims"},
    {"id": "detect_bias", "label": "Detect reporting biases",
     "detail": "Corpus-level bias and methodology issues"},
    {"id": "trace_methods", "label": "Trace method evolution",
     "detail": "Methodological lineage and paradigm shifts"},
    {"id": "check_replication", "label": "Check replication",
     "detail": "Classify findings as confirmed or challenged"},
    {"id": "evidence_table", "label": "Build evidence table",
     "detail": "Structured table of facts with quotes"},
]

# Fixed pipeline steps (always present)
FIXED_STEPS = [
    {"id": "fetch", "label": "Fetch papers",
     "detail": "Search arXiv, Semantic Scholar, PubMed, CrossRef",
     "type": "pipeline"},
    {"id": "screen", "label": "Screen for relevance",
     "detail": "Filter papers by hypothesis relevance",
     "type": "pipeline"},
    {"id": "extract", "label": "Extract evidence",
     "detail": "Structured facts with direct quotes",
     "type": "pipeline"},
    {"id": "normalize", "label": "Normalize evidence",
     "detail": "Canonicalize datasets, metrics, methods",
     "type": "pipeline"},
]

FIXED_TAIL = [
    {"id": "design_report", "label": "Design report",
     "detail": "Agent structures sections around findings",
     "type": "agent"},
    {"id": "assemble", "label": "Assemble report",
     "detail": "Final rendering", "type": "pipeline"},
]


def plan_experiment(
    hypothesis: str,
    action: str,
    settings: Settings,
) -> dict:
    """Use the LLM to design an experiment plan before execution.

    Returns a plan dict with keys: steps, reasoning.
    """
    lens_list = "\n".join(
        f"- {ln['id']}: {ln['label']} — {ln['detail']}"
        for ln in AVAILABLE_LENSES
    )

    messages = [
        {"role": "system", "content": EXPERIMENT_PLANNER_SYSTEM},
        {
            "role": "user",
            "content": (
                f"Hypothesis: {hypothesis}\n\n"
                f"User's goal: {action or 'comprehensive research analysis'}\n\n"
                f"Available analytical lenses:\n{lens_list}\n\n"
                "Design the experiment plan. Remember: every label and "
                "detail must be specific to this hypothesis, not generic."
            ),
        },
    ]

    logger.info("Planner agent: designing experiment for '%s'", hypothesis[:60])

    try:
        raw = chat_json(messages, settings, max_tokens=2048)
        plan = json.loads(raw)
    except Exception as e:
        logger.error("Planner agent failed: %s", e)
        return _fallback_plan(action)

    # Validate and normalize
    raw_lenses = plan.get("lenses", [])
    code_tasks = plan.get("code_tasks", [])
    reasoning = plan.get("reasoning", "")

    # Build the full step list: fixed head + lenses + code + fixed tail
    steps = list(FIXED_STEPS)

    # Lenses: may be list of strings (old format) or list of dicts (new)
    for item in raw_lenses:
        if isinstance(item, str):
            # Old format: just an ID — look up from catalog
            lens_info = next(
                (ln for ln in AVAILABLE_LENSES if ln["id"] == item),
                None,
            )
            if lens_info:
                steps.append({
                    "id": item,
                    "label": lens_info["label"],
                    "detail": lens_info["detail"],
                    "type": "lens",
                })
        elif isinstance(item, dict) and "id" in item:
            # New format: dict with custom label/detail
            lens_id = item["id"]
            # Verify it's a valid lens
            valid = any(ln["id"] == lens_id for ln in AVAILABLE_LENSES)
            if valid:
                catalog = next(
                    ln for ln in AVAILABLE_LENSES if ln["id"] == lens_id
                )
                steps.append({
                    "id": lens_id,
                    "label": item.get("label") or catalog["label"],
                    "detail": item.get("detail") or catalog["detail"],
                    "type": "lens",
                })

    for i, ct in enumerate(code_tasks):
        steps.append({
            "id": f"code_task_{i + 1}",
            "label": ct.get("label", f"Code task {i + 1}"),
            "detail": ct.get("detail", "Computational analysis"),
            "type": "code",
        })

    steps.extend(FIXED_TAIL)

    result = {"steps": steps, "reasoning": reasoning}
    logger.info(
        "Plan: %d steps (%d lenses, %d code tasks)",
        len(steps), len(raw_lenses), len(code_tasks),
    )
    return result


def _fallback_plan(action: str) -> dict:
    """Return a sensible default plan when the planner LLM fails."""
    steps = list(FIXED_STEPS)
    # Default lenses based on common use
    defaults = ["verify_claim", "find_gaps", "evidence_table"]
    for lens_id in defaults:
        lens_info = next(
            (ln for ln in AVAILABLE_LENSES if ln["id"] == lens_id), None
        )
        if lens_info:
            steps.append({
                "id": lens_id,
                "label": lens_info["label"],
                "detail": lens_info["detail"],
                "type": "lens",
            })
    steps.extend(FIXED_TAIL)
    return {
        "steps": steps,
        "reasoning": (
            "Default plan — planner could not generate a custom plan. "
            "Using verify_claim + find_gaps + evidence_table."
        ),
    }
