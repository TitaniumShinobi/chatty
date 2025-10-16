// src/App.tsx
import React, { useEffect, useState } from 'react'
import {
  fetchMe,
  loginWithGoogle,
  loginWithEmail,
  signupWithEmail,
  type User,
} from './lib/auth'
import { migrateUserData } from './lib/migration'
// import ChattyApp from './ChattyApp' // Not used - Layout.tsx is the main app component

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // email auth UI state
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe()
        if (me) {
          setUser(me)
          // Session is already stored in fetchMe()
          
          // Run surgical migration - this is the recovery fix for symbolic scoping breach
          try {
            const migrated = await migrateUserData(me)
            if (migrated) {
              console.log('🎯 Surgical migration completed in App.tsx - symbolic scoping breach recovered')
            }
          } catch (migrationError) {
            console.error('❌ Migration failed in App.tsx:', migrationError)
            // Don't block the app if migration fails
          }
        }
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    try {
      const u =
        mode === 'login'
          ? await loginWithEmail(email, password)
          : await signupWithEmail(email, password, name)
      if (!u) throw new Error(mode === 'login' ? 'Invalid email or password' : 'Signup failed')
      
      // Run surgical migration after successful authentication
      try {
        const migrated = await migrateUserData(u)
        if (migrated) {
          console.log('🎯 Surgical migration completed after email auth - symbolic scoping breach recovered')
        }
      } catch (migrationError) {
        console.error('❌ Migration failed after email auth:', migrationError)
        // Don't block the app if migration fails
      }
      
      setUser(u); setEmail(''); setPassword(''); setName('')
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-chat-50 text-app-text-900">
        <div className="opacity-70">Loading…</div>
      </div>
    )
  }

  if (user) {
    // Redirect to the app when logged in
    window.location.replace('/app')
    return null
  }

  // Simple login screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-app-chat-50 text-app-text-900 p-4">
      <div className="w-full max-w-md bg-app-pale-50 border border-app-button-500 rounded-xl p-6 shadow-lg">
        <div className="flex justify-center mb-4">
          <img 
            src="/assets/chatty.png" 
            alt="Chatty" 
            className="h-16 w-auto"
          />
        </div>
        <p className="text-app-text-900 opacity-75 mb-6 text-center">Sign in to continue</p>

        <button 
          onClick={loginWithGoogle} 
          className="w-full py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="text-center my-4 text-app-text-900 opacity-60 text-sm">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm text-app-text-900 opacity-70 mb-2">Name</label>
              <input
                className="w-full px-3 py-3 bg-app-chat-50 text-app-text-900 rounded-lg border border-app-button-500 outline-none focus:ring-2 focus:ring-app-button-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-app-text-900 opacity-70 mb-2">Email</label>
            <input
              type="email"
              className="w-full px-3 py-3 bg-app-chat-50 text-app-text-900 rounded-lg border border-app-button-500 outline-none focus:ring-2 focus:ring-app-button-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-app-text-900 opacity-70 mb-2">Password</label>
            <input
              type="password"
              className="w-full px-3 py-3 bg-app-chat-50 text-app-text-900 rounded-lg border border-app-button-500 outline-none focus:ring-2 focus:ring-app-button-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {authError}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full py-3 rounded-lg border border-app-button-500 bg-app-button-500 text-app-text-900 font-semibold hover:bg-app-button-600 transition-colors"
          >
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-app-text-900 opacity-85">
          {mode === 'login' ? (
            <span>
              New here?{' '}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); setMode('signup'); setAuthError('') }} 
                className="text-app-text-900 font-semibold hover:underline"
              >
                Create an account
              </a>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); setMode('login'); setAuthError('') }} 
                className="text-app-text-900 font-semibold hover:underline"
              >
                Sign in
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
