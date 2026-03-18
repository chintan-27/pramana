"""Tests for RAG retrieval and formatting."""

from unittest.mock import MagicMock, patch

from pramana.pipeline.rag import format_retrieved_context, retrieve_relevant_evidence


def _mock_chroma_results():
    """Sample ChromaDB query results."""
    return {
        "ids": [["fact_1_0", "fact_2_1"]],
        "documents": [
            [
                "dataset: ChestX-ray14. Quote: trained on ChestX-ray14",
                "metric: AUROC. Quote: reported AUROC of 0.92",
            ]
        ],
        "metadatas": [
            [
                {"fact_type": "dataset", "paper_id": 1, "paper_title": "Paper A", "location": "p.3"},
                {"fact_type": "metric", "paper_id": 2, "paper_title": "Paper B", "location": "p.6"},
            ]
        ],
        "distances": [[0.25, 0.42]],
    }


@patch("pramana.pipeline.rag.get_chroma_client")
@patch("pramana.pipeline.rag.get_evidence_collection")
@patch("pramana.pipeline.rag.search_evidence")
def test_retrieve_relevant_evidence(mock_search, mock_collection, mock_client, settings):
    mock_client.return_value = MagicMock()
    mock_collection.return_value = MagicMock()
    mock_search.return_value = _mock_chroma_results()

    results = retrieve_relevant_evidence("external validation", settings)

    assert len(results) == 2
    assert results[0]["id"] == "fact_1_0"
    assert results[0]["metadata"]["fact_type"] == "dataset"
    assert results[1]["distance"] == 0.42
    mock_search.assert_called_once()


@patch("pramana.pipeline.rag.get_chroma_client")
@patch("pramana.pipeline.rag.get_evidence_collection")
@patch("pramana.pipeline.rag.search_evidence")
def test_retrieve_handles_empty_collection(mock_search, mock_collection, mock_client, settings):
    mock_client.return_value = MagicMock()
    mock_collection.return_value = MagicMock()
    mock_search.return_value = {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

    results = retrieve_relevant_evidence("anything", settings)
    assert results == []


@patch("pramana.pipeline.rag.get_chroma_client")
def test_retrieve_handles_chroma_error(mock_client, settings):
    mock_client.side_effect = Exception("ChromaDB unavailable")

    results = retrieve_relevant_evidence("test", settings)
    assert results == []


def test_format_retrieved_context_groups_by_paper():
    results = [
        {
            "id": "fact_1_0",
            "text": "dataset: ChestX-ray14. Quote: trained on ChestX-ray14",
            "metadata": {"fact_type": "dataset", "paper_title": "Paper A", "location": "p.3"},
            "distance": 0.25,
        },
        {
            "id": "fact_1_1",
            "text": "method: ResNet-50. Quote: used ResNet-50",
            "metadata": {"fact_type": "method", "paper_title": "Paper A", "location": "p.4"},
            "distance": 0.30,
        },
        {
            "id": "fact_2_0",
            "text": "metric: AUROC. Quote: reported AUROC of 0.92",
            "metadata": {"fact_type": "metric", "paper_title": "Paper B", "location": "p.6"},
            "distance": 0.42,
        },
    ]

    context = format_retrieved_context(results)

    assert "--- Retrieved Evidence ---" in context
    assert "[Paper A]" in context
    assert "[Paper B]" in context
    assert "ChestX-ray14" in context
    assert "AUROC" in context


def test_format_retrieved_context_empty():
    assert format_retrieved_context([]) == "No additional evidence retrieved."


def test_format_retrieved_context_truncation():
    # Create results that exceed max_chars
    results = [
        {
            "id": f"fact_{i}",
            "text": "x" * 500,
            "metadata": {"fact_type": "finding", "paper_title": f"Paper {i}", "location": "p.1"},
            "distance": 0.1,
        }
        for i in range(50)
    ]

    context = format_retrieved_context(results, max_chars=2000)
    assert len(context) < 2500  # Some overhead from headers
