// @ts-nocheck
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { slashKeys } from "../lib/commands";
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
  Volume2,
} from "lucide-react";
import { MessageProps, Attachment } from "../types";
import { formatDate } from "../lib/utils";
import { cn } from "../lib/utils";
import { R } from "../runtime/render";
import AttachmentDisplay from "./AttachmentDisplay";
import { isBrowserTtsAvailable, speakBrowser, speakPremium, getSavedTtsConfig, getResolvedTtsForPlayback } from "../lib/tts";
import { toSpokenVariant } from "../lib/spokenVariant";
import { useSettings } from "../context/SettingsContext";
import { useTtsPlayback } from "../context/TtsPlaybackContext";

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

/** Get plain text for TTS from message (string content or answer.v1 packets). */
function getMessageTextForTts(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p: any) => p?.op === 'answer.v1' && p?.payload?.content)
    .map((p: any) => String(p.payload.content))
    .join('\n');
}

const MessageComponent: React.FC<MessageProps> = ({ message, sessionStartMs, latestAssistantMessageId, threadId, onMarkSpoken }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const isUser = message.role === "user";
  const playedMessageIdsRef = React.useRef<Set<string>>(new Set());
  const { settings } = useSettings();
  const { setTtsPlaying, setCurrentAudioElement } = useTtsPlayback();

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

  const isUnsaved = Boolean((message as any)?.metadata?.unsaved);

  React.useEffect(() => {
    // Auto-play assistant messages only for newest assistant message in current session
    try {
      if (!message || message.role === 'user') return;
      const genericConfig = getSavedTtsConfig();
      const resolved = getResolvedTtsForPlayback(threadId ?? undefined, settings.general, genericConfig);
      if (!resolved.enabled) return;

      // Derive message time (ms)
      const messageTime = message.timestamp ? new Date(message.timestamp).getTime() : (typeof (message as any).ts === 'number' ? (message as any).ts : 0);

      const isNewInSession = typeof sessionStartMs === 'number' ? messageTime >= sessionStartMs : false;
      const isNewestAssistant = latestAssistantMessageId != null ? message.id === latestAssistantMessageId : false;
      const alreadyPlayed = playedMessageIdsRef.current.has(message.id);

      if (!isNewInSession || !isNewestAssistant || alreadyPlayed) return;

      const rawText = getMessageTextForTts(message.content);
      if (!rawText.trim()) return;
      const storedSpeech = (message as any).metadata?.speechText;
      const toSpeak =
        (typeof storedSpeech === "string" && storedSpeech.trim())
          ? storedSpeech.trim()
          : toSpokenVariant(rawText) || rawText;

      // Mark as played immediately to guard against duplicate playback on re-renders
      playedMessageIdsRef.current.add(message.id);

      const markSpokenOnSuccess = (success: boolean) => {
        setTtsPlaying(false);
        if (success && onMarkSpoken) {
          onMarkSpoken(message.id, {
            outputMode: "voice",
            speechText: toSpeak || undefined,
            voiceReply: true,
          });
        }
      };

      setTtsPlaying(true);
      if (resolved.provider === "browser" && isBrowserTtsAvailable()) {
        speakBrowser(toSpeak, { voiceName: resolved.voiceName })
          .then(() => markSpokenOnSuccess(true))
          .catch(() => markSpokenOnSuccess(false));
      } else {
        speakPremium(toSpeak, {
          voice: resolved.voiceName,
          threadId,
          style: resolved.style,
          speechProfile: resolved.speechProfile,
          onAudioElement: (el) => setCurrentAudioElement(el ?? null),
        })
          .then(() => markSpokenOnSuccess(true))
          .catch(() => markSpokenOnSuccess(false));
      }
    } catch (err) {
      console.warn("TTS error", err);
      setTtsPlaying(false);
    }
  }, [message?.id, message?.content, latestAssistantMessageId, sessionStartMs, threadId, settings.general.zenVoice, settings.general.linVoice, setTtsPlaying, setCurrentAudioElement, onMarkSpoken]);

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

  // System receipt: small chip with optional status (pending/ok/error/blocked)
  if (message.role === "system") {
    const text =
      (typeof message.content === "string"
        ? message.content
        : (message as any).text) ?? "";
    const status = (message as any).status as
      | "pending"
      | "ok"
      | "error"
      | "blocked"
      | undefined;
    return (
      <div
        className="py-1 px-4 text-left flex items-center gap-1.5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status === "pending" && (
          <span
            className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
            style={{ color: "var(--chatty-text)", opacity: 0.5 }}
            aria-hidden="true"
          />
        )}
        <span
          className="text-xs"
          style={{
            color:
              status === "ok"
                ? "var(--chatty-success, #22c55e)"
                : status === "error"
                ? "var(--chatty-error, #ef4444)"
                : status === "blocked"
                ? "var(--chatty-warning, #f59e0b)"
                : "var(--chatty-text)",
            opacity: status ? 1 : 0.7,
          }}
        >
          {text}
        </span>
      </div>
    );
  }

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
                p: ({ children }) => {
                  // Centralized slash-command styling
                  const text = Array.isArray(children) ? children.map(String).join("") : String(children);
                  for (const cmd of slashKeys) {
                    if (text.startsWith(cmd)) {
                      const rest = text.slice(cmd.length);
                      return (
                        <div className="mb-4 leading-relaxed">
                          <span className="text-blue-400">{cmd}</span>{rest}
                        </div>
                      );
                    }
                  }
                  return <div className="mb-4 leading-relaxed">{children}</div>;
                },
                // ...existing code...
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

        {/* Voice reply badge (assistant messages that were spoken in voice mode) */}
        {!isUser && ((message as any).metadata?.outputMode === "voice" || (message as any).metadata?.voiceReply) && (
          <div className="flex items-center gap-1.5 text-xs mt-1 text-app-text-800 opacity-75">
            <Volume2 size={12} />
            <span>Spoken</span>
          </div>
        )}

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
