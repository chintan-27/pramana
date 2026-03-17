"""Shared test fixtures."""

import tempfile
from pathlib import Path

import pytest

from pramana.config import Settings


@pytest.fixture
def tmp_data_dir(tmp_path: Path) -> Path:
    """Temporary data directory for tests."""
    data = tmp_path / "data"
    data.mkdir()
    (data / "chroma").mkdir()
    (data / "pdfs").mkdir()
    return data


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
    )


@pytest.fixture
def db_session(settings: Settings):
    """Database session for tests."""
    from pramana.models.database import create_tables, get_engine

    engine = get_engine(settings)
    create_tables(engine)

    from sqlalchemy.orm import Session
    with Session(engine) as session:
        yield session
