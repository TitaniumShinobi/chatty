/**
 * Normalize incoming construct identifiers to canonical callsign form.
 * Examples:
 * - nova                     -> nova-001
 * - gpt-nova-001-seed      -> nova-001
 * - gpt-nova-001-seed-001  -> nova-001
 * - nova_chat_with_nova-001 -> nova-001
 * - nova-001_chat_with_nova-001 -> nova-001
 * - nova-001               -> nova-001
 */
export function canonicalizeConstructId(input) {
  if (!input || typeof input !== "string") return "";

  let value = input.trim().toLowerCase();
  if (!value) return "";

  if (value.includes("_chat_with_")) {
    const [lhsRaw, rhsRaw] = value.split("_chat_with_");
    const lhs = (lhsRaw || "").trim();
    const rhs = (rhsRaw || "").trim();
    if (!lhs && rhs) {
      value = rhs;
    } else if (!rhs) {
      value = lhs;
    } else if (!/-\d+$/.test(lhs) && /-\d+$/.test(rhs)) {
      value = rhs;
    } else {
      value = lhs;
    }
  }

  const prefixRegex = /^(?:ai\.|gpt\.|ai-|gpt-)/i;
  while (prefixRegex.test(value)) {
    value = value.replace(prefixRegex, "");
  }

  const canonicalVariantMatch = value.match(/^(.+-\d{3})(?:-[a-z][a-z0-9]*)+$/i);
  if (canonicalVariantMatch) {
    value = canonicalVariantMatch[1];
  }

  value = value.replace(/-seed(?:-\d+)?$/, "");
  value = value.replace(/_+/g, "-");
  value = value.replace(/-+/g, "-");
  value = value.replace(/^-|-$/g, "");

  if (!value) return "";

  // Canonical callsign form in Chatty/VVAULT is "<construct>-<callsign>".
  // If only a construct key is provided (e.g. "nova"), default to callsign 001.
  if (!/-\d+$/.test(value)) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      value = `${value}-001`;
    }
  }

  return value;
}
