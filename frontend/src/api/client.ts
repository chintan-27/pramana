const BASE_URL = '/api';

export interface AnalyzeRequest {
  hypothesis: string;
  initiation_type: string;
  max_papers: number;
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

export interface Report {
  hypothesis: Record<string, unknown>;
  active_lenses: string[];
  lens_results: Array<{
    lens: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
  }>;
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

export function connectWebSocket(runId: string, onMessage: (data: RunStatus) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/analyze/${runId}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  return ws;
}
