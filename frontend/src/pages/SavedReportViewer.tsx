import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSavedReport, type Report } from '../api/client';
import ReportViewerDisplay from './ReportViewerDisplay';

export default function SavedReportViewer() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;
    getSavedReport(Number(runId)).then(setReport).catch((err) => setError(err.message));
  }, [runId]);

  return <ReportViewerDisplay report={report} error={error} runId={runId} />;
}
