"""Tests for ensemble extraction."""

import json
from unittest.mock import patch

from pramana.pipeline.ensemble import (
    ensemble_extract,
    fuzzy_match_facts,
    merge_results,
)
from pramana.pipeline.extraction import ExtractedFact


def _make_fact(content, quote, location="Section 1", fact_type="finding"):
    return ExtractedFact(
        fact_type=fact_type,
        content=content,
        direct_quote=quote,
        location=location,
    )


def test_fuzzy_match_facts_identical():
    """Identical quotes match with ratio 1.0."""
    a = _make_fact("Finding A", "We found that X improves Y")
    b = _make_fact("Finding A alt", "We found that X improves Y")
    ratio = fuzzy_match_facts(a, b)
    assert ratio == 1.0


def test_fuzzy_match_facts_similar():
    """Similar quotes match above threshold."""
    a = _make_fact("Finding", "We evaluated on ImageNet-1K with ResNet-50")
    b = _make_fact("Finding", "We evaluated on ImageNet-1k using ResNet-50")
    ratio = fuzzy_match_facts(a, b)
    assert ratio >= 0.7


def test_fuzzy_match_facts_different():
    """Different quotes score below threshold."""
    a = _make_fact("Finding A", "CIFAR-10 was used for training the model")
    b = _make_fact("Finding B", "The drug showed efficacy in Phase 3 trials")
    ratio = fuzzy_match_facts(a, b)
    assert ratio < 0.7


def test_merge_results_matched():
    """Matched facts get agreement=1.0."""
    facts_a = [_make_fact("Finding", "We found X improves Y by 20%")]
    facts_b = [_make_fact("Finding alt", "We found X improves Y by 20%")]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 1
    assert merged[0].confidence == 1.0  # agreement for matched


def test_merge_results_unmatched():
    """Unmatched facts get agreement=0.3."""
    facts_a = [_make_fact("Finding A", "X is true")]
    facts_b = [_make_fact("Finding B", "Y is completely different")]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 2  # Both kept
    assert all(f.confidence == 0.3 for f in merged)


def test_merge_results_mixed():
    """Mix of matched and unmatched facts."""
    facts_a = [
        _make_fact("Matched", "We found X improves Y"),
        _make_fact("Only A", "CIFAR-10 was used"),
    ]
    facts_b = [
        _make_fact("Matched alt", "We found X improves Y"),
        _make_fact("Only B", "Phase 3 trial results"),
    ]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 3  # 1 matched + 2 unmatched
    confidences = sorted([f.confidence for f in merged])
    assert confidences == [0.3, 0.3, 1.0]


@patch("pramana.pipeline.ensemble.extract_evidence_from_text")
def test_ensemble_extract_calls_twice(mock_extract, settings):
    """Ensemble extract calls extract_evidence_from_text twice."""
    mock_extract.return_value = [_make_fact("F", "Quote")]
    result = ensemble_extract("text", "title", "hypothesis", settings)
    assert mock_extract.call_count == 2
    assert len(result) >= 1


@patch("pramana.pipeline.extraction.extract_evidence_from_text")
def test_ensemble_disabled_single_extractor(mock_ext, settings):
    """When ensemble_enabled=False, extract_all_evidence uses single extractor."""
    from pramana.pipeline.corpus import Corpus
    from pramana.pipeline.hypothesis import HypothesisQuery

    settings.ensemble_enabled = False
    corpus = Corpus(papers=[
        {"title": "Test", "abstract": "Some text", "db_id": None},
    ])
    query = HypothesisQuery(topics=["test"])

    mock_ext.return_value = [_make_fact("F", "Quote")]
    from pramana.pipeline.extraction import extract_all_evidence
    result = extract_all_evidence(corpus, query, settings)
    # Single extractor called once (not ensemble's twice)
    assert mock_ext.call_count == 1


@patch("pramana.pipeline.extraction.extract_evidence_from_text")
def test_screened_out_papers_skipped(mock_ext, settings):
    """Papers with screened_out=True are skipped in extract_all_evidence."""
    from pramana.pipeline.corpus import Corpus
    from pramana.pipeline.hypothesis import HypothesisQuery

    settings.ensemble_enabled = False
    corpus = Corpus(papers=[
        {"title": "Included", "abstract": "Good paper", "db_id": None},
        {"title": "Excluded", "abstract": "Filtered out", "db_id": None, "screened_out": True},
    ])
    query = HypothesisQuery(topics=["test"])

    mock_ext.return_value = [_make_fact("F", "Quote")]
    from pramana.pipeline.extraction import extract_all_evidence
    result = extract_all_evidence(corpus, query, settings)
    # Only called once (screened-out paper skipped)
    assert mock_ext.call_count == 1
