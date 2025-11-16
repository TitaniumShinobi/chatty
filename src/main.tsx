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
import CodexPage from './pages/CodePage'
import VVAULTPage from './pages/VVAULTPage'
import DownloadVerify from './pages/DownloadVerify'
import EmailVerification from './pages/EmailVerification'
import TermsOfServicePage from './pages/TermsOfServicePage'
import PrivacyNoticePage from './pages/PrivacyNoticePage'
import EECCDPage from './pages/EECCDPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './lib/ThemeContext'
import { initInteractionLogging, devLoggerDebugger } from './lib/devInteractionLogger'
import './index.css'

// Initialize interaction logging in development
try {
  initInteractionLogging();
} catch (error) {
  console.error('❌ [main.tsx] Error initializing interaction logger:', error);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* === THEME FIX: Wrap login screen in ThemeProvider === */}
          <Route path="/" element={
            <ThemeProvider user={null}>
              <App />
            </ThemeProvider>
          } />
          <Route path="/auth/callback" element={
            <ThemeProvider user={null}>
              <OAuthCallback />
            </ThemeProvider>
          } />
          <Route path="/api/auth/google/callback" element={
            <ThemeProvider user={null}>
              <OAuthCallback />
            </ThemeProvider>
          } />
          <Route path="/download/verify" element={
            <ThemeProvider user={null}>
              <DownloadVerify />
            </ThemeProvider>
          } />
          <Route path="/verify" element={
            <ThemeProvider user={null}>
              <EmailVerification />
            </ThemeProvider>
          } />
          <Route path="/legal/terms" element={
            <ThemeProvider user={null}>
              <TermsOfServicePage />
            </ThemeProvider>
          } />
          <Route path="/legal/privacy" element={
            <ThemeProvider user={null}>
              <PrivacyNoticePage />
            </ThemeProvider>
          } />
          <Route path="/legal/eeccd" element={
            <ThemeProvider user={null}>
              <EECCDPage />
            </ThemeProvider>
          } />
          {/* === END THEME FIX === */}
          <Route path="/app" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="chat/:threadId" element={<Chat />} />
            <Route path="gpts" element={<GPTsPage />} />
            <Route path="gpts/new" element={<GPTsPage initialOpen />} />
            <Route path="gpts/edit/:id" element={<GPTsPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="codex" element={<CodexPage />} />
            <Route path="vvault" element={<VVAULTPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
