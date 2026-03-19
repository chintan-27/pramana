"""Ensemble extraction — run multiple extractors and merge results."""

import logging
from difflib import SequenceMatcher

from pramana.config import Settings
from pramana.llm.prompts import (
    EVIDENCE_EXTRACTION_QUOTE_FIRST,
    EVIDENCE_EXTRACTION_SYSTEM,
)
from pramana.pipeline.extraction import ExtractedFact, extract_evidence_from_text
from pramana.pipeline.screening import resolve_model

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.7  # Minimum Levenshtein ratio for quote matching


def fuzzy_match_facts(a: ExtractedFact, b: ExtractedFact) -> float:
    """Compute fuzzy match ratio between two facts based on direct_quote."""
    if not a.direct_quote or not b.direct_quote:
        return 0.0
    return SequenceMatcher(
        None, a.direct_quote.lower(), b.direct_quote.lower()
    ).ratio()


def merge_results(
    facts_a: list[ExtractedFact],
    facts_b: list[ExtractedFact],
) -> list[ExtractedFact]:
    """Merge results from two extractors.

    Matched facts (quote overlap >= 0.7): agreement=1.0, keep best version.
    Unmatched facts: agreement=0.3, keep all.
    """
    merged: list[ExtractedFact] = []
    used_b: set[int] = set()

    for fact_a in facts_a:
        best_match_idx = -1
        best_ratio = 0.0

        for j, fact_b in enumerate(facts_b):
            if j in used_b:
                continue
            ratio = fuzzy_match_facts(fact_a, fact_b)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match_idx = j

        if best_ratio >= MATCH_THRESHOLD and best_match_idx >= 0:
            # Matched — pick the version with more specific location
            used_b.add(best_match_idx)
            fact_b = facts_b[best_match_idx]
            winner = _pick_better_fact(fact_a, fact_b)
            winner.confidence = 1.0  # High agreement
            merged.append(winner)
        else:
            # Unmatched from A
            fact_a.confidence = 0.3
            merged.append(fact_a)

    # Add unmatched facts from B
    for j, fact_b in enumerate(facts_b):
        if j not in used_b:
            fact_b.confidence = 0.3
            merged.append(fact_b)

    return merged


def _pick_better_fact(a: ExtractedFact, b: ExtractedFact) -> ExtractedFact:
    """Pick the better of two matching facts.

    Prefers more specific location and longer content.
    """
    # Simple heuristic: longer location string is usually more specific
    a_loc_len = len(a.location)
    b_loc_len = len(b.location)

    if a_loc_len > b_loc_len:
        return a
    elif b_loc_len > a_loc_len:
        return b
    # Tie: prefer longer content (more detailed summary)
    return a if len(a.content) >= len(b.content) else b


def ensemble_extract(
    text: str,
    title: str,
    hypothesis: str,
    settings: Settings,
) -> list[ExtractedFact]:
    """Run ensemble extraction with two prompt strategies.

    Extractor A: Fact-focused (default prompt).
    Extractor B: Quote-first (alternative prompt).
    """
    models = settings.ensemble_models or []
    model_a = resolve_model(models[0] if len(models) > 0 else "", settings)
    model_b = resolve_model(models[1] if len(models) > 1 else "", settings)

    logger.info("Ensemble: extracting from '%s' (models: %s, %s)", title[:50], model_a, model_b)

    # Extractor A — fact-focused (default prompt)
    facts_a = extract_evidence_from_text(
        text, title, hypothesis, settings,
        model=model_a,
        system_prompt=EVIDENCE_EXTRACTION_SYSTEM,
    )
    logger.debug("Extractor A: %d facts", len(facts_a))

    # Extractor B — quote-first
    facts_b = extract_evidence_from_text(
        text, title, hypothesis, settings,
        model=model_b,
        system_prompt=EVIDENCE_EXTRACTION_QUOTE_FIRST,
    )
    logger.debug("Extractor B: %d facts", len(facts_b))

    # Merge
    merged = merge_results(facts_a, facts_b)
    logger.info("Ensemble merged: %d facts (%d matched, %d unique)",
                len(merged),
                sum(1 for f in merged if f.confidence == 1.0),
                sum(1 for f in merged if f.confidence == 0.3))

    return merged
