import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import HypothesisInput from './pages/HypothesisInput';
import AnalysisProgress from './pages/AnalysisProgress';
import ReportViewer from './pages/ReportViewer';
import EvidenceExplorer from './pages/EvidenceExplorer';
import './index.css';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`relative px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'text-accent'
          : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
      )}
    </Link>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-surface bg-mesh">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-surface-raised/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-ink tracking-tight">
                Pramana
              </span>
              <span className="hidden sm:inline text-[11px] font-medium text-ink-muted bg-surface-sunken px-2 py-0.5 rounded-full">
                Research Assistant
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <NavLink to="/">New Analysis</NavLink>
              <NavLink to="/evidence">Evidence</NavLink>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<HypothesisInput />} />
          <Route path="/analysis/:runId" element={<AnalysisProgress />} />
          <Route path="/report/:runId" element={<ReportViewer />} />
          <Route path="/evidence" element={<EvidenceExplorer />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
