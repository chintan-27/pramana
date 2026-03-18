"""Hypothesis parser — converts free-text hypothesis into structured query plan."""

import json

from pydantic import BaseModel

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import HYPOTHESIS_PARSING_SYSTEM, HYPOTHESIS_PARSING_USER


class HypothesisQuery(BaseModel):
    """Structured output from hypothesis parsing."""

    domains: list[str] = []
    topics: list[str] = []
    methods: list[str] = []
    evaluation_focus: list[str] = []
    search_queries: list[str] = []
    time_range: tuple[int, int] | None = None
    initiation_context: str = ""


def parse_hypothesis(
    hypothesis: str,
    initiation_type: str,
    settings: Settings,
    prior_research: str = "",
) -> HypothesisQuery:
    """Parse a free-text hypothesis into a structured query plan using LLM."""
    prior_section = ""
    if prior_research and prior_research.strip():
        prior_section = (
            f"Prior research context provided by the user (use this to ground the "
            f"search queries and identify related/continuing work):\n\n"
            f"{prior_research.strip()[:5000]}\n"
        )

    messages = [
        {"role": "system", "content": HYPOTHESIS_PARSING_SYSTEM},
        {
            "role": "user",
            "content": HYPOTHESIS_PARSING_USER.format(
                hypothesis=hypothesis,
                initiation_type=initiation_type,
                prior_research_section=prior_section,
            ),
        },
    ]

    response_text = chat_json(messages, settings)
    data = json.loads(response_text)

    # Handle time_range which may come as list or null
    time_range = data.get("time_range")
    if isinstance(time_range, list) and len(time_range) == 2:
        data["time_range"] = tuple(time_range)
    else:
        data["time_range"] = None

    return HypothesisQuery(**data)
