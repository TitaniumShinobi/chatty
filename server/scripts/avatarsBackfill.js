import '../loadEnv.js';

function parseArg(name) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] || true;
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function getVvaultBaseUrl() {
  return (
    parseArg('--vvaultBase') ||
    process.env.VVAULT_API_BASE_URL ||
    process.env.VVAULT_URL ||
    process.env.VVAULT_BASE_URL ||
    ''
  ).replace(/\/$/, '');
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = process.env.VVAULT_SERVICE_TOKEN || process.env.VVAULT_SESSION_OR_SERVICE_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Chatty-Key'] = token;
  }
  if (process.env.CHATTY_USER_EMAIL) {
    headers['X-Chatty-User'] = process.env.CHATTY_USER_EMAIL;
  }
  if (process.env.CHATTY_USER_ID) {
    headers['X-Chatty-User-Id'] = process.env.CHATTY_USER_ID;
  }
  return headers;
}

async function main() {
  const constructId = parseArg('--constructId');
  const shouldWrite = process.argv.includes('--write');
  const baseUrl = getVvaultBaseUrl();
  if (!constructId || constructId === true) {
    throw new Error('Usage: node server/scripts/avatarsBackfill.js --constructId sera-001 [--write]');
  }
  if (!baseUrl) {
    throw new Error('VVAULT_API_BASE_URL is required; avatar backfill must run through VVAULT authority');
  }

  const url = `${baseUrl}/api/vault/constructs/${encodeURIComponent(constructId)}/avatar/canonicalize`;
  if (!shouldWrite) {
    console.log(JSON.stringify({
      status: 'DRY_RUN',
      constructId,
      target: url,
      message: 'Re-run with --write to ask VVAULT to canonicalize avatar.png.',
    }, null, 2));
    return;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok || payload.success !== true || payload.pngMagicOk !== true) {
    throw new Error(`VVAULT avatar canonicalization failed: HTTP ${response.status} ${payload.error || payload.reason || ''}`.trim());
  }
  console.log('\nPASS avatars:backfill');
}

main().catch((error) => {
  console.error(`FAIL avatars:backfill - ${error.message}`);
  process.exit(1);
});
