import {
  useEffect,
  Children,
  isValidElement,
  cloneElement,
} from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { ThemeToggleButton } from '../components/ThemeToggleButton'

interface LegalMarkdownPageProps {
  markdown: string
}

export default function LegalMarkdownPage({ markdown }: LegalMarkdownPageProps) {
  useEffect(() => {
    const ensureLink = (id: string, attributes: Record<string, string>) => {
      if (document.getElementById(id)) {
        return
      }
      const element = document.createElement('link')
      element.id = id
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value)
      })
      document.head.appendChild(element)
    }

    ensureLink('chatty-legal-font-preconnect', {
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com',
    })

    ensureLink('chatty-legal-font-preconnect-static', {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossorigin: 'anonymous',
    })

    ensureLink('chatty-legal-font-stylesheet', {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;500;600;700&display=swap',
    })
  }, [])

  return (
    <div
      className="min-h-screen legal-page"
      style={{
        backgroundColor: 'var(--chatty-bg-main)',
        color: 'var(--chatty-text)',
        fontFamily: "'League Spartan', sans-serif",
      }}
    >
      <header className="px-6 py-4 flex justify-between items-center">
        <Link to="/" className="inline-flex items-center gap-3">
          <img src="/assets/logo/Chatty.png" alt="Chatty" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center p-2 rounded transition-colors"
            style={{
              color: 'var(--chatty-text)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="Print this page"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6,9 6,2 18,2 18,9"></polyline>
              <path d="M6,18H4a2,2,0,0,1-2-2V11a2,2,0,0,1,2-2H20a2,2,0,0,1,2,2v5a2,2,0,0,1-2,2H18"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </button>
          <ThemeToggleButton />
        </div>
      </header>
      <main className="px-6 pb-16">
        <article 
          className="prose prose-neutral max-w-4xl mx-auto"
          style={{
            color: 'var(--chatty-text)',
          }}
        >
          <ReactMarkdown 
            remarkPlugins={[remarkBreaks]}
            components={{
              h1: ({ children }) => (
                <h1 style={{ 
                  color: 'var(--chatty-text)', 
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '56px',
                  fontWeight: '700',
                  marginBottom: '20px',
                  marginTop: '0'
                }}>{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 style={{
                  color: '#ADA587',
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '32px',
                  fontWeight: '600',
                  marginBottom: '18px',
                  marginTop: '36px'
                }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 style={{
                  color: '#ADA587',
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '26px',
                  fontWeight: '600',
                  marginBottom: '16px',
                  marginTop: '30px'
                }}>{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 style={{
                  color: '#ADA587',
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '22px',
                  fontWeight: '600',
                  marginBottom: '14px',
                  marginTop: '26px'
                }}>{children}</h4>
              ),
              h5: ({ children }) => (
                <h5 style={{
                  color: '#ADA587',
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '19px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  marginTop: '22px'
                }}>{children}</h5>
              ),
              h6: ({ children }) => (
                <h6 style={{
                  color: '#ADA587',
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '17px',
                  fontWeight: '600',
                  marginBottom: '10px',
                  marginTop: '20px'
                }}>{children}</h6>
              ),
              p: ({ node, children }: any) => {
                const text = children?.toString() || '';
                
                // Debug logging
                console.log('Processing paragraph:', text.trim());

                if (node?.position?.start?.line === 1) {
                  return (
                    <h1
                      style={{
                        color: 'var(--chatty-text)',
                        fontFamily: "'League Spartan', sans-serif",
                        fontSize: '56px',
                        fontWeight: 700,
                        marginBottom: '20px',
                        marginTop: 0,
                      }}
                    >
                      {children}
                    </h1>
                  );
                }

                if (text.startsWith('Last Updated:')) {
                  return <p className="text-green-600" style={{ fontFamily: "'League Spartan', sans-serif" }}>{children}</p>;
                }

                if (text.trim() === '⸻') {
                  return (
                    <hr
                      style={{
                        border: 'none',
                        borderTop: '1px solid var(--chatty-line)',
                        margin: '32px 0',
                      }}
                    />
                  );
                }

                if (/^\d+\.\s+.+/.test(text.trim())) {
                  console.log('MATCHED NUMBERED SECTION:', text.trim());
                  return (
                    <h2 style={{
                      color: '#ADA587',
                      fontFamily: "'League Spartan', sans-serif",
                      fontSize: '38px',
                      fontWeight: '600',
                      marginBottom: '20px',
                      marginTop: '40px'
                    }}>
                      {children}
                    </h2>
                  );
                }

                return <p style={{ 
                  color: 'var(--chatty-text)', 
                  fontFamily: "'League Spartan', sans-serif",
                  fontSize: '18px',
                  lineHeight: '1.6',
                  marginBottom: '16px'
                }}>{children}</p>;
              },
              li: ({ children }) => {
                const parts = Children.toArray(children)

                if (parts.length > 0 && isValidElement(parts[0]) && parts[0].type === 'p') {
                  const first = parts[0]
                  const existingStyle = first.props?.style || {}
                  parts[0] = cloneElement(first, {
                    style: {
                      ...existingStyle,
                      color: '#ADA587',
                      fontSize: '28px',
                      fontWeight: 600,
                      marginBottom: '12px',
                    },
                  })
                }

                return (
                  <li style={{ color: 'var(--chatty-text)', fontFamily: "'League Spartan', sans-serif" }}>
                    {parts}
                  </li>
                )
              },
              a: ({ children, href }) => (
                <a 
                  href={href} 
                  style={{ 
                    color: 'var(--chatty-text)',
                    textDecoration: 'underline',
                    textDecorationColor: 'var(--chatty-line)',
                    fontFamily: "'League Spartan', sans-serif"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--chatty-highlight)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--chatty-text)'}
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong style={{ color: 'var(--chatty-text)', fontFamily: "'League Spartan', sans-serif" }}>{children}</strong>
              ),
              em: ({ children }) => (
                <em style={{ color: 'var(--chatty-text)', fontFamily: "'League Spartan', sans-serif" }}>{children}</em>
              ),
              blockquote: ({ children }) => (
                <blockquote 
                  style={{ 
                    color: 'var(--chatty-text)',
                    borderLeftColor: 'var(--chatty-line)',
                    backgroundColor: 'var(--chatty-button)',
                    fontFamily: "'League Spartan', sans-serif"
                  }}
                >
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code 
                  style={{ 
                    color: 'var(--chatty-text)',
                    backgroundColor: 'var(--chatty-button)',
                    fontFamily: "'League Spartan', sans-serif"
                  }}
                >
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre 
                  style={{ 
                    color: 'var(--chatty-text)',
                    backgroundColor: 'var(--chatty-button)',
                    borderColor: 'var(--chatty-line)',
                    fontFamily: "'League Spartan', sans-serif"
                  }}
                >
                  {children}
                </pre>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  )
}
