import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const state = searchParams.get('state')

    if (error) {
      console.error('OAuth error:', error)
      navigate('/?error=' + encodeURIComponent(error))
      return
    }

    if (!code) {
      navigate('/?error=no_code')
      return
    }

    // Always use full browser navigation so backend can complete callback + cookie flow.
    const callbackParams = new URLSearchParams({ code })
    if (state) callbackParams.set('state', state)
    window.location.replace(`/api/auth/google/callback?${callbackParams.toString()}`)
  }, [searchParams, navigate])

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--chatty-button)' }}></div>
        <p style={{ color: 'var(--chatty-text)' }}>Completing authentication...</p>
      </div>
    </div>
  )
}

export default OAuthCallback
