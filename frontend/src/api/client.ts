const BASE_URL = '/api';

export interface AnalyzeRequest {
  hypothesis: string;
  initiation_type: string;
  max_papers: number;
  prior_research?: string;
  pdf_file_ids?: string[];
  action?: string;  // free-text: what the user wants to do (routes to analysis flows)
}

export interface AnalyzeResponse {
  run_id: string;
  status: string;
}

export interface RunStatus {
  run_id: string;
  status: string;
  stage: string;
  progress: Record<string, unknown>;
  error: string | null;
}

export interface Paper {
  id: number;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  abstract: string;
  facts: Fact[];
}

export interface Fact {
  id: number;
  fact_type: string;
  content: string;
  direct_quote: string;
  location: string;
  confidence: number;
}

export interface EvidenceSearchResult {
  results: Array<{
    text: string;
    metadata: Record<string, unknown>;
    score: number;
  }>;
  total: number;
}

export interface Venue {
  id: number;
  name: string;
  venue_type: string;
  domain: string;
  tier: string;
}

export interface LensResult {
  lens: string;
  title: string;
  summary: string;
  content: Record<string, unknown>;
}

export interface FlowResult {
  title: string;
  description: string;
  lens_results: LensResult[];
}

export interface ExecutiveSummary {
  headline: string;
  bullets: string[];
  confidence: string;
}

export interface Report {
  hypothesis: Record<string, unknown>;
  executive_summary?: ExecutiveSummary;
  active_lenses: string[];
  lens_results: LensResult[];
  flows?: {
    selected: string[];
    reasoning: string;
    results: Record<string, FlowResult>;
  };
}

export async function startAnalysis(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Failed to start analysis: ${res.statusText}`);
  return res.json();
}

export async function getAnalysisStatus(runId: string): Promise<RunStatus> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}`);
  if (!res.ok) throw new Error(`Failed to get status: ${res.statusText}`);
  return res.json();
}

export async function getReport(runId: string): Promise<Report> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/report`);
  if (!res.ok) throw new Error(`Failed to get report: ${res.statusText}`);
  const data = await res.json();
  return data.report;
}

export async function getPaper(paperId: number): Promise<Paper> {
  const res = await fetch(`${BASE_URL}/papers/${paperId}`);
  if (!res.ok) throw new Error(`Failed to get paper: ${res.statusText}`);
  return res.json();
}

export async function searchEvidence(query: string, limit = 20): Promise<EvidenceSearchResult> {
  const res = await fetch(`${BASE_URL}/evidence?query=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to search: ${res.statusText}`);
  return res.json();
}

export async function getVenues(domain?: string): Promise<Venue[]> {
  const url = domain ? `${BASE_URL}/venues?domain=${encodeURIComponent(domain)}` : `${BASE_URL}/venues`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to get venues: ${res.statusText}`);
  return res.json();
}

export interface ReportListItem {
  run_id: number;
  hypothesis: string;
  completed_at: string | null;
  paper_count: number;
}

export async function getReports(): Promise<ReportListItem[]> {
  const res = await fetch(`${BASE_URL}/reports`);
  if (!res.ok) throw new Error(`Failed to get reports: ${res.statusText}`);
  const data = await res.json();
  return data.reports;
}

export async function getSavedReport(runId: number): Promise<Report> {
  const res = await fetch(`${BASE_URL}/reports/${runId}`);
  if (!res.ok) throw new Error(`Failed to get report: ${res.statusText}`);
  const data = await res.json();
  return data.report;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithReport(
  runId: string | number,
  message: string,
  history: ChatMessage[],
): Promise<{ response: string }> {
  const res = await fetch(`${BASE_URL}/reports/${runId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`);
  return res.json();
}

export interface PdfUploadResult {
  file_id: string;
  filename: string;
  page_count: number;
  char_count: number;
  text_preview: string;
}

export async function uploadPdf(file: File): Promise<PdfUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/upload-pdf`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Upload failed: ${res.statusText}`);
  }
  return res.json();
}

// --- Human-in-the-loop endpoints ---

export interface ParsedQuery {
  domains: string[];
  topics: string[];
  methods: string[];
  search_queries: string[];
  pico?: { population: string; intervention: string; comparison: string; outcome: string };
}

export interface CorpusPaper {
  db_id: number;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  source: 's2' | 'arxiv' | 'pubmed' | 'crossref' | 'pdf' | 'unknown';
  screened_out: boolean;
  screening_reason: string;
  relevance_score: number;
}

export async function getParsedQuery(runId: string): Promise<{ parsed_query: ParsedQuery; status: string }> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/parsed-query`);
  if (!res.ok) throw new Error(`Failed to get parsed query: ${res.statusText}`);
  return res.json();
}

export async function confirmHypothesis(
  runId: string,
  edits: Partial<Pick<ParsedQuery, 'domains' | 'topics' | 'search_queries'>>,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/confirm-hypothesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edits),
  });
  if (!res.ok) throw new Error(`Failed to confirm hypothesis: ${res.statusText}`);
}

export async function getCorpusPapers(runId: string): Promise<{ papers: CorpusPaper[] }> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/corpus-papers`);
  if (!res.ok) throw new Error(`Failed to get corpus papers: ${res.statusText}`);
  return res.json();
}

export async function confirmCorpus(runId: string, excludedIds: number[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/confirm-corpus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ excluded_ids: excludedIds }),
  });
  if (!res.ok) throw new Error(`Failed to confirm corpus: ${res.statusText}`);
}

export function exportReport(runId: number, format: 'bibtex' | 'csv' | 'markdown' | 'docx'): void {
  window.open(`${BASE_URL}/reports/${runId}/export?format=${format}`, '_blank');
}

// --- Batch I: Annotations, re-run, follow-up search ---

export interface Annotation {
  id: number;
  content_ref: string;
  note: string;
  created_at: string;
}

export async function createAnnotation(runId: string | number, contentRef: string, note = ''): Promise<Annotation> {
  const res = await fetch(`${BASE_URL}/reports/${runId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_ref: contentRef, note }),
  });
  if (!res.ok) throw new Error(`Failed to create annotation: ${res.statusText}`);
  return res.json();
}

export async function getAnnotations(runId: string | number): Promise<{ annotations: Annotation[] }> {
  const res = await fetch(`${BASE_URL}/reports/${runId}/annotations`);
  if (!res.ok) throw new Error(`Failed to get annotations: ${res.statusText}`);
  return res.json();
}

export async function deleteAnnotation(runId: string | number, annId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/reports/${runId}/annotations/${annId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete annotation: ${res.statusText}`);
}

export async function rerunLens(runId: string, lensName: string): Promise<LensResult> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/rerun-lens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lens_name: lensName }),
  });
  if (!res.ok) throw new Error(`Failed to re-run lens: ${res.statusText}`);
  return res.json();
}

export async function searchMore(
  runId: string,
  query: string,
  maxPapers = 10,
): Promise<{ added_papers: number; new_facts: number; message: string }> {
  const res = await fetch(`${BASE_URL}/analyze/${runId}/search-more`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_papers: maxPapers }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

// --- Batch J: Explore / Onboarding ---

export async function exploreSamplePapers(field: string): Promise<{ papers: Array<{ title: string; abstract: string; year: number | null }> }> {
  const res = await fetch(`${BASE_URL}/explore/sample-papers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field }),
  });
  if (!res.ok) throw new Error(`Failed to fetch sample papers: ${res.statusText}`);
  return res.json();
}

export async function suggestHypotheses(field: string, selectedTitles: string[]): Promise<{ hypotheses: string[] }> {
  const res = await fetch(`${BASE_URL}/explore/suggest-hypotheses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, selected_titles: selectedTitles }),
  });
  if (!res.ok) throw new Error(`Failed to suggest hypotheses: ${res.statusText}`);
  return res.json();
}

export async function buildHypothesis(
  population: string, intervention: string, comparison: string,
  outcome: string, domain: string,
): Promise<{ hypothesis: string }> {
  const res = await fetch(`${BASE_URL}/explore/build-hypothesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ population, intervention, comparison, outcome, domain }),
  });
  if (!res.ok) throw new Error(`Failed to build hypothesis: ${res.statusText}`);
  return res.json();
}

export function streamAnalysisProgress(
  runId: string,
  onEvent: (data: RunStatus) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}/analyze/${runId}/stream`);
  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onEvent(data);
  };
  es.onerror = (err) => {
    if (onError) onError(err);
    es.close();
  };
  return es;
}

