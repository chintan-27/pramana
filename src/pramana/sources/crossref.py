"""CrossRef source — free DOI/metadata API covering 140M+ records across all domains."""

import logging

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.crossref.org/works"
_TIMEOUT = 15.0


def search_papers(query: str, max_results: int = 10) -> list[dict]:
    """Search CrossRef for papers matching the query string.

    Returns normalized paper dicts compatible with other sources.
    """
    params = {
        "query": query,
        "rows": min(max_results, 50),
        "filter": "has-abstract:true",
        "select": "DOI,title,author,published,container-title,abstract,URL,type",
        "mailto": "pramana@research.tool",  # polite pool for better rate limits
    }

    try:
        response = httpx.get(_BASE_URL, params=params, timeout=_TIMEOUT)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        logger.warning("CrossRef search failed for '%s': %s", query[:60], e)
        return []

    items = data.get("message", {}).get("items", [])
    papers = []
    for item in items:
        paper = _normalize(item)
        if paper:
            papers.append(paper)

    logger.info("CrossRef search '%s': returned %d papers", query[:60], len(papers))
    return papers


def _normalize(item: dict) -> dict | None:
    """Normalize a CrossRef work item to the standard paper dict format."""
    title_list = item.get("title", [])
    title = title_list[0] if title_list else ""
    if not title:
        return None

    # Authors: CrossRef gives [{given, family}, ...]
    authors = []
    for a in item.get("author", []):
        given = a.get("given", "")
        family = a.get("family", "")
        name = f"{given} {family}".strip() if given else family
        if name:
            authors.append(name)

    # Year from published date-parts
    year = None
    published = item.get("published") or item.get("published-print") or item.get("published-online")
    if published:
        date_parts = published.get("date-parts", [[]])
        if date_parts and date_parts[0]:
            year = date_parts[0][0]

    # Venue from container-title
    container = item.get("container-title", [])
    venue = container[0] if container else ""

    doi = item.get("DOI", "")
    abstract = item.get("abstract", "") or ""
    # CrossRef abstracts may have JATS XML tags — strip them
    import re
    abstract = re.sub(r"<[^>]+>", " ", abstract).strip()

    url = item.get("URL", "")
    if doi and not url:
        url = f"https://doi.org/{doi}"

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "doi": doi or None,
        "arxiv_id": None,
        "pubmed_id": None,
        "s2_id": None,
        "url": url,
        "abstract": abstract,
        "full_text": None,
        "pdf_url": None,
        "source": "crossref",
    }
