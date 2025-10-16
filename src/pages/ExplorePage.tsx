import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Bot, Search, Star, Users, TrendingUp, Filter, Grid, List } from 'lucide-react'
import GPTCreator from '../components/GPTCreator'
import { GPTService, GPTConfig } from '../lib/gptService'

interface CommunityGPT extends GPTConfig {
  author: string
  authorAvatar?: string
  likes: number
  downloads: number
  isLiked?: boolean
  isDownloaded?: boolean
  category: string
  tags: string[]
}

export default function ExplorePage() {
  const navigate = useNavigate()
  const gptService = GPTService.getInstance()
  const [isCreatorOpen, setCreatorOpen] = useState(false)
  const [gpts, setGpts] = useState<CommunityGPT[]>([])
  const [userGpts, setUserGpts] = useState<GPTConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'trending' | 'newest' | 'popular'>('trending')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

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
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      // Load user's GPTs
      const userGPTs = await gptService.getAllGPTs()
      setUserGpts(userGPTs)
      
      // Set mock community GPTs (in real app, fetch from API)
      setGpts(mockCommunityGPTs)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
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

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#ffffeb' }}>
      {/* Header */}
      <div className="p-6 border-b" style={{ borderColor: '#E1C28B' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#4C3D1E' }}>
              Explore GPTs
            </h1>
            <p className="text-sm mt-1" style={{ color: '#4C3D1E', opacity: 0.7 }}>
              Discover and use community-created AI assistants
            </p>
          </div>
          
          <button
            onClick={() => setCreatorOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ 
              backgroundColor: '#E1C28B', 
              color: '#4C3D1E' 
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d4b078'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
          >
            <Plus size={16} />
            Create GPT
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: '#4C3D1E', opacity: 0.5 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GPTs..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: '#ffffd7',
                borderColor: '#E1C28B',
                color: '#4C3D1E'
              }}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: '#ffffd7',
                borderColor: '#E1C28B',
                color: '#4C3D1E'
              }}
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSortBy('trending')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                sortBy === 'trending' ? 'bg-opacity-100' : 'bg-opacity-0'
              }`}
              style={{ 
                backgroundColor: sortBy === 'trending' ? '#feffaf' : 'transparent',
                color: '#4C3D1E'
              }}
            >
              <TrendingUp size={14} className="inline mr-1" />
              Trending
            </button>
            <button
              onClick={() => setSortBy('newest')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                sortBy === 'newest' ? 'bg-opacity-100' : 'bg-opacity-0'
              }`}
              style={{ 
                backgroundColor: sortBy === 'newest' ? '#feffaf' : 'transparent',
                color: '#4C3D1E'
              }}
            >
              Newest
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                sortBy === 'popular' ? 'bg-opacity-100' : 'bg-opacity-0'
              }`}
              style={{ 
                backgroundColor: sortBy === 'popular' ? '#feffaf' : 'transparent',
                color: '#4C3D1E'
              }}
            >
              Popular
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-opacity-100' : 'bg-opacity-0'
              }`}
              style={{ 
                backgroundColor: viewMode === 'grid' ? '#feffaf' : 'transparent',
                color: '#4C3D1E'
              }}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list' ? 'bg-opacity-100' : 'bg-opacity-0'
              }`}
              style={{ 
                backgroundColor: viewMode === 'list' ? '#feffaf' : 'transparent',
                color: '#4C3D1E'
              }}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Your GPTs Section */}
        {userGpts.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4C3D1E' }}>
              <span className="text-white text-xs font-bold">Y</span>
            </div>
            <span className="text-sm font-medium" style={{ color: '#4C3D1E' }}>
              Your GPTs ({userGpts.length})
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#E1C28B' }}></div>
          </div>
        ) : filteredGpts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: '#feffaf' }}>
              <Bot size={32} style={{ color: '#4C3D1E', opacity: 0.6 }} />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: '#4C3D1E' }}>
              No GPTs found
            </h3>
            <p className="text-sm max-w-md" style={{ color: '#4C3D1E', opacity: 0.7 }}>
              Try adjusting your search or filter criteria to find GPTs.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {filteredGpts.map((gpt) => (
              <div
                key={gpt.id}
                className={`rounded-lg border p-4 transition-all hover:shadow-md ${
                  viewMode === 'list' ? 'flex items-start gap-4' : ''
                }`}
                style={{ 
                  backgroundColor: '#ffffd7',
                  borderColor: '#E1C28B'
                }}
              >
                <div className={`flex items-start gap-3 ${viewMode === 'list' ? 'flex-shrink-0' : 'mb-3'}`}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#feffaf' }}>
                    {gpt.avatar ? (
                      <img src={gpt.avatar} alt={gpt.name} className="w-full h-full object-cover" />
                    ) : (
                      <Bot size={20} style={{ color: '#4C3D1E' }} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium mb-1" style={{ color: '#4C3D1E' }}>
                      {gpt.name}
                    </h3>
                    <p className="text-sm mb-2" style={{ color: '#4C3D1E', opacity: 0.7 }}>
                      {gpt.description}
                    </p>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#E1C28B', color: '#4C3D1E' }}>
                        {gpt.category}
                      </span>
                      {gpt.tags.slice(0, 2).map((tag, index) => (
                        <span key={index} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#feffaf', color: '#4C3D1E' }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs" style={{ color: '#4C3D1E', opacity: 0.6 }}>
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
                    className={`p-2 rounded transition-colors ${
                      gpt.isLiked ? 'bg-opacity-100' : 'bg-opacity-0'
                    }`}
                    style={{ 
                      backgroundColor: gpt.isLiked ? '#feffaf' : 'transparent',
                      color: '#4C3D1E'
                    }}
                  >
                    <Star size={16} fill={gpt.isLiked ? 'currentColor' : 'none'} />
                  </button>
                  
                  <button
                    onClick={() => handleDownload(gpt.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ 
                      backgroundColor: '#E1C28B', 
                      color: '#4C3D1E' 
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d4b078'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
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
        onGPTCreated={loadData}
      />
    </div>
  )
}

