"""Tests for Semantic Scholar API client."""

import json
from unittest.mock import patch, MagicMock

from pramana.sources.semantic_scholar import search_papers, get_paper_details


@patch("pramana.sources.semantic_scholar.httpx.get")
def test_search_papers(mock_get, settings):
    """search_papers returns structured paper data."""
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "data": [
                {
                    "paperId": "abc123",
                    "title": "Deep Learning in Medical Imaging",
                    "authors": [{"name": "Alice Smith"}],
                    "year": 2023,
                    "venue": "MICCAI",
                    "externalIds": {"DOI": "10.1234/test", "ArXiv": "2301.00001"},
                    "url": "https://www.semanticscholar.org/paper/abc123",
                    "abstract": "We present a deep learning approach...",
                    "citationCount": 42,
                }
            ]
        },
    )
    mock_get.return_value.raise_for_status = MagicMock()

    papers = search_papers("deep learning medical imaging", settings, limit=10)

    assert len(papers) == 1
    assert papers[0]["title"] == "Deep Learning in Medical Imaging"
    assert papers[0]["doi"] == "10.1234/test"
    assert papers[0]["arxiv_id"] == "2301.00001"
    assert papers[0]["authors"] == ["Alice Smith"]


@patch("pramana.sources.semantic_scholar.httpx.get")
def test_search_papers_empty(mock_get, settings):
    """search_papers handles empty results."""
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"data": []},
    )
    mock_get.return_value.raise_for_status = MagicMock()

    papers = search_papers("nonexistent topic xyz", settings)
    assert papers == []
