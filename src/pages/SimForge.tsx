import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Plus, Bot, Search, Star, Users, TrendingUp, Filter, Grid, List, ChevronDown, Check } from 'lucide-react'
import GPTCreator from '../components/GPTCreator'
import { AIService, AIConfig } from '../lib/aiService'
import { Z_LAYERS } from '../lib/zLayers'

interface CommunityGPT extends AIConfig {
  author: string
  authorAvatar?: string
  likes: number
  downloads: number
  isLiked?: boolean
  isDownloaded?: boolean
  category: string
  tags: string[]
}

interface LayoutContext {
  handleGPTCreated?: (gptConfig: { constructId?: string; constructCallsign?: string; name?: string }) => void;
  forceRefreshConversations?: () => void;
}

export default function SimForge() {
  const navigate = useNavigate()
  const aiService = AIService.getInstance()
  const layoutContext = useOutletContext<LayoutContext>()
  const [isCreatorOpen, setCreatorOpen] = useState(false)
  const [gpts, setGpts] = useState<CommunityGPT[]>([])
  const [userGpts, setUserGpts] = useState<AIConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'trending' | 'newest' | 'popular'>('trending')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  // Mock community GPTs data (in a real app, this would come from an API)
  const mockCommunityGPTs: CommunityGPT[] = [
    {
      id: '1',
      name: 'Code Mentor',
      description: 'Expert programming tutor for all skill levels',
      instructions: 'You are an expert programming mentor who helps students learn to code.',
      avatar: '',
      author: 'TechGuru',
      authorAvatar: '',
      likes: 1247,
      downloads: 3421,
      category: 'Programming',
      tags: ['coding', 'tutorial', 'education'],
      modelId: 'gpt-4',
      conversationStarters: ['Help me learn Python', 'Explain this code', 'Best practices for React'],
      createdAt: Date.now() - 86400000 * 2
    },
    {
      id: '2',
      name: 'Creative Writer',
      description: 'Inspires and helps with creative writing projects',
      instructions: 'You are a creative writing assistant who helps with storytelling.',
      avatar: '',
      author: 'WordSmith',
      authorAvatar: '',
      likes: 892,
      downloads: 2156,
      category: 'Writing',
      tags: ['creative', 'storytelling', 'fiction'],
      modelId: 'gpt-4',
      conversationStarters: ['Help me write a story', 'Character development', 'Plot ideas'],
      createdAt: Date.now() - 86400000 * 5
    },
    {
      id: '3',
      name: 'Data Analyst',
      description: 'Expert in data analysis and visualization',
      instructions: 'You are a data analysis expert who helps interpret and visualize data.',
      avatar: '',
      author: 'DataPro',
      authorAvatar: '',
      likes: 1563,
      downloads: 2890,
      category: 'Analytics',
      tags: ['data', 'analysis', 'visualization'],
      modelId: 'gpt-4',
      conversationStarters: ['Analyze this dataset', 'Create a chart', 'Statistical insights'],
      createdAt: Date.now() - 86400000 * 1
    }
  ]

  const categories = [
    { id: 'all', name: 'All Categories' },
    { id: 'Programming', name: 'Programming' },
    { id: 'Writing', name: 'Writing' },
    { id: 'Analytics', name: 'Analytics' },
    { id: 'Education', name: 'Education' },
    { id: 'Business', name: 'Business' },
    { id: 'Creative', name: 'Creative' }
  ]

  useEffect(() => {
    console.log('[SimForge] Component mounted, loading data...')
    loadData()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false)
      }
    }

    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCategoryDropdownOpen])

  const loadData = async () => {
    console.log('[SimForge] loadData starting...')
    try {
      setIsLoading(true)
      // Load user's AIs
      console.log('[SimForge] Fetching user AIs...')
      const userAIs = await aiService.getAllAIs()
      console.log('[SimForge] Got user AIs:', userAIs?.length || 0)
      setUserGpts(userAIs)
      
      // Fetch store AIs from API
      try {
        console.log('[SimForge] Fetching store AIs...')
        const storeAIs = await aiService.getStoreAIs()
        console.log('[SimForge] Got store AIs:', storeAIs?.length || 0)
        // Map store AIs to CommunityGPT format
        const communityGPTs: CommunityGPT[] = storeAIs.map(ai => ({
          ...ai,
          author: 'Community', // TODO: Get actual author from user data
          authorAvatar: '',
          likes: 0, // TODO: Implement likes system
          downloads: 0, // TODO: Implement downloads tracking
          isLiked: false,
          isDownloaded: false,
          category: 'General', // TODO: Extract from metadata or capabilities
          tags: [] // TODO: Extract tags from metadata
        }))
        setGpts(communityGPTs)
      } catch (error) {
        console.error('[SimForge] Failed to load store AIs:', error)
        // Fallback to empty array if store fetch fails
        setGpts([])
      }
    } catch (error) {
      console.error('[SimForge] Failed to load data:', error)
    } finally {
      console.log('[SimForge] loadData complete, isLoading = false')
      setIsLoading(false)
    }
  }

  const handleLike = (gptId: string) => {
    setGpts(prev => prev.map(gpt => 
      gpt.id === gptId 
        ? { 
            ...gpt, 
            isLiked: !gpt.isLiked,
            likes: gpt.isLiked ? gpt.likes - 1 : gpt.likes + 1
          }
        : gpt
    ))
  }

  const handleDownload = (gptId: string) => {
    setGpts(prev => prev.map(gpt => 
      gpt.id === gptId 
        ? { 
            ...gpt, 
            isDownloaded: !gpt.isDownloaded,
            downloads: gpt.isDownloaded ? gpt.downloads - 1 : gpt.downloads + 1
          }
        : gpt
    ))
  }

  const handleClose = () => {
    setCreatorOpen(false)
    loadData()
  }

  // Filter and sort GPTs
  const filteredGpts = gpts
    .filter(gpt => {
      const matchesSearch = gpt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           gpt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           gpt.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesCategory = selectedCategory === 'all' || gpt.category === selectedCategory
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt
        case 'popular':
          return b.downloads - a.downloads
        case 'trending':
        default:
          return b.likes - a.likes
      }
    })

  console.log('[SimForge] Rendering component, isLoading:', isLoading, 'filteredGpts:', filteredGpts.length)
  
  return (
    <div className="h-full w-full overflow-y-auto" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Header */}
      <div className="p-6 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
              SimForge
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Discover and use community-created AI assistants
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/app/gpts')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: 'transparent', 
                color: 'var(--chatty-text)',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              My GPTs
            </button>
            <button
              onClick={() => setCreatorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: 'transparent', 
                color: 'var(--chatty-text)' 
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Plus size={16} style={{ color: 'var(--chatty-text)' }} />
              Create GPT
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GPTs..."
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm simforge-search-input"
              style={{ 
                backgroundColor: 'var(--chatty-bg-message)',
                border: '1px solid var(--chatty-line)',
                color: 'var(--chatty-text)'
              }}
            />
            <style>{`
              .simforge-search-input::placeholder {
                color: #ADA587;
                opacity: 1;
              }
            `}</style>
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
            <div className="relative" ref={categoryDropdownRef}>
              <button
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                  border: 'none',
                color: 'var(--chatty-text)'
              }}
            >
                <span>{categories.find(c => c.id === selectedCategory)?.name || 'All Categories'}</span>
                <ChevronDown size={14} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
              </button>
              {isCategoryDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-lg shadow-lg border w-48"
                  style={{
                    backgroundColor: 'var(--chatty-bg-main)',
                    borderColor: 'var(--chatty-line)',
                    zIndex: Z_LAYERS.popover
                  }}
                >
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 cursor-pointer transition-colors"
                      style={{ 
                        backgroundColor: selectedCategory === category.id ? 'var(--chatty-highlight)' : 'transparent'
                      }}
                      onClick={() => {
                        setSelectedCategory(category.id)
                        setIsCategoryDropdownOpen(false)
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCategory !== category.id) {
                          e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCategory !== category.id) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                  {category.name}
                      </span>
                      {selectedCategory === category.id && (
                        <Check size={16} style={{ color: 'var(--chatty-text)' }} />
                      )}
                    </div>
              ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSortBy('trending')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                color: 'var(--chatty-text)'
              }}
            >
              <TrendingUp size={14} className="inline mr-1" />
              Trending
            </button>
            <button
              onClick={() => setSortBy('newest')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                color: 'var(--chatty-text)'
              }}
            >
              Newest
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                color: 'var(--chatty-text)'
              }}
            >
              Popular
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className="p-2 rounded transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                color: 'var(--chatty-text)'
              }}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-2 rounded transition-colors"
              style={{ 
                backgroundColor: 'transparent',
                color: 'var(--chatty-text)'
              }}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Your GPTs Section */}
        {userGpts.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-text-inverse)' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--chatty-bg-main)' }}>Y</span>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
              Your GPTs ({userGpts.length})
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: 'var(--chatty-line)' }}></div>
          </div>
        ) : filteredGpts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6">
              <Bot size={32} style={{ color: 'var(--chatty-icon)', opacity: 0.6 }} />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
              No GPTs found
            </h3>
            <p className="text-sm max-w-md" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Try adjusting your search or filter criteria to find GPTs.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {filteredGpts.map((gpt) => (
              <div
                key={gpt.id}
                className={`rounded-lg p-4 transition-all ${
                  viewMode === 'list' ? 'flex items-start gap-4' : ''
                }`}
                style={{ 
                  backgroundColor: 'var(--chatty-bg-message)'
                }}
              >
                <div className={`flex items-start gap-3 ${viewMode === 'list' ? 'flex-shrink-0' : 'mb-3'}`}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden">
                    {gpt.avatar ? (
                      <img src={gpt.avatar} alt={gpt.name} className="w-full h-full object-cover" />
                    ) : (
                      <Bot size={20} style={{ color: 'var(--chatty-icon)' }} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium mb-1" style={{ color: 'var(--chatty-text)' }}>
                      {gpt.name}
                    </h3>
                    <p className="text-sm mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      {gpt.description}
                    </p>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--chatty-highlight)', color: 'var(--chatty-text)' }}>
                        {gpt.category}
                      </span>
                      {gpt.tags.slice(0, 2).map((tag, index) => (
                        <span key={index} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--chatty-highlight)', color: 'var(--chatty-text)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                      <div className="flex items-center gap-1">
                        <Users size={12} />
                        {gpt.author}
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={12} />
                        {gpt.likes}
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp size={12} />
                        {gpt.downloads}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLike(gpt.id)}
                    className="p-2 rounded transition-colors"
                    style={{ 
                      backgroundColor: 'transparent',
                      color: 'var(--chatty-text)'
                    }}
                  >
                    <Star size={16} fill={gpt.isLiked ? 'currentColor' : 'none'} />
                  </button>
                  
                  <button
                    onClick={() => handleDownload(gpt.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ 
                      backgroundColor: 'transparent', 
                      color: 'var(--chatty-text)' 
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {gpt.isDownloaded ? 'Downloaded' : 'Download'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GPT Creator Modal */}
      <GPTCreator
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onGPTCreated={(gptConfig: unknown) => {
          loadData();
          // Notify Layout to add thread to sidebar immediately
          if (layoutContext?.handleGPTCreated && gptConfig && typeof gptConfig === 'object') {
            const config = gptConfig as { constructCallsign?: string; id?: string; name?: string };
            layoutContext.handleGPTCreated({
              constructId: config.constructCallsign || config.id,
              constructCallsign: config.constructCallsign,
              name: config.name,
            });
          }
        }}
      />
    </div>
  )
}
