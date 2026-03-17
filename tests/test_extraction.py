"""Tests for evidence extraction."""

import json
from unittest.mock import patch

from pramana.pipeline.extraction import ExtractedFact, extract_evidence_from_text


def test_extracted_fact_model():
    """ExtractedFact model validates correctly."""
    fact = ExtractedFact(
        fact_type="dataset",
        content="ImageNet-1K",
        direct_quote="We evaluated on ImageNet-1K",
        location="Section 4, p.5",
        paper_id=1,
        paper_title="Test Paper",
    )
    assert fact.fact_type == "dataset"
    assert fact.paper_id == 1


@patch("pramana.pipeline.extraction.chat_json")
def test_extract_evidence_from_text(mock_chat, settings):
    """extract_evidence_from_text returns structured facts."""
    mock_chat.return_value = json.dumps({
        "facts": [
            {
                "fact_type": "dataset",
                "content": "ChestX-ray14 dataset used for training",
                "direct_quote": "We trained our model on the ChestX-ray14 dataset",
                "location": "Section 3.1, p.4",
            },
            {
                "fact_type": "method",
                "content": "ResNet-50 architecture",
                "direct_quote": "We employed a ResNet-50 backbone",
                "location": "Section 3.2, p.5",
            },
            {
                "fact_type": "limitation",
                "content": "Single-site training data",
                "direct_quote": "Our model was trained on data from a single institution",
                "location": "Section 5, p.9",
            },
        ]
    })

    facts = extract_evidence_from_text(
        "We trained our model on the ChestX-ray14 dataset...",
        "Test Paper",
        "External validation is rare",
        settings,
    )

    assert len(facts) == 3
    assert facts[0].fact_type == "dataset"
    assert facts[1].fact_type == "method"
    assert facts[2].fact_type == "limitation"
    assert all(f.direct_quote for f in facts)
    assert all(f.location for f in facts)


@patch("pramana.pipeline.extraction.chat_json")
def test_extract_evidence_skips_missing_quotes(mock_chat, settings):
    """Facts without direct_quote or location are filtered out."""
    mock_chat.return_value = json.dumps({
        "facts": [
            {
                "fact_type": "dataset",
                "content": "ImageNet",
                "direct_quote": "evaluated on ImageNet",
                "location": "p.3",
            },
            {
                "fact_type": "method",
                "content": "Some method",
                "direct_quote": "",
                "location": "p.4",
            },
        ]
    })

    facts = extract_evidence_from_text("...", "Paper", "hypothesis", settings)
    assert len(facts) == 1  # Second fact filtered out


def test_extract_evidence_empty_text(settings):
    """Empty text returns no facts."""
    facts = extract_evidence_from_text("", "Paper", "hypothesis", settings)
    assert facts == []
