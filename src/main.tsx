import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OAuthCallback from './components/OAuthCallback'
import Layout from './components/Layout'
import { TtsPlaybackProvider } from './context/TtsPlaybackContext'
import Home from './pages/Home'
import { initPerfMetrics } from './lib/perfMetrics'
import { getPublicSurfaceConfig, type PublicSurfaceConfig } from './lib/publicSurfaceConfig'
import './index.css'

const loadChat = () => import('./pages/Chat')
const loadGPTsPage = () => import('./pages/GPTsPage')
const loadSimForge = () => import('./pages/SimForge')
const loadVVAULTPage = () => import('./pages/VVAULTPage')
const loadLibraryPage = () => import('./pages/LibraryPage')
const loadCodePage = () => import('./pages/CodePage')
const loadSearchPage = () => import('./pages/SearchPage')
const loadProjectsPage = () => import('./pages/ProjectsPage')
const loadAppsPage = () => import('./pages/AppsPage')
const loadFinancePage = () => import('./pages/FinancePage')
const loadFXShinobiPage = () => import('./pages/finance/FXShinobiPage')

const Chat = lazy(loadChat)
const GPTsPage = lazy(loadGPTsPage)
const SimForge = lazy(loadSimForge)
const VVAULTPage = lazy(loadVVAULTPage)
const LibraryPage = lazy(loadLibraryPage)
const CodePage = lazy(loadCodePage)
const SearchPage = lazy(loadSearchPage)
const ProjectsPage = lazy(loadProjectsPage)
const AppsPage = lazy(loadAppsPage)
const FinancePage = lazy(loadFinancePage)
const FXShinobiPage = lazy(loadFXShinobiPage)

initPerfMetrics()

const warmPrimarySidebarRoutes = () => {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    return
  }

  void loadChat()
  void loadGPTsPage()
  void loadSimForge()
  void loadVVAULTPage()
  void loadLibraryPage()
  void loadCodePage()
  void loadSearchPage()
  void loadProjectsPage()
  void loadAppsPage()
  const { finance } = getPublicSurfaceConfig()
  if (finance.enabled) {
    void loadFinancePage()
    void loadFXShinobiPage()
  }
}

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    ;(window as Window & {
      requestIdleCallback: (callback: IdleRequestCallback) => number
    }).requestIdleCallback(() => {
      warmPrimarySidebarRoutes()
    })
  } else {
    window.setTimeout(() => {
      warmPrimarySidebarRoutes()
    }, 0)
  }
}

// Development: filter noisy React Router future-flag warnings during local dev
if (import.meta.env.DEV) {
  const _warn = console.warn.bind(console)
  console.warn = (...args: any[]) => {
    try {
      const m = args[0]
      if (typeof m === 'string' && (m.includes('React Router Future Flag Warning') || m.includes('Relative route resolution within Splat routes'))) {
        return
      }
    } catch (e) {
      // ignore
    }
    _warn(...args)
  }
}

const enableStrictMode = import.meta.env.PROD || import.meta.env.VITE_STRICT_MODE === 'true'

const PageFallback = () => (
  <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
    <div className="animate-pulse">Loading...</div>
  </div>
)

const S: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageFallback />}>{children}</Suspense>
)

const ChatRoute: React.FC = () => (
  <TtsPlaybackProvider>
    <S><Chat /></S>
  </TtsPlaybackProvider>
)

const publicSurfaces = getPublicSurfaceConfig()

const ROUTE_OWNED_APP_IDS: Array<keyof PublicSurfaceConfig["apps"]> = ["code", "fxshinobi", "projects"]

const hasPublicApps = (surfaces: PublicSurfaceConfig): boolean => {
  return ROUTE_OWNED_APP_IDS.some((appId) => surfaces.apps[appId])
}

const hasFinanceRoute = (surfaces: PublicSurfaceConfig): boolean => {
  return Boolean(surfaces.apps.fxshinobi && surfaces.finance.enabled)
}

type AppRoutesProps = {
  publicSurfaces?: PublicSurfaceConfig
}

export const AppRoutes: React.FC<AppRoutesProps> = ({
  publicSurfaces: routeSurfaces = publicSurfaces
}) => {
  const showAppsRoute = hasPublicApps(routeSurfaces)
  const showFinanceRoute = hasFinanceRoute(routeSurfaces)

  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      {/* /api/auth/google/callback is handled by Vite proxy → backend, not React Router */}
      <Route path="/app" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="chat/:threadId" element={<ChatRoute />} />
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
        {showAppsRoute && <Route path="apps" element={<S><AppsPage /></S>} />}
        {showFinanceRoute && <Route path="finance" element={<S><FinancePage /></S>} />}
        {showFinanceRoute && (
          <Route path="finance/fxshinobi" element={<S><FXShinobiPage /></S>} />
        )}
      </Route>
    </Routes>
  )
}

const app = (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AppRoutes publicSurfaces={publicSurfaces} />
  </BrowserRouter>
)

if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    enableStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
  )
}
