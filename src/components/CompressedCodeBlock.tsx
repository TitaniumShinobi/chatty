import React, { useRef, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

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
            className={`relative group my-3 ${className || ''}`}
            style={{
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
                isolation: 'isolate'
            }}
            ref={containerRef}
        >
            {/* Copy Button */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <button
                    onClick={copyToClipboard}
                    className="px-2 py-1 rounded text-xs transition-colors shadow-sm"
                    style={{
                        backgroundColor: 'var(--chatty-button)',
                        color: 'var(--chatty-text-inverse, #fffff0)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
                    title="Copy code"
                >
                    Copy
                </button>
            </div>

            {/* Code Container - now with horizontal scroll instead of scaling */}
            <div
                className="rounded-lg border border-opacity-10"
                style={{
                    width: '100%',
                    backgroundColor: '#2d2d2d',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    borderColor: 'var(--chatty-line)',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                }}
            >
                <div ref={contentRef}>
                    {language ? (
                        <SyntaxHighlighter
                            style={oneDark as any}
                            language={language}
                            PreTag="div"
                            customStyle={{
                                ...baseStyle,
                                width: 'max-content',
                                minWidth: '100%',
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
