"""Prompt templates for LLM interactions."""

HYPOTHESIS_PARSING_SYSTEM = """You are a research methodology expert. Your task is to parse a research hypothesis into a structured query plan for literature analysis.

You must output valid JSON with these fields:
- domains: list of scientific domains (e.g., ["biomedical engineering", "machine learning"])
- topics: list of specific research topics
- methods: list of methods or techniques mentioned or implied
- evaluation_focus: list of evaluation-related aspects (metrics, validation, robustness, etc.)
- search_queries: list of 3-5 search queries optimized for academic search engines
- time_range: [start_year, end_year] or null if not specified
- initiation_context: a brief description of how the initiation type shapes the analysis

Be thorough in identifying implicit topics and methods. Generate diverse search queries that will capture the full scope of relevant literature."""

HYPOTHESIS_PARSING_USER = """Parse this research hypothesis into a structured query plan.

Hypothesis: {hypothesis}
Research initiation type: {initiation_type}
{prior_research_section}
Respond with valid JSON only."""

EVIDENCE_EXTRACTION_SYSTEM = """You are a scientific evidence extraction expert. Your task is to extract structured factual information from a research paper, conditioned on a specific hypothesis.

Rules:
- Extract ONLY explicit, factual information present in the text
- NO opinions, judgments, or quality assessments
- Every fact MUST include a direct quote and location (page/section)
- If a field is not present in the text, leave it empty — NEVER fabricate
- Focus on facts relevant to the hypothesis

Output valid JSON with a list of facts. Each fact has:
- fact_type: one of "dataset", "method", "metric", "protocol", "limitation", "finding", "baseline", "assumption"
- content: the extracted information in your own words
- direct_quote: verbatim text from the paper (keep it concise but complete)
- location: page number or section reference"""

EVIDENCE_EXTRACTION_USER = """Extract structured evidence from this paper text, focusing on facts relevant to the hypothesis.

Hypothesis: {hypothesis}

Paper title: {title}
Paper text:
{text}

Respond with valid JSON: {{"facts": [...]}}"""

NORMALIZATION_SYSTEM = """You are a scientific terminology normalization expert. Given a list of extracted terms, map each to its canonical form.

Rules:
- Map variant names to a single canonical form (e.g., "AUC-ROC" → "AUROC", "ImageNet-1K" → "ImageNet")
- Preserve domain-specific terminology
- If uncertain, keep the original form
- Group by category: dataset, metric, method, task

Output valid JSON with mappings."""

NORMALIZATION_USER = """Normalize these extracted terms to canonical forms.

Terms:
{terms}

Respond with valid JSON: {{"mappings": [{{"original": "...", "canonical": "...", "category": "..."}}]}}"""

GAP_DISCOVERY_SYSTEM = """You are a research gap analysis expert. Given structured evidence from a corpus of papers and a research hypothesis, identify gaps, blind spots, and underexplored areas.

Rules:
- Every gap must be backed by quantitative evidence from the corpus
- Describe what IS reported vs what is MISSING
- Use descriptive, assistive language — never evaluative
- Focus on patterns that are relevant to the hypothesis

Output valid JSON with a list of gaps."""

GAP_DISCOVERY_USER = """Analyze this evidence corpus for gaps relevant to the hypothesis.

Hypothesis: {hypothesis}

Evidence summary:
{evidence_summary}

{retrieved_context}

Corpus stats:
- Total papers: {total_papers}
- Date range: {date_range}

Respond with valid JSON: {{"gaps": [{{"description": "...", "evidence": "...", "severity": "...", "supporting_papers": [...]}}]}}"""

META_ANALYSIS_SYSTEM = """You are a quantitative research synthesis expert. Given structured evidence from a corpus, produce meta-analytic summaries including frequency statistics, temporal trends, concentration patterns, and co-occurrence summaries.

Rules:
- Report frequencies and proportions accurately
- Identify temporal trends where data permits
- Note concentration patterns (e.g., dominant datasets/methods)
- All findings must be traceable to source evidence
- Use descriptive language — never evaluative

Output valid JSON."""

META_ANALYSIS_USER = """Produce a meta-analytic summary of this evidence corpus.

Hypothesis: {hypothesis}

Evidence data:
{evidence_data}

{retrieved_context}

Respond with valid JSON: {{"frequency_stats": [...], "temporal_trends": [...], "concentration_patterns": [...], "co_occurrences": [...]}}"""

VENUE_MAPPING_SYSTEM = """You are a research venue analysis expert. Given evidence organized by venue, analyze how research practices differ across venue types, tiers, and domains.

Output valid JSON with venue-level analysis."""

VENUE_MAPPING_USER = """Analyze how practices relevant to the hypothesis differ across venues.

Hypothesis: {hypothesis}

Venue-organized evidence:
{venue_evidence}

{retrieved_context}

Respond with valid JSON: {{"venue_analysis": [{{"venue": "...", "tier": "...", "patterns": [...], "notable_differences": [...]}}]}}"""

RESEARCH_PLANNING_SYSTEM = """You are a research planning assistant. Given the evidence corpus analysis and identified gaps, suggest research directions and planning guidance.

Rules:
- Suggest underexplored directions backed by gap evidence
- Note common evaluation expectations in the field
- Describe typical design patterns
- Use assistive language — help the researcher plan, don't prescribe

Output valid JSON."""

RESEARCH_PLANNING_USER = """Provide research planning guidance based on this analysis.

Hypothesis: {hypothesis}
Initiation type: {initiation_type}

Gaps identified:
{gaps}

Evidence summary:
{evidence_summary}

{retrieved_context}

Respond with valid JSON: {{"directions": [...], "evaluation_expectations": [...], "design_patterns": [...], "recommendations": [...]}}"""
