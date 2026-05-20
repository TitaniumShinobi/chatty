import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setImmediate } from 'timers';
import process from 'node:process';
import { assertConstructSovereignty, isCanonicalOwner } from './constructSovereigntyPolicy.js';
import { AIManager } from './aiManager.js';
import {
  buildForgedSimConfigJson,
  buildOllamaLockedModelFromCallsign,
} from './forgedSimLock.js';
import { getSupabaseClient } from './supabaseClient.js';
import { resolveSupabaseUserId } from '../auth/lib/supabaseUserResolver.js';
import { getVvaultBasePath } from './vvaultPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILD_SCRIPT = join(__dirname, '../../scripts/build_sims.py');
const MAX_LOG_LINES = 200;
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const BUILD_INSTANCES_DIR = join(getVvaultBasePath(), 'instances');
const BUILD_BASE_MODEL = 'phi3:latest';

function createJobId() {
  return `sim-build-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function appendLog(job, line) {
  job.logsTail.push(line);
  if (job.logsTail.length > MAX_LOG_LINES) job.logsTail.shift();
}

function isValidConstructCallsign(callsign) {
  const normalized = String(callsign || '').trim().toLowerCase();
  if (!normalized) return false;
  // Keep callsign format strict to avoid path/arg abuse.
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized);
}

function isPlatformConstruct(callsign) {
  const normalized = String(callsign || '').trim().toLowerCase();
  return normalized === 'zen' || normalized === 'zen-001' || normalized === 'lin' || normalized === 'lin-001';
}

function resolveActorCandidateIds(actor = {}) {
  return Array.from(
    new Set(
      [
        actor.userId,
        actor.id,
        actor.uid,
        actor.sub,
        actor.email,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

async function persistForgedSimLock(job) {
  const lockedModel = buildOllamaLockedModelFromCallsign(job.normalizedCallsign);
  if (!lockedModel) {
    return { applied: false, error: 'invalid_locked_model' };
  }

  const aiManager = AIManager.getInstance();
  const actorIds = resolveActorCandidateIds(job.actor);
  let existingAI = null;
  for (const actorId of actorIds) {
    existingAI = await aiManager.getAIByCallsign(job.normalizedCallsign, actorId);
    if (existingAI) break;
  }

  if (!existingAI) {
    return {
      applied: false,
      error: 'ai_not_found_for_callsign',
      constructCallsign: job.normalizedCallsign,
    };
  }

  const nextConfigJson = buildForgedSimConfigJson(existingAI.configJson || null, {
    constructCallsign: job.normalizedCallsign,
    lockedModel,
    source: 'construct_sim_build',
    forgedFromMode: 'lin',
    modeLabel: 'lin-derived sim',
    kind: 'lin-derived-sim',
    forgedAt: new Date().toISOString(),
  });

  const updatedAI = await aiManager.updateAI(existingAI.id, {
    provider: 'ollama',
    modelId: lockedModel,
    conversationModel: lockedModel,
    creativeModel: lockedModel,
    codingModel: lockedModel,
    orchestrationMode: 'sim',
    configJson: nextConfigJson,
  });

  if (!updatedAI) {
    return {
      applied: false,
      error: 'ai_update_failed',
      constructCallsign: job.normalizedCallsign,
    };
  }

  let supabaseMirror = {
    attempted: false,
    applied: false,
    error: null,
  };
  const supabase = getSupabaseClient();
  if (supabase) {
    supabaseMirror.attempted = true;
    try {
      const { supabaseUserId } = await resolveSupabaseUserId({
        email: job.actor?.email,
        chattyUserId: existingAI.userId || job.actor?.id || job.actor?.sub || job.actor?.uid || null,
      });
      if (supabaseUserId) {
        const payload = {
          construct_call_sign: job.normalizedCallsign,
          name: updatedAI.name,
          description: updatedAI.description || '',
          system_prompt_override: updatedAI.instructions || '',
          model: lockedModel,
          provider: 'ollama',
          capabilities: updatedAI.capabilities || {},
          tags: updatedAI.tags || [],
          categories: updatedAI.categories || [],
          avatar_url: updatedAI.avatarUrl || updatedAI.avatar || null,
          config_json: nextConfigJson,
          conversation_starters: updatedAI.conversationStarters || [],
          user_id: supabaseUserId,
        };
        const { error } = await supabase
          .from('ais')
          .upsert(payload, { onConflict: 'construct_call_sign' });
        if (error) {
          supabaseMirror.error = error.message;
        } else {
          supabaseMirror.applied = true;
        }
      } else {
        supabaseMirror.error = 'supabase_user_unresolved';
      }
    } catch (error) {
      supabaseMirror.error = error?.message || String(error);
    }
  }

  try {
    const { scaffoldConstruct } = await import('./constructScaffolder.js');
    await scaffoldConstruct(job.normalizedCallsign, updatedAI, {
      userId: updatedAI.userId,
      userEmail: job.actor?.email,
      localOnly: true,
      syncGenerated: true,
    });
  } catch (error) {
    return {
      applied: false,
      error: 'construct_scaffold_sync_failed',
      message: error?.message || String(error),
      constructCallsign: job.normalizedCallsign,
      aiId: updatedAI.id,
      lockedModel,
    };
  }

  return {
    applied: true,
    aiId: updatedAI.id,
    constructCallsign: job.normalizedCallsign,
    lockedModel,
    modeLabel: 'lin-derived sim',
    source: 'construct_sim_build',
    supabaseMirror,
  };
}

function createConstructSimBuildService() {
  const jobs = new Map();
  const activeBuildByCallsign = new Map();

  function startJob(callsign, options = {}) {
    const normalizedCallsign = String(callsign || '').trim().toLowerCase();
    const dryRun = options.dryRun !== false;
    const includeCapsuleSummary = options.includeCapsuleSummary !== false;
    const acceptedAt = new Date().toISOString();
    const jobId = createJobId();

    if (!isValidConstructCallsign(normalizedCallsign)) {
      throw Object.assign(new Error('invalid_callsign'), { statusCode: 400 });
    }

    if (isPlatformConstruct(normalizedCallsign) && !isCanonicalOwner(options.actor || {})) {
      throw Object.assign(new Error('platform_construct_managed'), { statusCode: 403 });
    }

    assertConstructSovereignty({
      constructCallsign: normalizedCallsign,
      actor: options.actor || {},
      operation: 'simforge_build',
    });

    const activeJobId = activeBuildByCallsign.get(normalizedCallsign);
    if (activeJobId) {
      const running = jobs.get(activeJobId);
      if (running && (running.status === 'queued' || running.status === 'running')) {
        throw Object.assign(new Error('build_already_running_for_construct'), {
          statusCode: 409,
          activeJobId,
        });
      }
    }

    const job = {
      jobId,
      normalizedCallsign,
      status: 'queued',
      acceptedAt,
      mode: dryRun ? 'dry-run' : 'build',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      summary: null,
      logsTail: [],
      requestId: options.requestId || null,
      actor: options.actor || {},
      instancesDir: BUILD_INSTANCES_DIR,
      baseModel: BUILD_BASE_MODEL,
    };

    jobs.set(jobId, job);
    activeBuildByCallsign.set(normalizedCallsign, jobId);

    const args = ['python3', BUILD_SCRIPT, '--instances-dir', BUILD_INSTANCES_DIR, '--base-model', BUILD_BASE_MODEL, '--callsign', normalizedCallsign];
    if (dryRun) args.push('--dry-run');
    if (includeCapsuleSummary) args.push('--include-capsule-summary');

    setImmediate(() => _runBuild(job, jobId, args));

    return { jobId, normalizedCallsign, status: 'queued', acceptedAt, mode: job.mode };
  }

  function _runBuild(job, jobId, args) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    const [cmd, ...cmdArgs] = args;
    const proc = spawn(cmd, cmdArgs, {
      cwd: join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      job.status = 'timed_out';
      job.finishedAt = new Date().toISOString();
      job.exitCode = null;
      job.summary = { error: 'build_timed_out', timeoutMs: BUILD_TIMEOUT_MS };
      if (activeBuildByCallsign.get(job.normalizedCallsign) === jobId) {
        activeBuildByCallsign.delete(job.normalizedCallsign);
      }
    }, BUILD_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) appendLog(job, `[stdout] ${line}`);
      }
    });

    proc.stderr.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) appendLog(job, `[stderr] ${line}`);
      }
    });

    proc.on('close', async (code) => {
      clearTimeout(timeout);
      job.exitCode = code;
      if (code === 0 && job.mode === 'build') {
        try {
          const lockPersistence = await persistForgedSimLock(job);
          job.finishedAt = new Date().toISOString();
          job.status = lockPersistence.applied ? 'succeeded' : 'failed';
          job.summary = {
            exitCode: code,
            mode: job.mode,
            normalizedCallsign: job.normalizedCallsign,
            instancesDir: job.instancesDir,
            baseModel: job.baseModel,
            lockPersistence,
            simLock: lockPersistence.applied
              ? {
                  locked: true,
                  lockedModel: lockPersistence.lockedModel,
                  modeLabel: lockPersistence.modeLabel,
                  source: lockPersistence.source,
                }
              : null,
            error: lockPersistence.applied ? null : 'sim_lock_persist_failed',
          };
        } catch (error) {
          job.finishedAt = new Date().toISOString();
          job.status = 'failed';
          job.summary = {
            exitCode: code,
            mode: job.mode,
            normalizedCallsign: job.normalizedCallsign,
            instancesDir: job.instancesDir,
            baseModel: job.baseModel,
            error: 'sim_lock_persist_failed',
            lockPersistence: {
              applied: false,
              error: error?.message || String(error),
            },
            simLock: null,
          };
        }
      } else {
        job.finishedAt = new Date().toISOString();
        job.status = code === 0 ? 'succeeded' : 'failed';
        job.summary = {
          exitCode: code,
          mode: job.mode,
          normalizedCallsign: job.normalizedCallsign,
          instancesDir: job.instancesDir,
          baseModel: job.baseModel,
        };
      }
      if (activeBuildByCallsign.get(job.normalizedCallsign) === jobId) {
        activeBuildByCallsign.delete(job.normalizedCallsign);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.exitCode = null;
      job.summary = { error: 'spawn_failure', message: err.message };
      if (activeBuildByCallsign.get(job.normalizedCallsign) === jobId) {
        activeBuildByCallsign.delete(job.normalizedCallsign);
      }
    });
  }

  function getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  return { startJob, getJob, isPlatformConstruct };
}

const { startJob, getJob } = createConstructSimBuildService();

export { startJob, getJob, isPlatformConstruct, createConstructSimBuildService };
