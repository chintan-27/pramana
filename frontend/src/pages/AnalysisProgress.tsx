import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAnalysisStatus, type RunStatus } from '../api/client';

const STAGES = [
  { key: 'parsing', label: 'Parsing Hypothesis' },
  { key: 'retrieval', label: 'Retrieving Papers' },
  { key: 'extraction', label: 'Extracting Evidence' },
  { key: 'normalization', label: 'Normalizing Evidence' },
  { key: 'analysis', label: 'Running Analysis' },
  { key: 'report', label: 'Generating Report' },
];

export default function AnalysisProgress() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;

    const poll = async () => {
      try {
        const data = await getAnalysisStatus(runId);
        setStatus(data);

        if (data.status === 'completed') {
          navigate(`/report/${runId}`);
          return;
        }
        if (data.status === 'failed') {
          setError(data.error || 'Analysis failed');
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get status');
        return;
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [runId, navigate]);

  const currentStageIndex = status ? STAGES.findIndex((s) => s.key === status.stage) : -1;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Analysis in Progress</h1>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-6">
          <p className="font-medium">Analysis Failed</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm text-red-600 underline"
          >
            Start New Analysis
          </button>
        </div>
      )}

      <div className="space-y-4">
        {STAGES.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isComplete = index < currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <div
              key={stage.key}
              className={`flex items-center p-4 rounded-lg border transition-all ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50'
                  : isComplete
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-shrink-0 mr-4">
                {isComplete ? (
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-sm">
                    {index + 1}
                  </div>
                )}
              </div>
              <div>
                <p className={`font-medium ${isPending ? 'text-gray-400' : 'text-gray-900'}`}>
                  {stage.label}
                </p>
                {isActive && status?.progress && (
                  <p className="text-sm text-indigo-600 mt-1">
                    {status.progress.description as string || 'Processing...'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-gray-500 mt-6">
        Run ID: <code className="text-xs bg-gray-100 px-2 py-1 rounded">{runId}</code>
      </p>
    </div>
  );
}
