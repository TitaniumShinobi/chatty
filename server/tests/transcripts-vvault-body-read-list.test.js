import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = () => fs.readFileSync(path.resolve(__dirname, '../routes/transcripts.js'), 'utf8');

describe('transcript route VVAULT body read cutover', () => {
  it('attempts VVAULT body list reads before legacy Supabase fallback', () => {
    const text = routeSource();
    const route = text.slice(text.indexOf("router.get('/list/:constructCallsign'"), text.indexOf("// ContinuityGPT-style auto-organize"));
    assert.ok(route.indexOf('listTranscriptsFromVvaultBody') > -1);
    assert.ok(route.indexOf('listTranscriptsFromVvaultBody') < route.indexOf('resolveSupabaseUserId'));
    assert.match(route, /Legacy fallback only/);
    assert.match(route, /readSource/);
  });

  it('does not rewrite persistence routes as body-native in this read-only pass', () => {
    const text = routeSource();
    assert.doesNotMatch(text, /body_native_write/);
    assert.doesNotMatch(text, /body-native write/i);
  });
});
