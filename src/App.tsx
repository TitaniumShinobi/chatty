// src/App.tsx
import React, { useEffect, useRef, useState } from 'react'
import {
  fetchMe,
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithApple,
  loginWithGithub,
  loginWithEmail,
  signupWithEmail,
  type User,
} from './lib/auth'
// Migration removed - file doesn't exist
// import ChattyApp from './ChattyApp' // Not used - Layout.tsx is the main app component

// Cloudflare Turnstile types
declare global {
  interface Window {
    turnstile: {
      render: (element: string | HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback': (error: string) => void;
        'expired-callback': () => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact';
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // email auth UI state
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('auth:lastEmail') || ''
  })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptVVAULTTerms, setAcceptVVAULTTerms] = useState(false)
  const [authError, setAuthError] = useState('')
  const [lastEmailHint, setLastEmailHint] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('auth:lastEmail') || ''
  })
  
  // Enhanced UI states
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string>('')
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string>('')
  const [turnstileError, setTurnstileError] = useState('')
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  const passwordInputRef = useRef<HTMLInputElement | null>(null)
  
  // Initialize Cloudflare Turnstile
  useEffect(() => {
    const loadTurnstile = () => {
      if (window.turnstile) {
        // Turnstile is already loaded
        return;
      }

      if (!turnstileSiteKey) {
        console.error('Turnstile site key is not configured. Set VITE_TURNSTILE_SITE_KEY in your environment.')
        setTurnstileError('Human verification is temporarily unavailable. Please contact support.')
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    };

    loadTurnstile();
  }, [turnstileSiteKey]);

  // Initialize Turnstile widget when in signup mode
  useEffect(() => {
    if (mode === 'signup' && window.turnstile && !turnstileWidgetId) {
      if (!turnstileSiteKey) {
        return;
      }
      const widgetId = window.turnstile.render('#turnstile-widget', {
        sitekey: turnstileSiteKey,
        callback: (token: string) => {
          setTurnstileToken(token);
          setTurnstileError('');
        },
        'error-callback': (_error: string) => {
          setTurnstileError('Human verification failed. Please try again.');
          setTurnstileToken('');
        },
        'expired-callback': () => {
          setTurnstileError('Verification expired. Please verify again.');
          setTurnstileToken('');
        },
        theme: 'auto',
        size: 'normal'
      });
      setTurnstileWidgetId(widgetId);
    }
  }, [mode, turnstileWidgetId, turnstileSiteKey]);

  // Cleanup Turnstile widget when switching modes
  useEffect(() => {
    if (mode === 'login' && turnstileWidgetId && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId);
      setTurnstileWidgetId('');
      setTurnstileToken('');
      setTurnstileError('');
    }
  }, [mode, turnstileWidgetId]);

  useEffect(() => {
    // Safety timeout: ensure isLoading is cleared after 5 seconds max (reduced since we check cache first)
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ [App.tsx] Auth effect timeout - forcing isLoading to false');
      setIsLoading(false);
    }, 5000);

    (async () => {
      try {
        console.log('🔍 [App.tsx] Auth effect starting');
        
        // Check for cached session first (instant, no backend needed)
        // DISABLED: Cached session was causing redirect loops
        // Only use cache if we're not getting 500 errors
        // const cachedSession = localStorage.getItem('auth:session');
        // if (cachedSession) {
        //   try {
        //     const sessionData = JSON.parse(cachedSession);
        //     if (sessionData?.user) {
        //       console.log('⚡ [App.tsx] Using cached session, skipping backend wait');
        //       setUser(sessionData.user);
        //       setIsLoading(false);
        //       // Verify with backend in background (non-blocking)
        //       fetchMe().catch(() => {
        //         // Silently fail - we already have cached session
        //       });
        //       return;
        //     }
        //   } catch {
        //     // Invalid cache, continue to API check
        //   }
        // }
        
        // No cached session, check API directly
        // Backend readiness check removed - file doesn't exist
        console.log('⏳ [App.tsx] fetchMe() starting');
        try {
          const me = await fetchMe();
          console.log('✅ [App.tsx] fetchMe() resolved:', me ? `user: ${me.email}` : 'null');
          
          if (me) {
            setUser(me);
            // Session is already stored in fetchMe()
            
            // Migration removed - migrateUserData function doesn't exist
          } else {
            console.log('ℹ️ [App.tsx] No user session found');
            // Clear any invalid cached session
            localStorage.removeItem('auth:session');
          }
        } catch (fetchError) {
          console.error('❌ [App.tsx] fetchMe() failed:', fetchError);
          // On error, clear cached session to prevent loops
          localStorage.removeItem('auth:session');
          setUser(null);
        }
      } catch (outerError) {
        console.error('❌ [App.tsx] Unexpected error in auth effect:', outerError);
      } finally {
        clearTimeout(timeoutId);
        console.log('🛑 [App.tsx] Auth effect complete - isLoading → false');
        setIsLoading(false);
      }
    })();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [])

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    setTurnstileError('')
    setIsAuthenticating(true)
    
    // Enhanced validation for signup
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setAuthError('Passwords do not match')
        setIsAuthenticating(false)
        return
      }
      if (!acceptTerms) {
        setAuthError('Please confirm you agree to the Chatty terms.')
        setIsAuthenticating(false)
        return
      }
      if (!acceptVVAULTTerms) {
        setAuthError('Please confirm you agree to the VVAULT terms.')
        setIsAuthenticating(false)
        return
      }
      if (!turnstileToken) {
        setAuthError('Please complete human verification.')
        setIsAuthenticating(false)
        return
      }
    }
    
    try {
      const u =
        mode === 'login'
          ? await loginWithEmail(email, password)
          : await signupWithEmail(email, password, confirmPassword, name, turnstileToken)
      
      if (!u) {
        throw new Error(mode === 'login' ? 'Invalid email or password' : 'Signup failed')
      }
      
      if (mode === 'signup') {
        if (!turnstileSiteKey) {
          setAuthError('Human verification configuration is missing. Please contact support.')
          return
        }
        // Show signup success message
        setSignupSuccess(true)
        setIsAuthenticating(false)
        
        // Clear form
        setEmail('')
        setPassword('')
        setConfirmPassword('')
        setName('')
        setAcceptTerms(false)
        setTurnstileToken('')
        
        // Reset Turnstile widget
        if (turnstileWidgetId && window.turnstile) {
          window.turnstile.reset(turnstileWidgetId)
        }
        
        return
      }
      
      // For login, proceed normally
      // Migration removed - migrateUserData function doesn't exist
      
      if (mode === 'login') {
        localStorage.setItem('auth:lastEmail', email)
        setLastEmailHint(email)
      }

      setUser(u)
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setName('')
      setAcceptTerms(false)
      
    } catch (err: any) {
      // Enhanced error handling
      let errorMessage = err?.message || 'Authentication failed'
      
      if (err?.message?.includes('verification')) {
        errorMessage = 'Please check your email and verify your account before signing in.'
      } else if (err?.message?.includes('turnstile')) {
        errorMessage = 'Human verification failed. Please try again.'
        setTurnstileError('Please complete human verification.')
        if (turnstileWidgetId && window.turnstile) {
          window.turnstile.reset(turnstileWidgetId)
        }
      } else if (err?.message?.includes('already exists')) {
        errorMessage = 'An account with this email already exists. Please sign in instead.'
      } else if (err?.message?.includes('Invalid email')) {
        errorMessage = 'Please enter a valid email address.'
      } else if (err?.message?.includes('Password')) {
        errorMessage = 'Password does not meet requirements. Please use a stronger password.'
      }
      
      setAuthError(errorMessage)
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Signup Success Component
  const SignupSuccess = () => (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{
        margin: '0 auto',
        width: '64px',
        height: '64px',
        backgroundColor: 'var(--chatty-status-success)',
        opacity: 0.2,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px'
      }}>
        <svg style={{ width: '32px', height: '32px', color: 'var(--chatty-status-success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h2 style={{
        fontSize: '24px',
        fontWeight: 700,
        color: 'var(--chatty-text)',
        marginBottom: '16px'
      }}>
        Account Created Successfully! 🎉
      </h2>
      
      <p style={{
        color: 'var(--chatty-text)',
        opacity: 0.8,
        marginBottom: '24px'
      }}>
        We've sent a verification email to <strong>{email}</strong>. Please check your inbox and click the verification link to activate your account.
      </p>
      
      <div style={{
        backgroundColor: 'var(--chatty-bg-main)',
        border: '1px solid var(--chatty-line)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
        textAlign: 'left'
      }}>
        <h3 style={{
          fontWeight: 600,
          color: 'var(--chatty-text)',
          marginBottom: '8px',
          fontSize: '14px'
        }}>Next Steps:</h3>
        <ul style={{
          fontSize: '12px',
          color: 'var(--chatty-text)',
          opacity: 0.8,
          listStyle: 'none',
          padding: 0,
          margin: 0
        }}>
          <li style={{ marginBottom: '4px' }}>• Check your email inbox (and spam folder)</li>
          <li style={{ marginBottom: '4px' }}>• Click the verification link in the email</li>
          <li>• Return here to sign in with your new account</li>
        </ul>
      </div>
      
      <button
        onClick={() => {
          setSignupSuccess(false)
          setMode('login')
          setEmail('')
        }}
        style={{
          width: '320px',
          padding: '8px 0',
          borderRadius: '9999px',
          border: '1px solid var(--chatty-button)',
          fontWeight: 600,
          transition: 'all 0.2s',
          backgroundColor: 'var(--chatty-button)',
          color: 'var(--chatty-text-inverse)',
          cursor: 'pointer'
        }}
      >
        Continue to Sign In
      </button>
    </div>
  )

  // OAuth wrapper functions with signup validation
  const handleOAuthLogin = (provider: string, loginFunction: () => void) => {
    if (mode === 'signup') {
      // Check if user has accepted terms
      if (!acceptTerms) {
        setAuthError('Please accept the Chatty Terms of Service before continuing.');
        return;
      }
      if (!acceptVVAULTTerms) {
        setAuthError('Please accept the VVAULT Terms of Service before continuing.');
        return;
      }
      
      // Check if Turnstile verification is complete
      if (!turnstileToken) {
        setAuthError('Please complete human verification before continuing.');
        return;
      }
      
      // Show confirmation dialog for OAuth signup
      const confirmed = window.confirm(
        `By continuing with ${provider}, you agree to the Terms of Service and Privacy Notice. Continue?`
      );
      
      if (!confirmed) {
        return;
      }
    }
    
    // Proceed with OAuth login
    loginFunction();
  };

  const AuthButtons = () => {
    // Check if OAuth buttons should be disabled in signup mode
    const isOAuthDisabled = mode === 'signup' && (!acceptTerms || !acceptVVAULTTerms || !turnstileToken);
    
    return (
      <div className="flex flex-col items-center">
        <button 
          onClick={() => handleOAuthLogin('Google', loginWithGoogle)} 
          disabled={isOAuthDisabled}
          className="w-80 py-2 mb-[2px] rounded-full border transition-colors flex items-center justify-center gap-3 font-semibold hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderColor: '#000000', backgroundColor: '#000000', color: '#ffffff' }}
        >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <button 
        onClick={() => handleOAuthLogin('Microsoft', loginWithMicrosoft)} 
        disabled={isOAuthDisabled}
        className="w-80 py-2 mb-[2px] rounded-full border transition-colors flex items-center justify-center gap-3 font-semibold hover:bg-[#0078d4] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderColor: '#0078d4', backgroundColor: '#0078d4', color: '#ffffff' }}
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#ffffff" d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
        </svg>
        Continue with Microsoft
      </button>

      <button 
        onClick={() => handleOAuthLogin('Apple', loginWithApple)} 
        disabled={isOAuthDisabled}
        className="w-80 py-2 mb-[2px] rounded-full border transition-colors flex items-center justify-center gap-3 font-semibold hover:bg-[#000000] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderColor: '#000000', backgroundColor: '#000000', color: '#ffffff' }}
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#ffffff" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Continue with Apple
      </button>

      <button 
        onClick={() => handleOAuthLogin('GitHub', loginWithGithub)} 
        disabled={isOAuthDisabled}
        className="w-80 py-2 rounded-full border transition-colors flex items-center justify-center gap-3 font-semibold hover:bg-[#24292e] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderColor: '#24292e', backgroundColor: '#24292e', color: '#ffffff' }}
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        Continue with GitHub
      </button>
      
      {/* Show helpful message when OAuth buttons are disabled */}
      {isOAuthDisabled && (
        <div className="mt-3 text-xs text-center opacity-70" style={{ color: 'var(--chatty-text)' }}>
          Complete the form above to enable OAuth signup
        </div>
      )}
    </div>
  )
  }

  // Redirect to /app when user is logged in (useEffect to prevent render loop)
  const hasRedirectedRef = React.useRef(false);
  useEffect(() => {
    if (user && !isLoading && !hasRedirectedRef.current) {
      // Only redirect if we're on the root path
      const currentPath = window.location.pathname;
      if (currentPath === '/' || currentPath === '') {
        hasRedirectedRef.current = true;
        console.log('➡️ [App.tsx] User exists; redirecting to /app');
        window.location.replace('/app');
      }
    }
    // Reset redirect flag if user becomes null
    if (!user) {
      hasRedirectedRef.current = false;
    }
  }, [user, isLoading]);

  // Debug logging at render time
  console.log('🔍 [App.tsx] Render - isLoading:', isLoading, 'user:', user ? `${user.email} (${user.sub || 'no-id'})` : 'null');

  if (isLoading) {
    console.log('⏳ [App.tsx] Rendering loading state');
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
        <div className="opacity-70">Loading…</div>
      </div>
    )
  }

  if (user) {
    // Show loading while redirect happens
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
        <div className="opacity-70">Redirecting…</div>
      </div>
    )
  }

  console.log('🔐 [App.tsx] Showing login/signup screen');

  // Simple login screen
  return (
    <>
      <style>{`
        input::placeholder {
          color: var(--chatty-button) !important;
        }
        
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px var(--chatty-bg-main) inset !important;
          -webkit-text-fill-color: var(--chatty-text) !important;
          background-color: var(--chatty-bg-main) !important;
        }
      `}</style>
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
      <div style={{
        width: '420px',
        maxWidth: '100%',
        backgroundColor: 'var(--chatty-bg-sidebar)',
        borderRadius: '12px',
        padding: '0px 24px 24px 24px',
        boxShadow: '0 10px 30px rgba(0,0,0,.15)'
      }}>
        {/* Chatty Logo */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
          marginTop: '0px'
        }}>
          <img 
            src="/assets/Chatty.png" 
            alt="Chatty" 
            style={{
              height: '64px',
              width: 'auto',
              maxWidth: '100%',
              display: 'block'
            }}
          />
        </div>
        <p className="opacity-75 mb-6 text-center">Activate the ultimate you</p>

        {/* Show signup success if applicable */}
        {signupSuccess ? (
          <SignupSuccess />
        ) : (
          <>
            {/* OAuth Buttons - shown first in both login and signup modes */}
            <AuthButtons />
            <div className="text-center my-4 opacity-60 text-sm">
              <span>or</span>
            </div>

            {/* Manual form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm opacity-70 mb-2">Name</label>
              <input
                className="w-full px-3 py-2 rounded-lg outline-none focus:ring-2"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-main)', 
                  color: 'var(--chatty-text)',
                  '--tw-ring-color': 'var(--chatty-button)'
                } as any}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}

          {mode === 'login' && lastEmailHint && (
            <div className="mb-4 p-3 border rounded-lg flex items-center justify-between"
              style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-bg-main)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--chatty-highlight)', color: 'var(--chatty-text)' }}>
                  {lastEmailHint.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--chatty-text)' }}>{lastEmailHint}</div>
                  <div className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Last used on this device</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
                  onClick={() => {
                    setEmail(lastEmailHint)
                    passwordInputRef.current?.focus()
                  }}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--chatty-text)' }}
                  onClick={() => {
                    localStorage.removeItem('auth:lastEmail')
                    setLastEmailHint('')
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm opacity-70 mb-2">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 rounded-lg outline-none focus:ring-2"
              style={{ 
                backgroundColor: 'var(--chatty-bg-main)', 
                color: 'var(--chatty-text)',
                '--tw-ring-color': 'var(--chatty-button)'
              } as any}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div style={mode === 'login' ? { marginBottom: '36px' } : {}}>
            <label className="block text-sm opacity-70 mb-2">Password</label>
            <input
              type="password"
              ref={passwordInputRef}
              className="w-full px-3 py-2 rounded-lg outline-none focus:ring-2"
              style={{ 
                backgroundColor: 'var(--chatty-bg-main)', 
                color: 'var(--chatty-text)',
                '--tw-ring-color': 'var(--chatty-button)'
              } as any}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm opacity-70 mb-2">Confirm Password</label>
                <input
                type="password"
                className="w-full px-3 py-2 rounded-lg outline-none focus:ring-2"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-main)', 
                  color: 'var(--chatty-text)',
                  '--tw-ring-color': 'var(--chatty-button)'
                } as any}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              {/* Live password confirmation validation feedback */}
              {confirmPassword && password && (
                <div className="mt-1 text-xs">
                  {password === confirmPassword ? (
                    <span style={{ color: 'var(--chatty-status-success, #22c55e)' }}>
                      ✓ Passwords match
                    </span>
                  ) : (
                    <span style={{ color: 'var(--chatty-status-error, #dc2626)' }}>
                      ✗ Passwords do not match
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Cloudflare Turnstile for signup - appears BEFORE Terms checkboxes */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <div id="turnstile-widget" className="flex justify-center"></div>
              {turnstileError && (
                <div style={{
                  fontSize: '12px',
                  color: 'var(--chatty-text)',
                  textAlign: 'center',
                  backgroundColor: 'var(--chatty-bg-main)',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--chatty-line)'
                }}>
                  {turnstileError}
                </div>
              )}
            </div>
          )}

          {/* Terms of Service checkboxes for signup - appear AFTER Turnstile */}
          {mode === 'signup' && (
            <>
              <label className="flex items-start gap-3 text-sm opacity-80">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border"
                  style={{
                    borderColor: 'var(--chatty-line)',
                    accentColor: 'var(--chatty-button)',
                  } as any}
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                <span>
                  By continuing, I confirm I understand and agree to the{' '}
                  <a
                    href="/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    Chatty Terms of Service
                  </a>{' '}
                  and the{' '}
                  <a
                    href="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    Chatty Privacy Notice
                  </a>
                  . If I am in the EEA or UK, I have read and agree to the{' '}
                  <a
                    href="/legal/eeccd"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    European Electronic Communications Code Disclosure
                  </a>
                  .
                </span>
              </label>
              
              <label className="flex items-start gap-3 text-sm opacity-80">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border"
                  style={{
                    borderColor: 'var(--chatty-line)',
                    accentColor: 'var(--chatty-button)',
                  } as any}
                  checked={acceptVVAULTTerms}
                  onChange={(e) => setAcceptVVAULTTerms(e.target.checked)}
                />
                <span>
                  By continuing, I confirm I understand and agree to the{' '}
                  <a
                    href="/vvault-terms.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    V²AULT Terms of Service
                  </a>{' '}
                  and the{' '}
                  <a
                    href="/vvault-privacy.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    V²AULT Privacy Notice
                  </a>
                  . If I am in the EEA or UK, I have read and agree to the{' '}
                  <a
                    href="/vvault-eeccd.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    European Electronic Communications Code Disclosure
                  </a>
                  .
                </span>
              </label>
            </>
          )}

          {authError && (
            <div style={{
              backgroundColor: 'var(--chatty-bg-main)',
              border: '1px solid var(--chatty-line)',
              color: 'var(--chatty-text)',
              padding: '8px 10px',
              borderRadius: '8px',
              marginBottom: '10px',
              fontSize: '12px'
            }}>
              {authError}
            </div>
          )}

          <div className="flex justify-center">
            <button 
              type="submit" 
              disabled={isAuthenticating}
              className="w-80 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: 'var(--chatty-button)', 
                color: 'var(--chatty-text-inverse)',
                border: 'none'
              }}
            >
              {isAuthenticating ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </div>
              ) : (
                mode === 'login' ? 'Sign in' : 'Create account'
              )}
          </button>
          </div>
        </form>

            <div className="mt-6 text-center opacity-85" style={{ marginBottom: '25px' }}>
          {mode === 'login' ? (
            <span>
              New here?{' '}
                  <a 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); setMode('signup'); setAuthError(''); setConfirmPassword(''); setAcceptTerms(false); setSignupSuccess(false) }} 
                    className="font-semibold hover:underline"
                  >
                Create an account
              </a>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
                  <a 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); setMode('login'); setAuthError(''); setConfirmPassword(''); setAcceptTerms(false); setSignupSuccess(false) }} 
                    className="font-semibold hover:underline"
                  >
                Sign in
              </a>
            </span>
          )}
        </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
