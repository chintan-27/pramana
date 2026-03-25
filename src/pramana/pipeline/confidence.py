"""Confidence scoring for extracted facts."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pramana.config import Settings


def score_quote_in_source(direct_quote: str, source_text: str) -> float:
    """Score how well the direct_quote appears in the source text.

    Returns 1.0 for verbatim match, proportional for near-matches,
    low for fabricated quotes.
    """
    if not direct_quote or not source_text:
        return 0.0

    quote_lower = direct_quote.lower().strip()
    source_lower = source_text.lower()

    # Exact substring match
    if quote_lower in source_lower:
        return 1.0

    # Sliding window fuzzy match — find best matching window in source
    quote_len = len(quote_lower)
    if quote_len == 0:
        return 0.0

    best_ratio = 0.0
    step = max(1, quote_len // 4)
    for i in range(0, max(1, len(source_lower) - quote_len + 1), step):
        window = source_lower[i:i + quote_len + 20]
        ratio = SequenceMatcher(None, quote_lower, window).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            if ratio >= 0.95:
                break

    return best_ratio


def score_location_specificity(location: str) -> float:
    """Score how specific the location reference is.

    Specific (page+section) = high, vague = low.
    """
    if not location:
        return 0.0

    loc_lower = location.lower().strip()
    score = 0.0

    if re.search(r'page\s*\d+|p\.\s*\d+|pp?\.\s*\d+', loc_lower):
        score += 0.5

    if re.search(r'section\s*[\d.]+|§\s*[\d.]+', loc_lower):
        score += 0.4

    if re.search(r'table\s*\d+|figure\s*\d+|fig\.\s*\d+', loc_lower):
        score += 0.3

    if re.search(r'abstract|introduction|conclusion|discussion|methods|results', loc_lower):
        score += 0.2

    return min(score, 1.0) if score > 0 else 0.1


def score_content_divergence(content: str, direct_quote: str) -> float:
    """Score how much the content diverges from the direct_quote.

    High divergence = good (LLM actually summarized).
    Low divergence = bad (LLM just echoed the quote).
    """
    if not content or not direct_quote:
        return 0.5

    ratio = SequenceMatcher(None, content.lower(), direct_quote.lower()).ratio()
    if ratio >= 0.9:
        return 0.1
    elif ratio >= 0.8:
        return 0.3
    elif ratio >= 0.5:
        return 0.7
    else:
        return 1.0


def score_quote_quality(
    direct_quote: str,
    source_text: str,
    location: str,
    content: str,
) -> float:
    """Compute combined quote quality score (0.0-1.0).

    Weighted: quote_in_source (0.4) + location_specificity (0.3) + content_divergence (0.3)
    """
    q_score = score_quote_in_source(direct_quote, source_text)
    l_score = score_location_specificity(location)
    d_score = score_content_divergence(content, direct_quote)
    return 0.4 * q_score + 0.3 * l_score + 0.3 * d_score


def venue_tier_boost(venue: str, settings: Settings | None = None) -> float:
    """Return a confidence boost based on venue tier.

    Tier 1: +0.10, Tier 2: +0.0, Tier 3: -0.05, Unknown: 0.0
    Matches venue name using case-insensitive substring matching.
    """
    if not venue or settings is None:
        return 0.0

    from pramana.models.database import get_session
    from pramana.models.schema import Venue

    venue_lower = venue.lower().strip()
    if not venue_lower:
        return 0.0

    try:
        with get_session(settings) as session:
            venues = session.query(Venue).all()
            for v in venues:
                v_name = (v.name or "").lower()
                if v_name and (v_name in venue_lower or venue_lower in v_name):
                    tier = v.tier or "3"
                    if tier == "1":
                        return 0.10
                    elif tier == "2":
                        return 0.0
                    else:
                        return -0.05
    except Exception:
        pass

    return 0.0


def compute_confidence(
    quote_quality: float,
    agreement: float | None = None,
    venue_boost: float = 0.0,
) -> float:
    """Compute final confidence score.

    Args:
        quote_quality: Quote quality score (0.0-1.0)
        agreement: Ensemble agreement score. None = ensemble disabled (default 0.7).
        venue_boost: Boost from venue tier (+0.10 for tier 1, -0.05 for tier 3).
    """
    if agreement is None:
        agreement = 0.7
    base = 0.4 * quote_quality + 0.6 * agreement
    return max(0.0, min(1.0, base + venue_boost))
