/**
 * VSI Runner (minimal)
 *
 * File-spool executor that processes APPROVED manifests and writes append-only audit logs.
 * This is the first step toward per-VSI isolated runtimes: run this script inside a container
 * with a dedicated volume mounted at VVAULT_VSI_ROOT.
 *
 * Usage:
 *   node server/scripts/vsi-runner.js --once
 *   node server/scripts/vsi-runner.js --poll 2
 *
 * Env:
 *   VSI_SPOOL_DIR=/vvault/spool/vsi
 *   VVAULT_VSI_ROOT=/vvault/intelligences
 *   VSI_RUNNER_POLL_MS=2000
 *   VSI_RUNNER_TIMEOUT_MS=5000
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { z } from 'zod';

const ManifestSchema = z.object({
  manifestId: z.string().min(1),
  actor: z.string().min(1),
  scope: z.string().min(1),
  target: z.string().min(1),
  action: z.string().min(1),
  status: z.enum(['proposed', 'previewing', 'approved', 'rejected', 'executed', 'rolled_back', 'expired']),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  rationale: z.string().optional().nullable(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
}).passthrough();

const SPOOL_DIR = process.env.VSI_SPOOL_DIR || '/vvault/spool/vsi';
const EXECUTED_DIR = path.join(SPOOL_DIR, 'executed');
const FAILED_DIR = path.join(SPOOL_DIR, 'failed');
const HEARTBEAT = path.join(SPOOL_DIR, 'runner.heartbeat');
const JOB_TIMEOUT = Number(process.env.VSI_RUNNER_TIMEOUT_MS || '5000');

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const out = { once: false, pollSeconds: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') out.once = true;
    if (a === '--poll') out.pollSeconds = Number(argv[++i] || '0') || 0;
  }
  if (!out.once && out.pollSeconds <= 0) out.once = true;
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeJoin(root, rel) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, rel.replace(/^\/+/, ''));
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(`Path escapes root: ${rel}`);
  }
  return resolved;
}

function logAudit(manifest, event, details) {
  ensureDir(SPOOL_DIR);
  const line = JSON.stringify({
    timestamp: nowIso(),
    event,
    actor: manifest.actor,
    manifestId: manifest.manifestId,
    scope: manifest.scope,
    target: manifest.target,
    action: manifest.action,
    ...details,
  }) + '\n';
  fs.appendFileSync(path.join(SPOOL_DIR, 'vsi_runner.audit.log'), line);

  const vsiRoot = process.env.VVAULT_VSI_ROOT;
  if (vsiRoot) {
    const logDir = safeJoin(vsiRoot, path.join(manifest.actor, 'logs'));
    ensureDir(logDir);
    fs.appendFileSync(path.join(logDir, 'vsi_runner.audit.log'), line);
  }
}

function listJsonFiles(spoolDir) {
  if (!fs.existsSync(spoolDir)) return [];
  return fs
    .readdirSync(spoolDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(spoolDir, f));
}

function readManifest(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return ManifestSchema.parse(data);
}

function writeManifest(filePath, manifest) {
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
}

function executeManifest(manifest) {
  const vsiRoot = process.env.VVAULT_VSI_ROOT;
  if (!vsiRoot) {
    throw new Error('VVAULT_VSI_ROOT must be set for runner execution');
  }

  // First deliverable: safe, filesystem-level actions only.
  // All targets are interpreted relative to the VSI root.
  if (manifest.action === 'list_dir') {
    const dirPath = safeJoin(vsiRoot, manifest.target);
    const items = fs.readdirSync(dirPath).slice(0, 200);
    return { success: true, items };
  }

  if (manifest.action === 'read_file') {
    const file = safeJoin(vsiRoot, manifest.target);
    const stat = fs.statSync(file);
    if (stat.size > 1_000_000) {
      throw new Error(`Refusing to read >1MB file via read_file (size=${stat.size})`);
    }
    const content = fs.readFileSync(file, 'utf-8');
    return { success: true, content };
  }

  throw new Error(`Unsupported action: ${manifest.action}`);
}

function writeArtifact(manifest, artifact) {
  const vsiRoot = process.env.VVAULT_VSI_ROOT;
  if (!vsiRoot) return;
  const outDir = safeJoin(vsiRoot, path.join(manifest.actor, 'artifacts', 'vsi-runner'));
  ensureDir(outDir);
  const outPath = path.join(outDir, `${manifest.manifestId}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ manifest, artifact }, null, 2) + '\n');
}

function processOne(filePath) {
  let manifest;
  try {
    manifest = readManifest(filePath);
  } catch (err) {
    const badPath = filePath.replace(/\.json$/, '.invalid.json');
    fs.renameSync(filePath, badPath);
    return { ok: false, error: `invalid manifest: ${err.message}` };
  }

  if (manifest.status !== 'approved') {
    return { ok: true, skipped: true };
  }

  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isFinite(expiresAt.getTime()) && expiresAt < new Date()) {
    manifest.status = 'expired';
    writeManifest(filePath, manifest);
    logAudit(manifest, 'expired', {});
    return { ok: true, expired: true };
  }

  logAudit(manifest, 'execute_start', {});

  try {
    const result = runWithTimeout(() => executeManifest(manifest));
    manifest.status = 'executed';
    manifest.executedAt = nowIso();
    manifest.executionResult = result;
    try {
      writeArtifact(manifest, result);
    } catch (artifactErr) {
      logAudit(manifest, 'artifact_fail', { error: artifactErr.message });
    }
    writeManifest(filePath, manifest);
    logAudit(manifest, 'execute_ok', { result: result.success ? 'success' : 'failed' });
    moveProcessed(filePath, EXECUTED_DIR);
    return { ok: true };
  } catch (err) {
    manifest.executionResult = { success: false, error: err.message };
    try {
      writeArtifact(manifest, manifest.executionResult);
    } catch (artifactErr) {
      logAudit(manifest, 'artifact_fail', { error: artifactErr.message });
    }
    writeManifest(filePath, manifest);
    logAudit(manifest, 'execute_fail', { error: err.message });
    moveProcessed(filePath, FAILED_DIR);
    return { ok: false, error: err.message };
  }
}

function runOnce() {
  ensureDir(SPOOL_DIR);
  ensureDir(EXECUTED_DIR);
  ensureDir(FAILED_DIR);
  const files = listJsonFiles(SPOOL_DIR);
  let processed = 0;
  for (const f of files) {
    processOne(f);
    processed++;
  }
  return processed;
}

function moveProcessed(src, destDir) {
  try {
    ensureDir(destDir);
    const base = path.basename(src);
    fs.renameSync(src, path.join(destDir, base));
  } catch {
    // best effort
  }
}

function runWithTimeout(fn) {
  const timeout = JOB_TIMEOUT;
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`runner timeout after ${timeout}ms`)), timeout);
    Promise.resolve()
      .then(fn)
      .then((val) => {
        clearTimeout(to);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(to);
        reject(err);
      });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.once) {
    const processed = runOnce();
    console.log(`[vsi-runner] processed=${processed}`);
    return;
  }

  console.log(`[vsi-runner] polling every ${args.pollSeconds}s`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    runOnce();
    try {
      ensureDir(path.dirname(HEARTBEAT));
      fs.writeFileSync(HEARTBEAT, nowIso());
    } catch {
      // ignore heartbeat failures
    }
    await new Promise((r) => setTimeout(r, args.pollSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(`[vsi-runner] fatal: ${err.message}`);
  process.exit(1);
});
