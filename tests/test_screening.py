"""Tests for multi-stage screening pipeline."""

import json
from unittest.mock import MagicMock, patch

from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.screening import screen_corpus


def _make_corpus(papers):
    """Helper to create a Corpus with paper dicts."""
    return Corpus(papers=papers, total_from_s2=len(papers))


def _make_query(topics=None):
    return HypothesisQuery(
        domains=["biomedical engineering"],
        topics=topics or ["deep learning for medical imaging"],
        search_queries=["deep learning medical imaging"],
    )


@patch("pramana.pipeline.screening.get_paper_collection")
@patch("pramana.pipeline.screening.get_chroma_client")
@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_filters_irrelevant(mock_search, mock_chat, mock_client, mock_collection, settings):
    """Papers with high L2 distance are screened out by Gate 1."""
    settings.screening_enabled = True
    papers = [
        {"title": "Relevant paper", "abstract": "Deep learning for X-ray", "db_id": 1},
        {"title": "Irrelevant paper", "abstract": "Cooking recipes", "db_id": 2},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    # Gate 1: mock ChromaDB returning distances
    mock_search.return_value = {
        "ids": [["1", "2"]],
        "distances": [[0.5, 2.0]],  # paper 2 is far
        "documents": [["", ""]],
        "metadatas": [[{}, {}]],
    }

    # Gate 2: mock LLM saying relevant
    mock_chat.return_value = json.dumps({"relevant": True, "reason": "matches"})

    result = screen_corpus(corpus, query, settings)

    # Paper 2 should be screened out (distance 2.0 > threshold 1.5)
    assert result.papers[0].get("screened_out") is not True
    assert result.papers[1].get("screened_out") is True


@patch("pramana.pipeline.screening.get_paper_collection")
@patch("pramana.pipeline.screening.get_chroma_client")
@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate2_filters_by_llm(mock_search, mock_chat, mock_client, mock_collection, settings):
    """Gate 2 LLM check filters papers marked irrelevant."""
    settings.screening_enabled = True
    papers = [
        {"title": "Paper A", "abstract": "Abstract A", "db_id": 1},
        {"title": "Paper B", "abstract": "Abstract B", "db_id": 2},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    # Gate 1: both papers pass (low distance)
    mock_search.return_value = {
        "ids": [["1", "2"]],
        "distances": [[0.5, 0.8]],
        "documents": [["", ""]],
        "metadatas": [[{}, {}]],
    }

    # Gate 2: paper B is irrelevant
    mock_chat.side_effect = [
        json.dumps({"relevant": True, "reason": "matches hypothesis"}),
        json.dumps({"relevant": False, "reason": "off topic"}),
    ]

    result = screen_corpus(corpus, query, settings)

    assert result.papers[0].get("screened_out") is not True
    assert result.papers[1].get("screened_out") is True
    assert "off topic" in result.papers[1].get("screening_reason", "")


@patch("pramana.pipeline.screening.get_paper_collection")
@patch("pramana.pipeline.screening.get_chroma_client")
@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate1_fail_open(mock_search, mock_chat, mock_client, mock_collection, settings):
    """If ChromaDB fails, all papers pass through (fail-open)."""
    settings.screening_enabled = True
    papers = [
        {"title": "Paper A", "abstract": "Abstract A", "db_id": 1},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    mock_search.side_effect = Exception("ChromaDB unavailable")
    # Gate 2 should still run — mock it as relevant
    mock_chat.return_value = json.dumps({"relevant": True, "reason": "matches"})

    result = screen_corpus(corpus, query, settings)

    # Paper should NOT be screened out
    assert result.papers[0].get("screened_out") is not True


@patch("pramana.pipeline.screening.get_paper_collection")
@patch("pramana.pipeline.screening.get_chroma_client")
@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate2_fail_open(mock_search, mock_chat, mock_client, mock_collection, settings):
    """If LLM call fails in Gate 2, papers pass through (fail-open)."""
    settings.screening_enabled = True
    papers = [
        {"title": "Paper A", "abstract": "Abstract A", "db_id": 1},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    # Gate 1: paper passes
    mock_search.return_value = {
        "ids": [["1"]],
        "distances": [[0.5]],
        "documents": [[""]],
        "metadatas": [[{}]],
    }

    # Gate 2: LLM fails
    mock_chat.side_effect = Exception("LLM unavailable")

    result = screen_corpus(corpus, query, settings)

    # Paper should NOT be screened out (fail-open)
    assert result.papers[0].get("screened_out") is not True


def test_screen_corpus_disabled(settings):
    """When screening_enabled=False, no papers are screened."""
    settings.screening_enabled = False
    papers = [
        {"title": "Paper A", "abstract": "Abstract A", "db_id": 1},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    result = screen_corpus(corpus, query, settings)

    assert result.papers[0].get("screened_out") is not True
