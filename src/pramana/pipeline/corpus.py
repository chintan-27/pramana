"""Corpus builder — orchestrates paper retrieval from multiple sources."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from pydantic import BaseModel

from pramana.config import Settings
from pramana.models.database import get_session
from pramana.models.schema import Paper
from pramana.models.vectors import (
    add_paper_embedding,
    get_chroma_client,
    get_paper_collection,
)
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.sources import arxiv, crossref, pubmed, semantic_scholar
from pramana.sources.pdf import download_pdf, extract_text

logger = logging.getLogger(__name__)


class Corpus(BaseModel):
    """Collection of papers retrieved for an analysis."""

    papers: list[dict] = []
    total_from_s2: int = 0
    total_from_arxiv: int = 0
    total_from_pubmed: int = 0
    total_from_crossref: int = 0


def build_corpus(
    query: HypothesisQuery,
    max_papers: int,
    settings: Settings,
    on_progress: callable = None,
) -> Corpus:
    """Build a corpus of papers from all sources, parallelized."""
    all_papers: list[dict] = []
    per_source = max(max_papers // 4, 10)

    corpus = Corpus()

    queries = query.search_queries
    logger.info("Building corpus: %d queries, max_papers=%d",
                 len(queries), max_papers)

    def _search_one(search_query: str, source: str) -> list[dict]:
        """Run a single source search. Returns list of paper dicts."""
        try:
            if source == "s2":
                papers = semantic_scholar.search_papers(
                    search_query, settings,
                    limit=per_source, year_range=query.time_range,
                )
            elif source == "arxiv":
                papers = arxiv.search_papers(
                    search_query, max_results=per_source,
                )
            elif source == "pubmed":
                papers = pubmed.search_papers(
                    search_query, settings, max_results=per_source,
                )
            elif source == "crossref":
                papers = crossref.search_papers(
                    search_query, max_results=per_source,
                )
            else:
                return []
            for p in papers:
                p.setdefault("source", source)
            return papers
        except Exception as e:
            logger.warning("%s search failed for %r: %s",
                           source, search_query[:50], e)
            return []

    # Submit all query×source combinations in parallel
    sources = ["s2", "arxiv", "pubmed", "crossref"]
    futures = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for sq in queries:
            for src in sources:
                fut = pool.submit(_search_one, sq, src)
                futures[fut] = src

        for fut in as_completed(futures):
            src = futures[fut]
            papers = fut.result()
            if src == "s2":
                corpus.total_from_s2 += len(papers)
            elif src == "arxiv":
                corpus.total_from_arxiv += len(papers)
            elif src == "pubmed":
                corpus.total_from_pubmed += len(papers)
            elif src == "crossref":
                corpus.total_from_crossref += len(papers)
            all_papers.extend(papers)
            if on_progress and callable(on_progress):
                try:
                    on_progress(src, len(papers))
                except Exception:
                    pass

    logger.info("Raw papers collected: %d (before dedup)", len(all_papers))

    # Deduplicate by title similarity and IDs
    deduped = _deduplicate(all_papers)

    # Limit to max_papers
    deduped = deduped[:max_papers]
    logger.info("After dedup + limit: %d papers", len(deduped))

    # Store in database and vector store
    stored = _store_papers(deduped, settings)
    corpus.papers = stored

    return corpus


def _deduplicate(papers: list[dict]) -> list[dict]:
    """Remove duplicate papers based on DOI, arXiv ID, S2 ID, or title."""
    seen_dois: set[str] = set()
    seen_arxiv: set[str] = set()
    seen_s2: set[str] = set()
    seen_titles: set[str] = set()
    unique: list[dict] = []

    for paper in papers:
        doi = paper.get("doi")
        arxiv_id = paper.get("arxiv_id")
        s2_id = paper.get("s2_id")
        title_key = paper.get("title", "").lower().strip()

        if doi and doi in seen_dois:
            continue
        if arxiv_id and arxiv_id in seen_arxiv:
            continue
        if s2_id and s2_id in seen_s2:
            continue
        if title_key in seen_titles:
            continue

        if doi:
            seen_dois.add(doi)
        if arxiv_id:
            seen_arxiv.add(arxiv_id)
        if s2_id:
            seen_s2.add(s2_id)
        if title_key:
            seen_titles.add(title_key)

        unique.append(paper)

    return unique


def _store_papers(papers: list[dict], settings: Settings) -> list[dict]:
    """Store papers in SQLite and ChromaDB."""
    stored = []

    chroma = get_chroma_client(settings)
    collection = get_paper_collection(chroma)

    with get_session(settings) as session:
        for paper_data in papers:
            # Check if already in DB
            existing = None
            if paper_data.get("doi"):
                existing = session.query(Paper).filter_by(doi=paper_data["doi"]).first()
            if not existing and paper_data.get("arxiv_id"):
                existing = session.query(Paper).filter_by(arxiv_id=paper_data["arxiv_id"]).first()
            if not existing and paper_data.get("s2_id"):
                existing = session.query(Paper).filter_by(s2_id=paper_data["s2_id"]).first()
            if not existing and paper_data.get("pubmed_id"):
                existing = session.query(Paper).filter_by(pubmed_id=paper_data["pubmed_id"]).first()

            if existing:
                paper_data["db_id"] = existing.id
                stored.append(paper_data)
                continue

            db_paper = Paper(
                title=paper_data.get("title", ""),
                authors=json.dumps(paper_data.get("authors", [])),
                year=paper_data.get("year"),
                venue=paper_data.get("venue", ""),
                doi=paper_data.get("doi"),
                arxiv_id=paper_data.get("arxiv_id"),
                pubmed_id=paper_data.get("pubmed_id"),
                s2_id=paper_data.get("s2_id"),
                url=paper_data.get("url", ""),
                abstract=paper_data.get("abstract", ""),
            )
            session.add(db_paper)
            session.flush()

            paper_data["db_id"] = db_paper.id

            # Add to vector store
            embed_text = f"{db_paper.title}. {db_paper.abstract or ''}"
            if embed_text.strip():
                add_paper_embedding(
                    collection,
                    str(db_paper.id),
                    embed_text,
                    {
                        "title": db_paper.title,
                        "year": db_paper.year or 0,
                        "venue": db_paper.venue or "",
                    },
                )

            # Try to download PDF if URL available
            pdf_url = paper_data.get("pdf_url", "")
            if pdf_url:
                safe_name = f"paper_{db_paper.id}.pdf"
                pdf_path = download_pdf(pdf_url, safe_name, settings)
                if pdf_path:
                    full_text = extract_text(pdf_path)
                    db_paper.pdf_path = str(pdf_path)
                    db_paper.full_text = full_text
                    paper_data["full_text"] = full_text

            stored.append(paper_data)

    return stored
