import React, { useMemo, useState } from 'react'
import { Copy, ExternalLink, Link2, Mail, X } from 'lucide-react'
import type { ConversationThread } from '../lib/conversationManager'
import { Z_LAYERS } from '../lib/zLayers'

type ShareConversationModalProps = {
  isOpen: boolean
  conversation: ConversationThread | null
  onClose: () => void
}

const PREVIEW_MESSAGE_LIMIT = 12

function extractMessageText(message: any): string {
  if (!message) return ''
  if (typeof message.text === 'string') {
    return message.text
  }
  if (typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message.packets)) {
    return message.packets
      .map((packet: any) => {
        if (packet?.payload?.content) {
          return String(packet.payload.content)
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (Array.isArray(message.messages)) {
    return message.messages.map(extractMessageText).join('\n')
  }
  return ''
}

const getRoleLabel = (role: any) => {
  if (role === 'assistant') return 'Chatty'
  if (role === 'system') return 'System'
  return 'You'
}

const ShareConversationModal: React.FC<ShareConversationModalProps> = ({
  isOpen,
  conversation,
  onClose
}) => {
  const [copied, setCopied] = useState(false)

  const previewMessages = useMemo(() => {
    if (!conversation?.messages) return []
    const messages = Array.isArray(conversation.messages) ? conversation.messages : []
    return messages.slice(Math.max(messages.length - PREVIEW_MESSAGE_LIMIT, 0))
  }, [conversation])

  const shareText = useMemo(() => {
    if (!conversation) return ''
    const header = `Conversation: ${conversation.title || 'Untitled conversation'}`
    const bodyLines = previewMessages.map((message: any) => {
      const role = getRoleLabel(message.role)
      const text = extractMessageText(message)
      return `${role}: ${text}`
    })
    return [header, ...bodyLines].join('\n\n')
  }, [conversation, previewMessages])

  if (!isOpen || !conversation) {
    return null
  }

  const encodedBody = encodeURIComponent(shareText)
  const encodedSubject = encodeURIComponent(conversation.title || 'Chatty conversation')

  const shareTargets = [
    {
      key: 'copy',
      label: copied ? 'Copied!' : 'Copy to clipboard',
      icon: Copy,
      action: async () => {
        try {
          await navigator.clipboard.writeText(shareText)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch (error) {
          console.warn('Clipboard unavailable, falling back to legacy copy.', error)
          const textarea = document.createElement('textarea')
          textarea.value = shareText
          textarea.style.position = 'fixed'
          textarea.style.top = '-9999px'
          document.body.appendChild(textarea)
          textarea.focus()
          textarea.select()
          try {
            document.execCommand('copy')
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          } finally {
            document.body.removeChild(textarea)
          }
        }
      }
    },
    {
      key: 'gmail',
      label: 'Open Gmail draft',
      icon: Mail,
      action: () => {
        const url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedSubject}&body=${encodedBody}`
        window.open(url, '_blank', 'noopener')
      }
    },
    {
      key: 'mailto',
      label: 'Mail app',
      icon: Link2,
      action: () => {
        const url = `mailto:?subject=${encodedSubject}&body=${encodedBody}`
        window.open(url, '_blank')
      }
    },
    {
      key: 'notion',
      label: 'Open in Notion',
      icon: ExternalLink,
      action: () => {
        const url = `https://www.notion.so/new?content=${encodedBody}`
        window.open(url, '_blank', 'noopener')
      }
    }
  ]

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: Z_LAYERS.modal }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--chatty-bg-main)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--chatty-text)' }}>
              Share conversation
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.65 }}>
              Preview the thread and choose how you would like to share it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            aria-label="Close share modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
          <div className="flex flex-wrap gap-2">
            {shareTargets.map(({ key, label, icon: Icon, action }) => (
              <button
                key={key}
                onClick={action}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
                style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ADA587')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ADA587')}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              Conversation preview
            </h3>
          </div>
          <div className="space-y-3">
            {previewMessages.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                This conversation does not have any messages yet.
              </div>
            ) : (
              previewMessages.map((message: any) => {
                const roleLabel = getRoleLabel(message.role)
                const text = extractMessageText(message)
                return (
                  <div
                    key={message.id}
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: message.role === 'assistant' ? '#ffffd7' : '#fffff1',
                      border: '1px solid #ADA587'
                    }}
                  >
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      {roleLabel}
                    </div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--chatty-text)' }}>
                      {text || '—'}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareConversationModal
