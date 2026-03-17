"""Tests for arXiv API client."""

from unittest.mock import MagicMock, patch

from pramana.sources.arxiv import search_papers, _parse_atom_response

SAMPLE_ATOM_RESPONSE = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <title>External Validation in Medical AI</title>
    <summary>This paper surveys external validation practices...</summary>
    <published>2023-01-15T00:00:00Z</published>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <link href="http://arxiv.org/abs/2301.00001v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2301.00001v1" rel="related" type="application/pdf"/>
  </entry>
</feed>"""


def test_parse_atom_response():
    """Atom XML is parsed into paper dicts."""
    papers = _parse_atom_response(SAMPLE_ATOM_RESPONSE)

    assert len(papers) == 1
    assert papers[0]["title"] == "External Validation in Medical AI"
    assert papers[0]["year"] == 2023
    assert papers[0]["authors"] == ["Alice Smith", "Bob Jones"]
    assert papers[0]["arxiv_id"] == "2301.00001v1"
    assert "pdf" in papers[0]["pdf_url"]


@patch("pramana.sources.arxiv.httpx.get")
def test_search_papers(mock_get):
    """search_papers calls arXiv API and parses results."""
    mock_get.return_value = MagicMock(
        status_code=200,
        text=SAMPLE_ATOM_RESPONSE,
    )
    mock_get.return_value.raise_for_status = MagicMock()

    papers = search_papers("external validation medical AI", max_results=10)

    assert len(papers) == 1
    assert papers[0]["venue"] == "arXiv"
