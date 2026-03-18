"""RAG — retrieve semantically relevant evidence from ChromaDB for lens prompts."""

import logging
from collections import defaultdict

from pramana.config import Settings
from pramana.models.vectors import get_chroma_client, get_evidence_collection, search_evidence

logger = logging.getLogger(__name__)


def retrieve_relevant_evidence(
    query_text: str,
    settings: Settings,
    n_results: int = 30,
) -> list[dict]:
    """Query evidence_embeddings collection, return ranked results with metadata."""
    try:
        client = get_chroma_client(settings)
        collection = get_evidence_collection(client)
        raw = search_evidence(collection, query_text, n_results=n_results)
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
