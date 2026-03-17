"""Evidence extraction — LLM-powered structured fact extraction from papers."""

import json
import logging

from pydantic import BaseModel

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import EVIDENCE_EXTRACTION_SYSTEM, EVIDENCE_EXTRACTION_USER
from pramana.models.database import get_session
from pramana.models.schema import ExtractedFact as ExtractedFactDB
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery

logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 15000  # Truncate paper text to fit context window


class ExtractedFact(BaseModel):
    """A single extracted fact from a paper."""

    fact_type: str
    content: str
    direct_quote: str
    location: str
    paper_id: int | None = None
    paper_title: str = ""


def extract_evidence_from_text(
    text: str,
    title: str,
    hypothesis: str,
    settings: Settings,
) -> list[ExtractedFact]:
    """Extract structured evidence from paper text using LLM."""
    if not text or not text.strip():
        return []

    # Truncate if too long
    truncated = text[:MAX_TEXT_LENGTH]

    messages = [
        {"role": "system", "content": EVIDENCE_EXTRACTION_SYSTEM},
        {
            "role": "user",
            "content": EVIDENCE_EXTRACTION_USER.format(
                hypothesis=hypothesis,
                title=title,
                text=truncated,
            ),
        },
    ]

    try:
        response_text = chat_json(messages, settings)
        data = json.loads(response_text)
        facts = []
        for fact_data in data.get("facts", []):
            # Enforce required fields
            if not fact_data.get("direct_quote") or not fact_data.get("location"):
                continue
            facts.append(ExtractedFact(
                fact_type=fact_data.get("fact_type", "unknown"),
                content=fact_data.get("content", ""),
                direct_quote=fact_data["direct_quote"],
                location=fact_data["location"],
                paper_title=title,
            ))
        return facts
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse extraction response for '{title}': {e}")
        return []


def extract_all_evidence(
    corpus: Corpus,
    query: HypothesisQuery,
    settings: Settings,
) -> list[ExtractedFact]:
    """Extract evidence from all papers in the corpus."""
    all_facts: list[ExtractedFact] = []
    hypothesis_text = " ".join(query.topics) if query.topics else ""

    for paper in corpus.papers:
        # Use full text if available, fall back to abstract
        text = paper.get("full_text") or paper.get("abstract", "")
        title = paper.get("title", "Unknown")
        paper_db_id = paper.get("db_id")

        if not text.strip():
            continue

        facts = extract_evidence_from_text(text, title, hypothesis_text, settings)

        # Store in database
        if paper_db_id and facts:
            _store_facts(facts, paper_db_id, settings)

        for fact in facts:
            fact.paper_id = paper_db_id
            fact.paper_title = title

        all_facts.extend(facts)

    return all_facts


def _store_facts(facts: list[ExtractedFact], paper_id: int, settings: Settings) -> None:
    """Store extracted facts in the database."""
    with get_session(settings) as session:
        for fact in facts:
            db_fact = ExtractedFactDB(
                paper_id=paper_id,
                fact_type=fact.fact_type,
                content=fact.content,
                direct_quote=fact.direct_quote,
                location=fact.location,
            )
            session.add(db_fact)
