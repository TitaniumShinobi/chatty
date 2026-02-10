import React, { useEffect, useMemo, useState, useRef } from 'react'
import {
  Image,
  Video,
  FileText,
  File as FileIcon,
  Music2,
  Trash2,
  Search,
  LayoutGrid,
  List,
  Plus,
  Upload,
  FolderPlus,
  Folder,
  MoreVertical,
  HardDrive,
  ChevronDown,
  Clock,
  Star,
  X,
  FolderOpen,
  Sparkles,
  AlertCircle
} from 'lucide-react'
import { cn } from '../lib/utils'

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'file' | 'folder'
type LibraryTab = 'directory' | 'gallery'

interface MediaItem {
  id: string
  type: MediaKind
  title: string
  url: string
  thumbnail?: string
  size: number
  createdAt: number
  lastOpened?: number
  conversationId?: string
  conversationTitle?: string
  source?: 'user' | 'construct'
  constructId?: string
  isFolder?: boolean
  parentId?: string
}

interface FolderItem {
  id: string
  name: string
  itemCount: number
  color?: string
}

interface StorageInfo {
  used: number
  total: number
  isPaused: boolean
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i
const PDF_EXT = /\.pdf$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i
const DOC_EXT = /\.(doc|docx|txt|md|rtf)$/i

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('directory')
  const [directoryItems, setDirectoryItems] = useState<MediaItem[]>([])
  const [galleryItems, setGalleryItems] = useState<MediaItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [storage, setStorage] = useState<StorageInfo>({ 
    used: 0, 
    total: 15 * 1024 * 1024 * 1024, // 15GB default
    isPaused: false 
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)

  const normalizeType = (rawType: string, title: string): MediaKind => {
    const lower = title.toLowerCase()
    if (rawType === 'folder') return 'folder'
    if (rawType === 'image' || IMAGE_EXT.test(lower)) return 'image'
    if (rawType === 'video' || VIDEO_EXT.test(lower)) return 'video'
    if (rawType === 'audio' || AUDIO_EXT.test(lower)) return 'audio'
    if (rawType === 'document' && PDF_EXT.test(lower)) return 'pdf'
    if (PDF_EXT.test(lower)) return 'pdf'
    if (DOC_EXT.test(lower)) return 'document'
    return 'file'
  }

  // Close new menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load library files from VVAULT paths
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        setIsLoading(true)
        
        // Load Directory files (user uploads) - library/finder/*
        const dirResponse = await fetch('/api/library/directory', { credentials: 'include' })
        if (dirResponse.ok) {
          const data = await dirResponse.json()
          if (data.ok && data.files) {
            const mapped: MediaItem[] = data.files.map((item: any) => ({
              id: item.id,
              type: normalizeType(item.type, item.title || item.name),
              title: item.title || item.name,
              url: item.url,
              thumbnail: item.thumbnail,
              size: item.size || 0,
              createdAt: item.createdAt || Date.now(),
              lastOpened: item.lastOpened || item.createdAt,
              source: 'user'
            }))
            setDirectoryItems(mapped)
          }
        }
        
        // Load Gallery files (construct created) - library/chatty/*
        const galResponse = await fetch('/api/library/gallery', { credentials: 'include' })
        if (galResponse.ok) {
          const data = await galResponse.json()
          if (data.ok && data.files) {
            const mapped: MediaItem[] = data.files.map((item: any) => ({
              id: item.id,
              type: normalizeType(item.type, item.title || item.name),
              title: item.title || item.name,
              url: item.url,
              thumbnail: item.thumbnail,
              size: item.size || 0,
              createdAt: item.createdAt || Date.now(),
              lastOpened: item.lastOpened,
              source: 'construct',
              constructId: item.constructId
            }))
            setGalleryItems(mapped)
          }
        }
        
        // Load storage info
        const storageResponse = await fetch('/api/library/storage', { credentials: 'include' })
        if (storageResponse.ok) {
          const data = await storageResponse.json()
          if (data.ok) {
            setStorage({
              used: data.used || 0,
              total: data.total || 15 * 1024 * 1024 * 1024,
              isPaused: data.isPaused || false
            })
          }
        }
        
        // Default folders for Directory
        setFolders([
          { id: 'documents', name: 'Documents', itemCount: 0, color: '#4285f4' },
          { id: 'images', name: 'Images', itemCount: 0, color: '#ea4335' },
          { id: 'data', name: 'Data Files', itemCount: 0, color: '#34a853' },
        ])
        
      } catch (error) {
        console.error('Failed to load library:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadLibrary()
  }, [])

  // Current items based on active tab
  const currentItems = activeTab === 'directory' ? directoryItems : galleryItems

  const filteredItems = useMemo(() => {
    if (!searchQuery) return currentItems
    const query = searchQuery.toLowerCase()
    return currentItems.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.conversationTitle?.toLowerCase().includes(query)
    )
  }, [currentItems, searchQuery])

  // Sort by last opened
  const suggestedFiles = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => (b.lastOpened || b.createdAt) - (a.lastOpened || a.createdAt))
      .slice(0, 12)
  }, [filteredItems])

  const formatRelativeDate = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) {
        const mins = Math.floor(diff / (1000 * 60))
        return mins <= 1 ? 'Just now' : `${mins}m ago`
      }
      return `${hours}h ago`
    }
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return '0 GB'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(2)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    if (storage.isPaused) {
      alert('Storage is paused. Please upgrade your plan or clear some files.')
      return
    }
    
    // TODO: Implement file upload to VVAULT library/finder/
    console.log('Uploading files to Directory:', files)
    setShowNewMenu(false)
  }

  const handleNewFolder = () => {
    const name = prompt('Enter folder name:')
    if (name) {
      setFolders(prev => [...prev, {
        id: `folder-${Date.now()}`,
        name,
        itemCount: 0,
        color: '#fbbc04'
      }])
    }
    setShowNewMenu(false)
  }

  const getFileIcon = (type: MediaKind, size: number = 24) => {
    switch (type) {
      case 'image': return <Image size={size} />
      case 'video': return <Video size={size} />
      case 'audio': return <Music2 size={size} />
      case 'pdf': return <FileText size={size} style={{ color: '#ea4335' }} />
      case 'document': return <FileText size={size} style={{ color: '#4285f4' }} />
      case 'folder': return <Folder size={size} />
      default: return <FileIcon size={size} />
    }
  }

  const renderFileCard = (item: MediaItem) => (
    <div
      key={item.id}
      className="group rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-lg"
      style={{ 
        backgroundColor: 'var(--chatty-bg-message)',
        border: selectedItems.has(item.id) ? '2px solid var(--chatty-accent, #4285f4)' : '1px solid var(--chatty-border)'
      }}
      onClick={() => {
        const newSelected = new Set(selectedItems)
        if (newSelected.has(item.id)) {
          newSelected.delete(item.id)
        } else {
          newSelected.add(item.id)
        }
        setSelectedItems(newSelected)
      }}
    >
      {/* Preview Area */}
      <div 
        className="aspect-[4/3] flex items-center justify-center relative"
        style={{ backgroundColor: 'var(--chatty-bg)' }}
      >
        {item.type === 'image' && (item.thumbnail || item.url) ? (
          <img 
            src={item.thumbnail || item.url} 
            alt={item.title} 
            className="w-full h-full object-cover"
          />
        ) : item.type === 'video' && item.thumbnail ? (
          <div className="relative w-full h-full">
            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Video size={32} className="text-white" />
            </div>
          </div>
        ) : item.type === 'pdf' || item.type === 'document' ? (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#f8f9fa' }}>
            <div className="text-center p-4">
              {getFileIcon(item.type, 48)}
              <div className="mt-2 text-xs opacity-50 line-clamp-2" style={{ color: '#5f6368' }}>
                {item.title}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
            {getFileIcon(item.type, 48)}
          </div>
        )}
        
        {/* Construct badge for Gallery items */}
        {item.source === 'construct' && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs flex items-center gap-1" 
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white' }}>
            <Sparkles size={12} />
            AI Generated
          </div>
        )}
        
        {/* Hover Menu */}
        <button 
          className="absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { e.stopPropagation() }}
        >
          <MoreVertical size={16} className="text-white" />
        </button>
      </div>
      
      {/* Info Area */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5">
            {getFileIcon(item.type, 18)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
              {item.title}
            </h4>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              <span className="w-4 h-4 rounded-full bg-[var(--chatty-accent)] flex items-center justify-center text-white text-[10px]">
                {item.source === 'construct' ? '✦' : 'Y'}
              </span>
              {item.source === 'construct' ? 'Created' : 'You opened'} • {formatRelativeDate(item.lastOpened || item.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderFolderCard = (folder: FolderItem) => (
    <div
      key={folder.id}
      className="flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-all hover:shadow-md"
      style={{ 
        backgroundColor: 'var(--chatty-bg-message)',
        border: '1px solid var(--chatty-border)'
      }}
    >
      <Folder size={24} style={{ color: folder.color || 'var(--chatty-text)' }} />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
          {folder.name}
        </h4>
        {folder.itemCount > 0 && (
          <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
            {folder.itemCount} items
          </p>
        )}
      </div>
      <button className="p-1 rounded hover:bg-[var(--chatty-highlight)]">
        <MoreVertical size={16} style={{ color: 'var(--chatty-text)', opacity: 0.6 }} />
      </button>
    </div>
  )

  const renderListRow = (item: MediaItem) => (
    <div
      key={item.id}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--chatty-highlight)] cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid var(--chatty-border)' }}
    >
      <input
        type="checkbox"
        checked={selectedItems.has(item.id)}
        onChange={() => {
          const newSelected = new Set(selectedItems)
          if (newSelected.has(item.id)) newSelected.delete(item.id)
          else newSelected.add(item.id)
          setSelectedItems(newSelected)
        }}
        className="w-4 h-4"
      />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getFileIcon(item.type, 20)}
        <span className="text-sm truncate" style={{ color: 'var(--chatty-text)' }}>{item.title}</span>
        {item.source === 'construct' && (
          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--chatty-accent)', color: 'white' }}>
            AI
          </span>
        )}
      </div>
      <div className="text-xs w-28" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
        {formatRelativeDate(item.lastOpened || item.createdAt)}
      </div>
      <button className="p-1 rounded hover:bg-[var(--chatty-highlight)]">
        <MoreVertical size={16} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
      </button>
    </div>
  )

  const storagePercent = (storage.used / storage.total) * 100

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Left Sidebar */}
      <div 
        className="w-60 flex-shrink-0 flex flex-col p-4 border-r"
        style={{ borderColor: 'var(--chatty-border)' }}
      >
        {/* New Button - only show in Directory tab */}
        {activeTab === 'directory' && (
          <div className="relative mb-6" ref={newMenuRef}>
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl shadow-md transition-all hover:shadow-lg"
              style={{ 
                backgroundColor: 'var(--chatty-bg-message)',
                color: 'var(--chatty-text)'
              }}
            >
              <Plus size={24} />
              <span className="font-medium">New</span>
              <ChevronDown size={16} className="ml-auto" />
            </button>
            
            {showNewMenu && (
              <div 
                className="absolute top-full left-0 mt-2 w-56 rounded-lg shadow-xl overflow-hidden z-50"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-modal, var(--chatty-bg-message))',
                  border: '1px solid var(--chatty-border)'
                }}
              >
                <button 
                  onClick={handleNewFolder}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                  style={{ color: 'var(--chatty-text)' }}
                >
                  <FolderPlus size={20} />
                  New folder
                </button>
                <div className="h-px" style={{ backgroundColor: 'var(--chatty-border)' }} />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                  style={{ color: 'var(--chatty-text)' }}
                >
                  <Upload size={20} />
                  Upload files
                </button>
              </div>
            )}
            
            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        {/* Tab Navigation */}
        <nav className="space-y-1 flex-1">
          <button 
            onClick={() => setActiveTab('directory')}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-full text-sm transition-colors",
              activeTab === 'directory' && "bg-[var(--chatty-highlight)]"
            )}
            style={{ color: 'var(--chatty-text)' }}
          >
            <FolderOpen size={18} />
            Directory
            <span className="ml-auto text-xs opacity-60">{directoryItems.length}</span>
          </button>
          <button 
            onClick={() => setActiveTab('gallery')}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-full text-sm transition-colors",
              activeTab === 'gallery' && "bg-[var(--chatty-highlight)]"
            )}
            style={{ color: 'var(--chatty-text)' }}
          >
            <Sparkles size={18} />
            Gallery
            <span className="ml-auto text-xs opacity-60">{galleryItems.length}</span>
          </button>
          
          <div className="h-px my-3" style={{ backgroundColor: 'var(--chatty-border)' }} />
          
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Clock size={18} />
            Recent
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Star size={18} />
            Starred
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Trash2 size={18} />
            Trash
          </button>
        </nav>

        {/* Storage */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--chatty-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Storage</span>
            {storage.isPaused && (
              <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white">
                PAUSED
              </span>
            )}
          </div>
          <div 
            className="h-1 rounded-full overflow-hidden mb-2"
            style={{ backgroundColor: 'var(--chatty-border)' }}
          >
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${Math.min(storagePercent, 100)}%`,
                backgroundColor: storage.isPaused ? '#ea4335' : storagePercent > 90 ? '#fbbc04' : 'var(--chatty-accent, #4285f4)'
              }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
            {formatStorageSize(storage.used)} of {formatStorageSize(storage.total)} used
          </p>
          
          {storage.isPaused && (
            <div className="mt-2 p-2 rounded text-xs flex items-start gap-2" style={{ backgroundColor: 'rgba(234,67,53,0.1)', color: '#ea4335' }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Storage paused. Update payment to continue.</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b" style={{ borderColor: 'var(--chatty-border)' }}>
          {/* Search */}
          <div 
            className="flex-1 max-w-2xl flex items-center gap-3 px-4 py-2.5 rounded-full"
            style={{ 
              backgroundColor: 'var(--chatty-bg-message)',
              border: '1px solid var(--chatty-border)'
            }}
          >
            <Search size={20} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search in ${activeTab === 'directory' ? 'Directory' : 'Gallery'}`}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--chatty-text)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={16} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
              </button>
            )}
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
            <button
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded", viewMode === 'list' && "bg-[var(--chatty-highlight)]")}
              style={{ color: 'var(--chatty-text)' }}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded", viewMode === 'grid' && "bg-[var(--chatty-highlight)]")}
              style={{ color: 'var(--chatty-text)' }}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--chatty-accent, #4285f4)' }} />
            </div>
          ) : (
            <>
              {/* Tab Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-normal" style={{ color: 'var(--chatty-text)' }}>
                  {activeTab === 'directory' ? 'Directory' : 'Gallery'}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                  {activeTab === 'directory' 
                    ? 'Your uploaded documents — reference these in any conversation' 
                    : 'AI-generated content from Zen and your GPTs'}
                </p>
              </div>

              {/* Suggested Folders - only in Directory */}
              {activeTab === 'directory' && folders.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
                    Folders
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {folders.map(renderFolderCard)}
                  </div>
                </section>
              )}

              {/* Files */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    {activeTab === 'directory' ? 'Recent files' : 'Recent creations'}
                  </h2>
                </div>
                
                {suggestedFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    {activeTab === 'directory' ? (
                      <>
                        <FolderOpen size={64} style={{ color: 'var(--chatty-text)', opacity: 0.3 }} />
                        <h3 className="text-lg font-medium mt-4" style={{ color: 'var(--chatty-text)' }}>
                          No documents yet
                        </h3>
                        <p className="text-sm mt-2 max-w-md" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                          Upload files to build your document pool. Zen and your GPTs can reference these in any conversation — no re-uploading needed.
                        </p>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="mt-4 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                          style={{ 
                            backgroundColor: 'var(--chatty-accent, #4285f4)',
                            color: 'white'
                          }}
                        >
                          Upload files
                        </button>
                      </>
                    ) : (
                      <>
                        <Sparkles size={64} style={{ color: 'var(--chatty-text)', opacity: 0.3 }} />
                        <h3 className="text-lg font-medium mt-4" style={{ color: 'var(--chatty-text)' }}>
                          No creations yet
                        </h3>
                        <p className="text-sm mt-2 max-w-md" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                          When Zen or your GPTs generate images, videos, or other media, they'll appear here automatically.
                        </p>
                      </>
                    )}
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {suggestedFiles.map(renderFileCard)}
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--chatty-border)' }}>
                    {suggestedFiles.map(renderListRow)}
                  </div>
                )}
                
                {filteredItems.length > 12 && (
                  <button 
                    className="mt-4 text-sm font-medium"
                    style={{ color: 'var(--chatty-accent, #4285f4)' }}
                  >
                    View all {filteredItems.length} files
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
