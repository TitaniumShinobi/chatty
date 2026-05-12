import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || '';
const USER_SHARD = 'shard_0000';

export function expandHomeDir(input) {
  if (!input || typeof input !== 'string') return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function getVvaultBasePath() {
  const configured =
    process.env.VVAULT_ROOT_PATH ||
    process.env.VVAULT_PATH ||
    process.env.VVAULT_ROOT ||
    DEFAULT_VVAULT_ROOT;
  return path.resolve(expandHomeDir(configured));
}

export function buildConstructIdentityDirCandidates({
  constructId,
  userId = null,
  supabaseUserId = null,
  basePath = getVvaultBasePath(),
}) {
  const candidates = [
    supabaseUserId
      ? path.join(basePath, 'users', USER_SHARD, supabaseUserId, 'instances', constructId, 'identity')
      : null,
    userId
      ? path.join(basePath, 'users', USER_SHARD, userId, 'instances', constructId, 'identity')
      : null,
    userId
      ? path.join(basePath, 'users', userId, 'instances', constructId, 'identity')
      : null,
    path.join(basePath, 'instances', constructId, 'identity'),
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function directoryExists(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function findConstructIdentityDir(options) {
  const candidates = buildConstructIdentityDirCandidates(options);
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      return candidate;
    }
  }
  return null;
}
