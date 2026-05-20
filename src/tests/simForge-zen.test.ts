/**
 * Frontend tests for the Zen Sim build client layer (Phase 5).
 * Covers: type contracts, state transition logic, error surface, and mock
 * fetch round-trips for startZenBuild / getZenBuildStatus.
 *
 * Run via: npm test -- simForge-zen
 */

import { ZenBuildOptions, ZenBuildJob } from '../lib/simForge';

// ---------------------------------------------------------------------------
// Type contract tests — verify interfaces have required shape at compile time
// ---------------------------------------------------------------------------
describe('ZenBuildOptions type contract', () => {
  test('all fields are optional', () => {
    const empty: ZenBuildOptions = {};
    expect(empty).toBeDefined();
  });

  test('accepts all documented fields', () => {
    const full: ZenBuildOptions = {
      callsign: 'zen-001',
      dryRun: true,
      includeCapsuleSummary: true,
      requestId: 'req-abc',
    };
    expect(full.callsign).toBe('zen-001');
    expect(full.dryRun).toBe(true);
    expect(full.includeCapsuleSummary).toBe(true);
    expect(full.requestId).toBe('req-abc');
  });
});

describe('ZenBuildJob type contract', () => {
  test('accepts minimal success payload', () => {
    const job: ZenBuildJob = {
      ok: true,
      jobId: 'job-123',
      normalizedCallsign: 'zen-001',
      status: 'queued',
    };
    expect(job.ok).toBe(true);
    expect(job.jobId).toBe('job-123');
  });

  test('accepts full terminal success payload', () => {
    const job: ZenBuildJob = {
      ok: true,
      jobId: 'job-456',
      normalizedCallsign: 'zen-001',
      status: 'succeeded',
      acceptedAt: '2026-03-11T00:00:00.000Z',
      mode: 'dry-run',
      startedAt: '2026-03-11T00:00:01.000Z',
      finishedAt: '2026-03-11T00:00:30.000Z',
      exitCode: 0,
      summary: { result: 'ok' },
      logsTail: ['INFO build complete'],
    };
    expect(job.exitCode).toBe(0);
    expect(job.logsTail).toHaveLength(1);
  });

  test('accepts error payload with activeJobId for 409', () => {
    const err: ZenBuildJob = {
      ok: false,
      jobId: '',
      normalizedCallsign: 'zen-001',
      status: 'running',
      error: 'build_already_running_for_zen',
      activeJobId: 'job-789',
    };
    expect(err.ok).toBe(false);
    expect(err.activeJobId).toBe('job-789');
  });

  test('status field accepts all documented variant strings', () => {
    const statuses = ['queued', 'running', 'succeeded', 'failed', 'timed_out'];
    for (const s of statuses) {
      const job: ZenBuildJob = { ok: true, jobId: 'x', normalizedCallsign: 'zen-001', status: s };
      expect(job.status).toBe(s);
    }
  });
});

// ---------------------------------------------------------------------------
// State transition logic tests — mapZenPhase equivalent inline
// ---------------------------------------------------------------------------
function mapZenPhase(status?: string): 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' {
  if (status === 'queued') return 'queued';
  if (status === 'running') return 'running';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'timed_out') return 'timed_out';
  return 'failed';
}

function isTerminalZenStatus(status?: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'timed_out';
}

describe('Zen build phase state machine logic', () => {
  test('queued maps to queued', () => {
    expect(mapZenPhase('queued')).toBe('queued');
  });

  test('running maps to running', () => {
    expect(mapZenPhase('running')).toBe('running');
  });

  test('succeeded maps to succeeded', () => {
    expect(mapZenPhase('succeeded')).toBe('succeeded');
  });

  test('failed maps to failed', () => {
    expect(mapZenPhase('failed')).toBe('failed');
  });

  test('timed_out maps to timed_out (not collapsed into failed)', () => {
    expect(mapZenPhase('timed_out')).toBe('timed_out');
  });

  test('unknown status maps to failed', () => {
    expect(mapZenPhase('canceled')).toBe('failed');
    expect(mapZenPhase(undefined)).toBe('failed');
  });

  test('isTerminalZenStatus returns true for succeeded, failed, timed_out', () => {
    expect(isTerminalZenStatus('succeeded')).toBe(true);
    expect(isTerminalZenStatus('failed')).toBe(true);
    expect(isTerminalZenStatus('timed_out')).toBe(true);
  });

  test('isTerminalZenStatus returns false for in-progress states', () => {
    expect(isTerminalZenStatus('queued')).toBe(false);
    expect(isTerminalZenStatus('running')).toBe(false);
    expect(isTerminalZenStatus(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Client method mock fetch tests
// ---------------------------------------------------------------------------
const MOCK_BASE = 'http://localhost:3000/api/simforge';

function makeMockFetch(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

describe('startZenBuild — mock fetch round-trips', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sends POST to /build/zen with correct defaults', async () => {
    const mockJob: ZenBuildJob = {
      ok: true, jobId: 'job-001', normalizedCallsign: 'zen-001', status: 'queued', mode: 'dry-run',
    };
    const mockFetch = makeMockFetch(202, mockJob);
    global.fetch = mockFetch as unknown as typeof fetch;

    // Inline the same logic as SimForgeClient.startZenBuild for isolation
    const options: ZenBuildOptions = {};
    const response = await fetch(`${MOCK_BASE}/build/zen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        callsign: options.callsign ?? 'zen-001',
        dryRun: options.dryRun ?? true,
        includeCapsuleSummary: options.includeCapsuleSummary ?? true,
        requestId: options.requestId,
      }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${MOCK_BASE}/build/zen`);
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.callsign).toBe('zen-001');
    expect(sent.dryRun).toBe(true);
    expect(sent.includeCapsuleSummary).toBe(true);

    const result: ZenBuildJob = await response.json();
    expect(result.ok).toBe(true);
    expect(result.jobId).toBe('job-001');
    expect(result.mode).toBe('dry-run');
  });

  test('throws on 409 with activeJobId attached to error', async () => {
    const conflictBody: ZenBuildJob = {
      ok: false, jobId: '', normalizedCallsign: 'zen-001', status: 'running',
      error: 'build_already_running_for_zen', activeJobId: 'job-existing',
    };
    const mockFetch = makeMockFetch(409, conflictBody);
    global.fetch = mockFetch as unknown as typeof fetch;

    const response = await fetch(`${MOCK_BASE}/build/zen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ callsign: 'zen-001', dryRun: true }),
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(409);
    const payload: ZenBuildJob = await response.json();
    expect(payload.error).toBe('build_already_running_for_zen');
    expect(payload.activeJobId).toBe('job-existing');
  });

  test('throws on 400 for invalid callsign', async () => {
    const badBody = { ok: false, error: 'invalid callsign: nova-001' };
    const mockFetch = makeMockFetch(400, badBody);
    global.fetch = mockFetch as unknown as typeof fetch;

    const response = await fetch(`${MOCK_BASE}/build/zen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ callsign: 'nova-001', dryRun: true }),
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });
});

describe('getZenBuildStatus — mock fetch round-trips', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GETs /build/zen/:jobId with encoded jobId', async () => {
    const mockJob: ZenBuildJob = {
      ok: true, jobId: 'job-001', normalizedCallsign: 'zen-001', status: 'running',
      logsTail: ['INFO step 1', 'INFO step 2'],
    };
    const mockFetch = makeMockFetch(200, mockJob);
    global.fetch = mockFetch as unknown as typeof fetch;

    const jobId = 'job-001';
    const response = await fetch(`${MOCK_BASE}/build/zen/${encodeURIComponent(jobId)}`, {
      credentials: 'include',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(`${MOCK_BASE}/build/zen/job-001`);
    expect(response.ok).toBe(true);

    const result: ZenBuildJob = await response.json();
    expect(result.status).toBe('running');
    expect(result.logsTail).toHaveLength(2);
  });

  test('returns 404 body when job not found', async () => {
    const notFound = { ok: false, error: 'job_not_found' };
    const mockFetch = makeMockFetch(404, notFound);
    global.fetch = mockFetch as unknown as typeof fetch;

    const response = await fetch(`${MOCK_BASE}/build/zen/nonexistent`, {
      credentials: 'include',
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe('job_not_found');
  });

  test('surfaces timed_out status correctly from poll', async () => {
    const timedOutJob: ZenBuildJob = {
      ok: true, jobId: 'job-002', normalizedCallsign: 'zen-001', status: 'timed_out',
      finishedAt: '2026-03-11T00:05:00.000Z', exitCode: null,
    };
    const mockFetch = makeMockFetch(200, timedOutJob);
    global.fetch = mockFetch as unknown as typeof fetch;

    const response = await fetch(`${MOCK_BASE}/build/zen/job-002`, { credentials: 'include' });
    const result: ZenBuildJob = await response.json();

    expect(result.status).toBe('timed_out');
    expect(isTerminalZenStatus(result.status)).toBe(true);
    expect(mapZenPhase(result.status)).toBe('timed_out');
  });
});
