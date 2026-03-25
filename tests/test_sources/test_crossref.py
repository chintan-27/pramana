"""Tests for CrossRef source."""

from unittest.mock import MagicMock, patch

import pytest

from pramana.sources.crossref import search_papers, _normalize


def _make_item(title="Test Paper", doi="10.1234/test", year=2023,
               container="Nature", authors=None, abstract="A study."):
    return {
        "title": [title],
        "DOI": doi,
        "author": authors or [{"given": "Jane", "family": "Doe"}],
        "published": {"date-parts": [[year]]},
        "container-title": [container],
        "abstract": abstract,
        "URL": f"https://doi.org/{doi}",
    }


def test_normalize_basic():
    item = _make_item()
    paper = _normalize(item)
    assert paper is not None
    assert paper["title"] == "Test Paper"
    assert paper["doi"] == "10.1234/test"
    assert paper["year"] == 2023
    assert paper["venue"] == "Nature"
    assert paper["authors"] == ["Jane Doe"]
    assert paper["abstract"] == "A study."
    assert paper["source"] == "crossref"


def test_normalize_strips_jats_xml():
    item = _make_item(abstract="<jats:p>This is <jats:italic>important</jats:italic>.</jats:p>")
    paper = _normalize(item)
    assert "<" not in paper["abstract"]
    assert "important" in paper["abstract"]


def test_normalize_missing_title_returns_none():
    item = _make_item()
    item["title"] = []
    assert _normalize(item) is None


def test_normalize_no_authors():
    item = _make_item()
    item["author"] = []  # Override directly to avoid the `or` default
    paper = _normalize(item)
    assert paper["authors"] == []


def test_search_papers_returns_list(monkeypatch):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "message": {"items": [_make_item(), _make_item(title="Second", doi="10.1234/two")]}
    }
    mock_response.raise_for_status = MagicMock()

    with patch("pramana.sources.crossref.httpx.get", return_value=mock_response):
        results = search_papers("machine learning", max_results=5)

    assert len(results) == 2
    assert results[0]["title"] == "Test Paper"


def test_search_papers_http_error_returns_empty():
    with patch("pramana.sources.crossref.httpx.get", side_effect=Exception("timeout")):
        results = search_papers("any query")
    assert results == []
