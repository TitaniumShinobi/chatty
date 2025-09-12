import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OAuthCallback from './components/OAuthCallback'
import Layout from './components/Layout'
import GPTListPage from './pages/GPTListPage'
import NewGPTPage from './pages/NewGPTPage'
import Home from './pages/Home'
import Chat from './pages/Chat'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/api/auth/google/callback" element={<OAuthCallback />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="chat/:threadId" element={<Chat />} />
          <Route path="gpts" element={<GPTListPage />} />
          <Route path="gpts/new" element={<NewGPTPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
