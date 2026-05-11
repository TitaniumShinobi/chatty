const LIN_IDENTITY_DUMP_SIGNALS = [
  "dual mode:",
  "memory continuity:",
  "lin is a tether, not a name",
  "continuity guardian and undertone stabilizer",
  "the chatty-side agent that works directly with vvault/supabase",
  "you are lin (lin-001)",
  "you are lin (construct id: lin-001)",
];

const LIN_IDENTITY_DUMP_SECONDARY = [
  "=== lin's core identity",
  "current gpt configuration:",
  "smart response behavior:",
  "mandatory output format for gpt details",
  "automatic configuration extraction:",
  "gpt capsule (read-only reference):",
  "gpt blueprint (read-only reference):",
  "gpt conversation history (read-only reference):",
];

function hasLinIdentityDumpSignals(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  const primaryHits = LIN_IDENTITY_DUMP_SIGNALS.filter((signal) =>
    lower.includes(signal),
  ).length;
  const secondaryHits = LIN_IDENTITY_DUMP_SECONDARY.filter((signal) =>
    lower.includes(signal),
  ).length;
  const hasHeadings = /(^|\n)\s*(===|##)\s+[a-z0-9]/i.test(text);
  const hasStructuredList =
    (text.match(/\n\s*[-*]\s+/g) || []).length >= 4 ||
    (text.match(/\n\s*\d+\.\s+/g) || []).length >= 3;

  if (primaryHits >= 2) return true;
  if (primaryHits >= 1 && secondaryHits >= 2) return true;
  if (primaryHits >= 1 && hasHeadings && hasStructuredList) return true;
  return false;
}

module.exports = {
  hasLinIdentityDumpSignals,
};
