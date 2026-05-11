import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILD_SCRIPT = join(__dirname, '../../scripts/build_sims.py');
const MAX_LOG_LINES = 200;
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

function createJobId() {
  return `zen-build-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function appendLog(job, line) {
  job.logsTail.push(line);
  if (job.logsTail.length > MAX_LOG_LINES) job.logsTail.shift();
}

/**
 * Create a Zen Sim build service instance with isolated state.
 * The module-level singleton is just one instance of this factory,
 * so production and test paths share identical logic with no drift risk.
 *
 * Enforces:
 *   - Argument allowlist only (no shell interpolation, no user memory data)
 *   - Single-flight lock per callsign
 *   - Bounded log ring buffer
 *   - Configurable build timeout
 */
function createZenSimBuildService() {
  const jobs = new Map();
  let activeBuildJobId = null;

  function startJob(normalizedCallsign, options = {}) {
    const dryRun = options.dryRun !== false;
    const includeCapsuleSummary = options.includeCapsuleSummary !== false;
    const acceptedAt = new Date().toISOString();
    const jobId = createJobId();

    if (activeBuildJobId) {
      const running = jobs.get(activeBuildJobId);
      if (running && (running.status === 'queued' || running.status === 'running')) {
        throw Object.assign(new Error('build_already_running_for_zen'), {
          statusCode: 409,
          activeJobId: activeBuildJobId,
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
    };

    jobs.set(jobId, job);
    activeBuildJobId = jobId;

    // Allowlist-only args — never interpolate user input into shell strings
    const args = ['python3', BUILD_SCRIPT, '--callsign', normalizedCallsign];
    if (dryRun) args.push('--dry-run');
    if (includeCapsuleSummary) args.push('--include-capsule-summary');
    // --watch intentionally excluded from API-triggered builds

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
      if (activeBuildJobId === jobId) activeBuildJobId = null;
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
    proc.on('close', (code) => {
      clearTimeout(timeout);
      job.exitCode = code;
      job.finishedAt = new Date().toISOString();
      job.status = code === 0 ? 'succeeded' : 'failed';
      job.summary = { exitCode: code, mode: job.mode, normalizedCallsign: job.normalizedCallsign };
      if (activeBuildJobId === jobId) activeBuildJobId = null;
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.exitCode = null;
      job.summary = { error: 'spawn_failure', message: err.message };
      if (activeBuildJobId === jobId) activeBuildJobId = null;
    });
  }

  function getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  return { startJob, getJob };
}

// Module-level singleton used by production routes.
// Identical to any test instance — no separate implementation.
const { startJob, getJob } = createZenSimBuildService();

export { startJob, getJob, createZenSimBuildService };
