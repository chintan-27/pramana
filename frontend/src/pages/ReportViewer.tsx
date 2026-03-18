import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReport, type Report } from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from 'recharts';

const ACCENT = '#4338ca';

export default function ReportViewer() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;
    getReport(runId)
      .then(setReport)
      .catch((err) => setError(err.message));
  }, [runId]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto pt-8 px-4">
        <div className="p-5 bg-danger-subtle border border-danger/20 rounded-2xl text-danger text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-3xl mx-auto pt-8 px-4 space-y-4">
        <div className="skeleton h-12 w-72" />
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const stats = getStats(report);
  const hypothesis = report.hypothesis as Record<string, string[] | string>;

  return (
    <div className="max-w-3xl mx-auto pt-6 pb-16 px-4">

      {/* ── Title ── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-success/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">Your Research Report</h1>
        </div>
        {hypothesis.topics && (
          <p className="text-base text-ink-muted leading-relaxed">
            You asked about <strong className="text-ink">{(hypothesis.topics as string[]).join(', ')}</strong>
            {hypothesis.domains ? (
              <> in <strong className="text-ink">{(hypothesis.domains as string[]).join(' & ')}</strong></>
            ) : null}.
            Here&apos;s what we found.
          </p>
        )}
      </div>

      {/* ── Executive Summary ── */}
      <Section>
        <SectionTitle>The Big Picture</SectionTitle>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <BigStat value={stats.totalPapers} label="research papers analyzed" />
          <BigStat value={stats.totalFacts} label="key findings extracted" />
          <BigStat value={stats.totalGaps} label="research gaps found" />
          <BigStat value={stats.totalVenues} label="journals & conferences" />
        </div>
        <Callout>
          We searched across major databases and found <strong>{stats.totalPapers} relevant papers</strong>.
          From those, we extracted <strong>{stats.totalFacts} specific findings</strong> with
          direct quotes from the original text.
          {stats.totalGaps > 0 && (
            <> We also identified <strong>{stats.totalGaps} gap{stats.totalGaps !== 1 ? 's' : ''}</strong> where
            more research is needed.</>
          )}
        </Callout>
      </Section>

      {/* ── What kind of evidence did we find? ── */}
      {stats.factTypeData.length > 0 && (
        <Section>
          <SectionTitle>What Kind of Evidence Did We Find?</SectionTitle>
          <p className="text-sm text-ink-muted mb-5">
            Each finding from the papers was categorized. Here&apos;s the breakdown:
          </p>
          <div className="bg-surface-raised border border-border rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={Math.max(stats.factTypeData.length * 48, 120)}>
              <BarChart data={stats.factTypeData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#1a1a2e' }} width={130} />
                <Tooltip formatter={(v) => [`${v} findings`, '']} />
                <Bar dataKey="value" fill={ACCENT} radius={[0, 6, 6, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Explainer>
            This chart shows the types of evidence found.
            {stats.factTypeData[0] && (
              <> The most common type was <strong>{stats.factTypeData[0].name.toLowerCase()}</strong> findings
              ({stats.factTypeData[0].value} total).</>
            )}
          </Explainer>
        </Section>
      )}

      {/* ── When was this research published? ── */}
      {stats.yearData.length > 0 && (
        <Section>
          <SectionTitle>When Was This Research Published?</SectionTitle>
          <p className="text-sm text-ink-muted mb-5">
            This shows the publication years of the papers we analyzed:
          </p>
          <div className="bg-surface-raised border border-border rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.yearData}>
                <defs>
                  <linearGradient id="yearFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} papers`, '']} />
                <Area type="monotone" dataKey="papers" stroke={ACCENT} fill="url(#yearFill)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Explainer>
            {(() => {
              const sorted = [...stats.yearData].sort((a, b) => b.papers - a.papers);
              const peak = sorted[0];
              if (!peak) return 'The chart above shows how research output has changed over time.';
              return (
                <>
                  Research peaked in <strong>{peak.year}</strong> with {peak.papers} papers.
                  {stats.yearData.length >= 3 && sorted[0].papers > sorted[sorted.length - 1].papers
                    ? ' The field has been actively growing.'
                    : ''}
                </>
              );
            })()}
          </Explainer>
        </Section>
      )}

      {/* ── Where is this research published? ── */}
      {stats.venueData.length > 0 && (
        <Section>
          <SectionTitle>Where Does This Research Get Published?</SectionTitle>
          <p className="text-sm text-ink-muted mb-5">
            The journals and conferences where these papers appeared:
          </p>
          <div className="bg-surface-raised border border-border rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={Math.max(stats.venueData.length * 44, 140)}>
              <BarChart data={stats.venueData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#1a1a2e' }} width={180} />
                <Tooltip formatter={(v) => [`${v} papers`, '']} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Explainer>
            These are the most common places this research gets published.
            {stats.venueData[0] && (
              <> <strong>{stats.venueData[0].name}</strong> had the most papers ({stats.venueData[0].count}).</>
            )}
          </Explainer>
        </Section>
      )}

      {/* ── Most talked-about topics ── */}
      {stats.topTerms.length > 0 && (
        <Section>
          <SectionTitle>Most Talked-About Topics</SectionTitle>
          <p className="text-sm text-ink-muted mb-4">
            These are the terms and concepts that come up most often across all the papers:
          </p>
          <div className="flex flex-wrap gap-2.5">
            {stats.topTerms.map(({ term, count }, i) => (
              <span
                key={term}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium border ${
                  i < 3
                    ? 'bg-accent-subtle text-accent border-accent/20 text-base'
                    : 'bg-surface-sunken text-ink border-border'
                }`}
              >
                {term} <span className="opacity-40 ml-0.5">({count})</span>
              </span>
            ))}
          </div>
          <Explainer>
            Bigger and highlighted terms are the most frequently mentioned.
            These represent the core concepts in this research area.
          </Explainer>
        </Section>
      )}

      {/* ── Research Gaps ── */}
      {stats.gaps.length > 0 && (
        <Section>
          <SectionTitle>Where Are the Gaps in the Research?</SectionTitle>
          <p className="text-sm text-ink-muted mb-2">
            These are areas where we found <strong className="text-ink">missing or limited evidence</strong> —
            potential opportunities for new research:
          </p>

          {/* Severity overview */}
          {stats.gapSeverityData.length > 0 && (
            <div className="flex items-center gap-4 my-4 px-1">
              {stats.gapSeverityData.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    s.name === 'High' ? 'bg-danger' : s.name === 'Medium' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <span className="text-sm text-ink">
                    <strong>{s.value}</strong> {s.name.toLowerCase()} priority
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {stats.gaps.map((gap, i) => (
              <div key={i} className={`p-5 rounded-2xl border-2 ${
                gap.severity === 'high'
                  ? 'border-danger/30 bg-danger-subtle/30'
                  : gap.severity === 'medium'
                  ? 'border-warning/30 bg-warning-subtle/30'
                  : 'border-border bg-surface-sunken/30'
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white ${
                    gap.severity === 'high' ? 'bg-danger' :
                    gap.severity === 'medium' ? 'bg-warning' :
                    'bg-ink-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink leading-snug mb-1.5">{gap.description}</p>
                    <p className="text-sm text-ink-muted leading-relaxed">{gap.evidence}</p>
                    {gap.severity ? (
                      <span className={`inline-block mt-3 px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${
                        gap.severity === 'high' ? 'bg-danger/10 text-danger' :
                        gap.severity === 'medium' ? 'bg-warning/10 text-warning' :
                        'bg-success/10 text-success'
                      }`}>
                        {gap.severity} priority
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Explainer>
            <strong>High priority</strong> gaps are areas where the lack of evidence is most significant.
            <strong> Medium</strong> gaps are worth investigating.
            <strong> Low</strong> gaps are minor or emerging areas.
          </Explainer>
        </Section>
      )}

      {/* ── Key Findings from Papers ── */}
      {stats.sampleFacts.length > 0 && (
        <Section>
          <SectionTitle>Key Findings from the Papers</SectionTitle>
          <p className="text-sm text-ink-muted mb-4">
            Here are some of the most important findings we extracted, with direct quotes from the original papers:
          </p>
          <div className="space-y-3">
            {stats.sampleFacts.map((fact, i) => (
              <div key={i} className="p-4 bg-surface-raised border border-border rounded-2xl">
                <p className="text-[15px] font-medium text-ink leading-relaxed mb-2">{fact.content}</p>
                <div className="pl-3 border-l-2 border-accent/30 mb-2.5">
                  <p className="text-sm italic text-ink-muted leading-relaxed">
                    &ldquo;{fact.direct_quote}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{fact.paper_title}</span>
                  <span className="text-[10px] bg-surface-sunken px-1.5 py-0.5 rounded font-mono">{fact.location}</span>
                </div>
              </div>
            ))}
          </div>
          {stats.totalFacts > stats.sampleFacts.length && (
            <p className="text-center text-sm text-ink-muted mt-3">
              Showing {stats.sampleFacts.length} of {stats.totalFacts} findings.{' '}
              <Link to="/evidence" className="text-accent font-medium hover:underline">See all evidence</Link>
            </p>
          )}
        </Section>
      )}

      {/* ── LLM insights sections ── */}
      {stats.insights.length > 0 && (
        <Section>
          <SectionTitle>What Does This All Mean?</SectionTitle>
          <p className="text-sm text-ink-muted mb-4">
            Here are the key patterns and takeaways from analyzing all the evidence together:
          </p>
          {stats.insights.map((group, i) => (
            <div key={i} className="mb-5">
              <h4 className="text-sm font-semibold text-ink mb-2">{group.title}</h4>
              <ul className="space-y-2">
                {group.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm text-ink leading-relaxed">
                    <span className="text-accent mt-0.5 shrink-0 text-lg leading-none">&#8250;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {/* ── Research Directions ── */}
      {stats.directions.length > 0 && (
        <Section>
          <SectionTitle>Where Could You Go From Here?</SectionTitle>
          <p className="text-sm text-ink-muted mb-4">
            Based on the evidence and gaps, here are suggested directions for future research:
          </p>
          <div className="space-y-3">
            {stats.directions.map((d, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="shrink-0 w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 p-4 bg-accent-subtle/40 rounded-2xl border border-accent/10">
                  <p className="text-[15px] font-semibold text-ink">{d.title}</p>
                  {d.description ? (
                    <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">{d.description}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recommendations ── */}
      {stats.recommendations.length > 0 && (
        <Section>
          <SectionTitle>Practical Recommendations</SectionTitle>
          <div className="space-y-2.5">
            {stats.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-surface-raised">
                <div className="w-5 h-5 rounded-md bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-ink leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Footer ── */}
      <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
        <Link to="/evidence" className="text-sm font-medium text-accent hover:text-accent-light transition-colors">
          Explore All Evidence
        </Link>
        <Link to="/" className="text-sm text-ink-muted hover:text-ink transition-colors">
          Start New Analysis
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Shared UI Components
   ═══════════════════════════════════════════════════════════ */

function Section({ children }: { children: ReactNode }) {
  return <div className="mb-10">{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold text-ink mb-2">{children}</h2>;
}

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-surface-raised border border-border rounded-2xl p-4 text-center">
      <p className="text-3xl font-bold text-accent leading-none mb-1">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 bg-accent-subtle/40 border border-accent/15 rounded-2xl">
      <p className="text-sm text-ink leading-relaxed">{children}</p>
    </div>
  );
}

function Explainer({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 px-1">
      <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-ink-muted leading-relaxed">{children}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Data extraction — pull everything from the report once
   ═══════════════════════════════════════════════════════════ */

interface Gap { description: string; evidence: string; severity: string }
interface Fact { content: string; direct_quote: string; paper_title: string; location: string }
interface InsightGroup { title: string; items: string[] }
interface Direction { title: string; description: string }

interface Stats {
  totalPapers: number;
  totalFacts: number;
  totalGaps: number;
  totalVenues: number;
  factTypeData: Array<{ name: string; value: number }>;
  yearData: Array<{ year: string; papers: number }>;
  venueData: Array<{ name: string; count: number }>;
  topTerms: Array<{ term: string; count: number }>;
  gaps: Gap[];
  gapSeverityData: Array<{ name: string; value: number }>;
  sampleFacts: Fact[];
  insights: InsightGroup[];
  directions: Direction[];
  recommendations: string[];
}

function getStats(report: Report): Stats {
  let totalPapers = 0;
  let totalFacts = 0;
  let totalGaps = 0;
  let totalVenues = 0;
  const factTypeCounts: Record<string, number> = {};
  let yearDist: Record<string, number> = {};
  let venueDist: Record<string, number> = {};
  let topTermsRaw: Record<string, number> = {};
  const gaps: Gap[] = [];
  const sampleFacts: Fact[] = [];
  const insights: InsightGroup[] = [];
  const directions: Direction[] = [];
  const recommendations: string[] = [];

  for (const lr of report.lens_results) {
    const c = lr.content;

    // Evidence Table
    if (lr.lens === 'evidence_table') {
      totalFacts = (c.total_facts as number) || 0;
      totalPapers = (c.papers_with_evidence as number) || 0;
      const tables = (c.tables || {}) as Record<string, Array<Record<string, string>>>;
      for (const [type, facts] of Object.entries(tables)) {
        factTypeCounts[type] = (factTypeCounts[type] || 0) + facts.length;
        // Grab sample facts
        for (const f of facts.slice(0, 3)) {
          if (sampleFacts.length < 8) {
            sampleFacts.push({
              content: f.content || '',
              direct_quote: f.direct_quote || '',
              paper_title: f.paper_title || 'Unknown',
              location: f.location || '',
            });
          }
        }
      }
    }

    // Gap Discovery
    if (lr.lens === 'gap_discovery') {
      const rawGaps = (c.gaps || []) as Array<Record<string, string>>;
      for (const g of rawGaps) {
        gaps.push({
          description: g.description || '',
          evidence: g.evidence || '',
          severity: g.severity || 'low',
        });
      }
      totalGaps = gaps.length;
    }

    // Meta Analysis
    if (lr.lens === 'meta_analysis') {
      if (c.year_distribution) yearDist = c.year_distribution as Record<string, number>;
      if (c.venue_distribution) venueDist = c.venue_distribution as Record<string, number>;
      if (c.top_terms) topTermsRaw = c.top_terms as Record<string, number>;
      if (!totalPapers && c.total_papers) totalPapers = c.total_papers as number;
      if (!totalFacts && c.total_facts) totalFacts = c.total_facts as number;

      // Collect insights
      const freqStats = (c.frequency_stats || []) as Array<Record<string, string>>;
      const trends = (c.temporal_trends || []) as Array<Record<string, string>>;
      const concentrations = (c.concentration_patterns || []) as Array<Record<string, string>>;
      if (freqStats.length > 0)
        insights.push({ title: 'What stands out in the data', items: freqStats.map(extractText) });
      if (trends.length > 0)
        insights.push({ title: 'How the field is changing over time', items: trends.map(extractText) });
      if (concentrations.length > 0)
        insights.push({ title: 'Where research is concentrated', items: concentrations.map(extractText) });
    }

    // Venue Mapping
    if (lr.lens === 'venue_mapping') {
      const summary = c.venue_evidence_summary as Record<string, Record<string, unknown>> | undefined;
      if (summary) totalVenues = Object.keys(summary).length;
      // Venue-level insights
      const analysis = (c.venue_analysis || []) as Array<Record<string, unknown>>;
      for (const a of analysis) {
        const patterns = (a.patterns as string[]) || [];
        const diffs = (a.notable_differences as string[]) || [];
        const all = [...patterns, ...diffs];
        if (all.length > 0) {
          insights.push({ title: `About ${a.venue as string}`, items: all });
        }
      }
    }

    // Research Planning
    if (lr.lens === 'research_planning') {
      const rawDirs = (c.directions || []) as Array<Record<string, string>>;
      for (const d of rawDirs) {
        directions.push({
          title: d.area || d.direction || d.title || Object.values(d)[0] || '',
          description: d.rationale || d.description || d.reasoning || '',
        });
      }
      const rawRecs = (c.recommendations || []) as Array<Record<string, string>>;
      for (const r of rawRecs) {
        recommendations.push(r.text || r.recommendation || r.description || Object.values(r)[0] || '');
      }
      // Extra insights
      const expectations = (c.evaluation_expectations || []) as Array<Record<string, string> | string>;
      const patterns = (c.design_patterns || []) as Array<Record<string, string> | string>;
      if (expectations.length > 0)
        insights.push({ title: 'What the field expects from new research', items: expectations.map(extractTextMixed) });
      if (patterns.length > 0)
        insights.push({ title: 'Common research design patterns', items: patterns.map(extractTextMixed) });
    }
  }

  // Build chart data
  const factTypeData = Object.entries(factTypeCounts)
    .map(([name, value]) => ({ name: capitalize(name), value }))
    .sort((a, b) => b.value - a.value);

  const yearData = Object.entries(yearDist)
    .map(([year, papers]) => ({ year, papers }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const venueData = Object.entries(venueDist)
    .filter(([v]) => v && v !== 'Unknown' && v.trim() !== '')
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.length > 35 ? name.slice(0, 32) + '...' : name, count }))
    .sort((a, b) => b.count - a.count);

  const topTerms = Object.entries(topTermsRaw)
    .slice(0, 15)
    .map(([term, count]) => ({ term, count }));

  // Gap severity data
  const sevCounts: Record<string, number> = {};
  for (const g of gaps) {
    const sev = capitalize(g.severity || 'low');
    sevCounts[sev] = (sevCounts[sev] || 0) + 1;
  }
  const gapSeverityData = Object.entries(sevCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
      return (order[a.name] ?? 3) - (order[b.name] ?? 3);
    });

  return {
    totalPapers, totalFacts, totalGaps, totalVenues,
    factTypeData, yearData, venueData, topTerms,
    gaps, gapSeverityData, sampleFacts, insights, directions, recommendations,
  };
}

function extractText(item: Record<string, string>): string {
  return item.description || item.pattern || item.finding || item.observation || JSON.stringify(item);
}

function extractTextMixed(item: Record<string, string> | string): string {
  if (typeof item === 'string') return item;
  return extractText(item);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
