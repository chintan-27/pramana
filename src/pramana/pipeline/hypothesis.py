"""Hypothesis parser — converts free-text hypothesis into structured query plan."""

import json

from pydantic import BaseModel

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import HYPOTHESIS_PARSING_SYSTEM, HYPOTHESIS_PARSING_USER


class PICOComponents(BaseModel):
    """PICO framework components extracted from a hypothesis."""

    population: str = ""
    intervention: str = ""
    comparison: str = ""
    outcome: str = ""


class HypothesisQuery(BaseModel):
    """Structured output from hypothesis parsing."""

    domains: list[str] = []
    topics: list[str] = []
    methods: list[str] = []
    evaluation_focus: list[str] = []
    search_queries: list[str] = []
    time_range: tuple[int, int] | None = None
    initiation_context: str = ""
    pico: PICOComponents = PICOComponents()
    declared_domain: str = ""  # User-declared domain (e.g., "Computer Science", "Economics")
    prior_research: str = ""  # Stored prior research text for lenses that need it
    hypothesis_text: str = ""  # Original raw hypothesis input from the user


def parse_hypothesis(
    hypothesis: str,
    initiation_type: str,
    settings: Settings,
    prior_research: str = "",
    declared_domain: str = "",
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

    # Handle PICO components
    pico_raw = data.pop("pico", {})
    if isinstance(pico_raw, dict):
        data["pico"] = PICOComponents(**pico_raw)
    else:
        data["pico"] = PICOComponents()

    query = HypothesisQuery(**data)
    query.declared_domain = declared_domain
    query.prior_research = prior_research
    # Claim verification mode: override initiation_context so ClaimVerificationLens activates
    if initiation_type == "verify":
        query.initiation_context = "verify"

    # Generate additional search queries from PICO components
    pico_queries = _pico_search_queries(query.pico)
    if pico_queries:
        existing = set(query.search_queries)
        for q in pico_queries:
            if q not in existing:
                query.search_queries.append(q)

    return query


def _pico_search_queries(pico: PICOComponents) -> list[str]:
    """Generate additional search queries from PICO components."""
    queries: list[str] = []
    parts = [
        p for p in [pico.population, pico.intervention, pico.outcome]
        if p
    ]
    if len(parts) >= 2:
        queries.append(" ".join(parts))
    if pico.intervention and pico.outcome:
        queries.append(f"{pico.intervention} {pico.outcome}")
    if pico.population and pico.intervention and pico.comparison:
        queries.append(
            f"{pico.population} {pico.intervention} vs {pico.comparison}"
        )
    return queries
