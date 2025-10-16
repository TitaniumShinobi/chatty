import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OAuthCallback from './components/OAuthCallback'
import Layout from './components/Layout'
import GPTsPage from './pages/GPTsPage'
import Home from './pages/Home'
import Chat from './pages/Chat'
import LibraryPage from './pages/LibraryPage'
import ExplorePage from './pages/ExplorePage'
import CodexPage from './pages/CodexPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/api/auth/google/callback" element={<OAuthCallback />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="chat/:threadId" element={<Chat />} />
            <Route path="gpts" element={<GPTsPage />} />
            <Route path="gpts/new" element={<GPTsPage initialOpen />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="codex" element={<CodexPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
