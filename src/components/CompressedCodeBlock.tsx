import React, { useRef, useLayoutEffect, useState, useMemo } from 'react'
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
    const [scale, setScale] = useState(1)

    // Memoize the code string to avoid unnecessary re-renders
    const cleanCode = useMemo(() => code.replace(/\n$/, ''), [code])

    useLayoutEffect(() => {
        const checkSize = () => {
            if (!containerRef.current || !contentRef.current) return

            const containerWidth = containerRef.current.offsetWidth
            const contentWidth = contentRef.current.scrollWidth

            // Calculate scale to fit content within container
            // Use 0.99 to provide a tiny buffer and prevent any rounding edge cases
            const newScale = contentWidth > containerWidth
                ? (containerWidth / contentWidth) * 0.99
                : 1

            setScale(newScale)
        }

        // Initial check
        checkSize()

        // Add resize listener
        const resizeObserver = new ResizeObserver(checkSize)
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current)
        }

        return () => resizeObserver.disconnect()
    }, [cleanCode])

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

    // Base style object to shared between syntax highlighter and pre
    const baseStyle: React.CSSProperties = {
        margin: 0,
        fontSize: '0.85rem',
        lineHeight: '1.4',
        padding: '0.75rem 1rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        display: 'block',
        // We remove the default background from SyntaxHighlighter styling to control it on the container
        background: 'none',
    }

    return (
        <div
            className={`relative group my-3 ${className || ''}`}
            style={{
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
                isolation: 'isolate' // Create new stacking context
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
                        color: 'var(--chatty-text-inverse, #ffffeb)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
                    title="Copy code"
                >
                    Copy
                </button>
            </div>

            {/* Code Container */}
            <div
                className="rounded-lg border border-opacity-10"
                style={{
                    width: '100%',
                    backgroundColor: '#2d2d2d', // Always dark for code blocks
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    borderColor: 'var(--chatty-line)',
                    overflow: 'hidden',
                }}
            >
                <div
                    ref={contentRef}
                    style={{
                        transform: `scaleX(${scale})`,
                        transformOrigin: 'left center',
                        width: 'fit-content',
                        minWidth: '100%',
                        // Important: this ensures the transform doesn't cause layout shift
                        willChange: 'transform',
                    }}
                >
                    {language ? (
                        <SyntaxHighlighter
                            style={oneDark as any}
                            language={language}
                            PreTag="div"
                            customStyle={{
                                ...baseStyle,
                                // Force overrides for library defaults that might conflict
                                width: 'auto',
                                maxWidth: 'none',
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
                                width: 'auto',
                                maxWidth: 'none',
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
