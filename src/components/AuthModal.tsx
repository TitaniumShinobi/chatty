import React, { useState } from 'react'
import { X, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { loginWithGoogle } from '../lib/auth'
import { Z_LAYERS } from '../lib/zLayers'

interface AuthModalProps {
  isVisible: boolean
  onClose: () => void
  onLogin: (email: string, password: string) => void
  onSignup: (email: string, password: string) => void
  onMicrosoftAuth: () => void
  onAppleAuth: () => void
  onPhoneAuth: () => void
}

const AuthModal: React.FC<AuthModalProps> = ({
  isVisible,
  onClose,
  onLogin,
  onSignup,
  onMicrosoftAuth,
  onAppleAuth,
  onPhoneAuth
}) => {
  const [mode, setMode] = useState<'welcome' | 'login' | 'signup'>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'login') {
      onLogin(email, password)
    } else if (mode === 'signup') {
      onSignup(email, password)
    }
  }

  const handleGoogleAuth = () => {
    loginWithGoogle();
  }

  const handleMicrosoftAuth = () => {
    // Open Microsoft OAuth in a new tab
    const microsoftAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.REACT_APP_MICROSOFT_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}&response_type=code&scope=openid email profile`
    window.open(microsoftAuthUrl, '_blank', 'width=500,height=600')
    onMicrosoftAuth()
  }

  const handleAppleAuth = () => {
    // Open Apple OAuth in a new tab
    const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${process.env.REACT_APP_APPLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}&response_type=code&scope=email name`
    window.open(appleAuthUrl, '_blank', 'width=500,height=600')
    onAppleAuth()
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div className="rounded-lg shadow-xl max-w-md w-full mx-4" style={{ backgroundColor: 'var(--chatty-surface)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--chatty-border)' }}>
          {mode !== 'welcome' && (
            <button
              onClick={() => setMode('welcome')}
              className="p-2 rounded-lg hover:opacity-75 transition-opacity"
              style={{ color: 'var(--chatty-text-primary)' }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-xl font-semibold" style={{ color: 'var(--chatty-text-primary)' }}>
            {mode === 'welcome' ? 'Welcome back' : mode === 'login' ? 'Log in' : 'Sign up'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-75 transition-opacity"
            style={{ color: 'var(--chatty-text-primary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'welcome' ? (
            <>
              <p className="mb-6" style={{ color: 'var(--chatty-text-secondary)' }}>
                Log in or sign up to get smarter responses, upload files and images, and more.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setMode('login')}
                  className="w-full py-3 px-4 rounded-lg transition-colors hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--chatty-accent)', 
                    color: 'var(--chatty-accent-foreground)' 
                  }}
                >
                  Log in
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className="w-full border py-3 px-4 rounded-lg transition-colors hover:opacity-75"
                  style={{ 
                    borderColor: 'var(--chatty-border)',
                    backgroundColor: 'var(--chatty-surface)',
                    color: 'var(--chatty-text-primary)' 
                  }}
                >
                  Sign up for free
                </button>
                <button
                  onClick={onClose}
                  className="w-full underline hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--chatty-accent)' }}
                >
                  Stay logged out
                </button>
              </div>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--chatty-text-primary)' }}>
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--chatty-text-muted)' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ 
                        backgroundColor: 'var(--chatty-surface)',
                        borderColor: 'var(--chatty-border)',
                        color: 'var(--chatty-text-primary)'
                      }}
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--chatty-text-primary)' }}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--chatty-text-muted)' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ 
                        backgroundColor: 'var(--chatty-surface)',
                        borderColor: 'var(--chatty-border)',
                        color: 'var(--chatty-text-primary)'
                      }}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-75 transition-opacity"
                      style={{ color: 'var(--chatty-text-muted)' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-lg transition-colors hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--chatty-accent)', 
                    color: 'var(--chatty-accent-foreground)' 
                  }}
                >
                  {mode === 'login' ? 'Log in' : 'Sign up'}
                </button>
              </form>

              <div className="my-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" style={{ borderColor: 'var(--chatty-border)' }} />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2" style={{ 
                      backgroundColor: 'var(--chatty-surface)', 
                      color: 'var(--chatty-text-secondary)' 
                    }}>OR</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleGoogleAuth}
                  className="w-full border py-3 px-4 rounded-lg transition-colors hover:opacity-75 flex items-center justify-center gap-3"
                  style={{ 
                    borderColor: 'var(--chatty-border)',
                    backgroundColor: 'var(--chatty-surface)',
                    color: 'var(--chatty-text-primary)' 
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <button
                  onClick={handleMicrosoftAuth}
                  className="w-full border py-3 px-4 rounded-lg transition-colors hover:opacity-75 flex items-center justify-center gap-3"
                  style={{ 
                    borderColor: 'var(--chatty-border)',
                    backgroundColor: 'var(--chatty-surface)',
                    color: 'var(--chatty-text-primary)' 
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#f25022" d="M1 1h10v10H1z"/>
                    <path fill="#7fba00" d="M13 1h10v10H13z"/>
                    <path fill="#00a4ef" d="M1 13h10v10H1z"/>
                    <path fill="#ffb900" d="M13 13h10v10H13z"/>
                  </svg>
                  Continue with Microsoft Account
                </button>

                <button
                  onClick={handleAppleAuth}
                  className="w-full border py-3 px-4 rounded-lg transition-colors hover:opacity-75 flex items-center justify-center gap-3"
                  style={{ 
                    borderColor: 'var(--chatty-border)',
                    backgroundColor: 'var(--chatty-surface)',
                    color: 'var(--chatty-text-primary)' 
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Continue with Apple
                </button>

                <button
                  onClick={onPhoneAuth}
                  className="w-full border py-3 px-4 rounded-lg transition-colors hover:opacity-75 flex items-center justify-center gap-3"
                  style={{ 
                    borderColor: 'var(--chatty-border)',
                    backgroundColor: 'var(--chatty-surface)',
                    color: 'var(--chatty-text-primary)' 
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                  Continue with phone
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t text-center text-sm" style={{ 
          borderColor: 'var(--chatty-border)', 
          color: 'var(--chatty-text-secondary)' 
        }}>
          <div className="flex justify-center gap-4">
            <a href="/terms" className="hover:opacity-75 transition-opacity" style={{ color: 'var(--chatty-text-secondary)' }}>Terms of Use</a>
            <span>|</span>
            <a href="/privacy" className="hover:opacity-75 transition-opacity" style={{ color: 'var(--chatty-text-secondary)' }}>Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
