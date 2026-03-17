import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReport, type Report } from '../api/client';

export default function ReportViewer() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [expandedLens, setExpandedLens] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    getReport(runId)
      .then(setReport)
      .catch((err) => setError(err.message));
  }, [runId]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!report) {
    return <div className="text-center text-gray-500 py-12">Loading report...</div>;
  }

  const hypothesis = report.hypothesis as Record<string, string[] | string>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Research Analysis Report</h1>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Hypothesis</h2>
          <div className="space-y-2 text-sm">
            {hypothesis.domains && (
              <p><span className="font-medium text-gray-700">Domains:</span> {(hypothesis.domains as string[]).join(', ')}</p>
            )}
            {hypothesis.topics && (
              <p><span className="font-medium text-gray-700">Topics:</span> {(hypothesis.topics as string[]).join(', ')}</p>
            )}
            {hypothesis.methods && (hypothesis.methods as string[]).length > 0 && (
              <p><span className="font-medium text-gray-700">Methods:</span> {(hypothesis.methods as string[]).join(', ')}</p>
            )}
            {hypothesis.initiation_context && (
              <p><span className="font-medium text-gray-700">Context:</span> {hypothesis.initiation_context as string}</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.active_lenses.map((lens) => (
              <span key={lens} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                {lens.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {report.lens_results.map((result) => (
          <div key={result.lens} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedLens(expandedLens === result.lens ? null : result.lens)}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-50"
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{result.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{result.summary}</p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedLens === result.lens ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedLens === result.lens && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <LensContent lens={result.lens} content={result.content} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link to="/evidence" className="text-indigo-600 hover:text-indigo-800 text-sm">
          Explore Evidence
        </Link>
      </div>
    </div>
  );
}

function LensContent({ lens, content }: { lens: string; content: Record<string, unknown> }) {
  if (lens === 'evidence_table') {
    const tables = (content.tables || {}) as Record<string, Array<Record<string, string>>>;
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {content.total_facts as number} facts from {content.papers_with_evidence as number} papers
        </p>
        {Object.entries(tables).map(([type, facts]) => (
          <div key={type}>
            <h4 className="font-medium text-gray-900 mb-2 capitalize">{type} ({facts.length})</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Content</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Quote</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Location</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Paper</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {facts.slice(0, 10).map((fact, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{fact.content}</td>
                      <td className="px-3 py-2 text-gray-500 italic text-xs max-w-xs truncate">
                        "{fact.direct_quote}"
                      </td>
                      <td className="px-3 py-2 text-xs">{fact.location}</td>
                      <td className="px-3 py-2 text-xs">{fact.paper_title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lens === 'gap_discovery') {
    const gaps = (content.gaps || []) as Array<Record<string, string>>;
    return (
      <div className="space-y-3">
        {gaps.length === 0 ? (
          <p className="text-sm text-gray-500">No significant gaps identified.</p>
        ) : (
          gaps.map((gap, i) => (
            <div key={i} className="p-3 bg-white rounded border border-gray-200">
              <p className="font-medium text-gray-900">{gap.description}</p>
              <p className="text-sm text-gray-600 mt-1">{gap.evidence}</p>
              {gap.severity && (
                <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${
                  gap.severity === 'high' ? 'bg-red-100 text-red-700' :
                  gap.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {gap.severity}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // Default: render JSON
  return (
    <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}
