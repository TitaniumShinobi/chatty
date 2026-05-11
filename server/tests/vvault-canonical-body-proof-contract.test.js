import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routeSource = readFileSync(new URL('../routes/vvault.js', import.meta.url), 'utf8');
const memorySource = readFileSync(new URL('../lib/memoryContextBuilder.js', import.meta.url), 'utf8');
const writerSource = readFileSync(new URL('../../vvaultConnector/writeTranscript.js', import.meta.url), 'utf8');

test('canonical persistence receipt targets VVAULT body transcripts', () => {
  assert.match(routeSource, /canonical_target:\s*'vvault_body_transcripts'/);
  assert.match(routeSource, /canonical_target_table:\s*'ovvaults\.transcripts'/);
  assert.match(routeSource, /canonical_write_path:\s*'vvault_api:\/api\/chatty\/transcript\/:constructId\/message'/);
  assert.doesNotMatch(routeSource, /canonical_target:\s*'supabase_vault_files'/);
  assert.doesNotMatch(routeSource, /canonical_target_table:\s*'vault_files'/);
  assert.doesNotMatch(routeSource, /no_exported_route_side_canonical_write_path/);
});

test('canonical message persistence requires VVAULT body success before fallback', () => {
  assert.match(routeSource, /requireVvaultBodySuccess:\s*requiresVvaultBodyPersistence/);
  assert.match(writerSource, /requireVvaultBodySuccess/);
  assert.match(writerSource, /vvault_body_write_unavailable/);
  assert.match(writerSource, /source:\s*'vvault_body'/);
  assert.match(writerSource, /fallbackUsed:\s*false/);
  assert.doesNotMatch(writerSource, /mirrorSuccessfulWriteToLocalFallback/);
  assert.doesNotMatch(writerSource, /localMirrorSource/);
  assert.ok(
    writerSource.indexOf('if (requireVvaultBodySuccess)') < writerSource.indexOf('const pgResult = await writeTranscriptToPostgres'),
    'canonical VVAULT-body failure must block before Postgres/local fallback',
  );
});

test('memory receipt does not infer Supabase access from exemplar count', () => {
  assert.match(routeSource, /supabase_accessed:\s*Boolean\(enrichedContext\.supabase_accessed\)/);
  assert.doesNotMatch(routeSource, /supabase_accessed:\s*Boolean\(enrichedContext\.supabase_accessed \|\| enrichedContext\.voiceExemplarCount\)/);
});

test('canonical route hydrates a usable request email before VVAULT body continuity calls', () => {
  assert.match(routeSource, /async function resolveCanonicalRouteUserEmail/);
  assert.match(routeSource, /getUserProfile\(lookupId\)/);
  assert.match(routeSource, /const effectiveRequestUserEmail = await resolveCanonicalRouteUserEmail\(/);
  assert.match(routeSource, /req\.user = \{ \.\.\.\(req\.user \|\| \{\}\), email: effectiveRequestUserEmail \}/);
  assert.match(routeSource, /authReceipt\.auth_email = effectiveRequestUserEmail/);
});

test('legacy Supabase exemplar fallback remains degraded and non-canonical', () => {
  assert.match(memorySource, /buildVoiceExemplarResult\(exemplars, 'vvault_conversations'\)/);
  assert.match(memorySource, /legacySupabaseVoiceExemplars/);
  assert.match(memorySource, /source:\s*voiceExemplarSource/);
  assert.match(memorySource, /degraded:\s*voiceOutcome\.status !== 'ok' \|\| legacySupabaseVoiceExemplars/);
  assert.match(memorySource, /legacy_supabase_vault_files/);
  assert.match(memorySource, /CHATTY_ALLOW_LEGACY_SUPABASE_VOICE_EXEMPLARS/);
});
