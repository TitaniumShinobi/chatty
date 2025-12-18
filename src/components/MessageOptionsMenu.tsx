import React, { useState, useRef, useEffect } from 'react'
import { Z_LAYERS } from '../lib/zLayers'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: any[]
  ts: number
  files?: { name: string; size: number }[]
}

interface MessageOptionsMenuProps {
  message: Message
  isUser: boolean
  isLatest: boolean
  messageIndex: number
  threadId: string
  onCopy: (text: string) => void
  onCarryPrompt: (text: string) => void
  onPin: (message: Message, destination?: string) => void
  onRemove: (messageId: string) => void
  onRewind: (messageIndex: number) => void
  onEdit?: (message: Message) => void
  onReport?: (message: Message) => void
  onRequestId?: (message: Message) => void
  alignRight?: boolean // If true, align menu to right edge of button (for construct messages)
}

export function MessageOptionsMenu({
  message,
  isUser,
  isLatest,
  messageIndex,
  threadId,
  onCopy,
  onCarryPrompt,
  onPin,
  onRemove,
  onRewind,
  onEdit,
  onReport,
  onRequestId,
  alignRight = false
}: MessageOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [pinDestination, setPinDestination] = useState('pins.md')
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Extract message text content
  const extractMessageText = (): string => {
    if (isUser) {
      return message.text || ''
    } else {
      // Extract from packets if available
      if (message.packets && Array.isArray(message.packets)) {
        return message.packets
          .map((p: any) => {
            if (p?.payload?.content) {
              return typeof p.payload.content === 'string' ? p.payload.content : ''
            }
            return ''
          })
          .join('\n')
      }
      return message.text || ''
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowPinDialog(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setShowPinDialog(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Calculate menu position to avoid viewport edges
  const getMenuPosition = () => {
    if (!buttonRef.current) {
      return alignRight 
        ? { top: 'auto', bottom: '100%', right: '0' }
        : { top: 'auto', bottom: '100%', left: '0' }
    }
    
    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const menuHeight = 300 // Approximate menu height
    const spaceBelow = viewportHeight - buttonRect.bottom
    const spaceAbove = buttonRect.top

    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      // Position above button
      return alignRight
        ? { bottom: '100%', top: 'auto', right: '0', marginBottom: '4px' }
        : { bottom: '100%', top: 'auto', left: '0', marginBottom: '4px' }
    } else {
      // Position below button
      return alignRight
        ? { top: '100%', bottom: 'auto', right: '0', marginTop: '4px' }
        : { top: '100%', bottom: 'auto', left: '0', marginTop: '4px' }
    }
  }

  const handleCopy = () => {
    const text = extractMessageText()
    onCopy(text)
    setIsOpen(false)
  }

  const handleCarryPrompt = () => {
    const text = extractMessageText()
    onCarryPrompt(text)
    setIsOpen(false)
  }

  const handlePin = () => {
    if (showPinDialog) {
      onPin(message, pinDestination)
      setShowPinDialog(false)
      setIsOpen(false)
    } else {
      setShowPinDialog(true)
    }
  }

  const handleRemove = () => {
    if (confirm('Remove this message? It will be replaced with "[Message Removed]" placeholder.')) {
      onRemove(message.id)
      setIsOpen(false)
    }
  }

  const handleRewind = () => {
    if (confirm(`Rewind conversation to before this message? All messages after this point will be removed.`)) {
      onRewind(messageIndex)
      setIsOpen(false)
    }
  }

  const handleEdit = () => {
    if (onEdit) {
      onEdit(message)
      setIsOpen(false)
    }
  }

  const handleReport = () => {
    if (onReport) {
      onReport(message)
      setIsOpen(false)
    }
  }

  const handleRequestId = () => {
    if (onRequestId) {
      onRequestId(message)
      setIsOpen(false)
    }
  }

  const menuPosition = getMenuPosition()

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Triple-dot button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10"
        style={{ color: 'var(--chatty-text)' }}
        aria-label="Message options"
        title="Message options"
      >
        <span className="text-lg leading-none">⋮</span>
      </button>

      {/* Popup menu */}
      {isOpen && (
        <div
          className="absolute min-w-[200px] rounded-lg shadow-lg border"
          style={{
            ...menuPosition,
            backgroundColor: 'var(--chatty-bg-main)',
            borderColor: 'var(--chatty-line)',
            zIndex: Z_LAYERS.popover,
            position: 'absolute'
          }}
        >
          {showPinDialog ? (
            <div className="p-3">
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Pin to file:
              </div>
              <select
                value={pinDestination}
                onChange={(e) => setPinDestination(e.target.value)}
                className="w-full p-2 rounded border text-sm mb-2"
                style={{
                  backgroundColor: 'var(--chatty-bg-main)',
                  borderColor: 'var(--chatty-line)',
                  color: 'var(--chatty-text)'
                }}
              >
                <option value="pins.md">pins.md</option>
                <option value="vault_notes.md">vault_notes.md</option>
                <option value="logbook.json">logbook.json</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handlePin}
                  className="flex-1 px-3 py-1.5 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--chatty-button)',
                    color: 'var(--chatty-text-inverse, #ffffeb)'
                  }}
                >
                  Pin
                </button>
                <button
                  onClick={() => {
                    setShowPinDialog(false)
                  }}
                  className="px-3 py-1.5 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--chatty-button)',
                    color: 'var(--chatty-text)'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {/* Common actions */}
              <button
                onClick={handleCopy}
                className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Copy
              </button>

              {isUser && (
                <button
                  onClick={handleCarryPrompt}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                  style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Carry Prompt
                </button>
              )}

              <button
                onClick={handlePin}
                className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Pin
              </button>

              <button
                onClick={handleRemove}
                className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Remove Message
              </button>

              <button
                onClick={handleRewind}
                className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Rewind
              </button>

              {/* User-only actions */}
              {isUser && isLatest && onEdit && (
                <button
                  onClick={handleEdit}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                  style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Edit
                </button>
              )}

              {/* Construct-only actions */}
              {!isUser && (
                <>
                  {onReport && (
                    <button
                      onClick={handleReport}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                      style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      Report
                    </button>
                  )}
                  {onRequestId && (
                    <button
                      onClick={handleRequestId}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-50 transition-colors"
                      style={{ color: 'var(--chatty-text)', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      Request ID
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

