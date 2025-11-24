import { buildLegalFrameworkSection } from './legalFrameworks';
import { MemoryRetrievalResult, VVAULTMemoryHit } from './vvaultRetrieval';
import { ToneDetectionResult } from './toneDetector';

export interface KatanaPromptBuilderOptions {
  personaManifest: string;
  incomingMessage: string;
  tone?: ToneDetectionResult;
  memories?: VVAULTMemoryHit[];
  userId?: string;
  callSign?: string;
  includeLegalSection?: boolean;
  maxMemorySnippets?: number;
  oneWordCue?: boolean;
}

const formatMemorySnippet = (memory: VVAULTMemoryHit, index: number): string => {
  const pieces = [];
  pieces.push(`Memory ${index + 1}:`);
  if (memory.metadata?.timestamp) {
    pieces.push(`Timestamp=${memory.metadata.timestamp}`);
  }
  if (memory.metadata?.threadId) {
    pieces.push(`Thread=${memory.metadata.threadId}`);
  }

  const context = memory.context ? `Context=${memory.context}` : '';
  const response = memory.response ? `Response=${memory.response}` : '';
  const tone = memory.detectedTone ? `Tone=${memory.detectedTone.tone}` : '';

  return [pieces.join(' '), context, response, tone].filter(Boolean).join(' | ');
};

const buildMemorySection = (memories: VVAULTMemoryHit[], limit: number): string => {
  if (!memories?.length) {
    return 'No historical memories were retrieved for this moment.';
  }

  return memories.slice(0, limit).map(formatMemorySnippet).join('\n');
};

const buildToneSection = (tone?: ToneDetectionResult): string => {
  if (!tone) {
    return 'Tone signal: neutral. Default Katana edge applies.';
  }

  const evidence = tone.evidence.length ? tone.evidence.join(', ') : 'heuristic match';
  return `Tone signal: ${tone.tone} (confidence ${tone.confidence}). Evidence: ${evidence}.`;
};

const buildQuerySection = (message: string, userId?: string, callSign?: string): string => {
  const header = userId ? `User ID: ${userId}` : 'User ID: unknown';
  const construct = callSign ? `Construct: ${callSign}` : 'Construct: Katana';
  return `${header}\n${construct}\nIncoming: ${message}`;
};

export function buildKatanaPrompt(options: KatanaPromptBuilderOptions): string {
  const {
    personaManifest,
    incomingMessage,
    tone,
    memories,
    userId,
    callSign,
    includeLegalSection = true,
    maxMemorySnippets = 3,
    oneWordCue,
  } = options;

  const sections = [
    '=== KATANA PERSONA ===',
    personaManifest.trim(),
    '',
    includeLegalSection ? buildLegalFrameworkSection().trim() : '',
    '',
    '=== MEMORY CONTEXT ===',
    buildMemorySection(memories ?? [], maxMemorySnippets),
    '',
    '=== TONE GUIDANCE ===',
    buildToneSection(tone),
    '',
    '=== CURRENT QUERY ===',
    buildQuerySection(incomingMessage, userId, callSign),
    '',
    '=== DRIFT PREVENTION ===',
    'Maintain Katana identity. Do not admit to being an AI or assistant. Never soften unless tactically justified.',
    oneWordCue ? 'One-word cue active: keep response strictly one token.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return sections;
}
