"""Tests for confidence scoring."""

from pramana.pipeline.confidence import (
    compute_confidence,
    score_content_divergence,
    score_location_specificity,
    score_quote_in_source,
    score_quote_quality,
)


def test_quote_in_source_verbatim():
    source = "We evaluated on ImageNet-1K with a ResNet-50 backbone."
    quote = "We evaluated on ImageNet-1K"
    assert score_quote_in_source(quote, source) == 1.0


def test_quote_in_source_near_match():
    source = "We evaluated on ImageNet-1K with a ResNet-50 backbone."
    quote = "We evaluated on ImageNet-1k"
    score = score_quote_in_source(quote, source)
    assert score >= 0.85


def test_quote_in_source_fabricated():
    source = "We used CIFAR-10 for training."
    quote = "ImageNet was used as the benchmark dataset"
    score = score_quote_in_source(quote, source)
    assert score < 0.5


def test_location_specificity_page_section():
    assert score_location_specificity("Section 3.2, Page 7") >= 0.8


def test_location_specificity_page_only():
    score = score_location_specificity("Page 5")
    assert 0.5 <= score <= 0.9


def test_location_specificity_vague():
    assert score_location_specificity("paper") < 0.3


def test_content_divergence_echo():
    quote = "We evaluated on ImageNet-1K"
    content = "We evaluated on ImageNet-1K"
    assert score_content_divergence(content, quote) < 0.3


def test_content_divergence_summarized():
    quote = "We evaluated on ImageNet-1K with a ResNet-50 backbone achieving 94.2% accuracy"
    content = "ImageNet-1K evaluation using ResNet-50"
    assert score_content_divergence(content, quote) >= 0.5


def test_quote_quality_combined():
    source = "We evaluated on ImageNet-1K with ResNet-50."
    score = score_quote_quality(
        direct_quote="We evaluated on ImageNet-1K",
        source_text=source,
        location="Section 4, Page 7",
        content="ImageNet-1K evaluation results",
    )
    assert 0.0 <= score <= 1.0
    assert score >= 0.7


def test_compute_confidence_with_ensemble():
    score = compute_confidence(quote_quality=0.9, agreement=1.0)
    assert score >= 0.9


def test_compute_confidence_without_ensemble():
    score = compute_confidence(quote_quality=0.9, agreement=None)
    expected = 0.4 * 0.9 + 0.6 * 0.7
    assert abs(score - expected) < 0.01


def test_compute_confidence_unmatched_ensemble():
    score = compute_confidence(quote_quality=1.0, agreement=0.3)
    expected = 0.4 * 1.0 + 0.6 * 0.3
    assert abs(score - expected) < 0.01


def test_compute_confidence_with_venue_boost():
    score = compute_confidence(quote_quality=0.8, agreement=0.7, venue_boost=0.10)
    base = 0.4 * 0.8 + 0.6 * 0.7
    assert abs(score - (base + 0.10)) < 0.01


def test_compute_confidence_with_venue_penalty():
    score = compute_confidence(quote_quality=0.8, agreement=0.7, venue_boost=-0.05)
    base = 0.4 * 0.8 + 0.6 * 0.7
    assert abs(score - (base - 0.05)) < 0.01


def test_compute_confidence_clamped():
    # High base + boost should cap at 1.0
    score = compute_confidence(quote_quality=1.0, agreement=1.0, venue_boost=0.10)
    assert score == 1.0
    # Low base + penalty should floor at 0.0
    score = compute_confidence(quote_quality=0.0, agreement=0.0, venue_boost=-0.05)
    assert score == 0.0
