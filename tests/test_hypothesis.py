"""Tests for hypothesis parsing."""

import json
from unittest.mock import MagicMock, patch

from pramana.pipeline.hypothesis import HypothesisQuery, parse_hypothesis


def test_hypothesis_query_model():
    """HypothesisQuery model validates correctly."""
    q = HypothesisQuery(
        domains=["biomedical engineering"],
        topics=["external validation", "deep learning"],
        methods=["CNN", "transfer learning"],
        evaluation_focus=["validation protocols"],
        search_queries=["external validation deep learning medical imaging"],
        time_range=(2018, 2024),
        initiation_context="New research project",
    )
    assert "biomedical engineering" in q.domains
    assert q.time_range == (2018, 2024)


def test_hypothesis_query_defaults():
    """HypothesisQuery has sensible defaults."""
    q = HypothesisQuery()
    assert q.domains == []
    assert q.time_range is None


@patch("pramana.pipeline.hypothesis.chat_json")
def test_parse_hypothesis(mock_chat, settings):
    """parse_hypothesis calls LLM and returns structured query."""
    mock_chat.return_value = json.dumps({
        "domains": ["biomedical engineering", "machine learning"],
        "topics": ["external validation", "deep learning", "medical imaging"],
        "methods": ["convolutional neural networks", "transfer learning"],
        "evaluation_focus": ["validation protocols", "generalizability"],
        "search_queries": [
            "external validation deep learning medical imaging",
            "generalizability CNN radiology",
            "multi-site validation clinical AI",
        ],
        "time_range": [2018, 2024],
        "initiation_context": "New research project exploring validation gaps in DL medical imaging",
    })

    result = parse_hypothesis(
        "External validation is rare in DL medical imaging",
        "new",
        settings,
    )

    assert isinstance(result, HypothesisQuery)
    assert "biomedical engineering" in result.domains
    assert len(result.search_queries) == 3
    assert result.time_range == (2018, 2024)
    mock_chat.assert_called_once()


@patch("pramana.pipeline.hypothesis.chat_json")
def test_parse_hypothesis_no_time_range(mock_chat, settings):
    """parse_hypothesis handles null time_range."""
    mock_chat.return_value = json.dumps({
        "domains": ["NLP"],
        "topics": ["benchmarking"],
        "methods": [],
        "evaluation_focus": ["dataset diversity"],
        "search_queries": ["NLP benchmark dataset diversity"],
        "time_range": None,
        "initiation_context": "Exploring dataset concentration",
    })

    result = parse_hypothesis("Certain datasets dominate NLP", "new", settings)
    assert result.time_range is None
    assert "NLP" in result.domains
