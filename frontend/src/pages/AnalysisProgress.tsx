import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAnalysisStatus, type RunStatus } from '../api/client';

const STAGES = [
  { key: 'parsing', label: 'Parsing Hypothesis', detail: 'Extracting domains, topics, and search queries' },
  { key: 'retrieval', label: 'Retrieving Papers', detail: 'Searching Semantic Scholar, arXiv, and PubMed' },
  { key: 'extraction', label: 'Extracting Evidence', detail: 'Identifying facts, quotes, and locations' },
  { key: 'normalization', label: 'Normalizing Evidence', detail: 'Canonicalizing terms and populating vectors' },
  { key: 'analysis', label: 'Running Analysis', detail: 'Applying analytical lenses to evidence' },
  { key: 'report', label: 'Generating Report', detail: 'Compiling findings and recommendations' },
];

export default function AnalysisProgress() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;

    const poll = async () => {
      try {
        const data = await getAnalysisStatus(runId);
        setStatus(data);

        if (data.status === 'completed') {
          navigate(`/report/${runId}`);
          return;
        }
        if (data.status === 'failed') {
          setError(data.error || 'Analysis failed');
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get status');
        return;
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [runId, navigate]);

  const currentStageIndex = status ? STAGES.findIndex((s) => s.key === status.stage) : -1;

  return (
    <div className="max-w-lg mx-auto pt-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-subtle mb-4">
          <svg className="w-6 h-6 text-accent animate-spin-slow" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Analysis in Progress</h1>
        <p className="text-sm text-ink-muted mt-1">
          Processing your research hypothesis
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-danger-subtle border border-danger/20 rounded-xl">
          <p className="font-medium text-danger text-sm">Analysis Failed</p>
          <p className="text-sm text-danger/80 mt-1">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm font-medium text-accent hover:text-accent-light transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      )}

      {/* Pipeline visualization */}
      <div className="space-y-0">
        {STAGES.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isComplete = index < currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <div key={stage.key} className={`pipeline-connector flex items-start gap-4 pb-6 ${isPending ? 'opacity-40' : ''}`}>
              {/* Step indicator */}
              <div className="flex-shrink-0 relative z-10">
                {isComplete ? (
                  <div className="w-10 h-10 rounded-xl bg-success flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-10 h-10 rounded-xl bg-accent-subtle border-2 border-accent flex items-center justify-center">
                    <div className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-surface-sunken border border-border flex items-center justify-center">
                    <span className="text-sm font-mono text-ink-muted">{index + 1}</span>
                  </div>
                )}
              </div>

              {/* Step content */}
              <div className="pt-2 min-w-0">
                <p className={`font-medium text-sm ${
                  isActive ? 'text-accent' : isComplete ? 'text-ink' : 'text-ink-muted'
                }`}>
                  {stage.label}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">{stage.detail}</p>
                {isActive && status?.progress && (
                  <p className="text-xs text-accent font-medium mt-1.5">
                    {status.progress.description as string || 'Processing…'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run ID */}
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted font-mono bg-surface-sunken px-3 py-1.5 rounded-lg">
          <span className="opacity-50">Run</span>
          {runId}
        </span>
      </div>
    </div>
  );
}
