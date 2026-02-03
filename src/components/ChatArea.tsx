import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Menu, Plus, Paperclip, X, ChevronDown } from 'lucide-react'
import { ChatAreaProps } from '../types'
import MessageComponent from './Message.tsx'
import { cn } from '../lib/utils'
import ActionMenu from './ActionMenu'
import ImageAttachmentPreview from './ImageAttachmentPreview'
import { 
  CHAT_UPLOAD_LIMITS, 
  ALL_ALLOWED_TYPES,
  isImageFile, 
  getFileSizeLimit 
} from '../config/chatConfig'
import { emitOpcode } from '../lib/emit'
import { lexicon as lex } from '../data/lexicon'
import type { AssistantPacket } from '../types'

const pktFromString = (s: string): AssistantPacket => ({ op: 'answer.v1', payload: { content: s } })

const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  activeGPTName,
  onSendMessage,
  onNewConversation,
  onToggleSidebar
}) => {
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [parsingProgress, setParsingProgress] = useState<{ [key: string]: number }>({})
  const [isParsing, setIsParsing] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Check if scrolled to bottom
  const checkScrollPosition = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    setShowScrollButton(!isNearBottom)
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }, [conversation?.messages])

  // Add scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    container.addEventListener('scroll', checkScrollPosition)
    return () => container.removeEventListener('scroll', checkScrollPosition)
  }, [checkScrollPosition])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [inputValue])

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputValue.trim() || !conversation) return

    const imageFiles = attachedFiles.filter(f => isImageFile(f));
    const docFiles = attachedFiles.filter(f => !isImageFile(f));
    
    const imageAttachments = await Promise.all(
      imageFiles.map(async (file) => ({
        name: file.name,
        type: file.type,
        data: await fileToBase64(file)
      }))
    );

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
      files: docFiles,
      attachments: imageAttachments
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
        const maxSize = CHAT_UPLOAD_LIMITS.MAX_DOC_SIZE_MB * 1024 * 1024;
        if (file.size > maxSize) {
          console.warn(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
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

    // File validation using config
    const validFiles = files.filter(file => {
      const sizeLimit = getFileSizeLimit(file);
      if (file.size > sizeLimit) {
        const limitMB = sizeLimit / (1024 * 1024);
        console.error(`File ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size is ${limitMB}MB.`);
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: 'file_too_large' }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
        return false;
      }
      if (!ALL_ALLOWED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
        console.error(`File ${file.name} has unsupported type: ${file.type}`);
        const errorMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: 'unsupported_type' }))],
          timestamp: new Date().toISOString()
        } as import('../types').AssistantMsg
        onSendMessage(errorMessage)
        return false;
      }
      
      // Check attachment limits
      const currentImages = attachedFiles.filter(f => isImageFile(f)).length;
      const currentDocs = attachedFiles.filter(f => !isImageFile(f)).length;
      
      if (isImageFile(file) && currentImages >= CHAT_UPLOAD_LIMITS.MAX_IMAGE_ATTACHMENTS) {
        console.warn(`Max image attachments (${CHAT_UPLOAD_LIMITS.MAX_IMAGE_ATTACHMENTS}) reached`);
        return false;
      }
      if (!isImageFile(file) && currentDocs >= CHAT_UPLOAD_LIMITS.MAX_DOC_ATTACHMENTS) {
        console.warn(`Max document attachments (${CHAT_UPLOAD_LIMITS.MAX_DOC_ATTACHMENTS}) reached`);
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
    
    // Separate images from documents - images don't need parsing
    const imageFiles = validFiles.filter(f => isImageFile(f));
    const docFiles = validFiles.filter(f => !isImageFile(f));
    
    // Log image attachments (no parsing needed)
    if (imageFiles.length > 0) {
      console.log(`📷 Attached ${imageFiles.length} image(s): ${imageFiles.map(f => f.name).join(', ')}`);
    }
    
    // Only parse documents, not images
    if (docFiles.length > 0) {
      setIsParsing(true);
      
      for (const file of docFiles) {
        try {
          abortControllerRef.current?.abort();
          abortControllerRef.current = new AbortController();

          const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
          
          const parsedContent = await UnifiedFileParser.parseFile(file, {
            maxSize: CHAT_UPLOAD_LIMITS.MAX_DOC_SIZE_MB * 1024 * 1024,
            extractText: true,
            storeContent: false
          });
          
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
          setParsingProgress(prev => ({ ...prev, [file.name]: 100 }));
        } catch (error: any) {
          console.error(`❌ Error processing file ${file.name}:`, error);
          
          const errorMessage = {
            id: Date.now().toString(),
            role: 'assistant' as const,
            content: [pktFromString(emitOpcode(lex.tokens.fileParseFailed, { name: file.name, reason: error.message }))],
            timestamp: new Date().toISOString()
          } as import('../types').AssistantMsg
          onSendMessage(errorMessage)
          
          setAttachedFiles(prev => prev.filter(f => f.name !== file.name));
        }
      }
      
      setIsParsing(false);
      setParsingProgress({});
    }
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

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === e.target) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      // Create a synthetic event to reuse handleFileSelect logic
      const fakeEvent = {
        target: { files: droppedFiles }
      } as unknown as React.ChangeEvent<HTMLInputElement>
      await handleFileSelect(fakeEvent)
    }
  }

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-app-butter-50 relative",
        isDragging && "ring-2 ring-app-orange-400 ring-inset"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-app-orange-100/80 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl p-8 shadow-xl border-2 border-dashed border-app-orange-400">
            <p className="text-lg font-medium text-app-orange-600">Drop files here</p>
            <p className="text-sm text-app-orange-400 mt-1">Images, PDFs, and documents</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-app-butter-50">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 hover:bg-app-chat-50 rounded-lg transition-colors md:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-app-text-900">
              {conversation?.title || 'New conversation'}
            </h2>
            {activeGPTName && (
              <p className="text-sm text-app-orange-400">
                Using: {activeGPTName}
              </p>
            )}
          </div>
        </div>
        
        <button
          onClick={onNewConversation}
          className="p-2 hover:bg-app-chat-50 rounded-lg transition-colors"
          title="New conversation"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto relative">
        {!conversation || conversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="max-w-md">
              <h1 className="text-2xl font-bold text-app-text-900 mb-4">
                Welcome to Chatty
              </h1>
              <p className="text-app-orange-400 mb-8">
                Your AI assistant is ready to help. Ask me anything!
              </p>
              
              {/* Example prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  "Tell me about artificial intelligence",
                  "Write a JavaScript function for me",
                  "Create a short story about technology",
                  "Explain how machine learning works"
                ].map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (conversation) {
                        const message = {
                          id: Date.now().toString(),
                          role: 'user' as const,
                          content: prompt,
                          timestamp: new Date().toISOString()
                        }
                        onSendMessage(message)
                      }
                    }}
                    className="p-3 text-left text-sm border border-app-butter-300 rounded-lg hover:bg-app-chat-50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {conversation.messages.map((message, index) => (
              <MessageComponent
                key={message.id}
                message={message}
                isLast={index === conversation.messages.length - 1}
              />
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-start gap-3 p-4 bg-app-chat-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-app-green-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-app-text-900 text-sm font-bold">AI</span>
                </div>
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

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 -top-14 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-10"
            style={{
              backgroundColor: 'var(--chatty-highlight)',
              color: 'var(--chatty-text)',
            }}
            title="Scroll to bottom"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">


          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 p-3 bg-app-chat-50 rounded-lg border border-app-butter-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={16} className="text-app-orange-400" />
                  <span className="text-sm text-app-text-900">Attached files ({attachedFiles.length})</span>
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
              
              {/* Image Previews */}
              {attachedFiles.some(f => isImageFile(f)) && (
                <ImageAttachmentPreview 
                  files={attachedFiles}
                  onRemove={removeFile}
                />
              )}
              
              {/* Document Chips */}
              <div className="space-y-2">
                {attachedFiles.filter(f => !isImageFile(f)).map((file, idx) => {
                  const originalIndex = attachedFiles.findIndex(f => f === file);
                  const fileExtension = file.name.split('.').pop()?.toLowerCase();
                  const getFileTypeColor = (ext: string) => {
                    const colors: { [key: string]: string } = {
                      'pdf': 'text-red-500', 'doc': 'text-blue-500', 'docx': 'text-blue-500',
                      'md': 'text-blue-400', 'txt': 'text-orange-400', 'csv': 'text-green-400',
                      'json': 'text-yellow-400', 'xml': 'text-orange-400'
                    };
                    return colors[ext] || 'text-orange-400';
                  };
                  
                  const progress = parsingProgress[file.name] || 0;
                  
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 bg-app-chat-50 rounded">
                      <div className="flex items-center gap-2 flex-1">
                        <Paperclip size={14} className="text-app-orange-400" />
                        <span className="text-sm text-app-text-900">{file.name}</span>
                        {fileExtension && (
                          <span className={`text-xs px-1 py-0.5 rounded ${getFileTypeColor(fileExtension)} bg-app-butter-300`}>
                            {fileExtension.toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs text-app-orange-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        {isParsing && progress > 0 && (
                          <div className="flex items-center gap-2 ml-2">
                            <div className="w-16 bg-app-butter-300 rounded-full h-1.5">
                              <div 
                                className="bg-app-green-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-app-orange-400">
                              {Math.round(progress * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(originalIndex)}
                        className="p-1 hover:bg-app-butter-300 rounded"
                      >
                        <X size={14} className="text-app-orange-400" />
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
              placeholder="Message Chatty..."
              className="w-full p-4 pr-20 bg-app-chat-50 border border-app-butter-300 rounded-lg resize-none focus:outline-none focus:border-app-green-500 transition-colors min-h-[52px] max-h-32"
              rows={1}
              disabled={!conversation}
            />
            
            {/* Action Menu */}
            <div className="absolute right-12 top-1/2 -translate-y-1/2">
              <ActionMenu 
                onAction={handleAction}
                disabled={!conversation}
              />
            </div>
            
            {/* Send Button */}
            <button
              type="submit"
              disabled={(!inputValue.trim() && attachedFiles.length === 0) || !conversation}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors",
                (inputValue.trim() || attachedFiles.length > 0) && conversation
                  ? "bg-app-green-600 hover:bg-app-green-700 text-app-text-900"
                  : "bg-app-chat-50 text-app-orange-400 cursor-not-allowed"
              )}
            >
              <Send size={16} />
            </button>
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
          
          <div className="text-xs text-app-orange-500 mt-2 text-center">
            Chatty can make mistakes. Consider checking important information.
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChatArea
