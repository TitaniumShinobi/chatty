/**
 * VVAULT registry layer.
 *
 * Supabase Storage is the authority for construct existence. Local DB rows are
 * projections; filesystem paths are cache at most.
 */

import { canonicalizeConstructId } from './constructId.js';
import { getSupabaseClient } from './supabaseClient.js';

const SHARD = 'shard_0000';
const BUCKET = 'vault-files';

type Scope = 'sovereign' | 'user';

export type ResolvedConstruct = {
  id: string;
  scope: Scope;
  owner: string;
  rootPath: string;
  authority: 'supabase';
};

type PathExists = (rootPath: string) => Promise<boolean>;

export async function resolveConstructWithPathExists(
  id: string,
  userId: string | null,
  pathExists: PathExists,
): Promise<ResolvedConstruct | null> {
  const normalized = canonicalizeConstructId(id);
  if (!normalized) return null;

  const sovereignPaths = [
    `intelligences/${SHARD}/${normalized}`,
    `instances/${SHARD}/${normalized}`,
  ];

  for (const rootPath of sovereignPaths) {
    if (await pathExists(rootPath)) {
      return { id: normalized, scope: 'sovereign', owner: 'system', rootPath, authority: 'supabase' };
    }
  }

  if (userId && typeof userId === 'string') {
    const owner = userId.trim();
    const rootPath = `users/${SHARD}/${owner}/instances/${normalized}`;
    if (await pathExists(rootPath)) {
      return { id: normalized, scope: 'user', owner, rootPath, authority: 'supabase' };
    }
  }

  return null;
}

export async function resolveConstruct(id: string, userId: string | null): Promise<ResolvedConstruct | null> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not initialized (service role required)');

  const pathExists = async (rootPath: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).list(rootPath, { limit: 1 });
    if (error) throw new Error(`Supabase storage.list failed for ${rootPath}: ${error.message}`);
    return Array.isArray(data) && data.length > 0;
  };

  return resolveConstructWithPathExists(id, userId, pathExists);
}
