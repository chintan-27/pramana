import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Report, FlowResult } from '../api/client';
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

function FlowCard({ flowName, fr, idx }: { flowName: string; fr: FlowResult; idx: number }) {
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
