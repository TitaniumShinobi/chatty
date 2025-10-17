// Canonical minimal Layout to restore a single valid file.
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import StorageFailureFallback from './StorageFailureFallback'
import { conversationManager } from '../lib/conversationManager'

export default function Layout() {
  const [storageFailureInfo, setStorageFailureInfo] = useState<any>(null)
  // Sidebar manages its own collapsed state internally; no local state needed here

  useEffect(() => {
    // wire the conversation manager storage failure callback to show UI
    const prev = conversationManager.storageFailureCallback
    conversationManager.storageFailureCallback = (info: any) => {
      setStorageFailureInfo(info)
    }
    return () => {
      conversationManager.storageFailureCallback = prev
    }
  }, [])

  function closeStorageFailure() {
    setStorageFailureInfo(null)
  }

  return (
    <div className="min-h-screen flex bg-white text-slate-900">
      <Sidebar
        conversations={[]}
        currentConversationId={null}
        onConversationSelect={() => {}}
        onNewConversation={() => {}}
        onNewConversationWithGPT={() => {}}
        onDeleteConversation={() => {}}
        onUpdateConversation={() => {}}
        onShowGPTCreator={() => {}}
        onShowGPTs={() => {}}
        currentUser={undefined}
        onLogout={() => {}}
        onShowSettings={() => {}}
      />

      <div className="flex-1 relative">
        <Outlet context={{
          threads: [],
          sendMessage: (_threadId: string, _text: string, _files: File[]) => {},
          renameThread: (_threadId: string, _title: string) => {},
          newThread: () => {}
        }} />
      </div>

      {storageFailureInfo && (
        <StorageFailureFallback info={storageFailureInfo} onClose={closeStorageFailure} />
      )}
    </div>
  )
}
