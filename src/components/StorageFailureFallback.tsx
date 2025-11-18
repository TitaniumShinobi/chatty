import { conversationManager } from '../lib/conversationManager'
import { Z_LAYERS } from '../lib/zLayers'

export default function StorageFailureFallback({
  info,
  onClose,
}: {
  info: { reason: string; key?: string; sizeBytes?: number } | null
  onClose: () => void
}) {
  if (!info) return null

  const stats = conversationManager.getStorageStats()

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z_LAYERS.critical }}>
      <div style={{ width: 560, background: '#fff9ec', border: '1px solid #f3e0b3', borderRadius: 8, padding: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}>
        <h3 style={{ margin: 0, marginBottom: 8, color: '#1f2937' }}>Something went wrong</h3>
        <p style={{ marginTop: 0, marginBottom: 12, color: '#374151' }}>It looks like your browser's storage is full or a storage operation failed. This can happen when you have a lot of conversations.</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => {
              // Emergency cleanup: remove legacy backups then reload
              try {
                conversationManager.triggerEmergencyCleanup()
              } catch (e) {
                console.warn('Emergency cleanup failed', e)
              }
              window.location.reload()
            }}
            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 6, cursor: 'pointer' }}
          >
            🧯 Emergency Cleanup & Reload
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: 6, cursor: 'pointer' }}
          >
            Try Reloading
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <button
            onClick={() => conversationManager.backupAllLocalStorage()}
            style={{ background: '#e5e7eb', color: '#111827', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
          >
            Download localStorage snapshot
          </button>

          <button
            onClick={() => {
              // Show technical details in console
              console.info('Storage failure info:', info)
              console.info('Storage stats:', stats)
              onClose()
            }}
            style={{ background: 'transparent', color: '#6b7280', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
          >
            Technical Details
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#6b7280' }}>
          <div>Reason: {info.reason}</div>
          {info.key && <div>Key: {info.key}</div>}
          {info.sizeBytes !== undefined && <div>Size: {info.sizeBytes} bytes</div>}
          <div style={{ marginTop: 8 }}>Storage keys: {stats.totalKeys} total, {stats.chattyKeys} chatty keys</div>
        </div>
      </div>
    </div>
  )
}
