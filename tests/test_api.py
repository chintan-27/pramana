"""Tests for FastAPI backend."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pramana.api import _analysis_store, app


@pytest.fixture
def client(settings):
    """Create a test client with mocked settings."""
    with patch("pramana.api.get_settings", return_value=settings):
        with TestClient(app) as c:
            yield c


def test_list_venues(client):
    """GET /api/venues returns venue list."""
    response = client.get("/api/venues")
    assert response.status_code == 200
    venues = response.json()
    assert isinstance(venues, list)
    assert len(venues) > 0
    assert venues[0]["name"]


def test_list_venues_filter(client):
    """GET /api/venues?domain=bme filters by domain."""
    response = client.get("/api/venues?domain=bme")
    assert response.status_code == 200
    venues = response.json()
    assert all("bme" in v["domain"] for v in venues)


def test_start_analysis(client):
    """POST /api/analyze starts an analysis run."""
    with patch("pramana.api._run_analysis"):
        response = client.post("/api/analyze", json={
            "hypothesis": "External validation is rare in DL medical imaging",
            "initiation_type": "new",
            "max_papers": 10,
        })
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        assert data["status"] == "pending"


def test_get_analysis_status(client):
    """GET /api/analyze/{run_id} returns status."""
    # Inject a fake analysis
    run_id = "test-run-123"
    _analysis_store[run_id] = {
        "status": "running",
        "stage": "retrieval",
        "progress": {"step": 2, "total": 6},
        "error": None,
    }

    response = client.get(f"/api/analyze/{run_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert data["stage"] == "retrieval"

    # Cleanup
    del _analysis_store[run_id]


def test_get_analysis_status_not_found(client):
    """GET /api/analyze/{run_id} returns 404 for unknown run."""
    response = client.get("/api/analyze/nonexistent")
    assert response.status_code == 404


def test_get_report_not_completed(client):
    """GET /api/analyze/{run_id}/report returns 400 if not completed."""
    run_id = "test-run-incomplete"
    _analysis_store[run_id] = {
        "status": "running",
        "stage": "extraction",
        "progress": {},
        "error": None,
        "result": None,
    }

    response = client.get(f"/api/analyze/{run_id}/report")
    assert response.status_code == 400

    del _analysis_store[run_id]


def test_get_report_completed(client):
    """GET /api/analyze/{run_id}/report returns report when completed."""
    run_id = "test-run-done"
    _analysis_store[run_id] = {
        "status": "completed",
        "stage": "done",
        "progress": {},
        "error": None,
        "result": {"hypothesis": {}, "lens_results": []},
    }

    response = client.get(f"/api/analyze/{run_id}/report")
    assert response.status_code == 200
    data = response.json()
    assert "report" in data

    del _analysis_store[run_id]


def test_get_paper_not_found(client):
    """GET /api/papers/{id} returns 404 for unknown paper."""
    response = client.get("/api/papers/99999")
    assert response.status_code == 404


def test_search_evidence_empty(client):
    """GET /api/evidence returns empty results for new DB."""
    response = client.get("/api/evidence?query=test")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0


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


def test_analyze_with_pdf_context(client):
    """POST /api/analyze with pdf_file_ids includes PDF text as prior research."""
    from pramana.api import _pdf_store

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

    del _analysis_store[run_id]
    del _pdf_store[file_id]
