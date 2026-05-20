import * as React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import HousingResultCards from "../components/HousingResultCards";
import PacketCitations from "../components/PacketCitations";
import { CompressedCodeBlock } from "../components/CompressedCodeBlock";
import type { AssistantPacket, AnswerPacketPayload, HousingResultsPacketPayload, PacketCitation } from "../types";
import { prepareMessageContent } from "../utils/text";

type Packet = AssistantPacket | { op: string; payload?: unknown };
type MarkdownCodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function readPacketContent(pl: unknown): string {
  let content = "";
  if (typeof pl === "string") content = pl;
  else if (typeof (pl as { content?: unknown })?.content === "string") {
    content = (pl as { content: string }).content;
  } else if (Array.isArray(pl)) content = pl.join("\n");
  else if (Array.isArray((pl as { content?: unknown[] })?.content)) {
    content = ((pl as { content: unknown[] }).content).join("\n");
  }
  else {
    try {
      content = JSON.stringify(pl ?? "", null, 2);
    } catch {
      content = String(pl ?? "");
    }
  }
  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizePacketCitations(citations: unknown): PacketCitation[] {
  if (!Array.isArray(citations)) return [];

  return citations
    .map((citation, index): PacketCitation | null => {
      if (typeof citation === "string") {
        return {
          index: index + 1,
          title: citation.trim() || undefined,
        };
      }

      if (!isRecord(citation)) return null;

      return {
        index: typeof citation.index === "number" ? citation.index : index + 1,
        title: trimString(citation.title),
        label: trimString(citation.label),
        url: trimString(citation.url),
        source: trimString(citation.source),
        snippet: trimString(citation.snippet),
      };
    })
    .filter((citation): citation is PacketCitation => Boolean(citation));
}

function parseLegacyCitationLine(line: string): PacketCitation | null {
  const prefixMatch = line.match(/^(?:[-*]\s*)?\[(\d+)\]\s*(.+)$/);
  if (!prefixMatch) return null;

  const index = Number(prefixMatch[1]);
  const remainder = prefixMatch[2].trim();
  const markdownLinkMatch = remainder.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)\s*$/i);

  if (markdownLinkMatch) {
    return {
      index,
      title: markdownLinkMatch[1].trim(),
      url: markdownLinkMatch[2].trim(),
    };
  }

  const urlMatch = remainder.match(/(https?:\/\/[^\s)]+)\)?\s*$/i);
  if (!urlMatch || typeof urlMatch.index !== "number") {
    return {
      index,
      title: remainder,
    };
  }

  const title = remainder
    .slice(0, urlMatch.index)
    .replace(/[\s([{]+$/g, "")
    .trim();

  return {
    index,
    title: title || undefined,
    url: urlMatch[1].trim(),
  };
}

function extractLegacyPacketCitations(content: string): {
  content: string;
  citations: PacketCitation[];
} {
  const patterns = [
    /\n\s*---\s*\n\s*\*\*Sources:?\*\*\s*\n([\s\S]*?)\s*$/i,
    /\n\s*\*\*Sources:?\*\*\s*\n([\s\S]*?)\s*$/i,
    /\n\s*(?:Sources|References):?\s*\n([\s\S]*?)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match || typeof match.index !== "number") continue;

    const citations = match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseLegacyCitationLine)
      .filter((citation): citation is PacketCitation => Boolean(citation));

    if (!citations.length) continue;

    return {
      content: content
        .slice(0, match.index)
        .replace(/\n\s*---\s*$/i, "")
        .trimEnd(),
      citations,
    };
  }

  return { content, citations: [] };
}

function resolveAnswerPayload(payload: unknown): {
  content: string;
  citations: PacketCitation[];
} {
  const rawContent = readPacketContent(payload);
  const { content: sourceFreeContent, citations: fallbackCitations } = extractLegacyPacketCitations(rawContent);
  const structuredCitations = normalizePacketCitations(
    isRecord(payload) ? payload.citations : undefined,
  );

  return {
    content: prepareMessageContent(sourceFreeContent),
    citations: structuredCitations.length > 0 ? structuredCitations : fallbackCitations,
  };
}

const markdownComponents: Components = {
  // Code blocks with syntax highlighting
  code({ inline, className, children }: MarkdownCodeProps) {
    const match = /language-(\w+)/.exec(className || "");

    // Code block with language or plain text block
    if (!inline) {
      return (
        <CompressedCodeBlock
          code={String(children)}
          language={match ? match[1] : undefined}
          className={className}
        />
      );
    }

    // Inline code
    return (
      <code
        className="px-1.5 py-0.5 rounded text-sm font-mono"
        style={{
          backgroundColor: "var(--chatty-bg-secondary)",
          color: "var(--chatty-text)",
        }}
      >
        {children}
      </code>
    );
  },

  // Bold text
  strong: ({ children }) => (
    <strong className="font-bold" style={{ color: "var(--chatty-text)" }}>
      {children}
    </strong>
  ),

  // Italic text
  em: ({ children }) => (
    <em className="italic" style={{ color: "var(--chatty-text)" }}>
      {children}
    </em>
  ),

  // Strikethrough
  del: ({ children }) => (
    <del
      className="line-through"
      style={{ color: "var(--chatty-text)", opacity: 0.7 }}
    >
      {children}
    </del>
  ),

  // Underline (using <u> tag via remark plugin or custom component)
  // Note: Standard markdown doesn't have underline, but we can handle it if present

  // Headers
  h1: ({ children }) => (
    <h1
      className="text-3xl font-bold mb-4 mt-6"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      className="text-2xl font-bold mb-3 mt-5"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      className="text-xl font-bold mb-2 mt-4"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      className="text-lg font-semibold mb-2 mt-3"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5
      className="text-base font-semibold mb-1 mt-2"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6
      className="text-sm font-semibold mb-1 mt-2"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h6>
  ),

  // Lists with proper spacing and indentation
  ul: ({ children }) => (
    <ul
      className="list-disc list-outside mb-4 ml-6 space-y-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className="list-decimal list-outside mb-4 ml-6 space-y-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      className="pl-2"
      style={{ margin: "0.25rem 0", color: "var(--chatty-text)" }}
    >
      {children}
    </li>
  ),

  // Nested lists support
  // ReactMarkdown handles nested lists automatically, but we ensure proper indentation

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--chatty-text)", opacity: 0.8 }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-4 pl-4 italic my-4"
      style={{
        borderColor: "var(--chatty-line)",
        color: "var(--chatty-text)",
        opacity: 0.9,
      }}
    >
      {children}
    </blockquote>
  ),

  // Tables
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table
        className="min-w-full border-collapse border"
        style={{ borderColor: "var(--chatty-line)" }}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      className="border px-3 py-2 text-left font-semibold"
      style={{
        borderColor: "var(--chatty-line)",
        backgroundColor: "var(--chatty-bg-secondary)",
        color: "var(--chatty-text)",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="border px-3 py-2"
      style={{ borderColor: "var(--chatty-line)", color: "var(--chatty-text)" }}
    >
      {children}
    </td>
  ),

  // Render paragraphs as divs to avoid invalid nesting when markdown includes rich block nodes.
  p: ({ children }) => (
    <div className="mb-4 leading-relaxed" style={{ color: "var(--chatty-text)" }}>
      {children}
    </div>
  ),

  // Horizontal rule
  hr: () => (
    <hr
      className="my-6"
      style={{ borderColor: "var(--chatty-line)", opacity: 0.3 }}
    />
  ),
};

type MarkdownErrorBoundaryProps = {
  content: string;
  children: React.ReactNode;
};

type MarkdownErrorBoundaryState = {
  hasError: boolean;
};

class MarkdownErrorBoundary extends React.Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  state: MarkdownErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Markdown rendering failed", {
      error,
      content: this.props.content,
    });
  }

  componentDidUpdate(prevProps: MarkdownErrorBoundaryProps) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <pre
          className="whitespace-pre-wrap"
          style={{ margin: 0, color: "var(--chatty-text)" }}
        >
          {this.props.content}
        </pre>
      );
    }
    return this.props.children;
  }
}

const RENDERERS: Record<string, (pl: unknown) => React.ReactNode> = {
  "answer.v1": (pl) => {
    const { content, citations } = resolveAnswerPayload(pl as AnswerPacketPayload);
    if (!content) return null;
    return (
      <div>
        <MarkdownErrorBoundary content={content}>
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkBreaks]}
            className="prose-invert max-w-none break-words"
          >
            {content}
          </ReactMarkdown>
        </MarkdownErrorBoundary>
        <PacketCitations citations={citations} />
      </div>
    );
  },
  "housing.results.v1": (pl) => (
    <HousingResultCards payload={pl as HousingResultsPacketPayload} />
  ),
  "file.summary.v1": (pl) => (
    <div>
      📄 <strong>{isRecord(pl) && typeof pl.fileName === "string" ? pl.fileName : "(unnamed)"}</strong>
      {isRecord(pl) && typeof pl.summary === "string" ? <>: {pl.summary}</> : null}
    </div>
  ),
  "warn.v1": (pl) => (
    <div>⚠️ {isRecord(pl) && typeof pl.message === "string" ? pl.message : ""}</div>
  ),
  "error.v1": (pl) => (
    <div>❌ {isRecord(pl) && typeof pl.message === "string" ? pl.message : ""}</div>
  ),
};

function PacketView({ p }: { p: Packet }) {
  const fn = RENDERERS[p.op] || (() => <span>[missing-op: {p.op}]</span>);
  return <div>{fn(p.payload)}</div>;
}

export function R({ packets }: { packets: Packet[] }) {
  if (!Array.isArray(packets) || packets.length === 0) {
    return (
      <div style={{ opacity: 0.6, color: "var(--chatty-text)" }}>[empty]</div>
    );
  }
  const lastAnswerIndex = packets.reduce((latestIndex, packet, index) => (
    packet.op === "answer.v1" ? index : latestIndex
  ), -1);
  const toRender = lastAnswerIndex >= 0
    ? packets.filter((packet, index) => packet.op !== "answer.v1" || index === lastAnswerIndex)
    : packets;

  return (
    <>
      {toRender.map((p, i) => (
        <PacketView key={i} p={p} />
      ))}
    </>
  );
}

export default R;
