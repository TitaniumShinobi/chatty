import '../loadEnv.js';

const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';

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
  if (process.env.VVAULT_SERVICE_TOKEN) {
    headers['X-Chatty-Key'] = process.env.VVAULT_SERVICE_TOKEN;
  }
  if (process.env.CHATTY_USER_EMAIL) {
    headers['X-Chatty-User'] = process.env.CHATTY_USER_EMAIL;
  }
  return headers;
}

function decodeAvatarContent(content) {
  if (typeof content !== 'string' || !content) return null;
  const match = content.match(/^data:image\/[^;]+;base64,(.+)$/i);
  return Buffer.from(match ? match[1] : content, 'base64');
}

function gradeIdentityPayload(payload) {
  const descriptor = payload.avatarDescriptor || payload.avatar_descriptor || null;
  const sourceFiles = payload.sourceFiles || payload.source_files || {};
  const sourceList = Array.isArray(sourceFiles)
    ? sourceFiles
    : Object.values(sourceFiles || {});
  const avatarPng = sourceList.find((file) =>
    String(file?.filename || file?.path || file?.storage_path || '').endsWith('avatar.png')
  );
  const content = descriptor?.content || avatarPng?.content || '';
  const decoded = decodeAvatarContent(content);
  const pngMagicOk = Boolean(decoded && decoded.subarray(0, 8).toString('hex') === PNG_SIGNATURE_HEX);
  const canonicalPathOk = Boolean(
    descriptor &&
    String(descriptor.filename || descriptor.storagePath || descriptor.storage_path || '').endsWith('/avatar.png')
  );
  const contentTypeOk = /image\/png/i.test(String(descriptor?.contentType || descriptor?.mimeType || avatarPng?.content_type || ''));

  const checks = {
    canonicalPathOk,
    contentTypeOk,
    pngMagicOk,
    vvaultBodyNative: payload.status === 'body_native' || payload.body_native_available === true,
    compatibilityOnly: !canonicalPathOk && sourceList.some((file) =>
      /avatar\.(webp|jpe?g|gif|avif|svg)$/i.test(String(file?.filename || file?.path || file?.storage_path || ''))
    ),
  };
  const pass = checks.canonicalPathOk && checks.contentTypeOk && checks.pngMagicOk && checks.vvaultBodyNative;
  return { pass, checks };
}

async function main() {
  const constructId = parseArg('--constructId');
  const baseUrl = getVvaultBaseUrl();
  if (!constructId || constructId === true) {
    throw new Error('Usage: node server/scripts/avatarCanonicalizationAudit.js --constructId sera-001');
  }
  if (!baseUrl) {
    throw new Error('VVAULT_API_BASE_URL is required for VVAULT-native avatar audit');
  }

  const response = await fetch(`${baseUrl}/api/chatty/construct/${encodeURIComponent(constructId)}/identity`, {
    headers: authHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(`VVAULT identity read failed: HTTP ${response.status} ${payload.error || ''}`.trim());
  }

  const grade = gradeIdentityPayload(payload.identity || payload.construct || payload.data || payload);
  console.log(JSON.stringify({
    constructId,
    status: grade.pass ? 'PASS' : 'FAIL',
    checks: grade.checks,
  }, null, 2));

  if (!grade.pass) {
    throw new Error('avatar canonicalization audit failed');
  }
}

main().catch((error) => {
  console.error(`FAIL avatar:canonicalization:audit - ${error.message}`);
  process.exit(1);
});
