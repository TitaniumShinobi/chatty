const mirrorSessions = new Map();

export function setMirrorSession(constructId, threadId, { active, permission, source }) {
  const key = `${constructId}:${threadId}`;
  mirrorSessions.set(key, {
    active: Boolean(active),
    permission: permission || null,
    source: source || null,
    startedAt: active ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });
}

export function getMirrorSession(constructId, threadId) {
  const key = `${constructId}:${threadId}`;
  return mirrorSessions.get(key) || { active: false, permission: null, source: null, startedAt: null, updatedAt: null };
}

export function clearMirrorSession(constructId, threadId) {
  const key = `${constructId}:${threadId}`;
  const existing = mirrorSessions.get(key);
  if (existing) {
    existing.active = false;
    existing.updatedAt = new Date().toISOString();
    mirrorSessions.set(key, existing);
  }
}
