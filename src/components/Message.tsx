import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Paperclip, FileText, FileImage, FileCode, Brain, Database, AlertTriangle } from 'lucide-react'
import { MessageProps } from '../types'
import { formatDate, stripSpeakerPrefix } from '../lib/utils'
import { cn } from '../lib/utils'
import { R } from '../runtime/render'

const MessageComponent: React.FC<MessageProps> = ({ message, isLast }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null)

  // Handle typing indicator
  if ((message as any).typing) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
            </div>
            <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              {(message as any).text || 'AI is thinking...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Runtime guard to prevent assistant prose (dev only)
  if (process.env.NODE_ENV !== 'production') {
    if (message.role === 'assistant' && typeof message.content === 'string') {
      throw new Error(`Assistant prose detected: "${message.content.slice(0,60)}..."`);
    }
  }

  // Production-safe guard for assistant prose
  if (message.role === 'assistant' && typeof message.content === 'string') {
    console.error('Assistant prose detected in production:', message.content.slice(0,100));
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
        <div className="flex-1">
          <i style={{ color: '#dc2626' }}>[invalid-assistant-message]</i>
        </div>
      </div>
    );
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <FileImage size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
    } else if (fileType.includes('text') || fileType.includes('document')) {
      return <FileText size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
    } else if (fileType.includes('json') || fileType.includes('code')) {
      return <FileCode size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
    } else {
      return <Paperclip size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
    }
  }

  const copyToClipboard = async (code: string) => {
    console.log('Copy attempt:', { 
      hasClipboard: !!navigator.clipboard, 
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      hostname: window.location.hostname
    })
    
    try {
      // Try modern clipboard API first (requires secure context)
      if (navigator.clipboard && window.isSecureContext) {
        console.log('Using modern clipboard API')
        await navigator.clipboard.writeText(code)
        setCopiedCode(code)
        setTimeout(() => setCopiedCode(null), 2000)
        return
      }
      
      // Fallback for non-secure contexts (localhost HTTP)
      console.log('Using fallback copy method')
      const textArea = document.createElement('textarea')
      textArea.value = code
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      try {
        const successful = document.execCommand('copy')
        if (successful) {
          console.log('Fallback copy successful')
          setCopiedCode(code)
          setTimeout(() => setCopiedCode(null), 2000)
        } else {
          throw new Error('execCommand copy failed')
        }
      } finally {
        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.error('Failed to copy code:', err)
      // Show user-friendly error message
      alert(`Failed to copy to clipboard: ${err.message}. Please select and copy manually.`)
    }
  }

  const isUser = message.role === 'user'
  const thinkingLog: string[] | undefined = (message as any).thinkingLog ?? (message as any).metadata?.thinkingLog
  const responseTimeMs: number | undefined = (message as any).responseTimeMs ?? (message as any).metadata?.responseTimeMs
  const formattedResponseTime = typeof responseTimeMs === 'number'
    ? (responseTimeMs >= 1000 ? `${(responseTimeMs / 1000).toFixed(1)}s` : `${responseTimeMs}ms`)
    : null

  // Memory provenance indicators
  const memorySource = (message as any).memorySource || (message as any).metadata?.memorySource
  const driftDetected = (message as any).driftDetected || (message as any).metadata?.driftDetected
  const constructId = (message as any).constructId || (message as any).metadata?.constructId
  const threadId = (message as any).threadId || (message as any).metadata?.threadId

  const wrapperClasses = cn(
    'flex items-end gap-3 py-3',
    isUser 
      ? 'px-4 flex-row-reverse' // User messages: keep full padding
      : 'px-0' // AI messages: no padding, full width to screen edge
  )

  const bubbleContainerClasses = cn(
    'flex flex-col',
    isUser ? 'items-end text-right' : 'items-start text-left'
  )

  // Calculate dynamic max-width based on content length
  const getMaxWidth = () => {
    const content = typeof message.content === 'string' ? message.content : ''
    const contentLength = content.length
    
    // For very short messages (like "hello"), use a smaller max-width
    if (contentLength <= 20) {
      return 'max-w-[200px]'
    }
    // For short messages, use medium max-width
    else if (contentLength <= 100) {
      return 'max-w-[300px] sm:max-w-[400px]'
    }
    // For longer messages, use the full responsive max-width
    else {
      return 'max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%]'
    }
  }

  const bubbleClasses = cn(
    isUser 
      ? cn('chatty-message px-4 py-3 shadow-sm transition-colors inline-block', getMaxWidth(), 'ml-auto')
      : 'chatty-message block w-full' // AI messages: full width, no constraints
  )

  const bubbleStyle: React.CSSProperties = isUser
    ? {
        backgroundColor: '#ADA587',
        borderRadius: '22px 22px 6px 22px',
        border: '1px solid rgba(76, 61, 30, 0.18)',
        boxShadow: '0 1px 2px rgba(58, 46, 20, 0.05)'
      }
    : {} // AI messages: no bubble styling

  const attachments =
    message.files && message.files.length > 0 ? (
      <div className="mt-3 space-y-2">
        <div
          className={cn(
            'flex items-center gap-2 text-xs font-medium uppercase tracking-wide',
            isUser ? 'justify-end' : 'justify-start'
          )}
          style={{ color: 'var(--chatty-text)', opacity: 0.6 }}
        >
          <Paperclip size={14} />
          Attachments ({message.files.length})
        </div>
        {message.files.map((file, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-2xl text-sm',
              isUser ? 'justify-end' : 'justify-start'
            )}
            style={{
              backgroundColor: isUser ? '#fff8d1' : 'rgba(58, 46, 20, 0.08)',
              color: 'var(--chatty-text)'
            }}
          >
            {getFileIcon(file.type)}
            <span>{file.name}</span>
            <span style={{ opacity: 0.6 }}>
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        ))}
      </div>
    ) : null

  return (
    <div className={wrapperClasses}>
      {/* Message Content */}
      <div className={bubbleContainerClasses}>
        <div className={bubbleClasses} style={bubbleStyle}>
          {!isUser && Array.isArray(thinkingLog) && thinkingLog.length > 0 && (
            <div className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.65 }}>
              {thinkingLog.join(' ')}
            </div>
          )}
          {!isUser && formattedResponseTime && (
            <div className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.55 }}>
              Generated in {formattedResponseTime}
            </div>
          )}
          <div
            className="max-w-none"
            style={{ color: isUser ? '#3A2E14' : 'var(--chatty-text)' }}
          >
            {/* Handle both string content and packet content */}
            {typeof message.content === 'string' ? (
              <ReactMarkdown
                components={{
                // Code blocks with syntax highlighting
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const code = String(children).replace(/\n$/, '')
                  
                  if (!inline && match) {
                    return (
                      <div className="relative group">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyToClipboard(code)}
                            className="p-1 rounded transition-colors"
                            style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
                            title="Copy code"
                          >
                            {copiedCode === code ? (
                              <Check size={14} style={{ color: 'var(--chatty-text)' }} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark as any}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg"
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5',
                          }}
                          {...props}
                        >
                          {code}
                        </SyntaxHighlighter>
                      </div>
                    )
                  }
                  
                  // Inline code
                  return (
                    <code className="px-1 py-0.5 rounded text-sm font-mono" style={{ backgroundColor: '#feffaf', color: 'var(--chatty-text)' }}>
                      {children}
                    </code>
                  )
                },
                
                // Bold text
                strong: ({ children }) => (
                  <strong className="font-bold" style={{ color: 'var(--chatty-text)' }}>{children}</strong>
                ),
                
                // Headers
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--chatty-text)' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--chatty-text)' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--chatty-text)' }}>{children}</h3>
                ),
                
                // Lists
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
                ),
                
                // Links
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: 'var(--chatty-text)', opacity: 0.8 }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  >
                    {children}
                  </a>
                ),
                
                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 pl-4 italic mb-4" style={{ borderColor: '#ffffeb', color: '#ffffeb', opacity: 0.9 }}>
                    {children}
                  </blockquote>
                ),
                
                // Tables
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-4">
                    <table className="min-w-full border-collapse border" style={{ borderColor: 'var(--chatty-line)' }}>
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border px-3 py-2" style={{ borderColor: 'var(--chatty-line)', color: 'var(--chatty-text)' }}>
                    {children}
                  </td>
                ),
                
                // Paragraphs
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed">{children}</p>
                ),
              }}
              style={{ color: isUser ? '#3A2E14' : 'var(--chatty-text)', textAlign: isUser ? 'right' : 'left' }}
            >
              {stripSpeakerPrefix(message.content)}
            </ReactMarkdown>
          ) : (
            <div style={{ textAlign: isUser ? 'right' : 'left' }}>
              <R packets={message.content as any} />
            </div>
          )}
          {attachments}
        </div>
        <div
          className={cn('text-xs mt-2', isUser ? 'text-right' : 'text-left')}
          style={{ color: isUser ? '#3A2E14' : 'var(--chatty-text)', opacity: 0.55 }}
        >
          {formatDate(message.timestamp)}
        </div>
        
        {/* Memory Provenance Indicators */}
        {!isUser && (memorySource || driftDetected || constructId) && (
          <div className="flex items-center gap-2 mt-1">
            {memorySource && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" 
                   style={{ 
                     backgroundColor: memorySource === 'STM' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                     color: memorySource === 'STM' ? '#22c55e' : '#3b82f6'
                   }}>
                {memorySource === 'STM' ? <Brain size={12} /> : <Database size={12} />}
                <span>{memorySource}</span>
              </div>
            )}
            {driftDetected && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" 
                   style={{ 
                     backgroundColor: 'rgba(239, 68, 68, 0.1)',
                     color: '#ef4444'
                   }}>
                <AlertTriangle size={12} />
                <span>Drift</span>
              </div>
            )}
            {constructId && (
              <div className="text-xs opacity-50" title={`Construct: ${constructId}`}>
                {constructId.slice(0, 8)}...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
  )
}

export default MessageComponent
