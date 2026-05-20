import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_DIR = path.join(PROJECT_ROOT, 'documents', 'agents');
const MANIFEST_PATH = path.join(AGENT_DIR, 'index.json');

const cache = new Map();

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: 'unknown', roles: {} };
  }
}

export function getAgentsManifest() {
  const manifest = readManifest();
  const roles = {};
  for (const [key, val] of Object.entries(manifest.roles || {})) {
    roles[key] = {
      ...val,
      absolutePath: path.join(AGENT_DIR, val.file),
    };
  }
  return { version: manifest.version || 'unknown', roles };
}

export function loadRolePrompt(role) {
  const roleKey = (role || '').toUpperCase();
  if (!roleKey) throw new Error('role required');

  const manifest = getAgentsManifest();
  const entry = manifest.roles[roleKey];
  const filePath = entry?.absolutePath || path.join(AGENT_DIR, `${roleKey}.md`);

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    const available = Object.keys(manifest.roles);
    throw new Error(`role prompt not found for ${roleKey}; available: ${available.join(', ')}`);
  }

  const cached = cache.get(roleKey);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return { role: roleKey, prompt: cached.content, sha256: cached.sha256 };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const digest = sha256(content);
  cache.set(roleKey, { mtimeMs: stat.mtimeMs, content, sha256: digest });
  return { role: roleKey, prompt: content, sha256: digest };
}

export default {
  getAgentsManifest,
  loadRolePrompt,
};
