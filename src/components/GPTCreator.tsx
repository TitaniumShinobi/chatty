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
  // Settings,
  FileText,
  Link,
  Play,
  Bot,
  Paperclip,
  Crop
} from 'lucide-react'
import { GPTService, GPTConfig, GPTFile, GPTAction } from '../lib/gptService'
import Cropper from 'react-easy-crop'
import { cn } from '../lib/utils'

interface GPTCreatorProps {
  isVisible: boolean
  onClose: () => void
  onGPTCreated?: (gpt: GPTConfig) => void
}

const GPTCreator: React.FC<GPTCreatorProps> = ({ 
  isVisible, 
  onClose, 
  onGPTCreated 
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'configure'>('create')
  const [gptService] = useState(() => GPTService.getInstance())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // GPT Configuration
  const [config, setConfig] = useState<Partial<GPTConfig>>({
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
    codingModel: 'deepseek-coder:latest'
  })

  // File management
  const [files, setFiles] = useState<GPTFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [filePage, setFilePage] = useState(1)
  const [filesPerPage] = useState(20) // Show 20 files per page for 300+ files
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
  const [actions, setActions] = useState<GPTAction[]>([])

  // Preview
  const [previewMessages, setPreviewMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
  const [previewInput, setPreviewInput] = useState('')
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false)
  const [useLinMode, setUseLinMode] = useState(true) // Default to Lin mode (respect custom tone)
  const [createMessages, setCreateMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
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
    if (isVisible) {
      resetForm()
    }
  }, [isVisible])

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

  const handleSave = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const validationErrors = gptService.validateGPTConfig(config)
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      const gpt = await gptService.createGPT(config as any)
      
      // Upload files after GPT creation to avoid FOREIGN KEY constraint
      for (const file of files) {
        if (file.gptId === 'temp' && file._file) {
          // Upload the file with the new GPT ID
          await gptService.uploadFile(gpt.id, file._file)
        }
      }

      // Create actions if any
      for (const action of actions) {
        if (action.name && action.url) {
          await gptService.createAction(gpt.id, action as any)
        }
      }

      onGPTCreated?.(gpt)
      onClose()
      
    } catch (error: any) {
      setError(error.message || 'Failed to create GPT')
    } finally {
      setIsLoading(false)
    }
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
        const tempFile: GPTFile = {
          id: `temp-${crypto.randomUUID()}`,
          gptId: 'temp',
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
      const avatar = await gptService.generateAvatar(config.name, config.description || '')
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

    // Add user message to create conversation
    setCreateMessages(prev => {
      const newMessages = [...prev, { role: 'user' as const, content: userMessage }]
      console.log('Create tab: Adding user message, total messages:', newMessages.length)
      return newMessages
    })

    try {
      // Use runSeat for direct AI model access
      const { runSeat } = await import('../lib/browserSeatRunner')
      
      // Build system prompt for GPT creation assistant
      const systemPrompt = buildCreateTabSystemPrompt()
      
      // Check if this is a simple greeting
      const isGreeting = isSimpleGreeting(userMessage)
      console.log('Create tab: Is greeting?', isGreeting, 'Message:', userMessage)
      
      // Create conversation context
      const conversationContext = createMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n')
      
      // Build the full prompt with greeting context
      const fullPrompt = `${systemPrompt}

${isGreeting ? 'NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions.' : ''}

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}User: ${userMessage}

Assistant:`
      
      // Use a creative model for GPT creation assistance (better at brainstorming and design)
      const selectedModel = 'mistral:latest' // Use creative model for creation assistance
      console.log('Create tab using GPT creation assistant model:', selectedModel)
      
      const response = await runSeat({
        seat: 'creative',
        prompt: fullPrompt,
        modelOverride: selectedModel
      })
      
      // Add AI response to create conversation
      setCreateMessages(prev => {
        const newMessages = [...prev, { role: 'assistant' as const, content: response.trim() }]
        console.log('Create tab: Adding assistant message, total messages:', newMessages.length)
        return newMessages
      })
      
      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([...createMessages, { role: 'user', content: userMessage }, { role: 'assistant', content: response.trim() }])
      
    } catch (error) {
      console.error('Error in create tab:', error)
      let errorMessage = 'I encountered an error while processing your request. Please try again.'
      
      if (error instanceof Error) {
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
          content: errorMessage
        }]
        console.log('Create tab: Adding error message, total messages:', newMessages.length)
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
    setPreviewMessages(prev => [...prev, { role: 'user', content: userMessage }])

    try {
      // Use Lin synthesis for custom GPT previews (bypasses Chatty tone normalization)
      const { OptimizedSynthProcessor } = await import('../engine/optimizedSynth')
      const { PersonaBrain } = await import('../engine/memory/PersonaBrain')
      const { MemoryStore } = await import('../engine/memory/MemoryStore')
      
      // Build system prompt from current config
      let systemPrompt = buildPreviewSystemPrompt(config)
      
      // Add file content to system prompt if files are uploaded
      if (files.length > 0) {
        const fileContent = await processFilesForPreview(files);
        if (fileContent) {
          systemPrompt += `\n\nKnowledge Files Content:\n${fileContent}`;
        }
      }
      
      // Create conversation history for Lin synthesis
      const conversationHistory = previewMessages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          text: msg.content,
          timestamp: new Date().toISOString()
        }))
      
      let response: string
      
      if (useLinMode) {
        // Use Lin synthesis for unbiased, custom tone
        const memoryStore = new MemoryStore()
        const personaBrain = new PersonaBrain(memoryStore)
        const synthProcessor = new OptimizedSynthProcessor(personaBrain, {
          enableLinMode: true // Enable Lin mode for unbiased synthesis
        })
        
        console.log('Preview using Lin synthesis (tone normalization bypassed)')
        
        // Process with Lin mode and custom instructions
        const result = await synthProcessor.processMessageWithLinMode(
          userMessage,
          conversationHistory,
          systemPrompt,
          'gpt-preview'
        )
        
        response = result.response
      } else {
        // Use normal Chatty synthesis with tone normalization
        const { runSeat } = await import('../lib/browserSeatRunner')
        
        // Create conversation context
        const conversationContext = previewMessages
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n')
        
        // Build the full prompt
        const fullPrompt = `${systemPrompt}

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}User: ${userMessage}

Assistant:`
        
        // Process with the selected conversation model
        const selectedModel = config.conversationModel || config.modelId || 'phi3:latest'
        console.log('Preview using Chatty synthesis with tone normalization, model:', selectedModel)
        
        response = await runSeat({
          seat: 'smalltalk',
          prompt: fullPrompt,
          modelOverride: selectedModel
        })
      }
      
      // Add AI response to preview conversation
      setPreviewMessages(prev => [...prev, { role: 'assistant', content: response.trim() }])
      
      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([...previewMessages, { role: 'user', content: userMessage }, { role: 'assistant', content: response.trim() }])
      
    } catch (error) {
      console.error('Error in preview:', error)
      let errorMessage = 'I encountered an error while processing your request. Please try again.'
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('ModelNotAvailable')) {
          errorMessage = `The selected model "${config.conversationModel || config.modelId || 'phi3:latest'}" is not available. Please check that Ollama is running and the model is installed.`
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the AI service. Please check that Ollama is running on localhost:11434.'
        } else if (error.message.includes('Ollama error')) {
          errorMessage = `Ollama service error: ${error.message}`
        }
      }
      
      setPreviewMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }])
    } finally {
      setIsPreviewGenerating(false)
    }
  }

  const processFilesForPreview = async (files: GPTFile[]): Promise<string> => {
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

  const buildCreateTabSystemPrompt = (): string => {
    return `You are a GPT Creation Assistant. Your job is to help users build custom GPTs by understanding their needs and automatically configuring the GPT settings.

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

WHEN YOU SUGGEST CHANGES:
- Be specific about what you're updating
- Explain why you're making those changes
- Ask for confirmation before making major changes
- Help them think through the implications

RESPONSE FORMAT:
For configuration updates, end your responses with a clear indication of what you're updating, like:
"Based on your description, I'm updating your GPT configuration with: [specific changes]"

Be friendly, helpful, and collaborative. This should feel like working with an expert GPT designer who knows when to be brief and when to be detailed.`
  }

  const buildPreviewSystemPrompt = (config: Partial<GPTConfig>): string => {
    // This is the actual custom GPT being created
    let systemPrompt = ''
    
    // Add name and description
    if (config.name) {
      systemPrompt += `You are ${config.name}.`
    }
    
    if (config.description) {
      systemPrompt += ` ${config.description}`
    }
    
    // Add instructions
    if (config.instructions) {
      systemPrompt += `\n\nInstructions:\n${config.instructions}`
    }
    
    // Add capabilities
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
    
    // Add conversation starters context
    if (config.conversationStarters && config.conversationStarters.length > 0) {
      const starters = config.conversationStarters.filter(s => s.trim())
      if (starters.length > 0) {
        systemPrompt += `\n\nYou can help users with topics like: ${starters.join(', ')}.`
      }
    }
    
    // Add model context
    if (config.conversationModel || config.creativeModel || config.codingModel) {
      systemPrompt += `\n\nModel Configuration:`
      if (config.conversationModel) {
        systemPrompt += `\n- Conversation: ${config.conversationModel}`
      }
      if (config.creativeModel) {
        systemPrompt += `\n- Creative: ${config.creativeModel}`
      }
      if (config.codingModel) {
        systemPrompt += `\n- Coding: ${config.codingModel}`
      }
    } else if (config.modelId) {
      systemPrompt += `\n\nYou are running on the ${config.modelId} model.`
    }
    
    // Add Knowledge Files context
    if (files.length > 0) {
      systemPrompt += `\n\nKnowledge Files:`
      for (const file of files) {
        if (file.isActive) {
          systemPrompt += `\n- ${file.originalName} (${file.mimeType})`
        }
      }
      systemPrompt += `\n\nYou have access to the content of these files and can reference them in your responses. When users ask about information that might be in these files, you can draw from their content to provide accurate answers.`
    }
    
    // Add preview context
    systemPrompt += `\n\nThis is a preview of your GPT configuration. Respond naturally as if you were the configured GPT.`
    
    return systemPrompt.trim()
  }

  const extractConfigFromConversation = (messages: Array<{role: 'user' | 'assistant', content: string}>) => {
    // Enhanced extraction logic - look for patterns in the conversation
    const fullConversation = messages.map(m => `${m.role}: ${m.content}`).join('\n')
    
    // Extract name suggestions (more flexible patterns)
    const namePatterns = [
      /name[:\s]+["']?([^"'\n]+)["']?/i,
      /"([^"]+)"\s*as\s*the\s*name/i,
      /call\s+it\s+["']?([^"'\n]+)["']?/i,
      /gpt\s+name[:\s]+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of namePatterns) {
      const match = fullConversation.match(pattern)
      if (match && !config.name) {
        const suggestedName = match[1].trim()
        if (suggestedName.length > 0 && suggestedName.length < 100) {
          setConfig(prev => ({ ...prev, name: suggestedName }))
          break
        }
      }
    }
    
    // Extract description suggestions (more flexible patterns)
    const descPatterns = [
      /description[:\s]+["']?([^"'\n]+)["']?/i,
      /it\s+should\s+["']?([^"'\n]+)["']?/i,
      /helps?\s+users?\s+with\s+["']?([^"'\n]+)["']?/i,
      /designed\s+to\s+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of descPatterns) {
      const match = fullConversation.match(pattern)
      if (match && !config.description) {
        const suggestedDesc = match[1].trim()
        if (suggestedDesc.length > 0 && suggestedDesc.length < 500) {
          setConfig(prev => ({ ...prev, description: suggestedDesc }))
          break
        }
      }
    }
    
    // Extract instruction suggestions (more flexible patterns)
    const instructionPatterns = [
      /instructions?[:\s]+["']?([^"'\n]+)["']?/i,
      /should\s+["']?([^"'\n]+)["']?/i,
      /behave\s+["']?([^"'\n]+)["']?/i,
      /tone[:\s]+["']?([^"'\n]+)["']?/i
    ]
    
    for (const pattern of instructionPatterns) {
      const match = fullConversation.match(pattern)
      if (match && !config.instructions) {
        const suggestedInstructions = match[1].trim()
        if (suggestedInstructions.length > 0 && suggestedInstructions.length < 1000) {
          setConfig(prev => ({ ...prev, instructions: suggestedInstructions }))
          break
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      {/* Hidden file input - accessible from all tabs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept=".txt,.md,.pdf,.json,.csv,.doc,.docx,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.svg"
      />
      
      <div className="bg-app-orange-950 border border-app-orange-800 rounded-lg w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-app-orange-800">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-app-orange-800 rounded-lg text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Create New GPT</h1>
              <p className="text-sm text-app-orange-400">• Draft</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isLoading || !config.name?.trim()}
              className="px-4 py-2 text-sm bg-app-green-600 text-white rounded-lg hover:bg-app-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Save size={14} />
              {isLoading ? 'Creating...' : 'Create GPT'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-2 p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Configure */}
          <div className="w-1/2 border-r border-app-orange-800 overflow-y-auto">
            {/* Tabs */}
            <div className="flex border-b border-app-orange-800">
              <button
                onClick={() => setActiveTab('create')}
                className={cn(
                  "px-4 py-2 text-sm font-medium",
                  activeTab === 'create' 
                    ? "border-b-2 border-app-green-500 text-app-green-400" 
                    : "text-app-orange-400 hover:text-app-orange-300"
                )}
              >
                Create
              </button>
              <button
                onClick={() => setActiveTab('configure')}
                className={cn(
                  "px-4 py-2 text-sm font-medium",
                  activeTab === 'configure' 
                    ? "border-b-2 border-app-green-500 text-app-green-400" 
                    : "text-app-orange-400 hover:text-app-orange-300"
                )}
              >
                Configure
              </button>
            </div>

            <div className="p-6 space-y-6">
              {activeTab === 'create' ? (
                // Create Tab - Interactive LLM Conversation
                <div className="flex flex-col h-full">
                  <div className="flex-1 p-4 overflow-y-auto">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-app-orange-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Bot size={24} className="text-app-orange-400" />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">Let's create your GPT together</h3>
                      <p className="text-app-orange-400 text-sm">
                        I'll help you build your custom AI assistant. Just tell me what you want it to do!
                      </p>
                    </div>

                    {/* Conversation Messages */}
                    <div className="space-y-4 mb-4">
                      {(() => {
                        console.log('Create tab render: createMessages.length =', createMessages.length, 'messages:', createMessages)
                        return createMessages.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-app-orange-400 text-sm">
                              Start by telling me what kind of GPT you'd like to create...
                            </p>
                          </div>
                        ) : (
                          createMessages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-lg ${
                                message.role === 'user'
                                  ? 'bg-app-green-600 text-white'
                                  : 'bg-app-orange-800 text-white'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            </div>
                          </div>
                        ))
                        )
                      })()}
                    </div>

                    {/* Uploaded Files Display */}
                    {files.length > 0 && (
                      <div className="mb-4 p-3 bg-app-orange-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Paperclip size={16} className="text-app-green-400" />
                          <span className="text-sm font-medium text-white">Knowledge Files</span>
                          <span className="text-xs text-app-orange-400">({files.length})</span>
                        </div>
                        <div className="space-y-1">
                          {currentFiles.map((file, index) => (
                            <div key={index} className="flex items-center gap-2 text-xs text-app-orange-300">
                              <FileText size={12} />
                              <span>{file.originalName}</span>
                              <span className="text-app-orange-500">({file.mimeType})</span>
                            </div>
                          ))}
                          {totalFilePages > 1 && (
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-orange-700">
                              <button
                                onClick={() => goToFilePage(filePage - 1)}
                                disabled={filePage === 1}
                                className="text-xs text-app-orange-400 hover:text-white disabled:opacity-50"
                              >
                                ← Previous
                              </button>
                              <span className="text-xs text-app-orange-400">
                                Page {filePage} of {totalFilePages}
                              </span>
                              <button
                                onClick={() => goToFilePage(filePage + 1)}
                                disabled={filePage === totalFilePages}
                                className="text-xs text-app-orange-400 hover:text-white disabled:opacity-50"
                              >
                                Next →
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-app-orange-400 mt-2">
                          These files will be available to your GPT for reference and context.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-app-orange-800">
                    <form onSubmit={handleCreateSubmit} className="space-y-2">
                      <div className="flex items-center gap-2 p-3 border border-app-orange-700 rounded-lg bg-app-orange-900">
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
                          className="flex-1 outline-none text-sm bg-transparent text-white placeholder-app-orange-400 resize-none min-h-[20px] max-h-32"
                          rows={1}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            console.log('📎 Create tab paperclip clicked!')
                            fileInputRef.current?.click()
                          }}
                          className="p-1 hover:bg-app-orange-700 rounded text-app-orange-400 hover:text-white"
                          title="Upload knowledge files"
                        >
                          <Paperclip size={16} />
                        </button>
                        <button
                          type="submit"
                          disabled={!createInput.trim() || isCreateGenerating}
                          className="p-1 hover:bg-app-orange-700 rounded disabled:opacity-50"
                        >
                          {isCreateGenerating ? (
                            <div className="w-4 h-4 border-2 border-app-orange-400 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Play size={16} className="text-app-orange-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-app-orange-400 text-center">
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
                <div className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 border-2 border-dashed border-app-orange-600 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:border-app-orange-500 transition-colors"
                      onClick={triggerAvatarUpload}
                      title="Click to upload avatar image"
                    >
                      {isUploadingAvatar ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-app-orange-400 border-t-transparent"></div>
                      ) : config.avatar ? (
                        <img src={config.avatar} alt="GPT Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <Plus size={24} className="text-app-orange-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Avatar</p>
                      <p className="text-xs text-app-orange-400 mb-2">Click the + to upload an image, or generate one automatically</p>
                      <div className="flex gap-2">
                        <button
                          onClick={generateAvatar}
                          disabled={isGeneratingAvatar || !config.name?.trim()}
                          className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingAvatar ? 'Generating...' : 'Generate Avatar'}
                        </button>
                        {config.avatar && (
                          <button
                            onClick={() => setConfig(prev => ({ ...prev, avatar: undefined }))}
                            className="px-3 py-1 text-xs bg-red-800 text-white rounded hover:bg-red-700"
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
                    <label className="block text-sm font-medium mb-2 text-white">Name</label>
                    <input
                      type="text"
                      value={config.name || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Name your GPT"
                      className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white placeholder-app-orange-400"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Description</label>
                    <input
                      type="text"
                      value={config.description || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What does this GPT do?"
                      className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white placeholder-app-orange-400"
                    />
                  </div>

                  {/* Instructions */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Instructions</label>
                    <textarea
                      value={config.instructions || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, instructions: e.target.value }))}
                      placeholder="How should this GPT behave? What should it do and avoid?"
                      rows={6}
                      className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 resize-none bg-app-orange-900 text-white placeholder-app-orange-400"
                    />
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-white">Model Selection</h3>
                    
                    {/* Conversation Model */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Conversation</label>
                      <select 
                        value={config.conversationModel || 'phi3:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, conversationModel: e.target.value }))}
                        className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white"
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
                      <label className="block text-sm font-medium mb-2 text-white">Creative</label>
                      <select 
                        value={config.creativeModel || 'mistral:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, creativeModel: e.target.value }))}
                        className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white"
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
                      <label className="block text-sm font-medium mb-2 text-white">Coding</label>
                      <select 
                        value={config.codingModel || 'deepseek-coder:latest'}
                        onChange={(e) => setConfig(prev => ({ ...prev, codingModel: e.target.value }))}
                        className="w-full p-3 border border-app-orange-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white"
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

                  {/* Conversation Starters */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Conversation Starters</label>
                    <div className="space-y-2">
                      {config.conversationStarters?.map((starter, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={starter}
                            onChange={(e) => updateConversationStarter(index, e.target.value)}
                            placeholder="Add a conversation starter"
                            className="flex-1 p-2 border border-app-orange-700 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white placeholder-app-orange-400"
                          />
                          <button
                            onClick={() => removeConversationStarter(index)}
                            className="p-1 hover:bg-app-orange-800 rounded text-app-orange-400 hover:text-white"
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
                    <label className="block text-sm font-medium mb-2 text-white">Knowledge Files</label>
                    <p className="text-xs text-app-orange-400 mb-2">Upload files to give your GPT access to specific information</p>
                    
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-2 border border-app-orange-700 rounded-lg hover:bg-app-orange-800 flex items-center gap-2 text-white disabled:opacity-50"
                    >
                      <Upload size={16} />
                      {isUploading ? 'Uploading...' : 'Upload Files'}
                    </button>

                    {/* File List with Pagination */}
                    {files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-app-orange-400">
                            {files.length} file{files.length !== 1 ? 's' : ''} uploaded
                          </span>
                          {totalFilePages > 1 && (
                            <span className="text-xs text-app-orange-500">
                              Page {filePage} of {totalFilePages}
                            </span>
                          )}
                        </div>
                        
                        {currentFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-app-orange-800 rounded">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-app-orange-400" />
                              <span className="text-sm text-white">{file.originalName}</span>
                              <span className="text-xs text-app-orange-400">({gptService.formatFileSize(file.size)})</span>
                            </div>
                            <button
                              onClick={() => handleRemoveFile(file.id)}
                              className="p-1 hover:bg-app-orange-700 rounded text-app-orange-400 hover:text-white"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        
                        {totalFilePages > 1 && (
                          <div className="flex items-center justify-center gap-2 pt-2 border-t border-app-orange-700">
                            <button
                              onClick={() => goToFilePage(filePage - 1)}
                              disabled={filePage === 1}
                              className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700 disabled:opacity-50"
                            >
                              ← Previous
                            </button>
                            <button
                              onClick={() => goToFilePage(filePage + 1)}
                              disabled={filePage === totalFilePages}
                              className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700 disabled:opacity-50"
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Capabilities */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Capabilities</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-white">
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
                          className="rounded border-app-orange-600 bg-app-orange-900 text-app-green-500"
                        />
                        <Search size={16} className="text-app-orange-300" />
                        <span className="text-sm">Web Search</span>
                      </label>
                      <label className="flex items-center gap-2 text-white">
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
                          className="rounded border-app-orange-600 bg-app-orange-900 text-app-green-500"
                        />
                        <Palette size={16} className="text-app-orange-300" />
                        <span className="text-sm">Canvas</span>
                      </label>
                      <label className="flex items-center gap-2 text-white">
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
                          className="rounded border-app-orange-600 bg-app-orange-900 text-app-green-500"
                        />
                        <Image size={16} className="text-app-orange-300" />
                        <span className="text-sm">Image Generation</span>
                      </label>
                      <label className="flex items-center gap-2 text-white">
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
                          className="rounded border-app-orange-600 bg-app-orange-900 text-app-green-500"
                        />
                        <Code size={16} className="text-app-orange-300" />
                        <span className="text-sm">Code Interpreter</span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Actions</label>
                    <p className="text-xs text-app-orange-400 mb-3">Add API endpoints your GPT can call</p>
                    
                    <button
                      onClick={() => setIsActionsEditorOpen(true)}
                      className="w-full p-4 border-2 border-dashed border-app-orange-600 rounded-lg hover:border-app-orange-500 transition-colors flex items-center justify-center gap-2 text-app-orange-400 hover:text-white"
                    >
                      <Plus size={20} />
                      <span>Open Actions Editor</span>
                    </button>

                    {/* Action List */}
                    {actions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {actions.map((action) => (
                          <div key={action.id} className="flex items-center justify-between p-2 bg-app-orange-800 rounded">
                            <div className="flex items-center gap-2">
                              <Link size={16} className="text-app-orange-400" />
                              <span className="text-sm text-white">{action.name}</span>
                              <span className="text-xs text-app-orange-400">({action.method})</span>
                            </div>
                            <button
                              onClick={() => removeAction(action.id)}
                              className="p-1 hover:bg-app-orange-700 rounded text-app-orange-400 hover:text-white"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col">
            <div className="p-4 border-b border-app-orange-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Preview</h2>
                <div className="flex items-center gap-3">
                  {/* Tone Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-app-orange-400">Tone:</span>
                    <button
                      onClick={() => setUseLinMode(!useLinMode)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        useLinMode
                          ? 'bg-app-green-600 text-white'
                          : 'bg-app-orange-700 text-app-orange-300 hover:bg-app-orange-600'
                      }`}
                      title={useLinMode ? 'Lin mode: Respects custom tone (no Chatty normalization)' : 'Chatty mode: Uses Chatty\'s friendly tone normalization'}
                    >
                      {useLinMode ? 'Lin' : 'Chatty'}
                    </button>
                  </div>
                  {previewMessages.length > 0 && (
                    <button
                      onClick={() => setPreviewMessages([])}
                      className="text-xs text-app-orange-400 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              {/* Chat Preview */}
              <div className="flex-1 p-4 overflow-y-auto min-h-0">
                {previewMessages.length === 0 ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-app-orange-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                      {config.avatar ? (
                        <img src={config.avatar} alt="GPT Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-app-orange-600 rounded"></div>
                      )}
                    </div>
                    <p className="text-app-orange-400 text-sm">
                      {config.name || 'Your GPT'}
                    </p>
                    <p className="text-app-orange-500 text-xs mt-1">
                      {config.description || 'Preview your GPT here'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {previewMessages.map((message, index) => (
                      <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === 'user' 
                            ? 'bg-app-green-600 text-white' 
                            : 'bg-app-orange-700 text-white'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Input Preview */}
              <div className="p-4 border-t border-app-orange-800">
                <form onSubmit={handlePreviewSubmit} className="space-y-2">
                  <div className="flex items-center gap-2 p-3 border border-app-orange-700 rounded-lg bg-app-orange-900">
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
                      className="flex-1 outline-none text-sm bg-transparent text-white placeholder-app-orange-400 resize-none min-h-[20px] max-h-32"
                      rows={1}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        console.log('📎 Preview tab paperclip clicked!')
                        fileInputRef.current?.click()
                      }}
                      className="p-1 hover:bg-app-orange-700 rounded text-app-orange-400 hover:text-white"
                      title="Upload knowledge files"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="submit"
                      disabled={!previewInput.trim() || isPreviewGenerating}
                      className="p-1 hover:bg-app-orange-700 rounded disabled:opacity-50"
                    >
                      {isPreviewGenerating ? (
                        <div className="w-4 h-4 border-2 border-app-orange-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Play size={16} className="text-app-orange-400" />
                      )}
                    </button>
                  </div>
                  <div className="text-xs text-app-orange-400 text-center space-y-1">
                    <p>This is a live preview using the configured models.</p>
                    <p>Your GPT will behave based on the current configuration above.</p>
                    {config.name && (
                      <p className="text-app-green-400">✓ Configured as: {config.name}</p>
                    )}
                    {(config.conversationModel || config.creativeModel || config.codingModel) && (
                      <div className="text-xs text-app-orange-500 mt-2">
                        <p>Models: {config.conversationModel || 'default'} | {config.creativeModel || 'default'} | {config.codingModel || 'default'}</p>
                      </div>
                    )}
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

      {/* Actions Editor Modal */}
      {isActionsEditorOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-app-orange-900 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-app-orange-800">
              <div>
                <h2 className="text-xl font-semibold text-white">Edit Actions</h2>
                <p className="text-sm text-app-orange-400 mt-1">
                  Let your GPT retrieve information or take actions outside of Chatty. 
                  <a href="#" className="text-app-green-400 hover:underline ml-1">Learn more</a>
                </p>
              </div>
              <button
                onClick={() => setIsActionsEditorOpen(false)}
                className="p-2 hover:bg-app-orange-800 rounded-lg text-app-orange-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Panel - Schema Editor */}
              <div className="flex-1 p-6 border-r border-app-orange-800">
                <div className="space-y-4">
                  {/* Authentication */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Authentication</label>
                    <div className="flex items-center gap-2">
                      <select className="flex-1 p-2 border border-app-orange-700 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white">
                        <option value="none">None</option>
                        <option value="api-key">API Key</option>
                        <option value="oauth">OAuth</option>
                      </select>
                      <button className="p-2 hover:bg-app-orange-800 rounded text-app-orange-400 hover:text-white">
                        <Code size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Schema */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-white">Schema</label>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700">
                          Import from URL
                        </button>
                        <select 
                          className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700"
                          onChange={(e) => {
                            if (e.target.value === 'katana-chatty-bridge') {
                              setActionsSchema(`{
  "openapi": "3.1.0",
  "info": {
    "title": "Katana Chatty Bridge",
    "version": "1.0.1",
    "description": "Endpoints to send prompts to Chatty and receive replies back to Katana."
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
                          <option value="katana-chatty-bridge">Katana ↔ Chatty Bridge</option>
                          <option>Weather API</option>
                          <option>Database API</option>
                        </select>
                      </div>
                    </div>
                    <textarea
                      value={actionsSchema}
                      onChange={(e) => setActionsSchema(e.target.value)}
                      className="w-full h-96 p-3 border border-app-orange-700 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white font-mono text-sm resize-none"
                      placeholder="Enter your OpenAPI schema here..."
                    />
                    <div className="flex justify-end mt-2">
                      <button className="px-3 py-1 text-xs bg-app-orange-800 text-white rounded hover:bg-app-orange-700">
                        Format
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel - Available Actions */}
              <div className="w-80 p-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white">Available actions</h3>
                  
                  {/* Actions List */}
                  <div className="space-y-2">
                    <div className="p-3 border border-app-orange-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">sendMessageToChatty</span>
                        <button className="px-2 py-1 text-xs bg-app-green-600 text-white rounded hover:bg-app-green-700">
                          Test
                        </button>
                      </div>
                      <div className="text-xs text-app-orange-400 space-y-1">
                        <div>POST /chatty</div>
                        <div>Queue a prompt in the Chatty CLI terminal</div>
                      </div>
                    </div>

                    <div className="p-3 border border-app-orange-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">receiveFromChatty</span>
                        <button className="px-2 py-1 text-xs bg-app-green-600 text-white rounded hover:bg-app-green-700">
                          Test
                        </button>
                      </div>
                      <div className="text-xs text-app-orange-400 space-y-1">
                        <div>POST /katana-listen</div>
                        <div>Receive responses from Chatty CLI</div>
                      </div>
                    </div>
                  </div>

                  {/* Privacy Policy */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Privacy policy</label>
                    <input
                      type="url"
                      placeholder="https://app.example.com/privacy"
                      className="w-full p-2 border border-app-orange-700 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-orange-900 text-white placeholder-app-orange-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-app-orange-800">
              <button
                onClick={() => setIsActionsEditorOpen(false)}
                className="px-4 py-2 text-sm text-app-orange-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Parse schema and extract actions
                  try {
                    const schema = JSON.parse(actionsSchema)
                    const extractedActions: GPTAction[] = []
                    
                    if (schema.paths) {
                      Object.entries(schema.paths).forEach(([path, methods]: [string, any]) => {
                        Object.entries(methods).forEach(([method, operation]: [string, any]) => {
                          if (operation.operationId) {
                            extractedActions.push({
                              id: `action-${crypto.randomUUID()}`,
                              gptId: 'temp',
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
                className="px-4 py-2 text-sm bg-app-green-600 text-white rounded hover:bg-app-green-700"
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
          <div className="bg-app-orange-900 rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Crop Avatar</h3>
              <button
                onClick={handleCropCancel}
                className="text-app-orange-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4">
              <div className="relative w-full h-64 bg-app-orange-800 rounded-lg overflow-hidden">
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
              <label className="text-sm text-app-orange-400">Zoom:</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-app-orange-400">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCropCancel}
                className="px-4 py-2 text-sm bg-app-orange-700 text-white rounded hover:bg-app-orange-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCropComplete}
                disabled={isUploadingAvatar}
                className="px-4 py-2 text-sm bg-app-green-600 text-white rounded hover:bg-app-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

export default GPTCreator
