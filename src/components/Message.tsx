// @ts-nocheck
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  Paperclip,
  FileText,
  FileImage,
  FileCode,
} from "lucide-react";
import { MessageProps, Attachment } from "../types";
import { formatDate } from "../lib/utils";
import { cn } from "../lib/utils";
import { R } from "../runtime/render";
import AttachmentDisplay from "./AttachmentDisplay";

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
              remarkPlugins={[remarkBreaks]}
              components={{
                // Code blocks with syntax highlighting
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const code = String(children).replace(/\n$/, "");

                  if (!inline && match) {
                    const { ref: _unusedRef, node, ...rest } = props as any;
                    return (
                      <div className="relative group">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyToClipboard(code)}
                            className="p-1 bg-app-orange-600 rounded hover:bg-app-orange-500 transition-colors"
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
                          style={oneDark as any}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg"
                          customStyle={{
                            margin: 0,
                            fontSize: "14px",
                            lineHeight: "1.5",
                          }}
                          {...rest}
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
              {message.content}
            </ReactMarkdown>
          ) : (
            <R packets={message.content as any} />
          )}
        </div>

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
      </div>
    </div>
  );
};

export default MessageComponent;
