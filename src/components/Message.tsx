// @ts-nocheck
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  Paperclip,
  FileText,
  FileImage,
  FileCode,
  ExternalLink,
  Globe,
} from "lucide-react";
import { MessageProps, Attachment } from "../types";
import { formatDate } from "../lib/utils";
import { cn } from "../lib/utils";
import { R } from "../runtime/render";
import AttachmentDisplay from "./AttachmentDisplay";

interface SourceInfo {
  index: number;
  title: string;
  url: string;
}

function extractSources(content: string): { cleanContent: string; sources: SourceInfo[] } {
  const sources: SourceInfo[] = [];
  const sourceBlockRegex = /\n---\n\s*\*\*Sources:?\*\*\s*\n([\s\S]*?)$/i;
  const altSourceRegex = /\n\s*(?:Sources|References):?\s*\n((?:\s*\[\d+\].*\n?)+)$/i;

  let cleanContent = content;
  const blockMatch = content.match(sourceBlockRegex) || content.match(altSourceRegex);

  if (blockMatch) {
    cleanContent = content.slice(0, blockMatch.index).trimEnd();
    const sourceLines = blockMatch[1].trim().split('\n');
    for (const line of sourceLines) {
      const match = line.match(/\[(\d+)\]\s*\[?(.*?)\]?\s*(?:\(?(https?:\/\/[^\s\)]+)\)?)?/);
      if (match) {
        sources.push({
          index: parseInt(match[1]),
          title: match[2].replace(/[\[\]]/g, '').trim(),
          url: match[3] || '',
        });
      }
    }
  }

  return { cleanContent, sources };
}

const MessageComponent: React.FC<MessageProps> = ({ message }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  // Handle typing indicator
  if ((message as any).typing) {
    return (
      <div className="flex items-start gap-3 p-4 bg-app-chat-50 rounded-lg">
        <div className="w-8 h-8 rounded-full bg-app-green-600 flex items-center justify-center flex-shrink-0">
          <span className="text-app-text-900 text-sm font-bold">AI</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
              <div className="typing-indicator"></div>
            </div>
            <span className="text-app-text-800 text-sm">
              {(message as any).text || "AI is thinking..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const contentString =
    typeof message.content === "string" ? message.content : "";

  const { cleanContent, sources } = React.useMemo(() => {
    if (!isUser && typeof message.content === "string") {
      return extractSources(message.content);
    }
    return { cleanContent: contentString, sources: [] };
  }, [message.content, isUser]);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <FileImage size={16} className="text-app-text-800" />;
    } else if (fileType.includes("text") || fileType.includes("document")) {
      return <FileText size={16} className="text-app-text-800" />;
    } else if (fileType.includes("json") || fileType.includes("code")) {
      return <FileCode size={16} className="text-app-text-800" />;
    } else {
      return <Paperclip size={16} className="text-app-text-800" />;
    }
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const isUser = message.role === "user";
  const isUnsaved = Boolean((message as any)?.metadata?.unsaved);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg transition-colors",
        isUser ? "bg-app-chat-50" : "bg-app-chat-50",
        isUnsaved && "message-unstored border border-red-500/50",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "bg-app-orange-600" : "bg-app-green-600",
        )}
      >
        <span className="text-app-text-900 text-sm font-bold">
          {isUser ? "U" : "AI"}
        </span>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* Image/Document Attachments (new format with URLs) */}
        {(message as any).attachments && (message as any).attachments.length > 0 && (
          <AttachmentDisplay 
            attachments={(message as any).attachments} 
            readOnly={true}
            showFilenames={true}
          />
        )}

        {/* Legacy File Attachments (fallback for old messages without attachments array) */}
        {message.files && message.files.length > 0 && !(message as any).attachments?.length && (
          <div className="mb-3 p-3 bg-app-orange-600 rounded-lg border border-app-orange-500">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={16} className="text-app-text-800" />
              <span className="text-sm text-app-text-900 font-medium">
                Uploaded: {message.files.map((f: any) => f.name).slice(0, 3).join(', ')}
                {message.files.length > 3 && ` (+${message.files.length - 3} more)`}
              </span>
            </div>
            <div className="space-y-2">
              {message.files.map((file: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-app-chat-50 rounded"
                >
                  {getFileIcon(file.type || '')}
                  <span className="text-sm text-app-text-900">{file.name}</span>
                  <span className="text-xs text-app-text-800">
                    ({((file.size || 0) / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="prose prose-invert max-w-none">
          {/* Handle both string content and packet content */}
          {typeof message.content === "string" ? (
            <ReactMarkdown
              remarkPlugins={[remarkBreaks, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                // Code blocks with syntax highlighting
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const code = String(children).replace(/\n$/, "");

                  if (!inline && match) {
                    const { ref: _unusedRef, node, ...rest } = props as any;
                    const lang = match[1];
                    return (
                      <div className="relative group my-3 rounded-lg overflow-hidden" style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4' }}>
                        <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: '#2d2d2d', borderBottom: '1px solid #404040' }}>
                          <span className="text-xs font-mono" style={{ color: '#cccccc' }}>{lang}</span>
                          <button
                            onClick={() => copyToClipboard(code)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                            style={{ color: '#cccccc' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#cccccc'}
                            title="Copy code"
                          >
                            {copiedCode === code ? (
                              <><Check size={14} className="text-green-400" /> Copied!</>
                            ) : (
                              <><Copy size={14} /> Copy code</>
                            )}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={vscDarkPlus as any}
                          language={lang}
                          PreTag="div"
                          useInlineStyles={true}
                          customStyle={{
                            margin: 0,
                            fontSize: "14px",
                            lineHeight: "1.5",
                            background: '#1e1e1e',
                            padding: '1rem',
                            color: '#d4d4d4',
                          }}
                        >
                          {code}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }

                  // Inline code
                  return (
                    <code className="bg-app-orange-600 px-1 py-0.5 rounded text-sm font-mono">
                      {children}
                    </code>
                  );
                },

                // Headers
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mb-4 text-app-text-900">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mb-3 text-app-text-900">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mb-2 text-app-text-900">
                    {children}
                  </h3>
                ),

                // Lists
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-4 space-y-1">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-4 space-y-1">
                    {children}
                  </ol>
                ),

                // Links
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-app-text-800 hover:text-app-text-700 underline"
                  >
                    {children}
                  </a>
                ),

                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-app-orange-500 pl-4 italic text-app-text-800 mb-4">
                    {children}
                  </blockquote>
                ),

                // Tables
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-4">
                    <table className="min-w-full border-collapse border border-app-orange-600">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-app-orange-600 px-3 py-2 bg-app-chat-50 text-left font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-app-orange-600 px-3 py-2">
                    {children}
                  </td>
                ),

                // Paragraphs
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed">{children}</p>
                ),
              }}
              className="text-app-text-900"
            >
              {cleanContent}
            </ReactMarkdown>
          ) : (
            <R packets={message.content as any} />
          )}
        </div>

        {/* Sources section for cited responses */}
        {sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-app-orange-600/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-app-text-800" />
              <span className="text-xs font-semibold text-app-text-800 uppercase tracking-wider">Sources</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <a
                  key={source.index}
                  href={source.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-app-orange-600/50 hover:bg-app-orange-500/50 border border-app-orange-500/30 text-xs text-app-text-900 transition-colors group"
                  title={source.url}
                >
                  <span className="font-semibold text-app-green-600">{source.index}</span>
                  <span className="truncate max-w-[180px]">{source.title || new URL(source.url).hostname}</span>
                  {source.url && <ExternalLink size={10} className="opacity-50 group-hover:opacity-100 flex-shrink-0" />}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp (fallback to ts if timestamp is missing) */}
        <div className="text-xs text-app-text-800 mt-2">
          {formatDate(
            message.timestamp ||
              (typeof (message as any).ts === "number"
                ? new Date((message as any).ts).toISOString()
                : ""),
          )}
          {isUnsaved && (
            <span className="ml-2 text-red-400 font-semibold">[unsaved]</span>
          )}
        </div>

        {/* Tool Trace Pills (server-authored, assistant messages only) */}
        {!isUser && Array.isArray((message as any)?.metadata?.tool_trace) && (message as any).metadata.tool_trace.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(message as any).metadata.tool_trace.map((tool: any, idx: number) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-app-green-600/20 text-app-green-600 border border-app-green-600/30"
                title={tool.detail || tool.tool}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-app-green-600 inline-block" />
                {tool.tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageComponent;
