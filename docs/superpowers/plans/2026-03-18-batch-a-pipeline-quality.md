# Batch A: Pipeline Quality Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confidence scoring, multi-stage screening, and ensemble extraction to Pramana's pipeline to improve extraction reliability.

**Architecture:** Three new pipeline modules (confidence, screening, ensemble) plug into the existing extraction flow. Screening filters papers before extraction; ensemble runs dual extractors and merges results; confidence scores every fact. All features are independently toggleable via Settings.

**Tech Stack:** Python 3.11+, Pydantic, SQLAlchemy, ChromaDB, FastAPI, React/TypeScript, difflib (stdlib for fuzzy matching)

**Spec:** `docs/superpowers/specs/2026-03-18-batch-a-pipeline-quality-design.md`

---

## File Map

| File | Responsibility | New/Modify |
|------|---------------|------------|
| `src/pramana/pipeline/confidence.py` | Quote quality scoring, agreement scoring, confidence computation | **New** |
| `src/pramana/pipeline/screening.py` | Two-gate relevance filtering (embedding + LLM) | **New** |
| `src/pramana/pipeline/ensemble.py` | Dual-extractor execution, fuzzy matching, result merging | **New** |
| `src/pramana/pipeline/extraction.py` | Add confidence field, model/prompt params, screened_out skip, ensemble delegation | Modify |
| `src/pramana/models/schema.py` | Add confidence column to ExtractedFact | Modify |
| `src/pramana/config.py` | Add screening + ensemble settings | Modify |
| `src/pramana/llm/prompts.py` | Add screening + quote-first extraction prompts | Modify |
| `src/pramana/api.py` | Insert screening stage, update step counts | Modify |
| `frontend/src/pages/AnalysisProgress.tsx` | Add screening stage to STAGES array | Modify |
| `frontend/src/api/client.ts` | Add confidence field to Fact interface | Modify |
| `frontend/src/pages/ReportViewerDisplay.tsx` | Render confidence badges on evidence facts | Modify |
| `tests/test_confidence.py` | Confidence scoring tests | **New** |
| `tests/test_screening.py` | Screening tests | **New** |
| `tests/test_ensemble.py` | Ensemble extraction tests | **New** |

---

### Task 1: Configuration — Add screening and ensemble settings

**Files:**
- Modify: `src/pramana/config.py:8-41`

- [ ] **Step 1: Write the failing test**

Create `tests/test_config_batch_a.py`:

```python
"""Tests for Batch A configuration settings."""

from pramana.config import Settings


def test_screening_settings_defaults():
    """Screening settings have correct defaults."""
    s = Settings(llm_api_key="test", data_dir="/tmp/test")
    assert s.screening_enabled is True
    assert s.screening_similarity_threshold == 1.5
    assert s.screening_model == ""


def test_ensemble_settings_defaults():
    """Ensemble settings have correct defaults."""
    s = Settings(llm_api_key="test", data_dir="/tmp/test")
    assert s.ensemble_enabled is True
    assert s.ensemble_models == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_config_batch_a.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'screening_enabled'`

- [ ] **Step 3: Write minimal implementation**

In `src/pramana/config.py`, add after line 34 (after `api_port`):

```python
    # Screening settings
    screening_enabled: bool = True
    screening_similarity_threshold: float = 1.5  # L2 distance cutoff
    screening_model: str = ""  # empty = use llm_model

    # Ensemble extraction settings
    ensemble_enabled: bool = True
    ensemble_models: list[str] = []  # empty = use llm_model for all
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_config_batch_a.py -v`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `uv run pytest`
Expected: All 64 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pramana/config.py tests/test_config_batch_a.py
git commit -m "feat: add screening and ensemble settings to config"
```

---

### Task 2: Confidence scoring module

**Files:**
- Create: `src/pramana/pipeline/confidence.py`
- Create: `tests/test_confidence.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_confidence.py`:

```python
"""Tests for confidence scoring."""

from pramana.pipeline.confidence import (
    compute_confidence,
    score_location_specificity,
    score_quote_in_source,
    score_content_divergence,
    score_quote_quality,
)


def test_quote_in_source_verbatim():
    """Verbatim quote in source text scores 1.0."""
    source = "We evaluated on ImageNet-1K with a ResNet-50 backbone."
    quote = "We evaluated on ImageNet-1K"
    assert score_quote_in_source(quote, source) == 1.0


def test_quote_in_source_near_match():
    """Near-verbatim quote (>= 0.85 ratio) scores proportionally."""
    source = "We evaluated on ImageNet-1K with a ResNet-50 backbone."
    quote = "We evaluated on ImageNet-1k"  # lowercase k
    score = score_quote_in_source(quote, source)
    assert score >= 0.85


def test_quote_in_source_fabricated():
    """Fabricated quote not in source scores low."""
    source = "We used CIFAR-10 for training."
    quote = "ImageNet was used as the benchmark dataset"
    score = score_quote_in_source(quote, source)
    assert score < 0.5


def test_location_specificity_page_section():
    """Specific page+section reference scores high."""
    assert score_location_specificity("Section 3.2, Page 7") >= 0.8


def test_location_specificity_page_only():
    """Page-only reference scores medium-high."""
    score = score_location_specificity("Page 5")
    assert 0.5 <= score <= 0.9


def test_location_specificity_vague():
    """Vague location scores low."""
    assert score_location_specificity("paper") < 0.3


def test_content_divergence_echo():
    """Content echoing the quote scores low (bad — LLM just copied)."""
    quote = "We evaluated on ImageNet-1K"
    content = "We evaluated on ImageNet-1K"
    assert score_content_divergence(content, quote) < 0.3


def test_content_divergence_summarized():
    """Content that summarizes the quote scores high (good)."""
    quote = "We evaluated on ImageNet-1K with a ResNet-50 backbone achieving 94.2% accuracy"
    content = "ImageNet-1K evaluation using ResNet-50"
    assert score_content_divergence(content, quote) >= 0.5


def test_quote_quality_combined():
    """Combined quote quality score is weighted average."""
    source = "We evaluated on ImageNet-1K with ResNet-50."
    score = score_quote_quality(
        direct_quote="We evaluated on ImageNet-1K",
        source_text=source,
        location="Section 4, Page 7",
        content="ImageNet-1K evaluation results",
    )
    assert 0.0 <= score <= 1.0
    assert score >= 0.7  # Good quote, good location, good divergence


def test_compute_confidence_with_ensemble():
    """Confidence with ensemble agreement=1.0 produces high score."""
    score = compute_confidence(quote_quality=0.9, agreement=1.0)
    assert score >= 0.9


def test_compute_confidence_without_ensemble():
    """Confidence without ensemble uses default agreement=0.7."""
    score = compute_confidence(quote_quality=0.9, agreement=None)
    expected = 0.4 * 0.9 + 0.6 * 0.7
    assert abs(score - expected) < 0.01


def test_compute_confidence_unmatched_ensemble():
    """Unmatched ensemble fact (agreement=0.3) gets medium confidence."""
    score = compute_confidence(quote_quality=1.0, agreement=0.3)
    expected = 0.4 * 1.0 + 0.6 * 0.3
    assert abs(score - expected) < 0.01
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_confidence.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pramana.pipeline.confidence'`

- [ ] **Step 3: Write the implementation**

Create `src/pramana/pipeline/confidence.py`:

```python
"""Confidence scoring for extracted facts."""

from difflib import SequenceMatcher
import re


def score_quote_in_source(direct_quote: str, source_text: str) -> float:
    """Score how well the direct_quote appears in the source text.

    Returns 1.0 for verbatim match, proportional for near-matches,
    low for fabricated quotes.
    """
    if not direct_quote or not source_text:
        return 0.0

    quote_lower = direct_quote.lower().strip()
    source_lower = source_text.lower()

    # Exact substring match
    if quote_lower in source_lower:
        return 1.0

    # Sliding window fuzzy match — find best matching window in source
    quote_len = len(quote_lower)
    if quote_len == 0:
        return 0.0

    best_ratio = 0.0
    # Sample windows to avoid O(n*m) on long texts
    step = max(1, quote_len // 4)
    for i in range(0, max(1, len(source_lower) - quote_len + 1), step):
        window = source_lower[i:i + quote_len + 20]  # slight oversize
        ratio = SequenceMatcher(None, quote_lower, window).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            if ratio >= 0.95:
                break  # Good enough

    return best_ratio


def score_location_specificity(location: str) -> float:
    """Score how specific the location reference is.

    Specific (page+section) = high, vague = low.
    """
    if not location:
        return 0.0

    loc_lower = location.lower().strip()
    score = 0.0

    # Page reference
    if re.search(r'page\s*\d+|p\.\s*\d+|pp?\.\s*\d+', loc_lower):
        score += 0.5

    # Section reference
    if re.search(r'section\s*[\d.]+|§\s*[\d.]+', loc_lower):
        score += 0.4

    # Table/Figure reference
    if re.search(r'table\s*\d+|figure\s*\d+|fig\.\s*\d+', loc_lower):
        score += 0.3

    # Abstract/Introduction/Conclusion (moderately specific)
    if re.search(r'abstract|introduction|conclusion|discussion|methods|results', loc_lower):
        score += 0.2

    # Clamp to [0, 1]
    return min(score, 1.0) if score > 0 else 0.1  # Minimum 0.1 for any non-empty location


def score_content_divergence(content: str, direct_quote: str) -> float:
    """Score how much the content diverges from the direct_quote.

    High divergence = good (LLM actually summarized).
    Low divergence = bad (LLM just echoed the quote).
    """
    if not content or not direct_quote:
        return 0.5  # Neutral

    ratio = SequenceMatcher(None, content.lower(), direct_quote.lower()).ratio()
    # ratio >= 0.8 means too similar (echoing) → low score
    # ratio < 0.8 means good divergence → high score
    if ratio >= 0.9:
        return 0.1
    elif ratio >= 0.8:
        return 0.3
    elif ratio >= 0.5:
        return 0.7
    else:
        return 1.0


def score_quote_quality(
    direct_quote: str,
    source_text: str,
    location: str,
    content: str,
) -> float:
    """Compute combined quote quality score (0.0–1.0).

    Weighted: quote_in_source (0.4) + location_specificity (0.3) + content_divergence (0.3)
    """
    q_score = score_quote_in_source(direct_quote, source_text)
    l_score = score_location_specificity(location)
    d_score = score_content_divergence(content, direct_quote)
    return 0.4 * q_score + 0.3 * l_score + 0.3 * d_score


def compute_confidence(quote_quality: float, agreement: float | None = None) -> float:
    """Compute final confidence score.

    Args:
        quote_quality: Quote quality score (0.0–1.0)
        agreement: Ensemble agreement score. None = ensemble disabled (default 0.7).
    """
    if agreement is None:
        agreement = 0.7  # Default when ensemble is disabled
    return 0.4 * quote_quality + 0.6 * agreement
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_confidence.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest`
Expected: All tests PASS (64 existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/pramana/pipeline/confidence.py tests/test_confidence.py
git commit -m "feat: add confidence scoring module for extracted facts"
```

---

### Task 3: Add confidence field to extraction models and DB schema

**Files:**
- Modify: `src/pramana/pipeline/extraction.py:21-30` (Pydantic model)
- Modify: `src/pramana/pipeline/extraction.py:114-125` (`_store_facts`)
- Modify: `src/pramana/models/schema.py:70-82` (DB model)

- [ ] **Step 1: Add `confidence` to the Pydantic ExtractedFact model**

In `src/pramana/pipeline/extraction.py`, add after line 29 (`paper_title: str = ""`):

```python
    confidence: float = 0.0
```

- [ ] **Step 2: Add `confidence` column to the SQLAlchemy ExtractedFact model**

In `src/pramana/models/schema.py`, add the `Float` import to line 4:

```python
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
```

Then add after line 78 (`location = Column(String(200), nullable=False)`):

```python
    confidence = Column(Float, default=0.0)
```

- [ ] **Step 3: Update `_store_facts` to persist confidence**

In `src/pramana/pipeline/extraction.py`, update `_store_facts` at line 118 to include confidence:

```python
            db_fact = ExtractedFactDB(
                paper_id=paper_id,
                fact_type=fact.fact_type,
                content=fact.content,
                direct_quote=fact.direct_quote,
                location=fact.location,
                confidence=fact.confidence,
            )
```

- [ ] **Step 4: Run existing extraction tests to verify no regressions**

Run: `uv run pytest tests/test_extraction.py -v`
Expected: All 4 tests PASS (the default `confidence=0.0` means existing tests don't need changes)

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pramana/pipeline/extraction.py src/pramana/models/schema.py
git commit -m "feat: add confidence field to ExtractedFact models and DB schema"
```

---

### Task 4: Screening prompts

**Files:**
- Modify: `src/pramana/llm/prompts.py`

- [ ] **Step 1: Add screening prompts**

Append to `src/pramana/llm/prompts.py`:

```python
SCREENING_RELEVANCE_SYSTEM = """You are a research paper relevance screening expert. Given a research hypothesis, determine whether a paper is relevant enough to warrant detailed evidence extraction.

Rules:
- A paper is relevant if it addresses ANY aspect of the hypothesis (methods, datasets, findings, domain)
- Be inclusive — when in doubt, mark as relevant
- Provide a brief reason for your decision

Output valid JSON."""

SCREENING_RELEVANCE_USER = """Is this paper relevant to the research hypothesis?

Hypothesis: {hypothesis}

Paper title: {title}
Abstract: {abstract}

Respond with valid JSON: {{"relevant": true/false, "reason": "..."}}"""
```

- [ ] **Step 2: Add quote-first extraction prompt for ensemble**

Append to `src/pramana/llm/prompts.py`:

```python
EVIDENCE_EXTRACTION_QUOTE_FIRST = """You are a scientific evidence extraction expert. Your task is to find notable direct quotes in a research paper and categorize them as structured facts.

Approach:
1. First, scan the text for important direct quotes that relate to the hypothesis
2. For each quote, determine what type of fact it represents
3. Summarize the quote's significance in your own words

Rules:
- Extract ONLY explicit, factual information present in the text
- NO opinions, judgments, or quality assessments
- Every fact MUST include a direct quote and location (page/section)
- If a field is not present in the text, leave it empty — NEVER fabricate
- Focus on quotes relevant to the hypothesis

Output valid JSON with a list of facts. Each fact has:
- fact_type: one of "dataset", "method", "metric", "protocol", "limitation", "finding", "baseline", "assumption"
- content: the extracted information in your own words (a summary of the quote)
- direct_quote: verbatim text from the paper (keep it concise but complete)
- location: page number or section reference"""
```

- [ ] **Step 3: Verify tests still pass**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/pramana/llm/prompts.py
git commit -m "feat: add screening and quote-first extraction prompts"
```

---

### Task 5: Screening module

**Files:**
- Create: `src/pramana/pipeline/screening.py`
- Create: `tests/test_screening.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_screening.py`:

```python
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


@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_filters_irrelevant(mock_search, mock_chat, settings):
    """Papers with high L2 distance are screened out by Gate 1."""
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


@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate2_filters_by_llm(mock_search, mock_chat, settings):
    """Gate 2 LLM check filters papers marked irrelevant."""
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
    assert result.papers[1].get("screening_reason") == "off topic"


@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate1_fail_open(mock_search, settings):
    """If ChromaDB fails, all papers pass through (fail-open)."""
    papers = [
        {"title": "Paper A", "abstract": "Abstract A", "db_id": 1},
    ]
    corpus = _make_corpus(papers)
    query = _make_query()

    mock_search.side_effect = Exception("ChromaDB unavailable")

    result = screen_corpus(corpus, query, settings)

    # Paper should NOT be screened out
    assert result.papers[0].get("screened_out") is not True


@patch("pramana.pipeline.screening.chat_json")
@patch("pramana.pipeline.screening.search_papers")
def test_screen_corpus_gate2_fail_open(mock_search, mock_chat, settings):
    """If LLM call fails in Gate 2, papers pass through (fail-open)."""
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_screening.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pramana.pipeline.screening'`

- [ ] **Step 3: Write the implementation**

Create `src/pramana/pipeline/screening.py`:

```python
"""Multi-stage screening — filter irrelevant papers before extraction."""

import json
import logging

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import SCREENING_RELEVANCE_SYSTEM, SCREENING_RELEVANCE_USER
from pramana.models.vectors import get_chroma_client, get_paper_collection, search_papers
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery

logger = logging.getLogger(__name__)


def resolve_model(configured: str, settings: Settings) -> str:
    """Resolve a model name, falling back to settings.llm_model if empty."""
    return configured if configured else settings.llm_model


def screen_corpus(
    corpus: Corpus,
    query: HypothesisQuery,
    settings: Settings,
) -> Corpus:
    """Apply two-gate screening to filter irrelevant papers.

    Gate 1: Embedding similarity via ChromaDB (fast, free).
    Gate 2: LLM relevance check (cheap LLM call per paper).

    Both gates fail open — if either fails, papers pass through.
    Mutates paper dicts in-place with screening metadata.
    """
    if not settings.screening_enabled:
        logger.info("Screening disabled, passing all %d papers", len(corpus.papers))
        return corpus

    if not corpus.papers:
        return corpus

    hypothesis_text = " ".join(query.topics) if query.topics else ""
    if not hypothesis_text:
        hypothesis_text = " ".join(query.domains)

    # Gate 1: Embedding similarity
    _gate1_embedding_similarity(corpus, hypothesis_text, settings)

    # Gate 2: LLM relevance check (only on papers that passed Gate 1)
    _gate2_llm_relevance(corpus, hypothesis_text, settings)

    screened_count = sum(1 for p in corpus.papers if p.get("screened_out"))
    logger.info(
        "Screening complete: %d/%d papers screened out",
        screened_count, len(corpus.papers),
    )

    return corpus


def _gate1_embedding_similarity(
    corpus: Corpus,
    hypothesis_text: str,
    settings: Settings,
) -> None:
    """Gate 1: Use ChromaDB similarity to filter papers by distance."""
    try:
        client = get_chroma_client(settings)
        collection = get_paper_collection(client)

        results = search_papers(
            collection, hypothesis_text, n_results=len(corpus.papers),
        )

        if not results.get("ids") or not results["ids"][0]:
            logger.warning("Gate 1: No results from ChromaDB, passing all papers")
            return

        # Build a distance lookup: paper_db_id -> distance
        ids = results["ids"][0]
        distances = results.get("distances", [[]])[0]
        distance_map: dict[str, float] = {}
        for i, doc_id in enumerate(ids):
            if i < len(distances):
                distance_map[doc_id] = distances[i]

        threshold = settings.screening_similarity_threshold

        for paper in corpus.papers:
            db_id = str(paper.get("db_id", ""))
            distance = distance_map.get(db_id)
            if distance is not None:
                paper["relevance_score"] = distance
                if distance > threshold:
                    paper["screened_out"] = True
                    paper["screening_reason"] = (
                        f"Gate 1: L2 distance {distance:.2f} > threshold {threshold}"
                    )
                    logger.debug(
                        "Gate 1 filtered: '%s' (distance=%.2f)",
                        paper.get("title", "")[:50], distance,
                    )

    except Exception as e:
        logger.warning("Gate 1 failed (fail-open): %s", e)


def _gate2_llm_relevance(
    corpus: Corpus,
    hypothesis_text: str,
    settings: Settings,
) -> None:
    """Gate 2: LLM-based relevance check for papers passing Gate 1."""
    model = resolve_model(settings.screening_model, settings)

    for paper in corpus.papers:
        if paper.get("screened_out"):
            continue  # Already filtered by Gate 1

        title = paper.get("title", "")
        abstract = paper.get("abstract", "")[:500]

        if not title and not abstract:
            continue

        try:
            messages = [
                {"role": "system", "content": SCREENING_RELEVANCE_SYSTEM},
                {
                    "role": "user",
                    "content": SCREENING_RELEVANCE_USER.format(
                        hypothesis=hypothesis_text,
                        title=title,
                        abstract=abstract,
                    ),
                },
            ]
            response_text = chat_json(messages, settings, model=model)
            data = json.loads(response_text)

            if not data.get("relevant", True):
                paper["screened_out"] = True
                paper["screening_reason"] = (
                    f"Gate 2: {data.get('reason', 'LLM marked irrelevant')}"
                )
                logger.debug(
                    "Gate 2 filtered: '%s' (%s)",
                    title[:50], data.get("reason", ""),
                )
        except Exception as e:
            # Fail open — if LLM call fails, paper passes through
            logger.warning("Gate 2 failed for '%s' (fail-open): %s", title[:50], e)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_screening.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pramana/pipeline/screening.py tests/test_screening.py
git commit -m "feat: add multi-stage screening pipeline"
```

---

### Task 6: Ensemble extraction module

**Files:**
- Create: `src/pramana/pipeline/ensemble.py`
- Create: `tests/test_ensemble.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_ensemble.py`:

```python
"""Tests for ensemble extraction."""

import json
from unittest.mock import patch

from pramana.pipeline.ensemble import (
    ensemble_extract,
    fuzzy_match_facts,
    merge_results,
)
from pramana.pipeline.extraction import ExtractedFact


def _make_fact(content, quote, location="Section 1", fact_type="finding"):
    return ExtractedFact(
        fact_type=fact_type,
        content=content,
        direct_quote=quote,
        location=location,
    )


def test_fuzzy_match_facts_identical():
    """Identical quotes match with ratio 1.0."""
    a = _make_fact("Finding A", "We found that X improves Y")
    b = _make_fact("Finding A alt", "We found that X improves Y")
    ratio = fuzzy_match_facts(a, b)
    assert ratio == 1.0


def test_fuzzy_match_facts_similar():
    """Similar quotes match above threshold."""
    a = _make_fact("Finding", "We evaluated on ImageNet-1K with ResNet-50")
    b = _make_fact("Finding", "We evaluated on ImageNet-1k using ResNet-50")
    ratio = fuzzy_match_facts(a, b)
    assert ratio >= 0.7


def test_fuzzy_match_facts_different():
    """Different quotes score below threshold."""
    a = _make_fact("Finding A", "CIFAR-10 was used for training the model")
    b = _make_fact("Finding B", "The drug showed efficacy in Phase 3 trials")
    ratio = fuzzy_match_facts(a, b)
    assert ratio < 0.7


def test_merge_results_matched():
    """Matched facts get agreement=1.0."""
    facts_a = [_make_fact("Finding", "We found X improves Y by 20%")]
    facts_b = [_make_fact("Finding alt", "We found X improves Y by 20%")]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 1
    assert merged[0].confidence == 1.0  # agreement for matched


def test_merge_results_unmatched():
    """Unmatched facts get agreement=0.3."""
    facts_a = [_make_fact("Finding A", "X is true")]
    facts_b = [_make_fact("Finding B", "Y is completely different")]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 2  # Both kept
    assert all(f.confidence == 0.3 for f in merged)


def test_merge_results_mixed():
    """Mix of matched and unmatched facts."""
    facts_a = [
        _make_fact("Matched", "We found X improves Y"),
        _make_fact("Only A", "CIFAR-10 was used"),
    ]
    facts_b = [
        _make_fact("Matched alt", "We found X improves Y"),
        _make_fact("Only B", "Phase 3 trial results"),
    ]
    merged = merge_results(facts_a, facts_b)
    assert len(merged) == 3  # 1 matched + 2 unmatched
    confidences = sorted([f.confidence for f in merged])
    assert confidences == [0.3, 0.3, 1.0]


@patch("pramana.pipeline.ensemble.extract_evidence_from_text")
def test_ensemble_extract_calls_twice(mock_extract, settings):
    """Ensemble extract calls extract_evidence_from_text twice."""
    mock_extract.return_value = [_make_fact("F", "Quote")]
    result = ensemble_extract("text", "title", "hypothesis", settings)
    assert mock_extract.call_count == 2
    assert len(result) >= 1


def test_ensemble_disabled_single_extractor(settings):
    """When ensemble_enabled=False, extract_all_evidence uses single extractor."""
    from unittest.mock import patch as mock_patch
    from pramana.pipeline.corpus import Corpus
    from pramana.pipeline.hypothesis import HypothesisQuery

    settings.ensemble_enabled = False
    corpus = Corpus(papers=[
        {"title": "Test", "abstract": "Some text", "db_id": None},
    ])
    query = HypothesisQuery(topics=["test"])

    with mock_patch("pramana.pipeline.extraction.extract_evidence_from_text") as mock_ext:
        mock_ext.return_value = [_make_fact("F", "Quote")]
        from pramana.pipeline.extraction import extract_all_evidence
        result = extract_all_evidence(corpus, query, settings)
        # Single extractor called once (not ensemble's twice)
        assert mock_ext.call_count == 1


def test_screened_out_papers_skipped(settings):
    """Papers with screened_out=True are skipped in extract_all_evidence."""
    from unittest.mock import patch as mock_patch
    from pramana.pipeline.corpus import Corpus
    from pramana.pipeline.hypothesis import HypothesisQuery

    settings.ensemble_enabled = False
    corpus = Corpus(papers=[
        {"title": "Included", "abstract": "Good paper", "db_id": None},
        {"title": "Excluded", "abstract": "Filtered out", "db_id": None, "screened_out": True},
    ])
    query = HypothesisQuery(topics=["test"])

    with mock_patch("pramana.pipeline.extraction.extract_evidence_from_text") as mock_ext:
        mock_ext.return_value = [_make_fact("F", "Quote")]
        from pramana.pipeline.extraction import extract_all_evidence
        result = extract_all_evidence(corpus, query, settings)
        # Only called once (screened-out paper skipped)
        assert mock_ext.call_count == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_ensemble.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

Create `src/pramana/pipeline/ensemble.py`:

```python
"""Ensemble extraction — run multiple extractors and merge results."""

import logging
from difflib import SequenceMatcher

from pramana.config import Settings
from pramana.llm.prompts import (
    EVIDENCE_EXTRACTION_QUOTE_FIRST,
    EVIDENCE_EXTRACTION_SYSTEM,
)
from pramana.pipeline.extraction import ExtractedFact, extract_evidence_from_text
from pramana.pipeline.screening import resolve_model

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.7  # Minimum Levenshtein ratio for quote matching


def fuzzy_match_facts(a: ExtractedFact, b: ExtractedFact) -> float:
    """Compute fuzzy match ratio between two facts based on direct_quote."""
    if not a.direct_quote or not b.direct_quote:
        return 0.0
    return SequenceMatcher(
        None, a.direct_quote.lower(), b.direct_quote.lower()
    ).ratio()


def merge_results(
    facts_a: list[ExtractedFact],
    facts_b: list[ExtractedFact],
) -> list[ExtractedFact]:
    """Merge results from two extractors.

    Matched facts (quote overlap >= 0.7): agreement=1.0, keep best version.
    Unmatched facts: agreement=0.3, keep all.
    """
    merged: list[ExtractedFact] = []
    used_b: set[int] = set()

    for fact_a in facts_a:
        best_match_idx = -1
        best_ratio = 0.0

        for j, fact_b in enumerate(facts_b):
            if j in used_b:
                continue
            ratio = fuzzy_match_facts(fact_a, fact_b)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match_idx = j

        if best_ratio >= MATCH_THRESHOLD and best_match_idx >= 0:
            # Matched — pick the version with more specific location
            used_b.add(best_match_idx)
            fact_b = facts_b[best_match_idx]
            winner = _pick_better_fact(fact_a, fact_b)
            winner.confidence = 1.0  # High agreement
            merged.append(winner)
        else:
            # Unmatched from A
            fact_a.confidence = 0.3
            merged.append(fact_a)

    # Add unmatched facts from B
    for j, fact_b in enumerate(facts_b):
        if j not in used_b:
            fact_b.confidence = 0.3
            merged.append(fact_b)

    return merged


def _pick_better_fact(a: ExtractedFact, b: ExtractedFact) -> ExtractedFact:
    """Pick the better of two matching facts.

    Prefers more specific location and longer content.
    """
    # Simple heuristic: longer location string is usually more specific
    a_loc_len = len(a.location)
    b_loc_len = len(b.location)

    if a_loc_len > b_loc_len:
        return a
    elif b_loc_len > a_loc_len:
        return b
    # Tie: prefer longer content (more detailed summary)
    return a if len(a.content) >= len(b.content) else b


def ensemble_extract(
    text: str,
    title: str,
    hypothesis: str,
    settings: Settings,
) -> list[ExtractedFact]:
    """Run ensemble extraction with two prompt strategies.

    Extractor A: Fact-focused (default prompt).
    Extractor B: Quote-first (alternative prompt).
    """
    models = settings.ensemble_models or []
    model_a = resolve_model(models[0] if len(models) > 0 else "", settings)
    model_b = resolve_model(models[1] if len(models) > 1 else "", settings)

    logger.info("Ensemble: extracting from '%s' (models: %s, %s)", title[:50], model_a, model_b)

    # Extractor A — fact-focused (default prompt)
    facts_a = extract_evidence_from_text(
        text, title, hypothesis, settings,
        model=model_a,
        system_prompt=EVIDENCE_EXTRACTION_SYSTEM,
    )
    logger.debug("Extractor A: %d facts", len(facts_a))

    # Extractor B — quote-first
    facts_b = extract_evidence_from_text(
        text, title, hypothesis, settings,
        model=model_b,
        system_prompt=EVIDENCE_EXTRACTION_QUOTE_FIRST,
    )
    logger.debug("Extractor B: %d facts", len(facts_b))

    # Merge
    merged = merge_results(facts_a, facts_b)
    logger.info("Ensemble merged: %d facts (%d matched, %d unique)",
                len(merged),
                sum(1 for f in merged if f.confidence == 1.0),
                sum(1 for f in merged if f.confidence == 0.3))

    return merged
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_ensemble.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pramana/pipeline/ensemble.py tests/test_ensemble.py
git commit -m "feat: add ensemble extraction with dual-extractor merge"
```

---

### Task 7: Wire extraction.py to support ensemble, screening skip, and model/prompt params

**Files:**
- Modify: `src/pramana/pipeline/extraction.py:32-75` (`extract_evidence_from_text`)
- Modify: `src/pramana/pipeline/extraction.py:78-111` (`extract_all_evidence`)

- [ ] **Step 1: Add model and system_prompt params to `extract_evidence_from_text`**

In `src/pramana/pipeline/extraction.py`, change the function signature at line 32 and the system message at line 46:

```python
def extract_evidence_from_text(
    text: str,
    title: str,
    hypothesis: str,
    settings: Settings,
    model: str | None = None,
    system_prompt: str | None = None,
) -> list[ExtractedFact]:
    """Extract structured evidence from paper text using LLM."""
    if not text or not text.strip():
        return []

    # Truncate if too long
    truncated = text[:MAX_TEXT_LENGTH]

    resolved_prompt = system_prompt or EVIDENCE_EXTRACTION_SYSTEM

    messages = [
        {"role": "system", "content": resolved_prompt},
        {
            "role": "user",
            "content": EVIDENCE_EXTRACTION_USER.format(
                hypothesis=hypothesis,
                title=title,
                text=truncated,
            ),
        },
    ]

    try:
        response_text = chat_json(messages, settings, model=model)
        data = json.loads(response_text)
        facts = []
        for fact_data in data.get("facts", []):
            # Enforce required fields
            if not fact_data.get("direct_quote") or not fact_data.get("location"):
                continue
            facts.append(ExtractedFact(
                fact_type=fact_data.get("fact_type", "unknown") or "unknown",
                content=fact_data.get("content", "") or "",
                direct_quote=fact_data["direct_quote"],
                location=fact_data["location"],
                paper_title=title,
            ))
        return facts
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse extraction response for '{title}': {e}")
        return []
```

- [ ] **Step 2: Update `extract_all_evidence` to skip screened papers and delegate to ensemble**

Replace the `extract_all_evidence` function (lines 78-111):

```python
def extract_all_evidence(
    corpus: Corpus,
    query: HypothesisQuery,
    settings: Settings,
) -> list[ExtractedFact]:
    """Extract evidence from all papers in the corpus."""
    all_facts: list[ExtractedFact] = []
    hypothesis_text = " ".join(query.topics) if query.topics else ""

    logger.info("Extracting evidence from %d papers", len(corpus.papers))

    for paper in corpus.papers:
        # Skip screened-out papers
        if paper.get("screened_out"):
            logger.debug("Skipping screened-out paper: '%s'", paper.get("title", "")[:50])
            continue

        # Use full text if available, fall back to abstract
        text = paper.get("full_text") or paper.get("abstract") or ""
        title = paper.get("title", "Unknown")
        paper_db_id = paper.get("db_id")

        if not text or not text.strip():
            continue

        # Use ensemble or single extractor
        if settings.ensemble_enabled:
            from pramana.pipeline.ensemble import ensemble_extract
            facts = ensemble_extract(text, title, hypothesis_text, settings)
        else:
            facts = extract_evidence_from_text(text, title, hypothesis_text, settings)

        # Apply confidence scoring
        from pramana.pipeline.confidence import compute_confidence, score_quote_quality
        for fact in facts:
            quote_quality = score_quote_quality(
                direct_quote=fact.direct_quote,
                source_text=text,
                location=fact.location,
                content=fact.content,
            )
            # fact.confidence already set by ensemble (agreement), or 0.0 if single
            agreement = fact.confidence if settings.ensemble_enabled else None
            fact.confidence = compute_confidence(quote_quality, agreement)

        logger.debug("Paper '%s': extracted %d facts", title[:50], len(facts))

        # Store in database
        if paper_db_id and facts:
            _store_facts(facts, paper_db_id, settings)

        for fact in facts:
            fact.paper_id = paper_db_id
            fact.paper_title = title

        all_facts.extend(facts)

    return all_facts
```

- [ ] **Step 3: Run existing extraction tests**

Run: `uv run pytest tests/test_extraction.py -v`
Expected: All 4 tests PASS (new params have defaults; ensemble_enabled defaults to True but mock prevents actual ensemble calls; we need to verify)

If tests fail due to ensemble trying to import, add `settings.ensemble_enabled = False` fixture or mock the ensemble. The simplest fix: in `conftest.py`, add `ensemble_enabled=False` and `screening_enabled=False` to the test Settings:

In `tests/conftest.py`, update the settings fixture:

```python
@pytest.fixture
def settings(tmp_data_dir: Path) -> Settings:
    """Test settings with temporary directories."""
    return Settings(
        llm_base_url="https://api.example.com",
        llm_api_key="test-key",
        llm_model="gpt-4o",
        data_dir=tmp_data_dir,
        db_path=tmp_data_dir / "test.db",
        chroma_path=tmp_data_dir / "chroma",
        pdf_dir=tmp_data_dir / "pdfs",
        ensemble_enabled=False,
        screening_enabled=False,
    )
```

- [ ] **Step 4: Run full test suite**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pramana/pipeline/extraction.py tests/conftest.py
git commit -m "feat: wire ensemble, screening skip, and confidence into extraction"
```

---

### Task 8: Wire screening into API pipeline and update SSE stages

**Files:**
- Modify: `src/pramana/api.py:538-634` (`_run_analysis`)
- Modify: `frontend/src/pages/AnalysisProgress.tsx:5-12`

- [ ] **Step 1: Insert screening stage in `_run_analysis`**

In `src/pramana/api.py`, update `_run_analysis`. After the corpus building stage (after line 571), insert the screening stage and update all step numbers:

Replace lines 547-607 with:

```python
        # Stage 1: Parse hypothesis
        store["stage"] = "parsing"
        store["progress"] = {"step": 1, "total": 7, "description": "Parsing hypothesis"}
        logger.info("[%s] Stage 1/7: Parsing hypothesis", run_id[:8])
        from pramana.pipeline.hypothesis import parse_hypothesis
        parsed = parse_hypothesis(store["hypothesis"], store["initiation_type"], settings, prior_research=store.get("prior_research", ""))
        store["progress"]["parsed"] = parsed.model_dump()
        logger.info("[%s] Parsed → %d domains, %d topics, %d queries",
                    run_id[:8], len(parsed.domains), len(parsed.topics), len(parsed.search_queries))

        # Stage 2: Build corpus
        store["stage"] = "retrieval"
        store["progress"] = {"step": 2, "total": 7, "description": "Retrieving papers"}
        logger.info("[%s] Stage 2/7: Retrieving papers (max=%d)", run_id[:8], store["max_papers"])
        from pramana.pipeline.corpus import build_corpus
        corpus = build_corpus(parsed, max_papers=store["max_papers"], settings=settings)
        store["progress"]["papers_found"] = len(corpus.papers)
        store["progress"]["sources"] = {
            "s2": corpus.total_from_s2,
            "arxiv": corpus.total_from_arxiv,
            "pubmed": corpus.total_from_pubmed,
        }
        logger.info("[%s] Corpus: %d papers (S2=%d, arXiv=%d, PubMed=%d)",
                    run_id[:8], len(corpus.papers), corpus.total_from_s2,
                    corpus.total_from_arxiv, corpus.total_from_pubmed)

        # Stage 3: Screen papers
        store["stage"] = "screening"
        store["progress"] = {"step": 3, "total": 7, "description": "Screening papers for relevance"}
        logger.info("[%s] Stage 3/7: Screening %d papers", run_id[:8], len(corpus.papers))
        from pramana.pipeline.screening import screen_corpus
        corpus = screen_corpus(corpus, parsed, settings)
        screened_count = sum(1 for p in corpus.papers if p.get("screened_out"))
        passed_count = len(corpus.papers) - screened_count
        store["progress"]["papers_screened_out"] = screened_count
        store["progress"]["papers_passed"] = passed_count
        logger.info("[%s] Screening: %d passed, %d filtered", run_id[:8], passed_count, screened_count)

        # Stage 4: Extract evidence
        store["stage"] = "extraction"
        store["progress"] = {"step": 4, "total": 7, "description": "Extracting evidence"}
        logger.info("[%s] Stage 4/7: Extracting evidence from %d papers",
                    run_id[:8], passed_count)
        from pramana.pipeline.extraction import extract_all_evidence
        evidence = extract_all_evidence(corpus, parsed, settings)
        store["progress"]["facts_extracted"] = len(evidence)
        store["progress"]["papers_processed"] = passed_count
        logger.info("[%s] Extracted %d facts", run_id[:8], len(evidence))

        # Stage 5: Normalize
        store["stage"] = "normalization"
        store["progress"] = {"step": 5, "total": 7, "description": "Normalizing evidence"}
        logger.info("[%s] Stage 5/7: Normalizing %d facts", run_id[:8], len(evidence))
        from pramana.pipeline.normalization import normalize_evidence
        normalized = normalize_evidence(evidence, settings)
        store["progress"]["mappings"] = len(normalized.canonical_mappings)
        store["progress"]["categories"] = len(normalized.categories)
        logger.info("[%s] Normalized: %d mappings, %d categories",
                    run_id[:8], len(normalized.canonical_mappings), len(normalized.categories))

        # Stage 6: Run analysis
        store["stage"] = "analysis"
        store["progress"] = {"step": 6, "total": 7, "description": "Running analytical lenses"}
        logger.info("[%s] Stage 6/7: Running analytical lenses", run_id[:8])
        from pramana.pipeline.orchestrator import run_analysis as run_lenses
        results = run_lenses(corpus, normalized, parsed, settings)
        store["progress"]["lenses_completed"] = results.active_lenses
        logger.info("[%s] Lenses completed: %s", run_id[:8], ", ".join(results.active_lenses))

        # Stage 7: Generate report
        store["stage"] = "report"
        store["progress"] = {"step": 7, "total": 7, "description": "Generating report"}
        logger.info("[%s] Stage 7/7: Generating report", run_id[:8])
        from pramana.report.generator import generate_report
        report_json = generate_report(results, parsed, "json", settings)
```

- [ ] **Step 2: Update frontend STAGES array**

In `frontend/src/pages/AnalysisProgress.tsx`, replace lines 5-12:

```typescript
const STAGES = [
  { key: 'parsing', label: 'Parsing hypothesis', sub: 'Extracting domains, topics, search queries', icon: '01' },
  { key: 'retrieval', label: 'Retrieving papers', sub: 'Semantic Scholar, arXiv, PubMed', icon: '02' },
  { key: 'screening', label: 'Screening papers', sub: 'Filtering by relevance (embedding + LLM)', icon: '03' },
  { key: 'extraction', label: 'Extracting evidence', sub: 'Facts, quotes, locations from each paper', icon: '04' },
  { key: 'normalization', label: 'Normalizing', sub: 'Canonicalizing terms, building vectors', icon: '05' },
  { key: 'analysis', label: 'Running lenses', sub: 'Applying analytical lenses to evidence', icon: '06' },
  { key: 'report', label: 'Generating report', sub: 'Compiling findings and recommendations', icon: '07' },
];
```

Also add screening-specific stats display. After the extraction stage stats (around line 152-156), add:

```typescript
                {isDone && stage.key === 'screening' && progress.papers_passed != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {String(progress.papers_passed)} passed &middot; {String(progress.papers_screened_out ?? 0)} filtered
                  </p>
                )}
```

- [ ] **Step 3: Run backend tests**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 4: Build frontend**

Run: `cd /Users/chintanacharya/Projects/pramana/frontend && npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add src/pramana/api.py frontend/src/pages/AnalysisProgress.tsx
git commit -m "feat: wire screening into pipeline, update SSE stages to 7"
```

---

### Task 9: Frontend confidence badges

**Files:**
- Modify: `frontend/src/api/client.ts:35-41`
- Modify: `frontend/src/pages/ReportViewerDisplay.tsx`

- [ ] **Step 1: Add confidence to Fact interface**

In `frontend/src/api/client.ts`, add `confidence` to the `Fact` interface after `location`:

```typescript
export interface Fact {
  id: number;
  fact_type: string;
  content: string;
  direct_quote: string;
  location: string;
  confidence: number;
}
```

- [ ] **Step 2: Add confidence badge rendering to ReportViewerDisplay.tsx**

In `frontend/src/pages/ReportViewerDisplay.tsx`, find where evidence table facts are rendered (the evidence_table lens section). Add a confidence badge helper function near the top of the component (after the theme constants):

```typescript
function ConfidenceBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  const level = value >= 0.7 ? 'high' : value >= 0.4 ? 'med' : 'low';
  const colors = {
    high: 'bg-teal/15 text-teal border-teal/30',
    med: 'bg-amber-subtle text-amber border-amber/30',
    low: 'bg-rose-subtle text-rose border-rose/20',
  };
  const labels = { high: 'High', med: 'Med', low: 'Low' };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[9px] font-mono rounded border ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}
```

**Important:** Also update the local `Fact` interface at line 398 of `ReportViewerDisplay.tsx` to include `confidence`:

```typescript
interface Fact { content: string; direct_quote: string; paper_title: string; location: string; confidence?: number }
```

Then in the evidence table rendering, where individual facts are shown, add the badge next to each fact's content. Look for the section rendering `evidence_table` lens content — add `<ConfidenceBadge value={fact.confidence || 0} />` next to each fact row.

- [ ] **Step 3: Build frontend**

Run: `cd /Users/chintanacharya/Projects/pramana/frontend && npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/ReportViewerDisplay.tsx
git commit -m "feat: add confidence badges to evidence table in report viewer"
```

---

### Task 10: Add DB migration startup check

**Files:**
- Modify: `src/pramana/api.py:31-52` (lifespan function)

- [ ] **Step 1: Add startup check for confidence column**

In `src/pramana/api.py`, after `create_tables(engine)` at line 49, add:

```python
    # Check if existing DB needs migration for new columns
    import sqlalchemy
    with sqlalchemy.inspect(engine).get_columns("extracted_facts") as cols:
        pass
    try:
        inspector = sqlalchemy.inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("extracted_facts")]
        if "confidence" not in columns:
            logger.warning(
                "DB migration needed: 'extracted_facts' table is missing 'confidence' column. "
                "Run: ALTER TABLE extracted_facts ADD COLUMN confidence REAL DEFAULT 0.0"
            )
    except Exception:
        pass  # Table may not exist yet — create_tables will handle it
```

- [ ] **Step 2: Run tests**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pramana/api.py
git commit -m "feat: add startup check for confidence column migration"
```

---

### Task 11: Update API paper endpoint to include confidence

**Files:**
- Modify: `src/pramana/api.py:306-336` (get_paper endpoint)

- [ ] **Step 1: Add confidence to fact serialization in get_paper**

In `src/pramana/api.py`, update the facts list comprehension in `get_paper` (line 326-334):

```python
            facts=[
                {
                    "id": f.id,
                    "fact_type": f.fact_type,
                    "content": f.content,
                    "direct_quote": f.direct_quote,
                    "location": f.location,
                    "confidence": f.confidence or 0.0,
                }
                for f in facts
            ],
```

- [ ] **Step 2: Run tests**

Run: `uv run pytest`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pramana/api.py
git commit -m "feat: include confidence score in paper facts API response"
```

---

### Task 12: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `uv run pytest -v`
Expected: All tests PASS (64 existing + ~20 new ≈ 84 total)

- [ ] **Step 2: Run linter**

Run: `uv run ruff check src/`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Build frontend**

Run: `cd /Users/chintanacharya/Projects/pramana/frontend && npm run build`
Expected: Clean build

- [ ] **Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "fix: lint fixes for Batch A pipeline quality"
```
