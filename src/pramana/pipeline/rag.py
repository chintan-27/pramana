"""RAG — retrieve semantically relevant evidence from ChromaDB for lens prompts."""

import logging
import re
from collections import Counter, defaultdict

from pramana.config import Settings
from pramana.models.vectors import (
    get_chroma_client,
    get_evidence_collection,
    search_evidence,
)

logger = logging.getLogger(__name__)

# Hybrid scoring weights
VECTOR_WEIGHT = 0.6
KEYWORD_WEIGHT = 0.4


def retrieve_relevant_evidence(
    query_text: str,
    settings: Settings,
    n_results: int = 30,
) -> list[dict]:
    """Query evidence collection and re-rank with hybrid scoring."""
    try:
        client = get_chroma_client(settings)
        collection = get_evidence_collection(client)
        # Fetch more candidates for re-ranking
        fetch_n = min(n_results * 3, 100)
        raw = search_evidence(collection, query_text, n_results=fetch_n)
    except Exception as e:
        logger.warning(f"RAG retrieval failed: {e}")
        return []

    results: list[dict] = []
    ids = raw.get("ids", [[]])[0]
    documents = raw.get("documents", [[]])[0]
    metadatas = raw.get("metadatas", [[]])[0]
    distances = raw.get("distances", [[]])[0]

    for i, doc_id in enumerate(ids):
        results.append({
            "id": doc_id,
            "text": documents[i] if i < len(documents) else "",
            "metadata": metadatas[i] if i < len(metadatas) else {},
            "distance": distances[i] if i < len(distances) else 0.0,
        })

    # Re-rank with hybrid scoring
    results = _hybrid_rerank(results, query_text)

    return results[:n_results]


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + punctuation tokenizer, lowercased."""
    return re.findall(r"[a-z0-9]+(?:[-'][a-z0-9]+)*", text.lower())


def _keyword_score(query_tokens: list[str], doc_text: str) -> float:
    """Compute keyword overlap score between query and document.

    Uses term frequency with diminishing returns (log TF).
    Returns a score in [0, 1].
    """
    if not query_tokens or not doc_text:
        return 0.0

    doc_tokens = _tokenize(doc_text)
    if not doc_tokens:
        return 0.0

    doc_counts = Counter(doc_tokens)
    query_set = set(query_tokens)

    matched = 0
    for token in query_set:
        if token in doc_counts:
            matched += 1

    # Simple fraction of query terms found in document
    return matched / len(query_set)


def _hybrid_rerank(
    results: list[dict], query_text: str,
) -> list[dict]:
    """Re-rank results using hybrid vector + keyword scoring."""
    if not results:
        return results

    query_tokens = _tokenize(query_text)

    # Normalize vector distances to [0, 1] scores (lower distance = higher score)
    max_dist = max((r["distance"] for r in results), default=1.0) or 1.0

    for r in results:
        vector_score = 1.0 - (r["distance"] / max_dist)
        kw_score = _keyword_score(query_tokens, r["text"])
        r["hybrid_score"] = (
            VECTOR_WEIGHT * vector_score + KEYWORD_WEIGHT * kw_score
        )

    results.sort(key=lambda r: r["hybrid_score"], reverse=True)
    return results


def format_retrieved_context(results: list[dict], max_chars: int = 8000) -> str:
    """Format retrieved evidence into a text block for LLM prompts.

    Groups by paper, includes direct quotes and locations.
    Truncates to stay within token budget.
    """
    if not results:
        return "No additional evidence retrieved."

    # Group by paper
    by_paper: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        paper_title = r.get("metadata", {}).get("paper_title", "Unknown")
        by_paper[paper_title].append(r)

    lines: list[str] = ["--- Retrieved Evidence ---"]
    total_chars = 0

    for paper_title, items in by_paper.items():
        paper_block = f"\n[{paper_title}]"
        for item in items:
            meta = item.get("metadata", {})
            fact_type = meta.get("fact_type", "")
            location = meta.get("location", "")
            text = item.get("text", "")
            entry = f"  - ({fact_type}, {location}) {text}"
            paper_block += "\n" + entry

        if total_chars + len(paper_block) > max_chars:
            break
        lines.append(paper_block)
        total_chars += len(paper_block)

    return "\n".join(lines)
