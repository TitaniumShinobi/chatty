const DATE_LINE_PATTERN =
  /^(?:#{1,6}\s*)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:\d{1,2},?\s+)?\d{4}\s*$/;

const VVAULT_TIMESTAMP_PATTERN =
  /^\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)(?:\s+[A-Z]{2,5})?\s+-\s+.+?\s+\[\d{4}-\d{2}-\d{2}T[^\]]+\]:\s*/;

const ROLE_LABEL_PATTERN = /^(Coding Expert|Creative Expert|Conversational Expert):\s*$/;

const EQUALS_HEADING_PATTERN = /^={3,}\s*([A-Z][A-Z0-9 _#:-]+?)\s*={3,}\s*:?\s*$/;
const HASH_SUFFIX_HEADING_PATTERN = /^([A-Z][A-Z0-9 _-]+)\s*#{3,}\s*:?\s*$/;
const TRANSITION_LINE_PATTERN = /^-{3,}\s*(.+?)\s*-{3,}\s*:?\s*$/;

function normalizeTransitionLines(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(TRANSITION_LINE_PATTERN);
  if (!match) return line;
  
  const title = match[1].trim();
  return `### ${title}`;
}

function normalizePseudoHeadings(line: string): string {
  const trimmed = line.trim();
  
  let match = trimmed.match(EQUALS_HEADING_PATTERN);
  if (match) {
    const title = match[1]
      .replace(/[_#:-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
    return `## ${title}`;
  }
  
  match = trimmed.match(HASH_SUFFIX_HEADING_PATTERN);
  if (match) {
    const title = match[1]
      .replace(/[_#:-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
    return `## ${title}`;
  }
  
  return line;
}

export function sanitizeMessageText(text: string | undefined): string {
  if (!text) return "";

  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(VVAULT_TIMESTAMP_PATTERN, ""))
    .filter((line) => {
      const trimmed = line.trim();
      if (DATE_LINE_PATTERN.test(trimmed)) return false;
      if (ROLE_LABEL_PATTERN.test(trimmed)) return false;
      return true;
    })
    .map((line) => normalizePseudoHeadings(line))
    .map((line) => normalizeTransitionLines(line))
    .join("\n");

  return cleanedLines.trim();
}

export function normalizeParagraphs(text: string): string {
  if (!text) return "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function ensureParagraphBreaks(text: string): string {
  if (!text) return "";
  
  const codeBlockPattern = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const parts = text.split(codeBlockPattern);
  
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      return part.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
    })
    .join("");
}

export function prepareMessageContent(raw: string | undefined): string {
  const sanitized = sanitizeMessageText(raw || "");
  const withBreaks = ensureParagraphBreaks(sanitized);
  return normalizeParagraphs(withBreaks);
}
