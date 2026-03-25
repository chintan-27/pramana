"""Evidence extraction — LLM-powered structured fact extraction from papers."""

import json
import logging
from collections.abc import Callable

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
    confidence: float = 0.0


def extract_evidence_from_text(
    text: str,
    title: str,
    hypothesis: str,
    settings: Settings,
    model: str | None = None,
    system_prompt: str | None = None,
) -> list[ExtractedFact]:
    """Extract structured evidence from paper text using LLM."""
    if not text or not text.strip():
        return []

    # Truncate if too long
    truncated = text[:MAX_TEXT_LENGTH]

    resolved_prompt = system_prompt or EVIDENCE_EXTRACTION_SYSTEM

    messages = [
        {"role": "system", "content": resolved_prompt},
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
        response_text = chat_json(messages, settings, model=model)
        data = json.loads(response_text)
        facts = []
        for fact_data in data.get("facts", []):
            # Enforce required fields
            if not fact_data.get("direct_quote") or not fact_data.get("location"):
                continue
            facts.append(ExtractedFact(
                fact_type=fact_data.get("fact_type", "unknown") or "unknown",
                content=fact_data.get("content", "") or "",
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
    progress_callback: Callable[[int, int, str], None] | None = None,
) -> list[ExtractedFact]:
    """Extract evidence from all papers in the corpus.

    progress_callback(current, total, paper_title) is called after each paper.
    """
    all_facts: list[ExtractedFact] = []
    hypothesis_text = " ".join(query.topics) if query.topics else ""

    active_papers = [p for p in corpus.papers if not p.get("screened_out")]
    total = len(active_papers)
    logger.info("Extracting evidence from %d papers", total)

    done = 0
    for paper in corpus.papers:
        # Skip screened-out papers
        if paper.get("screened_out"):
            logger.debug("Skipping screened-out paper: '%s'", paper.get("title", "")[:50])
            continue

        done += 1
        title = paper.get("title", "Unknown")

        # Use full text if available, fall back to abstract
        text = paper.get("full_text") or paper.get("abstract") or ""
        paper_db_id = paper.get("db_id")
        if progress_callback:
            progress_callback(done, total, title)

        if not text or not text.strip():
            continue

        # Use ensemble or single extractor
        if settings.ensemble_enabled:
            from pramana.pipeline.ensemble import ensemble_extract
            facts = ensemble_extract(text, title, hypothesis_text, settings)
        else:
            facts = extract_evidence_from_text(text, title, hypothesis_text, settings)

        # Apply confidence scoring
        from pramana.pipeline.confidence import (
            compute_confidence,
            score_quote_quality,
            venue_tier_boost,
        )
        paper_venue = (paper.get("venue") or "")
        v_boost = venue_tier_boost(paper_venue, settings)
        for fact in facts:
            quote_quality = score_quote_quality(
                direct_quote=fact.direct_quote,
                source_text=text,
                location=fact.location,
                content=fact.content,
            )
            # fact.confidence already set by ensemble (agreement), or 0.0 if single
            agreement = fact.confidence if settings.ensemble_enabled else None
            fact.confidence = compute_confidence(quote_quality, agreement, v_boost)

        logger.debug("Paper '%s': extracted %d facts", title[:50], len(facts))

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
                confidence=fact.confidence,
            )
            session.add(db_fact)
