/**
 * System construct voice presets for Zen and Lin only.
 * Do not reuse for GPT/Forge voice lab; that lives in a separate system.
 */

export type ConstructVoicePreset = {
  id: string;
  label: string;
  construct: "zen" | "lin";
  description?: string;
  openvoiceVoice?: string;
  referenceEnv?: string;
  style?: string;
  speechProfile?: string;
};

export const ZEN_VOICE_PRESETS: ConstructVoicePreset[] = [
  {
    id: "zen_primary",
    label: "Zen Primary",
    construct: "zen",
    openvoiceVoice: "sage",
    referenceEnv: "OPENVOICE_REFERENCE_AUDIO_ZEN",
    style: "default",
    speechProfile: "zen_primary",
  },
  {
    id: "zen_alternate",
    label: "Zen Alternate",
    construct: "zen",
    openvoiceVoice: "ash",
    referenceEnv: "OPENVOICE_REFERENCE_AUDIO_ZEN",
    style: "default",
    speechProfile: "zen_alternate",
  },
];

export const LIN_VOICE_PRESETS: ConstructVoicePreset[] = [
  {
    id: "lin_primary",
    label: "Lin Primary",
    construct: "lin",
    openvoiceVoice: "coral",
    referenceEnv: "OPENVOICE_REFERENCE_AUDIO_LIN",
    style: "default",
    speechProfile: "lin_primary",
  },
  {
    id: "lin_alternate",
    label: "Lin Alternate",
    construct: "lin",
    openvoiceVoice: "shimmer",
    referenceEnv: "OPENVOICE_REFERENCE_AUDIO_LIN",
    style: "default",
    speechProfile: "lin_alternate",
  },
];

/** Legacy raw/display values -> Zen preset id (for migration). */
const LEGACY_TO_ZEN_PRESET: Record<string, string> = {
  sage: "zen_primary",
  ash: "zen_alternate",
  alloy: "zen_primary",
  onyx: "zen_alternate",
  echo: "zen_primary",
  verse: "zen_alternate",
  maple: "zen_primary",
};

/** Legacy raw/display values -> Lin preset id (for migration). */
const LEGACY_TO_LIN_PRESET: Record<string, string> = {
  coral: "lin_primary",
  shimmer: "lin_alternate",
  fable: "lin_primary",
  ballad: "lin_alternate",
  maple: "lin_primary",
};

export type ResolvedConstructVoice = {
  presetId: string;
  openvoiceVoice?: string;
  style?: string;
  speechProfile?: string;
};

function normalizeForLookup(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Zen-only presets for settings dropdown and resolution. */
export function getZenVoicePresets(): ConstructVoicePreset[] {
  return ZEN_VOICE_PRESETS;
}

/** Lin-only presets for settings dropdown and resolution. */
export function getLinVoicePresets(): ConstructVoicePreset[] {
  return LIN_VOICE_PRESETS;
}

/**
 * Resolve a stored zenVoice/linVoice value to a preset and its OpenVoice config.
 * Migrates legacy raw ids (sage, coral, etc.) to preset ids; never exposes backend ids to UI.
 */
export function resolveSystemVoicePreset(
  construct: "zen" | "lin",
  presetId: string | undefined,
): ResolvedConstructVoice {
  const presets = construct === "zen" ? ZEN_VOICE_PRESETS : LIN_VOICE_PRESETS;
  const legacyMap = construct === "zen" ? LEGACY_TO_ZEN_PRESET : LEGACY_TO_LIN_PRESET;
  const primary = presets[0];
  if (!primary) {
    return { presetId: "", openvoiceVoice: undefined, style: undefined, speechProfile: undefined };
  }

  const normalized = normalizeForLookup(presetId ?? "");

  const byId = presets.find((p) => normalizeForLookup(p.id) === normalized);
  if (byId) {
    return {
      presetId: byId.id,
      openvoiceVoice: byId.openvoiceVoice,
      style: byId.style,
      speechProfile: byId.speechProfile,
    };
  }

  const migrated = legacyMap[normalized];
  if (migrated) {
    const preset = presets.find((p) => p.id === migrated);
    if (preset) {
      return {
        presetId: preset.id,
        openvoiceVoice: preset.openvoiceVoice,
        style: preset.style,
        speechProfile: preset.speechProfile,
      };
    }
  }

  return {
    presetId: primary.id,
    openvoiceVoice: primary.openvoiceVoice,
    style: primary.style,
    speechProfile: primary.speechProfile,
  };
}

/** Return preset id to store when current value is legacy (for migration persist). */
export function migrateLegacyVoiceValueToPresetId(
  construct: "zen" | "lin",
  value: string | undefined,
): string {
  const resolved = resolveSystemVoicePreset(construct, value ?? "");
  return resolved.presetId;
}

/** @deprecated Use resolveSystemVoicePreset */
export const resolveConstructVoicePreset = resolveSystemVoicePreset;

/** @deprecated Use migrateLegacyVoiceValueToPresetId */
export function migrateZenLinToPresetId(construct: "zen" | "lin", value: string | undefined): string {
  return migrateLegacyVoiceValueToPresetId(construct, value);
}
