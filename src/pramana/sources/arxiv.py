"""arXiv API client."""

import logging
import xml.etree.ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

ARXIV_API_URL = "https://export.arxiv.org/api/query"
ATOM_NS = "{http://www.w3.org/2005/Atom}"


def search_papers(
    query: str,
    max_results: int = 20,
) -> list[dict]:
    """Search arXiv for papers matching the query."""
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": min(max_results, 100),
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    logger.info("arXiv search: query=%r, max_results=%d", query, max_results)
    response = httpx.get(ARXIV_API_URL, params=params, timeout=30.0, follow_redirects=True)
    response.raise_for_status()

    papers = _parse_atom_response(response.text)
    logger.info("arXiv search returned %d papers", len(papers))
    return papers


def _parse_atom_response(xml_text: str) -> list[dict]:
    """Parse arXiv Atom XML response into paper dicts."""
    root = ET.fromstring(xml_text)
    papers = []

    for entry in root.findall(f"{ATOM_NS}entry"):
        title = _get_text(entry, f"{ATOM_NS}title").replace("\n", " ").strip()
        summary = _get_text(entry, f"{ATOM_NS}summary").strip()
        published = _get_text(entry, f"{ATOM_NS}published")
        year = int(published[:4]) if published else None

        authors = [
            _get_text(author, f"{ATOM_NS}name")
            for author in entry.findall(f"{ATOM_NS}author")
        ]

        # Extract arXiv ID from the entry id URL
        entry_id = _get_text(entry, f"{ATOM_NS}id")
        arxiv_id = entry_id.split("/abs/")[-1] if "/abs/" in entry_id else entry_id

        # Get PDF link
        pdf_url = ""
        for link in entry.findall(f"{ATOM_NS}link"):
            if link.get("title") == "pdf":
                pdf_url = link.get("href", "")
                break

        # Get DOI if available
        doi = None
        doi_el = entry.find("{http://arxiv.org/schemas/atom}doi")
        if doi_el is not None and doi_el.text:
            doi = doi_el.text.strip()

        papers.append({
            "title": title,
            "authors": authors,
            "year": year,
            "venue": "arXiv",
            "doi": doi,
            "arxiv_id": arxiv_id,
            "pubmed_id": None,
            "s2_id": None,
            "url": entry_id,
            "abstract": summary,
            "pdf_url": pdf_url,
        })

    return papers


def _get_text(element: ET.Element, tag: str) -> str:
    """Get text content of a child element."""
    child = element.find(tag)
    return child.text if child is not None and child.text else ""
