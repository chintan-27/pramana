"""Statistical Aggregation Lens — aggregates numeric results across papers."""

import logging
import re
import statistics

from pramana.config import Settings
from pramana.lenses.base import Lens, LensResult
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence

logger = logging.getLogger(__name__)

# Regex to extract numbers from metric facts (percentages, decimals, integers)
_NUMBER_RE = re.compile(r"(\d+\.?\d*)\s*(%|percent|accuracy|AUC|AUROC|F1|precision|recall|"
                        r"score|error|loss|p-value|r²|r2|effect size|cohen|OR|HR|RR)",
                        re.IGNORECASE)
_BARE_PERCENT_RE = re.compile(r"(\d+\.?\d*)\s*%")


class StatisticalAggregationLens(Lens):
    """Aggregates numeric results (accuracy, effect sizes, etc.) across papers."""

    name = "statistical_aggregation"
    title = "Statistical Aggregation"

    def should_activate(self, query: HypothesisQuery) -> bool:
        return True  # Checked against fact count in analyze

    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        metric_facts = [f for f in evidence.facts if f.fact_type in ("metric", "finding")]

        if len(metric_facts) < 2:
            return LensResult(
                lens_name=self.name,
                title=self.title,
                content={"aggregations": []},
                summary="Insufficient metric facts for statistical aggregation (need ≥ 2).",
            )

        # Extract numbers per canonical metric name
        by_metric: dict[str, list[float]] = {}
        for fact in metric_facts:
            canonical = evidence.canonical_mappings.get(fact.content, fact.content)
            key = canonical[:60].strip()
            numbers = _extract_numbers(fact.content + " " + (fact.direct_quote or ""))
            if numbers:
                by_metric.setdefault(key, []).extend(numbers)

        aggregations = []
        for metric, values in by_metric.items():
            if len(values) < 2:
                continue
            try:
                agg = {
                    "metric": metric,
                    "count": len(values),
                    "mean": round(statistics.mean(values), 3),
                    "min": round(min(values), 3),
                    "max": round(max(values), 3),
                }
                if len(values) >= 3:
                    agg["std"] = round(statistics.stdev(values), 3)
                aggregations.append(agg)
            except Exception:
                pass

        aggregations.sort(key=lambda x: x["count"], reverse=True)

        total_values = sum(a["count"] for a in aggregations)
        summary = (
            f"Aggregated {total_values} numeric values across {len(aggregations)} metrics "
            f"from {len(metric_facts)} facts."
            if aggregations
            else "No numeric values could be extracted from metric facts."
        )

        return LensResult(
            lens_name=self.name,
            title=self.title,
            content={
                "aggregations": aggregations[:20],
                "metrics_found": len(aggregations),
                "total_values": total_values,
            },
            summary=summary,
        )


def _extract_numbers(text: str) -> list[float]:
    """Extract numeric values from a text string."""
    numbers = []
    for match in _NUMBER_RE.finditer(text):
        try:
            numbers.append(float(match.group(1)))
        except ValueError:
            pass
    if not numbers:
        for match in _BARE_PERCENT_RE.finditer(text):
            try:
                numbers.append(float(match.group(1)))
            except ValueError:
                pass
    return numbers
