import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { fetchMe, logout } from '../lib/auth'
import { conversationManager, type ConversationThread } from '../lib/conversationManager'
import StorageFailureFallback from './StorageFailureFallback'
import { runFullMigration } from '../lib/migration'
// import icons etc as needed...

type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: import('../types').AssistantPacket[]
  ts: number
  files?: { name: string; size: number }[]
  typing?: boolean
}
type Thread = { id: string; title: string; messages: Message[] }

export default function Layout() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [threads, setThreads] = useState<Thread[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [storageFailureInfo, setStorageFailureInfo] = useState<any>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()

  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/)
    return match ? match[1] : null
  }, [location.pathname])

  // Load user session
  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe()
        if (!me) {
          navigate('/')
        } else {
          setUser(me)
        }
      } catch (err) {
        console.error('Auth error:', err)
        navigate('/')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [navigate])

  // Load conversations after user is loaded
  useEffect(() => {
    if (user && user.sub) {
      setIsRecovering(true)
      runFullMigration(user)
      conversationManager.loadUserConversations(user)
        .then((recovered) => {
          setThreads(recovered)
        })
        .catch((err) => {
          console.error('Load conversations error:', err)
          setThreads([])
        })
        .finally(() => {
          setIsRecovering(false)
        })
    }
  }, [user])

  // Save whenever threads change
  useEffect(() => {
    if (user && user.sub && threads.length > 0) {
      conversationManager.saveUserConversations(user, threads)
        .catch(err => console.error('Save failure:', err))
    }
  }, [threads, user])

  async function handleLogout() {
    if (user && user.sub) {
      conversationManager.clearUserData(user.sub)
    }
    await logout()
    navigate('/')
  }

  if (isLoading) {
    return <div>Loading…</div>
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-[#ffffeb]">
      <aside className="w-64 border-r bg-[#ffffd7] border-[#E1C28B] flex flex-col">
        {/* Top Logo */}
        <div className="flex items-center justify-between p-4">
          <div className="w-8 h-8 rounded-lg overflow-hidden">
            <img src="/assets/chatty_star.png" alt="ChattyStar" className="h-full w-full object-cover" />
          </div>
          <button onClick={handleLogout} className="p-2 text-[#4c3d1e] hover:bg-yellow-100 rounded-md">
            Logout
          </button>
        </div>
        {/* YOU CAN place Sidebar or navigation components here */}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet context={{ threads }} />
      </main>

      <StorageFailureFallback info={storageFailureInfo} onClose={() => setStorageFailureInfo(null)} />
    </div>
  )
}