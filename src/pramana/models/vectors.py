"""ChromaDB vector store for semantic search over papers and evidence."""

import chromadb
from chromadb.config import Settings as ChromaSettings

from pramana.config import Settings


def get_chroma_client(settings: Settings) -> chromadb.ClientAPI:
    """Create a ChromaDB persistent client."""
    settings.chroma_path.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=str(settings.chroma_path),
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def get_paper_collection(client: chromadb.ClientAPI) -> chromadb.Collection:
    """Get or create the paper embeddings collection."""
    return client.get_or_create_collection(
        name="paper_embeddings",
        metadata={"description": "Paper abstracts and metadata for semantic search"},
    )


def get_evidence_collection(client: chromadb.ClientAPI) -> chromadb.Collection:
    """Get or create the evidence embeddings collection."""
    return client.get_or_create_collection(
        name="evidence_embeddings",
        metadata={"description": "Extracted evidence for semantic search"},
    )


def add_paper_embedding(
    collection: chromadb.Collection,
    paper_id: str,
    text: str,
    metadata: dict,
) -> None:
    """Add a paper's text to the vector store."""
    collection.upsert(
        ids=[paper_id],
        documents=[text],
        metadatas=[metadata],
    )


def add_evidence_embedding(
    collection: chromadb.Collection,
    evidence_id: str,
    text: str,
    metadata: dict,
) -> None:
    """Add extracted evidence to the vector store."""
    collection.upsert(
        ids=[evidence_id],
        documents=[text],
        metadatas=[metadata],
    )


def search_papers(
    collection: chromadb.Collection,
    query: str,
    n_results: int = 10,
) -> dict:
    """Search for papers similar to the query."""
    return collection.query(
        query_texts=[query],
        n_results=n_results,
    )


def search_evidence(
    collection: chromadb.Collection,
    query: str,
    n_results: int = 20,
) -> dict:
    """Search for evidence similar to the query."""
    return collection.query(
        query_texts=[query],
        n_results=n_results,
    )
