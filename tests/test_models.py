"""Tests for data models and database operations."""

import json

from pramana.models.database import create_tables, get_engine, get_session, seed_venues
from pramana.models.schema import (
    AnalysisRun,
    Base,
    Blog,
    BlogCitation,
    ExtractedFact,
    Hypothesis,
    NormalizedFact,
    Paper,
    Venue,
)


def test_create_tables(settings):
    """Tables can be created without errors."""
    engine = get_engine(settings)
    create_tables(engine)
    # Verify tables exist
    assert set(Base.metadata.tables.keys()) == {
        "hypotheses", "papers", "blogs", "blog_citations",
        "extracted_facts", "normalized_facts", "venues", "analysis_runs",
        "expert_feedback",
    }


def test_hypothesis_crud(db_session):
    """Hypothesis CRUD operations work."""
    h = Hypothesis(
        text="External validation is rare in DL medical imaging",
        initiation_type="new",
        parsed_query=json.dumps({"domains": ["bme"]}),
    )
    db_session.add(h)
    db_session.flush()

    fetched = db_session.query(Hypothesis).first()
    assert fetched.text == "External validation is rare in DL medical imaging"
    assert fetched.initiation_type == "new"
    assert json.loads(fetched.parsed_query) == {"domains": ["bme"]}


def test_paper_crud(db_session):
    """Paper CRUD operations work."""
    p = Paper(
        title="Deep Learning for Medical Imaging",
        authors=json.dumps(["Alice", "Bob"]),
        year=2024,
        venue="MICCAI",
        doi="10.1234/test",
        abstract="A study on deep learning.",
    )
    db_session.add(p)
    db_session.flush()

    fetched = db_session.query(Paper).first()
    assert fetched.title == "Deep Learning for Medical Imaging"
    assert fetched.year == 2024
    assert json.loads(fetched.authors) == ["Alice", "Bob"]


def test_extracted_fact_with_paper(db_session):
    """ExtractedFact is linked to Paper."""
    p = Paper(title="Test Paper", year=2024)
    db_session.add(p)
    db_session.flush()

    fact = ExtractedFact(
        paper_id=p.id,
        fact_type="dataset",
        content="Used ImageNet for evaluation",
        direct_quote="We evaluated on the ImageNet-1K benchmark",
        location="Section 4.1, p.5",
    )
    db_session.add(fact)
    db_session.flush()

    fetched = db_session.query(ExtractedFact).first()
    assert fetched.paper.title == "Test Paper"
    assert fetched.fact_type == "dataset"
    assert fetched.direct_quote == "We evaluated on the ImageNet-1K benchmark"


def test_normalized_fact(db_session):
    """NormalizedFact links to ExtractedFact."""
    p = Paper(title="Test Paper", year=2024)
    db_session.add(p)
    db_session.flush()

    fact = ExtractedFact(
        paper_id=p.id, fact_type="metric",
        content="AUC-ROC", direct_quote="We report AUC-ROC", location="p.3",
    )
    db_session.add(fact)
    db_session.flush()

    nf = NormalizedFact(fact_id=fact.id, canonical_name="AUROC", category="metric")
    db_session.add(nf)
    db_session.flush()

    fetched = db_session.query(NormalizedFact).first()
    assert fetched.canonical_name == "AUROC"
    assert fetched.fact.content == "AUC-ROC"


def test_venue_crud(db_session):
    """Venue CRUD operations work."""
    v = Venue(name="MICCAI", venue_type="conference", domain="bme", tier="1")
    db_session.add(v)
    db_session.flush()

    fetched = db_session.query(Venue).first()
    assert fetched.name == "MICCAI"
    assert fetched.tier == "1"


def test_analysis_run(db_session):
    """AnalysisRun links to Hypothesis."""
    h = Hypothesis(text="Test hypothesis", initiation_type="new")
    db_session.add(h)
    db_session.flush()

    run = AnalysisRun(hypothesis_id=h.id, status="running", config=json.dumps({"max_papers": 50}))
    db_session.add(run)
    db_session.flush()

    fetched = db_session.query(AnalysisRun).first()
    assert fetched.status == "running"
    assert fetched.hypothesis.text == "Test hypothesis"


def test_blog_citation(db_session):
    """BlogCitation links Blog to Paper."""
    p = Paper(title="Test Paper", year=2024)
    b = Blog(url="https://example.com/blog", title="Test Blog")
    db_session.add_all([p, b])
    db_session.flush()

    bc = BlogCitation(blog_id=b.id, paper_id=p.id)
    db_session.add(bc)
    db_session.flush()

    assert len(p.blog_citations) == 1
    assert p.blog_citations[0].blog.title == "Test Blog"


def test_seed_venues(settings):
    """Venue seeding from JSON works."""
    seed_venues(settings)
    with get_session(settings) as session:
        count = session.query(Venue).count()
        assert count > 0
        miccai = session.query(Venue).filter_by(name="MICCAI").first()
        assert miccai is not None
        assert miccai.venue_type == "conference"
