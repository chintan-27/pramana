"""Tests for PubMed API client."""

from unittest.mock import MagicMock, patch

from pramana.sources.pubmed import search_papers, _parse_pubmed_xml

SAMPLE_PUBMED_XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <ArticleTitle>Deep Learning for Chest X-Ray Classification</ArticleTitle>
        <AuthorList>
          <Author><ForeName>Alice</ForeName><LastName>Smith</LastName></Author>
        </AuthorList>
        <Journal><Title>Radiology</Title></Journal>
        <Abstract>
          <AbstractText>We developed a CNN for chest x-ray classification...</AbstractText>
        </Abstract>
        <ArticleDate><Year>2023</Year></ArticleDate>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="doi">10.1148/test</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>"""


def test_parse_pubmed_xml():
    """PubMed XML is parsed into paper dicts."""
    papers = _parse_pubmed_xml(SAMPLE_PUBMED_XML)

    assert len(papers) == 1
    assert papers[0]["title"] == "Deep Learning for Chest X-Ray Classification"
    assert papers[0]["pubmed_id"] == "12345678"
    assert papers[0]["doi"] == "10.1148/test"
    assert papers[0]["venue"] == "Radiology"
    assert papers[0]["authors"] == ["Alice Smith"]


@patch("pramana.sources.pubmed.httpx.get")
def test_search_papers(mock_get, settings):
    """search_papers calls PubMed and returns results."""
    # Mock esearch response
    search_response = MagicMock(
        status_code=200,
        json=lambda: {"esearchresult": {"idlist": ["12345678"]}},
    )
    search_response.raise_for_status = MagicMock()

    # Mock efetch response
    fetch_response = MagicMock(
        status_code=200,
        text=SAMPLE_PUBMED_XML,
    )
    fetch_response.raise_for_status = MagicMock()

    mock_get.side_effect = [search_response, fetch_response]

    papers = search_papers("deep learning chest xray", settings, max_results=10)

    assert len(papers) == 1
    assert papers[0]["title"] == "Deep Learning for Chest X-Ray Classification"
