import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OAuthCallback from './components/OAuthCallback'
import Layout from './components/Layout'
import Home from './pages/Home'
import { initPerfMetrics } from './lib/perfMetrics'
import './index.css'

const Chat = lazy(() => import('./pages/Chat'))
const GPTsPage = lazy(() => import('./pages/GPTsPage'))
const SimForge = lazy(() => import('./pages/SimForge'))
const VVAULTPage = lazy(() => import('./pages/VVAULTPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const CodePage = lazy(() => import('./pages/CodePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const AppsPage = lazy(() => import('./pages/AppsPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const FXShinobiPage = lazy(() => import('./pages/finance/FXShinobiPage'))

initPerfMetrics()

const enableStrictMode = import.meta.env.PROD || import.meta.env.VITE_STRICT_MODE === 'true'

const PageFallback = () => (
  <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
    <div className="animate-pulse">Loading...</div>
  </div>
)

const S: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageFallback />}>{children}</Suspense>
)

const app = (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      {/* /api/auth/google/callback is handled by Vite proxy → backend, not React Router */}
      <Route path="/app" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="chat/:threadId" element={<S><Chat /></S>} />
        <Route path="gpts" element={<S><GPTsPage /></S>} />
        <Route path="gpts/new" element={<S><GPTsPage initialOpen /></S>} />
        <Route path="gpts/edit/:id" element={<S><GPTsPage initialOpen /></S>} />
        {/* AI routes - support both old and new paths during migration */}
        <Route path="ais" element={<S><GPTsPage /></S>} />
        <Route path="ais/new" element={<S><GPTsPage initialOpen /></S>} />
        <Route path="ais/edit/:id" element={<S><GPTsPage initialOpen /></S>} />
        <Route path="explore" element={<S><SimForge /></S>} />
        <Route path="vvault" element={<S><VVAULTPage /></S>} />
        <Route path="library" element={<S><LibraryPage /></S>} />
        <Route path="codex" element={<S><CodePage /></S>} />
        <Route path="search" element={<S><SearchPage /></S>} />
        <Route path="projects" element={<S><ProjectsPage /></S>} />
        <Route path="apps" element={<S><AppsPage /></S>} />
        <Route path="finance" element={<S><FinancePage /></S>} />
        <Route path="finance/fxshinobi" element={<S><FXShinobiPage /></S>} />
      </Route>
    </Routes>
  </BrowserRouter>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  enableStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
)
