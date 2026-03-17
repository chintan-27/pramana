import { useState } from 'react';
import { searchEvidence, type EvidenceSearchResult } from '../api/client';

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
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Evidence Explorer</h1>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search extracted evidence (semantic search)..."
          className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {results && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Found {results.total} results
          </p>

          {results.results.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No evidence found. Try a different search query or run an analysis first.
            </p>
          ) : (
            <div className="space-y-3">
              {results.results.map((item, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-900">{item.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.metadata.fact_type ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {String(item.metadata.fact_type)}
                      </span>
                    ) : null}
                    {item.metadata.paper_title ? (
                      <span className="text-xs text-gray-500">
                        Paper: {String(item.metadata.paper_title)}
                      </span>
                    ) : null}
                    {item.metadata.location ? (
                      <span className="text-xs text-gray-500">
                        Location: {String(item.metadata.location)}
                      </span>
                    ) : null}
                    <span className="text-xs text-gray-400 ml-auto">
                      Score: {item.score.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!results && !error && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">Search extracted evidence</p>
          <p className="text-sm">
            Use semantic search to find relevant facts, methods, datasets, and findings
            across all analyzed papers.
          </p>
        </div>
      )}
    </div>
  );
}
