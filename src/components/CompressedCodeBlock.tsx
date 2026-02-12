import React, { useRef, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CompressedCodeBlockProps {
    code: string
    language?: string
    className?: string
}

export const CompressedCodeBlock: React.FC<CompressedCodeBlockProps> = ({ code, language, className }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)

    // Memoize the code string to avoid unnecessary re-renders
    const cleanCode = useMemo(() => code.replace(/\n$/, ''), [code])

    const copyToClipboard = () => {
        navigator.clipboard?.writeText(cleanCode).catch(() => {
            const textArea = document.createElement('textarea')
            textArea.value = cleanCode
            textArea.style.position = 'fixed'
            textArea.style.left = '-999999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
        })
    }

    // Base style object shared between syntax highlighter and pre
    // Changed from scaling to horizontal scroll for better readability
    const baseStyle: React.CSSProperties = {
        margin: 0,
        fontSize: '0.85rem',
        lineHeight: '1.4',
        padding: '0.75rem 1rem',
        whiteSpace: 'pre',
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'block',
        background: 'none',
    }

    return (
        <div
            className={`relative group my-3 rounded-lg overflow-hidden ${className || ''}`}
            style={{
                width: '100%',
                maxWidth: '100%',
                backgroundColor: '#1e1e1e',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                isolation: 'isolate'
            }}
            ref={containerRef}
        >
            <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: '#2d2d2d', borderBottom: '1px solid #404040' }}>
                <span className="text-xs font-mono" style={{ color: '#cccccc' }}>{language || 'code'}</span>
                <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                    style={{ color: '#cccccc' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#cccccc'}
                    title="Copy code"
                >
                    Copy code
                </button>
            </div>

            <div
                style={{
                    width: '100%',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                }}
            >
                <div ref={contentRef}>
                    {language ? (
                        <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={language}
                            PreTag="div"
                            customStyle={{
                                ...baseStyle,
                                width: 'max-content',
                                minWidth: '100%',
                                background: '#1e1e1e',
                            }}
                            codeTagProps={{
                                style: {
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                }
                            }}
                        >
                            {cleanCode}
                        </SyntaxHighlighter>
                    ) : (
                        <pre
                            className="font-mono text-gray-200"
                            style={{
                                ...baseStyle,
                                width: 'max-content',
                                minWidth: '100%',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            }}
                        >
                            {cleanCode}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    )
}
