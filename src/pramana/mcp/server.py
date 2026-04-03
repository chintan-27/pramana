"""FastMCP server — exposes Pramana's research tools as MCP tools.

This allows external MCP clients (Claude Desktop, etc.) to connect
and use Pramana's analysis capabilities directly.
"""
from __future__ import annotations

import logging

from fastmcp import FastMCP

from pramana.mcp.tools import TOOL_DEFINITIONS

logger = logging.getLogger(__name__)

mcp = FastMCP("pramana-research")


@mcp.tool()
def list_tools() -> list[dict]:
    """List all available research analysis tools with descriptions."""
    return [
        {"name": t["function"]["name"], "description": t["function"]["description"]}
        for t in TOOL_DEFINITIONS
    ]


@mcp.tool()
def search_papers(query: str, max_papers: int = 20) -> dict:
    """Search academic databases (Semantic Scholar, arXiv, PubMed, CrossRef) for papers."""
    from pramana.config import get_settings
    from pramana.pipeline.corpus import build_corpus
    from pramana.pipeline.hypothesis import parse_hypothesis

    settings = get_settings()
    parsed = parse_hypothesis(query, "new", settings)
    parsed.search_queries = [query]
    corpus = build_corpus(parsed, max_papers=max_papers, settings=settings)
    papers = [
        {"title": p.get("title", ""), "year": p.get("year"),
         "venue": p.get("venue", ""), "source": p.get("source", "unknown"),
         "abstract": (p.get("abstract") or "")[:300]}
        for p in corpus.papers if not p.get("screened_out")
    ]
    return {"papers": papers, "total": len(papers)}


@mcp.tool()
def find_gaps(hypothesis: str) -> dict:
    """Identify research gaps for a hypothesis using the full pipeline."""
    from pramana.config import get_settings
    from pramana.pipeline.corpus import build_corpus
    from pramana.pipeline.extraction import extract_all_evidence
    from pramana.pipeline.hypothesis import parse_hypothesis
    from pramana.pipeline.normalization import normalize_evidence

    settings = get_settings()
    parsed = parse_hypothesis(hypothesis, "new", settings)
    corpus = build_corpus(parsed, max_papers=15, settings=settings)
    evidence = extract_all_evidence(corpus, parsed, settings)
    normalized = normalize_evidence(evidence, settings)

    from pramana.lenses.gap_discovery import GapDiscoveryLens
    lens = GapDiscoveryLens()
    result = lens.analyze(corpus, normalized, parsed, settings)
    return {"gaps": result.content.get("gaps", []), "summary": result.summary}


def get_mcp_app():
    """Return the FastMCP app for mounting in FastAPI."""
    return mcp
