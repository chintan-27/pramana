"""Normalization & linking — canonicalize extracted facts and populate vectors."""

import json
import logging

from pydantic import BaseModel

from pramana.config import Settings
from pramana.llm.client import chat_json
from pramana.llm.prompts import NORMALIZATION_SYSTEM, NORMALIZATION_USER
from pramana.models.database import get_session
from pramana.models.schema import NormalizedFact as NormalizedFactDB
from pramana.models.vectors import (
    add_evidence_embedding,
    get_chroma_client,
    get_evidence_collection,
)
from pramana.pipeline.extraction import ExtractedFact

logger = logging.getLogger(__name__)

# Common normalization rules (applied before LLM)
KNOWN_MAPPINGS = {
    # Metrics
    "auc-roc": "AUROC",
    "auc": "AUROC",
    "auroc": "AUROC",
    "roc-auc": "AUROC",
    "accuracy": "Accuracy",
    "acc": "Accuracy",
    "f1-score": "F1-Score",
    "f1 score": "F1-Score",
    "f-measure": "F1-Score",
    "dice": "Dice Coefficient",
    "dice score": "Dice Coefficient",
    "dice coefficient": "Dice Coefficient",
    "iou": "IoU",
    "jaccard": "IoU",
    "sensitivity": "Sensitivity",
    "recall": "Sensitivity",
    "specificity": "Specificity",
    "precision": "Precision",
    "ppv": "Precision",
    "mse": "MSE",
    "mean squared error": "MSE",
    "rmse": "RMSE",
    "mae": "MAE",
    # Datasets
    "imagenet-1k": "ImageNet",
    "imagenet": "ImageNet",
    "ilsvrc-2012": "ImageNet",
    "ilsvrc": "ImageNet",
    "cifar-10": "CIFAR-10",
    "cifar10": "CIFAR-10",
    "cifar-100": "CIFAR-100",
    "cifar100": "CIFAR-100",
    "chestx-ray14": "ChestX-ray14",
    "chestxray14": "ChestX-ray14",
    "nih chest x-ray": "ChestX-ray14",
    "mimic-cxr": "MIMIC-CXR",
    "mimic cxr": "MIMIC-CXR",
}


class NormalizedEvidence(BaseModel):
    """Evidence after normalization."""

    facts: list[ExtractedFact] = []
    canonical_mappings: dict[str, str] = {}  # original -> canonical
    categories: dict[str, str] = {}  # canonical -> category


def normalize_evidence(
    facts: list[ExtractedFact],
    settings: Settings,
) -> NormalizedEvidence:
    """Normalize extracted evidence: canonicalize names, populate vectors."""
    if not facts:
        return NormalizedEvidence()

    # Step 1: Collect all terms that need normalization
    terms = set()
    for fact in facts:
        terms.add(fact.content.strip())

    # Step 2: Apply rule-based normalization first
    mappings: dict[str, str] = {}
    categories: dict[str, str] = {}
    remaining_terms: list[str] = []

    for term in terms:
        lower = term.lower().strip()
        if lower in KNOWN_MAPPINGS:
            canonical = KNOWN_MAPPINGS[lower]
            mappings[term] = canonical
        else:
            remaining_terms.append(term)

    # Step 3: Use LLM for remaining terms (batch them)
    if remaining_terms:
        llm_mappings = _normalize_with_llm(remaining_terms, settings)
        mappings.update(llm_mappings.get("mappings", {}))
        categories.update(llm_mappings.get("categories", {}))

    # Step 4: Store normalized facts in database
    _store_normalized_facts(facts, mappings, categories, settings)

    # Step 5: Populate vector store
    _populate_vectors(facts, settings)

    return NormalizedEvidence(
        facts=facts,
        canonical_mappings=mappings,
        categories=categories,
    )


def _normalize_with_llm(terms: list[str], settings: Settings) -> dict:
    """Use LLM to normalize terms that aren't in the known mappings."""
    terms_text = "\n".join(f"- {t}" for t in terms[:100])  # Limit batch size

    messages = [
        {"role": "system", "content": NORMALIZATION_SYSTEM},
        {"role": "user", "content": NORMALIZATION_USER.format(terms=terms_text)},
    ]

    try:
        response_text = chat_json(messages, settings)
        data = json.loads(response_text)

        mappings = {}
        categories = {}
        for item in data.get("mappings", []):
            original = item.get("original", "")
            canonical = item.get("canonical", original)
            category = item.get("category", "unknown")
            mappings[original] = canonical
            categories[canonical] = category

        return {"mappings": mappings, "categories": categories}
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"LLM normalization failed: {e}")
        return {"mappings": {}, "categories": {}}


def _store_normalized_facts(
    facts: list[ExtractedFact],
    mappings: dict[str, str],
    categories: dict[str, str],
    settings: Settings,
) -> None:
    """Store normalized facts in the database."""
    with get_session(settings) as session:
        for fact in facts:
            if fact.paper_id is None:
                continue
            canonical = mappings.get(fact.content, fact.content)
            category = categories.get(canonical, fact.fact_type)

            # Look up the ExtractedFact DB record
            from pramana.models.schema import ExtractedFact as EFDB
            db_fact = (
                session.query(EFDB)
                .filter_by(paper_id=fact.paper_id, content=fact.content)
                .first()
            )
            if db_fact:
                nf = NormalizedFactDB(
                    fact_id=db_fact.id,
                    canonical_name=canonical,
                    category=category,
                )
                session.add(nf)


def _populate_vectors(facts: list[ExtractedFact], settings: Settings) -> None:
    """Add normalized evidence to ChromaDB."""
    try:
        chroma = get_chroma_client(settings)
        collection = get_evidence_collection(chroma)

        for i, fact in enumerate(facts):
            embed_text = f"{fact.fact_type}: {fact.content}. Quote: {fact.direct_quote}"
            metadata = {
                "fact_type": fact.fact_type,
                "paper_id": fact.paper_id or 0,
                "paper_title": fact.paper_title,
                "location": fact.location,
            }
            add_evidence_embedding(
                collection,
                f"fact_{fact.paper_id}_{i}",
                embed_text,
                metadata,
            )
    except Exception as e:
        logger.warning(f"Vector store population failed: {e}")
