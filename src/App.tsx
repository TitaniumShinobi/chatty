// src/App.tsx
import { useEffect, useState } from 'react'
import {
  fetchMe,
  loginWithGoogle,
  loginWithEmail,
  signupWithEmail,
  logout,
  type User,
} from './lib/auth'
import ChattyApp from './ChattyApp'

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
        if (me) setUser(me)
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
      setUser(u); setEmail(''); setPassword(''); setName('')
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed')
    }
  }

  if (isLoading) {
    return (
      <div style={styles.shell}><div style={styles.center}>Loading…</div></div>
    )
  }

  if (user) {
    // Redirect to the app when logged in
    window.location.replace('/app')
    return null
  }

  // Simple login screen
  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <h1 style={styles.title}>Chatty</h1>
        <p style={styles.sub}>Sign in to continue</p>

        <button onClick={loginWithGoogle} style={{ ...styles.button, ...styles.google }}>
          Continue with Google
        </button>

        <div style={styles.divider}><span>or</span></div>

        <form onSubmit={handleEmailAuth} style={styles.form}>
          {mode === 'signup' && (
            <div style={styles.field}>
              <label style={styles.label}>Name</label>
              <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {authError && <div style={styles.error}>{authError}</div>}

          <button type="submit" style={styles.button}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div style={styles.switch}>
          {mode === 'login' ? (
            <span>
              New here?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setAuthError('') }} style={styles.link}>
                Create an account
              </a>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setAuthError('') }} style={styles.link}>
                Sign in
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: '#202123', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  center: { opacity: .7 },
  card: { width: 420, maxWidth: '100%', background: '#2A2B32', border: '1px solid #3A3B42', borderRadius: 12, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,.35)' },
  title: { margin: 0, fontSize: 28, fontWeight: 700 },
  sub: { margin: '6px 0 20px', opacity: .75 },
  button: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #4B4D57', background: '#3A3B42', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  google: { background: '#4285F4', borderColor: '#4285F4' },
  divider: { textAlign: 'center', margin: '14px 0', opacity: .6, fontSize: 12 },
  form: { marginTop: 8 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 12, opacity: .7, marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', background: '#202123', color: '#fff', borderRadius: 8, border: '1px solid #3A3B42', outline: 'none' },
  error: { background: '#3b0f10', border: '1px solid #7f1d1d', color: '#fecaca', padding: '8px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12 },
  switch: { marginTop: 14, textAlign: 'center', opacity: .85 },
  link: { color: '#7ab7ff', textDecoration: 'none' },
}