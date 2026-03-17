import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HypothesisInput from './pages/HypothesisInput';
import AnalysisProgress from './pages/AnalysisProgress';
import ReportViewer from './pages/ReportViewer';
import EvidenceExplorer from './pages/EvidenceExplorer';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link to="/" className="text-xl font-bold text-indigo-600">
                  Pramana
                </Link>
                <span className="ml-2 text-sm text-gray-500">Research Assistant</span>
              </div>
              <div className="flex items-center space-x-4">
                <Link to="/" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm">
                  New Analysis
                </Link>
                <Link to="/evidence" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm">
                  Evidence Explorer
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<HypothesisInput />} />
            <Route path="/analysis/:runId" element={<AnalysisProgress />} />
            <Route path="/report/:runId" element={<ReportViewer />} />
            <Route path="/evidence" element={<EvidenceExplorer />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
