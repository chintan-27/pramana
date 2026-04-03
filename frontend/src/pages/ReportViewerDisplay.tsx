import { type ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import type {
  Report, FlowResult, ExecutiveSummary, Annotation,
  ReportSection, ResearchTask,
} from '../api/client';
import {
  createAnnotation, deleteAnnotation, getAnnotations,
  rerunLens, searchMore, exportReport,
  approveTask, runTask, updateTaskCode, deleteTask, getTaskOutput,
  submitSectionFeedback,
} from '../api/client';
import { useTheme } from '../theme';
import ReportChat from './ReportChat';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from 'recharts';

const DARK = { accent: '#e8a84c', accentDim: '#c48a35', success: '#5bb5a6', danger: '#d4736e', text: '#f0e6d3', muted: '#8a7e6e', line: 'rgba(240,230,211,0.08)', grid: 'rgba(240,230,211,0.06)', card: '#252220' };
const LIGHT = { accent: '#2eaadc', accentDim: '#2496c4', success: '#4daa57', danger: '#e03e3e', text: '#37352f', muted: '#9b9a97', line: '#e3e2de', grid: '#e3e2de', card: '#ffffff' };

function ConfidenceBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  const level = value >= 0.7 ? 'high' : value >= 0.4 ? 'med' : 'low';
  const colors = {
    high: 'bg-teal/15 text-teal border-teal/30',
    med: 'bg-amber-subtle text-amber border-amber/30',
    low: 'bg-rose-subtle text-rose border-rose/20',
  };
  const labels = { high: 'High', med: 'Med', low: 'Low' };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[9px] font-mono rounded border ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

interface Props {
  report: Report | null;
  error: string;
  runId?: string | number;
}

export default function ReportViewerDisplay({ report, error, runId }: Props) {
  const { theme } = useTheme();
  const C = theme === 'dark' ? DARK : LIGHT;

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [rerunningFlow, setRerunningFlow] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [annOpen, setAnnOpen] = useState(false);

  useEffect(() => {
    if (!runId) return;
    getAnnotations(runId).then(({ annotations: ann }) => {
      setAnnotations(ann);
      setBookmarks(new Set(ann.map((a) => a.content_ref)));
    }).catch(() => {});
  }, [runId]);

  const toggleBookmark = useCallback(async (contentRef: string) => {
    if (!runId) return;
    if (bookmarks.has(contentRef)) {
      const ann = annotations.find((a) => a.content_ref === contentRef);
      if (ann) {
        await deleteAnnotation(runId, ann.id).catch(() => {});
        setBookmarks((prev) => { const n = new Set(prev); n.delete(contentRef); return n; });
        setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
      }
    } else {
      const created = await createAnnotation(runId, contentRef).catch(() => null);
      if (created) {
        setBookmarks((prev) => new Set([...prev, contentRef]));
        setAnnotations((prev) => [...prev, created]);
      }
    }
  }, [runId, bookmarks, annotations]);

  const handleRerun = useCallback(async (flowName: string) => {
    if (!runId) return;
    setRerunningFlow(flowName);
    try {
      await rerunLens(String(runId), flowName);
      window.location.reload();
    } finally {
      setRerunningFlow(null);
    }
  }, [runId]);

  const handleSearch = useCallback(async () => {
    if (!runId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchMore(String(runId), searchQuery);
      setSearchMsg(`Added ${res.added_papers} papers · ${res.new_facts} new findings`);
      setSearchQuery('');
      setTimeout(() => { setSearchMsg(''); window.location.reload(); }, 2500);
    } catch {
      setSearchMsg('Search failed — check the server.');
    } finally {
      setSearching(false);
    }
  }, [runId, searchQuery]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto pt-12">
        <div className="p-5 bg-rose-subtle border border-rose/20 rounded-lg text-rose text-sm">{error}</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-3xl mx-auto pt-12 space-y-4">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-36 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
    );
  }

  // Agentic report path: if report has dynamic sections, use the new renderer
  if (report.sections && report.sections.length > 0) {
    return (
      <AgenticReport
        report={report}
        runId={runId}
        bookmarks={bookmarks}
        annotations={annotations}
        toggleBookmark={toggleBookmark}
        annOpen={annOpen}
        setAnnOpen={setAnnOpen}
      />
    );
  }

  // Legacy report path
  const s = getStats(report);
  const hyp = report.hypothesis as Record<string, string[] | string>;

  const titleText = (hyp.text as string) ||
    ((hyp.topics as string[])?.slice(0, 3).join(', ') || 'Research Report');

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-16 animate-fade-up overflow-x-hidden">
    {/* Report column */}
    <div className="min-w-0">

      {/* ── Title ── */}
      <div className="mb-10">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">Report</p>
        <h1 className="font-display text-[28px] sm:text-[36px] font-300 text-cream leading-[1.2] tracking-tight break-words">
          {titleText.length > 120 ? titleText.slice(0, 120) + '…' : titleText}
        </h1>
        {hyp.domains && (hyp.domains as string[]).length > 0 ? (
          <p className="text-base text-cream-muted mt-3">
            in {(hyp.domains as string[]).join(' & ')}
          </p>
        ) : null}
      </div>

      {/* ── Executive Summary ── */}
      {report.executive_summary?.headline && (
        <ExecSummary es={report.executive_summary} />
      )}

      {/* ── At a Glance ── */}
      <Sec>
        <SLabel>At a Glance</SLabel>
        <div className="grid grid-cols-4 gap-3 mb-5 stagger">
          <Stat n={s.totalPapers} label="papers" />
          <Stat n={s.totalFacts} label="findings" />
          <Stat n={s.totalGaps} label="gaps" />
          <Stat n={s.totalVenues} label="venues" />
        </div>
        <div className="p-4 bg-amber-subtle border border-amber/10 rounded-lg">
          <p className="text-sm text-cream leading-relaxed">
            We analyzed <strong className="text-amber">{s.totalPapers} papers</strong> and
            extracted <strong className="text-amber">{s.totalFacts} findings</strong> with
            direct quotes.
            {s.totalGaps > 0 && (
              <> Found <strong className="text-amber">{s.totalGaps} gap{s.totalGaps !== 1 ? 's' : ''}</strong> where more research is needed.</>
            )}
          </p>
        </div>
      </Sec>

      {/* ── Analysis Flows ── */}
      {report.flows && report.flows.selected.length > 0 && (
        <Sec>
          <SLabel>Analysis Flows</SLabel>

          {/* Router briefing */}
          {report.flows.reasoning && (
            <div className="relative mb-6 rounded-xl border border-amber/15 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber/8 to-transparent pointer-events-none" />
              <div className="relative px-4 py-3 flex items-start gap-3">
                <div className="shrink-0 mt-0.5 w-7 h-7 rounded-md bg-amber/15 border border-amber/25 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-[9px] font-mono text-amber tracking-widest uppercase mb-0.5">Router</p>
                  <p className="text-sm text-cream-dim leading-relaxed">{report.flows.reasoning}</p>
                </div>
              </div>
            </div>
          )}

          {/* Flow cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.flows.selected.map((flowName, idx) => {
              const fr = report.flows!.results[flowName];
              if (!fr) return null;
              return (
                <FlowCard
                  key={flowName}
                  flowName={flowName}
                  fr={fr}
                  idx={idx}
                  bookmarked={bookmarks.has(`flow:${flowName}`)}
                  onBookmark={() => toggleBookmark(`flow:${flowName}`)}
                  isRerunning={rerunningFlow === flowName}
                  onRerun={runId ? () => handleRerun(flowName) : undefined}
                />
              );
            })}
          </div>
        </Sec>
      )}

      {/* ── Evidence Breakdown ── */}
      {s.factTypeData.length > 0 && (
        <Sec>
          <SLabel>Evidence Breakdown</SLabel>
          <p className="text-sm text-cream-muted mb-5">
            How the {s.totalFacts} findings break down by category:
          </p>
          <ChartWrap>
            <ResponsiveContainer width="100%" height={Math.max(s.factTypeData.length * 44, 120)}>
              <BarChart data={s.factTypeData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.text }} width={120} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                <Bar dataKey="value" fill={C.accent} radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
          <Hint>
            {s.factTypeData[0] && (
              <>Most common: <strong>{s.factTypeData[0].name.toLowerCase()}</strong> ({s.factTypeData[0].value})</>
            )}
          </Hint>
        </Sec>
      )}

      {/* ── Timeline ── */}
      {s.yearData.length > 0 && (
        <Sec>
          <SLabel>Publication Timeline</SLabel>
          <p className="text-sm text-cream-muted mb-5">When the research was published:</p>
          <ChartWrap>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={s.yearData}>
                <defs>
                  <linearGradient id="yg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.muted }} />
                <YAxis tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontSize: 13 }} formatter={(v) => [`${v} papers`, '']} />
                <Area type="monotone" dataKey="papers" stroke={C.accent} fill="url(#yg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrap>
          <Hint>
            {(() => {
              const peak = [...s.yearData].sort((a, b) => b.papers - a.papers)[0];
              return peak ? <>Peak: <strong>{peak.year}</strong> ({peak.papers} papers)</> : null;
            })()}
          </Hint>
        </Sec>
      )}

      {/* ── Top Venues ── */}
      {s.venueData.length > 0 && (
        <Sec>
          <SLabel>Where It Gets Published</SLabel>
          <ChartWrap>
            <ResponsiveContainer width="100%" height={Math.max(s.venueData.length * 40, 140)}>
              <BarChart data={s.venueData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} width={170} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                <Bar dataKey="count" fill={C.success} radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
        </Sec>
      )}

      {/* ── Key Concepts ── */}
      {s.topTerms.length > 0 && (
        <Sec>
          <SLabel>Key Concepts</SLabel>
          <p className="text-sm text-cream-muted mb-4">Most frequently mentioned terms:</p>
          <div className="flex flex-wrap gap-2">
            {s.topTerms.map(({ term, count }, i) => (
              <span
                key={term}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  i < 3
                    ? 'border-amber/25 text-amber bg-amber-subtle font-medium'
                    : 'border-line text-cream-dim bg-bg-card'
                }`}
              >
                {term} <span className="opacity-40">({count})</span>
              </span>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Research Gaps ── */}
      {s.gaps.length > 0 && (
        <Sec>
          <SLabel>Research Gaps</SLabel>
          <p className="text-sm text-cream-muted mb-2">
            Areas where evidence is <strong className="text-cream">missing or thin</strong>:
          </p>
          {s.gapSev.length > 0 && (
            <div className="flex items-center gap-5 my-4">
              {s.gapSev.map((g) => (
                <div key={g.name} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    g.name === 'High' ? 'bg-rose' : g.name === 'Medium' ? 'bg-amber' : 'bg-teal'
                  }`} />
                  <span className="text-sm text-cream">
                    <strong>{g.value}</strong> <span className="text-cream-muted">{g.name.toLowerCase()}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2.5 stagger">
            {s.gaps.map((gap, i) => (
              <LegacyGapCard
                key={i}
                gap={gap}
                idx={i}
                bookmarked={bookmarks.has(`gap:${i}`)}
                onBookmark={() => toggleBookmark(`gap:${i}`)}
              />
            ))}
          </div>
          <Hint>
            <strong>High</strong> = critical lack of evidence.{' '}
            <strong>Medium</strong> = worth investigating.{' '}
            <strong>Low</strong> = minor or emerging.
          </Hint>
        </Sec>
      )}

      {/* ── Key Findings ── */}
      {s.sampleFacts.length > 0 && (
        <Sec>
          <SLabel>Key Findings</SLabel>
          <p className="text-sm text-cream-muted mb-4">
            Selected findings with direct quotes from the papers:
          </p>
          <div className="space-y-3 stagger">
            {s.sampleFacts.map((f, i) => (
              <div key={i} className="p-4 bg-bg-card border border-line rounded-lg">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-[15px] text-cream leading-relaxed">{f.content}</p>
                  <button
                    onClick={() => toggleBookmark(`finding:${i}`)}
                    title={bookmarks.has(`finding:${i}`) ? 'Remove bookmark' : 'Bookmark'}
                    className="shrink-0 text-[15px] text-cream-faint hover:text-amber transition-colors"
                  >
                    {bookmarks.has(`finding:${i}`) ? '★' : '☆'}
                  </button>
                </div>
                <div className="quote-bar mb-2.5">
                  <p className="text-sm italic text-cream-muted leading-relaxed">
                    &ldquo;{f.direct_quote}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-cream-faint font-mono">
                  <span className="truncate max-w-[260px]">{f.paper_title}</span>
                  {f.location && <span className="bg-bg-inset px-1.5 py-0.5 rounded">{f.location}</span>}
                  {f.confidence != null && f.confidence > 0 && <ConfidenceBadge value={f.confidence} />}
                </div>
              </div>
            ))}
          </div>
          {s.totalFacts > s.sampleFacts.length && (
            <p className="text-center text-sm text-cream-muted mt-4">
              Showing {s.sampleFacts.length} of {s.totalFacts}.{' '}
              <Link to="/evidence" className="text-amber font-medium hover:text-amber-glow transition-colors">
                See all
              </Link>
            </p>
          )}
        </Sec>
      )}

      {/* ── Insights ── */}
      {s.insights.length > 0 && (
        <Sec>
          <SLabel>Insights</SLabel>
          <p className="text-sm text-cream-muted mb-4">
            Patterns and takeaways from the evidence:
          </p>
          <div className="space-y-5">
            {s.insights.map((g, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-cream mb-2">{g.title}</h4>
                <ul className="space-y-1.5">
                  {g.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-cream-dim leading-relaxed">
                      <span className="text-amber shrink-0 mt-0.5 text-xs">&mdash;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Directions ── */}
      {s.directions.length > 0 && (
        <Sec>
          <SLabel>Where to Go Next</SLabel>
          <p className="text-sm text-cream-muted mb-4">Suggested research directions:</p>
          <div className="space-y-2.5 stagger">
            {s.directions.map((d, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-md bg-amber text-bg font-mono text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 p-4 bg-amber-subtle/40 rounded-lg border border-amber/10">
                  <p className="text-[15px] font-medium text-cream">{d.title}</p>
                  {d.description ? (
                    <p className="text-sm text-cream-muted mt-1.5 leading-relaxed">{d.description}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Recommendations ── */}
      {s.recommendations.length > 0 && (
        <Sec>
          <SLabel>Recommendations</SLabel>
          <div className="space-y-2 stagger">
            {s.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 bg-bg-card border border-line rounded-lg">
                <svg className="w-4 h-4 text-teal shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-cream leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Follow-up Search ── */}
      {runId && (
        <Sec>
          <SLabel>Find More Papers</SLabel>
          <p className="text-sm text-cream-muted mb-3">Search for additional papers on a specific aspect:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="e.g. adversarial robustness in medical imaging"
              className="flex-1 px-3 py-2 bg-bg-card border border-line rounded-lg text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:border-amber/50"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 bg-amber text-bg text-sm font-medium rounded-lg hover:bg-amber-glow transition-colors disabled:opacity-40"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {searchMsg && (
            <p className="mt-2 text-sm text-teal">{searchMsg}</p>
          )}
        </Sec>
      )}

      {/* ── Footer ── */}
      <div className="mt-14 pt-6 border-t border-line">
        <div className="flex items-center justify-between mb-4">
          <Link to="/evidence" className="text-sm font-medium text-amber hover:text-amber-glow transition-colors">
            Explore Evidence
          </Link>
          <Link to="/" className="text-sm text-cream-muted hover:text-cream transition-colors">
            New Analysis
          </Link>
        </div>
        {runId && typeof runId === 'number' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-cream-faint">Export:</span>
            {(['bibtex', 'csv', 'markdown', 'docx'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => exportReport(runId as number, fmt)}
                className="text-[11px] font-mono px-2.5 py-1 rounded border border-line bg-bg-card text-cream-dim hover:text-cream hover:border-amber/30 transition-colors"
              >
                {fmt === 'bibtex' ? 'BibTeX' : fmt === 'docx' ? 'Word' : fmt.charAt(0).toUpperCase() + fmt.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Chat + annotations column */}
    {runId && (
      <div className="hidden lg:flex lg:flex-col lg:gap-4">
        <ReportChat runId={runId} />
        {annotations.length > 0 && (
          <div className="rounded-xl border border-line bg-bg-card overflow-hidden">
            <button
              onClick={() => setAnnOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-[11px] font-mono text-cream-faint hover:text-cream transition-colors"
            >
              <span className="text-amber tracking-widest uppercase">Bookmarks ({annotations.length})</span>
              <svg className={`w-3 h-3 transition-transform ${annOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {annOpen && (
              <div className="border-t border-line divide-y divide-line/40">
                {annotations.map((ann) => (
                  <div key={ann.id} className="px-4 py-3 flex items-start justify-between gap-2">
                    <p className="text-[12px] text-cream-dim font-mono">{ann.content_ref}</p>
                    <button
                      onClick={() => toggleBookmark(ann.content_ref)}
                      className="shrink-0 text-cream-faint hover:text-rose transition-colors text-[13px]"
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )}
    {/* Mobile chat */}
    {runId && (
      <div className="lg:hidden">
        <ReportChat runId={runId} />
      </div>
    )}
    </div>
  );
}

/* ════ Export Menu ════ */

function ExportMenu({ runId }: { runId: string | number }) {
  const [open, setOpen] = useState(false);
  const formats: Array<{ key: 'bibtex' | 'csv' | 'markdown' | 'docx'; label: string }> = [
    { key: 'markdown', label: 'Markdown' },
    { key: 'docx', label: 'Word (.docx)' },
    { key: 'bibtex', label: 'BibTeX' },
    { key: 'csv', label: 'CSV' },
  ];
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border border-line bg-bg-card text-cream-faint hover:text-cream hover:border-amber/30 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded-lg border border-line bg-bg-card shadow-lg overflow-hidden">
          {formats.map((f) => (
            <button
              key={f.key}
              onClick={() => { exportReport(Number(runId), f.key); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-[11px] font-mono text-cream-dim hover:bg-amber/8 hover:text-cream transition-colors"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════ Agentic Report ════ */

interface AgenticReportProps {
  report: Report;
  runId?: string | number;
  bookmarks: Set<string>;
  annotations: Annotation[];
  toggleBookmark: (ref: string) => void;
  annOpen: boolean;
  setAnnOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}

function AgenticReport({
  report, runId, bookmarks, annotations, toggleBookmark,
  annOpen, setAnnOpen,
}: AgenticReportProps) {
  const sections = report.sections!;
  const tasks = report.tasks || [];
  const title = report.title || 'Research Analysis';
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollTo = (i: number) =>
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="animate-fade-up">
      {/* ── Header band ── */}
      <div className="border-b border-line/30 bg-bg-card/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-amber tracking-[0.2em] uppercase mb-1.5">Research Report</p>
            <h1 className="font-display text-2xl sm:text-[30px] font-300 text-cream leading-[1.15] tracking-tight break-words">
              {title.length > 110 ? title.slice(0, 110) + '\u2026' : title}
            </h1>
            <div className="flex gap-3 mt-2 text-[10px] font-mono text-cream-faint/60">
              <span>{sections.length} sections</span>
              {tasks.length > 0 && <span className="text-amber/70">{tasks.length} tasks</span>}
              {annotations.length > 0 && <span>{annotations.length} bookmarks</span>}
            </div>
          </div>
          <div className="shrink-0">{runId && <ExportMenu runId={runId} />}</div>
        </div>
        {report.executive_summary?.headline && (
          <div className="max-w-7xl mx-auto px-5 sm:px-8 pb-5">
            <ExecSummary es={report.executive_summary} />
          </div>
        )}
      </div>

      {/* ── 3-column body ── */}
      <div className="max-w-7xl mx-auto flex">

        {/* Left TOC */}
        <div className="hidden xl:block w-48 shrink-0">
          <div className="sticky top-11 h-[calc(100vh-2.75rem)] overflow-y-auto pt-5 pb-10 px-3">
            <p className="text-[8px] font-mono text-cream-faint/30 tracking-widest uppercase mb-2 px-2">Contents</p>
            <nav className="space-y-px">
              {sections.map((sec, i) => (
                <button
                  key={sec.id}
                  onClick={() => scrollTo(i)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover transition-colors text-left group"
                >
                  <span className="text-[8px] font-mono text-cream-faint/25 mt-0.5 shrink-0 tabular-nums group-hover:text-amber/40 transition-colors">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[11px] text-cream-faint/60 group-hover:text-cream-dim transition-colors leading-snug line-clamp-2">
                    {sec.title}
                  </span>
                </button>
              ))}
              {tasks.length > 0 && (
                <div className="pt-2 mt-1 border-t border-line/20 px-2">
                  <span className="text-[8px] font-mono text-amber/40 tracking-wider uppercase">Tasks</span>
                </div>
              )}
            </nav>
          </div>
        </div>

        {/* Center content */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 pt-5 pb-20 space-y-4">
          {/* Agent reasoning — compact strip */}
          {report.designer_reasoning && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-amber/12 bg-amber/4 mb-5">
              <span className="text-amber/50 text-[11px] shrink-0 mt-px">✦</span>
              <p className="text-[12px] text-cream-dim leading-relaxed italic">{report.designer_reasoning}</p>
            </div>
          )}

          {sections.map((sec, i) => (
            <div key={sec.id} ref={el => { sectionRefs.current[i] = el; }}>
              <SectionCard
                section={sec} idx={i}
                bookmarked={bookmarks.has(`sec:${sec.id}`)}
                onBookmark={() => toggleBookmark(`sec:${sec.id}`)}
                runId={runId}
              />
            </div>
          ))}

          {tasks.length > 0 && (
            <div className="pt-4">
              <p className="text-[10px] font-mono text-amber tracking-[0.2em] uppercase mb-3">Code Tasks</p>
              <div className="space-y-3">
                {tasks.map(task => <TaskCard key={task.id} task={task} runId={runId} />)}
              </div>
            </div>
          )}

          <div className="pt-6 mt-4 border-t border-line/30 flex items-center justify-between">
            <Link to="/evidence" className="text-[12px] font-medium text-amber hover:text-amber-glow transition-colors">Explore Evidence →</Link>
            <Link to="/" className="text-[12px] text-cream-faint/60 hover:text-cream transition-colors">New Analysis</Link>
          </div>
        </div>

        {/* Right compact sidebar */}
        <div className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-11 h-[calc(100vh-2.75rem)] overflow-y-auto pt-5 pb-10 px-3 space-y-4">
            {runId && <ReportChat runId={runId} />}
            {annotations.length > 0 && (
              <div className="rounded-xl border border-line bg-bg-card overflow-hidden">
                <button
                  onClick={() => setAnnOpen((v: boolean) => !v)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-[10px] font-mono text-amber tracking-widest uppercase hover:opacity-80 transition-opacity"
                >
                  Bookmarks ({annotations.length})
                  <svg className={`w-3 h-3 transition-transform ${annOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {annOpen && (
                  <div className="border-t border-line divide-y divide-line/30 max-h-52 overflow-y-auto">
                    {annotations.map(ann => (
                      <div key={ann.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-cream-dim font-mono truncate">{ann.content_ref}</p>
                        <button onClick={() => toggleBookmark(ann.content_ref)} className="shrink-0 text-cream-faint/40 hover:text-rose transition-colors">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile chat */}
      {runId && <div className="lg:hidden px-4 pb-8"><ReportChat runId={runId} /></div>}
    </div>
  );
}

/* ════ Section Card (dynamic) ════ */

const SECTION_COLORS: Record<string, { accent: string; border: string; bg: string }> = {
  narrative: { accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8' },
  evidence: { accent: 'text-amber', border: 'border-amber/25', bg: 'bg-amber/8' },
  gaps: { accent: 'text-rose', border: 'border-rose/25', bg: 'bg-rose/8' },
  contradictions: { accent: 'text-rose', border: 'border-rose/25', bg: 'bg-rose/8' },
  statistics: { accent: 'text-teal', border: 'border-teal/25', bg: 'bg-teal/8' },
  proposal: { accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8' },
  review: { accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8' },
  tasks: { accent: 'text-teal', border: 'border-teal/25', bg: 'bg-teal/8' },
  table: { accent: 'text-amber', border: 'border-amber/25', bg: 'bg-amber/8' },
};
const SECTION_DEFAULT = { accent: 'text-amber', border: 'border-amber/25', bg: 'bg-amber/8' };

function SectionCard({
  section, idx, bookmarked, onBookmark, runId,
}: {
  section: ReportSection; idx: number; bookmarked: boolean; onBookmark: () => void;
  runId?: string | number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [refining, setRefining] = useState(false);
  const colors = SECTION_COLORS[section.type] || SECTION_DEFAULT;

  const handleRate = async (star: number) => {
    setRating(star);
    setFeedbackSaved(false);
    if (!runId) return;
    try {
      await submitSectionFeedback(String(runId), section.id, star, note);
      setFeedbackSaved(true);
      setTimeout(() => setFeedbackSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleNote = async () => {
    if (!runId || !rating) return;
    try {
      await submitSectionFeedback(String(runId), section.id, rating, note);
      setFeedbackSaved(true);
      setNoteOpen(false);
      setTimeout(() => setFeedbackSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleRefine = async () => {
    if (!runId) return;
    setRefining(true);
    try {
      await rerunLens(String(runId), section.id);
      window.location.reload();
    } catch {
      setRefining(false);
    }
  };

  return (
    <div className={`relative rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Watermark */}
      <span className="absolute top-2 right-3 text-[40px] font-display font-700 leading-none opacity-[0.04] select-none pointer-events-none">
        {String(idx + 1).padStart(2, '0')}
      </span>

      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 flex items-start gap-2.5 relative">
        <span className={`shrink-0 w-7 h-7 rounded-md ${colors.bg} border ${colors.border} flex items-center justify-center text-[11px] font-mono font-bold ${colors.accent}`}>
          {idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-semibold ${colors.accent} leading-snug`}>
            {section.title}
          </p>
          <p className="text-[9px] font-mono text-cream-faint mt-0.5">
            {section.render_hint.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button onClick={onBookmark} title="Bookmark" className="text-[15px] text-cream-faint hover:text-amber transition-colors">
            {bookmarked ? '\u2605' : '\u2606'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-mono px-2 py-0.5 rounded border border-line bg-bg-card text-cream-faint hover:text-cream transition-colors"
          >
            {expanded ? '\u25B4' : '\u25BE'}
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-line/40 pt-2.5">
          {refining ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />
              <span className="text-[12px] text-cream-faint font-mono">Refining section...</span>
            </div>
          ) : (
            <SectionContent section={section} />
          )}
        </div>
      )}

      {/* Feedback bar */}
      {expanded && runId && (
        <div className="px-3 py-2 border-t border-line/30 flex items-center gap-2.5 flex-wrap">
          {/* Star rating */}
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoverStar(star)}
                onMouseLeave={() => setHoverStar(0)}
                onClick={() => handleRate(star)}
                className={`text-[16px] transition-colors ${
                  star <= (hoverStar || rating) ? 'text-amber' : 'text-cream-faint/30'
                } hover:scale-110`}
              >
                {star <= (hoverStar || rating) ? '\u2605' : '\u2606'}
              </button>
            ))}
          </div>

          {/* Saved indicator */}
          {feedbackSaved && (
            <span className="text-[10px] font-mono text-teal">Saved</span>
          )}

          {/* Add note toggle */}
          <button
            onClick={() => setNoteOpen((v) => !v)}
            className="text-[10px] font-mono text-cream-faint hover:text-cream transition-colors"
          >
            {noteOpen ? 'Close note' : '+ Note'}
          </button>

          {/* Refine button */}
          <button
            onClick={handleRefine}
            disabled={refining}
            className="ml-auto text-[10px] font-mono px-2 py-1 rounded border border-amber/25 text-amber hover:bg-amber/10 transition-colors disabled:opacity-40"
          >
            Refine section
          </button>

          {/* Note input row */}
          {noteOpen && (
            <div className="w-full flex gap-2 mt-1">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What should improve?"
                className="flex-1 text-[11px] px-2 py-1.5 rounded border border-line bg-bg-card text-cream placeholder:text-cream-faint/40 outline-none focus:border-amber/40"
              />
              <button
                onClick={handleNote}
                disabled={!rating}
                className="text-[10px] font-mono px-2 py-1 rounded bg-amber/15 text-amber border border-amber/25 hover:bg-amber/25 transition-colors disabled:opacity-40"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════ Sortable Table ════ */

function SortableTable({ content }: { content: Record<string, unknown> }) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Parse rows from various shapes
  let rows = (content.rows || content.data) as Array<Record<string, unknown>> | undefined;
  if (!rows && content.tables) {
    const t = content.tables as unknown;
    if (Array.isArray(t)) {
      rows = t as Array<Record<string, unknown>>;
    } else if (typeof t === 'object' && t !== null) {
      rows = Object.entries(t as Record<string, Array<Record<string, unknown>>>).flatMap(([type, items]) =>
        (items || []).map((item) => ({ type, ...item }))
      );
    }
  }

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-cream-muted">{content.summary as string || 'No data.'}</p>;
  }

  const preferred = ['type', 'content', 'paper_title', 'paper', 'finding', 'method', 'year', 'location'];
  const allKeys = Object.keys(rows[0]);
  const cols = preferred.filter((k) => allKeys.includes(k));
  const displayCols = cols.length > 0 ? cols : allKeys.slice(0, 6);

  const sorted = [...rows].sort((a, b) => {
    if (!sortCol) return 0;
    const va = String(a[sortCol] ?? '');
    const vb = String(b[sortCol] ?? '');
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(true); }
  };

  return (
    <div className="space-y-2">
      {content.caption && (
        <p className="text-[11px] text-cream-faint italic">{content.caption as string}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-line/40">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-bg-inset border-b border-line">
              {displayCols.map((h) => (
                <th
                  key={h}
                  onClick={() => handleSort(h)}
                  className="py-2 px-3 text-left font-mono text-[10px] text-cream-faint tracking-wider cursor-pointer hover:text-cream select-none"
                >
                  {h.replace(/_/g, ' ')}
                  {sortCol === h && (
                    <span className="ml-1 text-amber">{sortAsc ? '\u25B4' : '\u25BE'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 25).map((row, i) => (
              <tr key={i} className={`border-b border-line/20 ${i % 2 === 1 ? 'bg-bg-inset/50' : ''}`}>
                {displayCols.map((col) => (
                  <td key={col} className="py-1.5 px-3 text-cream-dim max-w-xs truncate">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-cream-faint/50 font-mono">
        {rows.length} rows{rows.length > 25 ? ' (showing first 25)' : ''}
      </p>
    </div>
  );
}

/* ════ Gap Card (expandable) ════ */

function GapCard({ gap }: { gap: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const severity = (gap.severity as string) || 'low';
  const design = gap.suggested_design as Record<string, unknown> | undefined;

  return (
    <div className={`rounded-lg border-l-[3px] overflow-hidden ${
      severity === 'high' ? 'border-l-rose bg-rose/5 border border-rose/10' :
      severity === 'medium' ? 'border-l-amber bg-amber/5 border border-amber/10' :
      'border-l-cream-faint bg-bg-card border border-line'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded capitalize ${
                severity === 'high' ? 'bg-rose/15 text-rose border border-rose/20' :
                severity === 'medium' ? 'bg-amber/15 text-amber border border-amber/20' :
                'bg-cream-faint/10 text-cream-faint border border-line'
              }`}>
                {severity}
              </span>
            </div>
            <p className="text-[14px] font-medium text-cream">{gap.description as string}</p>
            {gap.evidence && <p className="text-sm text-cream-muted mt-1">{gap.evidence as string}</p>}
          </div>
          {design && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-[10px] font-mono px-2 py-1 rounded border border-line bg-bg-card text-cream-faint hover:text-cream transition-colors"
            >
              {expanded ? 'Hide' : 'Study design'}
            </button>
          )}
        </div>
      </div>
      {expanded && design && (
        <div className="px-4 pb-4 pt-0">
          <div className="p-3 rounded-lg bg-bg-inset border border-line/50 space-y-1.5">
            <div className="flex gap-4 flex-wrap text-[11px]">
              {design.design_type && (
                <span className="text-cream-faint">
                  <span className="text-cream-faint/50">Type:</span> {design.design_type as string}
                </span>
              )}
              {design.feasibility && (
                <span className="text-cream-faint">
                  <span className="text-cream-faint/50">Feasibility:</span> {design.feasibility as string}
                </span>
              )}
            </div>
            {design.key_variables && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(design.key_variables as string[]).map((v, j) => (
                  <span key={j} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════ Section content renderer ════ */

function SectionContent({ section }: { section: ReportSection }) {
  const c = section.content;
  const hint = section.render_hint;

  // Error state: lens failed
  if (c.error) {
    return (
      <div className="p-3 bg-rose/8 border border-rose/20 rounded-lg">
        <p className="text-[11px] font-mono text-rose mb-1">Analysis unavailable</p>
        <p className="text-[12px] text-cream-muted">{String(c.error)}</p>
      </div>
    );
  }

  // prose_card: narrative text with TL;DR chip
  if (hint === 'prose_card') {
    const text = (c.text as string) || (c.draft as string) || '';
    const tldr = (c.summary as string) || '';
    return (
      <div className="relative space-y-2">
        {tldr && (
          <div className="px-3 py-1.5 rounded-lg bg-amber/8 border border-amber/15 inline-block">
            <span className="text-[9px] font-mono text-amber tracking-wider uppercase mr-2">TL;DR</span>
            <span className="text-[12px] text-cream-dim">{tldr}</span>
          </div>
        )}
        <div className="prose-block max-h-96 overflow-y-auto text-[13px] text-cream leading-relaxed whitespace-pre-wrap">
          {text || tldr || JSON.stringify(c, null, 2)}
        </div>
        {text && <CopyButton text={text} />}
      </div>
    );
  }

  // fact_cards: evidence cards with supporting/refuting split
  if (hint === 'fact_cards') {
    const sup = (c.supporting_facts || []) as Array<Record<string, string>>;
    const ref = (c.refuting_facts || []) as Array<Record<string, string>>;
    let rawFacts = c.facts as unknown;
    const hasSplit = sup.length > 0 || ref.length > 0;
    if (!rawFacts && !hasSplit) rawFacts = c.tables;
    const flatFacts = rawFacts
      ? (Array.isArray(rawFacts) ? rawFacts : Object.values(rawFacts as Record<string, unknown>).flat()) as Array<Record<string, string>>
      : [];

    const verdict = c.verdict as string | undefined;
    const confidence = c.confidence as number | undefined;

    const FactCard = ({ f, accent }: { f: Record<string, string>; accent?: string }) => (
      <div className={`p-3 rounded-lg border ${
        accent === 'support' ? 'bg-emerald-500/5 border-emerald-500/15' :
        accent === 'refute' ? 'bg-rose/5 border-rose/15' :
        'bg-bg-inset border-line'
      }`}>
        <p className="text-[13px] text-cream leading-relaxed">{f.content || f.text || JSON.stringify(f)}</p>
        {(f.direct_quote || f.quote) && (
          <div className="quote-bar mt-2">
            <p className="text-sm italic text-cream-muted">&ldquo;{f.direct_quote || f.quote}&rdquo;</p>
          </div>
        )}
        {(f.paper_title || f.paper) && (
          <div className="flex items-center gap-1.5 mt-2">
            <svg className="w-3 h-3 text-cream-faint/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-[11px] text-cream-faint font-mono truncate">{f.paper_title || f.paper}</p>
            {f.location && <span className="text-[10px] text-cream-faint/50 font-mono shrink-0">{f.location}</span>}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-3">
        {/* Verdict badge + confidence meter */}
        {verdict && (
          <div className="flex items-center gap-3 mb-1">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold ${
              verdict === 'supported' ? 'bg-emerald-500/15 text-emerald-400' :
              verdict === 'refuted' ? 'bg-rose/15 text-rose' : 'bg-amber/15 text-amber'
            }`}>
              {verdict === 'supported' ? '\u2713 Supported' : verdict === 'refuted' ? '\u2717 Refuted' : '~ Mixed'}
            </div>
            {confidence !== undefined && (
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-line/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${confidence >= 0.7 ? 'bg-teal' : confidence >= 0.4 ? 'bg-amber' : 'bg-rose'}`}
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-cream-faint">{Math.round(confidence * 100)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Two-column split if supporting + refuting exist */}
        {hasSplit ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sup.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-emerald-400 tracking-wider uppercase">Supporting ({sup.length})</p>
                {sup.slice(0, 6).map((f, i) => <FactCard key={`s${i}`} f={f} accent="support" />)}
              </div>
            )}
            {ref.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-rose tracking-wider uppercase">Refuting ({ref.length})</p>
                {ref.slice(0, 6).map((f, i) => <FactCard key={`r${i}`} f={f} accent="refute" />)}
              </div>
            )}
          </div>
        ) : (
          flatFacts.slice(0, 10).map((f, i) => <FactCard key={i} f={f} />)
        )}

        {/* Paper count footer */}
        {(hasSplit || flatFacts.length > 0) && (
          <p className="text-[10px] text-cream-faint/60 font-mono pt-1">
            Based on {hasSplit ? sup.length + ref.length : flatFacts.length} pieces of evidence
          </p>
        )}
      </div>
    );
  }

  // gap_list with severity indicators and expandable study designs
  if (hint === 'gap_list') {
    const gaps = (c.gaps || []) as Array<Record<string, unknown>>;
    return (
      <div className="space-y-3">
        {typeof c.summary === 'string' && c.summary && (
          <p className="text-[12px] text-cream-muted leading-relaxed mb-2">{c.summary as string}</p>
        )}
        {gaps.map((g, i) => (
          <GapCard key={i} gap={g} />
        ))}
        {gaps.length === 0 && <p className="text-sm text-cream-muted">{(c.summary as string) || 'No gaps found.'}</p>}
      </div>
    );
  }

  // comparison_grid: full contradiction cards with description
  if (hint === 'comparison_grid') {
    const contras = (c.contradictions || []) as Array<Record<string, string>>;
    return (
      <div className="space-y-4">
        {typeof c.summary === 'string' && c.summary && (
          <p className="text-[12px] text-cream-muted leading-relaxed">{c.summary}</p>
        )}
        {contras.slice(0, 8).map((ct, i) => (
          <div key={i} className="rounded-xl border border-rose/20 overflow-hidden">
            <div className="px-4 py-2 bg-rose/8 border-b border-rose/15 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-rose shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[12px] font-semibold text-rose">{ct.topic}</span>
              {ct.type && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose/10 text-rose/70 border border-rose/15 ml-auto capitalize">
                  {ct.type}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 divide-x divide-line/40">
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <svg className="w-3 h-3 text-cream-faint/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-[11px] font-mono text-cream-faint truncate">{ct.paper_a}</p>
                </div>
                <p className="text-[12px] text-cream leading-relaxed">{ct.claim_a}</p>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <svg className="w-3 h-3 text-cream-faint/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-[11px] font-mono text-cream-faint truncate">{ct.paper_b}</p>
                </div>
                <p className="text-[12px] text-cream leading-relaxed">{ct.claim_b}</p>
              </div>
            </div>
            {ct.description && (
              <div className="px-4 py-2.5 bg-bg-inset border-t border-line/30">
                <p className="text-[11px] text-cream-dim leading-relaxed">{ct.description}</p>
              </div>
            )}
          </div>
        ))}
        {contras.length === 0 && <p className="text-sm text-cream-muted">No contradictions found.</p>}
      </div>
    );
  }

  // bar_chart: actual recharts BarChart + table fallback
  if (hint === 'bar_chart') {
    const aggs = (c.aggregations || []) as Array<Record<string, unknown>>;
    if (aggs.length > 0) {
      const chartData = aggs.map((a) => ({
        name: (a.metric as string) || '',
        mean: a.mean as number ?? 0,
        count: a.count as number ?? 0,
      }));
      return (
        <div className="space-y-4">
          {/* Chart */}
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8a7e6e' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8a7e6e' }} />
                <Tooltip
                  contentStyle={{ background: '#252220', border: '1px solid rgba(240,230,211,0.1)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#f0e6d3' }}
                  itemStyle={{ color: '#e8a84c' }}
                />
                <Bar dataKey="mean" fill="#e8a84c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Detailed table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Metric', 'n', 'Mean', 'Min', 'Max'].map((h) => (
                    <th key={h} className="pb-2 pr-4 font-mono text-[10px] text-cream-faint tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {aggs.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-4 text-cream font-medium">{a.metric as string}</td>
                    <td className="py-1.5 pr-4 text-cream-muted font-mono">{a.count as number}</td>
                    <td className="py-1.5 pr-4 text-amber font-mono">{(a.mean as number)?.toFixed(2)}</td>
                    <td className="py-1.5 pr-4 text-cream-muted font-mono">{(a.min as number)?.toFixed(2)}</td>
                    <td className="py-1.5 font-mono text-cream-muted">{(a.max as number)?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    // Fallback: prose
    const text = (c.summary as string) || (c.text as string) || '';
    return <p className="text-[13px] text-cream-muted leading-relaxed">{text || JSON.stringify(c, null, 2)}</p>;
  }

  // table: sortable with zebra rows and caption
  if (hint === 'table') {
    return <SortableTable content={c} />;
  }

  // task_card: render as prose (tasks are rendered separately)
  // Default: dump content as prose
  const text = (c.text as string) || (c.summary as string) || (c.draft as string) || '';
  if (text) {
    return (
      <div className="prose-block text-[13px] text-cream leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  // Last resort: JSON
  return (
    <pre className="text-[11px] text-cream-faint font-mono overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(c, null, 2)}
    </pre>
  );
}

/* ════ Task Card ════ */

function TaskCard({ task: initialTask, runId }: { task: ResearchTask; runId?: string | number }) {
  const [task, setTask] = useState({
    ...initialTask,
    id: initialTask.id ?? 0,
    status: initialTask.status ?? 'proposed',
  });
  const [showCode, setShowCode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(task.code);
  const [busy, setBusy] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const statusColors: Record<string, string> = {
    proposed: 'text-amber bg-amber/10 border-amber/25',
    approved: 'text-teal bg-teal/10 border-teal/25',
    running: 'text-violet-300 bg-violet-500/10 border-violet-500/25',
    completed: 'text-teal bg-teal/10 border-teal/25',
    failed: 'text-rose bg-rose/10 border-rose/25',
  };

  const handleApproveAndRun = async () => {
    if (!runId) return;
    setBusy(true);
    try {
      if (task.status === 'proposed') {
        await approveTask(runId, task.id);
        setTask((t) => ({ ...t, status: 'approved' }));
      }
      await runTask(runId, task.id);
      setTask((t) => ({ ...t, status: 'running' }));
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const { task: updated } = await getTaskOutput(runId, task.id);
          if (updated.status === 'completed' || updated.status === 'failed') {
            setTask(updated);
            setShowOutput(true);
            clearInterval(poll);
            setBusy(false);
          }
        } catch {
          clearInterval(poll);
          setBusy(false);
        }
      }, 2000);
    } catch {
      setBusy(false);
    }
  };

  const handleSaveCode = async () => {
    if (!runId) return;
    setBusy(true);
    try {
      await updateTaskCode(runId, task.id, code);
      setTask((t) => ({ ...t, code }));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!runId) return;
    setBusy(true);
    try {
      await deleteTask(runId, task.id);
      setTask((t) => ({ ...t, status: 'failed' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-teal/20 bg-teal/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[14px] font-semibold text-cream">{task.title}</p>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border capitalize ${statusColors[task.status] || statusColors.proposed}`}>
                {task.status}
              </span>
            </div>
            <p className="text-[12px] text-cream-muted leading-relaxed">{task.description}</p>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={() => setShowCode((v) => !v)}
              className="text-[10px] font-mono px-2 py-1 rounded border border-line bg-bg-card text-cream-faint hover:text-cream transition-colors"
            >
              {showCode ? 'Hide' : 'Code'}
            </button>
            {task.id > 0 && (task.status === 'proposed' || task.status === 'approved') && runId && (
              <button
                onClick={handleApproveAndRun}
                disabled={busy}
                className="text-[10px] font-mono px-2 py-1 rounded border border-teal/30 bg-teal/15 text-teal hover:bg-teal/25 transition-colors disabled:opacity-40"
              >
                {busy ? '\u2026' : 'Run'}
              </button>
            )}
            {task.id > 0 && task.status === 'proposed' && runId && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-[10px] font-mono px-2 py-1 rounded border border-rose/30 bg-rose/10 text-rose hover:bg-rose/20 transition-colors disabled:opacity-40"
                title="Delete"
              >
                x
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Code view */}
      {showCode && (
        <div className="border-t border-line/40">
          {editing ? (
            <div className="p-3">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-64 p-3 bg-bg-inset border border-line rounded-lg text-[12px] font-mono text-cream leading-relaxed resize-y focus:outline-none focus:border-amber/50"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveCode}
                  disabled={busy}
                  className="text-[10px] font-mono px-3 py-1 rounded bg-amber text-bg hover:bg-amber-glow transition-colors disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => { setCode(task.code); setEditing(false); }}
                  className="text-[10px] font-mono px-3 py-1 rounded border border-line text-cream-faint hover:text-cream transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre className="p-3 text-[11px] font-mono text-cream-dim leading-relaxed overflow-x-auto max-h-80 whitespace-pre-wrap">
                {task.code}
              </pre>
              {runId && (task.status === 'proposed' || task.status === 'approved') && (
                <button
                  onClick={() => setEditing(true)}
                  className="absolute top-2 right-2 text-[10px] font-mono px-2 py-1 rounded bg-bg-card border border-line text-cream-faint hover:text-cream transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Output */}
      {showOutput && task.output && (
        <div className="border-t border-line/40">
          <button
            onClick={() => setShowOutput((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-[10px] font-mono text-cream-faint hover:text-cream transition-colors"
          >
            <span>Output</span>
            <svg className={`w-3 h-3 transition-transform ${showOutput ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <pre className="px-4 pb-4 text-[11px] font-mono text-cream-faint leading-relaxed overflow-x-auto max-h-60 whitespace-pre-wrap">
            {task.output}
          </pre>
        </div>
      )}

      {/* Busy indicator */}
      {busy && task.status === 'running' && (
        <div className="px-4 py-2 border-t border-line/40">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
            <span className="text-[11px] font-mono text-cream-faint">Running...</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════ Executive Summary ════ */

function ExecSummary({ es }: { es: ExecutiveSummary }) {
  const confColor = es.confidence === 'high' ? 'text-teal' : es.confidence === 'medium' ? 'text-amber' : 'text-cream-muted';
  return (
    <div className="mb-10 relative rounded-xl overflow-hidden border border-amber/20">
      <div className="absolute inset-0 bg-gradient-to-br from-amber/6 via-transparent to-transparent pointer-events-none" />
      <div className="relative px-6 py-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <p className="text-[10px] font-mono text-amber tracking-[0.2em] uppercase">Summary</p>
          {es.confidence && (
            <span className={`text-[9px] font-mono tracking-wider ${confColor}`}>
              {es.confidence} confidence
            </span>
          )}
        </div>
        <p className="text-[17px] font-display font-400 text-cream leading-snug mb-5">
          {es.headline}
        </p>
        {es.bullets?.length > 0 && (
          <ul className="space-y-2.5">
            {es.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-5 h-5 rounded-md bg-amber/15 border border-amber/20 flex items-center justify-center text-[9px] font-mono text-amber mt-0.5">
                  {i + 1}
                </span>
                <p className="text-[14px] text-cream-dim leading-relaxed">{b}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ════ Lens content renderers ════ */

function LensContent({ lr }: { lr: { lens: string; summary: string; content: Record<string, unknown> } }) {
  const c = lr.content;

  // ── Literature Review ──────────────────────────────────────────────
  if (lr.lens === 'lit_review') {
    const draft = c.draft as string | undefined;
    const themes = (c.themes || []) as Array<{ name: string; summary: string; papers: string[] }>;
    return (
      <div className="space-y-4">
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-500/8 text-violet-300">
                {t.name}
              </span>
            ))}
          </div>
        )}
        {draft ? (
          <div className="relative">
            <div className="prose-block max-h-80 overflow-y-auto p-4 bg-bg-inset rounded-lg border border-line text-[13px] text-cream leading-relaxed whitespace-pre-wrap">
              {draft}
            </div>
            <CopyButton text={draft} />
          </div>
        ) : (
          <p className="text-sm text-cream-muted">{lr.summary}</p>
        )}
      </div>
    );
  }

  // ── Research Proposal ──────────────────────────────────────────────
  if (lr.lens === 'research_proposal') {
    const aims = (c.aims || []) as Array<{ aim: string; rationale: string; approach: string }>;
    return (
      <div className="space-y-4">
        {c.title ? <p className="text-base font-semibold text-cream">{c.title as string}</p> : null}
        {c.background ? <ProseSection label="Background" text={c.background as string} /> : null}
        {c.gap_statement ? <ProseSection label="Gap" text={c.gap_statement as string} /> : null}
        {aims.length > 0 && (
          <div>
            <p className="text-[10px] font-mono text-cream-faint tracking-widest uppercase mb-2">Specific Aims</p>
            <div className="space-y-2">
              {aims.map((a, i) => (
                <div key={i} className="p-3 rounded-lg border border-violet-500/15 bg-violet-500/5">
                  <p className="text-[13px] font-semibold text-violet-300 mb-1">Aim {i + 1}: {a.aim}</p>
                  <p className="text-[12px] text-cream-muted leading-relaxed">{a.rationale}</p>
                  {a.approach && <p className="text-[12px] text-cream-faint mt-1 italic">{a.approach}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {c.methodology ? <ProseSection label="Methodology" text={c.methodology as string} /> : null}
        {c.innovation ? <ProseSection label="Innovation" text={c.innovation as string} /> : null}
      </div>
    );
  }

  // ── Peer Review ────────────────────────────────────────────────────
  if (lr.lens === 'peer_review') {
    const supported = (c.supported_claims || []) as Array<{ claim: string; notes: string }>;
    const unsupported = (c.unsupported_claims || []) as Array<{ claim: string; concern: string }>;
    const concerns = (c.methodological_concerns || []) as Array<{ concern: string; suggestion: string }>;
    return (
      <div className="space-y-4">
        {c.overall_assessment ? (
          <p className="text-sm text-cream leading-relaxed border-l-2 border-violet-500/40 pl-3">
            {c.overall_assessment as string}
          </p>
        ) : null}
        {supported.length > 0 && (
          <ClaimList title="Supported" items={supported.map((x) => ({ text: x.claim, sub: x.notes }))} color="teal" />
        )}
        {unsupported.length > 0 && (
          <ClaimList title="Unsupported / Needs Citation" items={unsupported.map((x) => ({ text: x.claim, sub: x.concern }))} color="rose" />
        )}
        {concerns.length > 0 && (
          <ClaimList title="Methodological Concerns" items={concerns.map((x) => ({ text: x.concern, sub: x.suggestion }))} color="amber" />
        )}
      </div>
    );
  }

  // ── Claim Verification ─────────────────────────────────────────────
  if (lr.lens === 'claim_verification') {
    const verdict = c.verdict as string | undefined;
    const conf = (c.confidence as number) ?? 0;
    const supporting = (c.supporting_facts || []) as Array<{ content: string; paper: string }>;
    const refuting = (c.refuting_facts || []) as Array<{ content: string; paper: string }>;
    const verdictStyle: Record<string, string> = {
      supported: 'bg-teal/15 border-teal/30 text-teal',
      refuted: 'bg-rose/15 border-rose/30 text-rose',
      mixed: 'bg-amber/15 border-amber/30 text-amber',
      insufficient: 'bg-line border-line-strong text-cream-muted',
    };
    return (
      <div className="space-y-3">
        {verdict && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${verdictStyle[verdict] ?? verdictStyle.insufficient}`}>
            <span className="capitalize">{verdict}</span>
            {conf > 0 && <span className="text-[11px] font-mono opacity-70">{Math.round(conf * 100)}%</span>}
          </div>
        )}
        {c.summary ? <p className="text-sm text-cream-muted leading-relaxed">{c.summary as string}</p> : null}
        {supporting.length > 0 && (
          <ClaimList title="Supporting Evidence" items={supporting.map((x) => ({ text: x.content, sub: x.paper }))} color="teal" />
        )}
        {refuting.length > 0 && (
          <ClaimList title="Refuting Evidence" items={refuting.map((x) => ({ text: x.content, sub: x.paper }))} color="rose" />
        )}
      </div>
    );
  }

  // ── Contradictions ─────────────────────────────────────────────────
  if (lr.lens === 'contradiction') {
    const contradictions = (c.contradictions || []) as Array<{
      topic: string; claim_a: string; paper_a: string; claim_b: string; paper_b: string; type: string;
    }>;
    if (!contradictions.length) return <p className="text-sm text-cream-muted">{lr.summary}</p>;
    return (
      <div className="space-y-3">
        {c.summary ? <p className="text-sm text-cream-muted">{c.summary as string}</p> : null}
        {contradictions.slice(0, 6).map((ct, i) => (
          <div key={i} className="rounded-lg border border-rose/20 overflow-hidden">
            <div className="px-3 py-1.5 bg-rose/8 border-b border-rose/15">
              <span className="text-[11px] font-semibold text-rose">{ct.topic}</span>
              {ct.type && <span className="ml-2 text-[9px] font-mono text-rose/60">{ct.type}</span>}
            </div>
            <div className="grid grid-cols-2 divide-x divide-line/40">
              <div className="p-3">
                <p className="text-[11px] font-mono text-cream-faint mb-1 truncate">{ct.paper_a}</p>
                <p className="text-[12px] text-cream leading-relaxed">{ct.claim_a}</p>
              </div>
              <div className="p-3">
                <p className="text-[11px] font-mono text-cream-faint mb-1 truncate">{ct.paper_b}</p>
                <p className="text-[12px] text-cream leading-relaxed">{ct.claim_b}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Replication ────────────────────────────────────────────────────
  if (lr.lens === 'replication') {
    const reps = (c.replications || []) as Array<{ finding: string; status: string; count: number; papers: string[] }>;
    if (!reps.length) return <p className="text-sm text-cream-muted">{lr.summary}</p>;
    const statusColor: Record<string, string> = {
      confirmed: 'text-teal bg-teal/10 border-teal/25',
      challenged: 'text-rose bg-rose/10 border-rose/25',
      single: 'text-amber bg-amber/10 border-amber/25',
    };
    return (
      <div className="space-y-2">
        {c.summary ? <p className="text-sm text-cream-muted mb-3">{c.summary as string}</p> : null}
        {reps.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-bg-inset rounded-lg border border-line">
            <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border capitalize ${statusColor[r.status] ?? statusColor.single}`}>
              {r.status}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-cream leading-snug">{r.finding}</p>
              <p className="text-[11px] text-cream-faint mt-0.5">{r.count} paper{r.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Statistical Aggregation ────────────────────────────────────────
  if (lr.lens === 'statistical_aggregation') {
    const aggs = (c.aggregations || []) as Array<{ metric: string; count: number; mean: number; min: number; max: number; std?: number }>;
    if (!aggs.length) return <p className="text-sm text-cream-muted">{lr.summary}</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left">
              {['Metric', 'n', 'Mean', 'Min', 'Max'].map((h) => (
                <th key={h} className="pb-2 pr-4 font-mono text-[10px] text-cream-faint tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {aggs.map((a, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-4 text-cream font-medium">{a.metric}</td>
                <td className="py-1.5 pr-4 text-cream-muted font-mono">{a.count}</td>
                <td className="py-1.5 pr-4 text-amber font-mono">{a.mean?.toFixed(2)}</td>
                <td className="py-1.5 pr-4 text-cream-muted font-mono">{a.min?.toFixed(2)}</td>
                <td className="py-1.5 font-mono text-cream-muted">{a.max?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Bias Detection ─────────────────────────────────────────────────
  if (lr.lens === 'bias_detection') {
    const biases = (c.biases || []) as Array<{ type: string; description: string; evidence: string; severity: string }>;
    if (!biases.length) return <p className="text-sm text-cream-muted">{lr.summary}</p>;
    return (
      <div className="space-y-2">
        {biases.map((b, i) => (
          <div key={i} className={`p-3 rounded-lg border-l-2 ${b.severity === 'high' ? 'border-l-rose bg-rose/5 border border-rose/15' : b.severity === 'medium' ? 'border-l-amber bg-amber/5 border border-amber/15' : 'border-l-cream-faint bg-bg-card border border-line'}`}>
            <p className="text-[12px] font-semibold text-cream mb-0.5">{b.type}</p>
            <p className="text-[12px] text-cream-muted leading-relaxed">{b.description}</p>
            {b.evidence && <p className="text-[11px] text-cream-faint mt-1 italic">{b.evidence}</p>}
          </div>
        ))}
      </div>
    );
  }

  // ── Evidence Table ─────────────────────────────────────────────────
  if (lr.lens === 'evidence_table') {
    return (
      <div className="flex gap-4 text-sm">
        <div className="text-center"><p className="text-lg font-display text-cream">{c.total_facts as number ?? 0}</p><p className="text-[10px] text-cream-faint font-mono">facts</p></div>
        <div className="text-center"><p className="text-lg font-display text-cream">{c.papers_with_evidence as number ?? 0}</p><p className="text-[10px] text-cream-faint font-mono">papers</p></div>
      </div>
    );
  }

  // ── Default: just summary ──────────────────────────────────────────
  return <p className="text-[12px] text-cream-muted leading-relaxed">{lr.summary}</p>;
}

// ── Shared sub-components ──────────────────────────────────────────────────

function ProseSection({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-cream-faint tracking-widest uppercase mb-1">{label}</p>
      <p className="text-[13px] text-cream-dim leading-relaxed">{text}</p>
    </div>
  );
}

function ClaimList({ title, items, color }: { title: string; items: Array<{ text: string; sub?: string }>; color: 'teal' | 'rose' | 'amber' }) {
  const col = { teal: 'text-teal', rose: 'text-rose', amber: 'text-amber' }[color];
  const dot = { teal: 'bg-teal', rose: 'bg-rose', amber: 'bg-amber' }[color];
  return (
    <div>
      <p className={`text-[10px] font-mono tracking-widest uppercase mb-2 ${col}`}>{title}</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${dot}`} />
            <div>
              <p className="text-[12px] text-cream leading-snug">{item.text}</p>
              {item.sub && <p className="text-[11px] text-cream-faint mt-0.5 italic">{item.sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="absolute top-2 right-2 text-[10px] font-mono px-2 py-1 rounded bg-bg-card border border-line text-cream-faint hover:text-cream transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ════ Legacy Gap card (flow renderer) ════ */

function LegacyGapCard({ gap, idx, bookmarked, onBookmark }: { gap: Gap; idx: number; bookmarked: boolean; onBookmark: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sd = gap.suggested_design;
  const feasColor = sd?.feasibility === 'high' ? 'text-teal bg-teal/10 border-teal/25' :
                    sd?.feasibility === 'medium' ? 'text-amber bg-amber/10 border-amber/25' :
                    'text-cream-muted bg-bg-hover border-line';
  return (
    <div className={`rounded-lg border-l-[3px] ${
      gap.severity === 'high'
        ? 'border-l-rose bg-rose-subtle/50 border border-rose/10'
        : gap.severity === 'medium'
        ? 'border-l-amber bg-amber-subtle/50 border border-amber/10'
        : 'border-l-cream-faint bg-bg-card border border-line'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-mono font-bold ${
            gap.severity === 'high' ? 'bg-rose/20 text-rose' :
            gap.severity === 'medium' ? 'bg-amber/20 text-amber' :
            'bg-bg-hover text-cream-muted'
          }`}>{idx + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-cream leading-snug">{gap.description}</p>
            <p className="text-sm text-cream-muted mt-1.5 leading-relaxed">{gap.evidence}</p>
          </div>
          <button onClick={onBookmark} title="Bookmark" className="shrink-0 text-[15px] text-cream-faint hover:text-amber transition-colors">
            {bookmarked ? '★' : '☆'}
          </button>
        </div>
      </div>
      {sd && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between border-t border-line/40 text-[10px] font-mono text-cream-faint hover:text-cream transition-colors"
          >
            <span>Suggested study design</span>
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded && (
            <div className="px-4 pb-4 border-t border-line/40 pt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-cream-faint">Design:</span>
                <span className="text-[11px] font-semibold text-cream">{sd.design_type}</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border capitalize ${feasColor}`}>
                  {sd.feasibility} feasibility
                </span>
              </div>
              {sd.key_variables?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sd.key_variables.map((v, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-line bg-bg-inset text-cream-faint">{v}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════ Flow card ════ */

const FLOW_META: Record<string, { color: string; accent: string; border: string; bg: string; icon: ReactNode }> = {
  lit_review:            { color: 'violet', accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8',  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
  research_proposal:     { color: 'violet', accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8',  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
  grant_preparation:     { color: 'violet', accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8',  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
  peer_review:           { color: 'violet', accent: 'text-violet-300', border: 'border-violet-500/25', bg: 'bg-violet-500/8',  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
  meta_analysis:         { color: 'amber',  accent: 'text-amber',      border: 'border-amber/25',      bg: 'bg-amber/8',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  systematic_review:     { color: 'amber',  accent: 'text-amber',      border: 'border-amber/25',      bg: 'bg-amber/8',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  trend_analysis:        { color: 'amber',  accent: 'text-amber',      border: 'border-amber/25',      bg: 'bg-amber/8',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /> },
  domain_survey:         { color: 'amber',  accent: 'text-amber',      border: 'border-amber/25',      bg: 'bg-amber/8',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  gap_discovery:         { color: 'rose',   accent: 'text-rose',       border: 'border-rose/25',       bg: 'bg-rose/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /> },
  bias_audit:            { color: 'rose',   accent: 'text-rose',       border: 'border-rose/25',       bg: 'bg-rose/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> },
  contradiction_analysis:{ color: 'rose',   accent: 'text-rose',       border: 'border-rose/25',       bg: 'bg-rose/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /> },
  claim_verification:    { color: 'rose',   accent: 'text-rose',       border: 'border-rose/25',       bg: 'bg-rose/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  knowledge_mapping:     { color: 'teal',   accent: 'text-teal',       border: 'border-teal/25',       bg: 'bg-teal/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /> },
  research_planning:     { color: 'teal',   accent: 'text-teal',       border: 'border-teal/25',       bg: 'bg-teal/8',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /> },
};

const FLOW_META_DEFAULT = { color: 'amber', accent: 'text-amber', border: 'border-amber/25', bg: 'bg-amber/8', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> };

interface FlowCardProps {
  flowName: string;
  fr: FlowResult;
  idx: number;
  bookmarked?: boolean;
  onBookmark?: () => void;
  isRerunning?: boolean;
  onRerun?: () => void;
}

function FlowCard({ flowName, fr, idx, bookmarked, onBookmark, isRerunning, onRerun }: FlowCardProps) {
  const [open, setOpen] = useState(false);
  const meta = FLOW_META[flowName] ?? FLOW_META_DEFAULT;
  const topLens = fr.lens_results.find((r) => r.lens !== 'evidence_table') ?? fr.lens_results[0];
  const keyInsight = topLens?.summary ?? '';

  return (
    <div
      className={`relative rounded-xl border ${meta.border} ${meta.bg} overflow-hidden transition-all duration-200`}
    >
      {/* Subtle number watermark */}
      <span className="absolute top-3 right-4 text-[52px] font-display font-700 leading-none opacity-[0.06] select-none pointer-events-none">
        {String(idx + 1).padStart(2, '0')}
      </span>

      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center`}>
            <svg className={`w-4 h-4 ${meta.accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {meta.icon}
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-semibold ${meta.accent} leading-snug`}>{fr.title}</p>
            <p className="text-[12px] text-cream-muted mt-0.5 leading-relaxed line-clamp-2">{fr.description}</p>
          </div>

          {/* Bookmark + Re-run buttons */}
          <div className="shrink-0 flex items-center gap-1">
            {onBookmark && (
              <button onClick={onBookmark} title="Bookmark" className="text-[15px] text-cream-faint hover:text-amber transition-colors">
                {bookmarked ? '★' : '☆'}
              </button>
            )}
            {onRerun && (
              <button
                onClick={onRerun}
                disabled={isRerunning}
                title="Re-run this flow"
                className="text-[11px] font-mono px-2 py-0.5 rounded border border-line bg-bg-card text-cream-faint hover:text-cream hover:border-amber/30 transition-colors disabled:opacity-40"
              >
                {isRerunning ? '…' : '↻'}
              </button>
            )}
          </div>
        </div>

        {/* Key insight */}
        {keyInsight && (
          <p className="mt-3 text-[13px] text-cream leading-relaxed line-clamp-2 pr-8">
            {keyInsight}
          </p>
        )}
      </div>

      {/* Lens chips */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {fr.lens_results.map((lr) => (
          <span
            key={lr.lens}
            className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-line bg-bg-inset text-cream-faint tracking-wide"
          >
            {lr.lens.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between border-t border-line/50 text-[11px] font-mono text-cream-faint hover:text-cream transition-colors group"
      >
        <span>{open ? 'Hide details' : 'View lens results'}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded lens results */}
      {open && (
        <div className="border-t border-line/50 divide-y divide-line/30">
          {fr.lens_results.map((lr) => (
            <div key={lr.lens} className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${meta.bg} ${meta.accent} border ${meta.border}`}>
                  {lr.lens.replace(/_/g, ' ')}
                </span>
                <p className="text-[13px] font-semibold text-cream">{lr.title}</p>
              </div>
              <LensContent lr={lr} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════ UI primitives ════ */

function Sec({ children }: { children: ReactNode }) {
  return <div className="mb-12">{children}</div>;
}

function SLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-mono text-amber tracking-[0.15em] uppercase mb-3">{children}</h2>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-bg-card border border-line rounded-lg p-3.5 text-center">
      <p className="text-2xl font-display font-600 text-cream leading-none">{n}</p>
      <p className="text-[11px] text-cream-faint mt-1 font-mono">{label}</p>
    </div>
  );
}

function ChartWrap({ children }: { children: ReactNode }) {
  return <div className="bg-bg-card border border-line rounded-lg p-4">{children}</div>;
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 text-[12px] text-cream-faint leading-relaxed">
      {children}
    </p>
  );
}

/* ════ Data extraction ════ */

interface SuggestedDesign { design_type: string; key_variables: string[]; feasibility: string }
interface Gap { description: string; evidence: string; severity: string; suggested_design?: SuggestedDesign }
interface Fact { content: string; direct_quote: string; paper_title: string; location: string; confidence?: number }
interface InsightGroup { title: string; items: string[] }
interface Direction { title: string; description: string }

interface Stats {
  totalPapers: number; totalFacts: number; totalGaps: number; totalVenues: number;
  factTypeData: Array<{ name: string; value: number }>;
  yearData: Array<{ year: string; papers: number }>;
  venueData: Array<{ name: string; count: number }>;
  topTerms: Array<{ term: string; count: number }>;
  gaps: Gap[]; gapSev: Array<{ name: string; value: number }>;
  sampleFacts: Fact[]; insights: InsightGroup[]; directions: Direction[]; recommendations: string[];
}

function getStats(report: Report): Stats {
  let totalPapers = 0, totalFacts = 0, totalGaps = 0, totalVenues = 0;
  const ftc: Record<string, number> = {};
  let yearDist: Record<string, number> = {}, venueDist: Record<string, number> = {}, topTermsRaw: Record<string, number> = {};
  const gaps: Gap[] = [], sampleFacts: Fact[] = [], insights: InsightGroup[] = [], directions: Direction[] = [], recommendations: string[] = [];

  for (const lr of report.lens_results) {
    const c = lr.content;
    if (lr.lens === 'evidence_table') {
      totalFacts = (c.total_facts as number) || 0;
      totalPapers = (c.papers_with_evidence as number) || 0;
      const tables = (c.tables || {}) as Record<string, Array<Record<string, string>>>;
      for (const [type, facts] of Object.entries(tables)) {
        ftc[type] = (ftc[type] || 0) + facts.length;
        // Stride-based sampling to pick findings from diverse papers
        const stride = Math.max(1, Math.floor(facts.length / 3));
        const sampled = [0, stride, stride * 2].filter(i => i < facts.length).map(i => facts[i]);
        for (const f of sampled) {
          if (sampleFacts.length < 8) sampleFacts.push({ content: f.content || '', direct_quote: f.direct_quote || '', paper_title: f.paper_title || 'Unknown', location: f.location || '', confidence: parseFloat(f.confidence) || 0 });
        }
      }
    }
    if (lr.lens === 'gap_discovery') {
      for (const g of (c.gaps || []) as Array<Record<string, unknown>>) {
        gaps.push({
          description: (g.description as string) || '',
          evidence: (g.evidence as string) || '',
          severity: (g.severity as string) || 'low',
          suggested_design: g.suggested_design as SuggestedDesign | undefined,
        });
      }
      totalGaps = gaps.length;
    }
    if (lr.lens === 'meta_analysis') {
      if (c.year_distribution) yearDist = c.year_distribution as Record<string, number>;
      if (c.venue_distribution) venueDist = c.venue_distribution as Record<string, number>;
      if (c.top_terms) topTermsRaw = c.top_terms as Record<string, number>;
      if (!totalPapers && c.total_papers) totalPapers = c.total_papers as number;
      if (!totalFacts && c.total_facts) totalFacts = c.total_facts as number;
      for (const [key, arr] of [['What stands out', c.frequency_stats], ['How the field is changing', c.temporal_trends], ['Where research concentrates', c.concentration_patterns]] as [string, unknown][]) {
        const items = (arr || []) as Array<Record<string, string>>;
        if (items.length > 0) insights.push({ title: key, items: items.map(exT) });
      }
    }
    if (lr.lens === 'venue_mapping') {
      const summary = c.venue_evidence_summary as Record<string, Record<string, unknown>> | undefined;
      if (summary) totalVenues = Object.keys(summary).length;
      for (const a of (c.venue_analysis || []) as Array<Record<string, unknown>>) {
        const all = [...((a.patterns as string[]) || []), ...((a.notable_differences as string[]) || [])];
        if (all.length) insights.push({ title: `About ${a.venue as string}`, items: all });
      }
    }
    if (lr.lens === 'research_planning') {
      for (const d of (c.directions || []) as Array<Record<string, string>>) directions.push({ title: d.area || d.direction || d.title || Object.values(d)[0] || '', description: d.rationale || d.description || d.reasoning || '' });
      for (const r of (c.recommendations || []) as Array<Record<string, string>>) recommendations.push(r.text || r.recommendation || r.description || Object.values(r)[0] || '');
      for (const [key, arr] of [['What reviewers expect', c.evaluation_expectations], ['Common design patterns', c.design_patterns]] as [string, unknown][]) {
        const items = (arr || []) as Array<Record<string, string> | string>;
        if (items.length > 0) insights.push({ title: key, items: items.map(exM) });
      }
    }
  }

  const factTypeData = Object.entries(ftc).map(([n, v]) => ({ name: cap(n), value: v })).sort((a, b) => b.value - a.value);
  const yearData = Object.entries(yearDist).map(([y, p]) => ({ year: y, papers: p })).sort((a, b) => a.year.localeCompare(b.year));
  const venueData = Object.entries(venueDist).filter(([v]) => v && v.trim() && v !== 'Unknown').slice(0, 8).map(([n, c]) => ({ name: n.length > 35 ? n.slice(0, 32) + '...' : n, count: c })).sort((a, b) => b.count - a.count);
  const topTerms = Object.entries(topTermsRaw).slice(0, 15).map(([t, c]) => ({ term: t, count: c }));
  const sc: Record<string, number> = {};
  for (const g of gaps) { const k = cap(g.severity || 'low'); sc[k] = (sc[k] || 0) + 1; }
  const gapSev = Object.entries(sc).map(([n, v]) => ({ name: n, value: v })).sort((a, b) => { const o: Record<string, number> = { High: 0, Medium: 1, Low: 2 }; return (o[a.name] ?? 3) - (o[b.name] ?? 3); });

  return { totalPapers, totalFacts, totalGaps, totalVenues, factTypeData, yearData, venueData, topTerms, gaps, gapSev, sampleFacts, insights, directions, recommendations };
}

function exT(i: Record<string, string>): string { return i.description || i.pattern || i.finding || i.observation || JSON.stringify(i); }
function exM(i: Record<string, string> | string): string { return typeof i === 'string' ? i : exT(i); }
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
