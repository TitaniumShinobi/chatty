import React, { useState, useRef, useEffect } from 'react'
import { Send, Menu, Plus, Paperclip, X } from 'lucide-react'
import { ChatAreaProps } from '../types'
import MessageComponent from './Message.tsx'
import { cn } from '../lib/utils'
import ActionMenu from './ActionMenu'
// Removed unused imports - now using UnifiedFileParser
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputValue.trim() || !conversation) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
      files: attachedFiles
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
        if (file.size > UnifiedFileParser.DEFAULT_MAX_SIZE) {
          console.warn(`File too large: ${file.name} (${UnifiedFileParser.formatFileSize(file.size)})`);
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
    <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffeb' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#E1C28B', backgroundColor: '#ffffd7' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg transition-colors md:hidden"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Menu size={20} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold" style={{ color: '#4C3D1E' }}>
              {conversation?.title || 'New conversation'}
            </h2>
            {activeGPTName && (
              <p className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>
                Using: {activeGPTName}
              </p>
            )}
          </div>
        </div>
        
        <button
          onClick={onNewConversation}
          className="p-2 rounded-lg transition-colors"
          style={{ color: '#4C3D1E' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title="New conversation"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {!conversation || conversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="max-w-md">
              <h1 className="text-2xl font-bold mb-4" style={{ color: '#4C3D1E' }}>
                Welcome to Chatty
              </h1>
              <p className="mb-8" style={{ color: '#4C3D1E', opacity: 0.7 }}>
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
                    className="p-3 text-left text-sm border rounded-lg transition-colors"
                    style={{ 
                      borderColor: '#E1C28B', 
                      color: '#4C3D1E',
                      backgroundColor: '#ffffd7'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffd7'}
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
              <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: '#ffffd7' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4C3D1E' }}>
                  <span className="text-sm font-bold" style={{ color: '#ffffeb' }}>AI</span>
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

      {/* Input Area */}
      <div className="border-t p-4" style={{ borderColor: '#E1C28B' }}>
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">


          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: '#ffffd7', borderColor: '#E1C28B' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>Attached files ({attachedFiles.length})</span>
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
                  const getFileTypeColor = (ext: string) => {
                    const colors: { [key: string]: string } = {
                      // Code files
                      'py': 'text-yellow-600', 'js': 'text-yellow-400', 'ts': 'text-blue-400', 'tsx': 'text-blue-400', 'jsx': 'text-blue-400',
                      'css': 'text-pink-400', 'scss': 'text-pink-400', 'sass': 'text-pink-400', 'less': 'text-pink-400',
                      'html': 'text-orange-400', 'htm': 'text-orange-400', 'vue': 'text-green-400', 'svelte': 'text-red-400',
                      'java': 'text-red-500', 'c': 'text-blue-500', 'cpp': 'text-blue-500', 'cs': 'text-purple-500',
                      'php': 'text-purple-400', 'rb': 'text-red-400', 'go': 'text-blue-400', 'rs': 'text-orange-500',
                      'swift': 'text-orange-400', 'kt': 'text-purple-400', 'scala': 'text-red-400', 'clj': 'text-green-400',
                      'hs': 'text-purple-400', 'ml': 'text-orange-400', 'fs': 'text-blue-400', 'erl': 'text-red-400',
                      'ex': 'text-purple-400', 'lua': 'text-blue-400', 'pl': 'text-blue-400', 'sh': 'text-green-400',
                      'bat': 'text-orange-400', 'ps1': 'text-blue-400',
                      // Config files
                      'json': 'text-yellow-400', 'yaml': 'text-green-400', 'yml': 'text-green-400', 'toml': 'text-blue-400',
                      'ini': 'text-orange-400', 'conf': 'text-orange-400', 'env': 'text-green-400', 'gitignore': 'text-orange-400',
                      'editorconfig': 'text-blue-400', 'eslintrc': 'text-purple-400', 'prettierrc': 'text-pink-400',
                      'babelrc': 'text-yellow-400', 'webpack': 'text-blue-400', 'rollup': 'text-red-400', 'vite': 'text-purple-400',
                      'package': 'text-green-400', 'lock': 'text-orange-400',
                      // Documentation
                      'md': 'text-blue-400', 'markdown': 'text-blue-400', 'txt': 'text-orange-400', 'doc': 'text-blue-500',
                      'docx': 'text-blue-500', 'rtf': 'text-orange-400', 'tex': 'text-orange-400', 'adoc': 'text-green-400',
                      'rst': 'text-orange-400', 'readme': 'text-blue-400', 'license': 'text-green-400', 'changelog': 'text-yellow-400',
                      // Data files
                      'csv': 'text-green-400', 'tsv': 'text-green-400', 'sql': 'text-blue-400', 'xml': 'text-orange-400',
                      'log': 'text-orange-400', 'diff': 'text-red-400', 'patch': 'text-red-400',
                      // Special files
                      'dockerfile': 'text-blue-400', 'makefile': 'text-yellow-400'
                    };
                    return colors[ext] || 'text-orange-400';
                  };
                  
                  const progress = parsingProgress[file.name] || 0;
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#feffaf' }}>
                      <div className="flex items-center gap-2 flex-1">
                        <Paperclip size={14} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                        <span className="text-sm" style={{ color: '#4C3D1E' }}>{file.name}</span>
                        {fileExtension && (
                          <span className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: '#E1C28B', color: '#4C3D1E' }}>
                            {fileExtension.toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: '#4C3D1E', opacity: 0.6 }}>
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        {isParsing && progress > 0 && (
                          <div className="flex items-center gap-2 ml-2">
                            <div className="w-16 rounded-full h-1.5" style={{ backgroundColor: '#E1C28B' }}>
                              <div 
                                className="h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress * 100}%`, backgroundColor: '#4C3D1E' }}
                              />
                            </div>
                            <span className="text-xs" style={{ color: '#4C3D1E', opacity: 0.6 }}>
                              {Math.round(progress * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 rounded transition-colors"
                        style={{ color: '#4C3D1E' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
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
              className="w-full p-4 pr-20 rounded-lg resize-none focus:outline-none transition-colors min-h-[52px] max-h-32"
              style={{ 
                backgroundColor: '#ffffd7',
                border: '1px solid #E1C28B',
                color: '#4C3D1E'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#4C3D1E'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E1C28B'}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: (inputValue.trim() || attachedFiles.length > 0) && conversation ? '#E1C28B' : '#feffaf',
                color: '#4C3D1E',
                cursor: (inputValue.trim() || attachedFiles.length > 0) && conversation ? 'pointer' : 'not-allowed'
              }}
              onMouseEnter={(e) => {
                if ((inputValue.trim() || attachedFiles.length > 0) && conversation) {
                  e.currentTarget.style.backgroundColor = '#d4b078'
                }
              }}
              onMouseLeave={(e) => {
                if ((inputValue.trim() || attachedFiles.length > 0) && conversation) {
                  e.currentTarget.style.backgroundColor = '#E1C28B'
                }
              }}
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
          
          <div className="text-xs mt-2 text-center" style={{ color: '#4C3D1E', opacity: 0.6 }}>
            Chatty can make mistakes. Consider checking important information.
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChatArea
