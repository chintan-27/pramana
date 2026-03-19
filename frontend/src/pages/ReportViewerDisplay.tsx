import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Report } from '../api/client';
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

  const s = getStats(report);
  const hyp = report.hypothesis as Record<string, string[] | string>;

  return (
    <div className="max-w-6xl mx-auto pt-8 pb-16 animate-fade-up lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
    {/* Report column */}
    <div>

      {/* ── Title ── */}
      <div className="mb-10">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-3">Report</p>
        <h1 className="font-display text-[36px] sm:text-[44px] font-300 text-cream leading-[1.12] tracking-tight">
          {hyp.topics
            ? <>{(hyp.topics as string[]).join(', ')}</>
            : 'Research Report'}
        </h1>
        {hyp.domains ? (
          <p className="text-base text-cream-muted mt-3">
            in {(hyp.domains as string[]).join(' & ')}
          </p>
        ) : null}
      </div>

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
              <div
                key={i}
                className={`p-4 rounded-lg border-l-[3px] ${
                  gap.severity === 'high'
                    ? 'border-l-rose bg-rose-subtle/50 border border-rose/10'
                    : gap.severity === 'medium'
                    ? 'border-l-amber bg-amber-subtle/50 border border-amber/10'
                    : 'border-l-cream-faint bg-bg-card border border-line'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-mono font-bold ${
                    gap.severity === 'high' ? 'bg-rose/20 text-rose' :
                    gap.severity === 'medium' ? 'bg-amber/20 text-amber' :
                    'bg-bg-hover text-cream-muted'
                  }`}>{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-medium text-cream leading-snug">{gap.description}</p>
                    <p className="text-sm text-cream-muted mt-1.5 leading-relaxed">{gap.evidence}</p>
                  </div>
                </div>
              </div>
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
                <p className="text-[15px] text-cream leading-relaxed mb-2">{f.content}</p>
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

      {/* ── Footer ── */}
      <div className="mt-14 pt-6 border-t border-line flex items-center justify-between">
        <Link to="/evidence" className="text-sm font-medium text-amber hover:text-amber-glow transition-colors">
          Explore Evidence
        </Link>
        <Link to="/" className="text-sm text-cream-muted hover:text-cream transition-colors">
          New Analysis
        </Link>
      </div>
    </div>

    {/* Chat column */}
    {runId && (
      <div className="hidden lg:block">
        <ReportChat runId={runId} />
      </div>
    )}
    {/* Mobile chat (toggle button + drawer) */}
    {runId && (
      <div className="lg:hidden">
        <ReportChat runId={runId} />
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

interface Gap { description: string; evidence: string; severity: string }
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
      for (const g of (c.gaps || []) as Array<Record<string, string>>) gaps.push({ description: g.description || '', evidence: g.evidence || '', severity: g.severity || 'low' });
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
