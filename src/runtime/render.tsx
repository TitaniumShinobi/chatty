import React from "react";
import ReactMarkdown from "react-markdown";
import { CompressedCodeBlock } from "../components/CompressedCodeBlock";
import type { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

type Packet = { op: string; payload?: any };

function renderAnswer(pl: any): string {
  if (typeof pl === "string") return pl;
  if (typeof pl?.content === "string") return pl.content;
  if (Array.isArray(pl)) return pl.join("\n");
  if (Array.isArray(pl?.content)) return pl.content.join("\n");
  try {
    return JSON.stringify(pl ?? "", null, 2);
  } catch {
    return String(pl ?? "");
  }
}

const markdownComponents: Components = {
  // Code blocks with syntax highlighting
  code({ node, inline, className, children }: any) {
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

  // Paragraphs with proper spacing
  p: ({ children }) => (
    <p className="mb-4 leading-relaxed" style={{ color: "var(--chatty-text)" }}>
      {children}
    </p>
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

  componentDidCatch(error: any) {
    console.error("Markdown rendering failed", {
      error,
      content: this.props.content,
    });
  }

  componentDidUpdate(prevProps: MarkdownErrorBoundaryProps) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      // eslint-disable-next-line react/no-did-update-set-state
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

const RENDERERS: Record<string, (pl: any) => React.ReactNode> = {
  "answer.v1": (pl) => {
    const content = renderAnswer(pl);
    if (!content) return null;
    return (
      <MarkdownErrorBoundary content={content}>
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={[remarkBreaks]}
          className="prose-invert max-w-none break-words"
        >
          {content}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    );
  },
  "file.summary.v1": (pl) => (
    <div>
      📄 <strong>{pl?.fileName ?? "(unnamed)"}</strong>
      {pl?.summary ? <>: {pl.summary}</> : null}
    </div>
  ),
  "warn.v1": (pl) => <div>⚠️ {pl?.message ?? ""}</div>,
  "error.v1": (pl) => <div>❌ {pl?.message ?? ""}</div>,
};

function PacketView({ p }: { p: Packet }) {
  const fn = RENDERERS[p.op] || ((_pl) => <span>[missing-op: {p.op}]</span>);
  return <div>{fn(p.payload)}</div>;
}

export function R({ packets }: { packets: Packet[] }) {
  if (!Array.isArray(packets) || packets.length === 0) {
    return (
      <div style={{ opacity: 0.6, color: "var(--chatty-text)" }}>[empty]</div>
    );
  }
  const nonAnswers = packets.filter((p) => p.op !== "answer.v1");
  const lastAnswer = [...packets].reverse().find((p) => p.op === "answer.v1");
  const toRender = lastAnswer
    ? [...nonAnswers, lastAnswer]
    : nonAnswers.length
      ? nonAnswers
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
