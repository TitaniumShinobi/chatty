import { TranscribeResult, VoiceConfig } from "./types";

function getRuntimeEnv(): Record<string, any> {
  try {
    return (0, eval)('typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}');
  } catch {
    return typeof process !== "undefined" && process.env ? process.env : {};
  }
}

const env = getRuntimeEnv();

const DEFAULT_MIN_WORDS = Number((env as any).VITE_VOICE_MIN_WORDS || 2);

function isTranscribeWsEnabled(): boolean {
  return (env as any).VITE_TRANSCRIBE_WS === "on";
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function applyMinWordFilter(text: string, minWords: number): TranscribeResult {
  if (countWords(text) < minWords) {
    return { ok: false, message: "Didn't catch that. Try again." };
  }
  return { ok: true, text };
}

export async function transcribeOnce(
  blob: Blob,
  { minWordCount = DEFAULT_MIN_WORDS }: Partial<VoiceConfig> = {}
): Promise<TranscribeResult> {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");

  const resp = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const result = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    return { ok: false, message: "Sign in to use voice input." };
  }
  if (!resp.ok) {
    return { ok: false, message: result?.message || result?.error || "Transcription failed." };
  }
  if (!result?.ok || typeof result.text !== "string") {
    return { ok: false, message: "Transcription failed." };
  }

  return applyMinWordFilter(result.text.trim(), minWordCount);
}

type WsEvent = { type: "partial" | "final" | "error"; text?: string; message?: string };

export async function transcribeStream(
  blobs: Blob[],
  {
    minWordCount = DEFAULT_MIN_WORDS,
    onPartial,
  }: { minWordCount?: number; onPartial?: (text: string) => void } = {}
): Promise<TranscribeResult> {
  if (!isTranscribeWsEnabled() || blobs.length === 0) {
    // Fall back to single POST with last blob
    return transcribeOnce(blobs[blobs.length - 1], { minWordCount });
  }

  const ws = new WebSocket(`${window.location.origin.replace(/^http/, "ws")}/api/transcribe/stream`);

  const combined = new Blob(blobs, { type: blobs[0].type });

  return new Promise<TranscribeResult>((resolve) => {
    let closed = false;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(combined);
      ws.send("end");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsEvent;
        if (data.type === "partial" && data.text) {
          onPartial?.(data.text);
        } else if (data.type === "final" && typeof data.text === "string") {
          closed = true;
          ws.close();
          resolve(applyMinWordFilter(data.text.trim(), minWordCount));
        } else if (data.type === "error") {
          closed = true;
          ws.close();
          resolve({ ok: false, message: data.message || "Transcription failed." });
        }
      } catch {
        // ignore parse failures
      }
    };

    ws.onerror = () => {
      if (!closed) {
        closed = true;
        resolve(transcribeOnce(combined, { minWordCount }));
      }
    };

    ws.onclose = () => {
      if (closed) return;
      closed = true;
      // Any unresolved close should fall back to HTTP so voice mode never hangs.
      resolve(transcribeOnce(combined, { minWordCount }));
    };
  });
}
