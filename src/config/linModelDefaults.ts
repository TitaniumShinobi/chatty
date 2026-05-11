import * as defaultsModule from "../../config/linModelDefaults.json";

type LinModelDefaultsJson = {
  conversation: string;
  smalltalk?: string;
  creative: string;
  coding: string;
  intelligence?: string;
  codingFallback?: string;
};

const defaults = ((defaultsModule as { default?: LinModelDefaultsJson }).default || defaultsModule) as LinModelDefaultsJson;

export const LIN_MODEL_DEFAULTS = {
  conversation: defaults.conversation,
  smalltalk: defaults.smalltalk || defaults.conversation,
  creative: defaults.creative,
  coding: defaults.intelligence || defaults.coding,
  intelligence: defaults.intelligence || defaults.coding,
  codingFallback: defaults.codingFallback,
} as const;

export const LIN_DEFAULT_MODELS = {
  smalltalk: LIN_MODEL_DEFAULTS.smalltalk,
  creative: LIN_MODEL_DEFAULTS.creative,
  coding: LIN_MODEL_DEFAULTS.coding,
} as const;

export const LIN_LEGACY_CLOUD_DEFAULTS = [
  "openrouter:meta-llama/llama-3.3-70b-instruct",
  "openrouter:meta-llama/llama-3.3-70b-instruct:free",
  "openrouter:meta-llama/llama-3.2-3b-instruct:free",
  "openrouter:microsoft/phi-3-mini-128k-instruct",
  "openrouter:mistralai/mistral-7b-instruct",
  "openrouter:deepseek/deepseek-coder-33b-instruct",
  "openrouter:deepseek/deepseek-coder",
] as const;

export function isLinDefaultPlaceholder(model?: string | null): boolean {
  const normalized = (model || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "openrouter/auto" ||
    normalized === "openrouter:auto" ||
    LIN_LEGACY_CLOUD_DEFAULTS.includes(normalized as typeof LIN_LEGACY_CLOUD_DEFAULTS[number])
  );
}
