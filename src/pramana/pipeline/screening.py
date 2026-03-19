"""Multi-stage screening — filter irrelevant papers before extraction."""

import json
import logging

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import SCREENING_RELEVANCE_SYSTEM, SCREENING_RELEVANCE_USER
from pramana.models.vectors import get_chroma_client, get_paper_collection, search_papers
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery

logger = logging.getLogger(__name__)


def resolve_model(configured: str, settings: Settings) -> str:
    """Resolve a model name, falling back to settings.llm_model if empty."""
    return configured if configured else settings.llm_model


def screen_corpus(
    corpus: Corpus,
    query: HypothesisQuery,
    settings: Settings,
) -> Corpus:
    """Apply two-gate screening to filter irrelevant papers.

    Gate 1: Embedding similarity via ChromaDB (fast, free).
    Gate 2: LLM relevance check (cheap LLM call per paper).

    Both gates fail open — if either fails, papers pass through.
    Mutates paper dicts in-place with screening metadata.
    """
    if not settings.screening_enabled:
        logger.info("Screening disabled, passing all %d papers", len(corpus.papers))
        return corpus

    if not corpus.papers:
        return corpus

    hypothesis_text = " ".join(query.topics) if query.topics else ""
    if not hypothesis_text:
        hypothesis_text = " ".join(query.domains)

    # Gate 1: Embedding similarity
    _gate1_embedding_similarity(corpus, hypothesis_text, settings)

    # Gate 2: LLM relevance check (only on papers that passed Gate 1)
    _gate2_llm_relevance(corpus, hypothesis_text, settings)

    screened_count = sum(1 for p in corpus.papers if p.get("screened_out"))
    logger.info(
        "Screening complete: %d/%d papers screened out",
        screened_count, len(corpus.papers),
    )

    return corpus


def _gate1_embedding_similarity(
    corpus: Corpus,
    hypothesis_text: str,
    settings: Settings,
) -> None:
    """Gate 1: Use ChromaDB similarity to filter papers by distance."""
    try:
        client = get_chroma_client(settings)
        collection = get_paper_collection(client)

        results = search_papers(
            collection, hypothesis_text, n_results=len(corpus.papers),
        )

        if not results.get("ids") or not results["ids"][0]:
            logger.warning("Gate 1: No results from ChromaDB, passing all papers")
            return

        # Build a distance lookup: paper_db_id -> distance
        ids = results["ids"][0]
        distances = results.get("distances", [[]])[0]
        distance_map: dict[str, float] = {}
        for i, doc_id in enumerate(ids):
            if i < len(distances):
                distance_map[doc_id] = distances[i]

        threshold = settings.screening_similarity_threshold

        for paper in corpus.papers:
            db_id = str(paper.get("db_id", ""))
            distance = distance_map.get(db_id)
            if distance is not None:
                paper["relevance_score"] = distance
                if distance > threshold:
                    paper["screened_out"] = True
                    paper["screening_reason"] = (
                        f"Gate 1: L2 distance {distance:.2f} > threshold {threshold}"
                    )
                    logger.debug(
                        "Gate 1 filtered: '%s' (distance=%.2f)",
                        paper.get("title", "")[:50], distance,
                    )

    except Exception as e:
        logger.warning("Gate 1 failed (fail-open): %s", e)


def _gate2_llm_relevance(
    corpus: Corpus,
    hypothesis_text: str,
    settings: Settings,
) -> None:
    """Gate 2: LLM-based relevance check for papers passing Gate 1."""
    model = resolve_model(settings.screening_model, settings)

    for paper in corpus.papers:
        if paper.get("screened_out"):
            continue

        title = paper.get("title", "")
        abstract = paper.get("abstract", "")[:500]

        if not title and not abstract:
            continue

        try:
            messages = [
                {"role": "system", "content": SCREENING_RELEVANCE_SYSTEM},
                {
                    "role": "user",
                    "content": SCREENING_RELEVANCE_USER.format(
                        hypothesis=hypothesis_text,
                        title=title,
                        abstract=abstract,
                    ),
                },
            ]
            response_text = chat_json(messages, settings, model=model)
            data = json.loads(response_text)

            if not data.get("relevant", True):
                paper["screened_out"] = True
                paper["screening_reason"] = (
                    f"Gate 2: {data.get('reason', 'LLM marked irrelevant')}"
                )
                logger.debug(
                    "Gate 2 filtered: '%s' (%s)",
                    title[:50], data.get("reason", ""),
                )
        except Exception as e:
            logger.warning("Gate 2 failed for '%s' (fail-open): %s", title[:50], e)
