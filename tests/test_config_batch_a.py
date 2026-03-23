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
