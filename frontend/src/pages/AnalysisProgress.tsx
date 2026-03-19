import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { streamAnalysisProgress, type RunStatus } from '../api/client';

const STAGES = [
  { key: 'parsing', label: 'Parsing hypothesis', sub: 'Extracting domains, topics, search queries', icon: '01' },
  { key: 'retrieval', label: 'Retrieving papers', sub: 'Semantic Scholar, arXiv, PubMed', icon: '02' },
  { key: 'screening', label: 'Screening papers', sub: 'Filtering by relevance (embedding + LLM)', icon: '03' },
  { key: 'extraction', label: 'Extracting evidence', sub: 'Facts, quotes, locations from each paper', icon: '04' },
  { key: 'normalization', label: 'Normalizing', sub: 'Canonicalizing terms, building vectors', icon: '05' },
  { key: 'analysis', label: 'Running lenses', sub: 'Applying analytical lenses to evidence', icon: '06' },
  { key: 'report', label: 'Generating report', sub: 'Compiling findings and recommendations', icon: '07' },
];

export default function AnalysisProgress() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [error, setError] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    const es = streamAnalysisProgress(
      runId,
      (data) => {
        setStatus(data);
        if (data.status === 'completed') {
          es.close();
          navigate(`/report/${runId}`);
        }
        if (data.status === 'failed') {
          es.close();
          setError(data.error || 'Analysis failed');
        }
      },
      () => {
        setError('Lost connection to server');
      },
    );
    esRef.current = es;

    return () => es.close();
  }, [runId, navigate]);

  const currentIdx = status ? STAGES.findIndex((s) => s.key === status.stage) : -1;
  const progress = (status?.progress || {}) as Record<string, unknown>;

  return (
    <div className="max-w-lg mx-auto pt-16 animate-fade-up">
      {/* Header */}
      <div className="mb-12">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">
          Processing
        </p>
        <h1 className="font-display text-3xl text-cream font-300 tracking-tight">
          Analysis in progress
        </h1>
        <p className="text-sm text-cream-muted mt-2">
          Streaming live updates from the pipeline.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-rose-subtle border border-rose/20 rounded-lg">
          <p className="font-medium text-rose text-sm">Analysis Failed</p>
          <p className="text-sm text-rose/70 mt-1">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm font-medium text-amber hover:text-amber-glow transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Live stats bar */}
      {progress.papers_found != null && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
            <p className="text-lg font-display font-600 text-cream">{String(progress.papers_found)}</p>
            <p className="text-[10px] text-cream-faint font-mono">papers found</p>
          </div>
          {progress.facts_extracted != null && (
            <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
              <p className="text-lg font-display font-600 text-cream">{String(progress.facts_extracted)}</p>
              <p className="text-[10px] text-cream-faint font-mono">facts extracted</p>
            </div>
          )}
          {progress.lenses_completed != null && (
            <div className="bg-bg-card border border-line rounded-lg p-3 text-center">
              <p className="text-lg font-display font-600 text-cream">{(progress.lenses_completed as string[]).length}</p>
              <p className="text-[10px] text-cream-faint font-mono">lenses done</p>
            </div>
          )}
        </div>
      )}

      {/* Pipeline stages */}
      <div className="space-y-0 stagger">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isPending = i > currentIdx;

          return (
            <div
              key={stage.key}
              className={`pipeline-connector flex items-start gap-4 pb-7 transition-opacity duration-300 ${isPending ? 'opacity-25' : ''}`}
            >
              {/* Indicator */}
              <div className="shrink-0 relative z-10">
                {isDone ? (
                  <div className="w-11 h-11 rounded-lg bg-teal/15 border border-teal/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-11 h-11 rounded-lg bg-amber-subtle border border-amber/30 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-amber glow-dot" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-bg-card border border-line flex items-center justify-center">
                    <span className="text-xs font-mono text-cream-faint">{stage.icon}</span>
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="pt-2.5 min-w-0">
                <p className={`text-sm font-medium ${
                  isActive ? 'text-amber' : isDone ? 'text-cream' : 'text-cream-muted'
                }`}>
                  {stage.label}
                </p>
                <p className="text-[12px] text-cream-faint mt-0.5">{stage.sub}</p>
                {isActive && !!progress.description && (
                  <p className="text-[12px] text-amber/80 font-mono mt-1.5">
                    {String(progress.description)}
                  </p>
                )}
                {/* Stage-specific live stats */}
                {isDone && stage.key === 'retrieval' && !!progress.sources && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    S2: {(progress.sources as Record<string, number>).s2} &middot;
                    arXiv: {(progress.sources as Record<string, number>).arxiv} &middot;
                    PubMed: {(progress.sources as Record<string, number>).pubmed}
                  </p>
                )}
                {isDone && stage.key === 'screening' && progress.papers_passed != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {String(progress.papers_passed)} passed &middot; {String(progress.papers_screened_out ?? 0)} filtered
                  </p>
                )}
                {isDone && stage.key === 'extraction' && progress.facts_extracted != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {String(progress.facts_extracted)} facts from {String(progress.papers_processed ?? '?')} papers
                  </p>
                )}
                {isDone && stage.key === 'normalization' && progress.mappings != null && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {String(progress.mappings)} mappings &middot; {String(progress.categories)} categories
                  </p>
                )}
                {isDone && stage.key === 'analysis' && !!progress.lenses_completed && (
                  <p className="text-[11px] text-cream-faint font-mono mt-1">
                    {(progress.lenses_completed as string[]).join(', ')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run ID */}
      <div className="mt-8 text-center">
        <span className="text-[10px] font-mono text-cream-faint bg-bg-card px-3 py-1.5 rounded border border-line">
          {runId}
        </span>
      </div>
    </div>
  );
}
