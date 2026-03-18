"""Semantic Scholar API client."""

import logging
import time

import httpx

from pramana.config import Settings

logger = logging.getLogger(__name__)

# Track last request time for rate limiting (1 req/s with API key)
_last_request_time: float = 0.0

S2_BASE_URL = "https://api.semanticscholar.org/graph/v1"
S2_FIELDS = "title,authors,year,venue,externalIds,url,abstract,citationCount"


def search_papers(
    query: str,
    settings: Settings,
    limit: int = 20,
    year_range: tuple[int, int] | None = None,
) -> list[dict]:
    """Search Semantic Scholar for papers matching the query."""
    headers = {}
    if settings.semantic_scholar_api_key:
        headers["x-api-key"] = settings.semantic_scholar_api_key

    params = {
        "query": query,
        "limit": min(limit, 100),
        "fields": S2_FIELDS,
    }
    if year_range:
        params["year"] = f"{year_range[0]}-{year_range[1]}"

    _rate_limit()
    logger.info("S2 search: query=%r, limit=%d", query, limit)
    response = httpx.get(
        f"{S2_BASE_URL}/paper/search",
        params=params,
        headers=headers,
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()

    papers = []
    for item in data.get("data", []):
        external_ids = item.get("externalIds", {}) or {}
        authors = [a.get("name", "") for a in (item.get("authors") or [])]
        papers.append({
            "title": item.get("title", ""),
            "authors": authors,
            "year": item.get("year"),
            "venue": item.get("venue", ""),
            "doi": external_ids.get("DOI"),
            "arxiv_id": external_ids.get("ArXiv"),
            "pubmed_id": external_ids.get("PubMed"),
            "s2_id": item.get("paperId"),
            "url": item.get("url", ""),
            "abstract": item.get("abstract", ""),
        })

    logger.info("S2 search returned %d papers", len(papers))
    return papers


def get_paper_details(paper_id: str, settings: Settings) -> dict | None:
    """Get detailed info for a specific paper by S2 ID."""
    headers = {}
    if settings.semantic_scholar_api_key:
        headers["x-api-key"] = settings.semantic_scholar_api_key

    _rate_limit()
    response = httpx.get(
        f"{S2_BASE_URL}/paper/{paper_id}",
        params={"fields": S2_FIELDS + ",openAccessPdf"},
        headers=headers,
        timeout=30.0,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    data = response.json()

    external_ids = data.get("externalIds", {}) or {}
    authors = [a.get("name", "") for a in (data.get("authors") or [])]
    pdf_info = data.get("openAccessPdf") or {}

    return {
        "title": data.get("title", ""),
        "authors": authors,
        "year": data.get("year"),
        "venue": data.get("venue", ""),
        "doi": external_ids.get("DOI"),
        "arxiv_id": external_ids.get("ArXiv"),
        "pubmed_id": external_ids.get("PubMed"),
        "s2_id": data.get("paperId"),
        "url": data.get("url", ""),
        "abstract": data.get("abstract", ""),
        "pdf_url": pdf_info.get("url"),
    }


def _rate_limit() -> None:
    """Enforce 1 request per second rate limit for Semantic Scholar API."""
    global _last_request_time
    now = time.monotonic()
    elapsed = now - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _last_request_time = time.monotonic()
