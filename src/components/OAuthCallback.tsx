import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const code = searchParams.get('code')
      const error = searchParams.get('error')
      const state = searchParams.get('state')

      if (error) {
        // Handle OAuth error
        window.opener?.postMessage({
          type: 'oauth-callback',
          provider: 'google',
          success: false,
          error: error
        }, window.location.origin)
        window.close()
        return
      }

      if (code) {
        // The backend callback should have already processed the code and set the cookie
        // Now we need to check if the user is authenticated
        try {
          const response = await fetch('/api/me', { credentials: 'include' })
          const data = await response.json()
          
          if (response.ok && data.ok) {
            // Success - send user data to parent window
            window.opener?.postMessage({
              type: 'oauth-callback',
              provider: 'google',
              success: true,
              user: data.user
            }, window.location.origin)
          } else {
            // Error - authentication failed
            window.opener?.postMessage({
              type: 'oauth-callback',
              provider: 'google',
              success: false,
              error: 'Authentication failed'
            }, window.location.origin)
          }
        } catch (error) {
          // Network error
          window.opener?.postMessage({
            type: 'oauth-callback',
            provider: 'google',
            success: false,
            error: 'Network error'
          }, window.location.origin)
        }
      }

      // Close the popup
      window.close()
    }

    handleOAuthCallback()
  }, [searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--chatty-button)' }}></div>
        <p style={{ color: 'var(--chatty-text)' }}>Completing authentication...</p>
      </div>
    </div>
  )
}

export default OAuthCallback
