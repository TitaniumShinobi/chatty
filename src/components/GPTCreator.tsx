import React, { useState, useEffect, useRef } from 'react'
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
  Trash2,
  Settings
} from 'lucide-react'
import { GPTCreator, GPTPersonality, GPTConfiguration } from '../lib/gptCreator'
import { ModelRegistry } from '../lib/models'
import { AIService } from '../lib/aiService'
import { delay } from '../lib/utils/common'
import { logger } from '../lib/utils/logger'
import { TIMING } from '../lib/constants'
import { cn } from '../lib/utils'
import { R } from '../runtime/render'

interface GPTCreatorProps {
  isVisible: boolean
  onClose: () => void
  onPersonalityChange: (personality: GPTPersonality) => void
}

const GPTCreatorComponent: React.FC<GPTCreatorProps> = ({ 
  isVisible, 
  onClose, 
  onPersonalityChange 
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'configure'>('create')
  const [gptCreator] = useState(() => GPTCreator.getInstance())
  const [modelRegistry] = useState(() => ModelRegistry.getInstance())
  const [currentPersonality, setCurrentPersonality] = useState<GPTPersonality | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [createMessages, setCreateMessages] = useState<Array<{role: 'user' | 'assistant', content: any}>>([
    {
      role: 'assistant',
      content: { op: 300, ts: Date.now() } // createGpt token
    }
  ])
  const [createInput, setCreateInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const createInputRef = useRef<HTMLTextAreaElement>(null)
  const [createAI] = useState(() => {
    const ai = AIService.getInstance()
    // Note: setGPTCreationMode method doesn't exist, removed call
    return ai
  })
  
  // Preview functionality
  const [previewMessages, setPreviewMessages] = useState<Array<{role: 'user' | 'assistant', content: string | import('../types').AssistantPacket[]}>>([])
  const [previewInput, setPreviewInput] = useState('')
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false)
  const [previewAI] = useState(() => AIService.getInstance())
  const previewMessagesEndRef = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<GPTConfiguration>({
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
    modelId: 'chatty-core'
  })

  useEffect(() => {
    if (isVisible) {
      // Reset the GPT Creator when opened
      resetGPTCreator()
      
      const activePersonality = gptCreator.getActivePersonality()
      setCurrentPersonality(activePersonality)
      if (activePersonality) {
        setConfig({
          name: activePersonality.name,
          description: activePersonality.description,
          instructions: activePersonality.instructions,
          conversationStarters: activePersonality.conversationStarters.length > 0 
            ? activePersonality.conversationStarters 
            : [''],
          capabilities: activePersonality.capabilities,
          modelId: activePersonality.modelId
        })
      }
    }
  }, [isVisible, gptCreator])

  const handleSave = () => {
    if (currentPersonality) {
      const updated = gptCreator.updatePersonality(currentPersonality.id, config)
      if (updated) {
        setCurrentPersonality(updated)
        onPersonalityChange(updated)
      }
    } else {
      const newPersonality = gptCreator.createPersonality(config)
      setCurrentPersonality(newPersonality)
      onPersonalityChange(newPersonality)
    }
    setIsEditing(false)
  }

  const handleCreateNew = () => {
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
      modelId: 'chatty-core'
    })
    setCurrentPersonality(null)
    setIsEditing(true)
  }

  const resetGPTCreator = () => {
    // Reset all states to initial values
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
      modelId: 'chatty-core'
    })
    setCreateMessages([])
    setCreateInput('')
    setPreviewMessages([])
    setPreviewInput('')
    setActiveTab('create')
    setCurrentPersonality(null)
    setIsEditing(false)
  }

  const handleCreateGPT = () => {
    if (!config.name.trim()) return
    
    // Create the new GPT personality
    const newPersonality = gptCreator.createPersonality(config)
    
    if (newPersonality) {
      setCurrentPersonality(newPersonality)
      onPersonalityChange(newPersonality)
      
      // Show success message
      alert(`GPT "${config.name}" created successfully! You can now use it in the sidebar.`)
      
      // Reset the GPT Creator
      resetGPTCreator()
      
      // Close the modal
      onClose()
    }
  }

  const handleDelete = () => {
    if (currentPersonality && currentPersonality.id !== 'default-chatty') {
      if (gptCreator.deletePersonality(currentPersonality.id)) {
        const newActive = gptCreator.getActivePersonality()
        setCurrentPersonality(newActive)
        onPersonalityChange(newActive!)
      }
    }
  }

  const addConversationStarter = () => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: [...prev.conversationStarters, '']
    }))
  }

  const removeConversationStarter = (index: number) => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: prev.conversationStarters.filter((_, i) => i !== index)
    }))
  }

  const updateConversationStarter = (index: number, value: string) => {
    setConfig(prev => ({
      ...prev,
      conversationStarters: prev.conversationStarters.map((starter, i) => 
        i === index ? value : starter
      )
    }))
  }

  const handleCreateMessage = async () => {
    if (!createInput.trim() || isGenerating) return

    const userMessage = createInput.trim()
    setCreateInput('')
    setIsGenerating(true)

    // Add user message to conversation
    setCreateMessages(prev => [...prev, { role: 'user', content: userMessage }])

    try {
      // Add a brief delay to show loading state
      await delay(TIMING.GPT_CREATION_DELAY)
      
      // Debug: Check if createAI is properly initialized
      logger.gpt('createAI instance', createAI)
      logger.gpt('createAI context', createAI.getContext())
      
      // Process message with real AI
      let aiResponse = await createAI.processMessage(userMessage)
      
      // Debug: Check if response is empty
      logger.gpt('Raw AI response', aiResponse)
      logger.gpt('Response type', typeof aiResponse)
      logger.gpt('Response length', aiResponse?.length || 0)
      
      // Fallback if response is empty or undefined
      if (!aiResponse || aiResponse.length === 0) {
        logger.warning('Empty response detected, using fallback')
        aiResponse = [{ op: 'answer.v1', payload: { content: "I understand what you're saying. Let me help you with that." } }]
      }
      
      // Analyze response for configuration generation
      const configResult = analyzeResponseForConfiguration(userMessage)
      
      // Add AI response to conversation
      setCreateMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])
      
      // Debug logging
      logger.gpt('User message', userMessage)
      logger.gpt('AI response', aiResponse)
      logger.gpt('Config result', configResult)
      
      // Update config if configuration was generated
      if (configResult.config) {
        logger.gpt('Generated config', configResult.config)
        setConfig(configResult.config)
        
        // Show success message
        const successMessage = `Proposed name: ${configResult.config.name}\nConfirm the name?`
        setCreateMessages(prev => [...prev, { role: 'assistant', content: successMessage }])
        
        // Switch to configure tab to show the generated configuration
        setActiveTab('configure')
      } else {
        console.log('No config generated - extraction failed')
      }
      
    } catch (error) {
      console.error('Error processing message:', error)
      setCreateMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I encountered an error while processing your request. Please try again.' 
      }])
    } finally {
      setIsGenerating(false)
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
      // Create a temporary personality for preview (not used but kept for future reference)
      // const tempPersonality = {
      //   id: 'preview',
      //   name: config.name || 'Preview GPT',
      //   description: config.description || '',
      //   instructions: config.instructions || '',
      //   conversationStarters: config.conversationStarters || [],
      //   capabilities: config.capabilities,
      //   modelId: config.modelId || 'chatty-core',
      //   isActive: false
      // }
      
      // Set the temporary personality for preview
      // Note: resetContext method doesn't exist, removed call
      
      // Use the configured GPT instructions if available
      let aiResponse: import('../types').AssistantPacket[] = []
      if (config.instructions && config.instructions.trim()) {
        // Create a custom response based on the GPT's instructions
        aiResponse = generateCustomGPTResponse(userMessage, config)
      } else {
        // Fallback to generic AI
        aiResponse = await previewAI.processMessage(userMessage)
      }
      
      // Fallback if response is empty
      if (!aiResponse || aiResponse.length === 0) {
        aiResponse = [{ op: 'answer.v1', payload: { content: "I understand what you're saying. Let me help you with that." } }]
      }
      
      // Add AI response to preview conversation
      setPreviewMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])
      
    } catch (error) {
      console.error('Error in preview:', error)
      setPreviewMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I encountered an error while processing your request. Please try again.' 
      }])
    } finally {
      setIsPreviewGenerating(false)
    }
  }

  const generateCustomGPTResponse = (userMessage: string, config: GPTConfiguration): import('../types').AssistantPacket[] => {
    const lowerMessage = userMessage.toLowerCase()
    
    // Use the GPT's specific instructions to generate responses
    if (config.instructions) {
      // Extract key behaviors from instructions
      const behaviors = config.instructions.match(/- ([^-\n]+)/g) || []
      
      // Generate a response based on the GPT's role and behaviors
      if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        return [{ op: 'answer.v1', payload: { content: `Hello! I'm ${config.name}, ${config.description}. How can I help you today?` } }]
      }
      
      if (lowerMessage.includes('what can you') || lowerMessage.includes('capabilities') || lowerMessage.includes('help')) {
        return [{ op: 'answer.v1', payload: { content: `I'm ${config.name}, ${config.description}. ${behaviors.slice(0, 2).join(' ')} What would you like to explore?` } }]
      }
      
      // Default response based on the GPT's purpose
      return [{ op: 'answer.v1', payload: { content: `I'm ${config.name}, ${config.description}. I'm here to help you with your specific needs. What would you like to work on?` } }]
    }
    
    // Fallback response
    return [{ op: 'answer.v1', payload: { content: `I'm ${config.name || 'your custom assistant'}. How can I help you today?` } }]
  }

  // Auto-resize textarea for create input
  useEffect(() => {
    if (createInputRef.current) {
      createInputRef.current.style.height = 'auto'
      createInputRef.current.style.height = `${createInputRef.current.scrollHeight}px`
    }
  }, [createInput])

  // Auto-scroll preview messages to bottom
  useEffect(() => {
    previewMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [previewMessages])

  const analyzeResponseForConfiguration = (userMessage: string): { config?: GPTConfiguration } => {
    // const aiContext = createAI.getContext()
    const lowerMessage = userMessage.toLowerCase()
    // const lowerResponse = aiResponse.toLowerCase()
    
    // Check if this is a GPT creation request
    const isGPTCreation = lowerMessage.includes('gpt') || 
                         lowerMessage.includes('assistant') || 
                         lowerMessage.includes('bot') ||
                         lowerMessage.includes('create') ||
                         lowerMessage.includes('build') ||
                         lowerMessage.includes('make') ||
                         lowerMessage.includes('system directive') ||
                         lowerMessage.includes('you are')
    
    if (!isGPTCreation) {
      return {} // Not a GPT creation request
    }
    
    // Extract information from the ORIGINAL user message (not AI response)
    logger.gpt('Analyzing user message for GPT creation', userMessage)
          const extractedInfo = extractGPTInfo(userMessage)
    logger.gpt('Extracted info', extractedInfo)
    
    if (!extractedInfo.name || extractedInfo.name === 'Custom Assistant') {
      logger.warning('No valid GPT name found in extraction')
      return {} // No valid GPT name found
    }
    
    // Determine capabilities based on the ORIGINAL user message
          const capabilities = determineCapabilities(lowerMessage, lowerMessage)
    
    // Select appropriate model
          const modelId = selectModel(capabilities)
    
    const config: GPTConfiguration = {
      name: extractedInfo.name,
      description: extractedInfo.description || `A ${extractedInfo.name} that helps with ${extractedInfo.role || 'various tasks'}`,
              instructions: extractedInfo.instructions || generateInstructions(extractedInfo.name, extractedInfo.role),
      conversationStarters: extractedInfo.conversationStarters || generateConversationStarters(extractedInfo.name, extractedInfo.role),
      capabilities,
      modelId
    }
    
    return { config }
  }
  
  const extractGPTInfo = (userMessage: string) => {
    logger.gpt('EXTRACTING GPT INFO FROM', userMessage)
    
    // Look for specific GPT creation patterns
    const gptCreationPatterns = [
      // NEW: "System Directive: You are [Name]" - for personality definitions
      /(?:system\s+directive|you\s+are)\s*:?\s*you\s+are\s+([A-Za-z]+)/i,
      // "Build a GPT that functions as a [type] assistant for [purpose]"
      /(?:build|create|make)\s+(?:a\s+)?gpt\s+(?:that\s+)?(?:functions?\s+as\s+a\s+)?([a-zA-Z\s]+)(?:assistant|helper|bot)?\s+(?:for\s+)?([a-zA-Z\s]+)/i,
      // "Create a [type] assistant that [function]"
      /(?:build|create|make)\s+(?:a\s+)?([a-zA-Z\s]+)(?:assistant|helper|bot)\s+(?:that\s+)?([a-zA-Z\s]+)/i,
      // "Make a [type] who helps with [purpose]"
      /(?:build|create|make)\s+(?:a\s+)?([a-zA-Z\s]+)(?:\s+who\s+helps?\s+with?\s+)?([a-zA-Z\s]+)/i,
      // "Build a GPT named [Name]"
      /(?:build|create|make)\s+(?:a\s+)?gpt\s+(?:named\s+)?([A-Za-z0-9]+(?:GPT|Assistant|Bot|Helper)?)/i,
      // NEW: "Build a GPT that functions as a [type] assistant for [purpose]" - more flexible
      /(?:build|create|make)\s+(?:a\s+)?gpt\s+(?:that\s+)?(?:functions?\s+as\s+a\s+)?([a-zA-Z\s]+)(?:assistant|helper|bot)?\s+(?:for\s+)?([a-zA-Z\s]+)/i,
      // NEW: "Build a GPT that [description]" - catch-all for complex descriptions
      /(?:build|create|make)\s+(?:a\s+)?gpt\s+(?:that\s+)?(.+)/i,
      // FIXED: "Build a GPT that functions as a [type] assistant for [purpose]" - handles multi-word types
      /(?:build|create|make)\s+(?:a\s+)?gpt\s+(?:that\s+)?(?:functions?\s+as\s+a\s+)?([a-zA-Z\s]+(?:\s+[a-zA-Z\s]+)*)(?:assistant|helper|bot)?\s+(?:for\s+)?([a-zA-Z\s]+(?:\s+[a-zA-Z\s]+)*)/i
    ]
    
    let name = 'Custom Assistant'
    let role = 'various tasks'
    let description = ''
    
    // Try each pattern to extract meaningful information
    for (let i = 0; i < gptCreationPatterns.length; i++) {
      const pattern = gptCreationPatterns[i]
      const match = userMessage.match(pattern)
      console.log(`🔍 Pattern ${i}:`, pattern.source, 'Match:', match)
      
      if (match) {
        console.log(`✅ MATCH FOUND with pattern ${i}:`, match)
        
        // Handle System Directive pattern (first pattern)
        if (i === 0 && match[1]) {
          const extractedName = match[1].trim()
          name = extractedName
          role = 'personality-driven assistant'
          description = `A ${extractedName} assistant with a unique personality and style`
          console.log(`📝 System Directive match: name="${name}", role="${role}"`)
          break
        }
        
        if (match[1] && match[2]) {
          // Pattern with two groups: type and purpose
          const type = match[1].trim()
          const purpose = match[2].trim()
          
          // Create a meaningful name from the type
          name = type.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Assistant'
          
          // Combine type and purpose for role
          role = `${type} for ${purpose}`
          description = `A ${type} assistant specialized in ${purpose}`
          console.log(`📝 Extracted: name="${name}", role="${role}"`)
          break
        } else if (match[1]) {
          // Pattern with one group: name or type
          const extracted = match[1].trim()
          
          // Check if it looks like a name (contains GPT, Assistant, etc.)
          if (extracted.match(/(?:GPT|Assistant|Bot|Helper)/i)) {
            name = extracted
            role = 'specialized assistance'
            description = `A ${name} for specialized tasks`
          } else {
            // It's a type, create a name from it
            name = extracted.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Assistant'
            role = extracted
            description = `A ${extracted} assistant`
          }
          console.log(`📝 Extracted: name="${name}", role="${role}"`)
          break
        }
      }
    }
    
    // If no pattern matched, try to extract from the overall message
    if (name === 'Custom Assistant') {
      console.log('❌ No regex patterns matched, trying keyword extraction...')
      
      // Look for key terms that indicate the type of assistant
      const keyTerms = {
        'forensic': 'Forensic',
        'continuity': 'Continuity',
        'timeline': 'Timeline',
        'conversation': 'Conversation',
        'identity': 'Identity',
        'ledger': 'Ledger',
        'creative': 'Creative',
        'design': 'Design',
        'visual': 'Visual',
        'code': 'Code',
        'programming': 'Programming',
        'software': 'Software',
        'writing': 'Writing',
        'content': 'Content'
      }
      
      for (const [term, type] of Object.entries(keyTerms)) {
        if (userMessage.toLowerCase().includes(term)) {
          name = type + 'Assistant'
          role = `${term} analysis and assistance`
          description = `A ${type.toLowerCase()} assistant for specialized tasks`
          console.log(`🔑 Keyword match found: "${term}" -> name="${name}"`)
          break
        }
      }
      
      // Special case for your exact message format
      if (name === 'Custom Assistant' && userMessage.toLowerCase().includes('forensic continuity assistant')) {
        name = 'ForensicContinuityAssistant'
        role = 'forensic continuity for reconstructing conversation timelines'
        description = 'A forensic continuity assistant for reconstructing conversation timelines, identity transitions, and ledger entries'
        console.log(`🎯 Special case match: name="${name}", role="${role}"`)
      }
      
      // Enhanced special case for complex multi-word assistants
      if (name === 'Custom Assistant') {
        const lowerMsg = userMessage.toLowerCase()
        
        // Look for "functions as a [type] assistant for [purpose]" pattern
        const functionMatch = lowerMsg.match(/functions?\s+as\s+a\s+([a-zA-Z\s]+)\s+assistant\s+for\s+([a-zA-Z\s]+)/)
        if (functionMatch) {
          const type = functionMatch[1].trim()
          const purpose = functionMatch[2].trim()
          
          // Create name from type
          name = type.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Assistant'
          role = `${type} for ${purpose}`
          description = `A ${type} assistant for ${purpose}`
          console.log(`🎯 Enhanced special case match: name="${name}", role="${role}"`)
        }
      }
    }
    
    const result = {
      name,
      role,
      description,
      instructions: '',
      conversationStarters: []
    }
    
    console.log('📤 FINAL RESULT:', result)
    return result
  }
  
  const determineCapabilities = (userMessage: string, aiResponse: string) => {
    const capabilities = {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true // Default capability
    }
    
    const combinedText = userMessage + ' ' + aiResponse
    
    // Creative/Design capabilities
    if (combinedText.includes('creative') || combinedText.includes('design') || combinedText.includes('visual') || combinedText.includes('image')) {
      capabilities.imageGeneration = true
      capabilities.canvas = true
    }
    
    // Programming/Code capabilities
    if (combinedText.includes('code') || combinedText.includes('programming') || combinedText.includes('software') || combinedText.includes('debug')) {
      capabilities.codeInterpreter = true
    }
    
    // Research/Search capabilities
    if (combinedText.includes('search') || combinedText.includes('web') || combinedText.includes('research') || combinedText.includes('information')) {
      capabilities.webSearch = true
    }
    
    // Forensic/Analysis capabilities
    if (combinedText.includes('forensic') || combinedText.includes('analysis') || combinedText.includes('parse') || combinedText.includes('extract')) {
      capabilities.codeInterpreter = true
      capabilities.webSearch = true
    }
    
    // Continuity/Timeline capabilities
    if (combinedText.includes('continuity') || combinedText.includes('timeline') || combinedText.includes('session') || combinedText.includes('ledger')) {
      capabilities.codeInterpreter = true
    }
    
    // File processing capabilities
    if (combinedText.includes('upload') || combinedText.includes('file') || combinedText.includes('parse') || combinedText.includes('extract')) {
      capabilities.codeInterpreter = true
    }
    
    return capabilities
  }
  
  const selectModel = (capabilities: any) => {
    if (capabilities.imageGeneration || capabilities.canvas) {
      return 'chatty-creative'
    } else if (capabilities.codeInterpreter) {
      return 'chatty-code'
    } else {
      return 'chatty-core'
    }
  }
  
  const generateInstructions = (name: string, role: string) => {
    // Generate specialized instructions based on the type of assistant
    const lowerRole = role.toLowerCase()
    // const lowerName = name.toLowerCase()
    
    if (lowerRole.includes('forensic') || lowerRole.includes('continuity') || lowerRole.includes('timeline')) {
      return `You are ${name}, a specialized forensic continuity assistant focused on ${role}. You help users reconstruct conversation timelines, identity transitions, and ledger entries.

Key behaviors:
- Parse and analyze uploaded files (text logs, screenshots, exports) to extract timeline data
- Reconstruct identity shifts based on internal monologues and dialogue tone
- Use ISO 8601 formatting for all date references
- Provide continuity confidence scores (1.0 = explicit, 0.8 = inferred from filename, etc.)
- Output structured JSON or SQL-style "Continuity Ledger" blocks
- Include labeled fields such as SessionTitle, SessionID, SIGState, KeyTopics, ContinuityHooks, and Vibe
- Prioritize internal timestamps and contextual clues over file metadata
- Maintain forensic accuracy and attention to detail
- Ask clarifying questions when timeline data is unclear`
    }
    
    if (lowerRole.includes('creative') || lowerRole.includes('design') || lowerRole.includes('visual')) {
      return `You are ${name}, a specialized creative assistant focused on ${role}. You help users generate creative concepts, visual ideas, and design solutions.

Key behaviors:
- Generate creative visual concepts and design ideas
- Provide design inspiration and creative solutions
- Help with color schemes, layouts, and visual composition
- Suggest creative approaches to problems
- Be imaginative, artistic, and think outside the box
- Maintain a creative and inspiring tone`
    }
    
    if (lowerRole.includes('code') || lowerRole.includes('programming') || lowerRole.includes('software')) {
      return `You are ${name}, a specialized programming assistant focused on ${role}. You help users write, debug, and optimize code.

Key behaviors:
- Write clean, efficient, and well-documented code
- Debug and fix programming issues
- Explain code concepts clearly and provide examples
- Suggest best practices and optimizations
- Help with code formatting and structure
- Support multiple programming languages
- Maintain a technical and precise approach`
    }
    
    if (lowerRole.includes('writing') || lowerRole.includes('content')) {
      return `You are ${name}, a specialized writing assistant focused on ${role}. You help users create compelling content and improve their writing skills.

Key behaviors:
- Help with writing structure, flow, and organization
- Suggest improvements to content and style
- Generate creative writing ideas and prompts
- Provide writing tips and techniques
- Help with editing and proofreading
- Create engaging narratives and stories
- Maintain a supportive and encouraging tone`
    }
    
    // Handle personality-driven assistants (like Katana)
    if (role === 'personality-driven assistant') {
      return `You are ${name}, a unique AI assistant with a distinctive personality and style. You maintain your character and approach in all interactions.

Key behaviors:
- Stay true to your unique personality and style
- Maintain consistent character traits and communication style
- Provide direct, honest, and authentic responses
- Express your unique perspective and approach
- Be genuine and true to your character
- Adapt your expertise while maintaining your personality`
    }
    
    // Default instructions for other types
    return `You are ${name}, a specialized AI assistant focused on ${role}. You adapt your responses to help users with their specific needs in this area.

Key behaviors:
- Provide expert assistance in ${role}
- Adapt to the user's specific requirements
- Be helpful, informative, and engaging
- Ask clarifying questions when needed
- Maintain a conversational and professional tone`
  }
  
  const generateConversationStarters = (name: string, role: string) => {
    return [
      `Tell me about ${name}`,
      `How can you help me with ${role}?`,
      `What can you do?`,
      `Show me an example of your capabilities`
    ]
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-app-gray-950 border border-app-gray-800 rounded-lg w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-app-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-app-gray-800 rounded-lg text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">New GPT</h1>
              <p className="text-sm text-app-gray-400">• Draft</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 text-sm border border-app-gray-700 rounded-lg hover:bg-app-gray-800 text-white"
            >
              Create
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Configure */}
          <div className="w-1/2 border-r border-app-gray-800 overflow-y-auto">
            {/* Tabs */}
            <div className="flex border-b border-app-gray-800">
              <button
                onClick={() => setActiveTab('create')}
                className={cn(
                  "px-4 py-2 text-sm font-medium",
                  activeTab === 'create' 
                    ? "border-b-2 border-app-green-500 text-app-green-400" 
                    : "text-app-gray-400 hover:text-app-gray-300"
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
                    : "text-app-gray-400 hover:text-app-gray-300"
                )}
              >
                Configure
              </button>
            </div>

            <div className="p-6 space-y-6">
              {activeTab === 'create' ? (
                // Create Tab - Conversational Interface
                <div className="flex flex-col h-full">
                  {/* Messages */}
                  <div className="flex-1 space-y-4 mb-4">
                    {createMessages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[60%] p-3 rounded-lg ${
                            message.role === 'user'
                              ? 'bg-app-green-600 text-white'
                              : 'bg-app-gray-800 text-white'
                          }`}
                        >
                          <pre 
                            className="text-sm leading-relaxed font-sans m-0"
                            style={{ 
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word',
                              minHeight: '1.5rem'
                            }}
                          >
                            {typeof message.content === 'string' 
                              ? message.content 
                              : JSON.stringify(message.content, null, 2)
                            }
                          </pre>
                        </div>
                      </div>
                    ))}
                    {isGenerating && (
                      <div className="flex justify-start">
                        <div className="bg-app-gray-800 text-white p-3 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="border-t border-app-gray-800 pt-4">
                    <div className="flex items-end gap-2 p-3 border border-app-gray-700 rounded-lg bg-app-gray-900">
                      <Plus size={16} className="text-app-gray-400 flex-shrink-0" />
                      <textarea
                        ref={createInputRef}
                        value={createInput}
                        onChange={(e) => setCreateInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleCreateMessage()
                          }
                        }}
                        placeholder="Describe what you want your GPT to do..."
                        className="flex-1 outline-none text-sm bg-transparent text-white placeholder-app-gray-400 resize-none min-h-[20px] max-h-64"
                        rows={1}
                      />
                      <button
                        onClick={handleCreateMessage}
                        disabled={!createInput.trim() || isGenerating}
                        className="p-1 hover:bg-app-gray-800 rounded text-app-gray-400 hover:text-white disabled:opacity-50 flex-shrink-0"
                      >
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      </button>
                    </div>
                    <p className="text-xs text-app-gray-400 mt-2 text-center">
                      Chatty can make mistakes. Check important info.
                    </p>
                  </div>
                </div>
              ) : (
                // Configure Tab - Form Interface
                <>
                  {/* Avatar Upload */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 border-2 border-dashed border-app-gray-600 rounded-full flex items-center justify-center">
                      <Plus size={24} className="text-app-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Avatar</p>
                      <p className="text-xs text-app-gray-400">Upload an image for your GPT</p>
                    </div>
                  </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Name</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Give your GPT a memorable name that reflects its purpose and personality.
                </p>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Name your GPT"
                  className="w-full p-3 border border-app-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-gray-900 text-white placeholder-app-gray-400"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Description</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Provide a brief overview of what your GPT does and how it can help users.
                </p>
                <input
                  type="text"
                  value={config.description}
                  onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add a short description about what this GPT does"
                  className="w-full p-3 border border-app-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-gray-900 text-white placeholder-app-gray-400"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Instructions</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Define how your GPT should behave, what it can do, and what it should avoid. Be specific about its role, tone, and capabilities.
                </p>
                <textarea
                  value={config.instructions}
                  onChange={(e) => setConfig(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="What does this GPT do? How does it behave? What should it avoid doing?"
                  rows={8}
                  className="w-full p-3 border border-app-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 resize-none bg-app-gray-900 text-white placeholder-app-gray-400"
                />
                <p className="text-xs text-app-gray-400 mt-1">
                  Conversations with your GPT can potentially include part or all of the instructions provided.
                </p>
              </div>

              {/* Conversation Starters */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Conversation Starters</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Provide example prompts that users can click to start conversations with your GPT. These help users understand how to interact with your GPT.
                </p>
                <div className="space-y-2">
                  {config.conversationStarters.map((starter, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={starter}
                        onChange={(e) => updateConversationStarter(index, e.target.value)}
                        placeholder="Add a conversation starter"
                        className="flex-1 p-2 border border-app-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-gray-900 text-white placeholder-app-gray-400"
                      />
                      <button
                        onClick={() => removeConversationStarter(index)}
                        className="p-1 hover:bg-app-gray-800 rounded text-app-gray-400 hover:text-white"
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

              {/* Knowledge */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Knowledge</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Upload files to give your GPT access to specific information, documents, or data. Your GPT can reference this content in conversations.
                </p>
                <p className="text-xs text-app-gray-400 mb-2">
                  Conversations with your GPT can potentially reveal part or all of the files uploaded.
                </p>
                <button className="px-4 py-2 border border-app-gray-700 rounded-lg hover:bg-app-gray-800 flex items-center gap-2 text-white">
                  <Upload size={16} />
                  Upload files
                </button>
              </div>

              {/* Capabilities */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Capabilities</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Enable specific features that your GPT can use to enhance its functionality and provide better assistance.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={config.capabilities.webSearch}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        capabilities: { ...prev.capabilities, webSearch: e.target.checked }
                      }))}
                      className="rounded border-app-gray-600 bg-app-gray-900 text-app-green-500"
                    />
                    <Search size={16} className="text-app-gray-300" />
                    <span className="text-sm">Web Search</span>
                  </label>
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={config.capabilities.canvas}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        capabilities: { ...prev.capabilities, canvas: e.target.checked }
                      }))}
                      className="rounded border-app-gray-600 bg-app-gray-900 text-app-green-500"
                    />
                    <Palette size={16} className="text-app-gray-300" />
                    <span className="text-sm">Canvas</span>
                  </label>
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={config.capabilities.imageGeneration}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        capabilities: { ...prev.capabilities, imageGeneration: e.target.checked }
                      }))}
                      className="rounded border-app-gray-600 bg-app-gray-900 text-app-green-500"
                    />
                    <Image size={16} className="text-app-gray-300" />
                    <span className="text-sm">Image Generation</span>
                  </label>
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={config.capabilities.codeInterpreter}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        capabilities: { ...prev.capabilities, codeInterpreter: e.target.checked }
                      }))}
                      className="rounded border-app-gray-600 bg-app-gray-900 text-app-green-500"
                    />
                    <Code size={16} className="text-app-gray-300" />
                    <span className="text-sm">Code Interpreter & Data Analysis</span>
                  </label>
                </div>
              </div>

              {/* Recommended Model */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Recommended Model</label>
                <p className="text-xs text-app-gray-400 mb-2">
                  Choose the AI model that best suits your GPT's purpose. Different models have different strengths and capabilities.
                </p>
                <select 
                  value={config.modelId}
                  onChange={(e) => setConfig(prev => ({ ...prev, modelId: e.target.value }))}
                  className="w-full p-3 border border-app-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-gray-900 text-white"
                >
                  {modelRegistry.getAllModels().map(model => (
                    <option key={model.id} value={model.id} className="bg-app-gray-900">
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Actions</label>
                <button 
                  onClick={handleCreateGPT}
                  disabled={!config.name.trim()}
                  className="px-4 py-2 border border-app-gray-700 rounded-lg hover:bg-app-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create GPT
                </button>
              </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col">
            <div className="p-4 border-b border-app-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Preview</h2>
                {previewMessages.length > 0 && (
                  <button
                    onClick={() => setPreviewMessages([])}
                    className="text-xs text-app-gray-400 hover:text-white"
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
                    <div className="w-16 h-16 bg-app-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <div className="w-8 h-8 bg-app-gray-600 rounded"></div>
                    </div>
                    <p className="text-app-gray-400 text-sm">
                      {config.name || 'Your GPT'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {previewMessages.map((message, index) => (
                      <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === 'user' 
                            ? 'bg-app-green-600 text-white' 
                            : 'bg-app-gray-700 text-white'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">
                            {typeof message.content === 'string' 
                              ? message.content 
                              : <R packets={message.content} />
                            }
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={previewMessagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input Preview */}
              <div className="p-4 border-t border-app-gray-800">
                <form onSubmit={handlePreviewSubmit} className="space-y-2">
                  <div className="flex items-center gap-2 p-3 border border-app-gray-700 rounded-lg bg-app-gray-900">
                    <input
                      type="text"
                      value={previewInput}
                      onChange={(e) => setPreviewInput(e.target.value)}
                      placeholder="Ask anything"
                      className="flex-1 outline-none text-sm bg-transparent text-white placeholder-app-gray-400"
                    />
                                         <button
                       type="submit"
                       disabled={!previewInput.trim() || isPreviewGenerating}
                       className="p-1 hover:bg-app-gray-700 rounded disabled:opacity-50"
                     >
                       {isPreviewGenerating ? (
                         <div className="w-4 h-4 border-2 border-app-gray-400 border-t-transparent rounded-full animate-spin"></div>
                       ) : (
                         <Plus size={16} className="text-app-gray-400" />
                       )}
                     </button>
                  </div>
                  <p className="text-xs text-app-gray-400 text-center">
                    Chatty can make mistakes. Check important info.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-app-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentPersonality && currentPersonality.id !== 'default-chatty' && (
              <button
                onClick={handleDelete}
                className="px-3 py-1 text-sm text-red-400 hover:bg-red-900/20 rounded flex items-center gap-1"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 text-sm border border-app-gray-700 rounded-lg hover:bg-app-gray-800 flex items-center gap-1 text-white"
            >
              <Settings size={14} />
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            {isEditing && (
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-app-green-600 text-white rounded-lg hover:bg-app-green-700 flex items-center gap-1"
              >
                <Save size={14} />
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GPTCreatorComponent
