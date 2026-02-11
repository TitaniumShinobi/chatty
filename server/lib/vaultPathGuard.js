/**
 * Vault Path Guard
 * 
 * Validates filenames before they are written to Supabase vault_files.
 * Prevents full internal VVAULT paths from being used as filenames.
 * 
 * CORRECT filename format: instances/{callsign}/identity/prompt.txt
 * WRONG filename format:   vvault/users/shard_0000/{userId}/instances/{callsign}/identity/prompt.txt
 * 
 * The user_id column identifies the user. The construct_id column identifies the construct.
 * Filenames are RELATIVE paths rooted at the user's workspace directory.
 */

const BLOCKED_PREFIXES = [
  'vvault/users/',
  '/vvault/users/',
  'vvault_files/users/',
  '/vvault_files/users/',
  '/Users/',
];

export function validateVaultFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, reason: 'Filename is required and must be a string' };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (filename.startsWith(prefix)) {
      return {
        valid: false,
        reason: `Filename must be a relative path (e.g., "instances/zen-001/identity/prompt.txt"), not a full internal path. Got: "${filename.substring(0, 80)}..."`
      };
    }
  }

  if (filename.includes('shard_0000')) {
    return {
      valid: false,
      reason: `Filename contains internal shard path segment. Use relative paths only. Got: "${filename.substring(0, 80)}..."`
    };
  }

  return { valid: true };
}

export function assertValidVaultFilename(filename) {
  const result = validateVaultFilename(filename);
  if (!result.valid) {
    console.error(`🚫 [VaultPathGuard] BLOCKED unsafe filename: ${filename}`);
    throw new Error(`[VaultPathGuard] ${result.reason}`);
  }
  return true;
}
