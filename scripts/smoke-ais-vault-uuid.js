#!/usr/bin/env node
/**
 * Smoke checks for ais.js vault_files UUID guards.
 * Run with server up on PORT (default 5050). Without auth, protected routes return 401/403 (not 500).
 *
 * Manual checks (do in app with a logged-in session):
 * 1. Upload a single knowledge file + a ZIP → vault_files rows by construct_id+filename; no UUID errors in server logs.
 * 2. Backfill PDFs + reindex knowledge → complete without UUID banner.
 * 3. GET /api/ais/:id/avatar with non-UUID user → 404 or avatar, not 500.
 * 4. Save identity fields (conditioning/voice) → clean save, no warnings.
 */
const PORT = process.env.PORT || 5050;
const BASE = `http://127.0.0.1:${PORT}`;

async function fetchOk(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: 'manual' });
  return { ok: res.ok, status: res.status, url };
}

async function main() {
  console.log('Smoke checks for ais.js vault_files UUID guards');
  console.log(`Base URL: ${BASE}\n`);

  let failed = 0;

  // 1. Server reachable
  try {
    const { status } = await fetchOk(`${BASE}/api/health`, { method: 'GET' }).catch(() => ({ status: 0 }));
    if (status === 0) {
      console.log('❌ Server not reachable (connection refused or no /api/health). Start server and retry.');
      process.exit(1);
    }
    console.log(`✅ Server reachable (health/other returned ${status})`);
  } catch (e) {
    console.log('❌ Server not reachable:', e.message);
    process.exit(1);
  }

  // 2. Protected routes return 401/403 when unauthenticated (not 500 = no UUID crash)
  const protectedPaths = [
    ['GET', '/api/ais/nova-001/identity-fields'],
    ['PUT', '/api/ais/nova-001/identity-fields', { body: JSON.stringify({ voice: '', conditioning: '' }) }],
    ['GET', '/api/ais/nova-001/identity-sync'],
    ['GET', '/api/ais/nova-001/avatar'],
    ['POST', '/api/ais/nova-001/reindex-knowledge'],
    ['POST', '/api/ais/nova-001/backfill-pdfs'],
  ];

  for (const [method, path, opts = {}] of protectedPaths) {
    const url = `${BASE}${path}`;
    const fetchOpts = { method, headers: { 'Content-Type': 'application/json' }, ...opts };
    const { status } = await fetchOk(url, fetchOpts);
    if (status >= 500) {
      console.log(`❌ ${method} ${path} → ${status} (server error; check for UUID/log errors)`);
      failed++;
    } else if (status === 401 || status === 403) {
      console.log(`✅ ${method} ${path} → ${status} (auth required, no crash)`);
    } else {
      console.log(`⚠️  ${method} ${path} → ${status} (expected 401/403 without auth)`);
    }
  }

  console.log('\nManual checks (logged-in session):');
  console.log('  • Upload one knowledge file + one ZIP → no UUID errors in logs; rows in vault_files by construct_id+filename.');
  console.log('  • Backfill PDFs + reindex knowledge → no UUID banner.');
  console.log('  • Open /api/ais/<id>/avatar in browser → 404 or image, not 500.');
  console.log('  • Save identity (conditioning/voice) in Forge → clean save, no warnings.');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
