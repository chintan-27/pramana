import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getParsedQuery, confirmHypothesis, type ParsedQuery } from '../api/client';

function ChipEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (updated: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => {
    const val = input.trim();
    if (val && !items.includes(val)) {
      onChange([...items, val]);
    }
    setInput('');
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-mono text-amber tracking-[0.15em] uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-md bg-bg-card border border-line text-cream-muted group"
          >
            {item}
            <button
              onClick={() => remove(i)}
              className="text-cream-faint hover:text-rose transition-colors ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder="Add…"
          className="bg-transparent text-xs font-mono text-cream outline-none placeholder:text-cream-faint w-24 border-b border-dashed border-line focus:border-amber transition-colors"
        />
      </div>
    </div>
  );
}

export default function ConfirmHypothesis() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState<ParsedQuery | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;
    getParsedQuery(runId)
      .then((r) => { setQuery(r.parsed_query); setLoading(false); })
      .catch(() => { setError('Could not load parsed query.'); setLoading(false); });
  }, [runId]);

  const handleConfirm = async (edits?: Partial<Pick<ParsedQuery, 'domains' | 'topics' | 'search_queries'>>) => {
    if (!runId) return;
    setSubmitting(true);
    try {
      await confirmHypothesis(runId, edits || {});
      navigate(`/analysis/${runId}`);
    } catch {
      setError('Failed to confirm. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pt-16 animate-fade-up text-center">
        <div className="w-2 h-2 rounded-full bg-amber glow-dot mx-auto mb-4" />
        <p className="text-sm text-cream-muted">Loading parsed hypothesis…</p>
      </div>
    );
  }

  if (error || !query) {
    return (
      <div className="max-w-2xl mx-auto pt-16 animate-fade-up">
        <p className="text-rose text-sm">{error || 'Something went wrong.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-16 pb-20 animate-fade-up">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">
          Step 1 of 2
        </p>
        <h1 className="font-display text-3xl text-cream font-300 tracking-tight">
          Does this look right?
        </h1>
        <p className="text-sm text-cream-muted mt-2 leading-relaxed">
          This is how Pramana understood your hypothesis. Edit any field, then continue.
        </p>
      </div>

      {/* Editable chips */}
      <div className="space-y-7 mb-10">
        <ChipEditor
          label="Domains"
          items={query.domains}
          onChange={(v) => setQuery({ ...query, domains: v })}
        />
        <ChipEditor
          label="Topics"
          items={query.topics}
          onChange={(v) => setQuery({ ...query, topics: v })}
        />
        <ChipEditor
          label="Search queries"
          items={query.search_queries}
          onChange={(v) => setQuery({ ...query, search_queries: v })}
        />
      </div>

      {/* PICO breakdown */}
      {query.pico && (
        <div className="mb-10 p-4 bg-bg-card border border-line rounded-lg space-y-2">
          <p className="text-[11px] font-mono text-amber tracking-[0.15em] uppercase mb-3">
            PICO Framework
          </p>
          {(['population', 'intervention', 'comparison', 'outcome'] as const).map((key) => (
            <div key={key} className="flex gap-3 text-sm">
              <span className="w-24 text-[11px] font-mono text-cream-faint shrink-0 pt-0.5 uppercase tracking-wider">
                {key}
              </span>
              <span className="text-cream-muted leading-relaxed">
                {query.pico![key] || <span className="text-cream-faint italic">not specified</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Methods (read-only) */}
      {query.methods.length > 0 && (
        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-mono text-cream-faint tracking-[0.15em] uppercase">
            Methods detected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {query.methods.map((m) => (
              <span key={m} className="px-2 py-0.5 text-[11px] font-mono rounded border border-line text-cream-faint bg-bg-card">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => handleConfirm({
            domains: query.domains,
            topics: query.topics,
            search_queries: query.search_queries,
          })}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg bg-amber text-bg text-sm font-medium hover:bg-amber-glow transition-colors disabled:opacity-50"
        >
          {submitting ? 'Continuing…' : 'Looks right → Continue'}
        </button>
        <p className="text-xs text-cream-faint">
          Edits will update what papers are retrieved.
        </p>
      </div>
    </div>
  );
}
