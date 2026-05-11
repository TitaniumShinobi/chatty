#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.CHATTY_API_BASE || 'http://127.0.0.1:5050';

const checks = [
  {
    path: '/api/health',
    validate: (status) => status === 200,
    expected: 'status 200',
  },
  {
    path: '/api/me',
    validate: (status) => status === 200 || status === 401,
    expected: 'status 200 or 401 (never 404)',
  },
  {
    path: '/api/auth/google/health',
    validate: (status) => status === 200,
    expected: 'status 200',
  },
  {
    path: '/api/health/routes',
    validate: (status, body) => {
      if (status !== 200 || !body || typeof body !== 'object') return false;
      if (body.ok !== true) return false;
      return Array.isArray(body.missing) && body.missing.length === 0;
    },
    expected: 'status 200 with { ok: true, missing: [] }',
  },
];

function curlGet(pathname) {
  const url = `${BASE_URL}${pathname}`;
  const output = execFileSync(
    'curl',
    ['-sS', '--max-time', '5', '-w', '\n%{http_code}', url],
    { encoding: 'utf8' }
  );
  const splitIndex = output.lastIndexOf('\n');
  const bodyText = splitIndex >= 0 ? output.slice(0, splitIndex) : output;
  const statusText = splitIndex >= 0 ? output.slice(splitIndex + 1).trim() : '0';
  const status = Number.parseInt(statusText, 10) || 0;
  return { url, status, bodyText };
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function run() {
  let hasFailure = false;
  console.log(`[RouteVerify] Checking backend route integrity at ${BASE_URL}`);

  for (const check of checks) {
    try {
      const result = curlGet(check.path);
      const parsed = parseJsonOrNull(result.bodyText);
      const ok = check.validate(result.status, parsed);
      const marker = ok ? '✅' : '❌';
      console.log(`${marker} ${result.url} -> ${result.status} (expected ${check.expected})`);
      if (!ok) {
        hasFailure = true;
        if (result.bodyText) {
          console.log(`   body: ${result.bodyText}`);
        }
      }
    } catch (error) {
      hasFailure = true;
      console.log(`❌ ${BASE_URL}${check.path} -> request failed: ${error.message}`);
    }
  }

  if (hasFailure) {
    console.error('[RouteVerify] Route integrity FAILED');
    process.exit(1);
  }

  console.log('[RouteVerify] Route integrity OK');
}

run();
