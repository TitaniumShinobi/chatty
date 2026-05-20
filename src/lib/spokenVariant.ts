/**
 * Produces a speech-friendly variant of assistant message text for TTS.
 * Written chat style (narrative, formatting) is not the same as spoken style.
 * Use this before speaking so voice replies sound direct and natural.
 */
export function toSpokenVariant(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";

  let out = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strip common narrative/third-person framing (e.g. "Nova says:", "Zen replies:")
  out = out.replace(/^\s*(?:Nova|Zen|Lin|Chatty|Assistant)\s+(?:says?|replies?|responds?|answers?)\s*[:\-]\s*/i, "");
  out = out.replace(/^\s*\[(?:Nova|Zen|Lin|Chatty|Assistant)\]\s*[:\-]?\s*/i, "");

  // Strip markdown: headers first, then bold (so ** isn't consumed by *), then stage directions, then italic
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*[^*]+\*/g, " "); // *action* / *stage direction* and *italic* -> space or keep; we drop for natural speech
  out = out.replace(/_([^_]+)_/g, "$1"); // _italic_ -> text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [text](url) -> text
  out = out.replace(/^>\s*/gm, "");

  // Trim written-chat openers that sound stiff when read aloud
  out = out.replace(
    /^\s*(?:Here'?s\s+(?:what\s+I\s+think|the\s+thing|a\s+quick\s+summary)[.:]\s*|Sure,?\s*|Well,?\s*|So,?\s*|Okay,?\s*|Alright,?\s*|Let\s+me\s+explain\.\s*|To\s+clarify,?\s*|Just\s+to\s+clarify,?\s*)/i,
    ""
  );

  // Collapse repeated spaces and newlines for a more natural flow
  out = out.replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();

  return out || rawText.trim();
}
