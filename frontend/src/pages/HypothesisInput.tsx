import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis } from '../api/client';

const INITIATION_TYPES = [
  { value: 'new', label: 'New Project', desc: 'Starting fresh research in this area' },
  { value: 'related', label: 'Related Work', desc: 'Exploring work related to an existing project' },
  { value: 'continuation', label: 'Continuation', desc: 'Continuing prior research' },
  { value: 'joining', label: 'RA Joining', desc: 'Research assistant joining an existing project' },
];

export default function HypothesisInput() {
  const navigate = useNavigate();
  const [hypothesis, setHypothesis] = useState('');
  const [initiationType, setInitiationType] = useState('new');
  const [maxPapers, setMaxPapers] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      });
      navigate(`/analysis/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Research Analysis</h1>
        <p className="text-gray-600">
          Enter a research hypothesis to analyze scientific literature
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="hypothesis" className="block text-sm font-medium text-gray-700 mb-2">
            Research Hypothesis
          </label>
          <textarea
            id="hypothesis"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g., External validation is rare in deep learning medical imaging papers"
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Research Initiation Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {INITIATION_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setInitiationType(type.value)}
                className={`p-3 text-left border rounded-lg transition-colors ${
                  initiationType === type.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="font-medium text-sm">{type.label}</div>
                <div className="text-xs text-gray-500 mt-1">{type.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="maxPapers" className="block text-sm font-medium text-gray-700 mb-2">
            Max Papers: {maxPapers}
          </label>
          <input
            id="maxPapers"
            type="range"
            min="10"
            max="200"
            step="10"
            value={maxPapers}
            onChange={(e) => setMaxPapers(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>10</span>
            <span>200</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !hypothesis.trim()}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Starting Analysis...' : 'Analyze Literature'}
        </button>
      </form>
    </div>
  );
}
