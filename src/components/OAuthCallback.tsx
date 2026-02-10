import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const code = searchParams.get('code')
      const error = searchParams.get('error')

      if (error) {
        // Handle OAuth error - redirect back to login with error
        console.error('OAuth error:', error)
        navigate('/?error=' + encodeURIComponent(error))
        return
      }

      if (code) {
        // Forward the OAuth code to the backend to exchange for tokens
        // The backend will process the code, set the cookie, and we'll check auth status
        try {
          // The backend callback endpoint will handle the code exchange
          // Since we're on the frontend, we need to let the backend handle it via proxy
          // The Vite proxy will forward /api/auth/google/callback to the backend
          // So we just need to wait for the backend to process it
          // Actually, the backend route should handle this, but since we're on frontend route,
          // we need to manually trigger the backend callback
          
          // Fetch the backend callback endpoint with the code
          const callbackUrl = `/api/auth/google/callback?code=${encodeURIComponent(code)}${searchParams.get('state') ? '&state=' + encodeURIComponent(searchParams.get('state')!) : ''}`
          
          // The backend will process and redirect, but we're already on the frontend
          // So we need to check auth status after a brief delay
          const response = await fetch(callbackUrl, { 
            credentials: 'include',
            redirect: 'manual' // Don't follow redirects, we'll handle it
          })
          
          // If backend redirected (302), follow it
          if (response.type === 'opaqueredirect' || response.status === 302 || response.status === 0) {
            // Backend processed and redirected, check auth
            setTimeout(async () => {
              const meResponse = await fetch('/api/me', { credentials: 'include' })
              const meData = await meResponse.json()
              
              if (meResponse.ok && meData.ok && meData.user) {
                console.log('✅ OAuth success, redirecting to /app')
                navigate('/app')
              } else {
                console.error('Authentication failed after callback:', meData)
                navigate('/?error=authentication_failed')
              }
            }, 500)
          } else {
            // Check auth status directly
            const meResponse = await fetch('/api/me', { credentials: 'include' })
            const meData = await meResponse.json()
            
            if (meResponse.ok && meData.ok && meData.user) {
              console.log('✅ OAuth success, redirecting to /app')
              navigate('/app')
            } else {
              console.error('Authentication failed:', meData)
              navigate('/?error=authentication_failed')
            }
          }
        } catch (error) {
          // Network error
          console.error('Network error during OAuth callback:', error)
          navigate('/?error=network_error')
        }
      } else {
        // No code parameter - redirect back to login
        navigate('/?error=no_code')
      }
    }

    handleOAuthCallback()
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
