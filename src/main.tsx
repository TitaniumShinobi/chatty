import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OAuthCallback from './components/OAuthCallback'
import Layout from './components/Layout'
import GPTsPage from './pages/GPTsPage'
import Home from './pages/Home'
import Chat from './pages/Chat'
import VVAULTPage from './pages/VVAULTPage'
import LibraryPage from './pages/LibraryPage'
import CodePage from './pages/CodePage'
import SimForge from './pages/SimForge'
import SearchPage from './pages/SearchPage'
import ProjectsPage from './pages/ProjectsPage'
import AppsPage from './pages/AppsPage'
import FinancePage from './pages/FinancePage'
import FXShinobiPage from './pages/finance/FXShinobiPage'
import './index.css'

const enableStrictMode = import.meta.env.PROD || import.meta.env.VITE_STRICT_MODE === 'true'

const app = (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      {/* /api/auth/google/callback is handled by Vite proxy → backend, not React Router */}
      <Route path="/app" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="chat/:threadId" element={<Chat />} />
        <Route path="gpts" element={<GPTsPage />} />
        <Route path="gpts/new" element={<GPTsPage initialOpen />} />
        <Route path="gpts/edit/:id" element={<GPTsPage initialOpen />} />
        {/* AI routes - support both old and new paths during migration */}
        <Route path="ais" element={<GPTsPage />} />
        <Route path="ais/new" element={<GPTsPage initialOpen />} />
        <Route path="ais/edit/:id" element={<GPTsPage initialOpen />} />
        <Route path="explore" element={<SimForge />} />
        <Route path="vvault" element={<VVAULTPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="codex" element={<CodePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="finance/fxshinobi" element={<FXShinobiPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  enableStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
)
