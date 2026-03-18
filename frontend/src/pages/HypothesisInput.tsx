import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis } from '../api/client';

const INITIATION_TYPES = [
  { value: 'new', label: 'New Project', desc: 'Starting fresh research', icon: '✦' },
  { value: 'related', label: 'Related Work', desc: 'Exploring adjacent work', icon: '↗' },
  { value: 'continuation', label: 'Continuation', desc: 'Continuing prior research', icon: '→' },
  { value: 'joining', label: 'RA Joining', desc: 'Joining existing project', icon: '⊕' },
];

export default function HypothesisInput() {
  const navigate = useNavigate();
  const [hypothesis, setHypothesis] = useState('');
  const [initiationType, setInitiationType] = useState('new');
  const [maxPapers, setMaxPapers] = useState(50);
  const [priorResearch, setPriorResearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showPriorResearch = initiationType === 'related' || initiationType === 'continuation';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hypothesis.trim()) return;

    setLoading(true);
    setError('');
    try {
      const result = await startAnalysis({
        hypothesis: hypothesis.trim(),
        initiation_type: initiationType,
        max_papers: maxPapers,
        prior_research: priorResearch.trim() || undefined,
      });
      navigate(`/analysis/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pt-8 sm:pt-16">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold text-ink tracking-tight leading-tight">
          Analyze scientific
          <br />
          <span className="text-accent">literature</span>
        </h1>
        <p className="mt-4 text-ink-muted text-lg max-w-md mx-auto leading-relaxed">
          Enter a research hypothesis. Pramana gathers papers, extracts evidence,
          and synthesizes findings through composable analytical lenses.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Hypothesis textarea */}
        <div className="relative">
          <label htmlFor="hypothesis" className="block text-sm font-medium text-ink mb-2">
            Research Hypothesis
          </label>
          <textarea
            id="hypothesis"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g., External validation is underreported in deep learning studies for medical imaging diagnostics"
            className="w-full h-36 p-4 bg-surface-raised border border-border rounded-xl text-ink placeholder:text-ink-muted/50 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-[15px] leading-relaxed"
            required
          />
          <span className="absolute bottom-3 right-3 text-[11px] text-ink-muted/40 font-mono">
            {hypothesis.length > 0 ? `${hypothesis.length} chars` : ''}
          </span>
        </div>

        {/* Initiation type */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Research Context
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {INITIATION_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setInitiationType(type.value)}
                className={`p-3 text-left rounded-xl border transition-all ${
                  initiationType === type.value
                    ? 'border-accent bg-accent-subtle ring-1 ring-accent/20'
                    : 'border-border bg-surface-raised hover:border-border-strong'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${
                    initiationType === type.value ? 'text-accent' : 'text-ink-muted'
                  }`}>
                    {type.icon}
                  </span>
                  <span className={`font-medium text-sm ${
                    initiationType === type.value ? 'text-accent' : 'text-ink'
                  }`}>
                    {type.label}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1 ml-6">{type.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Prior research context */}
        {showPriorResearch && (
          <div className="relative">
            <label htmlFor="priorResearch" className="block text-sm font-medium text-ink mb-1">
              Your Existing Research
              <span className="text-ink-muted font-normal ml-1">(optional)</span>
            </label>
            <p className="text-xs text-ink-muted mb-2">
              Paste your abstract, key findings, or a summary of your prior work.
              This helps us find more relevant papers and tailor the analysis.
            </p>
            <textarea
              id="priorResearch"
              value={priorResearch}
              onChange={(e) => setPriorResearch(e.target.value)}
              placeholder={
                initiationType === 'related'
                  ? 'e.g., Our recent paper showed that transformer models outperform CNNs for retinal image classification with AUC 0.94 on the DRIVE dataset...'
                  : 'e.g., In our Phase 1 study we established a baseline using ResNet-50 on ADNI data achieving 89% accuracy for AD vs CN classification...'
              }
              className="w-full h-28 p-4 bg-surface-raised border border-border rounded-xl text-ink placeholder:text-ink-muted/40 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-sm leading-relaxed"
            />
            <span className="absolute bottom-3 right-3 text-[11px] text-ink-muted/40 font-mono">
              {priorResearch.length > 0 ? `${priorResearch.length} chars` : ''}
            </span>
          </div>
        )}

        {/* Max papers slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="maxPapers" className="text-sm font-medium text-ink">
              Corpus Size
            </label>
            <span className="text-sm font-mono text-accent font-medium">{maxPapers} papers</span>
          </div>
          <input
            id="maxPapers"
            type="range"
            min="10"
            max="200"
            step="10"
            value={maxPapers}
            onChange={(e) => setMaxPapers(Number(e.target.value))}
            className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[11px] text-ink-muted mt-1">
            <span>10</span>
            <span>Quick scan</span>
            <span>Thorough</span>
            <span>200</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-danger-subtle border border-danger/20 rounded-xl text-danger text-sm">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="M12 8v4m0 4h.01" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !hypothesis.trim()}
          className="w-full py-3.5 bg-accent text-white rounded-xl font-medium hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[15px] shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/20"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin-slow w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Starting analysis…
            </span>
          ) : (
            'Analyze Literature'
          )}
        </button>
      </form>

      {/* Features */}
      <div className="mt-16 grid grid-cols-3 gap-6 text-center">
        {[
          { label: 'Evidence Extraction', detail: 'Direct quotes with source locations' },
          { label: 'Gap Discovery', detail: 'Identify blind spots in the corpus' },
          { label: 'Research Planning', detail: 'Grounded direction suggestions' },
        ].map((f) => (
          <div key={f.label}>
            <p className="text-sm font-medium text-ink">{f.label}</p>
            <p className="text-xs text-ink-muted mt-1">{f.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
