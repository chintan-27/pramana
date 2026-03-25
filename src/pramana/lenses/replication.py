"""Replication Tracker Lens — tracks which findings are replicated across papers."""

import json
import logging
from collections import defaultdict

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.llm.client import chat_json
from pramana.llm.prompts import REPLICATION_SYSTEM, REPLICATION_USER
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)


class ReplicationLens(Lens):
    """Tracks replication of findings across papers in the corpus."""

    name = "replication"
    title = "Replication Tracker"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Activated when enough papers exist (checked in analyze)

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        active_papers = [p for p in corpus.papers if not p.get("screened_out")]

        if len(active_papers) < 3:
            return LensResult(
                lens_name=self.name,
                title=self.title,
                content={"replications": []},
                summary="Insufficient papers for replication analysis (need ≥ 3).",
            )

        # Group finding/metric facts by canonical name
        grouped: dict[str, list[dict]] = defaultdict(list)
        for fact in evidence.facts:
            if fact.fact_type not in ("finding", "metric"):
                continue
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            # Use a shortened key (first 80 chars) for grouping
            key = canonical[:80].strip()
            grouped[key].append({
                "content": fact.content,
                "paper": fact.paper_title or f"paper_{fact.paper_id}",
                "quote": fact.direct_quote[:100] if fact.direct_quote else "",
            })

        if not grouped:
            return LensResult(
                lens_name=self.name,
                title=self.title,
                content={"replications": []},
                summary="No finding or metric facts available for replication analysis.",
            )

        # Only send groups with 2+ entries or top 15 for LLM context
        multi_findings = {k: v for k, v in grouped.items() if len(v) >= 2}
        single_findings = {k: v for k, v in grouped.items() if len(v) == 1}

        # Format for LLM
        lines = []
        for finding, instances in list(multi_findings.items())[:10]:
            lines.append(f"Finding: {finding}")
            for inst in instances[:5]:
                lines.append(f"  - {inst['paper']}: {inst['content'][:80]}")
        for finding, instances in list(single_findings.items())[:5]:
            lines.append(f"Finding (single): {finding}")
            for inst in instances[:2]:
                lines.append(f"  - {inst['paper']}: {inst['content'][:80]}")

        hypothesis_text = " ".join(query.topics) or " ".join(query.domains)

        try:
            messages = [
                {"role": "system", "content": REPLICATION_SYSTEM},
                {
                    "role": "user",
                    "content": REPLICATION_USER.format(
                        hypothesis=hypothesis_text,
                        grouped_findings="\n".join(lines),
                    ),
                },
            ]
            response = chat_json(messages, settings)
            data = json.loads(response)
        except Exception as e:
            logger.error("ReplicationLens LLM call failed: %s", e)
            data = {"replications": [], "summary": ""}

        replications = data.get("replications", [])
        confirmed = sum(1 for r in replications if r.get("status") == "confirmed")
        challenged = sum(1 for r in replications if r.get("status") == "challenged")
        summary = data.get("summary") or (
            f"{confirmed} confirmed, {challenged} challenged, "
            f"{len(replications) - confirmed - challenged} single findings."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "replications": replications,
                "confirmed_count": confirmed,
                "challenged_count": challenged,
                "single_count": len(single_findings),
            },
            summary=summary,
        )
