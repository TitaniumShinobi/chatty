import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCanonicalOwnerSupabaseUserId,
  resolveCanonicalOwnerSupabaseUserId,
} from './constructSovereigntyPolicy.js';
import { getVvaultBasePath } from './vvaultPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OPTIMIZED_ZEN_BUILD_CANDIDATES = [
  path.join(__dirname, '..', 'dist', 'src', 'engine', 'optimizedZen.js'),
  path.join(__dirname, '..', 'dist', 'engine', 'optimizedZen.js'),
];

export function resolveOptimizedZenBuildArtifact() {
  const compiledJsPath =
    OPTIMIZED_ZEN_BUILD_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ??
    OPTIMIZED_ZEN_BUILD_CANDIDATES[0];
  return {
    compiledJsPath,
    candidates: OPTIMIZED_ZEN_BUILD_CANDIDATES,
    exists: fs.existsSync(compiledJsPath),
  };
}

export function checkDbHealth(dbPath = path.join(PROJECT_ROOT, 'chatty.db')) {
  try {
    const exists = fs.existsSync(dbPath);
    return {
      ok: exists,
      detail: exists ? 'db file present' : `missing db file at ${dbPath}`,
      latencyMs: 0,
    };
  } catch (error) {
    return { ok: false, detail: error.message, latencyMs: 0 };
  }
}

export async function checkMemoryHealth() {
  return { ok: true, detail: 'memory health check not configured', latencyMs: 0 };
}

export function checkVvaultHealth() {
  const root = getVvaultBasePath();
  try {
    const stat = fs.statSync(root);
    return {
      ok: stat.isDirectory(),
      detail: { path: root, isDirectory: stat.isDirectory() },
      latencyMs: 0,
    };
  } catch (error) {
    return { ok: false, detail: error.message, latencyMs: 0 };
  }
}

export function checkBuildHealth() {
  const { compiledJsPath, candidates, exists } = resolveOptimizedZenBuildArtifact();
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    ok: exists || !isProduction,
    detail: {
      compiledJsPath,
      candidates,
      environment: isProduction ? 'production' : 'development',
      exists,
    },
    latencyMs: 0,
  };
}

export async function checkProviderHealth() {
  const hasKey = Boolean(process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY);
  return {
    ok: hasKey,
    detail: hasKey ? 'provider key configured' : 'no provider key configured',
    latencyMs: 0,
  };
}

export function checkCanonicalOwnerHealth(env = process.env) {
  const canonicalOwnerSupabaseUserId = resolveCanonicalOwnerSupabaseUserId(env);
  const ok = isCanonicalOwnerSupabaseUserId(canonicalOwnerSupabaseUserId);
  return {
    ok,
    detail: {
      canonicalOwnerSupabaseUserId: canonicalOwnerSupabaseUserId || null,
      configured: ok,
      source: ok ? 'construct_sovereignty_policy' : 'missing_or_invalid',
    },
    latencyMs: 0,
  };
}

export async function runAllHealthChecks(includeProvider = true) {
  const components = {
    app: { ok: true, detail: 'server alive', latencyMs: 0 },
    db: checkDbHealth(),
    memory: await checkMemoryHealth(),
    vvault: checkVvaultHealth(),
    build: checkBuildHealth(),
    canonicalOwner: checkCanonicalOwnerHealth(),
  };
  if (includeProvider) {
    components.provider = await checkProviderHealth();
  }
  const ok = Object.values(components).every((entry) => entry.ok !== false);
  return { ok, components };
}

export default {
  checkDbHealth,
  checkMemoryHealth,
  checkVvaultHealth,
  checkBuildHealth,
  checkCanonicalOwnerHealth,
  checkProviderHealth,
  resolveOptimizedZenBuildArtifact,
  runAllHealthChecks,
};
