"""Venue & Domain Mapping Lens — analyze practices across venues."""

import json
from collections import defaultdict

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import VENUE_MAPPING_SYSTEM, VENUE_MAPPING_USER
from pramana.models.database import get_session
from pramana.models.schema import Venue
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

ACTIVATION_KEYWORDS = {"venue", "journal", "conference", "domain", "field", "tier", "publication"}


class VenueMappingLens(Lens):
    """Analyzes how research practices differ across venue types and tiers."""

    name = "venue_mapping"
    title = "Venue & Domain Mapping"

    def should_activate(self, query: HypothesisQuery) -> bool:
        all_text = " ".join(query.topics + query.domains + query.evaluation_focus).lower()
        return any(kw in all_text for kw in ACTIVATION_KEYWORDS)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        # Group evidence by venue
        venue_evidence = self._group_by_venue(corpus, evidence, settings)

        hypothesis_text = " | ".join(query.topics) if query.topics else "General"

        # LLM analysis of venue patterns
        messages = [
            {"role": "system", "content": VENUE_MAPPING_SYSTEM},
            {
                "role": "user",
                "content": VENUE_MAPPING_USER.format(
                    hypothesis=hypothesis_text,
                    venue_evidence=json.dumps(venue_evidence, indent=2),
                ),
            },
        ]

        try:
            response = chat_json(messages, settings)
            analysis = json.loads(response)
        except (json.JSONDecodeError, Exception):
            analysis = {"venue_analysis": []}

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "venue_evidence_summary": venue_evidence,
                "venue_analysis": analysis.get("venue_analysis", []),
            },
            summary=f"Analyzed practices across {len(venue_evidence)} venues.",
        )

    def _group_by_venue(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        settings: Settings,
    ) -> dict:
        """Group facts by venue, enriching with venue DB info."""
        # Build paper_id -> venue mapping
        paper_venues: dict[int | None, str] = {}
        for paper in corpus.papers:
            paper_venues[paper.get("db_id")] = paper.get("venue", "Unknown")

        # Look up venue tiers from DB
        venue_tiers: dict[str, str] = {}
        try:
            with get_session(settings) as session:
                for v in session.query(Venue).all():
                    venue_tiers[v.name] = v.tier or "unknown"
        except Exception:
            pass

        # Group facts
        by_venue: dict[str, dict] = defaultdict(
            lambda: {"facts": [], "tier": "unknown", "paper_count": 0}
        )
        paper_ids_by_venue: dict[str, set] = defaultdict(set)

        for fact in evidence.facts:
            venue = paper_venues.get(fact.paper_id, "Unknown")
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            by_venue[venue]["facts"].append({
                "type": fact.fact_type,
                "content": canonical,
            })
            by_venue[venue]["tier"] = venue_tiers.get(venue, "unknown")
            if fact.paper_id:
                paper_ids_by_venue[venue].add(fact.paper_id)

        # Convert sets to counts
        result = {}
        for venue, data in by_venue.items():
            result[venue] = {
                "tier": data["tier"],
                "paper_count": len(paper_ids_by_venue[venue]),
                "fact_count": len(data["facts"]),
                "fact_types": list({f["type"] for f in data["facts"]}),
                "top_terms": [f["content"] for f in data["facts"][:10]],
            }

        return result
