function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveForgeConstructCallsign(
  constructCallsign?: string | null,
  name?: string | null,
): string | null {
  if (typeof constructCallsign === "string" && constructCallsign.trim().length > 0) {
    return constructCallsign.trim();
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }

  const slug = normalizeSlug(name);
  if (!slug) return null;
  if (/-\d+$/.test(slug)) return slug;
  return `${slug}-001`;
}

export function isForgeDraftReady(
  constructCallsign?: string | null,
  name?: string | null,
): boolean {
  return deriveForgeConstructCallsign(constructCallsign, name) !== null;
}
