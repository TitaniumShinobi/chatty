import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Paperclip, FileText, FileImage, FileCode } from 'lucide-react'
import { MessageProps } from '../types'
import { formatDate } from '../lib/utils'
import { cn } from '../lib/utils'
import { R } from '../runtime/render'

const MessageComponent: React.FC<MessageProps> = ({ message, isLast }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null)

  // Handle typing indicator
  if ((message as any).typing) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: '#ffffd7' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4C3D1E' }}>
          <span className="text-sm font-bold" style={{ color: '#ffffeb' }}>AI</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
            </div>
            <span className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>
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
      <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: '#ffffd7' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4C3D1E' }}>
          <span className="text-sm font-bold" style={{ color: '#ffffeb' }}>AI</span>
        </div>
        <div className="flex-1">
          <i style={{ color: '#dc2626' }}>[invalid-assistant-message]</i>
        </div>
      </div>
    );
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <FileImage size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
    } else if (fileType.includes('text') || fileType.includes('document')) {
      return <FileText size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
    } else if (fileType.includes('json') || fileType.includes('code')) {
      return <FileCode size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
    } else {
      return <Paperclip size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
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

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg transition-colors" style={{ backgroundColor: '#ffffd7' }}>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isUser ? '#E1C28B' : '#4C3D1E' }}>
        <span className="text-sm font-bold" style={{ color: isUser ? '#4C3D1E' : '#ffffeb' }}>
          {isUser ? 'U' : 'AI'}
        </span>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* File Attachments */}
        {message.files && message.files.length > 0 && (
          <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: '#feffaf', borderColor: '#E1C28B' }}>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
              <span className="text-sm font-medium" style={{ color: '#4C3D1E' }}>Attached files ({message.files.length})</span>
            </div>
            <div className="space-y-2">
              {message.files.map((file, index) => (
                <div key={index} className="flex items-center gap-2 p-2 rounded" style={{ backgroundColor: '#ffffd7' }}>
                  {getFileIcon(file.type)}
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>{file.name}</span>
                  <span className="text-xs" style={{ color: '#4C3D1E', opacity: 0.6 }}>
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="prose prose-invert max-w-none">
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
                            style={{ backgroundColor: '#E1C28B', color: '#4C3D1E' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d4b078'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
                            title="Copy code"
                          >
                            {copiedCode === code ? (
                              <Check size={14} style={{ color: '#4C3D1E' }} />
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
                    <code className="px-1 py-0.5 rounded text-sm font-mono" style={{ backgroundColor: '#feffaf', color: '#4C3D1E' }}>
                      {children}
                    </code>
                  )
                },
                
                // Headers
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mb-4" style={{ color: '#4C3D1E' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mb-3" style={{ color: '#4C3D1E' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mb-2" style={{ color: '#4C3D1E' }}>{children}</h3>
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
                    style={{ color: '#4C3D1E', opacity: 0.8 }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  >
                    {children}
                  </a>
                ),
                
                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 pl-4 italic mb-4" style={{ borderColor: '#E1C28B', color: '#4C3D1E', opacity: 0.8 }}>
                    {children}
                  </blockquote>
                ),
                
                // Tables
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-4">
                    <table className="min-w-full border-collapse border" style={{ borderColor: '#E1C28B' }}>
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: '#E1C28B', backgroundColor: '#ffffd7', color: '#4C3D1E' }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border px-3 py-2" style={{ borderColor: '#E1C28B', color: '#4C3D1E' }}>
                    {children}
                  </td>
                ),
                
                // Paragraphs
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed">{children}</p>
                ),
              }}
              style={{ color: '#4C3D1E' }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <R packets={message.content as any} />
          )}
        </div>
        
        {/* Timestamp */}
        <div className="text-xs mt-2" style={{ color: '#4C3D1E', opacity: 0.6 }}>
          {formatDate(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

export default MessageComponent
