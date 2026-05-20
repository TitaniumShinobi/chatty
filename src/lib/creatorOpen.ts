export function normalizeInitialCreateMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildCreatorOpenState(
  returnTo: string,
  detail?: { initialMessage?: unknown } | null,
) {
  return {
    returnTo,
    initialCreateMessage: normalizeInitialCreateMessage(detail?.initialMessage),
  };
}
