import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  Trash2,
  Search,
  Library,
  FolderPlus,
  MoreVertical,
  Share2,
  Pencil,
  Archive,
  ArchiveRestore,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  Shield,
  Pin
} from 'lucide-react'
import { AnvilIcon } from './icons/AnvilIcon'
import { SidebarProps, Conversation } from '../types'
import { cn } from '../lib/utils'
import { GPTCreator } from '../lib/gptCreator'
import { ThemeToggleButton } from './ThemeToggleButton'
import { Z_LAYERS } from '../lib/zLayers'
import chattyStar from '../../assets/chatty_star.png'
import starBurst from '../../assets/fourpointstarburst.svg'
import starRay from '../../assets/fourpointray.svg'
import starNova from '../../assets/eightpointnova.svg'

type SyntaxIconProps = {
  size?: number
  dimmed?: boolean
  className?: string
}

const SyntaxIcon: React.FC<SyntaxIconProps> = ({ size = 16, dimmed = false, className }) => (
  <span
    aria-hidden="true"
    className={cn('inline-flex items-center justify-center font-semibold', className)}
    style={{
      width: size,
      height: size,
      fontSize: Math.max(size - 3, 10),
      fontFamily:
        'SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
      color: 'inherit',
      opacity: dimmed ? 0.75 : 1
    }}
  >
    {'</>'}
  </span>
)


const isSynthConversation = (conversation: Conversation): boolean => {
  if (!conversation) return false
  const id = conversation.id || ''
  const title = (conversation.title || '').toLowerCase()
  if (id.startsWith('synth')) return true
  if (title.includes('synth')) return true
  return false
}

const normalizeConstructKey = (value?: string | null): string => {
  if (!value || typeof value !== 'string') return ''
  return value.toLowerCase().replace(/-\d{3,}$/i, '')
}

type SidebarExtraProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  hasBlockingOverlay?: boolean
  selectedRuntime?: any
}

const Sidebar: React.FC<SidebarProps & SidebarExtraProps> = ({
  conversations,
  threads,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onNewConversationWithGPT,
  onDeleteConversation,
  onRenameConversation,
  onArchiveConversation,
  onShareConversation,
  onOpenSearch,
  onOpenProjects,
  currentUser,
  onShowSettings,
  onLogout,
  onShowRuntimeDashboard,
  collapsed: collapsedProp,
  onToggleCollapsed: onToggleCollapsedProp,
  hasBlockingOverlay = false,
  selectedRuntime
}) => {
  const resolvedConversations = useMemo<Conversation[]>(() => {
    if (conversations && conversations.length > 0) {
      return conversations;
    }
    if (threads && threads.length > 0) {
      return threads;
    }
    return (conversations ?? threads ?? []) as Conversation[];
  }, [conversations, threads]);
  useEffect(() => {
    console.log('📚 [Sidebar] Conversations prop updated:', resolvedConversations.length);
  }, [resolvedConversations]);
  const [gptCreator] = useState(() => GPTCreator.getInstance())
  // support either controlled (via prop) or uncontrolled (local state)
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const collapsed = typeof collapsedProp === 'boolean' ? collapsedProp : localCollapsed
  const onToggleCollapsed = onToggleCollapsedProp || (() => setLocalCollapsed(s => !s))
  const navigate = useNavigate()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [profileSrc, setProfileSrc] = useState<string | null>(null)
  const triedFallbackRef = useRef(false)
  const fallbackProfileSrc = currentUser?.sub ? `/api/profile-image/${currentUser.sub}` : null
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const conversationMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const conversationMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const conversationInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const cancelRenameRef = useRef(false)
  const [hoveredConversationId, setHoveredConversationId] = useState<string | null>(null)
  const [isStarHovered, setIsStarHovered] = useState(false)
  const rayRotationDuration = 16
  const burstRotationDuration = 12

  const applyHighlightHover = (
    element: HTMLElement,
    background = 'var(--chatty-highlight)',
    color = 'var(--chatty-highlight-text)'
  ) => {
    element.style.backgroundColor = background
    element.style.color = color
  }

  const resetHighlightHover = (
    element: HTMLElement,
    background = 'transparent',
    color = 'var(--chatty-text)'
  ) => {
    element.style.backgroundColor = background
    element.style.color = color
  }

  useEffect(() => {
    triedFallbackRef.current = false
    if (!currentUser) {
      setProfileSrc(null)
      return
    }
    if (currentUser.picture) {
      setProfileSrc(currentUser.picture)
    } else if (fallbackProfileSrc) {
      setProfileSrc(fallbackProfileSrc)
    } else {
      setProfileSrc(null)
    }
  }, [currentUser, fallbackProfileSrc])

  const handleProfileImageError = () => {
    if (!currentUser) {
      setProfileSrc(null)
      return
    }
    if (!triedFallbackRef.current && fallbackProfileSrc && profileSrc !== fallbackProfileSrc) {
      triedFallbackRef.current = true
      setProfileSrc(fallbackProfileSrc)
      return
    }
    setProfileSrc(null)
  }

  useEffect(() => {
    if (!isUserMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        (menuRef.current && menuRef.current.contains(target)) ||
        (triggerRef.current && triggerRef.current.contains(target))
      ) {
        return
      }
      setIsUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isUserMenuOpen])

  useEffect(() => {
    if (!openConversationMenuId) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const menu = conversationMenuRefs.current[openConversationMenuId]
      const toggle = conversationMenuButtonRefs.current[openConversationMenuId]
      if ((menu && menu.contains(target)) || (toggle && toggle.contains(target))) {
        return
      }
      setOpenConversationMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openConversationMenuId])

  useEffect(() => {
    if (!editingConversationId) return
    cancelRenameRef.current = false
    const input = conversationInputRefs.current[editingConversationId]
    if (input) {
      input.focus()
      input.select()
    }
  }, [editingConversationId])

  useEffect(() => {
    setIsUserMenuOpen(false)
    setOpenConversationMenuId(null)
    setEditingConversationId(null)
    setHoveredConversationId(null)
    setIsStarHovered(false)
  }, [collapsed])

  useEffect(() => {
    if (openConversationMenuId && !resolvedConversations.some(c => c.id === openConversationMenuId)) {
      setOpenConversationMenuId(null)
    }
    if (editingConversationId && !resolvedConversations.some(c => c.id === editingConversationId)) {
      setEditingConversationId(null)
      setDraftTitle('')
    }
    if (hoveredConversationId && !resolvedConversations.some(c => c.id === hoveredConversationId)) {
      setHoveredConversationId(null)
    }
  }, [resolvedConversations, openConversationMenuId, editingConversationId, hoveredConversationId])

  // Address Book: Show ALL conversations (imported + primary)
  // Primary conversation is always at the top (id starts with "primary_")
  const allActive = useMemo(
    () => resolvedConversations.filter(conversation => !conversation.archived),
    [resolvedConversations]
  )

  const runtimeConstructSource = selectedRuntime
    ? selectedRuntime?.metadata?.constructId ||
      selectedRuntime?.constructId ||
      selectedRuntime?.runtimeId ||
      selectedRuntime?.name ||
      ''
    : ''
  const normalizedRuntimeConstruct = useMemo(
    () => normalizeConstructKey(runtimeConstructSource),
    [runtimeConstructSource]
  )
  const runtimeId = selectedRuntime?.runtimeId || ''
  const runtimeIdLower = runtimeId ? runtimeId.toLowerCase() : ''

  const getConversationConstructKey = useCallback((conversation: Conversation) => {
    const idPrefix = typeof conversation.id === 'string' ? conversation.id.split('_')[0] : ''
    const importConstruct = (conversation as any)?.importMetadata?.constructId
    return normalizeConstructKey(
      (conversation as any)?.constructId ||
      importConstruct ||
      idPrefix ||
      (conversation as any)?.runtimeId ||
      ''
    )
  }, [])

  const isPinnedForRuntime = useCallback(
    (conversation: Conversation) => {
      if (!selectedRuntime || !runtimeConstructSource) return false
      return Boolean(
        (conversation as any)?.isPrimary &&
          (conversation as any)?.constructId &&
          (conversation as any).constructId === runtimeConstructSource
      )
    },
    [selectedRuntime, runtimeConstructSource]
  )

  const runtimeFiltered = useMemo(() => {
    const base = [...allActive]
    if (!selectedRuntime) {
      return base
    }
    return base.filter(conversation => {
      if (!runtimeConstructSource) {
        return isPinnedForRuntime(conversation)
      }
      if (isPinnedForRuntime(conversation)) return true
      const convConstruct = getConversationConstructKey(conversation)
      if (normalizedRuntimeConstruct && convConstruct === normalizedRuntimeConstruct) return true
      const importConstruct = normalizeConstructKey((conversation as any)?.importMetadata?.constructId)
      if (normalizedRuntimeConstruct && importConstruct === normalizedRuntimeConstruct) return true
      if (runtimeIdLower) {
        const idLower = typeof conversation.id === 'string' ? conversation.id.toLowerCase() : ''
        if (idLower.includes(runtimeIdLower)) return true
      }
      return false
    })
  }, [
    allActive,
    selectedRuntime,
    isPinnedForRuntime,
    getConversationConstructKey,
    normalizedRuntimeConstruct,
    runtimeIdLower,
    runtimeConstructSource
  ])

  const activeConversations = useMemo(() => {
    const sorted = [...runtimeFiltered]
    sorted.sort((a, b) => {
      const aPinned = isPinnedForRuntime(a)
      const bPinned = isPinnedForRuntime(b)
      if (aPinned && !bPinned) return -1
      if (bPinned && !aPinned) return 1
      const aUpdated =
        typeof a.updatedAt === 'number'
          ? a.updatedAt
          : typeof a.updatedAt === 'string'
            ? new Date(a.updatedAt).getTime()
            : 0
      const bUpdated =
        typeof b.updatedAt === 'number'
          ? b.updatedAt
          : typeof b.updatedAt === 'string'
            ? new Date(b.updatedAt).getTime()
            : 0
      return bUpdated - aUpdated
    })
    return sorted
  }, [runtimeFiltered, isPinnedForRuntime])
  
  const handleConversationClick = (conversationItem: Conversation) => {
    console.log('🔵 [Sidebar] Conversation clicked:', conversationItem.id, conversationItem.title);
    if (editingConversationId) {
      console.log('⚠️ [Sidebar] Ignoring click - editing mode active');
      return
    }
    // Use the conversation ID directly - no special case for Synth
    // The canonical Synth thread has ID 'synth-001_chat_with_synth-001' which should be used directly
    const targetId = conversationItem.id
    if (!targetId) {
      console.warn('⚠️ [Sidebar] No target ID found for conversation:', conversationItem);
      return
    }
    console.log('✅ [Sidebar] Navigating to:', targetId);
    onConversationSelect(targetId)
  }
  const starButtonLabel = collapsed ? 'Expand sidebar' : 'Go to Chatty home'

  const handleStarClick = () => {
    if (collapsed) {
      onToggleCollapsed()
      setIsStarHovered(false)
      return
    }
    navigate('/app')
  }

  const startRename = (conversationId: string, currentTitle: string) => {
    setOpenConversationMenuId(null)
    setEditingConversationId(conversationId)
    setDraftTitle(currentTitle || 'Untitled conversation')
    cancelRenameRef.current = false
  }

  const commitRename = () => {
    if (!editingConversationId) return
    const trimmed = draftTitle.trim()
    onRenameConversation?.(editingConversationId, trimmed || 'Untitled conversation')
    cancelRenameRef.current = false
    setEditingConversationId(null)
    setDraftTitle('')
  }

  const cancelRename = () => {
    cancelRenameRef.current = true
    setEditingConversationId(null)
    setDraftTitle('')
    requestAnimationFrame(() => {
      cancelRenameRef.current = false
    })
  }

  const handleShare = (conversationId: string) => {
    setOpenConversationMenuId(null)
    onShareConversation?.(conversationId)
  }

  const handleArchiveToggle = (conversationId: string, shouldArchive: boolean) => {
    setOpenConversationMenuId(null)
    onArchiveConversation?.(conversationId, shouldArchive)
  }

  const handleDelete = (conversationId: string) => {
    setOpenConversationMenuId(null)
    onDeleteConversation?.(conversationId)
  }

  const renderConversationRow = (conversation: Conversation) => {
    const isActive = conversation.id === currentConversationId
    const isEditing = editingConversationId === conversation.id
    const isMenuOpen = openConversationMenuId === conversation.id
    const isArchived = Boolean(conversation.archived)
    const isSynth = isSynthConversation(conversation)
    const archiveLabel = isArchived ? 'Unarchive' : 'Archive'
    const ArchiveIcon = isArchived ? ArchiveRestore : Archive
    const isHovered = hoveredConversationId === conversation.id
    const textColor =
      isActive || isEditing
        ? 'var(--chatty-text)'
        : isHovered
          ? 'var(--chatty-highlight-text)'
          : 'var(--chatty-text)'
    let optionsButtonColor = 'var(--chatty-text)'
    if (isActive) {
      optionsButtonColor = isHovered ? 'var(--chatty-highlight-text)' : 'var(--chatty-text)'
    } else if (isHovered) {
      optionsButtonColor = 'var(--chatty-highlight-text)'
    }
    const optionsHoverColor = isActive ? 'var(--chatty-highlight-text)' : 'var(--chatty-button)'

    return (
      <div
        key={conversation.id}
        className={cn(
          'chatty-sidebar-item relative flex items-center gap-2 rounded-md px-3 py-2 transition-colors group'
        )}
        role="button"
        tabIndex={isEditing ? -1 : 0}
        style={{
          color: textColor,
          backgroundColor: isActive ? 'var(--chatty-button)' : 'transparent',
          border: isEditing ? '1px solid var(--chatty-highlight)' : '1px solid transparent',
          cursor: isEditing ? 'default' : 'pointer'
        }}
        onMouseEnter={(event) => {
          if (isEditing) return
          event.currentTarget.style.backgroundColor = isActive
            ? 'var(--chatty-button)'
            : 'var(--chatty-highlight)'
          setHoveredConversationId(conversation.id)
        }}
        onMouseLeave={(event) => {
          if (isEditing) return
          event.currentTarget.style.backgroundColor = isActive ? 'var(--chatty-button)' : 'transparent'
          setHoveredConversationId(prev => (prev === conversation.id ? null : prev))
        }}
        onClick={(e) => {
          console.log('🔵 [Sidebar] Conversation row clicked:', conversation.id);
          e.stopPropagation();
          handleConversationClick(conversation);
        }}
        onKeyDown={(event) => {
          if (isEditing) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleConversationClick(conversation)
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={node => {
                if (node) {
                  conversationInputRefs.current[conversation.id] = node
                } else {
                  delete conversationInputRefs.current[conversation.id]
                }
              }}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRename()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              onBlur={() => {
                if (cancelRenameRef.current) return
                commitRename()
              }}
              className="w-full bg-transparent outline-none text-sm"
              style={{ color: 'var(--chatty-text)' }}
              placeholder="Rename conversation"
            />
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm">
                  {conversation.title || 'Untitled conversation'}
                </span>
                {isPinnedForRuntime(conversation) && (
                  <Pin size={12} className="text-blue-500 flex-shrink-0" />
                )}
              </div>
              {isArchived && (
                <span className="text-[11px]" style={{ color: 'inherit', opacity: 0.55 }}>
                  Archived
                </span>
              )}
            </div>
          )}
        </div>
        {(!isSynth) && (
        <button
          ref={node => {
            if (node) {
              conversationMenuButtonRefs.current[conversation.id] = node
            } else {
              delete conversationMenuButtonRefs.current[conversation.id]
            }
          }}
          onClick={(event) => {
            event.stopPropagation()
            if (isEditing) return
            setOpenConversationMenuId(prev =>
              prev === conversation.id ? null : conversation.id
            )
          }}
          className={cn(
            'p-1 rounded transition-colors ml-1 focus:opacity-100',
            isMenuOpen ||
            isEditing ||
            isActive ||
            hoveredConversationId === conversation.id
              ? 'opacity-100'
              : 'opacity-0'
          )}
          style={{ color: optionsButtonColor, backgroundColor: 'transparent' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = optionsHoverColor
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = optionsButtonColor
          }}
          aria-label="Conversation options"
        >
          <MoreVertical size={14} />
        </button>
        )}

        {isMenuOpen && (!isSynth) && (
          <div
            ref={node => {
              if (node) {
                conversationMenuRefs.current[conversation.id] = node
              } else {
                delete conversationMenuRefs.current[conversation.id]
              }
            }}
            className="absolute right-0 top-full mt-2 w-44 rounded-lg shadow-lg border overflow-hidden"
            style={{
              backgroundColor: 'var(--chatty-bg-sidebar)',
              borderColor: 'var(--chatty-line)',
              zIndex: Z_LAYERS.popover
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
              style={{ color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              onClick={() => handleShare(conversation.id)}
            >
              <Share2 size={16} />
              Share
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
              style={{ color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              onClick={() => startRename(conversation.id, conversation.title || '')}
            >
              <Pencil size={16} />
              Rename
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
              style={{ color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              onClick={() => handleArchiveToggle(conversation.id, !isArchived)}
            >
              <ArchiveIcon size={16} />
              {archiveLabel}
            </button>
            {/* Only show delete button for non-Synth conversations */}
            {conversation.title !== 'Synth' && (
              <button
                className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors border-t"
                style={{ color: '#B45309', borderColor: 'var(--chatty-line)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                  e.currentTarget.style.color = 'var(--chatty-highlight-text)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#B45309'
                }}
                onClick={() => handleDelete(conversation.id)}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const sidebarZIndex = hasBlockingOverlay ? Z_LAYERS.sidebarMuted : Z_LAYERS.sidebar

  return (
    <div
      className={cn(
        'flex flex-col h-full group transition-all duration-200 ease-in-out',
        collapsed ? 'w-12 overflow-visible' : 'w-64'
      )}
      style={{ 
        backgroundColor: 'var(--chatty-sidebar)', 
        color: 'var(--chatty-text)',
        zIndex: sidebarZIndex,
        position: 'relative',
        pointerEvents: hasBlockingOverlay ? 'none' : 'auto', // Disable when overlay is blocking
        isolation: 'isolate' // Create new stacking context to ensure z-index works
      }}
    >
      {/* Top Section - Logo and Toggle */}
      <div
        className={cn(
          'flex items-center px-4 py-3',
          collapsed ? 'justify-start' : 'justify-between gap-2'
        )}
      >
        <button
          type="button"
          onClick={handleStarClick}
          onMouseEnter={() => setIsStarHovered(true)}
          onMouseLeave={() => setIsStarHovered(false)}
          className={cn(
            'relative flex items-center justify-center transition-all focus:outline-none cursor-pointer appearance-none',
            collapsed ? 'w-10 h-10 overflow-visible' : 'w-12 h-12 overflow-hidden'
          )}
          style={{
            backgroundColor: 'transparent',
            color: 'var(--chatty-text)',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            marginLeft: collapsed ? '-6px' : '0',
            appearance: 'none' as const
          }}
          aria-label={starButtonLabel}
        >
          <div className={cn(
            'relative flex items-center justify-center',
            collapsed ? 'w-[1.8rem] h-[1.8rem]' : 'w-full h-full'
          )}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                src={isStarHovered ? starNova : chattyStar}
                alt="Chatty star"
                className="transition-all duration-300"
                style={{
                  width: '100%',
                  height: '100%',
                  opacity: isStarHovered ? 0.95 : 0.8,
                  transformOrigin: 'center',
                  transform: isStarHovered ? 'scale(1.05)' : 'scale(1)',
                  filter: isStarHovered ? 'drop-shadow(0 0 18px rgba(255, 215, 0, 0.25))' : 'none'
                }}
              />
            </div>
            {[0, 45].map((rotation, idx) => (
              <div
                key={`ray-${rotation}`}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  transform: `scale(${isStarHovered ? 1.05 : 0.92}) rotate(${rotation}deg)`,
                  opacity: isStarHovered ? 0.55 : 0.4,
                  animation: isStarHovered
                    ? `${idx === 0 ? 'sidebar-star-spin-ccw' : 'sidebar-star-spin-cw'} ${rayRotationDuration}s linear infinite`
                    : 'none'
                }}
              >
                <img
                  src={starRay}
                  alt="Star ray"
                  style={{
                    width: collapsed ? '135%' : '140%',
                    height: collapsed ? '135%' : '140%'
                  }}
                />
              </div>
            ))}
            {[0, 45].map((rotation, idx) => (
              <div
                key={`burst-${rotation}`}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{
                  transform: `scale(${isStarHovered ? 1.05 : 0.95}) rotate(${rotation}deg)`,
                  opacity: isStarHovered ? 0.9 : 0.7,
                  animation: isStarHovered
                    ? `${idx === 0 ? 'sidebar-star-spin-cw' : 'sidebar-star-spin-ccw'} ${burstRotationDuration}s linear infinite`
                    : 'none'
                }}
              >
                <img
                  src={starBurst}
                  alt="Star burst"
                  style={{
                    width: collapsed ? '60%' : '65%',
                    height: collapsed ? '60%' : '65%'
                  }}
                />
              </div>
            ))}
          </div>
          {collapsed && (
            <span
              className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 pointer-events-none"
              style={{
                color: 'var(--chatty-text)',
                opacity: isStarHovered ? 1 : 0
              }}
            >
              <PanelLeftOpen size={18} />
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <ThemeToggleButton
              collapsed
              className="w-9 h-9 rounded-md transition-colors focus:outline-none"
              style={{ width: 36, height: 36 }}
            />
            <button
              type="button"
              onClick={() => {
                if (onShowRuntimeDashboard) {
                  onShowRuntimeDashboard();
                } else {
                  console.warn('[Sidebar] Runtime dashboard handler missing');
                }
              }}
              className="flex items-center justify-center rounded-md transition-colors focus:outline-none"
              style={{
                width: 36,
                height: 36,
                color: 'var(--chatty-text)'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              aria-label="Open runtime dashboard"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => onToggleCollapsed()}
              className="flex items-center justify-center rounded-md transition-colors focus:outline-none"
              style={{
                width: 36,
                height: 36,
                color: 'var(--chatty-text)'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Options - Flat List Style */}
      {!collapsed && (
        <div className="px-4 pb-4" aria-label="Main navigation">
          <div className="space-y-1">
            <button
              type="button"
              onClick={(e) => {
                console.log('🔵 [Sidebar] Search button clicked');
                e.stopPropagation();
                onOpenSearch?.();
              }}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ 
                color: 'var(--chatty-text)', 
                position: 'relative', 
                zIndex: sidebarZIndex + 1,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <Search size={16} style={{ color: 'inherit', opacity: 0.75 }} />
              Search chats
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('🔵 [Sidebar] Library button clicked');
                e.stopPropagation();
                navigate('/app/library');
              }}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ 
                color: 'var(--chatty-text)', 
                position: 'relative', 
                zIndex: sidebarZIndex + 1,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <Library size={16} style={{ color: 'inherit', opacity: 0.75 }} />
              Library
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('🔵 [Sidebar] Code button clicked');
                e.stopPropagation();
                navigate('/app/codex');
              }}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ 
                color: 'var(--chatty-text)', 
                position: 'relative', 
                zIndex: sidebarZIndex + 1,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <SyntaxIcon dimmed />
              Code
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('🔵 [Sidebar] VVAULT button clicked');
                e.stopPropagation();
                navigate('/app/vvault');
              }}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ 
                color: 'var(--chatty-text)', 
                position: 'relative', 
                zIndex: sidebarZIndex + 1,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <Shield size={16} style={{ color: 'inherit', opacity: 0.75 }} />
              VVAULT
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('🔵 [Sidebar] Projects button clicked');
                e.stopPropagation();
                onOpenProjects?.();
              }}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ 
                color: 'var(--chatty-text)', 
                position: 'relative', 
                zIndex: sidebarZIndex + 1,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <FolderPlus size={16} style={{ color: 'inherit', opacity: 0.75 }} />
              Projects
            </button>
          </div>
        </div>
      )}

      {/* Collapsed Navigation Icons */}
      {collapsed && (
        <div className="flex flex-col items-center py-2 space-y-2">
          <button
            onClick={() => {
              if (onShowRuntimeDashboard) {
                onShowRuntimeDashboard();
              } else {
                console.warn('[Sidebar] Runtime dashboard handler missing');
              }
            }}
            className="sidebar-button p-2 rounded transition-colors duration-150"
            aria-label="Open runtime dashboard"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <LayoutGrid size={16} style={{ color: 'inherit' }} />
          </button>
          <button 
            onClick={() => onOpenSearch?.()} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="Search chats"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <Search size={16} />
          </button>
          <button 
            onClick={() => navigate('/app/library')} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="Library"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <Library size={16} />
          </button>
          <button 
            onClick={() => navigate('/app/codex')} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="Code"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <SyntaxIcon />
          </button>
          <button 
            onClick={() => navigate('/app/vvault')} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="VVAULT"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <Shield size={16} style={{ color: 'inherit' }} />
          </button>
          <button 
            onClick={() => onOpenProjects?.()} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="Projects"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <FolderPlus size={16} style={{ color: 'inherit' }} />
          </button>
          <button 
            onClick={() => navigate('/app/explore')} 
            className="sidebar-button p-2 rounded transition-colors duration-150" 
            aria-label="Explore"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
            onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
          >
            <div className="w-5 h-5 flex items-center justify-center">□</div>
          </button>
          <ThemeToggleButton collapsed />
        </div>
      )}

      {/* GPTs Section - Only show when expanded */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>SimForge</h3>
          <div className="space-y-1">
            <button 
              onClick={() => navigate('/app/explore')}
              className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              <AnvilIcon size={20} style={{ color: 'inherit', opacity: 0.75 }} />
              Explore
            </button>

            {/* Custom GPTs */}
            {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').slice(0, 2).map((personality) => (
              <button
                key={personality.id}
                onClick={() => {
                  gptCreator.setActivePersonality(personality.id)
                  onNewConversationWithGPT(personality.id)
                }}
                className="sidebar-button flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
                style={{ color: 'var(--chatty-text)' }}
                onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
                onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-text)' }}>
                  <span className="text-white text-xs font-bold">
                    {personality.name.charAt(0)}
                  </span>
                </div>
                {personality.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chats Section */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto sidebar-scrollable" role="navigation" aria-label="Address Book">
        {/* Only show 'Chats' label and chat list when expanded */}
        {!collapsed && (
          <>
            <h3
              className="text-xs font-medium uppercase tracking-wide mb-2"
              style={{ color: 'var(--chatty-text)', opacity: 0.6 }}
            >
              {selectedRuntime && !selectedRuntime?.metadata?.isCore && selectedRuntime.provider
                ? selectedRuntime.provider
                : 'Address Book'}
            </h3>
            <div className="space-y-1">
              {activeConversations.map(renderConversationRow)}
              {activeConversations.length === 0 && (
                <div
                  className="text-center text-sm py-8"
                  style={{ color: 'var(--chatty-text)', opacity: 0.6 }}
                >
                  <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                </div>
              )}
            </div>
          </>
        )}
        {/* When collapsed, do not render any chat label or chat list */}
      </div>

      {/* User Profile Section - Anchored at Bottom (expanded only) */}
      {!collapsed && (
        <div className="p-4">
          {currentUser ? (
            <button
              ref={triggerRef}
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              className="flex items-center gap-3 w-full p-2 rounded-md transition-colors"
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              {profileSrc ? (
                <img 
                  src={profileSrc}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={handleProfileImageError}
                />
              ) : null}
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ display: profileSrc ? 'none' : 'flex', backgroundColor: 'var(--chatty-button)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                  {currentUser?.name?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
                  {currentUser?.name || currentUser?.email || 'User'}
                </span>
                <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                  Plus
                </span>
              </div>
            </button>
          ) : (
            <button 
              onClick={() => window.location.href = "/api/auth/google"}
              className="w-full rounded-md p-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget, 'var(--chatty-highlight)')}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget, 'var(--chatty-button)')}
            >
              Continue with Google
            </button>
          )}
        </div>
      )}
      {/* Collapsed profile thumbnail */}
      {collapsed && currentUser && (
        <button
          ref={triggerRef}
          onClick={() => setIsUserMenuOpen(prev => !prev)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full overflow-hidden border transition-colors relative"
          style={{ borderColor: 'var(--chatty-line)' }}
          onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
          onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
        >
          {profileSrc ? (
            <img
              src={profileSrc}
              alt={currentUser.name || 'User'}
              className="w-full h-full object-cover rounded-full"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={handleProfileImageError}
            />
          ) : null}
          <div
            className="absolute inset-0 bg-[#ADA587] rounded-full flex items-center justify-center text-white text-sm font-medium"
            style={{ display: profileSrc ? 'none' : 'flex' }}
          >
            {currentUser?.name?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
          </div>
        </button>
      )}

      {currentUser && isUserMenuOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute rounded-lg shadow-lg border overflow-hidden',
            collapsed ? 'bottom-16 left-full ml-3 w-44' : 'bottom-24 left-4 right-4'
          )}
          style={{
            backgroundColor: 'var(--chatty-bg-sidebar)',
            borderColor: 'var(--chatty-line)',
            zIndex: Z_LAYERS.popover
          }}
        >
        <button
          onClick={() => {
            setIsUserMenuOpen(false)
            onShowSettings?.()
          }}
          className="w-full px-4 py-3 text-left text-sm transition-colors"
          style={{ color: 'var(--chatty-text)' }}
          onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
          onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
        >
          Settings
        </button>
          {onLogout && (
            <button
              onClick={() => {
                setIsUserMenuOpen(false)
                onLogout()
              }}
              className="w-full px-4 py-3 text-left text-sm transition-colors border-t"
              style={{ color: 'var(--chatty-text)', borderColor: 'var(--chatty-line)' }}
              onMouseEnter={(e) => applyHighlightHover(e.currentTarget)}
              onMouseLeave={(e) => resetHighlightHover(e.currentTarget)}
            >
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default Sidebar
