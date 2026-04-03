"""SQLAlchemy ORM models for Pramana."""


from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Hypothesis(Base):
    __tablename__ = "hypotheses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    text = Column(Text, nullable=False)
    initiation_type = Column(String(50), nullable=False)
    parsed_query = Column(Text)  # JSON string of HypothesisQuery
    created_at = Column(DateTime, default=func.now())

    analysis_runs = relationship("AnalysisRun", back_populates="hypothesis")


class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    authors = Column(Text)  # JSON list
    year = Column(Integer)
    venue = Column(String(500))
    doi = Column(String(200), unique=True)
    arxiv_id = Column(String(50), unique=True)
    pubmed_id = Column(String(50), unique=True)
    s2_id = Column(String(50), unique=True)
    url = Column(Text)
    pdf_path = Column(Text)
    abstract = Column(Text)
    full_text = Column(Text)
    created_at = Column(DateTime, default=func.now())

    extracted_facts = relationship("ExtractedFact", back_populates="paper")
    blog_citations = relationship("BlogCitation", back_populates="paper")


class Blog(Base):
    __tablename__ = "blogs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(Text, nullable=False, unique=True)
    title = Column(Text)
    source = Column(String(200))
    content_summary = Column(Text)
    created_at = Column(DateTime, default=func.now())

    citations = relationship("BlogCitation", back_populates="blog")


class BlogCitation(Base):
    __tablename__ = "blog_citations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    blog_id = Column(Integer, ForeignKey("blogs.id"), nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)

    blog = relationship("Blog", back_populates="citations")
    paper = relationship("Paper", back_populates="blog_citations")


class ExtractedFact(Base):
    __tablename__ = "extracted_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    fact_type = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    direct_quote = Column(Text, nullable=False)
    location = Column(String(200), nullable=False)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=func.now())

    paper = relationship("Paper", back_populates="extracted_facts")
    normalized_facts = relationship("NormalizedFact", back_populates="fact")


class NormalizedFact(Base):
    __tablename__ = "normalized_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fact_id = Column(Integer, ForeignKey("extracted_facts.id"), nullable=False)
    canonical_name = Column(String(500), nullable=False)
    category = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=func.now())

    fact = relationship("ExtractedFact", back_populates="normalized_facts")


class Venue(Base):
    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(500), nullable=False, unique=True)
    venue_type = Column(String(50))  # journal, conference, preprint
    domain = Column(String(200))
    tier = Column(String(20))
    notes = Column(Text)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hypothesis_id = Column(Integer, ForeignKey("hypotheses.id"), nullable=False)
    status = Column(String(50), default="pending")
    config = Column(Text)  # JSON string
    results = Column(Text)  # JSON string of analysis results
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime)

    hypothesis = relationship("Hypothesis", back_populates="analysis_runs")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(100), nullable=False)  # UUID run_id from _analysis_store
    content_ref = Column(String(200), nullable=False)  # e.g. "gap:0", "finding:3"
    note = Column(Text, default="")
    created_at = Column(DateTime, default=func.now())


class ResearchTask(Base):
    __tablename__ = "research_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(100), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    code = Column(Text, default="")
    language = Column(String(20), default="python")
    status = Column(String(20), default="proposed")
    output = Column(Text, default="")
    linked_section_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)


class ExpertFeedback(Base):
    __tablename__ = "expert_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fact_id = Column(Integer, ForeignKey("extracted_facts.id"), nullable=False)
    action = Column(String(20), nullable=False)  # confirm, reject, comment
    comment = Column(Text)
    created_at = Column(DateTime, default=func.now())

    fact = relationship("ExtractedFact")


class SectionFeedback(Base):
    __tablename__ = "section_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(100), nullable=False)
    section_id = Column(String(100), nullable=False)  # e.g. "sec_1"
    rating = Column(Integer, nullable=False)  # 1-5
    note = Column(Text, default="")
    created_at = Column(DateTime, default=func.now())
