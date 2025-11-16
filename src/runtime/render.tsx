// src/runtime/render.tsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { stripSpeakerPrefix } from '../lib/utils'

type Packet = { op: string; payload?: any }

function renderAnswer(pl: any): string {
  if (pl === null || pl === undefined) return ''
  if (typeof pl === 'string') return pl
  if (typeof pl?.content === 'string') return pl.content
  if (Array.isArray(pl)) return pl.filter(Boolean).map(item => renderAnswer(item).trim()).join('\n\n')
  if (Array.isArray(pl?.content)) return pl.content.filter(Boolean).map((item: any) => renderAnswer(item).trim()).join('\n\n')
  try {
    return JSON.stringify(pl)
  } catch (error) {
    console.warn('Failed to stringify packet payload for markdown rendering', { error, payload: pl })
    return String(pl)
  }
}

function formatMarkdownContent(content: string): string {
  if (!content || typeof content !== 'string') return content
  
  // Strip speaker prefixes first (e.g., "Synth said:", "You said:")
  const cleaned = stripSpeakerPrefix(content)
  
  // Fix common markdown formatting issues
  return cleaned
    // Ensure headers have proper spacing before them
    .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
    // Ensure headers have proper spacing after them
    .replace(/(#{1,6}[^\n]*)\n([^\n#\s])/g, '$1\n\n$2')
    // Fix headers that are inline with other content
    .replace(/([^\n])\s*(#{1,6}[^\n]*)/g, '$1\n\n$2')
    // Fix nested bullets: transform "- sentence. - subpoint" into proper nested structure
    .replace(/^(\s*-\s+[^\n]+)\.\s+-\s+/gm, '$1\n    - ')
    // Clean up multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const markdownComponents: Components = {
  // Code blocks with syntax highlighting
  code({ className, children }: any) {
    const match = /language-(\w+)/.exec(className || '')
    const code = String(children).replace(/\n$/, '')
    
    const inline = !match
    if (!inline && match) {
      return (
        <div className="relative group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                // Simple copy functionality for code blocks
                navigator.clipboard?.writeText(code).catch(() => {
                  // Fallback for non-secure contexts
                  const textArea = document.createElement('textarea')
                  textArea.value = code
                  textArea.style.position = 'fixed'
                  textArea.style.left = '-999999px'
                  document.body.appendChild(textArea)
                  textArea.select()
                  document.execCommand('copy')
                  document.body.removeChild(textArea)
                })
              }}
              className="p-1 rounded transition-colors"
              style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
              title="Copy code"
            >
              <span style={{ fontSize: '12px' }}>Copy</span>
            </button>
          </div>
          <pre 
            className="rounded-lg p-4 overflow-x-auto"
            style={{ 
              backgroundColor: '#1e1e1e', 
              color: '#d4d4d4',
              fontSize: '14px',
              lineHeight: '1.5',
              margin: 0
            }}
          >
            <code>{code}</code>
          </pre>
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
    <ul
      style={{
        listStyleType: 'circle',
        marginLeft: 0,
        paddingLeft: '1.5em',
        color: 'var(--chatty-text)',
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        listStyleType: 'decimal',
        marginLeft: 0,
        paddingLeft: '1.5em',
        color: 'var(--chatty-text)',
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        paddingLeft: '0.5em',
        marginLeft: 0,
        marginBottom: '0.5em',
        textIndent: 0,
      }}
    >
      {children}
    </li>
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
}

type MarkdownErrorBoundaryProps = {
  content: string
  children: React.ReactNode
}

type MarkdownErrorBoundaryState = {
  hasError: boolean
}

class MarkdownErrorBoundary extends React.Component<MarkdownErrorBoundaryProps, MarkdownErrorBoundaryState> {
  state: MarkdownErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: any) {
    console.error('Markdown rendering failed', { error, content: this.props.content })
  }

  componentDidUpdate(prevProps: MarkdownErrorBoundaryProps) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{this.props.content}</pre>
    }
    return this.props.children
  }
}

const RENDERERS: Record<string, (pl: any) => React.ReactNode> = {
  'answer.v1': (pl) => {
    const content = renderAnswer(pl)
    if (!content) return null
    
    // Handle streaming content that might be incomplete
    const isStreaming = typeof content === 'string' && content.endsWith('...')
    const formattedContent = formatMarkdownContent(content)
    
    return (
      <MarkdownErrorBoundary content={formattedContent}>
        <div className="prose prose-invert max-w-none" style={{ color: 'var(--chatty-text)' }}>
          <ReactMarkdown 
            components={markdownComponents}
            skipHtml={false}
          >
            {formattedContent}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block animate-pulse" style={{ opacity: 0.6 }}>
              ...
            </span>
          )}
        </div>
      </MarkdownErrorBoundary>
    )
  },
  'TEXT': (pl) => {
    const content = pl?.content || pl
    if (!content || typeof content !== 'string') return null
    
    // Handle streaming content that might be incomplete
    const isStreaming = content.endsWith('...')
    const formattedContent = formatMarkdownContent(content)
    
    return (
      <MarkdownErrorBoundary content={formattedContent}>
        <div className="prose prose-invert max-w-none" style={{ color: 'var(--chatty-text)' }}>
          <ReactMarkdown 
            components={markdownComponents}
            skipHtml={false}
          >
            {formattedContent}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block animate-pulse" style={{ opacity: 0.6 }}>
              ...
            </span>
          )}
        </div>
      </MarkdownErrorBoundary>
    )
  },
  'file.summary.v1': (pl) => (
    <div>
      📄 <strong>{pl?.fileName ?? '(unnamed)'}</strong>
      {pl?.summary ? <>: {pl.summary}</> : null}
    </div>
  ),
  'warn.v1': (pl) => <div>⚠️ {pl?.message ?? ''}</div>,
  'error.v1': (pl) => <div>❌ {pl?.message ?? ''}</div>,
}

function PacketView({ p }: { p: Packet }) {
  const fn = RENDERERS[p.op] || ((_pl) => {
    // Fallback: if it's a text-like packet, try to render with markdown
    if (p.op === 'text' || p.op === 'content' || (typeof p.payload === 'string') || (p.payload?.content && typeof p.payload.content === 'string')) {
      const content = typeof p.payload === 'string' ? p.payload : p.payload?.content || ''
      if (content) {
        const formattedContent = formatMarkdownContent(content)
        return (
          <MarkdownErrorBoundary content={formattedContent}>
            <div className="prose prose-invert max-w-none" style={{ color: 'var(--chatty-text)' }}>
              <ReactMarkdown 
                components={markdownComponents}
                skipHtml={false}
              >
                {formattedContent}
              </ReactMarkdown>
            </div>
          </MarkdownErrorBoundary>
        )
      }
    }
    return <span>[missing-op: {p.op}]</span>
  })
  return (
    <div className="w-full" style={{ color: 'var(--chatty-text)' }}>
      {fn(p.payload)}
    </div>
  )
}

export function R({ packets }: { packets: Packet[] }) {
  if (!Array.isArray(packets) || packets.length === 0) {
    return <div style={{ opacity: 0.6, color: 'var(--chatty-text)' }}>[empty]</div>
  }
  return (
    <>
      <style>{`
        /* Nested bullets: use semantic list styling */
        .prose ul ul {
          list-style-type: disc !important;
          margin-left: 1.25em !important;
          padding-left: 0 !important;
          color: var(--chatty-text) !important;
        }
        .prose ul ul li {
          margin-left: 0 !important;
          padding-left: 0.5em !important;
          color: var(--chatty-text) !important;
        }
        /* Ensure bullet markers inherit the text color */
        .prose ul li::marker,
        .prose ol li::marker {
          color: var(--chatty-text);
        }
      `}</style>
      <div className="w-full space-y-2" style={{ color: 'var(--chatty-text)' }}>
        {packets.map((p, i) => (
          <PacketView key={i} p={p} />
        ))}
      </div>
    </>
  )
}

export default R
