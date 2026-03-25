"""Flow router — LLM agent that selects analysis flows from free-text action input."""
from __future__ import annotations

import json
import logging

from pramana.config import Settings
from pramana.flows.registry import Flow, all_flows, get_flow
from pramana.llm.client import chat_json
from pramana.llm.prompts import FLOW_ROUTING_SYSTEM, FLOW_ROUTING_USER
from pramana.pipeline.hypothesis import HypothesisQuery

logger = logging.getLogger(__name__)

_DEFAULT_FLOWS = ["gap_discovery", "meta_analysis", "research_planning"]


def select_flows(
    hypothesis_text: str,
    action: str,
    query: HypothesisQuery,
    settings: Settings,
) -> tuple[list[Flow], str]:
    """Use LLM to select analysis flows from hypothesis + free-text action.

    Returns (selected_flows, reasoning).
    """
    if not action.strip():
        flows = [f for f in [get_flow(n) for n in _DEFAULT_FLOWS] if f is not None]
        return flows, "Default analysis flows selected (no action specified)."

    catalog = "\n".join(
        f"- {f.name}: {f.description}"
        for f in all_flows()
    )

    try:
        messages = [
            {"role": "system", "content": FLOW_ROUTING_SYSTEM},
            {
                "role": "user",
                "content": FLOW_ROUTING_USER.format(
                    hypothesis=hypothesis_text,
                    action=action.strip(),
                    flow_catalog=catalog,
                ),
            },
        ]
        response = chat_json(messages, settings)
        data = json.loads(response)
        selected_names: list[str] = data.get("selected_flows", [])
        reasoning: str = data.get("reasoning", "")
    except Exception as e:
        logger.error("Flow router LLM call failed: %s", e)
        selected_names = _DEFAULT_FLOWS
        reasoning = f"Router failed ({e}), using defaults."

    flows: list[Flow] = []
    for name in selected_names:
        flow = get_flow(name)
        if flow:
            flows.append(flow)
        else:
            logger.warning("Router selected unknown flow '%s', skipping", name)

    if not flows:
        flows = [f for f in [get_flow(n) for n in _DEFAULT_FLOWS] if f is not None]
        reasoning = "No valid flows selected, using defaults."

    return flows, reasoning
