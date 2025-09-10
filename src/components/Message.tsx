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
      <div className={`flex items-start gap-3 p-4 ${message.role === 'assistant' ? 'bg-app-gray-800' : 'bg-app-gray-700'} rounded-lg`}>
        <div className="w-8 h-8 rounded-full bg-app-green-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">AI</span>
        </div>
        <div className="flex-1">
          <i className="text-red-400">[invalid-assistant-message]</i>
        </div>
      </div>
    );
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <FileImage size={16} className="text-app-gray-400" />
    } else if (fileType.includes('text') || fileType.includes('document')) {
      return <FileText size={16} className="text-app-gray-400" />
    } else if (fileType.includes('json') || fileType.includes('code')) {
      return <FileCode size={16} className="text-app-gray-400" />
    } else {
      return <Paperclip size={16} className="text-app-gray-400" />
    }
  }

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const isUser = message.role === 'user'

  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-lg transition-colors",
      isUser 
        ? "bg-app-gray-800" 
        : "bg-app-gray-700"
    )}>
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
        isUser 
          ? "bg-app-gray-600" 
          : "bg-app-green-600"
      )}>
        <span className="text-white text-sm font-bold">
          {isUser ? 'U' : 'AI'}
        </span>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* File Attachments */}
        {message.files && message.files.length > 0 && (
          <div className="mb-3 p-3 bg-app-gray-600 rounded-lg border border-app-gray-500">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={16} className="text-app-gray-400" />
              <span className="text-sm text-white font-medium">Attached files ({message.files.length})</span>
            </div>
            <div className="space-y-2">
              {message.files.map((file, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-app-gray-700 rounded">
                  {getFileIcon(file.type)}
                  <span className="text-sm text-white">{file.name}</span>
                  <span className="text-xs text-app-gray-400">
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
                            className="p-1 bg-app-gray-600 rounded hover:bg-app-gray-500 transition-colors"
                            title="Copy code"
                          >
                            {copiedCode === code ? (
                              <Check size={14} className="text-green-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
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
                    <code className="bg-app-gray-600 px-1 py-0.5 rounded text-sm font-mono">
                      {children}
                    </code>
                  )
                },
                
                // Headers
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mb-4 text-white">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mb-3 text-white">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mb-2 text-white">{children}</h3>
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
                    className="text-app-green-400 hover:text-app-green-300 underline"
                  >
                    {children}
                  </a>
                ),
                
                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-app-gray-500 pl-4 italic text-app-gray-300 mb-4">
                    {children}
                  </blockquote>
                ),
                
                // Tables
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-4">
                    <table className="min-w-full border-collapse border border-app-gray-600">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-app-gray-600 px-3 py-2 bg-app-gray-800 text-left font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-app-gray-600 px-3 py-2">
                    {children}
                  </td>
                ),
                
                // Paragraphs
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed">{children}</p>
                ),
              }}
              className="text-white"
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            // Handle packet content using the renderer
            <div className="text-white">
              {R(message.content)}
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        <div className="text-xs text-app-gray-400 mt-2">
          {formatDate(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

export default MessageComponent
