import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  streamAnalysisProgress,
  approvePlan,
  type PlanStep,
  type ExperimentPlan,
} from '../api/client';

/* ═══════════════════════════════════════════ step icons ═══════ */

const STEP_ICONS: Record<string, string> = {
  pipeline: '⚙',
  lens: '🔬',
  code: '⟨/⟩',
  agent: '✦',
};

const STEP_COLORS: Record<string, string> = {
  pipeline: 'border-blue-500/30 bg-blue-500/8',
  lens: 'border-violet-500/30 bg-violet-500/8',
  code: 'border-amber/30 bg-amber/8',
  agent: 'border-emerald-500/30 bg-emerald-500/8',
};

const STEP_BADGE: Record<string, string> = {
  pipeline: 'bg-blue-500/15 text-blue-400',
  lens: 'bg-violet-500/15 text-violet-400',
  code: 'bg-amber/15 text-amber',
  agent: 'bg-emerald-500/15 text-emerald-400',
};

/* ═══════════════════════════════════════════ main page ═══════ */

export default function ExperimentPlanner() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<ExperimentPlan | null>(null);
  const [disabledSteps, setDisabledSteps] = useState<Set<string>>(new Set());
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  /* poll SSE until plan_ready or status changes */
  useEffect(() => {
    if (!runId) return;

    const es = streamAnalysisProgress(
      runId,
      (data) => {
        const progress = data.progress || {};
        if (progress.plan_ready && progress.plan) {
          const p = progress.plan as ExperimentPlan;
          setPlan(p);
          setReasoning(p.reasoning || '');
        }
        // If pipeline moved past planning, navigate to progress
        if (
          data.status === 'running' &&
          data.stage !== 'planning' &&
          data.stage !== 'awaiting_plan_approval'
        ) {
          navigate(`/analysis/${runId}`, { replace: true });
        }
      },
      () => {},
    );

    return () => es.close();
  }, [runId, navigate]);

  /* auto-continue timer: show notice after 25s */
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 25000);
    return () => clearTimeout(timer);
  }, []);

  const toggleStep = (stepId: string) => {
    setDisabledSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!runId) return;
    setSubmitting(true);
    try {
      await approvePlan(runId, Array.from(disabledSteps));
      navigate(`/analysis/${runId}`);
    } catch {
      setSubmitting(false);
    }
  };

  /* ─── loading state ─── */
  if (!plan) {
    return (
      <div className="mt-16 flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-cream-muted">Planning experiment...</p>
      </div>
    );
  }

  /* ─── plan view ─── */
  const lensSteps = plan.steps.filter((s) => s.type === 'lens');
  const codeSteps = plan.steps.filter((s) => s.type === 'code');
  const pipelineSteps = plan.steps.filter(
    (s) => s.type === 'pipeline' || s.type === 'agent',
  );

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      {/* header */}
      <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-2">
        Experiment Plan
      </p>
      <h1 className="text-2xl font-display font-600 text-cream mb-4">
        Review your analysis plan
      </h1>

      {/* reasoning */}
      {reasoning && (
        <div className="mb-6 p-4 rounded-xl border border-amber/20 bg-amber/5">
          <p className="text-[11px] font-mono text-amber tracking-wider uppercase mb-1">
            Agent reasoning
          </p>
          <p className="text-[13px] text-cream-muted leading-relaxed">
            {reasoning}
          </p>
        </div>
      )}

      {/* flowchart */}
      <div className="space-y-0 mb-8">
        {plan.steps.map((step, i) => {
          const isDisabled = disabledSteps.has(step.id);
          const canToggle = step.type === 'lens' || step.type === 'code';
          const isLast = i === plan.steps.length - 1;

          return (
            <div key={step.id} className="relative">
              {/* connector line */}
              {!isLast && (
                <div className="absolute left-5 top-[3.25rem] w-px h-4 bg-line/60" />
              )}

              {/* step node */}
              <div
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${
                  isDisabled
                    ? 'opacity-40 border-line/30 bg-bg-inset'
                    : STEP_COLORS[step.type] || 'border-line bg-bg-card'
                } ${canToggle ? 'cursor-pointer hover:shadow-sm' : ''}`}
                onClick={canToggle ? () => toggleStep(step.id) : undefined}
              >
                {/* icon circle */}
                <div
                  className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm ${
                    isDisabled ? 'bg-bg-hover text-cream-faint' : 'bg-bg-card text-cream'
                  }`}
                >
                  {STEP_ICONS[step.type] || '•'}
                </div>

                {/* text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[14px] font-medium ${
                        isDisabled ? 'text-cream-faint line-through' : 'text-cream'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        STEP_BADGE[step.type] || 'bg-bg-hover text-cream-faint'
                      }`}
                    >
                      {step.type}
                    </span>
                  </div>
                  <p
                    className={`text-[12px] mt-0.5 ${
                      isDisabled ? 'text-cream-faint' : 'text-cream-muted'
                    }`}
                  >
                    {step.detail}
                  </p>
                </div>

                {/* toggle indicator */}
                {canToggle && (
                  <div className="shrink-0 mt-1">
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        isDisabled
                          ? 'border-cream-faint/30'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      {!isDisabled && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* spacer for connector */}
              {!isLast && <div className="h-4" />}
            </div>
          );
        })}
      </div>

      {/* summary */}
      <div className="flex items-center gap-4 text-[12px] text-cream-muted mb-6 font-mono">
        <span>{pipelineSteps.length} pipeline steps</span>
        <span className="text-line">|</span>
        <span className="text-violet-400">{lensSteps.length - disabledSteps.size} lenses active</span>
        {codeSteps.length > 0 && (
          <>
            <span className="text-line">|</span>
            <span className="text-amber">{codeSteps.length} code tasks</span>
          </>
        )}
      </div>

      {/* timed out warning */}
      {timedOut && (
        <p className="text-[11px] text-cream-faint mb-3">
          Auto-continuing in a few seconds...
        </p>
      )}

      {/* approve button */}
      <button
        onClick={handleApprove}
        disabled={submitting}
        className="w-full py-3 rounded-xl font-medium text-[14px] transition-all duration-200 bg-amber text-bg-deep hover:bg-amber-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Starting...' : 'Approve & Start Experiment'}
      </button>
    </div>
  );
}
