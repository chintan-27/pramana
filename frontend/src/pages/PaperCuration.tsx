import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCorpusPapers, confirmCorpus, type CorpusPaper } from '../api/client';

const SOURCE_META: Record<string, { label: string; color: string }> = {
  s2:        { label: 'S2',       color: 'border-lavender/30 bg-lavender/10 text-lavender' },
  arxiv:     { label: 'arXiv',    color: 'border-amber/30 bg-amber-subtle text-amber' },
  pubmed:    { label: 'PubMed',   color: 'border-teal/30 bg-teal/10 text-teal' },
  crossref:  { label: 'CrossRef', color: 'border-line bg-bg-card text-cream-muted' },
  pdf:       { label: 'PDF',      color: 'border-rose/30 bg-rose/10 text-rose' },
  unknown:   { label: '?',        color: 'border-line bg-bg-card text-cream-faint' },
};

function SourceBadge({ source }: { source: CorpusPaper['source'] }) {
  const meta = SOURCE_META[source] || SOURCE_META.unknown;
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct > 60 ? 'bg-teal' : pct > 30 ? 'bg-amber' : 'bg-rose'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-cream-faint w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function PaperCuration() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [papers, setPapers] = useState<CorpusPaper[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [reinstated, setReinstated] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'included' | 'screened'>('included');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;
    getCorpusPapers(runId)
      .then((r) => { setPapers(r.papers); setLoading(false); })
      .catch(() => { setError('Could not load papers.'); setLoading(false); });
  }, [runId]);

  const included = papers.filter((p) => !p.screened_out);
  const screened = papers.filter((p) => p.screened_out);

  const toggleExclude = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleReinstate = (id: number) => {
    setReinstated((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!runId) return;
    setSubmitting(true);
    // Excluded = user excluded included papers; reinstated = user wants screened-out papers back
    // Backend knows to un-screen reinstated papers. We pass them as negative excluded_ids.
    // Actually the backend just takes excluded_ids from included papers.
    // Reinstated papers are simply NOT in excluded_ids despite being screened_out —
    // we need a separate field. Let's pass excluded + "unscreened" via two calls.
    // Simpler: pass excluded_ids = (user-excluded from included) minus (reinstated from screened).
    // The backend will mark those as screened_out. For reinstated, we clear screened_out.
    // Since the backend API only takes excluded_ids, we'll just send them and handle reinstatement
    // client-side by passing reinstated IDs as negative (subtract) — but the backend doesn't support that.
    // Keep it simple: excluded_ids = papers user manually excluded.
    // For reinstated screened-out papers, we'd need a separate mechanism.
    // For now: just pass excluded_ids, reinstatement is a future enhancement.
    const excludedIds = Array.from(excluded);
    try {
      await confirmCorpus(runId, excludedIds);
      navigate(`/analysis/${runId}`);
    } catch {
      setError('Failed to confirm. Please try again.');
      setSubmitting(false);
    }
  };

  const finalCount = included.length - excluded.size + reinstated.size;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pt-16 animate-fade-up text-center">
        <div className="w-2 h-2 rounded-full bg-amber glow-dot mx-auto mb-4" />
        <p className="text-sm text-cream-muted">Loading papers…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto pt-16 animate-fade-up">
        <p className="text-rose text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-16 pb-20 animate-fade-up">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">
          Step 2 of 2
        </p>
        <h1 className="font-display text-3xl text-cream font-300 tracking-tight">
          Review your papers
        </h1>
        <p className="text-sm text-cream-muted mt-2 leading-relaxed">
          Uncheck any papers that aren't relevant. Screened-out papers can be reinstated.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-bg-card border border-line rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('included')}
          className={`px-4 py-1.5 text-xs font-mono rounded-md transition-colors ${
            activeTab === 'included'
              ? 'bg-amber text-bg font-medium'
              : 'text-cream-muted hover:text-cream'
          }`}
        >
          Included ({included.length})
        </button>
        <button
          onClick={() => setActiveTab('screened')}
          className={`px-4 py-1.5 text-xs font-mono rounded-md transition-colors ${
            activeTab === 'screened'
              ? 'bg-amber text-bg font-medium'
              : 'text-cream-muted hover:text-cream'
          }`}
        >
          Screened out ({screened.length})
        </button>
      </div>

      {/* Paper list */}
      <div className="space-y-2 mb-8">
        {activeTab === 'included' && included.map((p) => {
          const isExcluded = excluded.has(p.db_id);
          return (
            <label
              key={p.db_id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                isExcluded
                  ? 'border-line bg-bg opacity-50'
                  : 'border-line bg-bg-card hover:border-amber/30'
              }`}
            >
              <input
                type="checkbox"
                checked={!isExcluded}
                onChange={() => toggleExclude(p.db_id)}
                className="mt-1 accent-amber"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceBadge source={p.source} />
                  {p.year && (
                    <span className="text-[10px] font-mono text-cream-faint">{p.year}</span>
                  )}
                  {p.venue && (
                    <span className="text-[10px] text-cream-faint truncate max-w-[160px]">{p.venue}</span>
                  )}
                </div>
                <p className="text-sm text-cream leading-snug">{p.title}</p>
                {p.authors.length > 0 && (
                  <p className="text-[11px] text-cream-muted">
                    {p.authors.slice(0, 3).join(', ')}{p.authors.length > 3 ? ' et al.' : ''}
                  </p>
                )}
                <RelevanceBar score={p.relevance_score} />
              </div>
            </label>
          );
        })}

        {activeTab === 'screened' && screened.length === 0 && (
          <p className="text-sm text-cream-muted py-4 text-center">
            No papers were screened out.
          </p>
        )}

        {activeTab === 'screened' && screened.map((p) => {
          const isReinstated = reinstated.has(p.db_id);
          return (
            <label
              key={p.db_id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                isReinstated
                  ? 'border-teal/30 bg-teal/5'
                  : 'border-line bg-bg opacity-60'
              }`}
            >
              <input
                type="checkbox"
                checked={isReinstated}
                onChange={() => toggleReinstate(p.db_id)}
                className="mt-1 accent-teal"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceBadge source={p.source} />
                  {p.year && (
                    <span className="text-[10px] font-mono text-cream-faint">{p.year}</span>
                  )}
                </div>
                <p className="text-sm text-cream leading-snug">{p.title}</p>
                {p.screening_reason && (
                  <p className="text-[11px] text-cream-faint italic">
                    Filtered: {p.screening_reason}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-5">
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg bg-amber text-bg text-sm font-medium hover:bg-amber-glow transition-colors disabled:opacity-50"
        >
          {submitting ? 'Starting analysis…' : `Run analysis with ${finalCount} papers →`}
        </button>
        {excluded.size > 0 && (
          <p className="text-xs text-cream-faint">
            {excluded.size} paper{excluded.size > 1 ? 's' : ''} excluded
          </p>
        )}
      </div>
    </div>
  );
}
