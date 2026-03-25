import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis, uploadPdf, type PdfUploadResult } from '../api/client';

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

  const showPrior = type === 'related' || type === 'continuation';

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

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Hypothesis input */}
        <div>
          <label className="text-[11px] font-mono text-cream-muted tracking-widest uppercase mb-2 block">
            Hypothesis
          </label>
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
