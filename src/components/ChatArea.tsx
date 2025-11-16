import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, X, Brain, Database, AlertTriangle, Activity } from 'lucide-react'
// import { ChatAreaProps } from '../types'
import MessageComponent from './Message.tsx'
// import { cn } from '../lib/utils'
import ActionMenu from './ActionMenu'
// Removed unused imports - now using UnifiedFileParser
import { emitOpcode } from '../lib/emit'
import { lexicon as lex } from '../data/lexicon'
import type { AssistantPacket } from '../types'
import { useBrowserThread } from '../hooks/useBrowserThread'
import { DriftHistoryModal } from './DriftHistoryModal'

const pktFromString = (s: string): AssistantPacket => ({ op: 'answer.v1', payload: { content: s } })

const ChatArea: React.FC<any> = ({
  conversation,
  activeGPTName: _activeGPTName,
  onSendMessage,
  onNewConversation: _onNewConversation,
  onToggleSidebar: _onToggleSidebar
}) => {
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [parsingProgress, setParsingProgress] = useState<{ [key: string]: number }>({})
  const [isParsing, setIsParsing] = useState(false)
  
  // Memory system integration
  const [constructId] = useState<string>('default-construct')
  const [memoryStats, setMemoryStats] = useState<{
    stmCount: number;
    ltmCount: number;
    driftDetected: boolean;
  }>({ stmCount: 0, ltmCount: 0, driftDetected: false })
  
  // Drift history modal state
  const [showDriftHistory, setShowDriftHistory] = useState(false)
  
  // Initialize thread management
  const thread = useBrowserThread({
    constructId,
    autoAcquireLease: true,
    enableDriftDetection: true
  })

  // Safety check for thread initialization
  if (!thread) {
    console.warn('ChatArea: Thread not initialized');
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">Initializing...</p>
        </div>
      </div>
    );
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef<number>(0)

  // Auto-scroll to bottom when NEW messages arrive (not on every update)
  useEffect(() => {
    const currentMessageCount = conversation?.messages?.length ?? 0
    const previousMessageCount = previousMessageCountRef.current
    
    // Only scroll if:
    // 1. Message count increased (new message added)
    // 2. User is already near the bottom (within 200px) or it's the first render
    const container = messagesContainerRef.current
    if (container && currentMessageCount > previousMessageCount) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
      const isFirstRender = previousMessageCount === 0
      
      if (isNearBottom || isFirstRender) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 0)
      }
    }
    
    previousMessageCountRef.current = currentMessageCount
  }, [conversation?.messages])

  // Monitor memory stats
  useEffect(() => {
    if (!thread || !thread.isReady) return
    
    const updateMemoryStats = async () => {
      try {
        const stmStats = thread.getSTMStats()
        const ltmStats = await thread.getLTMStats()
        
        setMemoryStats({
          stmCount: stmStats?.messageCount || 0,
          ltmCount: ltmStats?.totalEntries || 0,
          driftDetected: thread.threadState.driftDetected
        })
        
        // Thread ID is managed by the browser thread hook
      } catch (error) {
        console.error('Failed to update memory stats:', error)
      }
    }

    updateMemoryStats()
    const interval = setInterval(updateMemoryStats, 5000) // Update every 5 seconds
    
    return () => clearInterval(interval)
  }, [thread?.isReady, thread?.threadState.threadId]) // Only restart when readiness or thread ID changes

  // Stop typing indicator when new AI message arrives
  useEffect(() => {
    if (conversation?.messages.length && conversation.messages[conversation.messages.length - 1].role === 'assistant') {
      setIsTyping(false)
      if (typingTimeout) {
        clearTimeout(typingTimeout)
        setTypingTimeout(null)
      }
    }
  }, [conversation?.messages, typingTimeout])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      const maxHeight = 128 // 32 * 4px (equivalent to max-h-32)
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      
      if (scrollHeight <= maxHeight) {
        textareaRef.current.style.height = `${scrollHeight}px`
        textareaRef.current.style.overflowY = 'hidden'
      } else {
        textareaRef.current.style.height = `${maxHeight}px`
        textareaRef.current.style.overflowY = 'hidden'
      }
    }
  }, [inputValue])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputValue.trim() || !conversation) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
      files: attachedFiles,
      // Add memory provenance
      constructId,
      threadId: thread.threadState.threadId,
      memorySource: 'STM',
      // Pass memory context to AI service
      _memoryContext: {
        constructId,
        threadId: thread.threadState.threadId,
        stmCount: memoryStats.stmCount,
        ltmCount: memoryStats.ltmCount
      }
    }

    // Add to memory system
    try {
      await thread.addMessage({
        id: userMessage.id,
        role: 'user',
        content: userMessage.content,
        timestamp: Date.now(),
        metadata: { files: attachedFiles }
      })
      
      // Update memory stats after adding message
      const stmStats = thread.getSTMStats()
      const ltmStats = await thread.getLTMStats()
      const newStats = {
        stmCount: stmStats?.messageCount || 0,
        ltmCount: ltmStats?.totalEntries || 0,
        driftDetected: thread.threadState.driftDetected
      }
      setMemoryStats(newStats)
      
      // Debug logging
      console.log('🧠 Memory System Update:', {
        constructId,
        threadId: thread.threadState.threadId,
        stmCount: newStats.stmCount,
        ltmCount: newStats.ltmCount,
        driftDetected: newStats.driftDetected
      })
    } catch (error) {
      console.error('Failed to add message to memory:', error)
    }

    setInputValue('')
    setAttachedFiles([])
    setIsTyping(true)
    onSendMessage(userMessage)

    // Clear any existing typing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    // Set typing indicator to stop after 2 seconds
    const timeout = setTimeout(() => {
      setIsTyping(false)
    }, 2000)
    setTypingTimeout(timeout)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleAction = async (action: string, files?: File[]) => {
    if (!files || files.length === 0) {
      // Handle non-file actions
      switch (action) {
        case 'web-search':
          console.log('Web search mode activated');
          break;
        case 'deep-research':
          console.log('Deep research mode activated');
          break;
        case 'create-image':
          console.log('Image creation mode activated');
          break;
        default:
          console.log(`Action: ${action}`);
      }
      return;
    }

    // Handle file-based actions
    const validFiles: File[] = [];
    for (const file of files) {
      try {
        const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
        if (!UnifiedFileParser.isSupportedType(file.type)) {
          console.warn(`Unsupported file type: ${file.type} for file ${file.name}`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          const sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)}MB`
          console.warn(`File too large: ${file.name} (${sizeStr})`);
          continue;
        }
        validFiles.push(file);
      } catch (error) {
        console.error(`Error validating file ${file.name}:`, error);
      }
    }

    if (validFiles.length === 0) {
      setIsParsing(false);
      return;
    }

    setAttachedFiles(prev => [...prev, ...validFiles])
    setIsParsing(true)

    // Process each file based on action type
    for (const file of validFiles) {
      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        let parsedContent;
        let actionMessage = '';

        switch (action) {
          case 'mocr-video':
            actionMessage = '🎬 MOCR Video Analysis';
            const { default: mocrClient } = await import('../lib/mocrClient');
            const isAvailable = await mocrClient.isAvailable();
            if (isAvailable) {
              const mocrResult = await mocrClient.analyzeVideo(file, {
                maxFrames: 20,
                frameInterval: 3,
                ocrLanguage: 'eng',
                asrLanguage: 'en'
              });
              parsedContent = {
                extractedText: `MOCR Analysis Complete:\n${mocrResult.contentSummary.description}\n\nKey Topics: ${mocrResult.contentSummary.keyTopics.join(', ')}\n\nVisual Text: ${mocrResult.mocrAnalysis.textExtracted} characters\nAudio Text: ${mocrResult.asrAnalysis.wordsTranscribed} words`,
                metadata: { action: 'mocr-video', processingTime: mocrResult.processingTime }
              };
            } else {
              throw new Error('MOCR service not available');
            }
            break;

          case 'ocr-image':
            actionMessage = '👁️ OCR Image Analysis';
            const { OCRService } = await import('../lib/ocrService');
            const ocrResult = await OCRService.extractTextFromImage(file, {
              language: 'eng',
              timeout: 30000
            });
            parsedContent = {
              extractedText: ocrResult.success ? ocrResult.text : 'No text detected in image',
              metadata: { action: 'ocr-image', confidence: ocrResult.confidence }
            };
            break;

          default:
            actionMessage = '📄 File Analysis';
            const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
            parsedContent = await UnifiedFileParser.parseFile(file, {
              maxSize: 10 * 1024 * 1024,
              extractText: true,
              storeContent: false
            });
        }

        const successMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParsed, {
            name: file.name,
            type: file.type,
            size: file.size,
            action: actionMessage,
            extractedText: parsedContent.extractedText.substring(0, 500) + (parsedContent.extractedText.length > 500 ? '...' : ''),
            metadata: parsedContent.metadata
          }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(successMessage)

        console.log(`✅ ${actionMessage} completed for ${file.name}`);
        setParsingProgress(prev => ({ ...prev, [file.name]: 100 }));
      } catch (error: any) {
        console.error(`❌ Error processing file ${file.name}:`, error);
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, error: error.message }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
      } finally {
        setParsingProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file.name];
          return newProgress;
        });
        if (Object.keys(parsingProgress).length === 1 && parsingProgress[file.name] === 100) {
          setIsParsing(false);
        }
      }
    }
    setIsParsing(false);
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // File validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const validFiles = files.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        console.error(`File ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size is 10MB.`);
        // Emit error opcode for file rejection
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: 'file_too_large' }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        console.error(`File ${file.name} has unsupported type: ${file.type}`);
        // Emit error opcode for file rejection
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: 'unsupported_type' }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      console.error('No valid files selected');
      return;
    }

    // Show immediate feedback that files are being processed
    setAttachedFiles(prev => [...prev, ...validFiles])
    setIsParsing(true)

    // Process each file with non-blocking parsing
    for (const file of validFiles) {
      try {
        // Cancel any existing parsing
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        // Use unified file parser for all file types
        const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
        
        const parsedContent = await UnifiedFileParser.parseFile(file, {
          maxSize: 10 * 1024 * 1024, // 10MB
          extractText: true,
          storeContent: false // Don't store content in chat, just extract text
        });
        
        // Emit success opcode
        const successMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParsed, { 
            name: file.name,
            type: file.type,
            size: file.size,
            extractedText: parsedContent.extractedText.substring(0, 500) + (parsedContent.extractedText.length > 500 ? '...' : ''),
            metadata: parsedContent.metadata
          }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(successMessage)
        
        console.log(`✅ Parsed ${file.type} ${file.name} (${parsedContent.extractedText.length} characters)`);
        
        // Update progress
        setParsingProgress(prev => ({ ...prev, [file.name]: 100 }));
      } catch (error: any) {
        console.error(`❌ Error processing file ${file.name}:`, error);
        
        // Emit error opcode
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: error.message }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
        
        // Remove failed file from attached files
        setAttachedFiles(prev => prev.filter(f => f.name !== file.name));
      }
    }
    
    setIsParsing(false);
    setParsingProgress({});
  }

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--chatty-bg-main)]">
      {/* Memory Status Bar */}
      <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Brain size={14} style={{ color: '#22c55e' }} />
            <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>STM: {memoryStats.stmCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Database size={14} style={{ color: '#3b82f6' }} />
            <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>LTM: {memoryStats.ltmCount}</span>
          </div>
          {memoryStats.driftDetected && (
            <div className="flex items-center gap-1">
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span style={{ color: '#ef4444' }}>Drift Detected</span>
            </div>
          )}
          <button
            onClick={() => setShowDriftHistory(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--chatty-text)', opacity: 0.7 }}
            title="View drift history"
          >
            <Activity size={14} />
            <span>History</span>
            {memoryStats.driftDetected && (
              <AlertTriangle size={12} style={{ color: '#ef4444' }} />
            )}
          </button>
        </div>
        <div className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
          {thread.threadState.threadId ? `Thread: ${thread.threadState.threadId.slice(0, 8)}...` : 'No active thread'}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto message-area-scrollable">
        {!conversation || conversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="max-w-md space-y-4">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
                No messages yet
              </h2>
            </div>
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {conversation.messages.map((message: any, index: number) => (
              <MessageComponent
                key={message.id}
                message={message}
                isLast={index === conversation.messages.length - 1}
              />
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--chatty-button)' }}>
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <div className="typing-indicator"></div>
                    <div className="typing-indicator"></div>
                    <div className="typing-indicator"></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">


          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>Attached files ({attachedFiles.length})</span>
                </div>
                {isParsing && (
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-400 hover:border-red-300 transition-colors"
                  >
                    Cancel Parsing
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {attachedFiles.map((file, index) => {
                  const fileExtension = file.name.split('.').pop()?.toLowerCase();
                  
                  const progress = parsingProgress[file.name] || 0;
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'var(--chatty-highlight)' }}>
                      <div className="flex items-center gap-2 flex-1">
                        <Paperclip size={14} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                        <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{file.name}</span>
                        {fileExtension && (
                          <span className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}>
                            {fileExtension.toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        {isParsing && progress > 0 && (
                          <div className="flex items-center gap-2 ml-2">
                            <div className="w-16 rounded-full h-1.5" style={{ backgroundColor: 'var(--chatty-button)' }}>
                              <div 
                                className="h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress * 100}%`, backgroundColor: 'var(--chatty-text)' }}
                              />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                              {Math.round(progress * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 rounded transition-colors file-remove-button theme-night:text-[#ffffeb]"
                        style={{ 
                          color: 'var(--chatty-text)',
                          backgroundColor: 'transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                console.log('Paste event detected:', e.clipboardData?.getData('text'))
                // Let the default paste behavior happen
              }}
              placeholder="Message Chatty..."
              className="chatty-input w-full p-4 pr-20 rounded-lg resize-none focus:outline-none focus:ring-0 focus:ring-offset-0 transition-colors min-h-[52px] chatty-message-input"
              style={{ 
                backgroundColor: 'var(--chatty-bg-message)',
                border: '2px solid var(--chatty-bg-main)',
                color: 'var(--chatty-text)',
                outline: 'none',
                '--placeholder-color': '#ADA587'
              } as React.CSSProperties}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'transparent'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'transparent'
              }}
              rows={1}
              disabled={!conversation || !thread}
            />
            
            {/* Action Menu */}
            <div className="absolute right-12 top-1/2 -translate-y-1/2">
              <ActionMenu 
                onAction={handleAction}
                disabled={!conversation || !thread}
              />
            </div>
            
            {/* Send Button */}
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full transition-all duration-200 ease-out"
              style={{ padding: 3, backgroundColor: 'var(--chatty-button)', borderRadius: '9999px' }}
            >
              <button
                type="submit"
                disabled={(!inputValue.trim() && attachedFiles.length === 0) || !conversation}
                className="chatty-button rounded-full transition-all duration-200 ease-out flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: 'var(--chatty-button)',
                  color: 'var(--chatty-text)',
                  cursor: (inputValue.trim() || attachedFiles.length > 0) && conversation ? 'pointer' : 'default',
                  border: 'none',
                  boxShadow: (inputValue.trim() || attachedFiles.length > 0) && conversation
                    ? '0 10px 24px rgba(58, 46, 20, 0.20), 0 6px 12px rgba(58, 46, 20, 0.16)'
                    : '0 6px 12px rgba(58, 46, 20, 0.12), 0 3px 6px rgba(58, 46, 20, 0.08)',
                  transform: (inputValue.trim() || attachedFiles.length > 0) && conversation ? 'translateY(-2px)' : 'translateY(0)',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if ((inputValue.trim() || attachedFiles.length > 0) && conversation) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 14px 32px rgba(58, 46, 20, 0.24), 0 10px 18px rgba(58, 46, 20, 0.18)';
                    e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = (inputValue.trim() || attachedFiles.length > 0) && conversation ? 'translateY(-2px)' : 'translateY(0)';
                  e.currentTarget.style.boxShadow = (inputValue.trim() || attachedFiles.length > 0) && conversation
                    ? '0 10px 24px rgba(58, 46, 20, 0.20), 0 6px 12px rgba(58, 46, 20, 0.16)'
                    : '0 6px 12px rgba(58, 46, 20, 0.12), 0 3px 6px rgba(58, 46, 20, 0.08)';
                  e.currentTarget.style.backgroundColor = 'var(--chatty-button)';
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.html,.docx,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.svg"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="text-xs mt-2 text-center" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
            Chatty can make mistakes. Consider checking important information.
          </div>
        </form>
      </div>
      
      {/* Drift History Modal */}
      <DriftHistoryModal
        isOpen={showDriftHistory}
        onClose={() => setShowDriftHistory(false)}
        constructId={constructId}
      />
      
    </div>
  )
}

export default ChatArea
