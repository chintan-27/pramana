"""PubMed E-utilities (Entrez) API client."""

import xml.etree.ElementTree as ET

import httpx

from pramana.config import Settings

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def search_papers(
    query: str,
    settings: Settings,
    max_results: int = 20,
) -> list[dict]:
    """Search PubMed for papers matching the query."""
    # Step 1: Search for PMIDs
    search_params = {
        "db": "pubmed",
        "term": query,
        "retmax": min(max_results, 100),
        "retmode": "json",
        "sort": "relevance",
    }
    if settings.pubmed_api_key:
        search_params["api_key"] = settings.pubmed_api_key

    search_resp = httpx.get(
        f"{EUTILS_BASE}/esearch.fcgi",
        params=search_params,
        timeout=30.0,
    )
    search_resp.raise_for_status()
    search_data = search_resp.json()

    id_list = search_data.get("esearchresult", {}).get("idlist", [])
    if not id_list:
        return []

    # Step 2: Fetch details for each PMID
    fetch_params = {
        "db": "pubmed",
        "id": ",".join(id_list),
        "retmode": "xml",
    }
    if settings.pubmed_api_key:
        fetch_params["api_key"] = settings.pubmed_api_key

    fetch_resp = httpx.get(
        f"{EUTILS_BASE}/efetch.fcgi",
        params=fetch_params,
        timeout=30.0,
    )
    fetch_resp.raise_for_status()

    return _parse_pubmed_xml(fetch_resp.text)


def _parse_pubmed_xml(xml_text: str) -> list[dict]:
    """Parse PubMed XML response into paper dicts."""
    root = ET.fromstring(xml_text)
    papers = []

    for article in root.findall(".//PubmedArticle"):
        medline = article.find("MedlineCitation")
        if medline is None:
            continue

        art = medline.find("Article")
        if art is None:
            continue

        title = _get_text(art, "ArticleTitle")

        # Authors
        authors = []
        author_list = art.find("AuthorList")
        if author_list is not None:
            for author in author_list.findall("Author"):
                last = _get_text(author, "LastName")
                fore = _get_text(author, "ForeName")
                if last:
                    authors.append(f"{fore} {last}".strip())

        # Year
        year = None
        pub_date = art.find(".//PubDate")
        if pub_date is not None:
            year_text = _get_text(pub_date, "Year")
            if year_text:
                year = int(year_text)

        # Venue
        journal = art.find("Journal")
        venue = _get_text(journal, "Title") if journal is not None else ""

        # Abstract
        abstract_el = art.find("Abstract")
        abstract = ""
        if abstract_el is not None:
            parts = []
            for text in abstract_el.findall("AbstractText"):
                if text.text:
                    parts.append(text.text)
            abstract = " ".join(parts)

        # IDs
        pmid = _get_text(medline, "PMID")
        doi = None
        article_ids = article.find(".//ArticleIdList")
        if article_ids is not None:
            for aid in article_ids.findall("ArticleId"):
                if aid.get("IdType") == "doi" and aid.text:
                    doi = aid.text

        papers.append({
            "title": title,
            "authors": authors,
            "year": year,
            "venue": venue,
            "doi": doi,
            "arxiv_id": None,
            "pubmed_id": pmid,
            "s2_id": None,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else "",
            "abstract": abstract,
        })

    return papers


def _get_text(element: ET.Element | None, tag: str) -> str:
    """Get text content of a child element."""
    if element is None:
        return ""
    child = element.find(tag)
    return child.text if child is not None and child.text else ""
