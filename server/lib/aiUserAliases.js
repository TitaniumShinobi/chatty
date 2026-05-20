import fs from 'fs';

const USER_REGISTRY_URL = new URL('../../users.json', import.meta.url);

function normalizeEmailValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getRegistryPath() {
  return process.env.AI_AVATAR_USER_REGISTRY_PATH || USER_REGISTRY_URL;
}

export function getUserIdsForEmailFromRegistry(email) {
  const normalizedEmail = normalizeEmailValue(email);
  if (!normalizedEmail) return new Set();

  let registry = null;
  try {
    registry = JSON.parse(fs.readFileSync(getRegistryPath(), 'utf8'));
  } catch {
    return new Set();
  }

  const users = registry?.users && typeof registry.users === 'object'
    ? Object.values(registry.users)
    : [];

  return new Set(
    users
      .filter((user) => normalizeEmailValue(user?.email) === normalizedEmail)
      .map((user) => user?.user_id)
      .filter(Boolean)
      .map(String),
  );
}

export function buildOwnerCandidateIds({ userId = null, chattyUserId = null, email = null } = {}) {
  const ownerIds = new Set();
  if (userId) ownerIds.add(String(userId));
  if (chattyUserId) ownerIds.add(String(chattyUserId));
  const emailAliases = getUserIdsForEmailFromRegistry(email);
  for (const alias of emailAliases) {
    ownerIds.add(String(alias));
  }
  ownerIds.delete('');
  return ownerIds;
}

export function buildAIQueryUserIds({ userId = null, originalUserId = null, email = null } = {}) {
  const userIds = buildOwnerCandidateIds({
    userId,
    chattyUserId: originalUserId,
    email,
  });
  if (email) userIds.add(String(email));
  return Array.from(userIds).filter(Boolean);
}
