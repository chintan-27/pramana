import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  streamAnalysisProgress,
  approvePlan,
  getParsedQuery,
  confirmHypothesis,
  getCorpusPapers,
  confirmCorpus,
  type RunStatus,
  type PlanStep,
  type ExperimentPlan,
  type ParsedQuery,
  type CorpusPaper,
} from '../api/client';

/* ═══════════════════════════════════════════ stage defs ═══════ */

interface StageInfo { key: string; label: string; detail: string; }

const STAGES_LEGACY: StageInfo[] = [
  { key: 'parsing',      label: 'Parse hypothesis',      detail: 'Domains, topics, search queries' },
  { key: 'retrieval',    label: 'Fetch papers',           detail: 'Semantic Scholar, arXiv, PubMed' },
  { key: 'screening',    label: 'Screen for relevance',   detail: 'Embedding + LLM filter' },
  { key: 'extraction',   label: 'Extract evidence',       detail: 'Facts, quotes, locations' },
  { key: 'normalization',label: 'Normalize',              detail: 'Canonicalize terms, build vectors' },
  { key: 'analysis',     label: 'Run analysis flows',     detail: 'Routing to analytical lenses' },
  { key: 'report',       label: 'Generate report',        detail: 'Compile findings' },
];

const STAGES_AGENTIC: StageInfo[] = [
  { key: 'planning',     label: 'Plan experiment',        detail: 'Design analysis strategy' },
  { key: 'parsing',      label: 'Parse hypothesis',       detail: 'Domains, topics, search queries' },
  { key: 'retrieval',    label: 'Fetch papers',           detail: 'Semantic Scholar, arXiv, PubMed' },
  { key: 'screening',    label: 'Screen for relevance',   detail: 'Embedding + LLM filter' },
  { key: 'extraction',   label: 'Extract evidence',       detail: 'Facts, quotes, locations' },
  { key: 'normalization',label: 'Normalize',              detail: 'Canonicalize terms, build vectors' },
  { key: 'analysis',     label: 'Agent designing report', detail: 'Calling tools, structuring sections' },
  { key: 'report',       label: 'Assemble report',        detail: 'Package sections + tasks' },
];

/* ═══════════════════════════════════════════ helpers ═══════ */

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ─── inline plan approval ─── */

const STEP_COLORS: Record<string, string> = {
  pipeline: 'border-blue-500/25 bg-blue-500/6',
  lens:     'border-violet-500/25 bg-violet-500/6',
  code:     'border-amber/25 bg-amber/6',
  agent:    'border-emerald-500/25 bg-emerald-500/6',
};
const STEP_BADGE: Record<string, string> = {
  pipeline: 'text-blue-400',
  lens:     'text-violet-400',
  code:     'text-amber',
  agent:    'text-emerald-400',
};

function InlinePlanApproval({
  plan, onApprove,
}: { plan: ExperimentPlan; onApprove: (disabled: string[]) => void }) {
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) =>
    setDisabled(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const lenses = plan.steps.filter(s => s.type === 'lens').length - disabled.size;

  return (
    <div className="mt-6 rounded-xl border border-amber/20 bg-amber/4 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-amber/10">
        <p className="text-[10px] font-mono text-amber tracking-[0.2em] uppercase">Experiment Plan</p>
        <p className="text-sm text-cream mt-1">Review the planned analysis steps. Toggle lenses and code tasks on/off.</p>
        {plan.reasoning && (
          <p className="text-[12px] text-cream-muted mt-2 leading-relaxed italic">"{plan.reasoning}"</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {plan.steps.map(step => {
          const isDisabled = disabled.has(step.id);
          const canToggle = step.type === 'lens' || step.type === 'code';
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                isDisabled ? 'opacity-40 border-line/30' : (STEP_COLORS[step.type] || 'border-line/30')
              } ${canToggle ? 'cursor-pointer' : ''}`}
              onClick={canToggle ? () => toggle(step.id) : undefined}
            >
              <span className={`text-[10px] font-mono shrink-0 ${STEP_BADGE[step.type] || 'text-cream-faint'}`}>
                {step.type === 'code' ? '⟨/⟩' : step.type === 'lens' ? '◈' : step.type === 'agent' ? '✦' : '⚙'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-[12px] font-medium ${isDisabled ? 'line-through text-cream-faint' : 'text-cream'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-cream-faint truncate">{step.detail}</p>
              </div>
              {canToggle && (
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  isDisabled ? 'border-cream-faint/20' : 'border-emerald-500/40 bg-emerald-500/15'
                }`}>
                  {!isDisabled && <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                  </svg>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4 flex items-center justify-between">
        <span className="text-[11px] font-mono text-cream-faint">
          {lenses} lenses active
        </span>
        <button
          onClick={async () => { setSubmitting(true); await onApprove(Array.from(disabled)); }}
          disabled={submitting}
          className="px-4 py-2 bg-amber text-bg-deep rounded-lg text-[13px] font-medium hover:bg-amber-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Starting…' : 'Approve & Start'}
        </button>
      </div>
    </div>
  );
}

/* ─── inline hypothesis confirmation ─── */

function InlineConfirm({
  query, onConfirm,
}: { query: ParsedQuery; onConfirm: (q: ParsedQuery) => void }) {
  const [domains, setDomains] = useState(query.domains.join(', '));
  const [topics,  setTopics]  = useState(query.topics.join(', '));
  const [queries, setQueries] = useState(query.search_queries.join('\n'));
  const [saving,  setSaving]  = useState(false);

  return (
    <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/4 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-blue-500/10">
        <p className="text-[10px] font-mono text-blue-400 tracking-[0.2em] uppercase">Parsed Hypothesis</p>
        <p className="text-sm text-cream mt-1">Review or edit before fetching papers.</p>
      </div>
      <div className="px-4 py-3 space-y-3">
        {[
          { label: 'Domains', val: domains, set: setDomains, hint: 'Comma-separated' },
          { label: 'Topics',  val: topics,  set: setTopics,  hint: 'Comma-separated' },
        ].map(({ label, val, set, hint }) => (
          <div key={label}>
            <p className="text-[10px] font-mono text-cream-faint mb-1">{label} <span className="opacity-50">— {hint}</span></p>
            <input
              value={val}
              onChange={e => set(e.target.value)}
              className="w-full bg-bg-inset border border-line/50 rounded-lg px-3 py-1.5 text-[12px] text-cream focus:outline-none focus:border-blue-500/40"
            />
          </div>
        ))}
        <div>
          <p className="text-[10px] font-mono text-cream-faint mb-1">Search Queries <span className="opacity-50">— one per line</span></p>
          <textarea
            value={queries}
            onChange={e => setQueries(e.target.value)}
            rows={3}
            className="w-full bg-bg-inset border border-line/50 rounded-lg px-3 py-1.5 text-[12px] text-cream font-mono focus:outline-none focus:border-blue-500/40 resize-none"
          />
        </div>
      </div>
      <div className="px-4 pb-4 flex justify-end">
        <button
          onClick={async () => {
            setSaving(true);
            await onConfirm({
              ...query,
              domains: domains.split(',').map(s => s.trim()).filter(Boolean),
              topics:  topics.split(',').map(s => s.trim()).filter(Boolean),
              search_queries: queries.split('\n').map(s => s.trim()).filter(Boolean),
            });
          }}
          disabled={saving}
          className="px-4 py-2 bg-blue-500/80 text-white rounded-lg text-[13px] font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Confirmed…' : 'Confirm & Fetch Papers'}
        </button>
      </div>
    </div>
  );
}

/* ─── inline paper curation ─── */

function InlineCuration({
  papers, onConfirm,
}: { papers: CorpusPaper[]; onConfirm: (excluded: number[]) => void }) {
  const [excluded, setExcluded] = useState<Set<number>>(
    new Set(papers.filter(p => p.screened_out).map(p => p.db_id))
  );
  const [saving, setSaving] = useState(false);
  const toggle = (id: number) =>
    setExcluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const passed = papers.filter(p => !excluded.has(p.db_id)).length;

  return (
    <div className="mt-6 rounded-xl border border-violet-500/20 bg-violet-500/4 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-violet-500/10">
        <p className="text-[10px] font-mono text-violet-400 tracking-[0.2em] uppercase">Paper Curation</p>
        <p className="text-sm text-cream mt-1">{passed} of {papers.length} papers selected. Uncheck to exclude.</p>
      </div>
      <div className="max-h-[280px] overflow-y-auto px-4 py-2 space-y-1">
        {papers.map(p => {
          const isExcluded = excluded.has(p.db_id);
          return (
            <div
              key={p.db_id}
              className={`flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-opacity ${isExcluded ? 'opacity-35' : ''}`}
              onClick={() => toggle(p.db_id)}
            >
              <div className={`w-4 h-4 mt-0.5 shrink-0 rounded border flex items-center justify-center ${
                isExcluded ? 'border-cream-faint/20' : 'border-violet-500/40 bg-violet-500/15'
              }`}>
                {!isExcluded && <svg className="w-2.5 h-2.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-cream leading-snug">{p.title}</p>
                <p className="text-[10px] text-cream-faint mt-0.5">
                  {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''} · {p.year ?? '?'} · {p.venue || p.source}
                  {p.screened_out && <span className="ml-2 text-rose/70">{p.screening_reason || 'Filtered'}</span>}
                </p>
              </div>
              {p.relevance_score > 0 && (
                <span className="text-[9px] font-mono text-cream-faint/50 shrink-0">
                  {Math.round(p.relevance_score * 100)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-4 flex items-center justify-between border-t border-violet-500/10 pt-3 mt-1">
        <span className="text-[11px] font-mono text-cream-faint">{passed} papers selected</span>
        <button
          onClick={async () => { setSaving(true); await onConfirm(Array.from(excluded)); }}
          disabled={saving}
          className="px-4 py-2 bg-violet-500/80 text-white rounded-lg text-[13px] font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Starting…' : 'Confirm & Extract'}
        </button>
      </div>
    </div>
  );
}

/* ─── terminal box ─── */

function TerminalBox({ lines, termRef }: { lines: string[]; termRef: React.RefObject<HTMLDivElement | null> }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-line/20 overflow-hidden bg-[#080808]">
      <div ref={termRef} className="max-h-[160px] overflow-y-auto px-3 py-2 space-y-0.5 scroll-smooth">
        {lines.map((line, i) => {
          const tab = line.indexOf('\t');
          const time = tab > -1 ? line.slice(0, tab) : '';
          const text = tab > -1 ? line.slice(tab + 1) : line;
          return (
            <div key={i} className="flex gap-2 text-[11px] leading-relaxed font-mono">
              {time && <span className="shrink-0 text-cream-faint/30">{time}</span>}
              <span className="text-green-400/75 break-all">{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── stage summary chips ─── */

function StageSummaryChips({ stage, progress }: { stage: StageInfo; progress: Record<string, unknown> }) {
  if (stage.key === 'retrieval' && progress.papers_found != null) {
    const s = progress.sources as Record<string, number> | undefined;
    return <span className="text-[10px] font-mono text-cream-faint/70">
      {String(progress.papers_found)} found{s ? ` · S2=${s.s2??0} arXiv=${s.arxiv??0}` : ''}
    </span>;
  }
  if (stage.key === 'screening' && progress.papers_passed != null)
    return <span className="text-[10px] font-mono text-cream-faint/70">{String(progress.papers_passed)} passed · {String(progress.papers_screened_out??0)} filtered</span>;
  if (stage.key === 'extraction' && progress.facts_extracted != null)
    return <span className="text-[10px] font-mono text-cream-faint/70">{String(progress.facts_extracted)} facts</span>;
  if (stage.key === 'normalization' && progress.mappings != null)
    return <span className="text-[10px] font-mono text-cream-faint/70">{String(progress.mappings)} mappings</span>;
  if ((stage.key === 'analysis' || stage.key === 'report') && progress.sections_designed != null)
    return <span className="text-[10px] font-mono text-cream-faint/70">{String(progress.sections_designed)} sections · {String(progress.tasks_proposed??0)} tasks</span>;
  return null;
}

/* ═══════════════════════════════════════════ main ═══════════ */

type PauseMode = null | 'plan' | 'confirm' | 'curate';

export default function AnalysisProgress() {
  const { runId } = useParams<{ runId: string }>();
  const navigate  = useNavigate();

  const [status,      setStatus]      = useState<RunStatus | null>(null);
  const [error,       setError]       = useState('');
  const [isAgentic,   setIsAgentic]   = useState(false);
  const [stageLogs,   setStageLogs]   = useState<Record<string, string[]>>({});
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const [planSteps,   setPlanSteps]   = useState<PlanStep[]>([]);
  const [liveStatus,  setLiveStatus]  = useState('Connecting...');
  const [streamKey,   setStreamKey]   = useState(0);   // increment → restart SSE

  // Pause-mode state
  const [pauseMode,    setPauseMode]   = useState<PauseMode>(null);
  const [inlinePlan,   setInlinePlan]  = useState<ExperimentPlan | null>(null);
  const [parsedQuery,  setParsedQuery] = useState<ParsedQuery | null>(null);
  const [corpusPapers, setCorpusPapers]= useState<CorpusPaper[] | null>(null);

  const termRefs   = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});
  const lastProgRef= useRef<Record<string, unknown>>({});
  const lastStageRef= useRef('');

  const getTermRef = (key: string) => {
    if (!termRefs.current[key]) termRefs.current[key] = { current: null };
    return termRefs.current[key];
  };

  const addLine = (stage: string, text: string) => {
    setStageLogs(prev => ({
      ...prev,
      [stage]: [...(prev[stage] ?? []).slice(-80), `${ts()}\t${text}`],
    }));
    setLiveStatus(text);
  };

  // Auto-scroll each terminal box
  useEffect(() => {
    for (const key of Object.keys(stageLogs)) {
      termRefs.current[key]?.current?.scrollTo({ top: 99999, behavior: 'smooth' });
    }
  }, [stageLogs]);

  // SSE stream — restarts when streamKey changes
  useEffect(() => {
    if (!runId) return;
    if (pauseMode !== null) return;   // don't open stream while paused
    setLiveStatus('Connecting...');

    const es = streamAnalysisProgress(runId, (data) => {
      setStatus(data);
      const prog = data.progress as Record<string, unknown>;
      const prev = lastProgRef.current;

      if (prog?.mode === 'agentic') setIsAgentic(true);

      if (prog?.plan) {
        const p = prog.plan as { steps?: PlanStep[] };
        if (p.steps) setPlanSteps(p.steps);
      }

      const stage = data.stage ?? '';

      // Stage transition
      if (stage && stage !== lastStageRef.current) {
        lastStageRef.current = stage;
        const desc = typeof prog?.description === 'string' ? prog.description : stage;
        addLine(stage, `→ ${desc}`);
      }

      // Retrieval: partial source counts stream in
      if (prog?.sources && JSON.stringify(prog.sources) !== JSON.stringify(prev.sources)) {
        const s = prog.sources as Record<string, number>;
        const total = Object.values(s).reduce((a, b) => a + b, 0);
        if (total > 0) addLine(stage, `S2=${s.s2??0}  arXiv=${s.arxiv??0}  PubMed=${s.pubmed??0}  CrossRef=${s.crossref??0}`);
      }

      // Screening result
      if (prog?.papers_passed != null && prev.papers_passed == null)
        addLine(stage, `${prog.papers_passed} passed · ${prog.papers_screened_out??0} filtered`);

      // Extraction per-paper
      if (prog?.current_paper && typeof prog.current_paper === 'string' && prog.current_paper !== prev.current_paper)
        addLine(stage, `(${prog.papers_processed}/${prog.papers_total})  ${(prog.current_paper as string).slice(0, 55)}…`);

      // Normalization
      if (prog?.mappings != null && prev.mappings == null)
        addLine(stage, `${prog.mappings} canonical mappings · ${prog.categories??0} categories`);

      // New section titles
      if (prog?.section_titles && Array.isArray(prog.section_titles)) {
        const prevT = (prev.section_titles as string[] | undefined) ?? [];
        for (const t of (prog.section_titles as string[]).slice(prevT.length))
          addLine(stage, `Designed: "${t}"`);
      }

      // New task titles
      if (prog?.task_titles && Array.isArray(prog.task_titles)) {
        const prevT = (prev.task_titles as string[] | undefined) ?? [];
        for (const t of (prog.task_titles as string[]).slice(prevT.length))
          addLine(stage, `Task: "${t}"`);
      }

      lastProgRef.current = { ...prog };

      // Terminal states
      if (data.status === 'completed') {
        es.close();
        setLiveStatus('Complete! Loading report…');
        setTimeout(() => navigate(`/report/${runId}`), 800);
      } else if (data.status === 'awaiting_plan_approval') {
        es.close();
        setInlinePlan((prog?.plan as ExperimentPlan) ?? null);
        setPauseMode('plan');
        setLiveStatus('Waiting for plan approval…');
      } else if (data.status === 'awaiting_confirmation') {
        es.close();
        setPauseMode('confirm');
        setLiveStatus('Review parsed hypothesis…');
        getParsedQuery(runId).then(r => setParsedQuery(r.parsed_query)).catch(() => {});
      } else if (data.status === 'awaiting_curation') {
        es.close();
        setPauseMode('curate');
        setLiveStatus('Select papers to include…');
        getCorpusPapers(runId).then(r => setCorpusPapers(r.papers)).catch(() => {});
      } else if (data.status === 'failed') {
        es.close();
        setError(data.error || 'Analysis failed');
        setLiveStatus(`Failed: ${data.error || 'unknown'}`);
      }
    }, () => {
      if (!error) {
        setError('Lost connection to server');
        setLiveStatus('Connection lost');
      }
    });

    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, navigate, streamKey, pauseMode]);

  // Approval handlers
  const handleApprovePlan = useCallback(async (disabled: string[]) => {
    if (!runId) return;
    await approvePlan(runId, disabled);
    setPauseMode(null);
    setInlinePlan(null);
    setStreamKey(k => k + 1);
  }, [runId]);

  const handleConfirmHypothesis = useCallback(async (q: ParsedQuery) => {
    if (!runId) return;
    await confirmHypothesis(runId, { domains: q.domains, topics: q.topics, search_queries: q.search_queries });
    setPauseMode(null);
    setParsedQuery(null);
    setStreamKey(k => k + 1);
  }, [runId]);

  const handleConfirmCorpus = useCallback(async (excluded: number[]) => {
    if (!runId) return;
    await confirmCorpus(runId, excluded);
    setPauseMode(null);
    setCorpusPapers(null);
    setStreamKey(k => k + 1);
  }, [runId]);

  const STAGES   = isAgentic ? STAGES_AGENTIC : STAGES_LEGACY;
  const currentIdx = status ? STAGES.findIndex(s => s.key === status.stage) : -1;
  const progress   = (status?.progress || {}) as Record<string, unknown>;
  const taskTitles = (progress.task_titles as string[] | undefined) ?? [];

  const toggleExpand = (key: string) =>
    setExpandedDone(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="mt-4 animate-fade-up max-w-xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-2">
          {isAgentic ? 'Experiment Running' : 'Pipeline Running'}
        </p>
        <h1 className="font-display text-2xl text-cream font-300 tracking-tight">Analysis in progress</h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-rose-subtle border border-rose/20 rounded-lg">
          <p className="font-medium text-rose text-sm">Analysis Failed</p>
          <p className="text-sm text-rose/70 mt-1">{error}</p>
          <button onClick={() => navigate('/')} className="mt-3 text-sm font-medium text-amber hover:text-amber-glow">Try again</button>
        </div>
      )}

      {/* Stats bar */}
      {progress.papers_found !== undefined && (
        <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] font-mono">
          <span><strong className="text-xl font-display text-cream">{String(progress.papers_found)}</strong><span className="text-cream-faint ml-1.5">papers</span></span>
          {progress.facts_extracted != null && <span><strong className="text-xl font-display text-cream">{String(progress.facts_extracted)}</strong><span className="text-cream-faint ml-1.5">facts</span></span>}
          {progress.sections_designed != null && <span><strong className="text-xl font-display text-amber">{String(progress.sections_designed)}</strong><span className="text-amber/60 ml-1.5">sections</span></span>}
          {progress.tasks_proposed != null && <span><strong className="text-xl font-display text-violet-400">{String(progress.tasks_proposed)}</strong><span className="text-violet-400/60 ml-1.5">tasks</span></span>}
        </div>
      )}

      {/* Stage list */}
      <div className="space-y-0">
        {STAGES.map((stage, i) => {
          const isActive  = i === currentIdx;
          const isDone    = i < currentIdx;
          const isPending = i > currentIdx;
          const isLast    = i === STAGES.length - 1;
          const isExpanded= isActive || expandedDone.has(stage.key);
          const logs      = stageLogs[stage.key] ?? [];
          const termRef   = getTermRef(stage.key);

          return (
            <div key={stage.key} className="flex gap-3">
              {/* Left: circle + connector */}
              <div className="flex flex-col items-center" style={{ width: 36 }}>
                <div className="shrink-0 mt-0.5">
                  {isDone ? (
                    <div className="w-9 h-9 rounded-full bg-teal/10 border border-teal/25 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-9 h-9 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-amber animate-pulse"/>
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-bg-card border border-line/40 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-cream-faint/20"/>
                    </div>
                  )}
                </div>
                {!isLast && <div className={`w-px flex-1 min-h-[1.5rem] transition-colors duration-500 ${isDone ? 'bg-teal/20' : 'bg-line/20'}`}/>}
              </div>

              {/* Right: content */}
              <div className={`flex-1 min-w-0 pb-5 ${isLast ? 'pb-0' : ''}`}>
                <div
                  className={`flex items-center gap-2 pt-1 ${isDone ? 'cursor-pointer' : ''}`}
                  onClick={isDone ? () => toggleExpand(stage.key) : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-[13px] font-medium ${isActive ? 'text-amber' : isDone ? 'text-cream' : 'text-cream-faint/40'}`}>
                        {stage.label}
                      </span>
                      {isDone && <StageSummaryChips stage={stage} progress={progress}/>}
                      {isPending && <span className="text-[11px] text-cream-faint/30">{stage.detail}</span>}
                    </div>
                  </div>

                  {/* Extraction progress bar */}
                  {isActive && stage.key === 'extraction' && progress.papers_total != null && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-24 h-1 bg-line/40 rounded-full overflow-hidden">
                        <div className="h-full bg-amber rounded-full transition-all duration-500"
                          style={{ width: `${Math.round(((progress.papers_processed as number)/(progress.papers_total as number))*100)}%` }}/>
                      </div>
                      <span className="text-[10px] font-mono text-cream-faint/60">{String(progress.papers_processed)}/{String(progress.papers_total)}</span>
                    </div>
                  )}

                  {/* Chevron for done stages with logs */}
                  {isDone && logs.length > 0 && (
                    <svg className={`w-3.5 h-3.5 text-cream-faint/30 shrink-0 transition-transform ${expandedDone.has(stage.key) ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  )}
                </div>

                {/* Section titles (agentic analysis) */}
                {(isActive || isDone) && stage.key === 'analysis' && progress.section_titles && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(progress.section_titles as string[]).map((t, j) => (
                      <span key={j} className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">{t}</span>
                    ))}
                  </div>
                )}

                {/* Terminal log box */}
                {isExpanded && logs.length > 0 && <TerminalBox lines={logs} termRef={termRef}/>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pause mode inline panels ── */}
      {pauseMode === 'plan' && inlinePlan && (
        <InlinePlanApproval plan={inlinePlan} onApprove={handleApprovePlan}/>
      )}
      {pauseMode === 'confirm' && parsedQuery && (
        <InlineConfirm query={parsedQuery} onConfirm={handleConfirmHypothesis}/>
      )}
      {pauseMode === 'confirm' && !parsedQuery && (
        <div className="mt-6 flex items-center gap-2 text-sm text-cream-faint">
          <div className="w-4 h-4 border-2 border-blue-500/40 border-t-transparent rounded-full animate-spin"/>
          Loading parsed hypothesis…
        </div>
      )}
      {pauseMode === 'curate' && corpusPapers && (
        <InlineCuration papers={corpusPapers} onConfirm={handleConfirmCorpus}/>
      )}
      {pauseMode === 'curate' && !corpusPapers && (
        <div className="mt-6 flex items-center gap-2 text-sm text-cream-faint">
          <div className="w-4 h-4 border-2 border-violet-500/40 border-t-transparent rounded-full animate-spin"/>
          Loading papers…
        </div>
      )}

      {/* ── Proposed code tasks (once designed) ── */}
      {taskTitles.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber/20 bg-amber/4 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber/10 flex items-center gap-2">
            <span className="text-[10px] font-mono text-amber tracking-[0.2em] uppercase">Code Tasks Proposed</span>
            <span className="text-[10px] font-mono text-amber/60">— available in report</span>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            {taskTitles.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-amber/50">⟨/⟩</span>
                <span className="text-cream-dim">{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Planned lens badges */}
      {planSteps.filter(s => s.type === 'lens').length > 0 && (
        <div className="mt-4 p-3 rounded-xl border border-line/30 bg-bg-card">
          <p className="text-[10px] font-mono text-cream-faint/50 tracking-wider uppercase mb-2">Planned lenses</p>
          <div className="flex flex-wrap gap-1.5">
            {planSteps.filter(s => s.type === 'lens').map(s => (
              <span key={s.id} className="px-2 py-0.5 text-[10px] font-mono rounded bg-violet-500/8 text-violet-400 border border-violet-500/20">{s.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Live status */}
      <div className="mt-8 flex items-center gap-2">
        {!error && <div className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse shrink-0"/>}
        <p className="text-[11px] font-mono text-cream-faint/60 truncate">{liveStatus}</p>
      </div>

      <div className="mt-3">
        <span className="text-[10px] font-mono text-cream-faint/25">{runId}</span>
      </div>
    </div>
  );
}
