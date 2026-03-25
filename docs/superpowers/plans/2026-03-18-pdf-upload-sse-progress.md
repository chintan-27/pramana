# PDF Upload + SSE Progress Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF upload for continuation-type analyses and replace polling-based progress with Server-Sent Events (SSE) for real-time pipeline updates.

**Architecture:** Two independent features that touch different parts of the stack. PDF upload adds a new endpoint that accepts multipart file uploads, extracts text via the existing `pymupdf`-based `extract_text_from_bytes()`, and feeds it into the analysis as prior research context. SSE replaces the current 2-second polling interval on the progress page with a persistent `text/event-stream` connection using FastAPI's `StreamingResponse`, giving instant stage transitions and richer progress data (paper counts, fact counts, etc.).

**Tech Stack:** FastAPI (StreamingResponse for SSE, UploadFile for multipart), PyMuPDF (already installed), React EventSource API, existing Tailwind/design system.

**Literature grounding:** The KNIME PDF extraction paper (paper 273) validated that LLM workflows achieve 81%+ accuracy extracting from scientific PDFs — confirms our `pymupdf` → LLM pipeline approach. The hybrid RAG + classification paper (paper 274) showed real-time feedback loops improve researcher trust. The expert oversight paper (paper 282) emphasizes structured feedback integration at multiple pipeline stages — SSE enables this by exposing granular stage data.

---

## File Structure

### PDF Upload

| File | Role |
|------|------|
| `src/pramana/api.py` | New `POST /api/upload-pdf` endpoint, modify `POST /api/analyze` to accept `pdf_run_ids` |
| `frontend/src/api/client.ts` | New `uploadPdf()` function |
| `frontend/src/pages/HypothesisInput.tsx` | PDF upload dropzone when continuation/related selected |
| `tests/test_api.py` | Tests for upload + analyze-with-pdf endpoints |
| `pyproject.toml` | Add `python-multipart` dependency |

### SSE Progress

| File | Role |
|------|------|
| `src/pramana/api.py` | New `GET /api/analyze/{run_id}/stream` SSE endpoint, add richer progress data to `_analysis_store` |
| `frontend/src/api/client.ts` | New `streamAnalysisProgress()` function returning EventSource |
| `frontend/src/pages/AnalysisProgress.tsx` | Replace polling with SSE, show richer per-stage stats |
| `tests/test_api.py` | Tests for SSE endpoint |

---

## Task 1: Add `python-multipart` dependency

**Files:**
- Modify: `pyproject.toml:18`

- [ ] **Step 1: Add dependency**

In `pyproject.toml`, add `"python-multipart>=0.0.7"` to the `dependencies` list after `"pymupdf>=1.23"`:

```toml
    "pymupdf>=1.23",
    "python-multipart>=0.0.7",
    "httpx>=0.25",
```

- [ ] **Step 2: Install**

Run: `uv sync`
Expected: Resolves and installs `python-multipart`

- [ ] **Step 3: Verify**

Run: `uv run python -c "from fastapi import UploadFile, File; from fastapi import FastAPI; app = FastAPI(); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "deps: add python-multipart for file upload support"
```

---

## Task 2: PDF upload endpoint + tests

**Files:**
- Modify: `src/pramana/api.py` (add endpoint around line 120, after the models section)
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api.py`:

```python
def test_upload_pdf(client):
    """POST /api/upload-pdf accepts a PDF and returns extracted text."""
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Test paper content about neural networks.")
    pdf_bytes = doc.tobytes()
    doc.close()

    response = client.post(
        "/api/upload-pdf",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "file_id" in data
    assert "text_preview" in data
    assert "neural networks" in data["text_preview"].lower()
    assert data["page_count"] > 0


def test_upload_pdf_invalid_file(client):
    """POST /api/upload-pdf rejects non-PDF files."""
    response = client.post(
        "/api/upload-pdf",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_pdf_empty(client):
    """POST /api/upload-pdf rejects empty files."""
    response = client.post(
        "/api/upload-pdf",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_api.py::test_upload_pdf tests/test_api.py::test_upload_pdf_invalid_file tests/test_api.py::test_upload_pdf_empty -v`
Expected: FAIL — no `/api/upload-pdf` endpoint

- [ ] **Step 3: Implement the upload endpoint**

In `src/pramana/api.py`, add the import at the top (with existing imports):

```python
from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
```

Add an in-memory store for uploaded PDF text (next to `_analysis_store`):

```python
_pdf_store: dict[str, dict] = {}  # file_id -> {"text": str, "filename": str, "page_count": int}
```

Add the endpoint after the request/response models section (before `start_analysis`):

```python
@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile):
    """Upload a PDF and extract its text for use as prior research context."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "File must be a PDF")

    content = await file.read()
    if not content:
        raise HTTPException(400, "File is empty")

    if not content[:5] == b"%PDF-":
        raise HTTPException(400, "File does not appear to be a valid PDF")

    from pramana.sources.pdf import extract_text_from_bytes

    text = extract_text_from_bytes(content)
    if not text.strip():
        raise HTTPException(400, "Could not extract text from PDF")

    # Count pages from [Page N] markers
    page_count = text.count("[Page ")

    file_id = str(uuid.uuid4())
    _pdf_store[file_id] = {
        "text": text,
        "filename": file.filename,
        "page_count": page_count,
    }

    return {
        "file_id": file_id,
        "filename": file.filename,
        "page_count": page_count,
        "char_count": len(text),
        "text_preview": text[:500],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_api.py::test_upload_pdf tests/test_api.py::test_upload_pdf_invalid_file tests/test_api.py::test_upload_pdf_empty -v`
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add src/pramana/api.py tests/test_api.py
git commit -m "feat: add PDF upload endpoint with text extraction"
```

---

## Task 3: Wire uploaded PDFs into analysis + tests

**Files:**
- Modify: `src/pramana/api.py` (modify `AnalyzeRequest` and `start_analysis`)
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api.py`:

```python
def test_analyze_with_pdf_context(client):
    """POST /api/analyze with pdf_file_ids includes PDF text as prior research."""
    from pramana.api import _pdf_store

    # Pre-populate a PDF in the store
    file_id = "test-pdf-id"
    _pdf_store[file_id] = {
        "text": "Our prior study found that ResNet-50 achieves 92% accuracy on retinal scans.",
        "filename": "prior_work.pdf",
        "page_count": 1,
    }

    with patch("pramana.api._run_analysis"):
        response = client.post("/api/analyze", json={
            "hypothesis": "Deep learning for retinal imaging",
            "initiation_type": "continuation",
            "max_papers": 10,
            "pdf_file_ids": [file_id],
        })
        assert response.status_code == 200

    from pramana.api import _analysis_store
    run_id = response.json()["run_id"]
    store = _analysis_store[run_id]
    assert "ResNet-50" in store["prior_research"]

    # Cleanup
    del _analysis_store[run_id]
    del _pdf_store[file_id]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_api.py::test_analyze_with_pdf_context -v`
Expected: FAIL — `pdf_file_ids` not recognized

- [ ] **Step 3: Implement PDF context wiring**

In `src/pramana/api.py`, update `AnalyzeRequest`:

```python
class AnalyzeRequest(BaseModel):
    hypothesis: str
    initiation_type: str = "new"
    max_papers: int = 50
    prior_research: str = ""
    pdf_file_ids: list[str] = []
```

In `start_analysis`, after the sanitization lines and before `run_id = ...`, add PDF text assembly:

```python
    # Append uploaded PDF text to prior research
    pdf_texts = []
    for fid in request.pdf_file_ids:
        if fid in _pdf_store:
            pdf_data = _pdf_store[fid]
            pdf_texts.append(
                f"--- Uploaded: {pdf_data['filename']} ---\n{pdf_data['text']}"
            )
    if pdf_texts:
        separator = "\n\n"
        combined = separator.join(pdf_texts)
        # Truncate combined PDF text to 20K chars to stay within context budget
        if len(combined) > 20000:
            combined = combined[:20000]
        if request.prior_research:
            request.prior_research += "\n\n" + combined
        else:
            request.prior_research = combined
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_api.py::test_analyze_with_pdf_context -v`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `uv run pytest -v`
Expected: All pass (existing tests not broken)

- [ ] **Step 6: Commit**

```bash
git add src/pramana/api.py tests/test_api.py
git commit -m "feat: wire uploaded PDFs into analysis as prior research context"
```

---

## Task 4: Frontend PDF upload UI

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/HypothesisInput.tsx`

- [ ] **Step 1: Add `uploadPdf` to API client**

In `frontend/src/api/client.ts`, add the interface and function before `connectWebSocket`:

```typescript
export interface PdfUploadResult {
  file_id: string;
  filename: string;
  page_count: number;
  char_count: number;
  text_preview: string;
}

export async function uploadPdf(file: File): Promise<PdfUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/upload-pdf`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Upload failed: ${res.statusText}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Add PDF upload section to HypothesisInput**

In `frontend/src/pages/HypothesisInput.tsx`:

Add imports at the top:
```typescript
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis, uploadPdf, type PdfUploadResult } from '../api/client';
```

Add state after existing state declarations:
```typescript
  const [uploadedPdfs, setUploadedPdfs] = useState<PdfUploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
```

Add handler function after `handleSubmit`:
```typescript
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadPdf(file);
        setUploadedPdfs((prev) => [...prev, result]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePdf = (fileId: string) => {
    setUploadedPdfs((prev) => prev.filter((p) => p.file_id !== fileId));
  };
```

Modify `handleSubmit` to include PDF file IDs — change the `startAnalysis` call:
```typescript
      const result = await startAnalysis({
        hypothesis: hypothesis.trim(),
        initiation_type: type,
        max_papers: maxPapers,
        prior_research: priorResearch.trim() || undefined,
        pdf_file_ids: uploadedPdfs.map((p) => p.file_id),
      });
```

Add the upload UI after the prior research textarea block (inside the `{showPrior && (` conditional, after the closing `</textarea>` tag):

```tsx
            {/* PDF Upload */}
            <div className="mt-4">
              <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-2 block">
                Upload Papers <span className="text-cream-faint normal-case tracking-normal">(optional)</span>
              </label>
              <p className="text-[12px] text-cream-faint mb-2">
                Upload your previous papers as PDF to include as context.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 border-2 border-dashed border-line rounded-lg text-sm text-cream-muted hover:border-amber/40 hover:text-cream transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin-slow w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Extracting text...
                  </span>
                ) : (
                  'Drop PDFs here or click to upload'
                )}
              </button>

              {/* Uploaded file pills */}
              {uploadedPdfs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadedPdfs.map((pdf) => (
                    <div
                      key={pdf.file_id}
                      className="flex items-center justify-between p-2.5 bg-bg-card border border-line rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-cream truncate">{pdf.filename}</p>
                        <p className="text-[11px] text-cream-faint font-mono">
                          {pdf.page_count} pages &middot; {Math.round(pdf.char_count / 1000)}k chars
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePdf(pdf.file_id)}
                        className="shrink-0 ml-2 p-1 text-cream-faint hover:text-rose transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
```

- [ ] **Step 3: Update `AnalyzeRequest` type in client**

In `frontend/src/api/client.ts`, update the `AnalyzeRequest` interface:

```typescript
export interface AnalyzeRequest {
  hypothesis: string;
  initiation_type: string;
  max_papers: number;
  prior_research?: string;
  pdf_file_ids?: string[];
}
```

- [ ] **Step 4: Build frontend**

Run: `cd frontend && npm run build`
Expected: Clean build, no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/HypothesisInput.tsx
git commit -m "feat: PDF upload UI for continuation/related research types"
```

---

## Task 5: SSE progress endpoint + tests

**Files:**
- Modify: `src/pramana/api.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api.py`:

```python
def test_sse_stream_completed(client):
    """GET /api/analyze/{run_id}/stream returns SSE events for completed run."""
    run_id = "test-sse-done"
    _analysis_store[run_id] = {
        "status": "completed",
        "stage": "done",
        "progress": {"step": 6, "total": 6, "description": "Done"},
        "error": None,
    }

    with client.stream("GET", f"/api/analyze/{run_id}/stream") as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        # Read first event
        text = ""
        for line in response.iter_lines():
            text += line + "\n"
            if line.startswith("data:"):
                break

    assert "data:" in text
    assert '"completed"' in text

    del _analysis_store[run_id]


def test_sse_stream_not_found(client):
    """GET /api/analyze/{run_id}/stream returns 404 for unknown run."""
    response = client.get("/api/analyze/nonexistent/stream")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_api.py::test_sse_stream_completed tests/test_api.py::test_sse_stream_not_found -v`
Expected: FAIL — no `/stream` endpoint

- [ ] **Step 3: Implement SSE endpoint**

In `src/pramana/api.py`, add import at the top:

```python
from starlette.responses import StreamingResponse
```

Add the SSE endpoint after `get_analysis_status` and before `get_analysis_report`:

```python
@app.get("/api/analyze/{run_id}/stream")
async def stream_analysis_progress(run_id: str):
    """Stream analysis progress via Server-Sent Events."""
    if run_id not in _analysis_store:
        raise HTTPException(404, "Analysis run not found")

    async def event_generator():
        last_stage = None
        while True:
            if run_id not in _analysis_store:
                break
            store = _analysis_store[run_id]
            payload = json.dumps({
                "run_id": run_id,
                "status": store["status"],
                "stage": store["stage"],
                "progress": store["progress"],
                "error": store["error"],
            })
            # Send on every poll so client stays updated
            yield f"data: {payload}\n\n"

            if store["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_api.py::test_sse_stream_completed tests/test_api.py::test_sse_stream_not_found -v`
Expected: 2 PASSED

- [ ] **Step 5: Enrich progress data in `_run_analysis`**

In the existing `_run_analysis` function, add more granular progress updates. Note: `papers_found` and `facts_extracted` already exist — only add the NEW fields below.

After corpus building (stage 2), the existing `store["progress"]["papers_found"]` is already set. Add source breakdown right after it:
```python
        store["progress"]["sources"] = {
            "s2": corpus.total_from_s2,
            "arxiv": corpus.total_from_arxiv,
            "pubmed": corpus.total_from_pubmed,
        }
```

After evidence extraction (stage 3), `facts_extracted` already exists. Add:
```python
        store["progress"]["papers_processed"] = len(corpus.papers)
```

After normalization (stage 4), add:
```python
        store["progress"]["mappings"] = len(normalized.canonical_mappings)
        store["progress"]["categories"] = len(normalized.categories)
```

After analysis (stage 5), add:
```python
        store["progress"]["lenses_completed"] = results.active_lenses
```

- [ ] **Step 6: Run all tests**

Run: `uv run pytest -v`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/pramana/api.py tests/test_api.py
git commit -m "feat: add SSE endpoint for real-time analysis progress streaming"
```

---

## Task 6: Frontend SSE client + progress page rewrite

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/AnalysisProgress.tsx`

- [ ] **Step 1: Add SSE client function**

In `frontend/src/api/client.ts`, add before `connectWebSocket`:

```typescript
export function streamAnalysisProgress(
  runId: string,
  onEvent: (data: RunStatus) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}/analyze/${runId}/stream`);
  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onEvent(data);
  };
  es.onerror = (err) => {
    if (onError) onError(err);
    es.close();
  };
  return es;
}
```

- [ ] **Step 2: Rewrite AnalysisProgress to use SSE with richer stats**

Replace the full content of `frontend/src/pages/AnalysisProgress.tsx`:

```tsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { streamAnalysisProgress, type RunStatus } from '../api/client';

const STAGES = [
  { key: 'parsing', label: 'Parsing hypothesis', sub: 'Extracting domains, topics, search queries', icon: '01' },
  { key: 'retrieval', label: 'Retrieving papers', sub: 'Semantic Scholar, arXiv, PubMed', icon: '02' },
  { key: 'extraction', label: 'Extracting evidence', sub: 'Facts, quotes, locations from each paper', icon: '03' },
  { key: 'normalization', label: 'Normalizing', sub: 'Canonicalizing terms, building vectors', icon: '04' },
  { key: 'analysis', label: 'Running lenses', sub: 'Applying analytical lenses to evidence', icon: '05' },
  { key: 'report', label: 'Generating report', sub: 'Compiling findings and recommendations', icon: '06' },
];

export default function AnalysisProgress() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [error, setError] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    const es = streamAnalysisProgress(
      runId,
      (data) => {
        setStatus(data);
        if (data.status === 'completed') {
          es.close();
          navigate(`/report/${runId}`);
        }
        if (data.status === 'failed') {
          es.close();
          setError(data.error || 'Analysis failed');
        }
      },
      () => {
        setError('Lost connection to server');
      },
    );
    esRef.current = es;

    return () => es.close();
  }, [runId, navigate]);

  const currentIdx = status ? STAGES.findIndex((s) => s.key === status.stage) : -1;
  const progress = (status?.progress || {}) as Record<string, unknown>;

  return (
    <div className="max-w-lg mx-auto pt-16 animate-fade-up">
      {/* Header */}
      <div className="mb-12">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">
          Processing
        </p>
        <h1 className="font-display text-3xl text-cream font-300 tracking-tight">
          Analysis in progress
        </h1>
        <p className="text-sm text-cream-muted mt-2">
          Streaming live updates from the pipeline.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-rose-subtle border border-rose/20 rounded-lg">
          <p className="font-medium text-rose text-sm">Analysis Failed</p>
          <p className="text-sm text-rose/70 mt-1">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm font-medium text-amber hover:text-amber-glow transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Live stats bar */}
      {progress.papers_found != null && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
            <p className="text-lg font-display font-600 text-cream">{progress.papers_found as number}</p>
            <p className="text-[10px] text-cream-faint font-mono">papers found</p>
          </div>
          {progress.facts_extracted != null && (
            <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
              <p className="text-lg font-display font-600 text-cream">{progress.facts_extracted as number}</p>
              <p className="text-[10px] text-cream-faint font-mono">facts extracted</p>
            </div>
          )}
          {progress.lenses_completed != null && (
            <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
              <p className="text-lg font-display font-600 text-cream">{(progress.lenses_completed as string[]).length}</p>
              <p className="text-[10px] text-cream-faint font-mono">lenses done</p>
            </div>
          )}
        </div>
      )}

      {/* Pipeline stages */}
      <div className="space-y-0 stagger">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isPending = i > currentIdx;

          return (
            <div
              key={stage.key}
              className={`pipeline-connector flex items-start gap-4 pb-7 transition-opacity duration-300 ${isPending ? 'opacity-25' : ''}`}
            >
              {/* Indicator */}
              <div className="shrink-0 relative z-10">
                {isDone ? (
                  <div className="w-11 h-11 rounded-lg bg-teal/15 border border-teal/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-11 h-11 rounded-lg bg-amber-subtle border border-amber/30 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-amber glow-dot" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-bg-card border border-line flex items-center justify-center">
                    <span className="text-xs font-mono text-cream-faint">{stage.icon}</span>
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="pt-2.5 min-w-0">
                <p className={`text-sm font-medium ${
                  isActive ? 'text-amber' : isDone ? 'text-cream' : 'text-cream-muted'
                }`}>
                  {stage.label}
                </p>
                <p className="text-[12px] text-cream-faint mt-0.5">{stage.sub}</p>
                {isActive && progress.description && (
                  <p className="text-[12px] text-amber/80 font-mono mt-1.5">
                    {progress.description as string}
                  </p>
                )}
                {/* Stage-specific live stats */}
                {isDone && stage.key === 'retrieval' && progress.sources && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    S2: {(progress.sources as Record<string, number>).s2} &middot;
                    arXiv: {(progress.sources as Record<string, number>).arxiv} &middot;
                    PubMed: {(progress.sources as Record<string, number>).pubmed}
                  </p>
                )}
                {isDone && stage.key === 'extraction' && progress.facts_extracted != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {progress.facts_extracted as number} facts from {progress.papers_processed as number || '?'} papers
                  </p>
                )}
                {isDone && stage.key === 'normalization' && progress.mappings != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {progress.mappings as number} mappings &middot; {progress.categories as number} categories
                  </p>
                )}
                {isDone && stage.key === 'analysis' && progress.lenses_completed && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {(progress.lenses_completed as string[]).join(', ')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run ID */}
      <div className="mt-8 text-center">
        <span className="text-[10px] font-mono text-cream-faint bg-bg-card px-3 py-1.5 rounded border border-line">
          {runId}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/AnalysisProgress.tsx
git commit -m "feat: replace polling with SSE for real-time progress streaming"
```

---

## Task 7: Clean up WebSocket endpoint (optional, remove dead code)

**Files:**
- Modify: `src/pramana/api.py` (remove WebSocket endpoint and `_ws_connections`)
- Modify: `frontend/src/api/client.ts` (remove `connectWebSocket`)

- [ ] **Step 1: Check nothing else uses WebSocket**

Run: `grep -r "connectWebSocket\|ws_analysis\|_ws_connections\|WebSocket" frontend/src/ src/pramana/ --include="*.ts" --include="*.tsx" --include="*.py" -l`

Verify only `api.py` and `client.ts` reference them.

- [ ] **Step 2: Remove WebSocket endpoint from API**

Remove the `ws_analysis_progress` function and the `_ws_connections` dict from `src/pramana/api.py`. Remove `WebSocket` and `WebSocketDisconnect` from the FastAPI import. Remove `websockets>=12.0` from `pyproject.toml`.

- [ ] **Step 3: Remove `connectWebSocket` from client**

Remove the `connectWebSocket` function from `frontend/src/api/client.ts`.

- [ ] **Step 4: Run all tests + build**

Run: `uv run pytest -v && cd frontend && npm run build`
Expected: All pass, clean build

- [ ] **Step 5: Commit**

```bash
git add src/pramana/api.py frontend/src/api/client.ts pyproject.toml
git commit -m "refactor: remove WebSocket in favor of SSE for progress streaming"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `uv run pytest -v`
Expected: All tests pass (including new ones)

- [ ] **Step 2: Run linter**

Run: `uv run ruff check src/`
Expected: No new errors from our changes

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 4: Manual smoke test**

1. Start backend: `uv run uvicorn pramana.api:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Go to homepage, select "Continuation" type
4. Upload a PDF — verify it shows filename, page count, char count
5. Start an analysis — verify SSE progress shows live stats (paper counts, fact counts per stage)
6. When report loads, verify the chat panel appears beside it
7. Test on narrow viewport — verify chat collapses to bottom drawer

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from smoke testing"
```
