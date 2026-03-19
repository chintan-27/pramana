"""Tests for expert feedback API endpoints."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pramana.api import app
from pramana.models.database import get_session
from pramana.models.schema import Paper
from pramana.models.schema import ExtractedFact as ExtractedFactDB


@pytest.fixture()
def client(settings):
    """Create test client with patched settings."""
    with patch("pramana.api.get_settings", return_value=settings):
        with TestClient(app) as c:
            # Seed a paper and fact for testing
            with get_session(settings) as session:
                paper = Paper(title="Test Paper", authors="[]", year=2024, venue="Test")
                session.add(paper)
                session.flush()
                fact = ExtractedFactDB(
                    paper_id=paper.id,
                    fact_type="method",
                    content="ResNet-50",
                    direct_quote="we used ResNet-50",
                    location="p.3",
                    confidence=0.8,
                )
                session.add(fact)
                session.flush()
            yield c


def test_submit_feedback_confirm(client):
    response = client.post("/api/feedback", json={
        "fact_id": 1, "action": "confirm", "comment": "Verified"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["action"] == "confirm"
    assert data["comment"] == "Verified"
    assert data["fact_id"] == 1


def test_submit_feedback_reject(client):
    response = client.post("/api/feedback", json={
        "fact_id": 1, "action": "reject", "comment": "Incorrect extraction"
    })
    assert response.status_code == 200
    assert response.json()["action"] == "reject"


def test_submit_feedback_invalid_action(client):
    response = client.post("/api/feedback", json={
        "fact_id": 1, "action": "invalid"
    })
    assert response.status_code == 400


def test_submit_feedback_missing_fact(client):
    response = client.post("/api/feedback", json={
        "fact_id": 9999, "action": "confirm"
    })
    assert response.status_code == 404


def test_get_feedback(client):
    # Submit two feedbacks
    client.post("/api/feedback", json={
        "fact_id": 1, "action": "confirm", "comment": "Good"
    })
    client.post("/api/feedback", json={
        "fact_id": 1, "action": "comment", "comment": "Needs context"
    })
    response = client.get("/api/feedback/1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_feedback_empty(client):
    response = client.get("/api/feedback/1")
    assert response.status_code == 200
    assert response.json() == []
