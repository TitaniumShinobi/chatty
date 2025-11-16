import React, { useState, useEffect } from 'react'
import { Database, FileText, Users, Clock, CheckCircle, AlertCircle, RefreshCw, Link2, ExternalLink, Unlink } from 'lucide-react'

interface VVAULTStats {
  totalUsers: number
  totalSessions: number
  totalTranscripts: number
  lastUpdated: string
  status: 'connected' | 'disconnected' | 'error'
}

interface VVAULTAccountStatus {
  linked: boolean
  vvaultUserId: string | null
  vvaultPath: string | null
  linkedAt: string | null
  chattyEmail: string
}

export default function VVAULTPage() {
  const [stats, setStats] = useState<VVAULTStats>({
    totalUsers: 0,
    totalSessions: 0,
    totalTranscripts: 0,
    lastUpdated: '',
    status: 'disconnected'
  })
  const [isLoading, setIsLoading] = useState(true)
  const [recentTranscripts, setRecentTranscripts] = useState<any[]>([])
  const [accountStatus, setAccountStatus] = useState<VVAULTAccountStatus | null>(null)
  const [isLinking, setIsLinking] = useState(false)

  // Fetch VVAULT account linking status
  useEffect(() => {
    const fetchAccountStatus = async () => {
      try {
        // Wait for backend to be ready before making requests
        const { waitForBackendReady } = await import('../lib/backendReady');
        try {
          await waitForBackendReady(5, (attempt) => {
            if (attempt === 1) {
              console.log('⏳ [VVAULTPage] Waiting for backend to be ready...');
            }
          });
        } catch (error) {
          console.warn('⚠️ [VVAULTPage] Backend readiness check failed, continuing anyway:', error);
        }

        const response = await fetch('/api/vvault/account/status', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setAccountStatus(data)
          // Only fetch stats if account is linked
          if (data.linked) {
            fetchVVAULTData()
          } else {
            setIsLoading(false)
          }
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Failed to fetch VVAULT account status:', error)
        setIsLoading(false)
      }
    }

    fetchAccountStatus()
  }, [])

  // Fetch VVAULT data (only if account is linked)
  const fetchVVAULTData = async () => {
    setIsLoading(true)
    try {
      // In a real implementation, this would call the VVAULT API
      // For now, we'll simulate the data
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setStats({
        totalUsers: 3,
        totalSessions: 5,
        totalTranscripts: 12,
        lastUpdated: new Date().toISOString(),
        status: 'connected'
      })
      
      setRecentTranscripts([
        {
          id: '1',
          user: 'user@example.com',
          session: 'session_123',
          role: 'user',
          content: 'Hello! This is a test message...',
          timestamp: new Date().toISOString()
        },
        {
          id: '2',
          user: 'user@example.com',
          session: 'session_123',
          role: 'assistant',
          content: 'Hello! I received your test message...',
          timestamp: new Date().toISOString()
        }
      ])
    } catch (error) {
      setStats(prev => ({ ...prev, status: 'error' }))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinkAccount = () => {
    // Open VVAULT login in new tab
    const vvaultUrl = process.env.VITE_VVAULT_URL || 'http://localhost:8000'
    window.open(`${vvaultUrl}/login`, '_blank')
    
    // Show instructions
    setIsLinking(true)
  }

  const handleUnlinkAccount = async () => {
    try {
      const response = await fetch('/api/vvault/account/unlink', {
        method: 'POST',
        credentials: 'include'
      })
      
      if (response.ok) {
        // Refresh account status
        const statusResponse = await fetch('/api/vvault/account/status', {
          credentials: 'include'
        })
        if (statusResponse.ok) {
          const data = await statusResponse.json()
          setAccountStatus(data)
        }
      }
    } catch (error) {
      console.error('Failed to unlink VVAULT account:', error)
    }
  }

  const getStatusIcon = () => {
    switch (stats.status) {
      case 'connected':
        return <CheckCircle size={16} className="text-green-500" />
      case 'error':
        return <AlertCircle size={16} className="text-red-500" />
      default:
        return <AlertCircle size={16} className="text-yellow-500" />
    }
  }

  const getStatusText = () => {
    switch (stats.status) {
      case 'connected':
        return 'Connected'
      case 'error':
        return 'Error'
      default:
        return 'Disconnected'
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--chatty-bg-main)] text-[var(--chatty-text)] relative">
      {/* Custom CSS for watermark animation */}
      <style jsx>{`
        @keyframes vvault-pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.35; }
        }
        .vvault-watermark {
          animation: vvault-pulse 4s ease-in-out infinite;
        }
      `}</style>
      
      {/* VVAULT Glyph Watermark */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <img
          src="/assets/vvault_glyph.png"
          alt="VVAULT Glyph"
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 vvault-watermark"
          style={{
            width: '60%',
            height: 'auto',
            maxWidth: '800px',
            filter: 'grayscale(100%) drop-shadow(0 0 20px rgba(173, 165, 135, 0.3))',
            opacity: 0.2
          }}
        />
      </div>

      {/* Header */}
      <div className="border-b border-[var(--chatty-line)] p-6 relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
              V<sup>2</sup>AULT
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Secure AI memory system storing all Chatty conversations
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              {getStatusText()}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto relative" style={{ zIndex: 1 }}>
        {/* Account Linking Status */}
        {accountStatus && !accountStatus.linked && (
          <div className="mb-6 rounded-lg border-2 border-yellow-500/50 p-6" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.9 }}>
            <div className="flex items-start gap-4">
              <AlertCircle size={24} className="text-yellow-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>
                  VVAULT Account Not Linked
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                  VVAULT is a separate service that can be used with any LLM provider (ChatGPT, Gemini, Claude, etc.). 
                  Link your VVAULT account to store Chatty conversations.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleLinkAccount}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{ 
                      backgroundColor: 'var(--chatty-button)', 
                      color: 'var(--chatty-text)'
                    }}
                  >
                    <Link2 size={16} />
                    Link VVAULT Account
                    <ExternalLink size={14} />
                  </button>
                  {isLinking && (
                    <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      After logging into VVAULT, return here and refresh to complete linking.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Linked Account Info */}
        {accountStatus && accountStatus.linked && (
          <div className="mb-6 rounded-lg border border-green-500/50 p-4" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.9 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-500" />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    VVAULT Account Linked
                  </p>
                  <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                    VVAULT User ID: {accountStatus.vvaultUserId}
                  </p>
                  {accountStatus.linkedAt && (
                    <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      Linked: {new Date(accountStatus.linkedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleUnlinkAccount}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
                style={{ 
                  backgroundColor: 'var(--chatty-button)', 
                  color: 'var(--chatty-text)'
                }}
              >
                <Unlink size={14} />
                Unlink
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
            <span className="ml-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Loading VVAULT data...
            </span>
          </div>
        ) : accountStatus && !accountStatus.linked ? (
          <div className="text-center py-12">
            <Database size={48} className="mx-auto mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>
              No VVAULT Account Linked
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Link your VVAULT account to start storing conversations
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-4 border border-[var(--chatty-line)]" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.5 }}>
                <div className="flex items-center gap-3" style={{ opacity: 1 }}>
                  <Users size={20} className="text-blue-500" style={{ opacity: 1 }} />
                  <div>
                    <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                      Total Users
                    </p>
                    <p className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)', opacity: 1 }}>{stats.totalUsers}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg p-4 border border-[var(--chatty-line)]" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.5 }}>
                <div className="flex items-center gap-3" style={{ opacity: 1 }}>
                  <Database size={20} className="text-green-500" style={{ opacity: 1 }} />
                  <div>
                    <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                      Sessions
                    </p>
                    <p className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)', opacity: 1 }}>{stats.totalSessions}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg p-4 border border-[var(--chatty-line)]" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.5 }}>
                <div className="flex items-center gap-3" style={{ opacity: 1 }}>
                  <FileText size={20} className="text-purple-500" style={{ opacity: 1 }} />
                  <div>
                    <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                      Transcripts
                    </p>
                    <p className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)', opacity: 1 }}>{stats.totalTranscripts}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-lg border border-[var(--chatty-line)]" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.5 }}>
              <div className="p-4 border-b border-[var(--chatty-line)]" style={{ opacity: 1 }}>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--chatty-text)', opacity: 1 }}>Recent Activity</h3>
                <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                  Latest conversations stored in VVAULT
                </p>
              </div>
              <div className="p-4" style={{ opacity: 1 }}>
                {recentTranscripts.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--chatty-text)', opacity: 1 }} />
                    <p style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                      No recent activity
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentTranscripts.map((transcript) => (
                      <div
                        key={transcript.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-[var(--chatty-line)] hover:bg-[var(--chatty-highlight)] transition-colors"
                        style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.3 }}
                      >
                        <div className="w-8 h-8 rounded-full bg-[var(--chatty-button)] flex items-center justify-center" style={{ opacity: 1 }}>
                          <span className="text-xs font-medium" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                            {transcript.role === 'user' ? 'U' : 'A'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0" style={{ opacity: 1 }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                              {transcript.role === 'user' ? 'User' : 'Assistant'}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                              {transcript.user}
                            </span>
                          </div>
                          <p className="text-sm truncate" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                            {transcript.content}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock size={12} style={{ color: 'var(--chatty-text)', opacity: 1 }} />
                            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                              {new Date(transcript.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* VVAULT Info */}
            <div className="rounded-lg border border-[var(--chatty-line)] p-4" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', opacity: 0.5 }}>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--chatty-text)', opacity: 1 }}>About VVAULT</h3>
              <div className="space-y-2 text-sm" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                <p style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                  VVAULT is a secure AI memory system that automatically stores all Chatty conversations
                  in an append-only, immutable format.
                </p>
                <p style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                  <strong>Features:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                  <li style={{ color: 'var(--chatty-text)', opacity: 1 }}>Automatic conversation storage</li>
                  <li style={{ color: 'var(--chatty-text)', opacity: 1 }}>User isolation and privacy</li>
                  <li style={{ color: 'var(--chatty-text)', opacity: 1 }}>Append-only transcripts (no deletions)</li>
                  <li style={{ color: 'var(--chatty-text)', opacity: 1 }}>Session-based organization</li>
                  <li style={{ color: 'var(--chatty-text)', opacity: 1 }}>Emotion score tracking</li>
                </ul>
                <p className="pt-2" style={{ color: 'var(--chatty-text)', opacity: 1 }}>
                  <strong>Last Updated:</strong> {new Date(stats.lastUpdated).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
