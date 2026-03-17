"""Tests for FastAPI backend."""

import json
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from pramana.api import app, _analysis_store


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
