"""Tests for hybrid RAG scoring."""

from pramana.pipeline.rag import _hybrid_rerank, _keyword_score, _tokenize


def test_tokenize_basic():
    """Tokenizer handles mixed text."""
    tokens = _tokenize("Deep Learning for Medical Imaging")
    assert tokens == ["deep", "learning", "for", "medical", "imaging"]


def test_tokenize_special_chars():
    """Tokenizer handles punctuation and numbers."""
    tokens = _tokenize("ImageNet-1K, ResNet-50")
    assert "imagenet-1k" in tokens
    assert "resnet-50" in tokens


def test_keyword_score_full_match():
    """All query terms found in document scores 1.0."""
    query_tokens = _tokenize("deep learning imaging")
    score = _keyword_score(
        query_tokens, "deep learning for medical imaging applications"
    )
    assert score == 1.0


def test_keyword_score_no_match():
    """No keyword overlap scores zero."""
    query_tokens = _tokenize("deep learning imaging")
    score = _keyword_score(query_tokens, "cooking recipes for dinner")
    assert score == 0.0


def test_keyword_score_partial_match():
    """Partial match scores between 0 and 1."""
    query_tokens = _tokenize("deep learning imaging segmentation")
    score = _keyword_score(
        query_tokens, "deep learning for text classification"
    )
    assert 0.0 < score < 1.0


def test_hybrid_rerank_boosts_keyword_matches():
    """Hybrid re-ranking boosts results with keyword matches."""
    results = [
        {
            "id": "1",
            "text": "cooking recipes for dinner",
            "metadata": {},
            "distance": 0.7,
        },
        {
            "id": "2",
            "text": "deep learning for medical imaging segmentation",
            "metadata": {},
            "distance": 0.8,
        },
    ]
    reranked = _hybrid_rerank(results, "deep learning imaging")
    # Result 2 should be ranked first due to keyword boost
    # (similar vector distance but much better keyword match)
    assert reranked[0]["id"] == "2"


def test_hybrid_rerank_empty():
    """Empty results return empty."""
    assert _hybrid_rerank([], "query") == []


def test_keyword_score_empty_inputs():
    """Empty inputs score zero."""
    assert _keyword_score([], "some text") == 0.0
    assert _keyword_score(["token"], "") == 0.0
