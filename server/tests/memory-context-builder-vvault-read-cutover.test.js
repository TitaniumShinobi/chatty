import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = () => fs.readFileSync(path.resolve(__dirname, '../lib/memoryContextBuilder.js'), 'utf8');

describe('memoryContextBuilder VVAULT-first read cutover', () => {
  it('tries VVAULT body before legacy Supabase voice exemplar reads', () => {
    const text = source();
    const fn = text.slice(text.indexOf('async function loadVoiceExemplars'), text.indexOf('async function runNeedleSearch'));
    assert.ok(fn.indexOf('loadTranscriptRowsFromVvault') > -1);
    assert.ok(text.indexOf("source: 'vvault_body'") > -1);
    assert.match(fn, /const vvaultContext = userContextForVvault\(userId, userEmail\)/);
    assert.ok(fn.indexOf('readConversations') > fn.indexOf('loadTranscriptRowsFromVvault'));
    assert.match(fn, /buildVoiceExemplarResult\(exemplars, 'vvault_conversations'\)/);
    assert.match(fn, /buildVoiceExemplarResult\(exemplars, 'legacy_supabase_vault_files'\)/);
    assert.ok(fn.indexOf('resolveSupabaseUserIdFromEmailOrId') > fn.indexOf('readConversations'));
  });

  it('passes email-bearing VVAULT lookup context into readConversations instead of a bare Chatty id string', () => {
    const text = source();
    const stm = text.slice(text.indexOf('const tStm'), text.indexOf('let ledger = null'));
    assert.match(stm, /preloadedCanonicalMessages\.length > 0/);
    assert.match(stm, /result\.history_source = 'transcript_truth_preflight'/);
    assert.match(stm, /const vvaultContext = userContextForVvault\(userId, user\?\.email\)/);
    assert.match(stm, /readConversations\(vvaultContext, constructId\)/);
    assert.doesNotMatch(stm, /const lookupId = userId \|\| user\?\.email/);
  });

  it('normalizes timestamped VVAULT body transcript headers before assistant voice extraction', () => {
    const text = source();
    const fn = text.slice(text.indexOf('function compactVoiceLine'), text.indexOf('async function loadVoiceExemplars'));
    assert.match(fn, /function normalizeTranscriptForVoiceExtraction/);
    assert.match(fn, /parseMarkdownTranscript\(normalizedTranscript, filename\)/);
    assert.ok(fn.includes("(\\*\\*[^*\\n]+\\*\\*)"));
    assert.ok(fn.includes("(?=\\n)"));
  });

  it('uses identity/VVAULT body for physical and definition context instead of Supabase-first reads', () => {
    const text = source();
    const physical = text.slice(text.indexOf('const cachedPhys'), text.indexOf('let definitionSection'));
    const definition = text.slice(text.indexOf("let definitionSection = ''"), text.indexOf("let voiceExemplarSection = ''"));
    assert.match(text, /const loadConstructFilesForContext = \(\) =>/);
    assert.match(physical, /identity\?\.physicalFeatures/);
    assert.match(physical, /loadConstructFilesForContext\(\)/);
    assert.doesNotMatch(physical, /getSupabaseClient/);
    assert.match(definition, /identity\?\.definition/);
    assert.match(definition, /loadConstructFilesForContext\(\)/);
    assert.doesNotMatch(definition, /getSupabaseClient/);
  });

  it('shares request-scoped VVAULT body files with knowledge context', () => {
    const text = source();
    const knowledgeCall = text.slice(text.indexOf('const knowledgeResult = await getKnowledgeContext'), text.indexOf('knowledgeSection = knowledgeResult.section'));

    assert.match(text, /let constructFilesPromise = null/);
    assert.match(knowledgeCall, /bodyFilesPromise: constructFilesPromise/);
    assert.match(text, /options\.bodyFilesPromise/);
  });

  it('prefers storage_path when deciding whether VVAULT body files are knowledge documents or assets', () => {
    const text = source();
    const fn = text.slice(text.indexOf('async function getKnowledgeContext'), text.indexOf('function truncatePreviewField'));
    assert.match(fn, /const name = String\(row\.storage_path \|\| row\.filename \|\| ''\)\.toLowerCase\(\)/);
  });

  it('does not resolve vector lookup through Supabase users in the continuity path', () => {
    const text = source();
    const vector = text.slice(text.indexOf('const tVector'), text.indexOf('phaseTiming.vectorSearch'));
    assert.doesNotMatch(vector, /from\('users'\)/);
    assert.match(vector, /const vectorLookupId = userId \|\| user\?\.email/);
  });
});
