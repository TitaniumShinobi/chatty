import { ExternalLink } from "lucide-react";
import type { PacketCitation } from "../types";

export interface PacketCitationsProps {
  citations?: PacketCitation[];
  heading?: string;
}

function getHostname(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getCitationLabel(citation: PacketCitation, index: number): string {
  return (
    citation.title?.trim()
    || citation.label?.trim()
    || citation.source?.trim()
    || getHostname(citation.url)
    || `Source ${index}`
  );
}

function CitationTile({
  citation,
  fallbackIndex,
}: {
  citation: PacketCitation;
  fallbackIndex: number;
}) {
  const index = citation.index ?? fallbackIndex;
  const label = getCitationLabel(citation, index);
  const secondary = citation.source?.trim() || getHostname(citation.url);
  const snippet = citation.snippet?.trim();
  const content = (
    <div
      className="rounded-xl px-3 py-2 transition-colors"
      style={{
        backgroundColor: "var(--chatty-bg-secondary)",
        border: "1px solid var(--chatty-line)",
        color: "var(--chatty-text)",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "var(--chatty-text)",
          }}
        >
          [{index}]
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium leading-5 break-words">{label}</span>
            {citation.url ? (
              <ExternalLink
                size={14}
                className="mt-0.5 shrink-0"
                style={{ opacity: 0.7 }}
              />
            ) : null}
          </div>
          {secondary && secondary !== label ? (
            <div className="mt-1 text-xs break-words" style={{ opacity: 0.7 }}>
              {secondary}
            </div>
          ) : null}
          {snippet ? (
            <div className="mt-1 text-xs leading-5 break-words" style={{ opacity: 0.82 }}>
              {snippet}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (!citation.url) {
    return content;
  }

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      style={{ textDecoration: "none" }}
    >
      {content}
    </a>
  );
}

export default function PacketCitations({
  citations,
  heading = "Sources",
}: PacketCitationsProps) {
  if (!Array.isArray(citations) || citations.length === 0) return null;

  return (
    <div
      className="mt-3 pt-3"
      style={{ borderTop: "1px solid var(--chatty-line)", color: "var(--chatty-text)" }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ opacity: 0.7 }}>
        {heading}
      </div>
      <div className="grid gap-2">
        {citations.map((citation, index) => (
          <CitationTile
            key={`${citation.url ?? citation.title ?? citation.label ?? "citation"}-${citation.index ?? index}`}
            citation={citation}
            fallbackIndex={index + 1}
          />
        ))}
      </div>
    </div>
  );
}
