"""Database engine and session management."""

from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from pramana.config import Settings
from pramana.models.schema import Base


def get_engine(settings: Settings) -> Engine:
    """Create a SQLAlchemy engine from settings."""
    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{db_path}", echo=False)


def create_tables(engine: Engine) -> None:
    """Create all tables in the database."""
    Base.metadata.create_all(engine)
    _run_migrations(engine)


def _run_migrations(engine: Engine) -> None:
    """Apply incremental column additions for existing databases."""
    with engine.connect() as conn:
        # linked_section_id added in v2 batch
        cols = {row[1] for row in conn.execute(
            __import__("sqlalchemy").text("PRAGMA table_info(research_tasks)")
        )}
        if "linked_section_id" not in cols:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE research_tasks ADD COLUMN linked_section_id TEXT"
            ))
            conn.commit()
        # section_feedback table created by create_all; no action needed


@contextmanager
def get_session(settings: Settings | None = None):
    """Get a database session as a context manager."""
    if settings is None:
        from pramana.config import get_settings
        settings = get_settings()

    engine = get_engine(settings)
    create_tables(engine)
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def seed_venues(settings: Settings) -> None:
    """Seed the venue database from all venue_data/*.json files."""
    import json

    venue_dir = Path("venue_data")
    if not venue_dir.exists():
        return

    from pramana.models.schema import Venue

    with get_session(settings) as session:
        for venue_file in sorted(venue_dir.glob("*.json")):
            with open(venue_file) as f:
                venues_data = json.load(f)
            for v in venues_data:
                existing = session.query(Venue).filter_by(name=v["name"]).first()
                if not existing:
                    session.add(Venue(**v))
