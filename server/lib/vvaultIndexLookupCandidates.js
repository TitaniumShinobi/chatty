const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeLookupValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(no req.user.email)") {
    return null;
  }
  return trimmed;
}

export function isUuidLikeLookupId(value) {
  const normalized = normalizeLookupValue(value);
  return Boolean(normalized && UUID_LIKE_REGEX.test(normalized));
}

export function buildConversationIndexLookupCandidates(values = []) {
  return Array.from(
    new Set(
      values
        .map(normalizeLookupValue)
        .filter((value) => Boolean(value) && isUuidLikeLookupId(value)),
    ),
  );
}
