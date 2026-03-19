"""Tests for analytical lenses and orchestrator."""

import json
from unittest.mock import patch

from pramana.lenses.base import LensResult
from pramana.lenses.bias_detection import BiasDetectionLens
from pramana.lenses.evidence_table import EvidenceTableLens
from pramana.lenses.gap_discovery import GapDiscoveryLens
from pramana.lenses.knowledge_graph import KnowledgeGraphLens
from pramana.lenses.meta_analysis import MetaAnalysisLens
from pramana.lenses.research_planning import ResearchPlanningLens
from pramana.lenses.trace_ancestry import TraceAncestryLens
from pramana.lenses.venue_mapping import VenueMappingLens
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.extraction import ExtractedFact
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence
from pramana.pipeline.orchestrator import run_analysis


def _make_evidence() -> NormalizedEvidence:
    """Create sample evidence for testing."""
    facts = [
        ExtractedFact(
            fact_type="dataset", content="ChestX-ray14",
            direct_quote="trained on ChestX-ray14", location="p.3",
            paper_id=1, paper_title="Paper A",
        ),
        ExtractedFact(
            fact_type="method", content="ResNet-50",
            direct_quote="used ResNet-50", location="p.4",
            paper_id=1, paper_title="Paper A",
        ),
        ExtractedFact(
            fact_type="metric", content="AUROC",
            direct_quote="reported AUROC of 0.92", location="p.6",
            paper_id=2, paper_title="Paper B",
        ),
        ExtractedFact(
            fact_type="limitation", content="Single-site training",
            direct_quote="trained on single institution data", location="p.8",
            paper_id=2, paper_title="Paper B",
        ),
    ]
    return NormalizedEvidence(
        facts=facts,
        canonical_mappings={"ChestX-ray14": "ChestX-ray14", "AUROC": "AUROC"},
    )


def _make_corpus() -> Corpus:
    """Create sample corpus for testing."""
    return Corpus(papers=[
        {"title": "Paper A", "year": 2023, "venue": "MICCAI", "db_id": 1},
        {"title": "Paper B", "year": 2022, "venue": "Radiology", "db_id": 2},
    ])


def _make_query(**kwargs) -> HypothesisQuery:
    """Create sample query."""
    defaults = {
        "domains": ["biomedical engineering"],
        "topics": ["external validation", "deep learning"],
        "methods": ["CNN"],
        "evaluation_focus": ["validation protocols"],
        "search_queries": ["external validation DL medical imaging"],
        "initiation_context": "new research project",
    }
    defaults.update(kwargs)
    return HypothesisQuery(**defaults)


# --- Evidence Table Lens ---

def test_evidence_table_always_active():
    lens = EvidenceTableLens()
    assert lens.should_activate(_make_query()) is True


def test_evidence_table_analyze(settings):
    lens = EvidenceTableLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "evidence_table"
    assert result.content["total_facts"] == 4
    assert result.content["papers_with_evidence"] == 2
    assert "dataset" in result.content["tables"]


# --- Gap Discovery Lens ---

def test_gap_discovery_always_active():
    lens = GapDiscoveryLens()
    assert lens.should_activate(_make_query()) is True


@patch("pramana.lenses.gap_discovery.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.gap_discovery.chat_json")
def test_gap_discovery_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "gaps": [{"description": "Limited external validation", "evidence": "Only 1/2 papers", "severity": "high", "supporting_papers": []}]
    })
    lens = GapDiscoveryLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "gap_discovery"
    assert len(result.content["gaps"]) == 1


# --- Meta-Analysis Lens ---

def test_meta_analysis_activation():
    lens = MetaAnalysisLens()
    # Always activates — year/venue/term distributions are always useful
    assert lens.should_activate(_make_query(topics=["frequency of validation"])) is True
    assert lens.should_activate(_make_query(evaluation_focus=["prevalence of external test"])) is True
    assert lens.should_activate(_make_query(topics=["deep learning"], evaluation_focus=["accuracy"])) is True


@patch("pramana.lenses.meta_analysis.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.meta_analysis.chat_json")
def test_meta_analysis_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "frequency_stats": [], "temporal_trends": [],
        "concentration_patterns": [], "co_occurrences": [],
    })
    lens = MetaAnalysisLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "meta_analysis"
    assert "top_terms" in result.content


# --- Venue Mapping Lens ---

def test_venue_mapping_activation():
    lens = VenueMappingLens()
    # Always activates — venue context is always useful
    assert lens.should_activate(_make_query(topics=["venue differences"])) is True
    assert lens.should_activate(_make_query(topics=["deep learning"], domains=["bme"], evaluation_focus=["accuracy"])) is True


@patch("pramana.lenses.venue_mapping.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.venue_mapping.chat_json")
def test_venue_mapping_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({"venue_analysis": []})
    lens = VenueMappingLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "venue_mapping"


# --- Research Planning Lens ---

def test_research_planning_activation():
    lens = ResearchPlanningLens()
    assert lens.should_activate(_make_query(initiation_context="new research project")) is True
    assert lens.should_activate(_make_query(initiation_context="joining existing lab")) is True
    assert lens.should_activate(_make_query(initiation_context="continuation of prior work")) is False


@patch("pramana.lenses.research_planning.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.research_planning.chat_json")
def test_research_planning_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "directions": [{"area": "Multi-site validation"}],
        "evaluation_expectations": [],
        "design_patterns": [],
        "recommendations": [{"text": "Start with public datasets"}],
    })
    lens = ResearchPlanningLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "research_planning"
    assert len(result.content.get("directions", [])) == 1


# --- Bias Detection Lens ---

def test_bias_detection_always_active():
    lens = BiasDetectionLens()
    assert lens.should_activate(_make_query()) is True


@patch("pramana.lenses.bias_detection.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.bias_detection.chat_json")
def test_bias_detection_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "biases": [{"type": "dataset_concentration", "description": "Most use ChestX-ray14", "evidence": "3/4 papers", "severity": "medium"}]
    })
    lens = BiasDetectionLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "bias_detection"
    assert len(result.content["biases"]) == 1


# --- Knowledge Graph Lens ---

def test_knowledge_graph_always_active():
    lens = KnowledgeGraphLens()
    assert lens.should_activate(_make_query()) is True


@patch("pramana.lenses.knowledge_graph.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.knowledge_graph.chat_json")
def test_knowledge_graph_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "entities": [{"name": "ChestX-ray14", "type": "dataset", "papers": ["Paper A"]}],
        "relationships": [{"source": "ResNet-50", "target": "ChestX-ray14", "relation": "evaluated_on", "papers": ["Paper A"]}],
    })
    lens = KnowledgeGraphLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "knowledge_graph"
    assert len(result.content["entities"]) == 1
    assert len(result.content["relationships"]) == 1


# --- TRACE/Ancestry Lens ---

def test_trace_ancestry_always_active():
    lens = TraceAncestryLens()
    assert lens.should_activate(_make_query()) is True


@patch("pramana.lenses.trace_ancestry.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.trace_ancestry.chat_json")
def test_trace_ancestry_analyze(mock_chat, mock_rag, settings):
    mock_chat.return_value = json.dumps({
        "lineages": [{"name": "CNN architectures", "evolution": [{"year": "2015", "description": "ResNet introduced", "papers": ["Paper A"]}]}],
        "paradigm_shifts": [],
        "current_frontier": ["Vision transformers"],
    })
    lens = TraceAncestryLens()
    result = lens.analyze(_make_corpus(), _make_evidence(), _make_query(), settings)
    assert result.lens_name == "trace_ancestry"
    assert len(result.content["lineages"]) == 1


# --- Orchestrator ---

@patch("pramana.lenses.trace_ancestry.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.trace_ancestry.chat_json")
@patch("pramana.lenses.knowledge_graph.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.knowledge_graph.chat_json")
@patch("pramana.lenses.bias_detection.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.bias_detection.chat_json")
@patch("pramana.lenses.venue_mapping.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.venue_mapping.chat_json")
@patch("pramana.lenses.meta_analysis.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.meta_analysis.chat_json")
@patch("pramana.lenses.research_planning.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.research_planning.chat_json")
@patch("pramana.lenses.gap_discovery.retrieve_relevant_evidence", return_value=[])
@patch("pramana.lenses.gap_discovery.chat_json")
def test_orchestrator_activates_correct_lenses(
    mock_chat_gap, mock_rag_gap,
    mock_chat_plan, mock_rag_plan,
    mock_chat_meta, mock_rag_meta,
    mock_chat_venue, mock_rag_venue,
    mock_chat_bias, mock_rag_bias,
    mock_chat_kg, mock_rag_kg,
    mock_chat_trace, mock_rag_trace,
    settings,
):
    """Orchestrator activates all lenses for 'new' type."""
    mock_chat_gap.return_value = json.dumps({"gaps": []})
    mock_chat_plan.return_value = json.dumps({"directions": [], "evaluation_expectations": [], "design_patterns": [], "recommendations": []})
    mock_chat_meta.return_value = json.dumps({"frequency_stats": [], "temporal_trends": [], "concentration_patterns": [], "co_occurrences": []})
    mock_chat_venue.return_value = json.dumps({"venue_analysis": []})
    mock_chat_bias.return_value = json.dumps({"biases": []})
    mock_chat_kg.return_value = json.dumps({"entities": [], "relationships": []})
    mock_chat_trace.return_value = json.dumps({"lineages": [], "paradigm_shifts": [], "current_frontier": []})
    query = _make_query(initiation_context="new research project")
    results = run_analysis(_make_corpus(), _make_evidence(), query, settings)

    assert "evidence_table" in results.active_lenses
    assert "gap_discovery" in results.active_lenses
    assert "bias_detection" in results.active_lenses
    assert "knowledge_graph" in results.active_lenses
    assert "trace_ancestry" in results.active_lenses
    assert "research_planning" in results.active_lenses
    assert "meta_analysis" in results.active_lenses
    assert "venue_mapping" in results.active_lenses
