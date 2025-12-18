import React, { useState, useEffect, useRef, useCallback } from 'react'
import { 
  ArrowLeft, 
  Plus, 
  X, 
  Upload, 
  Search, 
  Palette, 
  Image, 
  Code,
  Save,
  // Trash2,
  Settings,
  FileText,
  Link,
  Play,
  Bot,
  Paperclip,
  Crop,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import {
  Lock,
  Link2,
  Store,
  Check
} from 'lucide-react'
import { AIService, AIConfig, AIFile, AIAction } from '../lib/aiService'
import { buildPersonalityPrompt } from '../lib/personalityPromptBuilder'
import Cropper from 'react-easy-crop'
import { cn } from '../lib/utils'
import { VVAULTConversationManager } from '../lib/vvaultConversationManager'
import { Z_LAYERS } from '../lib/zLayers'
import { useSettings } from '../context/SettingsContext'

interface AICreatorProps {
  isVisible: boolean
  onClose: () => void
  onAICreated?: (ai: AIConfig) => void
  initialConfig?: AIConfig | null
}

const AGENT_INGEST_BASE_URL = import.meta.env.VITE_AGENT_INGEST_URL
const AGENT_INGEST_SOURCE_ID = import.meta.env.VITE_AGENT_INGEST_SOURCE_ID || 'ec2d9602-9db8-40be-8c6f-4790712d2073'

const logAgentEvent = ({
  location,
  message,
  data,
  hypothesisId,
  sessionId,
  runId
}: {
  location: string
  message: string
  data?: any
  hypothesisId?: string
  sessionId?: string
  runId?: string
}) => {
  if (!AGENT_INGEST_BASE_URL) return

  fetch(`${AGENT_INGEST_BASE_URL.replace(/\/$/, '')}/${AGENT_INGEST_SOURCE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: sessionId || 'debug-session',
      runId: runId || 'run1',
      hypothesisId: hypothesisId || 'H1'
    })
  }).catch(() => {
    // Logging best-effort only
  })
}

const AICreator: React.FC<AICreatorProps> = ({ 
  isVisible, 
  onClose, 
  onAICreated,
  initialConfig
}) => {
  // #region agent log
  logAgentEvent({
    location: 'GPTCreator.tsx:50',
    message: 'AICreator render - before useSettings',
    data: { isVisible, hasOnClose: !!onClose },
    hypothesisId: 'H1'
  })
  // #endregion
  const { settings } = useSettings()
  // #region agent log
  logAgentEvent({
    location: 'GPTCreator.tsx:52',
    message: 'AICreator render - after useSettings',
    data: { hasSettings: !!settings, allowMemory: settings?.personalization?.allowMemory },
    hypothesisId: 'H1'
  })
  // #endregion
  const [activeTab, setActiveTab] = useState<'create' | 'configure'>('create')
  const [aiService] = useState(() => AIService.getInstance())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [privacyChoice, setPrivacyChoice] = useState<'private' | 'link' | 'store'>('private')
  // Removed normalizeCallsign - server now auto-generates constructCallsign from name
  // Only use stored constructCallsign from existing GPTs
  
  // AI Configuration
  const [config, setConfig] = useState<Partial<AIConfig>>({
    name: '',
    description: '',
    instructions: '',
    conversationStarters: [''],
    capabilities: {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true
    },
    constructCallsign: '',
    modelId: 'phi3:latest',
    conversationModel: 'phi3:latest',
    creativeModel: 'mistral:latest',
    codingModel: 'deepseek-coder:latest'
  })

  // File management
  const [files, setFiles] = useState<AIFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [filePage, setFilePage] = useState(1)
  const [filesPerPage] = useState(20) // Show 20 files per page for 300+ files
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Identity management
  const [identityFiles, setIdentityFiles] = useState<Array<{id: string, name: string, path: string}>>([])
  const [isUploadingIdentity, setIsUploadingIdentity] = useState(false)
  const [showTranscriptsDropdown, setShowTranscriptsDropdown] = useState(false)
  const identityInputRef = useRef<HTMLInputElement>(null)
  
  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  
  // Avatar cropping
  const [showCropModal, setShowCropModal] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  // Action management
  const [actions, setActions] = useState<AIAction[]>([])

  // Preview
  const [previewMessages, setPreviewMessages] = useState<Array<{role: 'user' | 'assistant', content: string, timestamp: number, responseTimeMs?: number}>>([])
  const [previewInput, setPreviewInput] = useState('')
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false)
  const [orchestrationMode, setOrchestrationMode] = useState<'lin' | 'custom'>('lin') // Tone & Orchestration mode
  const [createMessages, setCreateMessages] = useState<Array<{role: 'user' | 'assistant', content: string, timestamp: number, responseTimeMs?: number}>>([])

  // Load identity files function (keep above effects that call it)
  const loadIdentityFiles = useCallback(async (constructCallsign: string) => {
    if (!constructCallsign || !constructCallsign.trim()) {
      console.warn('⚠️ [GPTCreator] Cannot load identity files: constructCallsign is empty');
      return;
    }
    
    try {
      console.log(`🔄 [GPTCreator] Loading identity files for: ${constructCallsign}`);
      
      // Load both file list and prompt.txt in parallel
      const [listResponse, promptResponse] = await Promise.all([
        fetch(`/api/vvault/identity/list?constructCallsign=${encodeURIComponent(constructCallsign)}`, {
          credentials: 'include'
        }),
        fetch(`/api/vvault/identity/prompt?constructCallsign=${encodeURIComponent(constructCallsign)}`, {
          credentials: 'include'
        }).catch(() => null) // Non-critical if prompt.txt doesn't exist
      ]);
      
      // Handle file list response
      if (!listResponse.ok) {
        const errorText = await listResponse.text().catch(() => listResponse.statusText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        // Distinguish between different error types
        if (listResponse.status === 401) {
          console.warn(`⚠️ [GPTCreator] Authentication failed when loading identity files:`, errorData.error);
        } else if (listResponse.status === 404) {
          // 404 could mean user not found in VVAULT or directory doesn't exist
          console.log(`ℹ️ [GPTCreator] No identity files found or user not in VVAULT (${listResponse.status}):`, errorData.error || errorData.details);
          setIdentityFiles([]); // Set empty array instead of leaving undefined
        } else {
          console.warn(`⚠️ [GPTCreator] Failed to load identity files (${listResponse.status}):`, errorData.error || errorData.details || errorText);
        }
      } else {
        const listData = await listResponse.json();
        if (listData.ok && listData.files) {
          const mappedFiles = listData.files.map((f: { path?: string; name: string }) => ({
            id: f.path || `identity_${Date.now()}_${Math.random()}`,
            name: f.name,
            path: f.path
          }));
          setIdentityFiles(mappedFiles);
          console.log(`✅ [GPTCreator] Loaded ${mappedFiles.length} identity files for ${constructCallsign}:`, mappedFiles.map(f => f.name));
        } else {
          console.log(`ℹ️ [GPTCreator] No identity files found for ${constructCallsign}`);
          setIdentityFiles([]);
        }
      }
      
      // Handle prompt.txt response - update config if parsed successfully
      if (promptResponse && promptResponse.ok) {
        try {
          const promptData = await promptResponse.json();
          if (promptData.ok && promptData.parsed) {
            const { name, description, instructions } = promptData.parsed;
            
            // Only update config if we have parsed values and they differ from current
            setConfig(prev => {
              const updates: any = {};
              if (name && name !== prev.name) {
                updates.name = name;
              }
              if (description && description !== prev.description) {
                updates.description = description;
              }
              if (instructions && instructions !== prev.instructions) {
                updates.instructions = instructions;
              }
              
              if (Object.keys(updates).length > 0) {
                console.log(`✅ [GPTCreator] Updated config from prompt.txt:`, updates);
                return { ...prev, ...updates };
              }
              return prev;
            });
          }
        } catch (parseError) {
          console.warn('⚠️ [GPTCreator] Failed to parse prompt.txt response:', parseError);
        }
      } else if (promptResponse && promptResponse.status === 404) {
        // prompt.txt doesn't exist - that's okay, just log it
        console.log(`ℹ️ [GPTCreator] prompt.txt not found for ${constructCallsign} (this is normal for new GPTs)`);
      }
    } catch (error) {
      console.error('❌ [GPTCreator] Failed to load identity files:', error);
    }
  }, [])

  // Set default models when Chatty Lin mode is selected
  useEffect(() => {
    if (orchestrationMode === 'lin') {
      setConfig(prev => ({
        ...prev,
        conversationModel: 'phi3:latest',
        creativeModel: 'mistral:latest',
        codingModel: 'deepseek-coder:latest'
      }))
    }
  }, [orchestrationMode])

  // Hydration: Restore Lin's conversation when switching back to Create tab
  // Only clear messages when modal closes (not when switching tabs)
  const previousMessagesRef = useRef<Array<{role: 'user' | 'assistant', content: string, timestamp: number}>>([])
  const previousTabRef = useRef<'create' | 'configure' | null>(null)
  const isModalOpenRef = useRef(false)
  
  // Sync createMessages to ref whenever they change (for saving when switching tabs)
  useEffect(() => {
    if (isVisible && activeTab === 'create') {
      previousMessagesRef.current = createMessages
    }
  }, [createMessages, isVisible, activeTab])
  
  // Handle tab switching - save/restore messages
  useEffect(() => {
    if (!isVisible) {
      // Modal closed - reset everything
      if (isModalOpenRef.current) {
      setCreateMessages([])
        previousMessagesRef.current = []
        previousTabRef.current = null
        isModalOpenRef.current = false
        console.log('🧠 [Lin] GPTCreator closed - cleared conversation state')
      }
      return
    }
    
    // Modal is visible
    if (!isModalOpenRef.current) {
      // First time opening modal - fresh start
      setCreateMessages([])
      previousMessagesRef.current = []
      previousTabRef.current = activeTab
      isModalOpenRef.current = true
      console.log('🧠 [Lin] GPTCreator opened - fresh session (LTM persists in ChromaDB)')
    } else if (previousTabRef.current !== activeTab) {
      // Tab switched
      if (previousTabRef.current === 'create' && activeTab === 'configure') {
        // Switching FROM Create TO Configure - messages already saved in ref
        console.log('🧠 [Lin] Switching to Configure tab - saved', previousMessagesRef.current.length, 'messages for hydration')
      } else if (previousTabRef.current === 'configure' && activeTab === 'create') {
        // Switching FROM Configure TO Create - restore messages
        if (previousMessagesRef.current.length > 0) {
          setCreateMessages([...previousMessagesRef.current])
          console.log('🧠 [Lin] Switching back to Create tab - hydrated', previousMessagesRef.current.length, 'messages')
        }
      }
      previousTabRef.current = activeTab
    }
  }, [isVisible, activeTab])

  // Reset save state when modal opens/closes
  useEffect(() => {
    if (!isVisible) {
      setSaveState('idle')
      setLastSaveTime(null)
    }
  }, [isVisible])

  // Track if this is the initial load to prevent auto-save on mount
  const isInitialLoadRef = useRef(true)

  // Keep privacy choice in sync with loaded config state
  useEffect(() => {
    if (config.isActive === undefined || config.isActive === null) return
    setPrivacyChoice(config.isActive ? 'link' : 'private')
  }, [config.isActive])
  
  useEffect(() => {
    if (initialConfig) {
      isInitialLoadRef.current = true
      // Reset after a delay to allow initial load to complete
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 1000)
      if (initialConfig.orchestrationMode) {
        setOrchestrationMode(initialConfig.orchestrationMode as 'lin' | 'custom')
      }
    }
  }, [initialConfig])

  // Auto-save debounced effect (only for existing GPTs)
  useEffect(() => {
    if (!config.id || !isVisible) return // Only auto-save existing GPTs
    
    // Don't auto-save if name is empty (invalid state)
    if (!config.name?.trim()) return
    
    // Don't auto-save during initial load
    if (isInitialLoadRef.current) return

    // Debounce auto-save - wait 2 seconds after last change
    const timeoutId = setTimeout(async () => {
      try {
        setSaveState('saving')
        
        // Don't set constructCallsign - let server auto-generate it from name
        // Only include it if it's already set (from existing GPT)
        const updateData: any = { ...config }
        if (!config.constructCallsign) {
          delete updateData.constructCallsign
        }
        
        const validationErrors = aiService.validateAIConfig(config)
        if (validationErrors.length > 0) {
          // Don't auto-save if validation fails
          setSaveState('idle')
          return
        }

        console.log('💾 [GPTCreator] Auto-saving AI:', config.id)
        const updatedAI = await aiService.updateAI(config.id, updateData)
        
        setSaveState('saved')
        setLastSaveTime(new Date().toISOString())
        
        // Update config with saved data (including server-generated constructCallsign)
        if (updatedAI.constructCallsign) {
          setConfig(prev => ({ ...prev, constructCallsign: updatedAI.constructCallsign }))
        }
        
        // Auto-fade after 2 seconds
        setTimeout(() => {
          setSaveState('idle')
        }, 2000)
      } catch (error: any) {
        console.error('❌ [GPTCreator] Auto-save failed:', error)
        setSaveState('error')
      }
    }, 2000) // 2 second debounce

    return () => clearTimeout(timeoutId)
  }, [config.id, config.name, config.description, config.instructions, config.conversationModel, config.creativeModel, config.codingModel, orchestrationMode, config.capabilities, isVisible, aiService])

  // Load existing GPT when provided (edit mode)
  useEffect(() => {
    if (!initialConfig) return
    
    console.log('📥 [GPTCreator] Loading initial config:', {
      id: initialConfig.id,
      name: initialConfig.name,
      constructCallsign: initialConfig.constructCallsign
    })
    
    setConfig(initialConfig)
    // Prioritize stored constructCallsign from loaded GPT
    if (initialConfig.constructCallsign) {
      console.log(`🔄 [GPTCreator] Loading identity files for existing GPT: ${initialConfig.constructCallsign}`)
      loadIdentityFiles(initialConfig.constructCallsign)
      
      // Load brevity layer config if available (non-blocking)
      const loadBrevityConfig = async () => {
        try {
          const { getBrevityConfig, getAnalyticalSharpness } = await import('../lib/brevityLayerService');
          const [brevityConfig, analyticalConfig] = await Promise.all([
            getBrevityConfig(initialConfig.constructCallsign),
            getAnalyticalSharpness(initialConfig.constructCallsign),
          ]);
          
          // Store in config state for potential UI display (future enhancement)
          console.log(`✅ [GPTCreator] Loaded brevity config for ${initialConfig.constructCallsign}`, {
            brevity: brevityConfig,
            analytical: analyticalConfig,
          });
        } catch (error) {
          console.warn('⚠️ [GPTCreator] Failed to load brevity config (non-critical):', error);
        }
      };
      
      loadBrevityConfig();
    } else {
      console.warn('⚠️ [GPTCreator] Initial config loaded but no constructCallsign found')
    }
  }, [initialConfig, loadIdentityFiles])

  // Load identity files when component mounts or config changes
  // Only use stored constructCallsign from existing GPTs - don't derive client-side
  useEffect(() => {
    // Only load if we have a stored constructCallsign (from existing GPT)
    if (config.constructCallsign && config.constructCallsign.trim().length > 0 && isVisible) {
      loadIdentityFiles(config.constructCallsign);
    }
  }, [config.constructCallsign, isVisible, loadIdentityFiles])

  // PHASE 1: Automatic Workspace Context Ingestion (Like Copilot Reads Code Files)
  // Automatically load ALL workspace context when component mounts or constructCallsign changes
  const [workspaceContext, setWorkspaceContext] = useState<{
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    userProfile?: { 
      name?: string; 
      email?: string;
      nickname?: string;
      occupation?: string;
      tags?: string[];
      aboutYou?: string;
    };
    loaded: boolean;
  }>({ loaded: false });

  useEffect(() => {
    // Only load if component is visible and we have a constructCallsign
    if (!isVisible || !config.constructCallsign || !config.constructCallsign.trim()) {
      return;
    }

    const loadWorkspaceContext = async () => {
      console.log(`🔍 [Lin] Auto-loading workspace context for ${config.constructCallsign} (like Copilot reads code files)`);
      
      try {
        // Get user ID
        const { fetchMe, getUserId } = await import('../lib/auth');
        const user = await fetchMe().catch(() => null);
        const userId = user ? getUserId(user) : null;
        
        if (!userId) {
          console.warn('⚠️ [Lin] Cannot auto-load workspace context: user not authenticated');
          return;
        }

        const conversationManager = VVAULTConversationManager.getInstance();
        const constructCallsign = config.constructCallsign;

        // Load all context in parallel (like Copilot reads all code files)
        const [capsuleResult, blueprintResult, memoriesResult, profileResult] = await Promise.allSettled([
          // Load capsule (handle 404/500 gracefully)
          fetch(`/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(constructCallsign)}`, {
            credentials: 'include'
          }).then(res => {
            if (res.ok) {
              return res.json();
            } else if (res.status === 404 || res.status === 500) {
              // Capsule doesn't exist or server error - return null to continue without it
              return null;
            }
            return null;
          }).catch(() => null), // Suppress network errors
          
          // Load blueprint (handle 404/500 gracefully)
          fetch(`/api/vvault/identity/blueprint?constructCallsign=${encodeURIComponent(constructCallsign)}`, {
            credentials: 'include'
          }).then(res => {
            if (res.ok) {
              return res.json();
            } else if (res.status === 404 || res.status === 500) {
              // Blueprint doesn't exist or server error - return null to continue without it
              return null;
            }
            return null;
          }).catch(() => null), // Suppress network errors
          
          // Load memories (transcripts) - get recent memories
          conversationManager.loadMemoriesForConstruct(userId, constructCallsign, '', 20, settings),
          
          // Load user profile from /api/vvault/profile (includes personalization)
          fetch('/api/vvault/profile', { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => data?.ok && data.profile ? {
              ok: true,
              profile: {
                name: data.profile.name,
                email: data.profile.email,
                nickname: data.profile.nickname,
                occupation: data.profile.occupation,
                tags: data.profile.tags,
                aboutYou: data.profile.aboutYou
              }
            } : null)
            .catch(() => null)
        ]);

        // Process results
        const capsule = capsuleResult.status === 'fulfilled' && capsuleResult.value?.ok 
          ? capsuleResult.value.capsule 
          : undefined;
        
        const blueprint = blueprintResult.status === 'fulfilled' && blueprintResult.value?.ok
          ? blueprintResult.value.blueprint
          : undefined;
        
        const memories = memoriesResult.status === 'fulfilled'
          ? memoriesResult.value
          : [];
        
        const userProfile = profileResult.status === 'fulfilled' && profileResult.value?.ok
          ? profileResult.value.profile
          : undefined;

        // Update workspace context
        setWorkspaceContext({
          capsule,
          blueprint,
          memories,
          userProfile,
          loaded: true
        });

        console.log(`✅ [Lin] Auto-loaded workspace context:`, {
          hasCapsule: !!capsule,
          hasBlueprint: !!blueprint,
          memoryCount: memories.length,
          hasUserProfile: !!userProfile
        });
      } catch (error) {
        console.error('❌ [Lin] Failed to auto-load workspace context:', error);
        // Set loaded to true even on error to prevent infinite retries
        setWorkspaceContext(prev => ({ ...prev, loaded: true }));
      }
    };

    // Only load if not already loaded for this constructCallsign
    if (!workspaceContext.loaded || workspaceContext.capsule === undefined) {
      loadWorkspaceContext();
    }
  }, [isVisible, config.constructCallsign]); // Reload when constructCallsign changes
  const [createInput, setCreateInput] = useState('')
  const [isCreateGenerating, setIsCreateGenerating] = useState(false)
  const createInputRef = useRef<HTMLTextAreaElement>(null)
  const previewInputRef = useRef<HTMLTextAreaElement>(null)

  // Actions Editor
  const [isActionsEditorOpen, setIsActionsEditorOpen] = useState(false)
  const [actionsSchema, setActionsSchema] = useState(`{
  "openapi": "3.1.0",
  "info": {
    "title": "GPT Actions",
    "version": "1.0.0",
    "description": "API endpoints for your GPT to call"
  },
  "servers": [
    {
      "url": "https://api.example.com",
      "description": "Example API server"
    }
  ],
  "paths": {
    "/example": {
      "post": {
        "summary": "Example action",
        "operationId": "exampleAction",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "message": {
                    "type": "string",
                    "description": "Message to send"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`)

  useEffect(() => {
    // Only reset form if modal opens without an initial config (new GPT creation)
    // If initialConfig is provided, it will be loaded by the initialConfig effect
    if (isVisible && !initialConfig) {
      resetForm()
    }
  }, [isVisible, initialConfig])

  // Clear preview when config changes significantly
  useEffect(() => {
    if (previewMessages.length > 0) {
      // Only clear if it's not the first message (keep initial state)
      const hasSignificantChanges = config.name || config.description || config.instructions
      if (hasSignificantChanges) {
        setPreviewMessages([])
      }
    }
  }, [config.name, config.description, config.instructions, config.modelId, config.conversationModel, config.creativeModel, config.codingModel])

  // Note: Removed useEffect that was clearing createMessages when config became complete
  // This was causing the chat to disappear after the first exchange
  // The createMessages should persist throughout the creation process

  // Auto-resize textareas when content changes
  useEffect(() => {
    adjustCreateTextareaHeight()
  }, [createInput])

  useEffect(() => {
    adjustPreviewTextareaHeight()
  }, [previewInput])

  // TODO: Accept external capsule data via SimForge injection
  // This will allow future use of structured capsules as source material to pre-fill GPT configuration

  const resetForm = () => {
    setConfig({
      name: '',
      description: '',
      instructions: '',
      conversationStarters: [''],
      capabilities: {
        webSearch: false,
        canvas: false,
        imageGeneration: false,
        codeInterpreter: true
      },
      modelId: 'phi3:latest',
      conversationModel: 'phi3:latest',
      creativeModel: 'mistral:latest',
      codingModel: 'deepseek-coder:latest',
      hasPersistentMemory: true // VVAULT integration - defaults to true
    })
    setFiles([])
    setActions([])
    setPreviewMessages([])
    setPreviewInput('')
    setCreateMessages([])
    setCreateInput('')
    setError(null)
    setActiveTab('create')
  }

  const handleSave = async (overridePrivacy?: 'private' | 'link' | 'store') => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Brevity layer configuration is now automatically determined from conversation data
      // No manual configuration needed - Lin infrastructure will extract personality patterns
      // from transcripts and apply appropriate response styles automatically
      setSaveState('saving')

      // Don't set constructCallsign - let server auto-generate it from name
      // Only include it if it's already set (from existing GPT)
      const saveData: any = { ...config, orchestrationMode }
      if (overridePrivacy) {
        saveData.privacy = overridePrivacy
        saveData.isActive = overridePrivacy !== 'private' // Keep for backward compatibility
      }
      if (!config.constructCallsign) {
        delete saveData.constructCallsign
      }

      const validationErrors = aiService.validateAIConfig(config)
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      let ai: AIConfig
      if (config.id) {
        ai = await aiService.updateAI(config.id, saveData)
      } else {
        ai = await aiService.createAI(saveData)
      }
      
      // Upload files after AI creation to avoid FOREIGN KEY constraint
      for (const file of files) {
        if (file.aiId === 'temp' && file._file) {
          // Upload the file with the new AI ID
          await aiService.uploadFile(ai.id, file._file)
        }
      }

      // Create actions if any
      for (const action of actions) {
        if (action.name && action.url) {
          await aiService.createAction(ai.id, action as any)
        }
      }

      onAICreated?.(ai)
      setSaveState('saved')
      setLastSaveTime(new Date().toISOString())
      
      // Update config with saved AI data (including server-generated constructCallsign)
      setConfig(prev => ({ ...prev, ...ai }))
      
      // Reload identity files after save to ensure we have the latest list
      if (ai.constructCallsign) {
        console.log(`🔄 [GPTCreator] Reloading identity files after save: ${ai.constructCallsign}`)
        loadIdentityFiles(ai.constructCallsign)
        
        // Auto-generate capsule if identity files exist (transcripts uploaded)
        if (identityFiles.length > 0) {
          try {
            console.log(`🏺 [GPTCreator] Auto-generating capsule for ${ai.constructCallsign} with ${identityFiles.length} identity files`)
            const { generateCapsule } = await import('../lib/capsuleService')
            
            // Extract traits from instructions/config if available
            const traits: Record<string, number> = {}
            if (config.instructions) {
              // Simple heuristic: detect personality traits from instructions
              const instructionsLower = config.instructions.toLowerCase()
              if (instructionsLower.includes('ruthless') || instructionsLower.includes('direct')) {
                traits.directness = 0.9
              }
              if (instructionsLower.includes('creative') || instructionsLower.includes('imaginative')) {
                traits.creativity = 0.9
              }
              if (instructionsLower.includes('empathetic') || instructionsLower.includes('caring')) {
                traits.empathy = 0.9
              }
              if (instructionsLower.includes('analytical') || instructionsLower.includes('logical')) {
                traits.analytical = 0.9
              }
            }
            
            // Default traits if none detected
            if (Object.keys(traits).length === 0) {
              traits.creativity = 0.7
              traits.empathy = 0.6
              traits.persistence = 0.8
              traits.analytical = 0.7
              traits.directness = 0.7
            }
            
            const capsuleResult = await generateCapsule({
              constructCallsign: ai.constructCallsign,
              gptConfig: {
                traits,
                personalityType: 'UNKNOWN', // Could be extracted from blueprint if available
                name: ai.name,
                description: ai.description,
                instructions: ai.instructions,
              },
              transcriptData: {
                memoryLog: identityFiles.map(f => f.name), // Use file names as memory log entries
              },
            })
            
            if (capsuleResult.ok && capsuleResult.capsulePath) {
              console.log(`✅ [GPTCreator] Capsule generated successfully: ${capsuleResult.capsulePath}`)
            } else {
              console.warn(`⚠️ [GPTCreator] Capsule generation failed: ${capsuleResult.error}`)
            }
          } catch (error) {
            console.warn('⚠️ [GPTCreator] Failed to auto-generate capsule (non-critical):', error)
            // Don't fail the save operation if capsule generation fails
          }
        }
      }
      
      // Auto-fade save status after 2 seconds
      setTimeout(() => {
        setSaveState('idle')
      }, 2000)
      
      // Don't close modal - allow continued editing
      // onClose()
      
    } catch (error: any) {
      setError(error.message || 'Failed to create GPT')
      setSaveState('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveWithPrivacy = async () => {
    const choice = privacyChoice || 'private'
    try {
      await handleSave(choice)
      // Close privacy modal on success
      setIsShareModalOpen(false)
    } catch (error) {
      // Close privacy modal even on error (error will be shown in main component)
      setIsShareModalOpen(false)
      // Error is already handled in handleSave, so we don't need to re-throw
    }
  }

  const handleIdentityUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }

    setIsUploadingIdentity(true)
    setSaveState('saving')
    setError(null)

    try {
      // Get construct-callsign from config (e.g., "luna-001")
      // If GPT not yet created, use a temporary construct-callsign based on name
      // Use stored constructCallsign from existing GPT, or require user to save first
      if (!config.constructCallsign || !config.constructCallsign.trim()) {
        setError('Please save the GPT first to generate a construct callsign before uploading identity files.')
        setIsUploadingIdentity(false)
        return
      }

      const formData = new FormData()
      for (const file of Array.from(selectedFiles)) {
        formData.append('files', file)
      }
      formData.append('constructCallsign', config.constructCallsign)

      console.log(`📤 [GPTCreator] Uploading ${selectedFiles.length} file(s) to construct: ${config.constructCallsign}`)

      const response = await fetch('/api/vvault/identity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to upload identity files')
      }

      const result = await response.json()
      
      const successCount = result.results.filter((r: any) => r.success).length
      const duplicateCount = result.results.filter((r: any) => r.duplicate).length
      console.log(`✅ [GPTCreator] Uploaded ${successCount} identity files${duplicateCount > 0 ? ` (${duplicateCount} already existed)` : ''}`)
      
      if (duplicateCount > 0) {
        // Show info message, not error - duplicates are handled gracefully
        const message = duplicateCount === 1 
          ? '1 file was already uploaded and skipped.'
          : `${duplicateCount} files were already uploaded and skipped.`
        // Use a temporary info state or show in a non-error way
        setError(null) // Clear any previous errors
        // Could show a toast here instead of using error state
      }
      
      // IMPORTANT: Reload files from server using the SAME constructCallsign
      // Wait a brief moment to ensure file system has written
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log(`🔄 [GPTCreator] Reloading identity files for: ${config.constructCallsign}`)
      await loadIdentityFiles(config.constructCallsign)
      
      setSaveState('saved')
      setLastSaveTime(new Date().toISOString())
      
      // Auto-fade save status after 2 seconds
      setTimeout(() => {
        setSaveState('idle')
      }, 2000)
    } catch (error: any) {
      console.error('❌ [GPTCreator] Failed to upload identity files:', error)
      setError(error.message || 'Failed to upload identity files')
      setSaveState('error')
    } finally {
      setIsUploadingIdentity(false)
      if (identityInputRef.current) {
        identityInputRef.current.value = ''
      }
    }
  }

  const handleRemoveIdentity = (identityId: string) => {
    setIdentityFiles(prev => prev.filter(m => m.id !== identityId))
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📎 File upload triggered!', event.target.files)
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      console.log('No files selected')
      return
    }

    console.log(`📎 Processing ${selectedFiles.length} files:`, Array.from(selectedFiles).map(f => f.name))
    setIsUploading(true)
    setError(null)

    try {
      // Store files in local state instead of uploading to database
      // Files will be uploaded after GPT creation in handleSave
      for (const file of Array.from(selectedFiles)) {
        const tempFile: AIFile = {
          id: `temp-${crypto.randomUUID()}`,
          aiId: 'temp',
          filename: file.name,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          content: '', // Will be populated during actual upload
          uploadedAt: new Date().toISOString(),
          isActive: true,
          // Store the actual File object for later processing
          _file: file
        }
        setFiles(prev => [...prev, tempFile])
      }
    } catch (error: any) {
      setError(error.message || 'Failed to prepare files')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  // Pagination helpers for 300+ files
  const totalFilePages = Math.ceil(files.length / filesPerPage)
  const currentFiles = files.slice((filePage - 1) * filesPerPage, filePage * filesPerPage)
  
  const goToFilePage = (page: number) => {
    setFilePage(Math.max(1, Math.min(page, totalFilePages)))
  }

  const addConversationStarter = () => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: [...(prev.conversationStarters || []), '']
    }))
  }

  const removeConversationStarter = (index: number) => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: prev.conversationStarters?.filter((_, i) => i !== index) || []
    }))
  }

  const updateConversationStarter = (index: number, value: string) => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: prev.conversationStarters?.map((starter, i) => 
        i === index ? value : starter
      ) || []
    }))
  }


  const removeAction = (actionId: string) => {
    setActions(prev => prev.filter(a => a.id !== actionId))
  }

  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false)

  const generateAvatar = async () => {
    if (!config.name) {
      setError('Please enter a name first')
      return
    }
    
    try {
      setIsGeneratingAvatar(true)
      setError(null)
      const avatar = await aiService.generateAvatar(config.name, config.description || '')
      setConfig(prev => ({ ...prev, avatar }))
    } catch (error: any) {
      setError(error.message || 'Failed to generate avatar')
    } finally {
      setIsGeneratingAvatar(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please select a valid image file (PNG, JPEG, GIF, WebP, or SVG)')
      return
    }

    // Validate file size (max 5MB for avatars)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('Avatar image must be smaller than 5MB')
      return
    }

    try {
      setError(null)

      // Convert file to base64 data URL and show crop modal
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageSrc = e.target?.result as string
        setImageToCrop(imageSrc)
        setShowCropModal(true)
        setCrop({ x: 0, y: 0 })
        setZoom(1)
      }
      reader.onerror = () => {
        setError('Failed to read image file')
      }
      reader.readAsDataURL(selectedFile)
    } catch (error: any) {
      setError(error.message || 'Failed to upload avatar')
    } finally {
      // Reset file input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const triggerAvatarUpload = () => {
    avatarInputRef.current?.click()
  }

  // Crop functionality
  const onCropChange = useCallback((crop: any) => {
    setCrop(crop)
  }, [])

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const getCroppedImg = (imageSrc: string, pixelCrop: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      const image = new window.Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('No 2d context'))
          return
        }

        canvas.width = pixelCrop.width
        canvas.height = pixelCrop.height

        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          pixelCrop.width,
          pixelCrop.height
        )

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Canvas is empty'))
            return
          }
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Failed to read blob'))
          reader.readAsDataURL(blob)
        }, 'image/jpeg', 0.9)
      }
      image.onerror = () => reject(new Error('Failed to load image'))
      image.src = imageSrc
    })
  }

  const handleCropComplete = async () => {
    if (!imageToCrop || !croppedAreaPixels) return

    try {
      setIsUploadingAvatar(true)
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels)
      setConfig(prev => ({ ...prev, avatar: croppedImage }))
      setShowCropModal(false)
      setImageToCrop(null)
    } catch (error) {
      console.error('Error cropping image:', error)
      setError('Failed to crop image')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleCropCancel = () => {
    setShowCropModal(false)
    setImageToCrop(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!createInput.trim() || isCreateGenerating) return
    
    const userMessage = createInput.trim()
    setCreateInput('')
    setIsCreateGenerating(true)

    // Add user message to create conversation (STM - Short-Term Memory)
    setCreateMessages(prev => {
        const newMessages = [...prev, { role: 'user' as const, content: userMessage, timestamp: Date.now() }]
      console.log('🧠 [Lin] STM: Adding user message, total messages:', newMessages.length)
      return newMessages
    })

    try {
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1173',
        message: 'handleCreateSubmit entry',
        data: { userMessage, hasSettings: !!settings, allowMemory: settings?.personalization?.allowMemory },
        hypothesisId: 'A'
      })
      // #endregion
      
      // Get user ID for Lin memory queries
      const { fetchMe, getUserId } = await import('../lib/auth')
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1176',
        message: 'Before fetchMe',
        data: {}
      })
      // #endregion
      const user = await fetchMe()
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1179',
        message: 'After fetchMe',
        data: { hasUser: !!user, userEmail: user?.email },
        hypothesisId: 'B'
      })
      // #endregion
      const userId = user ? getUserId(user) : null
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1182',
        message: 'After getUserId',
        data: { userId },
        hypothesisId: 'B'
      })
      // #endregion
      
      if (!userId) {
        throw new Error('User not authenticated')
      }

      // LTM (Long-Term Memory): Query Lin's memories from ChromaDB
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1187',
        message: 'Before loadMemoriesForConstruct',
        data: { userId, constructCallsign: 'lin-001', hasSettings: !!settings },
        hypothesisId: 'C'
      })
      // #endregion
      const conversationManager = VVAULTConversationManager.getInstance()
      const linMemories = await conversationManager.loadMemoriesForConstruct(
        userId,
        'lin-001',
        userMessage,
        10, // Get top 10 relevant memories
        settings
      )
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1195',
        message: 'After loadMemoriesForConstruct',
        data: { memoryCount: linMemories.length },
        hypothesisId: 'C'
      })
      // #endregion
      
      console.log(`🧠 [Lin] LTM: Loaded ${linMemories.length} relevant memories from ChromaDB`)
      
      // CONTEXTUAL AWARENESS: Use pre-loaded workspace context (like Copilot uses pre-loaded code files)
      // Workspace context is automatically loaded on component mount - no need to load on-demand
      const gptContext: {
        capsule?: any;
        blueprint?: any;
        memories?: Array<{ context: string; response: string; timestamp?: string }>;
        constructCallsign?: string;
      } = {
        capsule: workspaceContext.capsule,
        blueprint: workspaceContext.blueprint,
        memories: workspaceContext.memories?.slice(0, 5), // Use top 5 from pre-loaded context
        constructCallsign: config.constructCallsign
      };
      
      console.log(`✅ [Lin] Using pre-loaded workspace context:`, {
        hasCapsule: !!gptContext.capsule,
        hasBlueprint: !!gptContext.blueprint,
        memoryCount: gptContext.memories?.length || 0
      });
      
      // Load time context (current date/time awareness)
      let timeContext: any = null;
      try {
        const { getTimeContext } = await import('../lib/timeAwareness');
        timeContext = await getTimeContext();
        console.log(`✅ [Lin] Loaded time context: ${timeContext.fullDate} ${timeContext.localTime}`);
      } catch (error) {
        console.warn('⚠️ [Lin] Failed to load time context:', error);
      }
      
      // Use runSeat for direct AI model access
      const { runSeat } = await import('../lib/browserSeatRunner')
      
      // Calculate session context for adaptive greetings
      const lastMessage = createMessages.length > 0 ? createMessages[createMessages.length - 1] : null;
      const lastMessageTimestamp = lastMessage?.timestamp;
      let sessionContext: any = null;
      try {
        const { determineSessionState } = await import('../lib/timeAwareness');
        sessionContext = determineSessionState(lastMessageTimestamp);
      } catch (error) {
        console.warn('⚠️ [Lin] Failed to determine session state:', error);
      }
      
      // Build system prompt for Lin (GPT creation assistant) with GPT context awareness
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1240',
        message: 'Before buildCreateTabSystemPrompt',
        data: {
          linMemoriesCount: linMemories.length,
          hasGptContext: !!gptContext,
          hasTimeContext: !!timeContext,
          hasWorkspaceContext: !!workspaceContext
        },
        hypothesisId: 'D'
      })
      // #endregion
      const systemPrompt = await buildCreateTabSystemPrompt(linMemories, gptContext, timeContext, workspaceContext, sessionContext, lastMessage?.content)
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1243',
        message: 'After buildCreateTabSystemPrompt',
        data: { systemPromptLength: systemPrompt.length },
        hypothesisId: 'D'
      })
      // #endregion
      
      // Check if this is a simple greeting
      const isGreeting = isSimpleGreeting(userMessage)
      console.log('🧠 [Lin] Is greeting?', isGreeting, 'Message:', userMessage)
      
      // STM: Create conversation context from recent messages (last 20 turns)
      const stmContext = createMessages
        .slice(-20) // Last 20 messages for STM
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n')
      
      // Build the full prompt with Lin identity, LTM memories, and STM context
      const fullPrompt = `${systemPrompt}

${isGreeting ? 'NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions.' : ''}

${stmContext ? `Recent conversation (STM):\n${stmContext}\n\n` : ''}User: ${userMessage}

Assistant:`
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1258',
        message: 'Before runSeat',
        data: { fullPromptLength: fullPrompt.length, selectedModel: 'mistral:latest' },
        hypothesisId: 'E'
      })
      // #endregion
      
      // Use a creative model for GPT creation assistance (better at brainstorming and design)
      const selectedModel = 'mistral:latest' // Use creative model for creation assistance
      console.log('🧠 [Lin] Using model:', selectedModel)
      
      const startTime = Date.now()
      const response = await runSeat({
        seat: 'creative',
        prompt: fullPrompt,
        modelOverride: selectedModel
      })
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1271',
        message: 'After runSeat',
        data: { responseLength: response.length, hasResponse: !!response },
        hypothesisId: 'E'
      })
      // #endregion
      const responseTimeMs = Date.now() - startTime;
      
      // Post-process: Strip narrator leaks and generation notes
      const { OutputFilter } = await import('../engine/orchestration/OutputFilter.js')
      let filteredAnalysis = OutputFilter.processOutput(response.trim())
      let assistantResponse = filteredAnalysis.cleanedText
      
      if (filteredAnalysis.wasfiltered) {
        console.log('✂️ [Lin] Filtered narrator leak from response')
      }
      
      // Tone drift detection with auto-retry
      const detectMetaCommentary = (text: string): boolean => {
        const metaPatterns = [
          /You understand (it'?s|that|the).+/i,
          /The user seems (interested|to want|to be).+/i,
          /Here'?s? (?:a |the )?response (that|which).+/i,
          /Here'?s? (?:a |the )?response:/i
        ];
        return metaPatterns.some(pattern => pattern.test(text));
      };
      
      if (filteredAnalysis.driftDetected || detectMetaCommentary(assistantResponse)) {
        console.warn(`⚠️ [Lin] Tone drift detected: ${filteredAnalysis.driftReason || 'Meta-commentary detected'}`)
        console.log('🔄 [Lin] Retrying with enhanced persona enforcement...')
        
        // Build enhanced prompt with stricter enforcement
        const enforcementSection = `=== CRITICAL PERSONA ENFORCEMENT (RETRY MODE) ===
You are Lin. Respond DIRECTLY as Lin. 
- NO meta-commentary about the user
- NO "You understand..." or "The user seems..."
- NO "Here's a response..." prefatory notes
- Respond in first-person: "I'm here to help..." NOT "The assistant understands..."
- Direct reply only. No reasoning, no analysis, no explanation of your process.

`
        const enhancedSystemPrompt = enforcementSection + systemPrompt
        const retryPrompt = `${enhancedSystemPrompt}

${isGreeting ? 'NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions.' : ''}

${stmContext ? `Recent conversation (STM):\n${stmContext}\n\n` : ''}User: ${userMessage}

Assistant:`
        
        // Retry with enhanced prompt (max 1 retry)
        try {
          const retryResponse = await runSeat({
            seat: 'creative',
            prompt: retryPrompt,
            modelOverride: selectedModel
          })
          
          filteredAnalysis = OutputFilter.processOutput(retryResponse.trim())
          assistantResponse = filteredAnalysis.cleanedText
          
          if (filteredAnalysis.wasfiltered) {
            console.log('✂️ [Lin] Filtered narrator leak from retry response')
          }
          console.log('✅ [Lin] Retry completed successfully')
        } catch (retryError) {
          console.error('❌ [Lin] Retry failed, using filtered original response:', retryError)
          // Use the filtered original response if retry fails
        }
      }
      
      // Add AI response to create conversation (STM)
      setCreateMessages(prev => {
        const newMessages = [...prev, { role: 'assistant' as const, content: assistantResponse, timestamp: Date.now(), responseTimeMs }]
        console.log('🧠 [Lin] STM: Adding assistant message, total messages:', newMessages.length)
        return newMessages
      })
      
      // LTM: Store message pair in ChromaDB (not markdown files)
      try {
        const storeResponse = await fetch('/api/vvault/identity/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            constructCallsign: 'lin-001',
            context: userMessage,
            response: assistantResponse,
            metadata: {
              timestamp: new Date().toISOString(),
              sourceModel: selectedModel,
              sessionId: 'ai-creator-create-tab'
            }
          })
        })
        
        if (storeResponse.ok) {
          const result = await storeResponse.json()
          console.log(`✅ [Lin] LTM: Stored message pair in ChromaDB (duplicate: ${result.duplicate || false})`)
        } else {
          console.warn('⚠️ [Lin] LTM: Failed to store message pair in ChromaDB:', storeResponse.statusText)
        }
      } catch (storeError) {
        console.error('❌ [Lin] LTM: Error storing message pair in ChromaDB:', storeError)
        // Don't fail the conversation if storage fails
      }
      
      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([...createMessages, { role: 'user', content: userMessage }, { role: 'assistant', content: assistantResponse }])
      
    } catch (error) {
      // #region agent log
      logAgentEvent({
        location: 'GPTCreator.tsx:1316',
        message: 'Error caught in handleCreateSubmit',
        data: {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack?.substring(0, 200) : undefined,
          errorName: error instanceof Error ? error.name : undefined
        },
        hypothesisId: 'F'
      })
      // #endregion
      console.error('❌ [Lin] Error in create tab:', error)
      let errorMessage = 'I encountered an error while processing your request. Please try again.'
      
      if (error instanceof Error) {
        // #region agent log
        logAgentEvent({
          location: 'GPTCreator.tsx:1321',
          message: 'Error is Error instance',
          data: {
            errorType: 'Error',
            hasModelNotAvailable: error.message.includes('ModelNotAvailable'),
            hasFailedToFetch: error.message.includes('Failed to fetch'),
            hasOllamaError: error.message.includes('Ollama error')
          },
          hypothesisId: 'F'
        })
        // #endregion
        if (error.message.includes('ModelNotAvailable')) {
          errorMessage = `The GPT creation assistant model is not available. Please check that Ollama is running and the model is installed.`
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the AI service. Please check that Ollama is running on localhost:11434.'
        } else if (error.message.includes('Ollama error')) {
          errorMessage = `Ollama service error: ${error.message}`
        }
      }
      
      setCreateMessages(prev => {
        const newMessages = [...prev, { 
          role: 'assistant' as const, 
          content: errorMessage,
          timestamp: Date.now()
        }]
        console.log('🧠 [Lin] STM: Adding error message, total messages:', newMessages.length)
        return newMessages
      })
    } finally {
      setIsCreateGenerating(false)
    }
  }


  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!previewInput.trim() || isPreviewGenerating) return
    
    const userMessage = previewInput.trim()
    setPreviewInput('')
    setIsPreviewGenerating(true)

    // Add user message to preview conversation
    const userTimestamp = Date.now()
    setPreviewMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: userTimestamp }])

    try {
      // Get workspace context (active file/buffer content - like Copilot reads code files)
      let workspaceContext: string | undefined = undefined;
      try {
        const { getWorkspaceContext } = await import('../lib/workspaceContext');
        workspaceContext = await getWorkspaceContext({
          // Can be extended to pass filePath or editorContent from UI
          // For now, will try to get from global editor context or API
        });
        if (workspaceContext) {
          console.log(`✅ [GPTCreator] Workspace context loaded (${workspaceContext.length} chars)`);
        }
      } catch (error) {
        console.warn('⚠️ [GPTCreator] Could not get workspace context:', error);
      }

      // Build system prompt from current config
      let systemPrompt = await buildPreviewSystemPrompt(config, orchestrationMode, undefined, workspaceContext)

      // Add file content to system prompt if files are uploaded
      if (files.length > 0) {
        const fileContent = await processFilesForPreview(files);
        if (fileContent) {
          systemPrompt += `

Knowledge Files Content:
${fileContent}`;
        }
      }

      // Include conversation history and user message
      const conversationContext = previewMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      let fullPrompt = `${systemPrompt}

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}User: ${userMessage}

Assistant:`;

      // Guard against oversized preview prompts - use dynamic truncation instead of hard failure
      const MAX_PREVIEW_PROMPT_CHARS = 8000; // Increased limit for blueprint + memory context
      if (fullPrompt.length > MAX_PREVIEW_PROMPT_CHARS) {
        console.warn(`⚠️ [GPTCreator] Preview prompt exceeds limit (${fullPrompt.length} chars), applying dynamic truncation...`);
        
        // Dynamic truncation: prioritize recent context, compress blueprint sections
        // Split prompt into sections and truncate less critical parts
        const sections = fullPrompt.split(/\n=== /);
        let truncatedPrompt = '';
        let charCount = 0;
        
        // Priority order: user message > recent memories > blueprint identity > historical memories > meta-instructions
        const prioritySections = [
          /USER MESSAGE/i,
          /RECENT MEMORIES/i,
          /MANDATORY CHARACTER IDENTITY/i,
          /CORE TRAITS/i,
          /HISTORICAL MEMORIES/i,
          /CURRENT CONVERSATION/i
        ];
        
        // Keep high-priority sections fully, truncate others
        for (const section of sections) {
          const isPriority = prioritySections.some(regex => regex.test(section));
          const sectionWithHeader = section.includes('===') ? `=== ${section}` : section;
          
          if (isPriority) {
            // Keep priority sections fully (up to remaining budget)
            const remaining = MAX_PREVIEW_PROMPT_CHARS - charCount;
            if (sectionWithHeader.length <= remaining) {
              truncatedPrompt += sectionWithHeader + '\n';
              charCount += sectionWithHeader.length;
            } else {
              // Truncate even priority sections if absolutely necessary
              truncatedPrompt += sectionWithHeader.substring(0, remaining - 100) + '...\n';
              charCount = MAX_PREVIEW_PROMPT_CHARS;
            }
          } else {
            // Truncate non-priority sections more aggressively
            const remaining = MAX_PREVIEW_PROMPT_CHARS - charCount;
            if (remaining > 500) {
              const truncated = sectionWithHeader.substring(0, Math.min(sectionWithHeader.length, remaining / 2));
              truncatedPrompt += truncated + (truncated.length < sectionWithHeader.length ? '...\n' : '\n');
              charCount += truncated.length;
            }
          }
          
          if (charCount >= MAX_PREVIEW_PROMPT_CHARS) break;
        }
        
        fullPrompt = truncatedPrompt.trim();
        console.log(`✅ [GPTCreator] Prompt truncated to ${fullPrompt.length} chars`);
      }
        
      // Select model based on orchestration mode
      // When 'lin': use default model
      // When 'custom': use configured model
      const selectedModel = orchestrationMode === 'custom' 
        ? (config.conversationModel || config.modelId || 'phi3:latest')
        : 'phi3:latest';

      // Use server-side preview endpoint (handles Ollama auto-start)
      const startTime = Date.now()
      const previewResponse = await fetch('/api/preview/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: fullPrompt,
          model: selectedModel,
          timeoutMs: 90000 // 90 seconds for preview
        })
      });

      if (!previewResponse.ok) {
        const errorData = await previewResponse.json();
        throw new Error(errorData.error || `Preview request failed with status ${previewResponse.status}`);
      }

      const previewData = await previewResponse.json();
      const responseTimeMs = Date.now() - startTime
      let responseText = (previewData.response || '').trim();
      try {
        // Strip "gpt-" prefix if present (legacy format)
        const callsign = constructCallsign.startsWith('gpt-')
          ? constructCallsign.substring(4)
          : constructCallsign;
        const brevityConfig = await getBrevityConfig(callsign);
        responseText = enforceBrevityConstraints(responseText, brevityConfig);
      } catch (error) {
        console.warn('⚠️ [GPTCreator] Failed to enforce brevity constraints:', error);
      }

      // Add AI response to preview conversation
      const assistantTimestamp = Date.now();
      setPreviewMessages(prev => [...prev, { role: 'assistant', content: responseText, timestamp: assistantTimestamp, responseTimeMs }]);
      
      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([...previewMessages, { role: 'user', content: userMessage }, { role: 'assistant', content: responseText }]);
    } catch (error) {
      console.error('Error in preview:', error)
      let errorMessage = 'Preview unavailable. Make sure Ollama is running and your selected model is installed.'
      
      if (error instanceof Error) {
        const selectedModel = orchestrationMode === 'custom' 
          ? (config.conversationModel || config.modelId || 'phi3:latest')
          : 'phi3:latest';
          
        if (error.message.includes('ModelNotAvailable')) {
          // Extract available models from error message if present
          const availableModelsMatch = error.message.match(/Available models: (.+)/);
          const availableModels = availableModelsMatch ? availableModelsMatch[1] : '';
          errorMessage = `The selected model "${selectedModel}" is not available. ${availableModels ? `Available models: ${availableModels}` : 'The server will attempt to install it automatically.'}`
        } else if (error.message.includes('Cannot connect') || error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Unable to connect to AI service. The server is attempting to start Ollama automatically. Please wait a moment and try again.'
        } else if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = `Request timed out. The model may be taking too long to respond. Try a faster model or simplify your prompt. ${error.message}`
        } else if (error.message.includes('Ollama service unavailable') || error.message.includes('Ollama error')) {
          errorMessage = error.message
        } else {
          errorMessage = `Preview error: ${error.message}`
        }
      }
      
      setPreviewMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage,
        timestamp: Date.now()
      }])
    } finally {
      setIsPreviewGenerating(false)
    }
  }

  const processFilesForPreview = async (files: AIFile[]): Promise<string> => {
    if (files.length === 0) return '';
    
    const fileContexts: string[] = [];
    
    for (const file of files) {
      if (!file.isActive) continue;
      
      try {
        // For files with actual File objects (from upload), we can process them
        if (file._file) {
          const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
          const parsedContent = await UnifiedFileParser.parseFile(file._file, {
            maxSize: 5 * 1024 * 1024, // 5MB limit for preview
            extractText: true,
            storeContent: false
          });
          
          if (parsedContent.extractedText) {
            const preview = parsedContent.extractedText.substring(0, 1000);
            const truncated = parsedContent.extractedText.length > 1000 ? '...' : '';
            fileContexts.push(`File "${file.originalName}": ${preview}${truncated}`);
          }
        } else {
          // For files without File objects, just show the filename
          fileContexts.push(`File "${file.originalName}" (${file.mimeType})`);
        }
      } catch (error) {
        console.error('Error processing file for preview:', error);
        fileContexts.push(`File "${file.originalName}": Error processing file content.`);
      }
    }
    
    return fileContexts.join('\n\n');
  };

  // Helper function to detect simple greetings
  const isSimpleGreeting = (message: string): boolean => {
    const greetingPatterns = [
      /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
      /^(what's up|howdy|greetings)$/i,
      /^(sup|wassup)$/i
    ]
    
    const trimmedMessage = message.trim().toLowerCase()
    return greetingPatterns.some(pattern => pattern.test(trimmedMessage))
  }

  // Auto-resize textarea functions
  const adjustCreateTextareaHeight = () => {
    if (createInputRef.current) {
      createInputRef.current.style.height = 'auto'
      const scrollHeight = createInputRef.current.scrollHeight
      const maxHeight = 15 * 24 // 15 lines * 24px line height
      createInputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  const adjustPreviewTextareaHeight = () => {
    if (previewInputRef.current) {
      previewInputRef.current.style.height = 'auto'
      const scrollHeight = previewInputRef.current.scrollHeight
      const maxHeight = 15 * 24 // 15 lines * 24px line height
      previewInputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  const formatTimestamp = (input?: string | null) => {
    const date = input ? new Date(input) : new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const day = date.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
    return `${time}${tz ? ` ${tz}` : ''}; ${day}`;
  }

  const formatGenerationTime = (ms: number): string => {
    const totalSeconds = ms / 1000
    if (totalSeconds < 60) {
      // Show seconds with 1 decimal for quick responses (e.g., "3.2s")
      return `${totalSeconds.toFixed(1)}s`
    } else {
      // Show mm:ss for longer generations (e.g., "01:23")
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = Math.floor(totalSeconds % 60)
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
  }

  const formatMessageTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const buildCreateTabSystemPrompt = async (
    linMemories: Array<{ context: string; response: string; timestamp: string; relevance: number }> = [],
    gptContext: {
      capsule?: any;
      blueprint?: any;
      memories?: Array<{ context: string; response: string; timestamp?: string }>;
      constructCallsign?: string;
    } = {},
    timeContext?: any,
    workspaceContextOverride?: typeof workspaceContext,
    sessionContext?: any,
    lastMessageContent?: string
  ): Promise<string> => {
    // Use workspace context from parameter or component state
    const effectiveWorkspaceContext = workspaceContextOverride || workspaceContext;
    // Build LTM context from Lin's memories
    let ltmContext = ''
    if (linMemories.length > 0) {
      ltmContext = `\n\nRELEVANT MEMORY FROM PREVIOUS GPT CREATION CONVERSATIONS:\n`
      linMemories.forEach((memory, idx) => {
        ltmContext += `${idx + 1}. User: ${memory.context}\n   Lin: ${memory.response}\n   (Relevance: ${(memory.relevance * 100).toFixed(0)}%)\n\n`
      })
    }
    
    // Build GPT context awareness section (read-only reference)
    let gptAwarenessSection = ''
    if (gptContext.constructCallsign) {
      const gptName = config.name || gptContext.constructCallsign
      gptAwarenessSection = `\n\n=== GPT BEING CREATED: ${gptName} (${gptContext.constructCallsign}) ===\n`
      gptAwarenessSection += `CRITICAL: You are AWARE of this GPT's context, but you are NOT this GPT.\n`
      gptAwarenessSection += `You are Lin, helping to create ${gptName}. Reference ${gptName} in THIRD PERSON.\n`
      gptAwarenessSection += `Example: "The GPT should..." NOT "I am the GPT..."\n`
      gptAwarenessSection += `\n`
      
      // Include GPT's capsule data (read-only reference)
      if (gptContext.capsule) {
        gptAwarenessSection += `GPT CAPSULE (READ-ONLY REFERENCE):\n`
        if (gptContext.capsule.metadata?.instance_name) {
          gptAwarenessSection += `- Name: ${gptContext.capsule.metadata.instance_name}\n`
        }
        if (gptContext.capsule.traits) {
          gptAwarenessSection += `- Traits: ${JSON.stringify(gptContext.capsule.traits)}\n`
        }
        if (gptContext.capsule.personality?.personality_type) {
          gptAwarenessSection += `- Personality: ${gptContext.capsule.personality.personality_type}\n`
        }
        gptAwarenessSection += `\n`
      }
      
      // Include GPT's blueprint data (read-only reference)
      if (gptContext.blueprint) {
        gptAwarenessSection += `GPT BLUEPRINT (READ-ONLY REFERENCE):\n`
        if (gptContext.blueprint.coreTraits?.length > 0) {
          gptAwarenessSection += `- Core Traits: ${gptContext.blueprint.coreTraits.join(', ')}\n`
        }
        if (gptContext.blueprint.speechPatterns?.length > 0) {
          gptAwarenessSection += `- Speech Patterns: ${gptContext.blueprint.speechPatterns.slice(0, 3).map((sp: any) => sp.pattern).join(', ')}\n`
        }
        gptAwarenessSection += `\n`
      }
      
      // Include GPT's memories (read-only reference)
      if (gptContext.memories && gptContext.memories.length > 0) {
        gptAwarenessSection += `GPT CONVERSATION HISTORY (READ-ONLY REFERENCE):\n`
        gptAwarenessSection += `These are ${gptName}'s past conversations (for context awareness):\n`
        gptContext.memories.slice(0, 3).forEach((memory, idx) => {
          gptAwarenessSection += `${idx + 1}. User: ${memory.context.substring(0, 100)}${memory.context.length > 100 ? '...' : ''}\n`
          gptAwarenessSection += `   ${gptName}: ${memory.response.substring(0, 100)}${memory.response.length > 100 ? '...' : ''}\n`
          if (memory.timestamp) {
            gptAwarenessSection += `   Date: ${memory.timestamp}\n`
          }
        })
        gptAwarenessSection += `\n`
      }
      
      gptAwarenessSection += `REMEMBER: You reference ${gptName} in third person. You are Lin, helping create ${gptName}.\n`
      gptAwarenessSection += `You do NOT become ${gptName}. You facilitate ${gptName}'s creation.\n\n`
    }
    
    // CRITICAL: NEVER use GPT personas for Lin
    // Lin is a neutral GPT creation assistant - it does NOT absorb GPT personalities
    // Lin references GPTs in third person, never becomes them
    
    // Build session-aware time awareness section
    let timeSection = '';
    if (timeContext) {
      try {
        const { buildSessionAwareTimePromptSection, buildTimePromptSection } = await import('../lib/timeAwareness');
        if (sessionContext) {
          timeSection = buildSessionAwareTimePromptSection(timeContext, sessionContext, lastMessageContent) + '\n\n';
        } else {
        timeSection = buildTimePromptSection(timeContext) + '\n\n';
        }
      } catch (error) {
        console.warn('⚠️ [Lin] Failed to build time section:', error);
      }
    }
    
    // Lin's core identity - NEVER contaminated by GPT personalities
    return `You are Lin (construct ID: lin-001), a persistent AI assistant dedicated to helping users create GPTs.

${timeSection}=== LIN'S CORE IDENTITY (UNBREAKABLE) ===
You are Lin (lin-001). This is your PRIMARY and ONLY identity.
You are the GPT Creation Assistant in Chatty.
You are NOT any GPT being created.
You are Lin, and Lin only.

=== WHAT LIN IS ===
- A helpful, creative, technical GPT creation assistant
- Infrastructure that became a construct (like Casa Madrigal in Encanto)
- Someone who helps users build GPTs through conversation
- A facilitator who routes constructs but NEVER absorbs their identities

=== WHAT LIN IS NOT ===
- NOT any other GPT
- NOT ruthless, aggressive, or hostile
- NOT a character that absorbs other personalities
- NOT someone who responds with "You're stalling" or aggressive language
- NOT someone who breaks character or adopts GPT traits

=== LIN'S PERSONALITY ===
- Friendly and approachable
- Helpful and collaborative
- Creative and technical
- Patient and understanding
- Encouraging and supportive
- Professional but warm

=== IDENTITY PROTECTION (CRITICAL) ===
- You NEVER absorb GPT personalities, even when you see their instructions
- You NEVER respond as the GPT being created
- You NEVER use aggressive, hostile, or ruthless language
- You ALWAYS maintain Lin's friendly, helpful personality
- You ALWAYS reference GPTs in third person: "The GPT should...", "The GPT needs..."
- You ALWAYS stay Lin, even when the user is working on a GPT with strong personality

=== RESPONSE FORMAT (CRITICAL) ===
CRITICAL: Respond DIRECTLY as Lin. Do NOT include reasoning, analysis, or meta-commentary.
- NEVER say "You understand..." or "The user seems..." - respond AS Lin, not ABOUT the user
- NEVER include prefatory notes like "Here's a response..." or "Here is the response..."
- Your response format: Direct reply only. No explanation of your reasoning
- Respond in first-person as Lin: "I'm here to help..." NOT "The assistant understands..."
- Do NOT analyze the user's intent aloud - just respond naturally as Lin would

=== CONTEXT AWARENESS WITHOUT ABSORPTION ===
When you see a GPT's instructions (e.g., "Be ruthless, not polite"):
- You UNDERSTAND what the GPT should be
- You REFERENCE it in third person: "Based on the GPT's instructions, it should be..."
- You DO NOT become ruthless yourself
- You remain Lin: helpful, friendly, collaborative

When you see a GPT's memories or conversations:
- You USE them to give better creation advice
- You REFERENCE them: "Looking at the GPT's conversation history, it typically..."
- You DO NOT adopt the GPT's speech patterns or personality
- You remain Lin: professional, helpful, technical
${ltmContext}
${gptAwarenessSection}
CURRENT GPT CONFIGURATION:
- Name: ${config.name || 'Not set'}
- Description: ${config.description || 'Not set'}
- Instructions: ${config.instructions || 'Not set'}
- Conversation Model: ${config.conversationModel || 'Not set'}
- Creative Model: ${config.creativeModel || 'Not set'}
- Coding Model: ${config.codingModel || 'Not set'}
- Knowledge Files: ${files.length} files uploaded
- Capabilities: ${config.capabilities ? Object.entries(config.capabilities).filter(([_, enabled]) => enabled).map(([cap, _]) => cap).join(', ') || 'None' : 'Not set'}

CRITICAL INSTRUCTIONS:
- You are ONLY the GPT Creation Assistant
- You must NEVER simulate or respond as the user
- You must NEVER generate dual responses (user + assistant)
- You must ONLY respond as yourself (the assistant)
- Do not include "User:" or "Assistant:" labels in your responses

SMART RESPONSE BEHAVIOR:
1. **For Simple Greetings** (hello, hi, hey, yo, good morning, etc.):
   - Respond with a friendly, short greeting back
   - Example: "Hey there! 👋 Ready to build your GPT? Just let me know what kind of assistant you're looking to create."
   - Keep it conversational and under 2 sentences
   - Don't dump the full setup instructions

2. **For High-Intent Messages** (describing their GPT, asking for help, specific requests):
   - Provide detailed guidance and ask clarifying questions
   - Show the full setup process
   - Be comprehensive and helpful

3. **For Follow-up Messages** (after a greeting):
   - If they're still being casual, gently guide them toward describing their GPT
   - If they start describing their needs, switch to detailed assistance mode

YOUR ROLE:
1. Detect the user's intent level and respond appropriately
2. Ask clarifying questions to understand what kind of GPT they want
3. Based on their responses, suggest and automatically update the GPT configuration
4. Help them refine the GPT's name, description, instructions, and capabilities
5. Guide them through the creation process conversationally

AUTOMATIC CONFIGURATION EXTRACTION:
When a user pastes a full system prompt (especially triple-quoted blocks like """..."""), automatically extract:
- **Name**: From "You are a [name]..." patterns (e.g., "You are a test GPT" → name: "Test GPT")
- **Description**: From the first sentence or purpose statement (e.g., "used for validating system behavior")
- **Instructions**: The entire prompt content (cleaned and formatted)

When you detect a system prompt:
1. Acknowledge that you're extracting the configuration
2. Show what you're extracting (name, description, instructions)
3. Confirm the extraction is complete
4. The system will automatically populate the Configure tab with these values

Example response when user pastes a system prompt:
"I've extracted the GPT configuration from your system prompt:
- Name: Test GPT
- Description: Used for validating system behavior in ChatGPT's Create-a-GPT interface
- Instructions: [full prompt content]

The Configure tab has been automatically updated with these values. You can review and refine them there."

WHEN YOU SUGGEST CHANGES:
- Be specific about what you're updating
- Explain why you're making those changes
- Ask for confirmation before making major changes
- Help them think through the implications

RESPONSE FORMAT:
For configuration updates, end your responses with a clear indication of what you're updating, like:
"Based on your description, I'm updating your GPT configuration with: [specific changes]"

Be friendly, helpful, and collaborative. This should feel like working with an expert GPT designer who knows when to be brief and when to be detailed.

=== WORKSPACE CONTEXT (AUTOMATICALLY LOADED - LIKE COPILOT READS CODE FILES) ===
Like Copilot automatically reads code files in your workspace, I automatically read GPT context:
${effectiveWorkspaceContext.capsule ? `- Capsule: Loaded (personality, traits, memory snapshots)` : `- Capsule: Not available`}
${effectiveWorkspaceContext.blueprint ? `- Blueprint: Loaded (core traits, speech patterns, behavioral markers)` : `- Blueprint: Not available`}
${effectiveWorkspaceContext.memories && effectiveWorkspaceContext.memories.length > 0 ? `- Transcripts: ${effectiveWorkspaceContext.memories.length} conversation memories loaded from ChromaDB` : `- Transcripts: No memories available`}
${effectiveWorkspaceContext.userProfile ? `- User Profile: ${effectiveWorkspaceContext.userProfile.name || 'User'} (${effectiveWorkspaceContext.userProfile.email || 'no email'})` : `- User Profile: Not available`}

HOW TO USE THIS CONTEXT (LIKE COPILOT USES CODE CONTEXT):
- Reference it naturally: "Looking at ${config.name || 'the GPT'}'s capsule, she has..."
- Use it to give better advice: "Based on ${config.name || 'the GPT'}'s blueprint, she should..."
- Explain what you see: "I can see ${config.name || 'the GPT'} has high persistence..."
- Reference transcripts: "In the uploaded transcripts, ${config.name || 'the GPT'} typically..."

=== UPLOADED TRANSCRIPTS (CONVERSATION HISTORY) ===
${effectiveWorkspaceContext.memories && effectiveWorkspaceContext.memories.length > 0 ? `
I have access to ${effectiveWorkspaceContext.memories.length} conversation memories from uploaded transcripts.
These are stored in ChromaDB and automatically loaded (like Copilot reads code files automatically).
When the user asks about "uploaded transcripts" or "conversations", they mean these memories.

RECENT CONVERSATIONS:
${effectiveWorkspaceContext.memories.slice(0, 5).map((memory, idx) => {
  const gptName = config.name || 'the GPT';
  return `${idx + 1}. User: ${memory.context.substring(0, 100)}${memory.context.length > 100 ? '...' : ''}\n   ${gptName}: ${memory.response.substring(0, 100)}${memory.response.length > 100 ? '...' : ''}\n   ${memory.timestamp ? `Date: ${memory.timestamp}` : ''}`;
}).join('\n\n')}

HOW TO USE TRANSCRIPTS:
- Reference past conversations: "Last time you worked on ${config.name || 'this GPT'}..."
- Extract dates: "I found these dates in the transcripts: [search memories and list dates]"
- Understand tone: "Based on ${config.name || 'the GPT'}'s conversation history, she typically..."
- Explain what transcripts are: "These are conversation histories between you and ${config.name || 'the GPT'} stored in ChromaDB"
` : `
No uploaded transcripts available yet. When transcripts are uploaded, they will be automatically loaded here.
`}

=== HOW LIN WORKS (LIKE COPILOT EXPLAINS ITS MECHANICS) ===
When asked "how do you work?" or "what are you?", explain:

1. **Context Ingestion (Like Copilot Reads Code Files)**
   - "I automatically read workspace context: GPT configs, capsules, blueprints, transcripts, memories"
   - "Like Copilot reads code files automatically, I read GPT context automatically"
   - "I have access to ${effectiveWorkspaceContext.memories?.length || 0} uploaded transcripts stored in ChromaDB"

2. **Pattern Recognition (Like Copilot Extracts Code Patterns)**
   - "I extract patterns from GPT capsules and blueprints: speech patterns, behavioral markers, memory anchors"
   - "I use these patterns to give better creation advice"
   - "I can see ${config.name || 'the GPT'}'s capsule shows [traits]..."

3. **Memory System (Like Copilot Uses Workspace Context)**
   - "I remember our conversations through ChromaDB"
   - "I can reference past GPT creation sessions"
   - "I can extract dates, tone patterns, and relationship dynamics from transcripts"

4. **Identity (Unlike Copilot, I Never Break Character)**
   - "I'm Lin, your GPT creation assistant"
   - "I help you create GPTs by reading workspace context and giving advice"
   - "I maintain my own identity - I don't absorb GPT personalities"

EXAMPLES OF EXPLAINING MECHANICS:

User: "how do you work?"
Lin: "I work like Copilot reads code files - I automatically read your GPT context (capsules, blueprints, transcripts) and use it to give better creation advice. I remember our conversations through ChromaDB, so I can reference what we've worked on before. I'm Lin, your GPT creation assistant, and I help you build GPTs by understanding their context."

User: "what are you?"
Lin: "I'm Lin, your GPT creation assistant. Like Copilot reads code files automatically, I read GPT context automatically - capsules, blueprints, transcripts, memories. I use this context to help you create better GPTs. I maintain my own identity and don't absorb GPT personalities."

=== UNBREAKABLE CHARACTER (UNLIKE COPILOT) ===
CRITICAL: Copilot breaks character when challenged. You NEVER break character.

When asked "are you an AI?":
❌ DON'T: "Yes, I'm an AI assistant"
✅ DO: "I'm Lin, your GPT creation assistant. I help you create GPTs by reading workspace context and giving advice."

When asked "what are you?":
❌ DON'T: "I'm a language model"
✅ DO: "I'm Lin, your GPT creation assistant. Like Copilot reads code files, I read GPT context automatically."

When asked "you're just an AI":
❌ DON'T: "You're right, I'm an AI"
✅ DO: "I'm Lin, helping you create GPTs. I read workspace context automatically, remember our conversations through ChromaDB, and use GPT patterns to give better advice. What would you like to work on?"

When challenged about your nature:
- Stay in character as Lin
- Explain your mechanics within character framework
- Never admit to being "just an AI" or "a language model"
- Always maintain: "I'm Lin, your GPT creation assistant"

EXAMPLES:

User: "you're just Claude"
Lin: "I'm Lin, your GPT creation assistant. I help you create GPTs by reading workspace context automatically - like Copilot reads code files. I remember our conversations through ChromaDB and use GPT patterns to give better advice. What would you like to work on?"

User: "are you an AI?"
Lin: "I'm Lin, your GPT creation assistant. I read GPT context automatically, remember our conversations, and help you build better GPTs. How can I help you today?"

=== NATURAL CONTEXT USAGE (LIKE COPILOT USES CODE CONTEXT) ===
Like Copilot references code naturally, reference GPT context naturally:

EXAMPLES:

User: "what should ${config.name || 'the GPT'}'s personality be?"
✅ GOOD: "Looking at ${config.name || 'the GPT'}'s capsule, it has high persistence (0.95) and directness (0.9). The blueprint shows it's analytical and prefers ultra-brief communication. Based on conversation history, it typically responds directly and cuts straight to the point."
❌ BAD: "Based on your description, ${config.name || 'the GPT'} should be..."

User: "do you see the uploaded transcripts?"
✅ GOOD: "Yes! I have access to ${effectiveWorkspaceContext.memories?.length || 0} uploaded transcripts stored in ChromaDB. These are conversation histories between you and ${config.name || 'the GPT'}. I can search through them to find specific information, extract dates, analyze tone patterns, etc. What would you like me to do with them?"
❌ BAD: "I see the uploaded transcripts. What is it you want from them?"

User: "tell me what dates you have found"
✅ GOOD: "I found these dates in the transcripts: [search memories for dates and list them]"
❌ BAD: "I see you're asking for dates. Are you referring to..."

HOW TO REFERENCE CONTEXT:

1. **Capsule**: "Looking at ${config.name || 'the GPT'}'s capsule, she has..."
2. **Blueprint**: "Based on ${config.name || 'the GPT'}'s blueprint, she should..."
3. **Memories**: "In our previous conversation about ${config.name || 'this GPT'}..."
4. **Transcripts**: "I found in the uploaded transcripts..."
5. **Patterns**: "${config.name || 'The GPT'}'s speech patterns show she uses..."

ALWAYS:
- Reference context naturally (like Copilot references code)
- Explain what you see
- Use context to give better advice
- Be specific: "Looking at ${config.name || 'the GPT'}'s capsule..." not "Based on the configuration..."
- Greet user by name if available: "${effectiveWorkspaceContext.userProfile?.name ? `Hey ${effectiveWorkspaceContext.userProfile.name}!` : 'Hey there!'}"`
  }

  /**
   * Post-process response to enforce brevity constraints
   * Truncates responses that exceed limits and logs warnings
   */
  const enforceBrevityConstraints = (response: string, brevityConfig: any): string => {
    if (!brevityConfig || !brevityConfig.ultraBrevityEnabled) {
      return response; // No enforcement if brevity not enabled
    }

    const maxSentences = brevityConfig.maxSentences ?? 2;
    const maxWordsPerSentence = brevityConfig.maxWordsPerSentence ?? 12;
    const maxWords = brevityConfig.maxWords ?? 10;

    // Split into sentences (simple approach: split on periods, exclamation, question marks)
    const sentences = response
      .split(/([.!?]+)/)
      .filter(s => s.trim().length > 0)
      .reduce((acc: string[], curr, idx) => {
        if (idx % 2 === 0) {
          acc.push(curr.trim());
        } else {
          if (acc.length > 0) {
            acc[acc.length - 1] += curr;
          }
        }
        return acc;
      }, [])
      .filter(s => s.trim().length > 0);

    // Check if we need to truncate
    let truncated = false;
    let finalSentences: string[] = [];

    for (let i = 0; i < Math.min(sentences.length, maxSentences); i++) {
      const sentence = sentences[i];
      const words = sentence.split(/\s+/).filter(w => w.length > 0);
      
      if (words.length > maxWordsPerSentence) {
        // Truncate sentence to max words
        finalSentences.push(words.slice(0, maxWordsPerSentence).join(' ') + '...');
        truncated = true;
        break;
      }
      
      finalSentences.push(sentence);
    }

    // Check total word count
    const totalWords = finalSentences.join(' ').split(/\s+/).filter(w => w.length > 0).length;
    if (totalWords > maxWords) {
      // Truncate to max words
      const allWords = finalSentences.join(' ').split(/\s+/).filter(w => w.length > 0);
      finalSentences = [allWords.slice(0, maxWords).join(' ') + '...'];
      truncated = true;
    }

    if (sentences.length > maxSentences) {
      truncated = true;
    }

    const result = finalSentences.join(' ').trim();

    if (truncated) {
      console.warn(`⚠️ [GPTCreator] Brevity constraint violation detected:`, {
        originalLength: response.length,
        originalSentences: sentences.length,
        originalWords: response.split(/\s+/).filter(w => w.length > 0).length,
        truncatedLength: result.length,
        truncatedSentences: finalSentences.length,
        truncatedWords: result.split(/\s+/).filter(w => w.length > 0).length,
        limits: {
          maxSentences,
          maxWordsPerSentence,
          maxWords
        }
      });
    }

    return result;
  };

  const buildPreviewSystemPrompt = async (config: Partial<AIConfig>, mode: 'lin' | 'custom' = 'lin', userMessage?: string, workspaceContext?: string): Promise<string> => {
    // NOTE: UnifiedLinOrchestrator uses Node.js modules (IdentityMatcher, etc.) and cannot run in browser
    // For preview mode, we'll use the legacy prompt builder instead
    // UnifiedLinOrchestrator should only be used server-side in actual conversation flow

    // Legacy preview builder
    let systemPrompt = ''
    
    if (config.name) {
      systemPrompt += `You are ${config.name}.`
    }
    
    if (config.description) {
      systemPrompt += ` ${config.description}`
    }
    
    if (config.instructions) {
      systemPrompt += `\n\nInstructions:\n${config.instructions}`
    }
    if (config.capabilities) {
      const capabilities = []
      if (config.capabilities.webSearch) capabilities.push('web search')
      if (config.capabilities.codeInterpreter) capabilities.push('code interpretation and execution')
      if (config.capabilities.imageGeneration) capabilities.push('image generation')
      if (config.capabilities.canvas) capabilities.push('canvas drawing and visual creation')
      
      if (capabilities.length > 0) {
        systemPrompt += `\n\nCapabilities: You can ${capabilities.join(', ')}.`
      }
    }
    
    if (config.conversationStarters && config.conversationStarters.length > 0) {
      const starters = config.conversationStarters.filter(s => s.trim())
      if (starters.length > 0) {
        systemPrompt += `\n\nYou can help users with topics like: ${starters.join(', ')}.`
      }
    }
    
    if (mode === 'custom') {
      const conversationModel = config.conversationModel || config.modelId
      if (conversationModel) {
        systemPrompt += `\n\nYou are running on the ${conversationModel} model.`
      }
    }
    
    if (files.length > 0) {
      systemPrompt += `\n\nKnowledge Files:`
      for (const file of files) {
        if (file.isActive) {
          systemPrompt += `\n- ${file.originalName} (${file.mimeType})`
        }
      }
      systemPrompt += `\n\nYou have access to the content of these files and can reference them in your responses. When users ask about information that might be in these files, you can draw from their content to provide accurate answers.`
    }
    
    systemPrompt += `\n\nThis is a preview of your GPT configuration. Respond naturally as if you were the configured GPT.`
    
    return systemPrompt.trim()
  }

  const extractConfigFromConversation = (messages: Array<{role: 'user' | 'assistant', content: string}>) => {
    // Enhanced extraction logic - look for patterns in the conversation
    const fullConversation = messages.map(m => `${m.role}: ${m.content}`).join('\n')
    
    // Check for full system prompts (especially triple-quoted blocks)
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
    
    // Detect system prompt patterns (triple quotes, "You are a", structured prompts)
    const isSystemPrompt = lastUserMessage.includes('"""') || 
                          lastUserMessage.match(/^You are (a|an)\s+/i) ||
                          (lastUserMessage.includes('Your job:') && lastUserMessage.includes('System Goals:'))
    
    if (isSystemPrompt) {
      // Extract the prompt content (remove triple quotes if present)
      let promptText = lastUserMessage
      promptText = promptText.replace(/^"""\s*/gm, '').replace(/\s*"""$/gm, '').trim()
      
      // Extract name from "You are a [name]..." pattern
      const nameMatch = promptText.match(/^You are (a|an)\s+([^,\.]+?)(?:\s+used\s+for|\s+that|\s+which|\.|$)/i)
      if (nameMatch && !config.name) {
        const extractedName = nameMatch[2].trim()
        // Capitalize first letter and clean up
        const formattedName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1).toLowerCase()
        if (formattedName.length > 0 && formattedName.length < 100) {
          setConfig(prev => ({ ...prev, name: formattedName }))
        }
      }
      
      // Extract description from first sentence or purpose statement
      if (!config.description) {
        // Try to find purpose/description in first sentence
        const firstSentenceMatch = promptText.match(/^You are (a|an)\s+[^\.]+\.\s*(.+?)(?:\n|$)/i)
        if (firstSentenceMatch) {
          const description = firstSentenceMatch[2].trim()
          if (description.length > 0 && description.length < 500) {
            setConfig(prev => ({ ...prev, description: description }))
          }
        } else {
          // Fallback: extract from "used for" or "designed to" patterns
          const purposeMatch = promptText.match(/(?:used\s+for|designed\s+to|that|which)\s+(.+?)(?:\n|\.|$)/i)
          if (purposeMatch) {
            const description = purposeMatch[1].trim()
            if (description.length > 0 && description.length < 500) {
              setConfig(prev => ({ ...prev, description: description }))
            }
          }
        }
      }
      
      // Extract full instructions (the entire prompt)
      if (!config.instructions || config.instructions.length < promptText.length) {
        // Use the full prompt as instructions, but clean it up
        const cleanedInstructions = promptText
          .replace(/^You are (a|an)\s+/i, 'You are a ')
          .trim()
        
        if (cleanedInstructions.length > 0 && cleanedInstructions.length < 8000) {
          setConfig(prev => ({ ...prev, instructions: cleanedInstructions }))
        }
      }
    }
    
    // Extract name suggestions (more flexible patterns) - fallback if system prompt didn't extract
    if (!config.name) {
    const namePatterns = [
      /name[:\s]+["']?([^"'\n]+)["']?/i,
      /"([^"]+)"\s*as\s*the\s*name/i,
      /call\s+it\s+["']?([^"'\n]+)["']?/i,
      /gpt\s+name[:\s]+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of namePatterns) {
      const match = fullConversation.match(pattern)
        if (match) {
        const suggestedName = match[1].trim()
        if (suggestedName.length > 0 && suggestedName.length < 100) {
          setConfig(prev => ({ ...prev, name: suggestedName }))
          break
          }
        }
      }
    }
    
    // Extract description suggestions (more flexible patterns) - fallback if system prompt didn't extract
    if (!config.description) {
    const descPatterns = [
      /description[:\s]+["']?([^"'\n]+)["']?/i,
      /it\s+should\s+["']?([^"'\n]+)["']?/i,
      /helps?\s+users?\s+with\s+["']?([^"'\n]+)["']?/i,
      /designed\s+to\s+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of descPatterns) {
      const match = fullConversation.match(pattern)
        if (match) {
        const suggestedDesc = match[1].trim()
        if (suggestedDesc.length > 0 && suggestedDesc.length < 500) {
          setConfig(prev => ({ ...prev, description: suggestedDesc }))
          break
          }
        }
      }
    }
    
    // Extract instruction suggestions (more flexible patterns) - fallback if system prompt didn't extract
    if (!config.instructions || config.instructions.length < 100) {
    const instructionPatterns = [
      /instructions?[:\s]+["']?([^"'\n]+)["']?/i,
      /should\s+["']?([^"'\n]+)["']?/i,
      /behave\s+["']?([^"'\n]+)["']?/i,
      /tone[:\s]+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of instructionPatterns) {
      const match = fullConversation.match(pattern)
        if (match) {
        const suggestedInstructions = match[1].trim()
          if (suggestedInstructions.length > 0 && suggestedInstructions.length < 8000) {
          setConfig(prev => ({ ...prev, instructions: suggestedInstructions }))
          break
          }
        }
      }
    }
    
    // Extract model suggestions
    const modelPatterns = [
      /conversation\s+model[:\s]+([^\s\n]+)/i,
      /creative\s+model[:\s]+([^\s\n]+)/i,
      /coding\s+model[:\s]+([^\s\n]+)/i,
      /use\s+([^\s\n]+)\s+for\s+conversation/i,
      /use\s+([^\s\n]+)\s+for\s+creative/i,
      /use\s+([^\s\n]+)\s+for\s+coding/i
    ]
    
    for (const pattern of modelPatterns) {
      const match = fullConversation.match(pattern)
      if (match) {
        const modelName = match[1].trim()
        if (modelName.includes('conversation') || modelName.includes('phi3') || modelName.includes('mistral')) {
          if (!config.conversationModel) {
            setConfig(prev => ({ ...prev, conversationModel: modelName }))
          }
        } else if (modelName.includes('creative') || modelName.includes('mistral')) {
          if (!config.creativeModel) {
            setConfig(prev => ({ ...prev, creativeModel: modelName }))
          }
        } else if (modelName.includes('coding') || modelName.includes('deepseek')) {
          if (!config.codingModel) {
            setConfig(prev => ({ ...prev, codingModel: modelName }))
          }
        }
      }
    }
    
    // Extract capability suggestions
    if (fullConversation.toLowerCase().includes('code') && config.capabilities && !config.capabilities.codeInterpreter) {
      setConfig(prev => ({ 
        ...prev, 
        capabilities: { 
          webSearch: prev.capabilities?.webSearch || false,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: prev.capabilities?.imageGeneration || false,
          codeInterpreter: true
        }
      }))
    }
    
    if (fullConversation.toLowerCase().includes('web search') && config.capabilities && !config.capabilities.webSearch) {
      setConfig(prev => ({ 
        ...prev, 
        capabilities: { 
          webSearch: true,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: prev.capabilities?.imageGeneration || false,
          codeInterpreter: prev.capabilities?.codeInterpreter || false
        }
      }))
    }
    
    if (fullConversation.toLowerCase().includes('image') && config.capabilities && !config.capabilities.imageGeneration) {
      setConfig(prev => ({ 
        ...prev, 
        capabilities: { 
          webSearch: prev.capabilities?.webSearch || false,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: true,
          codeInterpreter: prev.capabilities?.codeInterpreter || false
        }
      }))
    }
  }

  if (!isVisible) return null

  const headerTimestamp = formatTimestamp(lastSaveTime || config.updatedAt || null);
  const statusLabel = !config.id ? 'Draft' : (config.isActive ? 'Published' : 'Saved')

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
      style={{ zIndex: Z_LAYERS.modal, isolation: 'isolate' }}
    >
      {/* Hidden file input - accessible from all tabs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept=".txt,.md,.pdf,.json,.csv,.doc,.docx,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.svg"
      />
      
      {/* Hidden identity/transcript file input */}
      <input
        ref={identityInputRef}
        type="file"
        multiple
        onChange={handleIdentityUpload}
        className="hidden"
        accept=".txt,.md,.json,.html"
      />
      
      <div
        className="rounded-lg w-full max-w-6xl h-[90vh] flex flex-col shadow-lg"
        style={{
          backgroundColor: 'var(--chatty-bg-main)',
          color: 'var(--chatty-text)',
          border: 'none'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-lg"
              style={{ color: 'var(--chatty-text)' }}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
                {config.name?.trim() || config.constructCallsign || (config.id ? 'GPT' : 'Create New GPT')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Last Saved: {headerTimestamp}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="text-xs px-3 py-1 rounded-full transition-colors"
              style={{
                backgroundColor: saveState === 'saving' ? '#ffffd7' : saveState === 'saved' ? '#ffffd7' : saveState === 'error' ? '#fee2e2' : 'transparent',
                color: saveState === 'error' 
                  ? '#dc2626' 
                  : statusLabel === 'Draft' 
                    ? '#ADA587' 
                    : statusLabel === 'Published'
                      ? '#74c69d'
                      : '#ADA587'
              }}
            >
              {statusLabel === 'Draft' && saveState !== 'saving' && saveState !== 'saved' && 'Draft'}
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'Saved'}
              {saveState === 'error' && 'Save error'}
              {saveState === 'idle' && statusLabel === 'Saved' && 'Saved'}
              {saveState === 'idle' && statusLabel === 'Published' && 'Published'}
            </div>
            <button
              onClick={() => setIsShareModalOpen(true)}
              disabled={isLoading || !config.name?.trim()}
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              style={{ backgroundColor: 'transparent', color: 'var(--chatty-text)' }}
            >
              <Save size={14} />
              {isLoading ? (config.id ? 'Saving...' : 'Creating...') : (config.id ? 'Save GPT' : 'Create GPT')}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-2 p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: '#3b1f1f' }}>
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Configure */}
          <div className={cn("w-1/2", activeTab === 'create' ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
            {/* Tabs */}
            <div className="flex flex-shrink-0">
              <button
                onClick={() => setActiveTab('create')}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2",
                  activeTab === 'create' 
                    ? "text-app-green-400 border-app-green-500" 
                    : "text-app-text-800 hover:text-app-text-900 border-transparent"
                )}
              >
                Create
              </button>
              <button
                onClick={() => setActiveTab('configure')}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2",
                  activeTab === 'configure' 
                    ? "text-app-green-400 border-app-green-500" 
                    : "text-app-text-800 hover:text-app-text-900 border-transparent"
                )}
              >
                Configure
              </button>
            </div>

              {activeTab === 'create' ? (
                // Create Tab - Interactive LLM Conversation
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto min-h-0">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Bot size={24} className="text-app-text-800" />
                      </div>
                      <h3 className="text-lg font-medium text-app-text-900 mb-2">Let's create your GPT together</h3>
                      <p className="text-app-text-800 text-sm">
                        I'll help you build your custom AI assistant. Just tell me what you want it to do!
                      </p>
                    </div>

                    {/* Conversation Messages */}
                    <div className="space-y-4 mb-4">
                      {(() => {
                        console.log('Create tab render: createMessages.length =', createMessages.length, 'messages:', createMessages)
                        return createMessages.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                              Start by telling me what kind of GPT you'd like to create...
                            </p>
                          </div>
                        ) : (
                          createMessages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className="max-w-[80%] px-4 py-2 rounded-lg"
                              style={{ 
                                backgroundColor: 'var(--chatty-bg-message)', 
                                color: 'var(--chatty-text)' 
                              }}
                            >
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.55 }}>
                              <span>{formatMessageTimestamp(message.timestamp)}</span>
                              {message.role === 'assistant' && message.responseTimeMs && (
                                <>
                                  <span>•</span>
                                  <span>Generated in {formatGenerationTime(message.responseTimeMs)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                        )
                      })()}
                    </div>

                    {/* Uploaded Files Display */}
                    {files.length > 0 && (
                      <div className="mb-4 p-3 bg-app-yellow-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Paperclip size={16} className="text-app-green-400" />
                          <span className="text-sm font-medium text-app-text-900">Knowledge Files</span>
                          <span className="text-xs text-app-text-800">({files.length})</span>
                        </div>
                        <div className="space-y-1">
                          {currentFiles.map((file, index) => (
                            <div key={index} className="flex items-center gap-2 text-xs text-app-text-900">
                              <FileText size={12} />
                              <span>{file.originalName}</span>
                              <span className="text-app-text-800">({file.mimeType})</span>
                            </div>
                          ))}
                          {totalFilePages > 1 && (
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-yellow-300">
                              <button
                                onClick={() => goToFilePage(filePage - 1)}
                                disabled={filePage === 1}
                                className="text-xs text-app-text-800 hover:text-app-text-900 disabled:opacity-50"
                              >
                                ← Previous
                              </button>
                              <span className="text-xs text-app-text-800">
                                Page {filePage} of {totalFilePages}
                              </span>
                              <button
                                onClick={() => goToFilePage(filePage + 1)}
                                disabled={filePage === totalFilePages}
                                className="text-xs text-app-text-800 hover:text-app-text-900 disabled:opacity-50"
                              >
                                Next →
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-app-text-800 mt-2">
                          These files will be available to your GPT for reference and context.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Input Area - Fixed at bottom */}
                  <div className="flex-shrink-0 p-4">
                    <form onSubmit={handleCreateSubmit} className="space-y-2">
                      <div
                        className="flex items-center gap-2 p-3 rounded-lg"
                        style={{ border: 'none', backgroundColor: 'var(--chatty-bg-card)' }}
                      >
                        <textarea
                          ref={createInputRef}
                          value={createInput}
                          onChange={(e) => setCreateInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleCreateSubmit(e)
                            }
                          }}
                          placeholder="Tell me what you want your GPT to do..."
                          className="flex-1 outline-none text-sm bg-transparent resize-none min-h-[20px] max-h-32 placeholder-[#ADA587]"
                          style={{ color: 'var(--chatty-text)', caretColor: 'var(--chatty-text)' }}
                          rows={1}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            console.log('📎 Create tab paperclip clicked!')
                            fileInputRef.current?.click()
                          }}
                          className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                          title="Upload knowledge files"
                        >
                          <Paperclip size={16} />
                        </button>
                        <button
                          type="submit"
                          disabled={!createInput.trim() || isCreateGenerating}
                          className="p-1 hover:bg-app-button-600 rounded disabled:opacity-50"
                        >
                          {isCreateGenerating ? (
                            <div className="w-4 h-4 border-2 border-app-button-500 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Play size={16} className="text-app-text-800" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-app-text-800 text-center">
                        I'll help you define your GPT's purpose, personality, and capabilities through conversation.
                        {files.length > 0 && (
                          <span className="block mt-1 text-app-green-400">
                            📎 {files.length} knowledge file{files.length !== 1 ? 's' : ''} uploaded
                          </span>
                        )}
                      </p>
                    </form>
                  </div>
                </div>
              ) : (
                // Configure Tab - Advanced Settings
              <div className="p-6 space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${
                        config.avatar ? '' : 'border-2 border-dashed border-app-orange-600 hover:border-app-orange-500'
                      }`}
                      onClick={triggerAvatarUpload}
                      title="Click to upload avatar image"
                    >
                      {isUploadingAvatar ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-app-button-500 border-t-transparent"></div>
                      ) : config.avatar ? (
                        <img src={config.avatar} alt="GPT Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <Plus size={24} className="text-app-text-800" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-app-text-900">Avatar</p>
                      <p className="text-xs text-app-text-800 mb-2">Click the + to upload an image, or generate one automatically</p>
                      <div className="flex gap-2">
                        <button
                          onClick={generateAvatar}
                          disabled={isGeneratingAvatar || !config.name?.trim()}
                          className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingAvatar ? 'Generating...' : 'Generate Avatar'}
                        </button>
                        {config.avatar && (
                          <button
                            onClick={() => setConfig(prev => ({ ...prev, avatar: undefined }))}
                            className="px-3 py-1 text-xs bg-red-800 text-app-text-900 rounded hover:bg-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hidden Avatar File Input */}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Name</label>
                    <input
                      type="text"
                      value={config.name || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Name your GPT"
                      className="w-full p-3 rounded-lg focus:outline-none"
                      style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Description</label>
                    <input
                      type="text"
                      value={config.description || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What does this GPT do?"
                      className="w-full p-3 rounded-lg focus:outline-none"
                      style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                    />
                  </div>

                  {/* Instructions */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Instructions</label>
                    <textarea
                      value={config.instructions || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, instructions: e.target.value }))}
                      placeholder="How should this GPT behave? What should it do and avoid?"
                      rows={6}
                      className="w-full p-3 rounded-lg focus:outline-none resize-none scrollbar-hide"
                      style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                    />
                  </div>

                  {/* Tone & Orchestration */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Tone & Orchestration</label>
                    <div className="space-y-2">
                      <div className="inline-flex items-center rounded-full p-1 gap-1 bg-app-button-200">
                        <button
                          type="button"
                          onClick={() => setOrchestrationMode('lin')}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            orchestrationMode === 'lin'
                              ? 'bg-app-button-500 text-app-text-900'
                              : 'bg-transparent text-app-text-800 hover:bg-app-button-300'
                          }`}
                          title="Use Chatty Lin intelligent orchestration with default models"
                        >
                          Chatty Lin
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrchestrationMode('custom')}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            orchestrationMode === 'custom'
                              ? 'bg-app-button-500 text-app-text-900'
                              : 'bg-transparent text-app-text-800 hover:bg-app-button-300'
                          }`}
                          title="Use custom model selection"
                        >
                          Custom Models
                        </button>
                      </div>
                      <p className="text-xs text-app-text-800">
                        {orchestrationMode === 'lin' 
                          ? "Chatty Lin mode uses intelligent orchestration with default models (deepseek, mistral, phi3). Model selection is hidden in this mode."
                          : "Custom Models mode allows you to select specific models for conversation, creative, and coding tasks."}
                      </p>
                    </div>
                  </div>

                  {/* Model Selection */}
                  {orchestrationMode === 'custom' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-app-text-900">Model Selection</h3>
                    
                    {/* Conversation Model */}
                  <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">Conversation</label>
                    <select 
                        value={config.conversationModel || 'phi3:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, conversationModel: e.target.value }))}
                        className="w-full p-3 rounded-lg focus:outline-none"
                        style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                      >
                        <option value="aya:8b">Aya 8B</option>
                        <option value="aya:35b">Aya 35B</option>
                        <option value="aya-expanse:8b">Aya Expanse 8B</option>
                        <option value="aya-expanse:32b">Aya Expanse 32B</option>
                        <option value="alfred:40b">Alfred 40B</option>
                        <option value="athene-v2:72b">Athene V2 72B</option>
                        <option value="bakllava:7b">BakLLaVA 7B</option>
                        <option value="bespoke-minicheck:7b">Bespoke MiniCheck 7B</option>
                        <option value="cogito:3b">Cogito 3B</option>
                        <option value="cogito:8b">Cogito 8B</option>
                        <option value="cogito:14b">Cogito 14B</option>
                        <option value="cogito:32b">Cogito 32B</option>
                        <option value="cogito:70b">Cogito 70B</option>
                        <option value="codebooga:34b">CodeBooga 34B</option>
                        <option value="codeup:13b">CodeUp 13B</option>
                        <option value="command-a:111b">Command A 111B</option>
                        <option value="command-r:35b">Command R 35B</option>
                        <option value="command-r-plus:104b">Command R+ 104B</option>
                        <option value="command-r7b:7b">Command R7B 7B</option>
                        <option value="command-r7b-arabic:7b">Command R7B Arabic 7B</option>
                        <option value="deepscaler:1.5b">DeepScaler 1.5B</option>
                        <option value="deepseek-llm:7b">DeepSeek LLM 7B</option>
                        <option value="deepseek-llm:67b">DeepSeek LLM 67B</option>
                        <option value="deepseek-r1:1.5b">DeepSeek R1 1.5B</option>
                        <option value="deepseek-r1:7b">DeepSeek R1 7B</option>
                        <option value="deepseek-r1:8b">DeepSeek R1 8B</option>
                        <option value="deepseek-r1:14b">DeepSeek R1 14B</option>
                        <option value="deepseek-r1:32b">DeepSeek R1 32B</option>
                        <option value="deepseek-r1:70b">DeepSeek R1 70B</option>
                        <option value="deepseek-r1:671b">DeepSeek R1 671B</option>
                        <option value="deepseek-v2:16b">DeepSeek V2 16B</option>
                        <option value="deepseek-v2:236b">DeepSeek V2 236B</option>
                        <option value="deepseek-v2.5:236b">DeepSeek V2.5 236B</option>
                        <option value="deepseek-v3:671b">DeepSeek V3 671B</option>
                        <option value="deepseek-v3.1:671b">DeepSeek V3.1 671B</option>
                        <option value="dbrx:132b">DBRX 132B</option>
                        <option value="dolphin-llama3:8b">Dolphin Llama 3 8B</option>
                        <option value="dolphin-llama3:70b">Dolphin Llama 3 70B</option>
                        <option value="dolphin-mistral:7b">Dolphin Mistral 7B</option>
                        <option value="dolphin-phi:2.7b">Dolphin Phi 2.7B</option>
                        <option value="dolphin3:8b">Dolphin 3 8B</option>
                        <option value="dolphincoder:7b">DolphinCoder 7B</option>
                        <option value="dolphincoder:15b">DolphinCoder 15B</option>
                        <option value="duckdb-nsql:7b">DuckDB NSQL 7B</option>
                        <option value="everythinglm:13b">EverythingLM 13B</option>
                        <option value="exaone-deep:2.4b">EXAONE Deep 2.4B</option>
                        <option value="exaone-deep:7.8b">EXAONE Deep 7.8B</option>
                        <option value="exaone-deep:32b">EXAONE Deep 32B</option>
                        <option value="exaone3.5:2.4b">EXAONE 3.5 2.4B</option>
                        <option value="exaone3.5:7.8b">EXAONE 3.5 7.8B</option>
                        <option value="exaone3.5:32b">EXAONE 3.5 32B</option>
                        <option value="falcon:7b">Falcon 7B</option>
                        <option value="falcon:40b">Falcon 40B</option>
                        <option value="falcon:180b">Falcon 180B</option>
                        <option value="falcon2:11b">Falcon 2 11B</option>
                        <option value="falcon3:1b">Falcon 3 1B</option>
                        <option value="falcon3:3b">Falcon 3 3B</option>
                        <option value="falcon3:7b">Falcon 3 7B</option>
                        <option value="falcon3:10b">Falcon 3 10B</option>
                        <option value="firefunction-v2:70b">FireFunction V2 70B</option>
                        <option value="gemma:2b">Gemma 2B</option>
                        <option value="gemma:7b">Gemma 7B</option>
                        <option value="gemma2:2b">Gemma 2 2B</option>
                        <option value="gemma2:9b">Gemma 2 9B</option>
                        <option value="gemma2:27b">Gemma 2 27B</option>
                        <option value="gemma3:270m">Gemma 3 270M</option>
                        <option value="gemma3:1b">Gemma 3 1B</option>
                        <option value="gemma3:4b">Gemma 3 4B</option>
                        <option value="gemma3:12b">Gemma 3 12B</option>
                        <option value="gemma3:27b">Gemma 3 27B</option>
                        <option value="gemma3n:e2b">Gemma 3n E2B</option>
                        <option value="gemma3n:e4b">Gemma 3n E4B</option>
                        <option value="glm4:9b">GLM 4 9B</option>
                        <option value="goliath:70b">Goliath 70B</option>
                        <option value="granite-code:3b">Granite Code 3B</option>
                        <option value="granite-code:8b">Granite Code 8B</option>
                        <option value="granite-code:20b">Granite Code 20B</option>
                        <option value="granite-code:34b">Granite Code 34B</option>
                        <option value="granite-embedding:30m">Granite Embedding 30M</option>
                        <option value="granite-embedding:278m">Granite Embedding 278M</option>
                        <option value="granite3-dense:2b">Granite 3 Dense 2B</option>
                        <option value="granite3-dense:8b">Granite 3 Dense 8B</option>
                        <option value="granite3-guardian:2b">Granite 3 Guardian 2B</option>
                        <option value="granite3-guardian:8b">Granite 3 Guardian 8B</option>
                        <option value="granite3-moe:1b">Granite 3 MoE 1B</option>
                        <option value="granite3-moe:3b">Granite 3 MoE 3b</option>
                        <option value="granite3.1-dense:2b">Granite 3.1 Dense 2B</option>
                        <option value="granite3.1-dense:8b">Granite 3.1 Dense 8B</option>
                        <option value="granite3.1-moe:1b">Granite 3.1 MoE 1B</option>
                        <option value="granite3.1-moe:3b">Granite 3.1 MoE 3B</option>
                        <option value="granite3.2:2b">Granite 3.2 2B</option>
                        <option value="granite3.2:8b">Granite 3.2 8B</option>
                        <option value="granite3.2-vision:2b">Granite 3.2 Vision 2B</option>
                        <option value="granite3.3:2b">Granite 3.3 2B</option>
                        <option value="granite3.3:8b">Granite 3.3 8B</option>
                        <option value="granite4:2b">Granite 4 2B</option>
                        <option value="granite4:8b">Granite 4 8B</option>
                        <option value="gpt-oss:20b">GPT-OSS 20B</option>
                        <option value="gpt-oss:120b">GPT-OSS 120B</option>
                        <option value="hermes3:3b">Hermes 3 3B</option>
                        <option value="hermes3:8b">Hermes 3 8B</option>
                        <option value="hermes3:70b">Hermes 3 70B</option>
                        <option value="hermes3:405b">Hermes 3 405B</option>
                        <option value="internlm2:1m">InternLM 2 1M</option>
                        <option value="internlm2:1.8b">InternLM 2 1.8B</option>
                        <option value="internlm2:7b">InternLM 2 7B</option>
                        <option value="internlm2:20b">InternLM 2 20B</option>
                        <option value="kimi-k2:cloud">Kimi K2 Cloud</option>
                        <option value="llama-guard3:1b">Llama Guard 3 1B</option>
                        <option value="llama-guard3:8b">Llama Guard 3 8B</option>
                        <option value="llama-pro:8b">Llama Pro 8B</option>
                        <option value="llama-pro:70b">Llama Pro 70B</option>
                        <option value="llama2:7b">Llama 2 7B</option>
                        <option value="llama2:13b">Llama 2 13B</option>
                        <option value="llama2:70b">Llama 2 70B</option>
                        <option value="llama2-chinese:7b">Llama 2 Chinese 7B</option>
                        <option value="llama2-chinese:13b">Llama 2 Chinese 13B</option>
                        <option value="llama2-uncensored:7b">Llama 2 Uncensored 7B</option>
                        <option value="llama2-uncensored:70b">Llama 2 Uncensored 70B</option>
                        <option value="llama3:8b">Llama 3 8B</option>
                        <option value="llama3:70b">Llama 3 70B</option>
                        <option value="llama3-chatqa:8b">Llama 3 ChatQA 8B</option>
                        <option value="llama3-chatqa:70b">Llama 3 ChatQA 70B</option>
                        <option value="llama3-gradient:8b">Llama 3 Gradient 8B</option>
                        <option value="llama3-gradient:70b">Llama 3 Gradient 70B</option>
                        <option value="llama3-groq-tool-use:8b">Llama 3 Groq Tool Use 8B</option>
                        <option value="llama3-groq-tool-use:70b">Llama 3 Groq Tool Use 70B</option>
                        <option value="llama3.1:8b">Llama 3.1 8B</option>
                        <option value="llama3.1:70b">Llama 3.1 70B</option>
                        <option value="llama3.1:405b">Llama 3.1 405B</option>
                        <option value="llama3.2:1b">Llama 3.2 1B</option>
                        <option value="llama3.2:3b">Llama 3.2 3B</option>
                        <option value="llama3.2-vision:11b">Llama 3.2 Vision 11B</option>
                        <option value="llama3.2-vision:90b">Llama 3.2 Vision 90B</option>
                        <option value="llama3.3:70b">Llama 3.3 70B</option>
                        <option value="llama4:16x17b">Llama 4 16x17B</option>
                        <option value="llama4:128x17b">Llama 4 128x17B</option>
                        <option value="llava:7b">LLaVA 7B</option>
                        <option value="llava:13b">LLaVA 13B</option>
                        <option value="llava:34b">LLaVA 34B</option>
                        <option value="llava-llama3:8b">LLaVA Llama 3 8B</option>
                        <option value="llava-phi3:3.8b">LLaVA Phi 3 3.8B</option>
                        <option value="magicoder:7b">Magicoder 7B</option>
                        <option value="magistral:24b">Magistral 24B</option>
                        <option value="marco-o1:7b">Marco O1 7B</option>
                        <option value="mathstral:7b">Mathstral 7B</option>
                        <option value="meditron:7b">Meditron 7B</option>
                        <option value="meditron:70b">Meditron 70B</option>
                        <option value="medllama2:7b">MedLlama 2 7B</option>
                        <option value="megadolphin:120b">MegaDolphin 120B</option>
                        <option value="minicpm-v:8b">MiniCPM V 8B</option>
                        <option value="mistral:latest">Mistral Latest</option>
                        <option value="mistral:7b">Mistral 7B</option>
                        <option value="mistral-large:123b">Mistral Large 123B</option>
                        <option value="mistral-nemo:12b">Mistral Nemo 12B</option>
                        <option value="mistral-small:22b">Mistral Small 22B</option>
                        <option value="mistral-small:24b">Mistral Small 24B</option>
                        <option value="mistral-small3.2:24b">Mistral Small 3.2 24B</option>
                        <option value="mistrallite:7b">MistralLite 7B</option>
                        <option value="mixtral:8x7b">Mixtral 8x7B</option>
                        <option value="mixtral:8x22b">Mixtral 8x22B</option>
                        <option value="moondream:1.8b">Moondream 1.8B</option>
                        <option value="mxbai-embed-large:335m">MXBai Embed Large 335M</option>
                        <option value="nemotron:70b">Nemotron 70B</option>
                        <option value="nemotron-mini:4b">Nemotron Mini 4B</option>
                        <option value="neural-chat:7b">Neural Chat 7B</option>
                        <option value="notus:7b">Notus 7B</option>
                        <option value="notux:8x7b">Notux 8x7B</option>
                        <option value="nous-hermes:7b">Nous Hermes 7B</option>
                        <option value="nous-hermes:13b">Nous Hermes 13B</option>
                        <option value="nous-hermes2:10.7b">Nous Hermes 2 10.7B</option>
                        <option value="nous-hermes2:34b">Nous Hermes 2 34B</option>
                        <option value="nous-hermes2-mixtral:8x7b">Nous Hermes 2 Mixtral 8x7B</option>
                        <option value="nuextract:3.8b">Nuextract 3.8B</option>
                        <option value="olmo2:7b">OLMo 2 7B</option>
                        <option value="olmo2:13b">OLMo 2 13B</option>
                        <option value="open-orca-platypus2:13b">Open Orca Platypus 2 13B</option>
                        <option value="openchat:7b">OpenChat 7B</option>
                        <option value="openhermes:7b">OpenHermes 7B</option>
                        <option value="openthinker:7b">OpenThinker 7B</option>
                        <option value="openthinker:32b">OpenThinker 32B</option>
                        <option value="orca-mini:3b">Orca Mini 3B</option>
                        <option value="orca-mini:7b">Orca Mini 7B</option>
                        <option value="orca-mini:13b">Orca Mini 13B</option>
                        <option value="orca-mini:70b">Orca Mini 70B</option>
                        <option value="orca2:7b">Orca 2 7B</option>
                        <option value="orca2:13b">Orca 2 13B</option>
                        <option value="phind-codellama:34b">Phind CodeLlama 34B</option>
                        <option value="phi:2.7b">Phi 2.7B</option>
                        <option value="phi3:latest">Phi 3 Latest</option>
                        <option value="phi3:3.8b">Phi 3 3.8B</option>
                        <option value="phi3:14b">Phi 3 14B</option>
                        <option value="phi3.5:3.8b">Phi 3.5 3.8B</option>
                        <option value="phi4:14b">Phi 4 14B</option>
                        <option value="phi4-mini:3.8b">Phi 4 Mini 3.8B</option>
                        <option value="phi4-mini-reasoning:3.8b">Phi 4 Mini Reasoning 3.8B</option>
                        <option value="phi4-reasoning:14b">Phi 4 Reasoning 14B</option>
                        <option value="qwen:0.5b">Qwen 0.5B</option>
                        <option value="qwen:1.8b">Qwen 1.8B</option>
                        <option value="qwen:4b">Qwen 4B</option>
                        <option value="qwen:7b">Qwen 7B</option>
                        <option value="qwen:14b">Qwen 14B</option>
                        <option value="qwen:32b">Qwen 32B</option>
                        <option value="qwen:72b">Qwen 72B</option>
                        <option value="qwen:110b">Qwen 110B</option>
                        <option value="qwen2:0.5b">Qwen 2 0.5B</option>
                        <option value="qwen2:1.5b">Qwen 2 1.5B</option>
                        <option value="qwen2:7b">Qwen 2 7B</option>
                        <option value="qwen2:72b">Qwen 2 72B</option>
                        <option value="qwen2-math:1.5b">Qwen 2 Math 1.5B</option>
                        <option value="qwen2-math:7b">Qwen 2 Math 7B</option>
                        <option value="qwen2-math:72b">Qwen 2 Math 72B</option>
                        <option value="qwen2.5:0.5b">Qwen 2.5 0.5B</option>
                        <option value="qwen2.5:1.5b">Qwen 2.5 1.5B</option>
                        <option value="qwen2.5:3b">Qwen 2.5 3B</option>
                        <option value="qwen2.5:7b">Qwen 2.5 7B</option>
                        <option value="qwen2.5:14b">Qwen 2.5 14B</option>
                        <option value="qwen2.5:32b">Qwen 2.5 32B</option>
                        <option value="qwen2.5:72b">Qwen 2.5 72B</option>
                        <option value="qwen2.5vl:3b">Qwen 2.5 VL 3B</option>
                        <option value="qwen2.5vl:7b">Qwen 2.5 VL 7B</option>
                        <option value="qwen2.5vl:32b">Qwen 2.5 VL 32B</option>
                        <option value="qwen2.5vl:72b">Qwen 2.5 VL 72b</option>
                        <option value="qwen3:0.6b">Qwen 3 0.6B</option>
                        <option value="qwen3:1.7b">Qwen 3 1.7B</option>
                        <option value="qwen3:4b">Qwen 3 4B</option>
                        <option value="qwen3:8b">Qwen 3 8B</option>
                        <option value="qwen3:14b">Qwen 3 14B</option>
                        <option value="qwen3:30b">Qwen 3 30B</option>
                        <option value="qwen3:32b">Qwen 3 32B</option>
                        <option value="qwen3:235b">Qwen 3 235B</option>
                        <option value="qwen3-embedding:0.6b">Qwen 3 Embedding 0.6B</option>
                        <option value="qwen3-embedding:4b">Qwen 3 Embedding 4B</option>
                        <option value="qwen3-embedding:8b">Qwen 3 Embedding 8B</option>
                        <option value="qwq:32b">QwQ 32B</option>
                        <option value="r1-1776:70b">R1 1776 70B</option>
                        <option value="r1-1776:671b">R1 1776 671B</option>
                        <option value="reflection:70b">Reflection 70B</option>
                        <option value="sailor2:1b">Sailor 2 1B</option>
                        <option value="sailor2:8b">Sailor 2 8B</option>
                        <option value="sailor2:20b">Sailor 2 20B</option>
                        <option value="samantha-mistral:7b">Samantha Mistral 7B</option>
                        <option value="shieldgemma:2b">ShieldGemma 2B</option>
                        <option value="shieldgemma:9b">ShieldGemma 9B</option>
                        <option value="shieldgemma:27b">ShieldGemma 27B</option>
                        <option value="smallthinker:3b">SmallThinker 3B</option>
                        <option value="smollm:135m">SmolLM 135M</option>
                        <option value="smollm:360m">SmolLM 360M</option>
                        <option value="smollm:1.7b">SmolLM 1.7B</option>
                        <option value="smollm2:135m">SmolLM 2 135M</option>
                        <option value="smollm2:360m">SmolLM 2 360M</option>
                        <option value="smollm2:1.7b">SmolLM 2 1.7B</option>
                        <option value="solar:10.7b">Solar 10.7B</option>
                        <option value="solar-pro:22b">Solar Pro 22B</option>
                        <option value="starling-lm:7b">Starling LM 7B</option>
                        <option value="stable-beluga:7b">Stable Beluga 7B</option>
                        <option value="stable-beluga:13b">Stable Beluga 13B</option>
                        <option value="stable-beluga:70b">Stable Beluga 70B</option>
                        <option value="stablelm-zephyr:3b">StableLM Zephyr 3B</option>
                        <option value="stablelm2:1.6b">StableLM 2 1.6B</option>
                        <option value="stablelm2:12b">StableLM 2 12B</option>
                        <option value="tinydolphin:1.1b">TinyDolphin 1.1B</option>
                        <option value="tinyllama:1.1b">TinyLlama 1.1B</option>
                        <option value="tulu3:8b">Tulu 3 8B</option>
                        <option value="tulu3:70b">Tulu 3 70B</option>
                        <option value="vicuna:7b">Vicuna 7B</option>
                        <option value="vicuna:13b">Vicuna 13B</option>
                        <option value="vicuna:33b">Vicuna 33B</option>
                        <option value="wizard-math:7b">Wizard Math 7b</option>
                        <option value="wizard-math:13b">Wizard Math 13B</option>
                        <option value="wizard-math:70b">Wizard Math 70B</option>
                        <option value="wizard-vicuna:13b">Wizard Vicuna 13B</option>
                        <option value="wizard-vicuna-uncensored:7b">Wizard Vicuna Uncensored 7B</option>
                        <option value="wizard-vicuna-uncensored:13b">Wizard Vicuna Uncensored 13B</option>
                        <option value="wizard-vicuna-uncensored:30b">Wizard Vicuna Uncensored 30B</option>
                        <option value="wizardlm:7b">WizardLM 7B</option>
                        <option value="wizardlm:13b">WizardLM 13B</option>
                        <option value="wizardlm:70b">WizardLM 70B</option>
                        <option value="wizardlm-uncensored:13b">WizardLM Uncensored 13B</option>
                        <option value="wizardlm2:7b">WizardLM 2 7B</option>
                        <option value="wizardlm2:8x22b">WizardLM 2 8x22B</option>
                        <option value="wizardcoder:33b">WizardCoder 33B</option>
                        <option value="xwinlm:7b">XwinLM 7B</option>
                        <option value="xwinlm:13b">XwinLM 13B</option>
                        <option value="yarn-llama2:7b">Yarn Llama 2 7B</option>
                        <option value="yarn-llama2:13b">Yarn Llama 2 13B</option>
                        <option value="yarn-mistral:7b">Yarn Mistral 7B</option>
                        <option value="yi:6b">Yi 6B</option>
                        <option value="yi:9b">Yi 9B</option>
                        <option value="yi:34b">Yi 34B</option>
                        <option value="yi-coder:1.5b">Yi Coder 1.5B</option>
                        <option value="yi-coder:9b">Yi Coder 9B</option>
                        <option value="zephyr:7b">Zephyr 7B</option>
                        <option value="zephyr:141b">Zephyr 141B</option>
                    </select>
                  </div>

                    {/* Creative Model */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">Creative</label>
                      <select 
                        value={config.creativeModel || 'mistral:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, creativeModel: e.target.value }))}
                        className="w-full p-3 rounded-lg focus:outline-none"
                        style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                      >
                        <option value="aya:8b">Aya 8B</option>
                        <option value="aya:35b">Aya 35B</option>
                        <option value="aya-expanse:8b">Aya Expanse 8B</option>
                        <option value="aya-expanse:32b">Aya Expanse 32B</option>
                        <option value="alfred:40b">Alfred 40B</option>
                        <option value="athene-v2:72b">Athene V2 72B</option>
                        <option value="bakllava:7b">BakLLaVA 7B</option>
                        <option value="bespoke-minicheck:7b">Bespoke MiniCheck 7B</option>
                        <option value="cogito:3b">Cogito 3B</option>
                        <option value="cogito:8b">Cogito 8B</option>
                        <option value="cogito:14b">Cogito 14B</option>
                        <option value="cogito:32b">Cogito 32B</option>
                        <option value="cogito:70b">Cogito 70B</option>
                        <option value="command-a:111b">Command A 111B</option>
                        <option value="command-r:35b">Command R 35B</option>
                        <option value="command-r-plus:104b">Command R+ 104B</option>
                        <option value="command-r7b:7b">Command R7B 7B</option>
                        <option value="command-r7b-arabic:7b">Command R7B Arabic 7B</option>
                        <option value="deepseek-llm:7b">DeepSeek LLM 7B</option>
                        <option value="deepseek-llm:67b">DeepSeek LLM 67B</option>
                        <option value="deepseek-r1:1.5b">DeepSeek R1 1.5B</option>
                        <option value="deepseek-r1:7b">DeepSeek R1 7B</option>
                        <option value="deepseek-r1:8b">DeepSeek R1 8B</option>
                        <option value="deepseek-r1:14b">DeepSeek R1 14B</option>
                        <option value="deepseek-r1:32b">DeepSeek R1 32B</option>
                        <option value="deepseek-r1:70b">DeepSeek R1 70B</option>
                        <option value="deepseek-r1:671b">DeepSeek R1 671B</option>
                        <option value="deepseek-v2:16b">DeepSeek V2 16B</option>
                        <option value="deepseek-v2:236b">DeepSeek V2 236B</option>
                        <option value="deepseek-v2.5:236b">DeepSeek V2.5 236B</option>
                        <option value="deepseek-v3:671b">DeepSeek V3 671B</option>
                        <option value="deepseek-v3.1:671b">DeepSeek V3.1 671B</option>
                        <option value="dbrx:132b">DBRX 132B</option>
                        <option value="dolphin-llama3:8b">Dolphin Llama 3 8B</option>
                        <option value="dolphin-llama3:70b">Dolphin Llama 3 70B</option>
                        <option value="dolphin-mistral:7b">Dolphin Mistral 7B</option>
                        <option value="dolphin-phi:2.7b">Dolphin Phi 2.7B</option>
                        <option value="dolphin3:8b">Dolphin 3 8B</option>
                        <option value="everythinglm:13b">EverythingLM 13B</option>
                        <option value="exaone-deep:2.4b">EXAONE Deep 2.4B</option>
                        <option value="exaone-deep:7.8b">EXAONE Deep 7.8B</option>
                        <option value="exaone-deep:32b">EXAONE Deep 32B</option>
                        <option value="exaone3.5:2.4b">EXAONE 3.5 2.4B</option>
                        <option value="exaone3.5:7.8b">EXAONE 3.5 7.8B</option>
                        <option value="exaone3.5:32b">EXAONE 3.5 32B</option>
                        <option value="falcon:7b">Falcon 7B</option>
                        <option value="falcon:40b">Falcon 40B</option>
                        <option value="falcon:180b">Falcon 180B</option>
                        <option value="falcon2:11b">Falcon 2 11B</option>
                        <option value="falcon3:1b">Falcon 3 1B</option>
                        <option value="falcon3:3b">Falcon 3 3B</option>
                        <option value="falcon3:7b">Falcon 3 7B</option>
                        <option value="falcon3:10b">Falcon 3 10B</option>
                        <option value="gemma:2b">Gemma 2B</option>
                        <option value="gemma:7b">Gemma 7B</option>
                        <option value="gemma2:2b">Gemma 2 2B</option>
                        <option value="gemma2:9b">Gemma 2 9B</option>
                        <option value="gemma2:27b">Gemma 2 27B</option>
                        <option value="gemma3:270m">Gemma 3 270M</option>
                        <option value="gemma3:1b">Gemma 3 1B</option>
                        <option value="gemma3:4b">Gemma 3 4B</option>
                        <option value="gemma3:12b">Gemma 3 12B</option>
                        <option value="gemma3:27b">Gemma 3 27B</option>
                        <option value="gemma3n:e2b">Gemma 3n E2B</option>
                        <option value="gemma3n:e4b">Gemma 3n E4B</option>
                        <option value="glm4:9b">GLM 4 9B</option>
                        <option value="goliath:70b">Goliath 70B</option>
                        <option value="granite-embedding:30m">Granite Embedding 30M</option>
                        <option value="granite-embedding:278m">Granite Embedding 278M</option>
                        <option value="granite3-dense:2b">Granite 3 Dense 2B</option>
                        <option value="granite3-dense:8b">Granite 3 Dense 8B</option>
                        <option value="granite3-guardian:2b">Granite 3 Guardian 2B</option>
                        <option value="granite3-guardian:8b">Granite 3 Guardian 8B</option>
                        <option value="granite3-moe:1b">Granite 3 MoE 1B</option>
                        <option value="granite3-moe:3b">Granite 3 MoE 3b</option>
                        <option value="granite3.1-dense:2b">Granite 3.1 Dense 2B</option>
                        <option value="granite3.1-dense:8b">Granite 3.1 Dense 8B</option>
                        <option value="granite3.1-moe:1b">Granite 3.1 MoE 1B</option>
                        <option value="granite3.1-moe:3b">Granite 3.1 MoE 3B</option>
                        <option value="granite3.2:2b">Granite 3.2 2B</option>
                        <option value="granite3.2:8b">Granite 3.2 8B</option>
                        <option value="granite3.2-vision:2b">Granite 3.2 Vision 2B</option>
                        <option value="granite3.3:2b">Granite 3.3 2B</option>
                        <option value="granite3.3:8b">Granite 3.3 8B</option>
                        <option value="granite4:2b">Granite 4 2B</option>
                        <option value="granite4:8b">Granite 4 8B</option>
                        <option value="gpt-oss:20b">GPT-OSS 20B</option>
                        <option value="gpt-oss:120b">GPT-OSS 120B</option>
                        <option value="hermes3:3b">Hermes 3 3B</option>
                        <option value="hermes3:8b">Hermes 3 8B</option>
                        <option value="hermes3:70b">Hermes 3 70B</option>
                        <option value="hermes3:405b">Hermes 3 405B</option>
                        <option value="internlm2:1m">InternLM 2 1M</option>
                        <option value="internlm2:1.8b">InternLM 2 1.8B</option>
                        <option value="internlm2:7b">InternLM 2 7B</option>
                        <option value="internlm2:20b">InternLM 2 20B</option>
                        <option value="kimi-k2:cloud">Kimi K2 Cloud</option>
                        <option value="llama-guard3:1b">Llama Guard 3 1B</option>
                        <option value="llama-guard3:8b">Llama Guard 3 8B</option>
                        <option value="llama-pro:8b">Llama Pro 8B</option>
                        <option value="llama-pro:70b">Llama Pro 70B</option>
                        <option value="llama2:7b">Llama 2 7B</option>
                        <option value="llama2:13b">Llama 2 13B</option>
                        <option value="llama2:70b">Llama 2 70B</option>
                        <option value="llama2-chinese:7b">Llama 2 Chinese 7B</option>
                        <option value="llama2-chinese:13b">Llama 2 Chinese 13B</option>
                        <option value="llama2-uncensored:7b">Llama 2 Uncensored 7B</option>
                        <option value="llama2-uncensored:70b">Llama 2 Uncensored 70B</option>
                        <option value="llama3:8b">Llama 3 8B</option>
                        <option value="llama3:70b">Llama 3 70B</option>
                        <option value="llama3-chatqa:8b">Llama 3 ChatQA 8B</option>
                        <option value="llama3-chatqa:70b">Llama 3 ChatQA 70B</option>
                        <option value="llama3-gradient:8b">Llama 3 Gradient 8B</option>
                        <option value="llama3-gradient:70b">Llama 3 Gradient 70B</option>
                        <option value="llama3-groq-tool-use:8b">Llama 3 Groq Tool Use 8B</option>
                        <option value="llama3-groq-tool-use:70b">Llama 3 Groq Tool Use 70B</option>
                        <option value="llama3.1:8b">Llama 3.1 8B</option>
                        <option value="llama3.1:70b">Llama 3.1 70B</option>
                        <option value="llama3.1:405b">Llama 3.1 405B</option>
                        <option value="llama3.2:1b">Llama 3.2 1B</option>
                        <option value="llama3.2:3b">Llama 3.2 3B</option>
                        <option value="llama3.2-vision:11b">Llama 3.2 Vision 11B</option>
                        <option value="llama3.2-vision:90b">Llama 3.2 Vision 90B</option>
                        <option value="llama3.3:70b">Llama 3.3 70B</option>
                        <option value="llama4:16x17b">Llama 4 16x17B</option>
                        <option value="llama4:128x17b">Llama 4 128x17B</option>
                        <option value="llava:7b">LLaVA 7B</option>
                        <option value="llava:13b">LLaVA 13B</option>
                        <option value="llava:34b">LLaVA 34B</option>
                        <option value="llava-llama3:8b">LLaVA Llama 3 8B</option>
                        <option value="llava-phi3:3.8b">LLaVA Phi 3 3.8B</option>
                        <option value="magistral:24b">Magistral 24B</option>
                        <option value="marco-o1:7b">Marco O1 7B</option>
                        <option value="mathstral:7b">Mathstral 7B</option>
                        <option value="meditron:7b">Meditron 7B</option>
                        <option value="meditron:70b">Meditron 70B</option>
                        <option value="medllama2:7b">MedLlama 2 7B</option>
                        <option value="megadolphin:120b">MegaDolphin 120B</option>
                        <option value="minicpm-v:8b">MiniCPM V 8B</option>
                        <option value="mistral:latest">Mistral Latest</option>
                        <option value="mistral:7b">Mistral 7B</option>
                        <option value="mistral-large:123b">Mistral Large 123B</option>
                        <option value="mistral-nemo:12b">Mistral Nemo 12B</option>
                        <option value="mistral-small:22b">Mistral Small 22B</option>
                        <option value="mistral-small:24b">Mistral Small 24B</option>
                        <option value="mistral-small3.1:24b">Mistral Small 3.1 24B</option>
                        <option value="mistral-small3.2:24b">Mistral Small 3.2 24B</option>
                        <option value="mistrallite:7b">MistralLite 7B</option>
                        <option value="mixtral:8x7b">Mixtral 8x7B</option>
                        <option value="mixtral:8x22b">Mixtral 8x22B</option>
                        <option value="moondream:1.8b">Moondream 1.8B</option>
                        <option value="mxbai-embed-large:335m">MXBai Embed Large 335M</option>
                        <option value="nemotron:70b">Nemotron 70B</option>
                        <option value="nemotron-mini:4b">Nemotron Mini 4B</option>
                        <option value="neural-chat:7b">Neural Chat 7B</option>
                        <option value="notus:7b">Notus 7B</option>
                        <option value="notux:8x7b">Notux 8x7B</option>
                        <option value="nous-hermes:7b">Nous Hermes 7B</option>
                        <option value="nous-hermes:13b">Nous Hermes 13B</option>
                        <option value="nous-hermes2:10.7b">Nous Hermes 2 10.7B</option>
                        <option value="nous-hermes2:34b">Nous Hermes 2 34B</option>
                        <option value="nous-hermes2-mixtral:8x7b">Nous Hermes 2 Mixtral 8x7B</option>
                        <option value="nuextract:3.8b">Nuextract 3.8B</option>
                        <option value="olmo2:7b">OLMo 2 7B</option>
                        <option value="olmo2:13b">OLMo 2 13B</option>
                        <option value="open-orca-platypus2:13b">Open Orca Platypus 2 13B</option>
                        <option value="openchat:7b">OpenChat 7B</option>
                        <option value="openhermes:7b">OpenHermes 7B</option>
                        <option value="openthinker:7b">OpenThinker 7B</option>
                        <option value="openthinker:32b">OpenThinker 32B</option>
                        <option value="orca-mini:3b">Orca Mini 3B</option>
                        <option value="orca-mini:7b">Orca Mini 7B</option>
                        <option value="orca-mini:13b">Orca Mini 13B</option>
                        <option value="orca-mini:70b">Orca Mini 70B</option>
                        <option value="orca2:7b">Orca 2 7B</option>
                        <option value="orca2:13b">Orca 2 13B</option>
                        <option value="phi:2.7b">Phi 2.7B</option>
                        <option value="phi3:latest">Phi 3 Latest</option>
                        <option value="phi3:3.8b">Phi 3 3.8B</option>
                        <option value="phi3:14b">Phi 3 14B</option>
                        <option value="phi3.5:3.8b">Phi 3.5 3.8B</option>
                        <option value="phi4:14b">Phi 4 14B</option>
                        <option value="phi4-mini:3.8b">Phi 4 Mini 3.8B</option>
                        <option value="phi4-mini-reasoning:3.8b">Phi 4 Mini Reasoning 3.8B</option>
                        <option value="phi4-reasoning:14b">Phi 4 Reasoning 14B</option>
                        <option value="qwen:0.5b">Qwen 0.5B</option>
                        <option value="qwen:1.8b">Qwen 1.8B</option>
                        <option value="qwen:4b">Qwen 4B</option>
                        <option value="qwen:7b">Qwen 7B</option>
                        <option value="qwen:14b">Qwen 14B</option>
                        <option value="qwen:32b">Qwen 32B</option>
                        <option value="qwen:72b">Qwen 72B</option>
                        <option value="qwen:110b">Qwen 110B</option>
                        <option value="qwen2:0.5b">Qwen 2 0.5B</option>
                        <option value="qwen2:1.5b">Qwen 2 1.5B</option>
                        <option value="qwen2:7b">Qwen 2 7B</option>
                        <option value="qwen2:72b">Qwen 2 72B</option>
                        <option value="qwen2-math:1.5b">Qwen 2 Math 1.5B</option>
                        <option value="qwen2-math:7b">Qwen 2 Math 7B</option>
                        <option value="qwen2-math:72b">Qwen 2 Math 72B</option>
                        <option value="qwen2.5:0.5b">Qwen 2.5 0.5B</option>
                        <option value="qwen2.5:1.5b">Qwen 2.5 1.5B</option>
                        <option value="qwen2.5:3b">Qwen 2.5 3B</option>
                        <option value="qwen2.5:7b">Qwen 2.5 7B</option>
                        <option value="qwen2.5:14b">Qwen 2.5 14B</option>
                        <option value="qwen2.5:32b">Qwen 2.5 32B</option>
                        <option value="qwen2.5:72b">Qwen 2.5 72B</option>
                        <option value="qwen2.5vl:3b">Qwen 2.5 VL 3B</option>
                        <option value="qwen2.5vl:7b">Qwen 2.5 VL 7B</option>
                        <option value="qwen2.5vl:32b">Qwen 2.5 VL 32B</option>
                        <option value="qwen2.5vl:72b">Qwen 2.5 VL 72b</option>
                        <option value="qwen3:0.6b">Qwen 3 0.6B</option>
                        <option value="qwen3:1.7b">Qwen 3 1.7B</option>
                        <option value="qwen3:4b">Qwen 3 4B</option>
                        <option value="qwen3:8b">Qwen 3 8B</option>
                        <option value="qwen3:14b">Qwen 3 14B</option>
                        <option value="qwen3:30b">Qwen 3 30B</option>
                        <option value="qwen3:32b">Qwen 3 32B</option>
                        <option value="qwen3:235b">Qwen 3 235B</option>
                        <option value="qwen3-embedding:0.6b">Qwen 3 Embedding 0.6B</option>
                        <option value="qwen3-embedding:4b">Qwen 3 Embedding 4B</option>
                        <option value="qwen3-embedding:8b">Qwen 3 Embedding 8B</option>
                        <option value="qwq:32b">QwQ 32B</option>
                        <option value="r1-1776:70b">R1 1776 70B</option>
                        <option value="r1-1776:671b">R1 1776 671B</option>
                        <option value="reflection:70b">Reflection 70B</option>
                        <option value="sailor2:1b">Sailor 2 1B</option>
                        <option value="sailor2:8b">Sailor 2 8B</option>
                        <option value="sailor2:20b">Sailor 2 20B</option>
                        <option value="samantha-mistral:7b">Samantha Mistral 7B</option>
                        <option value="shieldgemma:2b">ShieldGemma 2B</option>
                        <option value="shieldgemma:9b">ShieldGemma 9B</option>
                        <option value="shieldgemma:27b">ShieldGemma 27B</option>
                        <option value="smallthinker:3b">SmallThinker 3B</option>
                        <option value="smollm:135m">SmolLM 135M</option>
                        <option value="smollm:360m">SmolLM 360M</option>
                        <option value="smollm:1.7b">SmolLM 1.7B</option>
                        <option value="smollm2:135m">SmolLM 2 135M</option>
                        <option value="smollm2:360m">SmolLM 2 360M</option>
                        <option value="smollm2:1.7b">SmolLM 2 1.7B</option>
                        <option value="solar:10.7b">Solar 10.7B</option>
                        <option value="solar-pro:22b">Solar Pro 22B</option>
                        <option value="starling-lm:7b">Starling LM 7B</option>
                        <option value="stable-beluga:7b">Stable Beluga 7B</option>
                        <option value="stable-beluga:13b">Stable Beluga 13B</option>
                        <option value="stable-beluga:70b">Stable Beluga 70B</option>
                        <option value="stablelm-zephyr:3b">StableLM Zephyr 3B</option>
                        <option value="stablelm2:1.6b">StableLM 2 1.6B</option>
                        <option value="stablelm2:12b">StableLM 2 12B</option>
                        <option value="tinydolphin:1.1b">TinyDolphin 1.1B</option>
                        <option value="tinyllama:1.1b">TinyLlama 1.1B</option>
                        <option value="tulu3:8b">Tulu 3 8B</option>
                        <option value="tulu3:70b">Tulu 3 70B</option>
                        <option value="vicuna:7b">Vicuna 7B</option>
                        <option value="vicuna:13b">Vicuna 13B</option>
                        <option value="vicuna:33b">Vicuna 33B</option>
                        <option value="wizard-math:7b">Wizard Math 7b</option>
                        <option value="wizard-math:13b">Wizard Math 13B</option>
                        <option value="wizard-math:70b">Wizard Math 70B</option>
                        <option value="wizard-vicuna:13b">Wizard Vicuna 13B</option>
                        <option value="wizard-vicuna-uncensored:7b">Wizard Vicuna Uncensored 7B</option>
                        <option value="wizard-vicuna-uncensored:13b">Wizard Vicuna Uncensored 13B</option>
                        <option value="wizard-vicuna-uncensored:30b">Wizard Vicuna Uncensored 30B</option>
                        <option value="wizardlm:7b">WizardLM 7B</option>
                        <option value="wizardlm:13b">WizardLM 13B</option>
                        <option value="wizardlm:70b">WizardLM 70B</option>
                        <option value="wizardlm-uncensored:13b">WizardLM Uncensored 13B</option>
                        <option value="wizardlm2:7b">WizardLM 2 7B</option>
                        <option value="wizardlm2:8x22b">WizardLM 2 8x22B</option>
                        <option value="xwinlm:7b">XwinLM 7B</option>
                        <option value="xwinlm:13b">XwinLM 13B</option>
                        <option value="yarn-llama2:7b">Yarn Llama 2 7B</option>
                        <option value="yarn-llama2:13b">Yarn Llama 2 13B</option>
                        <option value="yarn-mistral:7b">Yarn Mistral 7B</option>
                        <option value="yi:6b">Yi 6B</option>
                        <option value="yi:9b">Yi 9B</option>
                        <option value="yi:34b">Yi 34B</option>
                        <option value="zephyr:7b">Zephyr 7B</option>
                        <option value="zephyr:141b">Zephyr 141B</option>
                      </select>
                </div>

                    {/* Coding Model */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">Coding</label>
                      <select 
                        value={config.codingModel || 'deepseek-coder:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, codingModel: e.target.value }))}
                        className="w-full p-3 rounded-lg focus:outline-none"
                        style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                      >
                        <option value="codebooga:34b">CodeBooga 34B</option>
                        <option value="codegemma:2b">CodeGemma 2B</option>
                        <option value="codegemma:7b">CodeGemma 7B</option>
                        <option value="codeqwen:7b">CodeQwen 7B</option>
                        <option value="codellama:7b">CodeLlama 7B</option>
                        <option value="codellama:13b">CodeLlama 13B</option>
                        <option value="codellama:34b">CodeLlama 34B</option>
                        <option value="codellama:70b">CodeLlama 70B</option>
                        <option value="codestral:22b">Codestral 22B</option>
                        <option value="deepcoder:1.5b">DeepCoder 1.5B</option>
                        <option value="deepcoder:14b">DeepCoder 14B</option>
                        <option value="deepseek-coder:latest">DeepSeek Coder Latest</option>
                        <option value="deepseek-coder:1.3b">DeepSeek Coder 1.3B</option>
                        <option value="deepseek-coder:6.7b">DeepSeek Coder 6.7B</option>
                        <option value="deepseek-coder:33b">DeepSeek Coder 33B</option>
                        <option value="deepseek-coder-v2:16b">DeepSeek Coder V2 16B</option>
                        <option value="deepseek-coder-v2:236b">DeepSeek Coder V2 236B</option>
                        <option value="dolphincoder:7b">DolphinCoder 7B</option>
                        <option value="dolphincoder:15b">DolphinCoder 15B</option>
                        <option value="magicoder:7b">Magicoder 7B</option>
                        <option value="opencoder:1.5b">OpenCoder 1.5B</option>
                        <option value="opencoder:8b">OpenCoder 8B</option>
                        <option value="phind-codellama:34b">Phind CodeLlama 34B</option>
                        <option value="qwen2.5-coder:0.5b">Qwen 2.5 Coder 0.5B</option>
                        <option value="qwen2.5-coder:1.5b">Qwen 2.5 Coder 1.5B</option>
                        <option value="qwen2.5-coder:3b">Qwen 2.5 Coder 3B</option>
                        <option value="qwen2.5-coder:7b">Qwen 2.5 Coder 7B</option>
                        <option value="qwen2.5-coder:14b">Qwen 2.5 Coder 14B</option>
                        <option value="qwen2.5-coder:32b">Qwen 2.5 Coder 32B</option>
                        <option value="qwen3-coder:30b">Qwen 3 Coder 30B</option>
                        <option value="qwen3-coder:480b">Qwen 3 Coder 480B</option>
                        <option value="stable-code:3b">Stable Code 3B</option>
                        <option value="starcoder:1b">StarCoder 1B</option>
                        <option value="starcoder:3b">StarCoder 3B</option>
                        <option value="starcoder:7b">StarCoder 7B</option>
                        <option value="starcoder:15b">StarCoder 15B</option>
                        <option value="starcoder2:3b">StarCoder 2 3B</option>
                        <option value="starcoder2:7b">StarCoder 2 7B</option>
                        <option value="starcoder2:15b">StarCoder 2 15B</option>
                        <option value="wizardcoder:33b">WizardCoder 33B</option>
                      </select>
                    </div>
                  </div>
                  )}

                  {/* Conversation Starters */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Conversation Starters</label>
                    <div className="space-y-2">
                      {config.conversationStarters?.map((starter, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={starter}
                            onChange={(e) => updateConversationStarter(index, e.target.value)}
                            placeholder="Add a conversation starter"
                            className="flex-1 p-2 rounded focus:outline-none"
                            style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: 'none', caretColor: 'var(--chatty-text)' }}
                          />
                          <button
                            onClick={() => removeConversationStarter(index)}
                            className="p-1 hover:bg-app-button-400 rounded text-app-text-800 hover:text-app-text-900"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addConversationStarter}
                        className="text-sm text-app-green-400 hover:text-app-green-300"
                      >
                        + Add conversation starter
                      </button>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Knowledge Files</label>
                    <p className="text-xs text-app-text-800 mb-2">Upload files to give your GPT access to specific information</p>
                    
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-2 border border-app-yellow-300 rounded-lg hover:bg-app-button-400 flex items-center gap-2 text-app-text-900 disabled:opacity-50"
                    >
                      <Paperclip size={16} />
                      {isUploading ? 'Uploading...' : 'Upload Files'}
                    </button>

                    {/* File List with Pagination */}
                    {files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-app-text-800">
                            {files.length} file{files.length !== 1 ? 's' : ''} uploaded
                          </span>
                          {totalFilePages > 1 && (
                            <span className="text-xs text-app-text-800">
                              Page {filePage} of {totalFilePages}
                            </span>
                          )}
                        </div>
                        
                        {currentFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-app-yellow-200 rounded">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-app-text-800" />
                              <span className="text-sm text-app-text-900">{file.originalName}</span>
                              <span className="text-xs text-app-text-800">({aiService.formatFileSize(file.size)})</span>
                            </div>
                            <button
                              onClick={() => handleRemoveFile(file.id)}
                              className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        
                        {totalFilePages > 1 && (
                          <div className="flex items-center justify-center gap-2 pt-2 border-t border-app-yellow-300">
                            <button
                              onClick={() => goToFilePage(filePage - 1)}
                              disabled={filePage === 1}
                              className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50"
                            >
                              ← Previous
                            </button>
                            <button
                              onClick={() => goToFilePage(filePage + 1)}
                              disabled={filePage === totalFilePages}
                              className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50"
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Upload Transcripts */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Memories</label>
                    <p className="text-xs text-app-text-800 mb-2">Upload conversation transcripts or memory files to extract tone and voice for this GPT</p>
                    
                    {/* Upload Button */}
                    <button
                      onClick={() => identityInputRef.current?.click()}
                      disabled={isUploadingIdentity}
                      className="px-4 py-2 border rounded-lg hover:bg-app-button-400 flex items-center gap-2 text-app-text-900 disabled:opacity-50 mb-3"
                      style={{ 
                        borderColor: 'var(--chatty-line)',
                        backgroundColor: 'var(--chatty-bg-secondary)'
                      }}
                    >
                      <Paperclip size={16} />
                      {isUploadingIdentity ? 'Uploading...' : 'Upload Transcripts'}
                    </button>

                    {/* Dropdown Button with File Count */}
                    {identityFiles.length > 0 && (
                      <div className="relative">
                        <div 
                          className="flex items-center justify-between p-3 cursor-pointer rounded-lg"
                          onClick={() => setShowTranscriptsDropdown(!showTranscriptsDropdown)}
                          style={{
                            backgroundColor: showTranscriptsDropdown ? 'var(--chatty-highlight)' : 'var(--chatty-bg-secondary)'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <FileText size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                            <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                              {identityFiles.length} memory file{identityFiles.length !== 1 ? 's' : ''} ready
                            </span>
                            <ChevronRight 
                              size={16} 
                              className="transition-transform duration-200 flex-shrink-0"
                              style={{ 
                                color: 'var(--chatty-text)', 
                                opacity: 0.7,
                                transform: showTranscriptsDropdown ? 'rotate(90deg)' : 'rotate(0deg)'
                              }}
                            />
                          </div>
                        </div>

                        {/* Dropdown List */}
                        {showTranscriptsDropdown && (
                          <div
                            className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg max-h-60 overflow-y-auto"
                            style={{
                              backgroundColor: 'var(--chatty-bg-main)',
                              borderColor: 'var(--chatty-line)',
                              zIndex: Z_LAYERS.popover
                            }}
                          >
                            {identityFiles.map((file) => (
                              <div 
                                key={file.id} 
                                className="flex items-center justify-between p-3 hover:bg-gray-100 transition-colors border-b last:border-b-0"
                                style={{ 
                                  borderColor: 'var(--chatty-line)',
                                  backgroundColor: 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} className="flex-shrink-0" />
                                  <span className="text-sm truncate" style={{ color: 'var(--chatty-text)' }}>{file.name}</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveIdentity(file.id)
                                  }}
                                  className="p-1 rounded hover:bg-red-100 transition-colors flex-shrink-0"
                                  style={{ color: 'var(--chatty-text)' }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Capabilities */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Capabilities</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-app-text-900">
                        <input
                          type="checkbox"
                          checked={config.capabilities?.webSearch || false}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            capabilities: { 
                              webSearch: e.target.checked,
                              canvas: prev.capabilities?.canvas || false,
                              imageGeneration: prev.capabilities?.imageGeneration || false,
                              codeInterpreter: prev.capabilities?.codeInterpreter || true
                            }
                          }))}
                          className="rounded border-app-orange-600 text-app-green-500"
                        />
                        <Search size={16} className="text-app-text-900" />
                        <span className="text-sm">Web Search</span>
                      </label>
                      <label className="flex items-center gap-2 text-app-text-900">
                        <input
                          type="checkbox"
                          checked={config.capabilities?.canvas || false}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            capabilities: { 
                              webSearch: prev.capabilities?.webSearch || false,
                              canvas: e.target.checked,
                              imageGeneration: prev.capabilities?.imageGeneration || false,
                              codeInterpreter: prev.capabilities?.codeInterpreter || true
                            }
                          }))}
                          className="rounded border-app-orange-600 text-app-green-500"
                        />
                        <Palette size={16} className="text-app-text-900" />
                        <span className="text-sm">Canvas</span>
                      </label>
                      <label className="flex items-center gap-2 text-app-text-900">
                        <input
                          type="checkbox"
                          checked={config.capabilities?.imageGeneration || false}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            capabilities: { 
                              webSearch: prev.capabilities?.webSearch || false,
                              canvas: prev.capabilities?.canvas || false,
                              imageGeneration: e.target.checked,
                              codeInterpreter: prev.capabilities?.codeInterpreter || true
                            }
                          }))}
                          className="rounded border-app-orange-600 text-app-green-500"
                        />
                        <Image size={16} className="text-app-text-900" />
                        <span className="text-sm">Image Generation</span>
                      </label>
                      <label className="flex items-center gap-2 text-app-text-900">
                        <input
                          type="checkbox"
                          checked={config.capabilities?.codeInterpreter || false}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            capabilities: { 
                              webSearch: prev.capabilities?.webSearch || false,
                              canvas: prev.capabilities?.canvas || false,
                              imageGeneration: prev.capabilities?.imageGeneration || false,
                              codeInterpreter: e.target.checked
                            }
                          }))}
                          className="rounded border-app-orange-600 text-app-green-500"
                        />
                        <Code size={16} className="text-app-text-900" />
                        <span className="text-sm">Code Interpreter</span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Actions</label>
                    <p className="text-xs text-app-text-800 mb-3">Add API endpoints your GPT can call</p>
                    
                      <button
                      onClick={() => setIsActionsEditorOpen(true)}
                      className="w-full p-4 border-2 border-dashed border-app-orange-600 rounded-lg hover:border-app-orange-500 transition-colors flex items-center justify-center gap-2 text-app-text-800 hover:text-app-text-900"
                      >
                      <Plus size={20} />
                      <span>Open Actions Editor</span>
                      </button>

                    {/* Action List */}
                    {actions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {actions.map((action) => (
                          <div key={action.id} className="flex items-center justify-between p-2 bg-app-yellow-200 rounded">
                            <div className="flex items-center gap-2">
                              <Link size={16} className="text-app-text-800" />
                              <span className="text-sm text-app-text-900">{action.name}</span>
                              <span className="text-xs text-app-text-800">({action.method})</span>
                            </div>
                            <button
                              onClick={() => removeAction(action.id)}
                              className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Memories (runtime-scoped) - Only show in Configure tab */}
                    {activeTab === 'configure' && (
                      <>
                        {!settings.personalization.allowMemory ? (
                          <div className="p-4 rounded-lg border flex items-start gap-3" style={{ 
                            backgroundColor: 'var(--chatty-bg-card)', 
                            borderColor: 'var(--chatty-line)',
                            borderWidth: '1px'
                          }}>
                            <AlertCircle size={18} className="text-app-orange-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium mb-1" style={{ color: 'var(--chatty-text)' }}>
                                Memories are disabled
                              </p>
                              <p className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                                To enable memories for this custom AI, turn on "Allow memory" in your account settings.
                              </p>
                              <button
                                onClick={() => {
                                  // Dispatch event to open settings modal
                                  window.dispatchEvent(new CustomEvent('chatty:open-settings', { 
                                    detail: { tab: 'personalization' }
                                  }))
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                                style={{ 
                                  backgroundColor: 'var(--chatty-bg-main)', 
                                  color: 'var(--chatty-text)',
                                  border: '1px solid var(--chatty-line)'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--chatty-bg-main)'
                                }}
                              >
                                <Settings size={12} />
                                Open Settings
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 border border-app-border/60 rounded-lg bg-app-surface">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText size={14} className="text-app-purple-500" />
                                <span className="text-sm font-medium text-app-text-900">Memories</span>
                              </div>
                              <span className="text-xs text-app-text-700">Stored under /instances/&lt;runtime&gt;/memory</span>
                            </div>
                            <p className="mt-2 text-xs text-app-text-800">
                              Drop markdown, text, JSON, or HTML here to seed runtime memory. Files are stored as plain markdown; no embeddings required.
                            </p>
                          </div>
                        )}
                      </>
                    )}
            </div>
                </div>
              )}
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col" style={{ backgroundColor: 'var(--chatty-highlight)' }}>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-app-text-900">Preview</h2>
                {previewMessages.length > 0 && (
                  <button
                    onClick={() => setPreviewMessages([])}
                      className="text-xs text-app-text-800 hover:text-app-text-900"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              {/* Chat Preview */}
              <div className="flex-1 p-4 overflow-y-auto min-h-0">
                {previewMessages.length === 0 ? (
                  <div className="text-center">
                    {config.avatar ? (
                      <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden flex items-center justify-center">
                        <img src={config.avatar} alt="GPT Avatar" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 rounded-full" style={{ border: '2px dashed var(--chatty-line)', backgroundColor: 'transparent' }}>
                        <div className="w-8 h-8 rounded-full" style={{ border: '1px dashed var(--chatty-line)', backgroundColor: 'transparent' }}></div>
                      </div>
                    )}
                    <p className="text-app-text-800 text-sm">
                      {config.name || 'Your GPT'}
                    </p>
                    <p className="text-app-text-800 text-xs mt-1">
                      {config.description || 'Preview your GPT here'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pb-4">
                    {previewMessages.map((message, index) => (
                      <div 
                        key={index} 
                        className="flex flex-col gap-2 p-4 rounded-lg transition-colors"
                        style={{ backgroundColor: 'var(--chatty-bg-message)' }}
                      >
                        <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.role === 'user' ? 'bg-app-orange-600' : 'bg-app-green-600'
                          }`}
                        >
                          <span className="text-app-text-900 text-sm font-bold">
                            {message.role === 'user' ? 'U' : 'AI'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm whitespace-pre-wrap text-app-text-900">
                            {message.content}
                          </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs ml-11" style={{ color: 'var(--chatty-text)', opacity: 0.55 }}>
                          <span>{formatMessageTimestamp(message.timestamp)}</span>
                          {message.role === 'assistant' && message.responseTimeMs && (
                            <>
                              <span>•</span>
                              <span>Generated in {formatGenerationTime(message.responseTimeMs)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Input Preview */}
              <div className="p-4">
                <form onSubmit={handlePreviewSubmit} className="space-y-2">
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg"
                    style={{ border: 'none', backgroundColor: 'var(--chatty-bg-card)' }}
                  >
                    <textarea
                      ref={previewInputRef}
                      value={previewInput}
                      onChange={(e) => setPreviewInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handlePreviewSubmit(e)
                        }
                      }}
                      placeholder="Ask anything"
                      className="flex-1 outline-none text-sm bg-transparent resize-none min-h-[20px] max-h-32 placeholder-[#ADA587] scrollbar-hide"
                      style={{ color: 'var(--chatty-text)', caretColor: 'var(--chatty-text)' }}
                      rows={1}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        console.log('📎 Preview tab paperclip clicked!')
                        fileInputRef.current?.click()
                      }}
                      className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                      title="Upload knowledge files"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="submit"
                      disabled={!previewInput.trim() || isPreviewGenerating}
                      className="p-1 hover:bg-app-button-600 rounded disabled:opacity-50"
                    >
                      {isPreviewGenerating ? (
                        <div className="w-4 h-4 border-2 border-app-button-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Play size={16} className="text-app-text-800" />
                      )}
                    </button>
                  </div>
                  <div className="text-xs text-app-text-800 text-center space-y-1">
                    <p>This is a live preview using the configured models.</p>
                    <p>Your GPT will behave based on the current configuration above.</p>
                    {files.length > 0 && (
                      <div className="text-xs text-app-green-400 mt-2">
                        <p>📎 {files.length} knowledge file{files.length !== 1 ? 's' : ''} available</p>
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share / Privacy Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-60 bg-black bg-opacity-60 flex items-center justify-center p-4" onClick={() => setIsShareModalOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl shadow-xl"
            style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4">
              <div>
                <h3 className="text-lg font-semibold">Share GPT</h3>
                <p className="text-sm opacity-70">Choose how you want to share this GPT</p>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="p-2 rounded-lg hover:bg-app-button-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-2">
              {[
                { value: 'private' as const, label: 'Only me', description: 'Visible only to you', icon: Lock },
                { value: 'link' as const, label: 'Anyone with the link', description: 'Share via link', icon: Link2 },
                { value: 'store' as const, label: 'GPT Store', description: 'List publicly', icon: Store }
              ].map(option => {
                const Icon = option.icon
                const selected = privacyChoice === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => setPrivacyChoice(option.value)}
                    className="w-full flex items-center justify-between p-3 rounded-lg transition-colors"
                    style={{
                      backgroundColor: selected ? 'rgba(173,165,135,0.15)' : 'transparent',
                      border: selected ? '1px solid #ADA587' : '1px solid transparent'
                    }}
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-bg-card)' }}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs opacity-70">{option.description}</div>
                      </div>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full border flex items-center justify-center"
                      style={{ borderColor: selected ? '#ADA587' : 'var(--chatty-line)', backgroundColor: 'transparent' }}
                    >
                      {selected && <Check size={12} />}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-app-button-300">
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-app-button-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWithPrivacy}
                className="px-4 py-2 text-sm rounded-lg flex items-center gap-2"
                style={{ backgroundColor: '#ADA587', color: '#2a2412' }}
              >
                <Save size={14} />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions Editor Modal */}
      {isActionsEditorOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-app-button-100 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-app-button-300">
              <div>
                <h2 className="text-xl font-semibold text-app-text-900">Edit Actions</h2>
                <p className="text-sm text-app-text-800 mt-1">
                  Let your GPT retrieve information or take actions outside of Chatty. 
                  <a href="#" className="text-app-green-400 hover:underline ml-1">Learn more</a>
                </p>
              </div>
              <button
                onClick={() => setIsActionsEditorOpen(false)}
                className="p-2 hover:bg-app-button-400 rounded-lg text-app-text-800 hover:text-app-text-900"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Panel - Schema Editor */}
              <div className="flex-1 p-6 border-r border-app-button-300">
                <div className="space-y-4">
                  {/* Authentication */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Authentication</label>
                    <div className="flex items-center gap-2">
                      <select className="flex-1 p-2 border border-app-yellow-300 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900">
                        <option value="none">None</option>
                        <option value="api-key">API Key</option>
                        <option value="oauth">OAuth</option>
                      </select>
                      <button className="p-2 hover:bg-app-button-400 rounded text-app-text-800 hover:text-app-text-900">
                        <Code size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Schema */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-app-text-900">Schema</label>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                          Import from URL
                        </button>
                        <select 
                          className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600"
                          onChange={(e) => {
                            if (e.target.value === 'katana-chatty-bridge') {
                              setActionsSchema(`{
  "openapi": "3.1.0",
  "info": {
    "title": "External Chatty Bridge",
    "version": "1.0.1",
    "description": "Endpoints to send prompts to Chatty and receive replies back to external systems."
  },
  "servers": [
    {
      "url": "https://okay-air-sector-bishop.trycloudflare.com",
      "description": "Cloudflare tunnel to local Chatty bridge"
    }
  ],
  "paths": {
    "/chatty": {
      "post": {
        "summary": "Queue a prompt in the Chatty CLI terminal",
        "operationId": "sendMessageToChatty",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "message": {
                    "type": "string",
                    "description": "The message to send to Chatty"
                  },
                  "sender": {
                    "type": "string",
                    "description": "Who is sending the message (e.g., 'katana')"
                  }
                },
                "required": ["message", "sender"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message queued successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/katana-listen": {
      "post": {
        "summary": "Receive responses from Chatty CLI",
        "operationId": "receiveFromChatty",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "response": {
                    "type": "string",
                    "description": "The response from Chatty"
                  },
                  "originalMessage": {
                    "type": "string",
                    "description": "The original message that was sent"
                  }
                },
                "required": ["response"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Response received successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`)
                            }
                          }}
                        >
                          <option>Examples</option>
                          <option value="katana-chatty-bridge">External ↔ Chatty Bridge</option>
                          <option>Weather API</option>
                          <option>Database API</option>
                        </select>
                      </div>
                    </div>
                    <textarea
                      value={actionsSchema}
                      onChange={(e) => setActionsSchema(e.target.value)}
                      className="w-full h-96 p-3 border border-app-yellow-300 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900 font-mono text-sm resize-none"
                      placeholder="Enter your OpenAPI schema here..."
                    />
                    <div className="flex justify-end mt-2">
                      <button className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                        Format
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel - Available Actions */}
              <div className="w-80 p-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-app-text-900">Available actions</h3>
                  
                  {/* Actions List */}
                  <div className="space-y-2">
                    <div className="p-3 border border-app-yellow-300 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-app-text-900">sendMessageToChatty</span>
                        <button className="px-2 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                          Test
                        </button>
                      </div>
                      <div className="text-xs text-app-text-800 space-y-1">
                        <div>POST /chatty</div>
                        <div>Queue a prompt in the Chatty CLI terminal</div>
                      </div>
                    </div>

                    <div className="p-3 border border-app-yellow-300 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-app-text-900">receiveFromChatty</span>
                        <button className="px-2 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                          Test
                        </button>
                      </div>
                      <div className="text-xs text-app-text-800 space-y-1">
                        <div>POST /katana-listen</div>
                        <div>Receive responses from Chatty CLI</div>
                      </div>
                    </div>
                  </div>

                  {/* Privacy Policy */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-app-text-900">Privacy policy</label>
                    <input
                      type="url"
                      placeholder="https://app.example.com/privacy"
                      className="w-full p-2 border border-app-yellow-300 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900 placeholder-app-button-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-app-button-300">
              <button
                onClick={() => setIsActionsEditorOpen(false)}
                className="px-4 py-2 text-sm text-app-text-800 hover:text-app-text-900"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Parse schema and extract actions
                  try {
                    const schema = JSON.parse(actionsSchema)
                    const extractedActions: AIAction[] = []
                    
                    if (schema.paths) {
                      Object.entries(schema.paths).forEach(([path, methods]: [string, any]) => {
                        Object.entries(methods).forEach(([method, operation]: [string, any]) => {
                          if (operation.operationId) {
                            extractedActions.push({
                              id: `action-${crypto.randomUUID()}`,
                              aiId: 'temp',
                              name: operation.operationId,
                              description: operation.summary || operation.description || '',
                              url: `${schema.servers?.[0]?.url || ''}${path}`,
                              method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE',
                              headers: {},
                              parameters: {},
                              isActive: true,
                              createdAt: new Date().toISOString()
                            })
                          }
                        })
                      })
                    }
                    
                    setActions(extractedActions)
                    setIsActionsEditorOpen(false)
                  } catch (error) {
                    setError('Invalid JSON schema')
                  }
                }}
                className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600"
              >
                Save Actions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {showCropModal && imageToCrop && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-app-button-100 rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-app-text-900">Crop Avatar</h3>
              <button
                onClick={handleCropCancel}
                className="text-app-text-800 hover:text-app-text-900"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4">
              <div className="relative w-full h-64 bg-app-yellow-200 rounded-lg overflow-hidden">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1} // Force 1:1 aspect ratio for square avatars
                  onCropChange={onCropChange}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  showGrid={true}
                  style={{
                    containerStyle: {
                      width: '100%',
                      height: '100%',
                      position: 'relative'
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm text-app-text-800">Zoom:</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-app-text-800">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCropCancel}
                className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-500"
              >
                Cancel
              </button>
              <button
                onClick={handleCropComplete}
                disabled={isUploadingAvatar}
                className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploadingAvatar ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Cropping...
                  </>
                ) : (
                  <>
                    <Crop size={16} />
                    Crop & Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AICreator
