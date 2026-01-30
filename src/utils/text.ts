const DATE_LINE_PATTERN =
  /^(?:#{1,6}\s*)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:\d{1,2},?\s+)?\d{4}\s*$/;

const VVAULT_TIMESTAMP_PATTERN =
  /^\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)(?:\s+[A-Z]{2,5})?\s+-\s+.+?\s+\[\d{4}-\d{2}-\d{2}T[^\]]+\]:\s*/;

const ROLE_LABEL_PATTERN = /^(Coding Expert|Creative Expert|Conversational Expert):\s*$/;

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
    .join("\n");

  return cleanedLines.trim();
}

export function normalizeParagraphs(text: string): string {
  if (!text) return "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function prepareMessageContent(raw: string | undefined): string {
  return normalizeParagraphs(sanitizeMessageText(raw || ""));
}
