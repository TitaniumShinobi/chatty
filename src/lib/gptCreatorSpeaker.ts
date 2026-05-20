export type CreatorSpeakerRole = "user" | "assistant" | "unknown";

export function normalizeCreatorSpeakerRole(role: unknown): CreatorSpeakerRole {
  if (typeof role !== "string") return "unknown";
  const normalized = role.trim().toLowerCase();
  if (normalized === "user") return "user";
  if (normalized === "assistant") return "assistant";
  return "unknown";
}

export function getCreatorSpeakerLabel(role: unknown): string {
  const normalized = normalizeCreatorSpeakerRole(role);
  if (normalized === "assistant") return "Lin:";
  if (normalized === "user") return "You:";
  return "";
}
