import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIN_THREE_I_SEATS } from './linSeatCanon.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultsPath = path.join(repoRoot, 'config', 'linModelDefaults.json');

function readDefaults() {
  const parsed = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
  const envDefault = (name) => {
    const value = process.env[name];
    return value && String(value).trim() ? String(value).trim() : null;
  };
  const intelligence =
    envDefault('LIN_INTELLIGENCE_MODEL') ||
    envDefault('LIN_CODING_MODEL') ||
    String(parsed.intelligence || parsed.coding || LIN_THREE_I_SEATS.intelligence.model);
  const conversation =
    envDefault('LIN_CONVERSATION_MODEL') ||
    String(parsed.conversation || LIN_THREE_I_SEATS.interaction.model);
  const smalltalk =
    envDefault('LIN_SMALLTALK_MODEL') ||
    String(parsed.smalltalk || conversation || LIN_THREE_I_SEATS.interaction.model);
  const creative =
    envDefault('LIN_CREATIVE_MODEL') ||
    String(parsed.creative || LIN_THREE_I_SEATS.ingenuity.model);
  return Object.freeze({
    conversation,
    smalltalk,
    creative,
    coding: intelligence,
    intelligence,
    codingFallback:
      envDefault('LIN_CODING_FALLBACK_MODEL') ||
      envDefault('LIN_CODING_MODEL') ||
      String(parsed.codingFallback || LIN_THREE_I_SEATS.intelligence.fallbackModel),
  });
}

export const LIN_MODEL_DEFAULTS = readDefaults();

export const LIN_LEGACY_CLOUD_DEFAULTS = Object.freeze([
  'openrouter:meta-llama/llama-3.3-70b-instruct',
  'openrouter:meta-llama/llama-3.3-70b-instruct:free',
  'openrouter:meta-llama/llama-3.2-3b-instruct:free',
  'openrouter:microsoft/phi-3-mini-128k-instruct',
  'openrouter:mistralai/mistral-7b-instruct',
  'openrouter:deepseek/deepseek-coder-33b-instruct',
  'openrouter:deepseek/deepseek-coder',
]);

export function isLinDefaultPlaceholder(model) {
  const normalized = String(model || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'openrouter/auto' ||
    normalized === 'openrouter:auto' ||
    LIN_LEGACY_CLOUD_DEFAULTS.includes(normalized);
}
