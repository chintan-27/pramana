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

