import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis, uploadPdf, buildHypothesis, exploreSamplePapers, suggestHypotheses, type PdfUploadResult } from '../api/client';

const TYPES = [
  { value: 'new', label: 'New Research', desc: 'Starting a fresh investigation' },
  { value: 'related', label: 'Related Work', desc: 'Exploring adjacent literature' },
  { value: 'continuation', label: 'Continuation', desc: 'Extending prior research' },
  { value: 'joining', label: 'Joining Team', desc: 'Onboarding to existing project' },
];

export default function HypothesisInput() {
  const navigate = useNavigate();
  const [hypothesis, setHypothesis] = useState('');
  const [action, setAction] = useState('');
  const [type, setType] = useState('new');
  const [maxPapers, setMaxPapers] = useState(50);
  const [priorResearch, setPriorResearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadedPdfs, setUploadedPdfs] = useState<PdfUploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PICO builder
  const [showPico, setShowPico] = useState(false);
  const [pico, setPico] = useState({ population: '', intervention: '', comparison: '', outcome: '', domain: '' });
  const [picoLoading, setPicoLoading] = useState(false);

  // Explore wizard
  const [exploreMode, setExploreMode] = useState(false);
  const [exploreStep, setExploreStep] = useState(1);
  const [exploreField, setExploreField] = useState('');
  const [explorePapers, setExplorePapers] = useState<Array<{ title: string; abstract: string; year: number | null }>>([]);
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const [suggestedHyps, setSuggestedHyps] = useState<string[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);

  const showPrior = type === 'related' || type === 'continuation';

  const handlePicoGenerate = async () => {
    if (!pico.population || !pico.intervention || !pico.outcome) return;
    setPicoLoading(true);
    try {
      const { hypothesis: h } = await buildHypothesis(pico.population, pico.intervention, pico.comparison, pico.outcome, pico.domain);
      setHypothesis(h);
      setShowPico(false);
    } catch { /* ignore */ } finally {
      setPicoLoading(false);
    }
  };

  const handleExploreFetch = async () => {
    if (!exploreField.trim()) return;
    setExploreLoading(true);
    try {
      const { papers } = await exploreSamplePapers(exploreField);
      setExplorePapers(papers);
      setExploreStep(2);
    } catch { /* ignore */ } finally {
      setExploreLoading(false);
    }
  };

  const handleExploreSuggest = async () => {
    if (selectedTitles.size === 0) return;
    setExploreLoading(true);
    try {
      const { hypotheses } = await suggestHypotheses(exploreField, Array.from(selectedTitles));
      setSuggestedHyps(hypotheses);
      setExploreStep(3);
    } catch { /* ignore */ } finally {
      setExploreLoading(false);
    }
  };

  const handleExploreSelect = (h: string) => {
    setHypothesis(h);
    setExploreMode(false);
    setExploreStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hypothesis.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await startAnalysis({
        hypothesis: hypothesis.trim(),
        initiation_type: type,
        max_papers: maxPapers,
        prior_research: priorResearch.trim() || undefined,
        pdf_file_ids: uploadedPdfs.length > 0 ? uploadedPdfs.map((p) => p.file_id) : undefined,
        action: action.trim() || undefined,
      });
      navigate(`/analysis/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadPdf(file);
        setUploadedPdfs((prev) => [...prev, result]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePdf = (fileId: string) => {
    setUploadedPdfs((prev) => prev.filter((p) => p.file_id !== fileId));
  };

  return (
    <div className="max-w-xl mx-auto pt-12 sm:pt-20 animate-fade-up">
      {/* Hero */}
      <div className="mb-12">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-4">
          Research Assistant
        </p>
        <h1 className="font-display text-[40px] sm:text-[52px] font-300 text-cream leading-[1.1] tracking-tight">
          What would you
          <br />
          like to <em className="font-400 text-amber">investigate</em>?
        </h1>
        <p className="mt-5 text-cream-muted text-[15px] leading-relaxed max-w-md">
          Pramana is a hypothesis-driven research assistant that gathers papers,
          extracts structured evidence with direct quotes, and synthesizes
          findings through composable analytical lenses.
        </p>
      </div>

      {/* ── Explore wizard ── */}
      {exploreMode && (
        <div className="mb-8 rounded-xl border border-amber/20 bg-amber-subtle/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber/15 flex items-center justify-between">
            <p className="text-[11px] font-mono text-amber tracking-widest uppercase">Explore a Field</p>
            <button type="button" onClick={() => setExploreMode(false)} className="text-cream-faint hover:text-cream text-lg">×</button>
          </div>

          {exploreStep === 1 && (
            <div className="p-5 space-y-3">
              <p className="text-sm text-cream-muted">What area are you curious about?</p>
              <input
                type="text"
                value={exploreField}
                onChange={(e) => setExploreField(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleExploreFetch(); } }}
                placeholder="e.g. AI in cancer imaging, antibiotic resistance, transformer interpretability"
                className="w-full px-3 py-2.5 bg-bg-card border border-line rounded-lg text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:border-amber/50"
              />
              <button type="button" onClick={handleExploreFetch} disabled={exploreLoading || !exploreField.trim()}
                className="w-full py-2.5 bg-amber text-bg text-sm font-medium rounded-lg hover:bg-amber-glow transition-colors disabled:opacity-40">
                {exploreLoading ? 'Fetching papers…' : 'Show me papers →'}
              </button>
            </div>
          )}

          {exploreStep === 2 && (
            <div className="p-5 space-y-3">
              <p className="text-sm text-cream-muted">Select papers that interest you:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {explorePapers.map((p, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTitles.has(p.title) ? 'border-amber/40 bg-amber-subtle/40' : 'border-line bg-bg-card hover:border-line-strong'}`}>
                    <input type="checkbox" checked={selectedTitles.has(p.title)} onChange={() => {
                      setSelectedTitles((prev) => { const n = new Set(prev); if (n.has(p.title)) n.delete(p.title); else n.add(p.title); return n; });
                    }} className="mt-0.5 accent-amber" />
                    <div>
                      <p className="text-[13px] font-medium text-cream leading-snug">{p.title}</p>
                      {p.year && <p className="text-[11px] text-cream-faint font-mono mt-0.5">{p.year}</p>}
                    </div>
                  </label>
                ))}
              </div>
              <button type="button" onClick={handleExploreSuggest} disabled={exploreLoading || selectedTitles.size === 0}
                className="w-full py-2.5 bg-amber text-bg text-sm font-medium rounded-lg hover:bg-amber-glow transition-colors disabled:opacity-40">
                {exploreLoading ? 'Generating…' : `Suggest hypotheses (${selectedTitles.size} selected)`}
              </button>
            </div>
          )}

          {exploreStep === 3 && (
            <div className="p-5 space-y-3">
              <p className="text-sm text-cream-muted">Choose a hypothesis to investigate:</p>
              <div className="space-y-2">
                {suggestedHyps.map((h, i) => (
                  <button key={i} type="button" onClick={() => handleExploreSelect(h)}
                    className="w-full text-left p-3.5 rounded-lg border border-line bg-bg-card hover:border-amber/40 hover:bg-amber-subtle/30 transition-all">
                    <p className="text-[13px] text-cream leading-relaxed">{h}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Hypothesis input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase">
              Hypothesis
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setShowPico((v) => !v); setExploreMode(false); }}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${showPico ? 'border-amber/40 text-amber bg-amber-subtle' : 'border-line text-cream-faint hover:text-cream'}`}>
                PICO builder
              </button>
              <button type="button" onClick={() => { setExploreMode((v) => !v); setShowPico(false); setExploreStep(1); }}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${exploreMode ? 'border-amber/40 text-amber bg-amber-subtle' : 'border-line text-cream-faint hover:text-cream'}`}>
                Explore field
              </button>
            </div>
          </div>

          {/* PICO builder */}
          {showPico && (
            <div className="mb-3 p-4 bg-bg-card border border-amber/15 rounded-lg space-y-3">
              <p className="text-[10px] font-mono text-amber tracking-widest uppercase">PICO Framework</p>
              {[
                { key: 'population', label: 'Population / Subject', placeholder: 'e.g. ICU patients, ResNet models, small firms' },
                { key: 'intervention', label: 'Intervention / Method', placeholder: 'e.g. deep learning, behavioral nudges, CRISPR' },
                { key: 'comparison', label: 'Comparison (optional)', placeholder: 'e.g. traditional logistic regression, control group' },
                { key: 'outcome', label: 'Outcome', placeholder: 'e.g. diagnostic accuracy, mortality rate, revenue' },
                { key: 'domain', label: 'Domain (optional)', placeholder: 'e.g. radiology, economics, neuroscience' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-[10px] font-mono text-cream-faint block mb-1">{label}</label>
                  <input type="text" value={(pico as Record<string, string>)[key]}
                    onChange={(e) => setPico((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 bg-bg-inset border border-line rounded text-sm text-cream placeholder:text-cream-faint/60 focus:outline-none focus:border-amber/40"
                  />
                </div>
              ))}
              <button type="button" onClick={handlePicoGenerate}
                disabled={picoLoading || !pico.population || !pico.intervention || !pico.outcome}
                className="w-full py-2 bg-amber text-bg text-sm font-medium rounded hover:bg-amber-glow transition-colors disabled:opacity-40">
                {picoLoading ? 'Generating…' : 'Generate hypothesis'}
              </button>
            </div>
          )}

          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g., External validation is underreported in deep learning studies for medical imaging diagnostics"
            className="w-full h-32 p-4 bg-bg-card border border-line rounded-lg text-cream text-[15px] leading-relaxed placeholder:text-cream-faint/60 resize-none focus:outline-none focus:border-amber/40 focus:ring-1 focus:ring-amber/20 transition-all"
            required
          />
          {hypothesis.length > 0 && (
            <span className="block text-right text-[10px] font-mono text-cream-faint mt-1">
              {hypothesis.length}
            </span>
          )}
        </div>

        {/* Action / intent */}
        <div>
          <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-2 block">
            What would you like to do? <span className="text-cream-faint normal-case tracking-normal">(optional)</span>
          </label>
          <p className="text-[12px] text-cream-faint mb-2">
            Describe your goal in plain language — Pramana will choose the right analysis workflows.
            e.g. "write a literature review", "find gaps in this research area", "verify this claim", "prepare a grant proposal"
          </p>
          <textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. I want to write a literature review and identify gaps for a grant proposal"
            className="w-full h-20 p-4 bg-bg-card border border-line rounded-lg text-cream text-[15px] leading-relaxed placeholder:text-cream-faint/60 resize-none focus:outline-none focus:border-amber/40 focus:ring-1 focus:ring-amber/20 transition-all"
          />
        </div>

        {/* Research context */}
        <div>
          <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-3 block">
            Context
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`p-3 text-left rounded-lg border transition-all duration-150 ${
                  type === t.value
                    ? 'border-amber/40 bg-amber-subtle'
                    : 'border-line bg-bg-card hover:border-line-strong'
                }`}
              >
                <span className={`block text-sm font-medium ${
                  type === t.value ? 'text-amber' : 'text-cream'
                }`}>
                  {t.label}
                </span>
                <span className="block text-[12px] text-cream-muted mt-0.5">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prior research — conditional */}
        {showPrior && (
          <div className="animate-fade-up">
            <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-1 block">
              Your Prior Work <span className="text-cream-faint normal-case tracking-normal">(optional)</span>
            </label>
            <p className="text-[12px] text-cream-faint mb-2">
              Paste your abstract or key findings to help us find more relevant literature.
            </p>
            <textarea
              value={priorResearch}
              onChange={(e) => setPriorResearch(e.target.value)}
              placeholder={
                type === 'related'
                  ? 'Our recent paper showed that transformer models outperform CNNs for retinal image classification...'
                  : 'In our Phase 1 study we established a baseline using ResNet-50 on ADNI data...'
              }
              className="w-full h-24 p-4 bg-bg-card border border-line rounded-lg text-cream text-sm leading-relaxed placeholder:text-cream-faint/50 resize-none focus:outline-none focus:border-amber/40 focus:ring-1 focus:ring-amber/20 transition-all"
            />

            {/* PDF Upload */}
            <div className="mt-4">
              <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-2 block">
                Upload Papers <span className="text-cream-faint normal-case tracking-normal">(optional)</span>
              </label>
              <p className="text-[12px] text-cream-faint mb-2">
                Upload your previous papers as PDF to include as context.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 border-2 border-dashed border-line rounded-lg text-sm text-cream-muted hover:border-amber/40 hover:text-cream transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin-slow w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Extracting text...
                  </span>
                ) : (
                  'Drop PDFs here or click to upload'
                )}
              </button>

              {uploadedPdfs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadedPdfs.map((pdf) => (
                    <div
                      key={pdf.file_id}
                      className="flex items-center justify-between p-2.5 bg-bg-card border border-line rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-cream truncate">{pdf.filename}</p>
                        <p className="text-[11px] text-cream-faint font-mono">
                          {pdf.page_count} pages &middot; {Math.round(pdf.char_count / 1000)}k chars
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePdf(pdf.file_id)}
                        className="shrink-0 ml-2 p-1 text-cream-faint hover:text-rose transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Corpus size */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase">
              Corpus Size
            </label>
            <span className="text-sm font-mono text-amber font-medium">{maxPapers}</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={maxPapers}
            onChange={(e) => setMaxPapers(Number(e.target.value))}
            className="w-full h-1 bg-line-strong rounded-full appearance-none cursor-pointer accent-amber"
          />
          <div className="flex justify-between text-[10px] font-mono text-cream-faint mt-1.5">
            <span>10 quick</span>
            <span>200 thorough</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3.5 bg-rose-subtle border border-rose/20 rounded-lg text-rose text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !hypothesis.trim()}
          className="w-full py-3.5 bg-amber text-bg-card rounded-lg font-semibold text-[15px] hover:bg-amber-glow disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 tracking-wide"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin-slow w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Starting...
            </span>
          ) : (
            'Begin Analysis'
          )}
        </button>
      </form>

      {/* ── How It Works ── */}
      <div className="mt-20 pt-8 border-t border-line">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-6">
          How It Works
        </p>
        <div className="space-y-5">
          {[
            { n: '01', title: 'Parse', body: 'Your hypothesis is analyzed to extract domains, topics, and targeted search queries.' },
            { n: '02', title: 'Gather', body: 'Papers are retrieved from Semantic Scholar, arXiv, and PubMed. Blogs provide additional discovery context.' },
            { n: '03', title: 'Extract', body: 'Structured evidence is pulled from each paper — facts, methods, datasets, and limitations — each tied to a direct quote with page or section location.' },
            { n: '04', title: 'Normalize', body: 'Datasets, metrics, and terms are canonicalized. Semantic vectors are built for cross-paper search.' },
            { n: '05', title: 'Analyze', body: 'Composable analytical lenses examine the evidence: tables, gap discovery, meta-analysis, venue mapping, and research planning.' },
            { n: '06', title: 'Report', body: 'Findings are synthesized into a structured report with charts, identified gaps, key concepts, and suggested research directions.' },
          ].map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="text-[10px] font-mono text-amber tracking-widest mt-1.5 shrink-0 w-5">{s.n}</span>
              <div>
                <p className="font-display text-[17px] text-cream">{s.title}</p>
                <p className="text-[13px] text-cream-muted mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── What Makes It Different ── */}
      <div className="mt-16 pt-8 border-t border-line">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-6">
          Design Principles
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          {[
            {
              title: 'Evidence-Grounded',
              body: 'Every factual output is traceable to source text — a direct quote with a page or section reference. Nothing is inferred or fabricated.',
            },
            {
              title: 'Assistant-First',
              body: 'Outputs support human reasoning, not automated decisions. Pramana helps you think, it doesn\u2019t think for you.',
            },
            {
              title: 'No Judgments',
              body: 'Language is descriptive and assistive, never evaluative. Papers are not ranked, scored, or judged for quality.',
            },
            {
              title: 'Hypothesis-Conditioned',
              body: 'Behavior adapts based on your hypothesis and research context — new exploration, continuation, related work, or onboarding.',
            },
          ].map((p) => (
            <div key={p.title}>
              <p className="text-sm font-semibold text-cream">{p.title}</p>
              <p className="text-[13px] text-cream-muted mt-1 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Analytical Lenses ── */}
      <div className="mt-16 pt-8 border-t border-line">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-2">
          Analytical Lenses
        </p>
        <p className="text-sm text-cream-muted mb-5">
          Modular analyses are selected based on your hypothesis and intent:
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { title: 'Evidence Table', desc: 'Structured facts organized by type with source tracing' },
            { title: 'Gap Discovery', desc: 'Identifies where evidence is missing or thin' },
            { title: 'Meta-Analysis', desc: 'Year distributions, term frequencies, concentration patterns' },
            { title: 'Venue Mapping', desc: 'Where research gets published and venue-specific patterns' },
            { title: 'Research Planning', desc: 'Suggested directions and practical recommendations' },
          ].map((l) => (
            <div key={l.title} className="p-3 bg-bg-card border border-line rounded-lg">
              <p className="text-sm font-medium text-cream">{l.title}</p>
              <p className="text-[12px] text-cream-muted mt-1 leading-relaxed">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sources ── */}
      <div className="mt-16 pt-8 border-t border-line mb-8">
        <p className="text-[11px] font-mono text-amber tracking-[0.2em] uppercase mb-5">
          Sources
        </p>
        <div className="flex flex-wrap gap-2">
          {['Semantic Scholar', 'arXiv', 'PubMed', 'Blogs (discovery only)'].map((src) => (
            <span
              key={src}
              className="px-3 py-1.5 text-sm text-cream-dim border border-line rounded-lg bg-bg-card"
            >
              {src}
            </span>
          ))}
        </div>
        <p className="text-[12px] text-cream-faint mt-3 leading-relaxed">
          Blogs are used for discovery and context but are not treated as primary evidence.
          Initial domain focus: Biomedical Engineering &amp; Biomedical ML.
        </p>
      </div>
    </div>
  );
}
