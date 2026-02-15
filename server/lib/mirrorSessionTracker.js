const mirrorSessions = new Map();

export function setMirrorSession(constructId, threadId, { active, permission, source, userId }) {
  const key = `${constructId}:${threadId}`;
  mirrorSessions.set(key, {
    active: Boolean(active),
    permission: permission || null,
    source: source || null,
    userId: userId || null,
    startedAt: active ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });
}

export function getMirrorSession(constructId, threadId) {
  const key = `${constructId}:${threadId}`;
  return mirrorSessions.get(key) || { active: false, permission: null, source: null, userId: null, startedAt: null, updatedAt: null };
}

export function clearMirrorSession(constructId, threadId, userId) {
  const key = `${constructId}:${threadId}`;
  const existing = mirrorSessions.get(key);
  if (existing) {
    if (userId && existing.userId && existing.userId !== userId) {
      console.warn(`[MirrorTracker] User ${userId} attempted to clear session owned by ${existing.userId}`);
      return false;
    }
    existing.active = false;
    existing.updatedAt = new Date().toISOString();
    mirrorSessions.set(key, existing);
  }
  return true;
}
