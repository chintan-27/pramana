"""Base lens interface for analytical lenses."""

from abc import ABC, abstractmethod

from pydantic import BaseModel

from pramana.config import Settings
from pramana.pipeline.corpus import Corpus
from pramana.pipeline.hypothesis import HypothesisQuery
from pramana.pipeline.normalization import NormalizedEvidence


class LensResult(BaseModel):
    """Output from an analytical lens."""

    lens_name: str
    title: str
    content: dict = {}
    summary: str = ""


class Lens(ABC):
    """Abstract base class for analytical lenses."""

    name: str = "base"
    title: str = "Base Lens"

    @abstractmethod
    def analyze(
        self,
        corpus: Corpus,
        evidence: NormalizedEvidence,
        query: HypothesisQuery,
        settings: Settings,
    ) -> LensResult:
        """Run the lens analysis and return results."""
        ...

    def should_activate(self, query: HypothesisQuery) -> bool:
        """Determine if this lens should be activated for the given query."""
        return True
