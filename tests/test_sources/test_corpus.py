"""Tests for corpus builder."""

from unittest.mock import patch

from pramana.pipeline.corpus import Corpus, _deduplicate, build_corpus
from pramana.pipeline.hypothesis import HypothesisQuery


def test_deduplicate_by_doi():
    """Deduplication removes papers with same DOI."""
    papers = [
        {"title": "Paper A", "doi": "10.1234/a", "arxiv_id": None},
        {"title": "Paper A (duplicate)", "doi": "10.1234/a", "arxiv_id": None},
        {"title": "Paper B", "doi": "10.1234/b", "arxiv_id": None},
    ]
    result = _deduplicate(papers)
    assert len(result) == 2


def test_deduplicate_by_arxiv_id():
    """Deduplication removes papers with same arXiv ID."""
    papers = [
        {"title": "Paper A", "doi": None, "arxiv_id": "2301.00001"},
        {"title": "Paper A v2", "doi": None, "arxiv_id": "2301.00001"},
    ]
    result = _deduplicate(papers)
    assert len(result) == 1


def test_deduplicate_by_title():
    """Deduplication removes papers with same title."""
    papers = [
        {"title": "Deep Learning in Medical Imaging", "doi": None, "arxiv_id": None},
        {"title": "deep learning in medical imaging", "doi": None, "arxiv_id": None},
    ]
    result = _deduplicate(papers)
    assert len(result) == 1


def test_corpus_model():
    """Corpus model works."""
    c = Corpus(papers=[{"title": "Test"}], total_from_s2=1)
    assert len(c.papers) == 1
    assert c.total_from_s2 == 1


@patch("pramana.pipeline.corpus.semantic_scholar.search_papers")
@patch("pramana.pipeline.corpus.arxiv.search_papers")
@patch("pramana.pipeline.corpus.pubmed.search_papers")
@patch("pramana.pipeline.corpus.crossref.search_papers")
@patch("pramana.pipeline.corpus.get_chroma_client")
def test_build_corpus(mock_chroma, mock_crossref, mock_pubmed, mock_arxiv, mock_s2, settings):
    """build_corpus orchestrates all sources."""
    mock_s2.return_value = [{"title": "S2 Paper", "doi": "10.1/s2", "arxiv_id": None, "pubmed_id": None, "s2_id": "s2_1", "authors": [], "year": 2023, "venue": "Test", "url": "", "abstract": "Test abstract"}]
    mock_arxiv.return_value = [{"title": "arXiv Paper", "doi": None, "arxiv_id": "2301.0001", "pubmed_id": None, "s2_id": None, "authors": [], "year": 2023, "venue": "arXiv", "url": "", "abstract": "Test", "pdf_url": ""}]
    mock_pubmed.return_value = [{"title": "PubMed Paper", "doi": "10.1/pm", "arxiv_id": None, "pubmed_id": "123", "s2_id": None, "authors": [], "year": 2023, "venue": "Radiology", "url": "", "abstract": "Test"}]
    mock_crossref.return_value = [{"title": "CrossRef Paper", "doi": "10.1/cr", "arxiv_id": None, "pubmed_id": None, "s2_id": None, "authors": [], "year": 2023, "venue": "Nature", "url": "", "abstract": "Test", "source": "crossref"}]

    mock_collection = type("MockCollection", (), {"upsert": lambda *a, **kw: None})()
    mock_client = type("MockClient", (), {"get_or_create_collection": lambda *a, **kw: mock_collection})()
    mock_chroma.return_value = mock_client

    query = HypothesisQuery(search_queries=["test query"])

    corpus = build_corpus(query, max_papers=10, settings=settings)

    assert corpus.total_from_s2 >= 1
    assert corpus.total_from_arxiv >= 1
    assert corpus.total_from_pubmed >= 1
    assert corpus.total_from_crossref >= 1
    assert len(corpus.papers) == 4
