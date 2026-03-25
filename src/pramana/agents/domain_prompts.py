"""Domain-specific prompt augmentations injected into agents based on declared domain."""

# Each entry: domain keyword (matched against declared_domain.lower()) → extra system prompt text
# Agents pick the first match.

BIOMEDICAL = """Domain context: This is a biomedical / clinical research analysis.
- Pay attention to study design (RCT, cohort, case-control, meta-analysis)
- Note sample sizes, patient populations, and clinical endpoints
- Flag FDA regulatory context, IRB approvals, or clinical trial phases where mentioned
- PICO framework is especially relevant: Population, Intervention, Comparison, Outcome
- Distinguish in vitro, in vivo, and clinical evidence tiers"""

COMPUTER_SCIENCE = """Domain context: This is a CS / machine learning research analysis.
- Pay attention to benchmark datasets, model architectures, and evaluation metrics
  (accuracy, F1, AUROC)
- Note computational complexity, hardware requirements, and reproducibility claims
- Distinguish empirical results from theoretical contributions
- Flag state-of-the-art claims and note what baselines they compare against
- Note open-source availability of code and data"""

ECONOMICS = """Domain context: This is an economics / social science research analysis.
- Pay attention to identification strategies (IV, RDD, DID, natural experiments)
- Note data sources, sample periods, and geographic scope
- Distinguish reduced-form and structural estimates
- Flag endogeneity concerns and robustness checks
- Note policy implications and external validity claims"""

SOCIAL_SCIENCE = """Domain context: This is a social / behavioral science research analysis.
- Pay attention to study populations, sampling methods, and survey instruments
- Note effect sizes alongside p-values — statistical vs practical significance
- Flag replication concerns and pre-registration status where mentioned
- Distinguish observational and experimental designs
- Note cultural or geographic generalizability limitations"""

PHYSICS = """Domain context: This is a physics / engineering research analysis.
- Pay attention to experimental setups, measurement precision, and error bounds
- Note theoretical predictions vs experimental observations
- Flag reproducibility of experimental results and equipment specifications
- Distinguish simulation and analytical results from empirical data"""


# Registry: keyword → domain text
DOMAIN_REGISTRY: dict[str, str] = {
    "biomedical": BIOMEDICAL,
    "clinical": BIOMEDICAL,
    "medical": BIOMEDICAL,
    "biology": BIOMEDICAL,
    "health": BIOMEDICAL,
    "computer science": COMPUTER_SCIENCE,
    "machine learning": COMPUTER_SCIENCE,
    "artificial intelligence": COMPUTER_SCIENCE,
    "deep learning": COMPUTER_SCIENCE,
    "nlp": COMPUTER_SCIENCE,
    "economics": ECONOMICS,
    "finance": ECONOMICS,
    "econometrics": ECONOMICS,
    "social science": SOCIAL_SCIENCE,
    "psychology": SOCIAL_SCIENCE,
    "sociology": SOCIAL_SCIENCE,
    "political": SOCIAL_SCIENCE,
    "physics": PHYSICS,
    "engineering": PHYSICS,
    "chemistry": PHYSICS,
}


def get_domain_context(declared_domain: str, domains: list[str]) -> str:
    """Return the best-matching domain context string for injection into prompts."""
    text = (declared_domain + " " + " ".join(domains)).lower()
    for keyword, prompt in DOMAIN_REGISTRY.items():
        if keyword in text:
            return prompt
    return ""
