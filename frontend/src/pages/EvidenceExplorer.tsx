import { useState } from 'react';
import { searchEvidence, type EvidenceSearchResult } from '../api/client';

const TYPE_STYLES: Record<string, string> = {
  dataset: 'border-teal/30 text-teal bg-teal-subtle',
  method: 'border-lavender/30 text-lavender bg-lavender-subtle',
  metric: 'border-amber/30 text-amber bg-amber-subtle',
  finding: 'border-teal/30 text-teal bg-teal-subtle',
  limitation: 'border-rose/30 text-rose bg-rose-subtle',
  protocol: 'border-cream-muted/30 text-cream-muted bg-bg-card',
  baseline: 'border-amber/30 text-amber-dim bg-amber-subtle',
  assumption: 'border-lavender/30 text-lavender bg-lavender-subtle',
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
      setResults(await searchEvidence(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pt-8 animate-fade-up">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">
          Explorer
        </p>
        <h1 className="font-display text-3xl text-cream font-300 tracking-tight">
          Evidence search
        </h1>
        <p className="text-sm text-cream-muted mt-2">
          Semantic search across all extracted facts, methods, datasets, and findings.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search evidence..."
            className="flex-1 px-4 py-3 bg-bg-card border border-line rounded-lg text-cream placeholder:text-cream-faint/50 focus:outline-none focus:border-amber/40 focus:ring-1 focus:ring-amber/20 transition-all text-[15px]"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-amber text-bg-card rounded-lg font-semibold hover:bg-amber-glow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
          >
            {loading ? (
              <svg className="animate-spin-slow w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : 'Search'}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 p-3.5 bg-rose-subtle border border-rose/20 rounded-lg text-rose text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="animate-fade-in">
          <p className="text-[11px] font-mono text-cream-faint tracking-widest uppercase mb-4">
            {results.total} results
          </p>

          {results.results.length === 0 ? (
            <div className="text-center py-16 text-cream-muted">
              <p className="font-display text-xl">Nothing found</p>
              <p className="text-sm mt-2">Try a different query or run an analysis first.</p>
            </div>
          ) : (
            <div className="space-y-2 stagger">
              {results.results.map((item, i) => {
                const factType = String(item.metadata.fact_type || '');
                const style = TYPE_STYLES[factType] || 'border-line text-cream-muted bg-bg-card';
                return (
                  <div
                    key={i}
                    className="p-4 bg-bg-card border border-line rounded-lg hover:border-line-strong transition-colors"
                  >
                    <p className="text-sm text-cream leading-relaxed">{item.text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {factType ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${style}`}>
                          {factType}
                        </span>
                      ) : null}
                      {item.metadata.paper_title ? (
                        <span className="text-[12px] text-cream-faint truncate max-w-[240px]">
                          {String(item.metadata.paper_title)}
                        </span>
                      ) : null}
                      {item.metadata.location ? (
                        <span className="text-[10px] font-mono text-cream-faint bg-bg-inset px-1.5 py-0.5 rounded">
                          {String(item.metadata.location)}
                        </span>
                      ) : null}
                      <span className="text-[10px] font-mono text-cream-faint/40 ml-auto">
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
        <div className="text-center py-20 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-card border border-line mb-5">
            <svg className="w-7 h-7 text-cream-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-cream">Search the evidence base</h2>
          <p className="text-sm text-cream-muted mt-2 max-w-sm mx-auto leading-relaxed">
            Find relevant facts, methods, datasets, and findings
            across all papers you&apos;ve analyzed.
          </p>
        </div>
      )}
    </div>
  );
}
