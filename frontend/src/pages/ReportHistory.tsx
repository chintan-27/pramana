import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReports, type ReportListItem } from '../api/client';

export default function ReportHistory() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getReports()
      .then(setReports)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto pt-12">
        <div className="p-5 bg-rose-subtle border border-rose/20 rounded-lg text-rose text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-8 pb-16 animate-fade-up">
      <div className="mb-10">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">History</p>
        <h1 className="font-display text-[36px] sm:text-[44px] font-300 text-cream leading-[1.12] tracking-tight">
          Past Analyses
        </h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-cream-muted text-sm">No completed analyses yet.</p>
          <Link to="/" className="text-amber text-sm font-medium mt-2 inline-block hover:text-amber-glow transition-colors">
            Start your first analysis
          </Link>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {reports.map((r) => (
            <Link
              key={r.run_id}
              to={`/report/db/${r.run_id}`}
              className="block p-5 bg-bg-card border border-line rounded-lg hover:border-amber/20 transition-all duration-200 group"
            >
              <p className="text-[15px] text-cream font-medium leading-snug group-hover:text-amber transition-colors line-clamp-2">
                {r.hypothesis}
              </p>
              <div className="flex items-center gap-4 mt-3 text-[12px] font-mono text-cream-faint">
                {r.completed_at && (
                  <span>{new Date(r.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                )}
                {r.paper_count > 0 && <span>{r.paper_count} papers</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
