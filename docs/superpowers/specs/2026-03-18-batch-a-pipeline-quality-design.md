# Batch A: Pipeline Quality — Design Spec

> **Goal:** Improve extraction reliability and precision by adding confidence scoring, multi-stage screening, and multi-LLM ensemble extraction to Pramana's pipeline.

**Literature grounding:** 71-paper analysis (run_id 14) identified hallucinations, lack of validation, and single-pass extraction as top limitations. Ensemble methods achieve F1=0.93+ in biomedical extraction; multi-stage screening reduces cost 40-60% with minimal quality loss.

---

## 1. Confidence Scoring

### Purpose

Every extracted fact gets a confidence score (0.0–1.0) so users can prioritize which facts need human verification. Literature finding: "Replacing manual data extraction entirely with ChatGPT-4.o is not recommended" and "Expert oversight is necessary to mitigate hallucinations."

### Design

Two signals combined into a final score:

**Quote Quality Score (heuristic, 0.0–1.0):**
- `quote_in_source` (0.4 weight): Does the `direct_quote` appear verbatim (or near-verbatim via fuzzy match ≥ 0.85) in the source text?
- `location_specificity` (0.3 weight): Is `location` a specific page/section reference (e.g., "Section 3.2", "Page 7") vs. vague ("Introduction", "paper")?
- `content_divergence` (0.3 weight): Is `content` substantively different from `direct_quote`? (Levenshtein ratio < 0.8 = good, the LLM actually summarized rather than echoing the quote.)

**Agreement Score (ensemble-derived, 0.0–1.0):**
- When ensemble extraction is enabled, facts appearing in both extractor runs (fuzzy-matched on quote overlap ≥ 0.7) get agreement=1.0. Facts in only one run get agreement=0.3 (low but not zero — a single extractor finding is still evidence, just less certain).
- When ensemble is disabled, agreement defaults to 0.7 (neutral-high, since we can't penalize for lack of ensemble).

**Final confidence:**
```
confidence = 0.4 * quote_quality + 0.6 * agreement
```

With these defaults:
- Ensemble disabled, perfect quote quality: `0.4 * 1.0 + 0.6 * 0.7 = 0.82` (High) — reasonable since a good quote match is strong evidence.
- Ensemble enabled, matched fact, perfect quote: `0.4 * 1.0 + 0.6 * 1.0 = 1.0` (High)
- Ensemble enabled, unmatched fact, perfect quote: `0.4 * 1.0 + 0.6 * 0.3 = 0.58` (Medium) — appropriately cautious.

### Files

| File | Change |
|------|--------|
| `src/pramana/pipeline/confidence.py` | **New** — `score_quote_quality()`, `score_agreement()`, `compute_confidence()` |
| `src/pramana/pipeline/extraction.py` | Add `confidence: float = 0.0` field to the **Pydantic** `ExtractedFact` model (line 21). Update `_store_facts()` (line 114) to pass `confidence` when constructing `ExtractedFactDB`. |
| `src/pramana/models/schema.py` | Add `confidence = Column(Float, default=0.0)` to the **SQLAlchemy** `ExtractedFact` table (line 70). Note: both the Pydantic model and the DB model need the field — the Pydantic model carries it through the in-memory pipeline to lenses; the DB model persists it for the API. |
| `frontend/src/pages/ReportViewerDisplay.tsx` | Render confidence badges on facts in the Evidence Table section. Add badge next to each fact row in the evidence table lens rendering. |
| `frontend/src/api/client.ts` | Add `confidence: number` field to `Fact` interface (line 35). |

### Confidence thresholds for display

- `≥ 0.7` → High (teal badge, matches existing teal for "done" states)
- `0.4–0.69` → Medium (amber badge)
- `< 0.4` → Low (rose badge)

### Database migration note

The codebase uses `Base.metadata.create_all()` in the API lifespan (api.py), which only creates new tables — it won't add columns to existing tables. For existing databases, the `confidence` column must be added manually via `ALTER TABLE extracted_facts ADD COLUMN confidence REAL DEFAULT 0.0;` or by deleting the database to let it recreate. The implementation should include a startup check that logs a warning if the column is missing.

### Confidence data flow through the pipeline

The Pydantic `ExtractedFact.confidence` field survives through normalization because `NormalizedEvidence.facts` (normalization.py line 68) is typed as `list[ExtractedFact]` and passes the same objects through. Lenses receive `NormalizedEvidence` and can access `fact.confidence` for any fact. No changes to `normalization.py` are needed.

---

## 2. Multi-Stage Screening

### Purpose

Filter irrelevant papers before expensive full extraction. Currently every paper in the corpus goes through LLM extraction regardless of relevance. Literature identifies "multi-stage screening pipelines" as an emerging best practice.

### Design

Two sequential gates applied to an already-built `Corpus` object, **after** `build_corpus()` returns (not during corpus building). Screening mutates the paper dicts in-place by adding metadata fields.

**Gate 1 — Embedding Similarity (fast, free):**
- Use ChromaDB's built-in `collection.query()` API (which already computes cosine/L2 similarity internally) to query the paper collection with the hypothesis text. This returns distances for papers already embedded during `_store_papers()`.
- Papers whose distance exceeds the threshold (lower distance = more similar in ChromaDB's L2 metric) are tagged `screened_out=True` and excluded from extraction.
- Default threshold: `screening_similarity_threshold = 1.5` (L2 distance; papers farther than this from the hypothesis are filtered). Note: ChromaDB returns L2 distances by default, not cosine similarity. Lower = more similar.
- These papers remain in the corpus (available in the report) but don't get LLM extraction.

**Gate 2 — LLM Relevance Check (cheap, fast):**
- Papers passing Gate 1 get a single LLM call using the configured model.
- Model resolution: if `screening_model` is empty string, use `settings.llm_model`. Otherwise use `screening_model`.
- Prompt: "Given the research hypothesis: '{hypothesis}', is this paper relevant? Paper: '{title}. {abstract[:500]}'. Reply JSON: {relevant: bool, reason: string}"
- Papers marked `relevant: false` are tagged `screened_out=True` with the `reason` stored.

**Failure mode:** Both gates fail open. If ChromaDB is unavailable or the LLM call fails, all papers pass through to extraction (with a logged warning). This matches the existing error-handling pattern in the codebase (e.g., corpus.py lines 54-55).

**Screening results are logged and included in the report** so users can see what was filtered and why.

### Files

| File | Change |
|------|--------|
| `src/pramana/pipeline/screening.py` | **New** — `screen_corpus(corpus, query, settings) -> Corpus`. Mutates paper dicts by adding `screened_out: bool`, `relevance_score: float`, `screening_reason: str` fields. Returns the same Corpus with metadata added. |
| `src/pramana/config.py` | Add `screening_enabled: bool = True`, `screening_similarity_threshold: float = 1.5`, `screening_model: str = ""` |
| `src/pramana/llm/prompts.py` | Add `SCREENING_RELEVANCE_SYSTEM` and `SCREENING_RELEVANCE_USER` prompts |
| `src/pramana/api.py` | Insert `screen_corpus()` call in `_run_analysis()` between corpus building and extraction. Update pipeline stage list — see "Pipeline Stages" section below. |
| `src/pramana/pipeline/extraction.py` | `extract_all_evidence()` skips papers where `paper.get("screened_out")` is truthy. |

### Model resolution logic (applies to screening_model and ensemble_models)

```python
def resolve_model(configured: str, settings: Settings) -> str:
    """Resolve a model name, falling back to settings.llm_model if empty."""
    return configured if configured else settings.llm_model
```

This pattern is used in both screening (for `screening_model`) and ensemble (for entries in `ensemble_models`).

---

## 3. Multi-LLM Ensemble Extraction

### Purpose

Run multiple extractors with different prompt strategies, merge results via majority vote. Literature: ensemble methods achieve precision=1.00 on well-defined extraction tasks; DeepSeek-R1 achieves F1=0.93 with hybrid RAG approach.

### Design

**Extractors:**
- **Extractor A (Fact-focused):** Current `EVIDENCE_EXTRACTION_SYSTEM` prompt — identifies facts first, then finds supporting quotes.
- **Extractor B (Quote-first):** New `EVIDENCE_EXTRACTION_QUOTE_FIRST` prompt — finds notable direct quotes first, then categorizes them as facts. This reverses the cognitive flow and catches facts the first prompt misses.

Both call `extract_evidence_from_text()` which is modified to accept an optional `model: str | None = None` and `system_prompt: str | None = None` parameter. When provided, `model` is passed through to `chat_json()` (which already supports it at client.py line 56). When `system_prompt` is provided, it replaces the default `EVIDENCE_EXTRACTION_SYSTEM`.

**Merge strategy (`merge_results()`):**

1. For each fact from Extractor A, find the best matching fact from Extractor B using fuzzy match on `direct_quote` (threshold: Levenshtein ratio ≥ 0.7).
2. **Matched facts** (appear in both): Keep with `agreement=1.0`. Use the version with the more specific `location`. Content is taken from whichever has higher quote quality.
3. **Unmatched facts** (only in one extractor): Keep with `agreement=0.3`. These get lower confidence scores but aren't discarded — they may be valid facts one prompt caught that the other missed.

**Configurable models:** Each extractor can use a different model. Default: both use `settings.llm_model` (prompt diversity only). Users can configure `ensemble_models: ["gpt-4o", "gpt-4o-mini"]` for model diversity. Empty list or list with empty strings = fall back to `settings.llm_model`. Resolution uses the same `resolve_model()` pattern as screening.

### Files

| File | Change |
|------|--------|
| `src/pramana/pipeline/ensemble.py` | **New** — `ensemble_extract(text, title, hypothesis, settings) -> list[ExtractedFact]`. Calls `extract_evidence_from_text()` twice with different prompts/models, then `merge_results()`. Also contains `fuzzy_match_facts()`. |
| `src/pramana/pipeline/extraction.py` | Add `model: str | None = None` and `system_prompt: str | None = None` params to `extract_evidence_from_text()`. `extract_all_evidence()` delegates to `ensemble_extract()` when `settings.ensemble_enabled=True`, otherwise uses the existing single-extractor path. |
| `src/pramana/llm/prompts.py` | Add `EVIDENCE_EXTRACTION_QUOTE_FIRST` system prompt |
| `src/pramana/config.py` | Add `ensemble_enabled: bool = True`, `ensemble_models: list[str] = []` |

### Ensemble → Confidence integration

The ensemble module sets `fact.confidence` to a preliminary value based on agreement (1.0 for matched, 0.3 for unmatched). The confidence module then refines this by incorporating quote quality. When ensemble is disabled, `extract_evidence_from_text()` sets `fact.confidence = 0.0` and the confidence module applies its default agreement=0.7.

---

## Pipeline Stages (SSE progress update)

The current pipeline in `_run_analysis()` reports 6 stages to the frontend via SSE. This spec adds "screening" as a new stage. The updated stage list:

| # | Stage Key | Label | New? |
|---|-----------|-------|------|
| 1 | `parsing` | Parsing hypothesis | No |
| 2 | `retrieval` | Retrieving papers | No |
| 3 | `screening` | Screening papers | **Yes** |
| 4 | `extraction` | Extracting evidence | No (modified) |
| 5 | `normalization` | Normalizing | No |
| 6 | `analysis` | Running lenses | No |
| 7 | `report` | Generating report | No |

**Frontend update required:** `AnalysisProgress.tsx` STAGES array must be updated to include the new "screening" stage between "retrieval" and "extraction". The `icon` numbering shifts accordingly.

Note: Confidence scoring is **not** a separate SSE stage — it runs as part of the extraction stage (after ensemble merge, before returning facts). This keeps the progress UI clean and avoids a stage that completes almost instantly.

---

## Data Flow (modified pipeline)

```
Hypothesis Parsing
    → Corpus Building (papers from S2/arXiv/PubMed)
    → [NEW] Screening Gate 1: Embedding similarity filter (ChromaDB query)
    → [NEW] Screening Gate 2: LLM relevance check
    → [MODIFIED] Evidence Extraction
        ├─ If ensemble_enabled: run 2 extractors, merge results
        └─ If not: single extractor (current behavior)
    → [NEW] Confidence Scoring (quote quality + agreement, runs inline)
    → Normalization & Linking (unchanged — receives ExtractedFact with confidence field)
    → Analytical Lenses (unchanged — NormalizedEvidence.facts carry confidence)
    → Report Generation (confidence badges in evidence table)
```

---

## Configuration Summary

All new settings with sensible defaults:

```python
# Screening
screening_enabled: bool = True
screening_similarity_threshold: float = 1.5  # L2 distance cutoff
screening_model: str = ""  # empty = use llm_model

# Ensemble
ensemble_enabled: bool = True
ensemble_models: list[str] = []  # empty = use llm_model for all extractors
```

---

## Testing Strategy

### New tests

- **Confidence scoring** (`tests/test_confidence.py`):
  - Test `score_quote_quality()` with known source text + facts → verify scores
  - Test with verbatim quote (high score) vs. fabricated quote (low score)
  - Test location specificity: "Page 7, Section 3.2" > "Introduction" > "paper"
  - Test content divergence: fact content echoing quote (low) vs. summarized (high)
  - Test `compute_confidence()` with ensemble enabled vs. disabled

- **Screening** (`tests/test_screening.py`):
  - Test Gate 1 with mock ChromaDB results → verify threshold filtering
  - Test Gate 2 with mock LLM response → verify relevant/irrelevant tagging
  - Test fail-open behavior: mock ChromaDB failure → all papers pass through
  - Test fail-open behavior: mock LLM failure → all papers pass through
  - Test `screened_out` papers are skipped in `extract_all_evidence()`

- **Ensemble** (`tests/test_ensemble.py`):
  - Test `fuzzy_match_facts()` with known overlapping and non-overlapping facts
  - Test `merge_results()` with matched and unmatched facts → verify agreement scores
  - Test ensemble disabled → single extractor path unchanged

### Existing test regression

The existing 64 tests should continue to pass because:
- `extract_evidence_from_text()` gains optional params with defaults matching current behavior
- `extract_all_evidence()` falls back to single-extractor when ensemble is disabled
- Screening is a separate step that doesn't modify existing function signatures
- The `ExtractedFact` Pydantic model gains `confidence: float = 0.0` which defaults safely

Run `uv run pytest` after each feature to verify no regressions.

---

## What This Doesn't Include

- Frontend changes beyond confidence badges and the new screening stage (no new pages/panels)
- Changes to existing lenses (they consume the same `NormalizedEvidence`)
- Changes to the report chat feature
- Batches B, C, D features
