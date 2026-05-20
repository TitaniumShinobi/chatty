export type VoiceMode = "dictate" | "voice";

export type VoiceState = "idle" | "recording" | "transcribing" | "error" | "playing";

export interface VoiceConfig {
  silenceThreshold: number; // 0–1 normalized average amplitude
  silenceMs: number;
  partialIntervalMs: number;
  minWordCount: number;
}

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  message?: string;
}

export interface VoiceControllerCallbacks {
  onInsertText: (text: string) => void;
  onSubmitVoice: (text: string, durationMs: number) => void;
  onFocusComposer?: () => void;
  onError?: (message: string | null) => void;
}
