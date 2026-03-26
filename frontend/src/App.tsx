import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import HypothesisInput from './pages/HypothesisInput';
import AnalysisProgress from './pages/AnalysisProgress';
import ReportViewer from './pages/ReportViewer';
import SavedReportViewer from './pages/SavedReportViewer';
import EvidenceExplorer from './pages/EvidenceExplorer';
import ReportHistory from './pages/ReportHistory';
import ConfirmHypothesis from './pages/ConfirmHypothesis';
import PaperCuration from './pages/PaperCuration';
import { ThemeProvider, useTheme } from './theme';
import './index.css';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 text-[13px] tracking-wide transition-all duration-200 rounded-md ${
        isActive
          ? 'text-amber bg-amber-subtle font-medium'
          : 'text-cream-muted hover:text-cream'
      }`}
    >
      {children}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-md text-cream-muted hover:text-cream hover:bg-bg-hover transition-all duration-200"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 006.002-2.082z" />
        </svg>
      )}
    </button>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-bg grain">
      {/* Top bar — ultra minimal */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-line backdrop-blur-xl bg-bg/80">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-12">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="font-display text-[18px] font-600 text-cream tracking-tight">
                Pramana
              </span>
              <span className="text-[10px] font-mono text-cream-faint tracking-widest uppercase mt-px">
                v0.1
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <NavLink to="/">Analyze</NavLink>
              <NavLink to="/evidence">Evidence</NavLink>
              <NavLink to="/history">History</NavLink>
              <div className="ml-2 pl-2 border-l border-line">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 sm:px-8 pt-16 pb-20">
        <Routes>
          <Route path="/" element={<HypothesisInput />} />
          <Route path="/analysis/:runId" element={<AnalysisProgress />} />
          <Route path="/confirm/:runId" element={<ConfirmHypothesis />} />
          <Route path="/curate/:runId" element={<PaperCuration />} />
          <Route path="/report/db/:runId" element={<SavedReportViewer />} />
          <Route path="/report/:runId" element={<ReportViewer />} />
          <Route path="/evidence" element={<EvidenceExplorer />} />
          <Route path="/history" element={<ReportHistory />} />
        </Routes>
      </main>

      {/* Footer line */}
      <div className="border-t border-line">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <span className="text-[11px] text-cream-faint font-mono tracking-wide">
            hypothesis-driven research assistant
          </span>
          <span className="text-[11px] text-cream-faint font-mono">
            built with evidence
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </BrowserRouter>
  );
}
