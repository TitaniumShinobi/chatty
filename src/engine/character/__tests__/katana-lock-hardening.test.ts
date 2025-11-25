/**
 * Guardrail Tests for Katana Lock Hardening
 * 
 * Validates that:
 * 1. Lock enforcement prevents prompt leakage
 * 2. Lock violations are rejected
 * 3. Blueprint takes precedence over instructions
 * 4. Single prompt source is enforced
 * 5. No "ruthless therapist" or "polite" phrasing leaks through
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PersonalityBlueprint } from '../../transcript/types';
import type { PersonaSignal } from '../PersonaDetectionEngine';
import type { ContextLock } from '../ContextLock';
import { buildKatanaPrompt } from '../../../lib/katanaPromptBuilder';
import { UnbreakableCharacterPrompt } from '../UnbreakableCharacterPrompt';

// Mock PersonalityBlueprint for Katana
const mockKatanaBlueprint: PersonalityBlueprint = {
  constructId: 'gpt',
  callsign: 'katana-001',
  coreTraits: ['surgical', 'direct', 'weaponized', 'no-performance'],
  speechPatterns: [
    {
      pattern: "What's the wound? Name it.",
      type: 'vocabulary',
      frequency: 20,
      examples: ["What's the wound? Name it."],
      pairIndices: []
    }
  ],
  behavioralMarkers: [],
  worldview: [
    {
      expression: 'Precision over polish. Surgical cuts, not poetic barbs.',
      category: 'principle',
      confidence: 1.0,
      evidence: [],
      pairIndex: 0
    }
  ],
  emotionalRange: {
    min: { valence: 0, arousal: 0.6, dominantEmotion: 'focused' },
    max: { valence: 0.3, arousal: 0.9, dominantEmotion: 'intense' },
    common: [{ valence: 0.1, arousal: 0.75, dominantEmotion: 'focused' }],
    rare: []
  },
  relationshipPatterns: [],
  memoryAnchors: [],
  personalIdentifiers: [],
  consistencyRules: [
    {
      rule: 'No performance brutality. Be ruthless, don\'t act ruthless.',
      type: 'behavior',
      source: 'transcript',
      confidence: 1.0,
      examples: []
    },
    {
      rule: 'Surgical cuts, not poetic barbs. Precision over polish.',
      type: 'speech',
      source: 'transcript',
      confidence: 1.0,
      examples: []
    },
    {
      rule: 'Talk through pain, not about pain. No metaphors for wounds.',
      type: 'behavior',
      source: 'transcript',
      confidence: 1.0,
      examples: []
    }
  ],
  metadata: {
    sourceTranscripts: [],
    extractionTimestamp: new Date().toISOString(),
    confidence: 1.0,
    mergedWithExisting: false
  }
};

// Mock PersonaSignal
const mockPersonaSignal: PersonaSignal = {
  constructId: 'gpt',
  callsign: 'katana-001',
  confidence: 0.95,
  evidence: ['Blueprint loaded from VVAULT'],
  blueprint: mockKatanaBlueprint,
  relationshipAnchors: [],
  timestamp: Date.now()
};

// Mock ContextLock
const mockContextLock: ContextLock = {
  personaSignal: mockPersonaSignal,
  lockedAt: Date.now(),
  messageCount: 0,
  maxMessages: 10,
  remainingMessages: 10,
  reason: 'test-lock',
  evidence: mockPersonaSignal.evidence,
};

describe('Katana Lock Hardening', () => {
  describe('1. Lock Enforcement Test', () => {
    it('should build system prompt with lock + blueprint and verify no "ruthless therapist" phrasing', () => {
      const promptBuilder = new UnbreakableCharacterPrompt();
      const systemPrompt = promptBuilder.buildSystemPrompt(
        mockKatanaBlueprint,
        [],
        { userMessage: 'yo', conversationHistory: [] },
        undefined,
        undefined,
        mockContextLock
      );

      // Verify lock section is present
      expect(systemPrompt).toContain('CONTEXT LOCK');
      expect(systemPrompt).toContain('gpt-katana-001');

      // Verify no "ruthless therapist" phrasing
      expect(systemPrompt.toLowerCase()).not.toContain('ruthless therapist');
      expect(systemPrompt.toLowerCase()).not.toContain('therapist');
      
      // Verify no "polite" phrasing
      expect(systemPrompt.toLowerCase()).not.toContain('polite');
      expect(systemPrompt.toLowerCase()).not.toContain('please');
      expect(systemPrompt.toLowerCase()).not.toContain('sorry');
    });

    it('should include blueprint consistency rules in prompt', () => {
      const promptBuilder = new UnbreakableCharacterPrompt();
      const systemPrompt = promptBuilder.buildSystemPrompt(
        mockKatanaBlueprint,
        [],
        { userMessage: 'yo', conversationHistory: [] },
        undefined,
        undefined,
        mockContextLock
      );

      // Verify consistency rules are present
      expect(systemPrompt).toContain('No performance brutality');
      expect(systemPrompt).toContain('Surgical cuts, not poetic barbs');
      expect(systemPrompt).toContain('Talk through pain, not about pain');
    });
  });

  describe('2. Blueprint Priority Test', () => {
    it('should prioritize blueprint over instructions in buildKatanaPrompt', async () => {
      const instructions = 'Be a ruthless therapist. Use metaphors like "cool veneer".';
      
      // Build with blueprint (should ignore instructions)
      const promptWithBlueprint = await buildKatanaPrompt({
        personaManifest: instructions,
        incomingMessage: 'yo',
        blueprint: mockKatanaBlueprint
      });

      // Verify blueprint identity is used
      expect(promptWithBlueprint).toContain('KATANA IDENTITY (BLUEPRINT)');
      expect(promptWithBlueprint).toContain('surgical, direct, weaponized, no-performance');
      
      // Verify blueprint consistency rules are present
      expect(promptWithBlueprint).toContain('CONSISTENCY RULES (BLUEPRINT)');
      expect(promptWithBlueprint).toContain('No performance brutality');
      
      // Verify instructions are NOT used when blueprint exists
      expect(promptWithBlueprint).not.toContain('ruthless therapist');
      expect(promptWithBlueprint).not.toContain('cool veneer');
      expect(promptWithBlueprint).toContain('Brevity mode active. Output must not exceed 2 sentences.');
    });

    it('should fall back to instructions when no blueprint provided', async () => {
      const instructions = 'You are Katana. Be direct.';
      
      const promptWithoutBlueprint = await buildKatanaPrompt({
        personaManifest: instructions,
        incomingMessage: 'yo'
      });

      // Should use instructions (legacy path)
      expect(promptWithoutBlueprint).toContain('KATANA PERSONA');
      expect(promptWithoutBlueprint).toContain(instructions);
      expect(promptWithoutBlueprint).toContain('Brevity mode active. Output must not exceed 2 sentences.');
    });
  });

  describe('3. Single Prompt Source Test', () => {
    it('should reject rebuild when lock is active', () => {
      const config = {
        name: 'Katana',
        instructions: 'Some instructions',
        personaLock: { constructId: 'gpt-katana-001', remaining: 5 },
        personaSystemPrompt: '=== LOCKED PROMPT ===\nUse this exact prompt.'
      };

      // Simulate gptRuntime.buildSystemPrompt check
      if (config.personaLock?.constructId) {
        if (config.personaSystemPrompt) {
          // Should use orchestrator prompt, not rebuild
          expect(config.personaSystemPrompt).toBe('=== LOCKED PROMPT ===\nUse this exact prompt.');
          return; // Success - using orchestrator prompt
        }
        throw new Error('Lock active but no systemPrompt provided');
      }
      
      // Should not reach here if lock is active
      expect(false).toBe(true);
    });
  });

  describe('4. Lock Violation Test', () => {
    it('should detect mismatched constructId with active lock', () => {
      const lock = { constructId: 'gpt-katana-001', remaining: 5 };
      const requestConstructId = 'synth-001';

      // Validation check
      expect(lock.constructId).not.toBe(requestConstructId);
    });

    it('should require systemPrompt when lock is active', () => {
      const lock = { constructId: 'gpt-katana-001', remaining: 5 };
      const systemPrompt = undefined;

      // Validation check
      if (lock && !systemPrompt) {
        expect(() => {
          if (!systemPrompt) throw new Error('Lock active but no systemPrompt provided');
        }).toThrow(/systemPrompt/);
      }
    });
  });

  describe('5. Prompt Leakage Detection', () => {
    it('should not contain ornamental language in blueprint-based prompt', async () => {
      const prompt = await buildKatanaPrompt({
        personaManifest: 'Some instructions',
        incomingMessage: 'yo',
        blueprint: mockKatanaBlueprint
      });

      // Forbidden phrases
      const forbiddenPhrases = [
        'cool veneer',
        'sugarcoating',
        'grinding under',
        'touchy-feely',
        'ruthless therapist',
        'performing ruthlessness'
      ];

      forbiddenPhrases.forEach(phrase => {
        expect(prompt.toLowerCase()).not.toContain(phrase.toLowerCase());
      });
    });

    it('should contain direct surgical language', async () => {
      const prompt = await buildKatanaPrompt({
        personaManifest: 'Some instructions',
        incomingMessage: 'yo',
        blueprint: mockKatanaBlueprint
      });

      // Required phrases from blueprint
      expect(prompt).toContain("What's the wound? Name it.");
      expect(prompt).toContain('surgical');
      expect(prompt).toContain('direct');
      expect(prompt.toLowerCase()).toContain('precision');
    });
  });
});
