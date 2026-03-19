"""Tests for PICO query expansion."""

from pramana.pipeline.hypothesis import (
    HypothesisQuery,
    PICOComponents,
    _pico_search_queries,
)


def test_pico_components_defaults():
    """PICOComponents has empty defaults."""
    pico = PICOComponents()
    assert pico.population == ""
    assert pico.intervention == ""
    assert pico.comparison == ""
    assert pico.outcome == ""


def test_hypothesis_query_has_pico():
    """HypothesisQuery includes a pico field."""
    q = HypothesisQuery(topics=["test"])
    assert isinstance(q.pico, PICOComponents)


def test_pico_search_queries_full():
    """PICO with all components generates queries."""
    pico = PICOComponents(
        population="diabetic patients",
        intervention="GLP-1 agonists",
        comparison="insulin therapy",
        outcome="HbA1c reduction",
    )
    queries = _pico_search_queries(pico)
    assert len(queries) >= 2
    # Should include combined P+I+O query
    assert any("diabetic patients" in q and "HbA1c" in q for q in queries)
    # Should include I vs C query
    assert any("vs" in q for q in queries)


def test_pico_search_queries_partial():
    """PICO with only intervention and outcome generates queries."""
    pico = PICOComponents(
        intervention="deep learning",
        outcome="accuracy improvement",
    )
    queries = _pico_search_queries(pico)
    assert len(queries) >= 1
    assert any("deep learning" in q and "accuracy" in q for q in queries)


def test_pico_search_queries_empty():
    """Empty PICO generates no queries."""
    pico = PICOComponents()
    queries = _pico_search_queries(pico)
    assert queries == []
