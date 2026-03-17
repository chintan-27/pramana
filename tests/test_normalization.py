"""Tests for normalization and linking."""

import json
from unittest.mock import patch, MagicMock

from pramana.pipeline.extraction import ExtractedFact
from pramana.pipeline.normalization import KNOWN_MAPPINGS, NormalizedEvidence, normalize_evidence


def test_known_mappings():
    """Known mappings cover common variants."""
    assert KNOWN_MAPPINGS["auc-roc"] == "AUROC"
    assert KNOWN_MAPPINGS["imagenet-1k"] == "ImageNet"
    assert KNOWN_MAPPINGS["dice"] == "Dice Coefficient"
    assert KNOWN_MAPPINGS["f1-score"] == "F1-Score"


@patch("pramana.pipeline.normalization._populate_vectors")
@patch("pramana.pipeline.normalization._store_normalized_facts")
@patch("pramana.pipeline.normalization._normalize_with_llm")
def test_normalize_evidence_rule_based(mock_llm, mock_store, mock_vectors, settings):
    """Rule-based normalization works for known terms."""
    facts = [
        ExtractedFact(
            fact_type="metric",
            content="AUC-ROC",
            direct_quote="We report AUC-ROC",
            location="p.3",
        ),
        ExtractedFact(
            fact_type="dataset",
            content="ImageNet-1K",
            direct_quote="Evaluated on ImageNet-1K",
            location="p.5",
        ),
    ]

    mock_llm.return_value = {"mappings": {}, "categories": {}}

    result = normalize_evidence(facts, settings)

    assert isinstance(result, NormalizedEvidence)
    assert result.canonical_mappings.get("AUC-ROC") == "AUROC"
    assert result.canonical_mappings.get("ImageNet-1K") == "ImageNet"


@patch("pramana.pipeline.normalization._populate_vectors")
@patch("pramana.pipeline.normalization._store_normalized_facts")
@patch("pramana.pipeline.normalization._normalize_with_llm")
def test_normalize_evidence_with_llm(mock_llm, mock_store, mock_vectors, settings):
    """Unknown terms are sent to LLM for normalization."""
    facts = [
        ExtractedFact(
            fact_type="method",
            content="Vision Transformer ViT-B/16",
            direct_quote="We used ViT-B/16",
            location="p.3",
        ),
    ]

    mock_llm.return_value = {
        "mappings": {"Vision Transformer ViT-B/16": "ViT-B/16"},
        "categories": {"ViT-B/16": "method"},
    }

    result = normalize_evidence(facts, settings)
    assert result.canonical_mappings.get("Vision Transformer ViT-B/16") == "ViT-B/16"


def test_normalize_empty():
    """Empty facts return empty result."""
    from pramana.config import Settings
    result = NormalizedEvidence()
    assert result.facts == []
    assert result.canonical_mappings == {}
