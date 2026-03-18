"""FastAPI backend for Pramana."""

import asyncio
import json
import logging
import traceback
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pramana.config import get_settings
from pramana.models.database import create_tables, get_engine, get_session, seed_venues
from pramana.models.schema import AnalysisRun, Hypothesis, Paper
from pramana.models.schema import ExtractedFact as ExtractedFactDB
from pramana.models.vectors import get_chroma_client, get_evidence_collection, search_evidence

logger = logging.getLogger(__name__)

# In-memory store for running analyses
_analysis_store: dict[str, dict] = {}
_ws_connections: dict[str, list[WebSocket]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    # Configure logging for all pramana modules
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    # Set pramana loggers to DEBUG for detailed output
    logging.getLogger("pramana").setLevel(logging.DEBUG)
    # Quieten noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)

    settings = get_settings()
    settings.ensure_dirs()
    engine = get_engine(settings)
    create_tables(engine)
    seed_venues(settings)
    logger.info("Pramana API started (LLM: %s @ %s)", settings.llm_model, settings.llm_base_url)
    yield


app = FastAPI(
    title="Pramana",
    description="Hypothesis-driven research assistant API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response models ---

class AnalyzeRequest(BaseModel):
    hypothesis: str
    initiation_type: str = "new"
    max_papers: int = 50
    prior_research: str = ""


class AnalyzeResponse(BaseModel):
    run_id: str
    status: str


class RunStatus(BaseModel):
    run_id: str
    status: str
    stage: str = ""
    progress: dict = {}
    error: str | None = None


class PaperResponse(BaseModel):
    id: int
    title: str
    authors: list[str]
    year: int | None
    venue: str
    doi: str | None
    abstract: str
    facts: list[dict] = []


class EvidenceSearchResponse(BaseModel):
    results: list[dict]
    total: int


class VenueResponse(BaseModel):
    id: int
    name: str
    venue_type: str
    domain: str
    tier: str


# --- Endpoints ---

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def start_analysis(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """Start a new analysis run."""
    run_id = str(uuid.uuid4())
    settings = get_settings()

    # Create DB records
    with get_session(settings) as session:
        hypothesis = Hypothesis(
            text=request.hypothesis,
            initiation_type=request.initiation_type,
        )
        session.add(hypothesis)
        session.flush()

        run = AnalysisRun(
            hypothesis_id=hypothesis.id,
            status="pending",
            config=json.dumps({
                "max_papers": request.max_papers,
                "initiation_type": request.initiation_type,
            }),
        )
        session.add(run)
        session.flush()
        db_run_id = run.id

    _analysis_store[run_id] = {
        "status": "pending",
        "stage": "queued",
        "db_run_id": db_run_id,
        "hypothesis": request.hypothesis,
        "initiation_type": request.initiation_type,
        "max_papers": request.max_papers,
        "prior_research": request.prior_research,
        "progress": {},
        "result": None,
        "error": None,
    }

    background_tasks.add_task(_run_analysis, run_id)

    return AnalyzeResponse(run_id=run_id, status="pending")


@app.get("/api/analyze/{run_id}", response_model=RunStatus)
async def get_analysis_status(run_id: str):
    """Get analysis run status."""
    if run_id not in _analysis_store:
        raise HTTPException(404, "Analysis run not found")

    store = _analysis_store[run_id]
    return RunStatus(
        run_id=run_id,
        status=store["status"],
        stage=store["stage"],
        progress=store["progress"],
        error=store["error"],
    )


@app.get("/api/analyze/{run_id}/report")
async def get_analysis_report(run_id: str):
    """Get completed analysis report."""
    if run_id not in _analysis_store:
        raise HTTPException(404, "Analysis run not found")

    store = _analysis_store[run_id]
    if store["status"] != "completed":
        raise HTTPException(400, f"Analysis is {store['status']}, not completed")

    return {"run_id": run_id, "report": store["result"]}


@app.get("/api/papers/{paper_id}", response_model=PaperResponse)
async def get_paper(paper_id: int):
    """Get paper details with extracted evidence."""
    settings = get_settings()
    with get_session(settings) as session:
        paper = session.get(Paper, paper_id)
        if not paper:
            raise HTTPException(404, "Paper not found")

        facts = session.query(ExtractedFactDB).filter_by(paper_id=paper_id).all()
        authors = json.loads(paper.authors) if paper.authors else []

        return PaperResponse(
            id=paper.id,
            title=paper.title,
            authors=authors,
            year=paper.year,
            venue=paper.venue or "",
            doi=paper.doi,
            abstract=paper.abstract or "",
            facts=[
                {
                    "id": f.id,
                    "fact_type": f.fact_type,
                    "content": f.content,
                    "direct_quote": f.direct_quote,
                    "location": f.location,
                }
                for f in facts
            ],
        )


@app.get("/api/evidence", response_model=EvidenceSearchResponse)
async def search_evidence_endpoint(query: str, limit: int = 20):
    """Search evidence using semantic search."""
    settings = get_settings()
    try:
        chroma = get_chroma_client(settings)
        collection = get_evidence_collection(chroma)
        results = search_evidence(collection, query, n_results=limit)

        items = []
        if results.get("documents"):
            for i, doc in enumerate(results["documents"][0]):
                metadata = results["metadatas"][0][i] if results.get("metadatas") else {}
                distance = results["distances"][0][i] if results.get("distances") else None
                items.append({
                    "text": doc,
                    "metadata": metadata,
                    "score": 1.0 - (distance or 0),
                })

        return EvidenceSearchResponse(results=items, total=len(items))
    except Exception:
        return EvidenceSearchResponse(results=[], total=0)


@app.get("/api/venues", response_model=list[VenueResponse])
async def list_venues(domain: str | None = None):
    """List known research venues."""
    settings = get_settings()
    from pramana.models.schema import Venue

    with get_session(settings) as session:
        query = session.query(Venue)
        if domain:
            query = query.filter(Venue.domain.contains(domain))
        venues = query.all()

        return [
            VenueResponse(
                id=v.id,
                name=v.name,
                venue_type=v.venue_type or "",
                domain=v.domain or "",
                tier=v.tier or "",
            )
            for v in venues
        ]


@app.websocket("/api/ws/analyze/{run_id}")
async def ws_analysis_progress(websocket: WebSocket, run_id: str):
    """WebSocket for real-time analysis progress updates."""
    await websocket.accept()

    if run_id not in _ws_connections:
        _ws_connections[run_id] = []
    _ws_connections[run_id].append(websocket)

    try:
        while True:
            if run_id in _analysis_store:
                store = _analysis_store[run_id]
                await websocket.send_json({
                    "status": store["status"],
                    "stage": store["stage"],
                    "progress": store["progress"],
                    "error": store["error"],
                })
                if store["status"] in ("completed", "failed"):
                    break
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    finally:
        if run_id in _ws_connections:
            _ws_connections[run_id] = [
                ws for ws in _ws_connections[run_id] if ws != websocket
            ]


# --- Background task ---

def _run_analysis(run_id: str) -> None:
    """Execute the full analysis pipeline as a background task."""
    settings = get_settings()
    store = _analysis_store[run_id]

    try:
        store["status"] = "running"
        logger.info("[%s] Pipeline started: %s", run_id[:8], store["hypothesis"][:80])

        # Stage 1: Parse hypothesis
        store["stage"] = "parsing"
        store["progress"] = {"step": 1, "total": 6, "description": "Parsing hypothesis"}
        logger.info("[%s] Stage 1/6: Parsing hypothesis", run_id[:8])
        from pramana.pipeline.hypothesis import parse_hypothesis
        parsed = parse_hypothesis(store["hypothesis"], store["initiation_type"], settings, prior_research=store.get("prior_research", ""))
        store["progress"]["parsed"] = parsed.model_dump()
        logger.info("[%s] Parsed → %d domains, %d topics, %d queries",
                    run_id[:8], len(parsed.domains), len(parsed.topics), len(parsed.search_queries))

        # Stage 2: Build corpus
        store["stage"] = "retrieval"
        store["progress"] = {"step": 2, "total": 6, "description": "Retrieving papers"}
        logger.info("[%s] Stage 2/6: Retrieving papers (max=%d)", run_id[:8], store["max_papers"])
        from pramana.pipeline.corpus import build_corpus
        corpus = build_corpus(parsed, max_papers=store["max_papers"], settings=settings)
        store["progress"]["papers_found"] = len(corpus.papers)
        logger.info("[%s] Corpus: %d papers (S2=%d, arXiv=%d, PubMed=%d)",
                    run_id[:8], len(corpus.papers), corpus.total_from_s2,
                    corpus.total_from_arxiv, corpus.total_from_pubmed)

        # Stage 3: Extract evidence
        store["stage"] = "extraction"
        store["progress"] = {"step": 3, "total": 6, "description": "Extracting evidence"}
        logger.info("[%s] Stage 3/6: Extracting evidence from %d papers",
                    run_id[:8], len(corpus.papers))
        from pramana.pipeline.extraction import extract_all_evidence
        evidence = extract_all_evidence(corpus, parsed, settings)
        store["progress"]["facts_extracted"] = len(evidence)
        logger.info("[%s] Extracted %d facts", run_id[:8], len(evidence))

        # Stage 4: Normalize
        store["stage"] = "normalization"
        store["progress"] = {"step": 4, "total": 6, "description": "Normalizing evidence"}
        logger.info("[%s] Stage 4/6: Normalizing %d facts", run_id[:8], len(evidence))
        from pramana.pipeline.normalization import normalize_evidence
        normalized = normalize_evidence(evidence, settings)
        logger.info("[%s] Normalized: %d mappings, %d categories",
                    run_id[:8], len(normalized.canonical_mappings), len(normalized.categories))

        # Stage 5: Run analysis
        store["stage"] = "analysis"
        store["progress"] = {"step": 5, "total": 6, "description": "Running analytical lenses"}
        logger.info("[%s] Stage 5/6: Running analytical lenses", run_id[:8])
        from pramana.pipeline.orchestrator import run_analysis as run_lenses
        results = run_lenses(corpus, normalized, parsed, settings)
        logger.info("[%s] Lenses completed: %s", run_id[:8], ", ".join(results.active_lenses))

        # Stage 6: Generate report
        store["stage"] = "report"
        store["progress"] = {"step": 6, "total": 6, "description": "Generating report"}
        logger.info("[%s] Stage 6/6: Generating report", run_id[:8])
        from pramana.report.generator import generate_report
        report_json = generate_report(results, parsed, "json", settings)

        store["status"] = "completed"
        store["stage"] = "done"
        store["result"] = json.loads(report_json)
        logger.info("[%s] Pipeline completed successfully", run_id[:8])

        # Update DB
        with get_session(settings) as session:
            db_run = session.get(AnalysisRun, store["db_run_id"])
            if db_run:
                db_run.status = "completed"
                db_run.completed_at = datetime.now(timezone.utc)

    except Exception as e:
        store["status"] = "failed"
        store["error"] = str(e)
        logger.error("[%s] Pipeline FAILED at stage '%s': %s", run_id[:8], store["stage"], e)
        logger.debug("[%s] Traceback:\n%s", run_id[:8], traceback.format_exc())

        with get_session(settings) as session:
            db_run = session.get(AnalysisRun, store["db_run_id"])
            if db_run:
                db_run.status = "failed"
