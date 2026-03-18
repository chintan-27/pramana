import { useState } from 'react';
import { searchEvidence, type EvidenceSearchResult } from '../api/client';

const FACT_TYPE_COLORS: Record<string, string> = {
  dataset: 'bg-blue-50 text-blue-700 border-blue-200',
  method: 'bg-purple-50 text-purple-700 border-purple-200',
  metric: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  finding: 'bg-amber-50 text-amber-700 border-amber-200',
  limitation: 'bg-red-50 text-red-700 border-red-200',
  protocol: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  baseline: 'bg-orange-50 text-orange-700 border-orange-200',
  assumption: 'bg-pink-50 text-pink-700 border-pink-200',
};

export default function EvidenceExplorer() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EvidenceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    try {
      const data = await searchEvidence(query.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pt-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink tracking-tight">Evidence Explorer</h1>
        <p className="text-sm text-ink-muted mt-1">
          Semantic search across all extracted facts, methods, datasets, and findings
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search evidence…"
              className="w-full pl-10 pr-4 py-3 bg-surface-raised border border-border rounded-xl text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-accent/20"
          >
            {loading ? (
              <svg className="animate-spin-slow w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              'Search'
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 p-3.5 bg-danger-subtle border border-danger/20 rounded-xl text-danger text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <p className="text-sm text-ink-muted mb-4">
            <span className="font-mono text-accent">{results.total}</span> results found
          </p>

          {results.results.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">
              <p className="text-lg font-medium">No evidence found</p>
              <p className="text-sm mt-1">Try a different query or run an analysis first</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {results.results.map((item, i) => {
                const factType = String(item.metadata.fact_type || '');
                const colorClass = FACT_TYPE_COLORS[factType] || 'bg-gray-50 text-gray-700 border-gray-200';
                return (
                  <div
                    key={i}
                    className="bg-surface-raised border border-border rounded-xl p-4 hover:border-border-strong transition-colors"
                  >
                    <p className="text-sm text-ink leading-relaxed">{item.text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {factType && (
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${colorClass}`}>
                          {factType}
                        </span>
                      )}
                      {item.metadata.paper_title ? (
                        <span className="text-xs text-ink-muted truncate max-w-[200px]">
                          {String(item.metadata.paper_title)}
                        </span>
                      ) : null}
                      {item.metadata.location ? (
                        <span className="text-[11px] font-mono text-ink-muted bg-surface-sunken px-1.5 py-0.5 rounded">
                          {String(item.metadata.location)}
                        </span>
                      ) : null}
                      <span className="text-[11px] font-mono text-ink-muted/50 ml-auto">
                        {item.score.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!results && !error && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-sunken mb-4">
            <svg className="w-7 h-7 text-ink-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-ink">Search extracted evidence</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-sm mx-auto">
            Use semantic search to find relevant facts, methods, datasets, and findings
            across all analyzed papers.
          </p>
        </div>
      )}
    </div>
  );
}
