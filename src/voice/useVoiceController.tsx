import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachSilenceDetector } from "./silenceDetector";
import { startRecorder } from "./recorder";
import { applyMinWordFilter, transcribeOnce, transcribeStream } from "./transcribeClient";
import { TranscribeResult, VoiceConfig, VoiceMode, VoiceState, VoiceControllerCallbacks } from "./types";

const envVoice = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env as any);

const DEFAULT_CONFIG: VoiceConfig = {
  silenceThreshold: 0.03,
  silenceMs: 1000,
  partialIntervalMs: 2500,
  minWordCount: Number(envVoice?.VITE_VOICE_MIN_WORDS || 2),
};

interface UseVoiceControllerOptions extends VoiceControllerCallbacks {
  config?: Partial<VoiceConfig>;
  enableStreaming?: boolean;
  devLog?: boolean;
}

export function useVoiceController({
  onInsertText,
  onSubmitVoice,
  onFocusComposer,
  onError,
  config,
  enableStreaming = envVoice?.VITE_TRANSCRIBE_WS === "on",
  devLog = !!envVoice?.DEV,
}: UseVoiceControllerOptions) {
  const cfg = useMemo<VoiceConfig>(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [currentRecordingStream, setCurrentRecordingStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const partialIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceCleanupRef = useRef<() => void>(() => {});
  const utteranceStartRef = useRef<number>(0);
  const speechEndRef = useRef<number | null>(null);
  const voiceModeExitingRef = useRef(false);
  const recordingModeRef = useRef<VoiceMode | null>(null);
  const transcribeBlobRef = useRef<(blob: Blob, mode: VoiceMode, durationMs: number) => Promise<void>>(null!);

  const reset = useCallback(() => {
    setVoiceState("idle");
    setIsVoiceMode(false);
    setPartialTranscript("");
    setTranscriptError(null);
    if (partialIntervalRef.current) clearInterval(partialIntervalRef.current);
    partialIntervalRef.current = null;
    silenceCleanupRef.current?.();
    silenceCleanupRef.current = () => {};
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    currentRecordingStream?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setCurrentRecordingStream(null);
    recordingModeRef.current = null;
  }, [currentRecordingStream]);

  useEffect(() => reset, [reset]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setVoiceState("transcribing");
      mediaRecorderRef.current.stop();
    }
  }, []);

  const exitVoiceMode = useCallback(() => {
    voiceModeExitingRef.current = true;
    stopRecording();
  }, [stopRecording]);

  const handleError = useCallback(
    (message: string) => {
      setTranscriptError(message);
      onError?.(message);
      setVoiceState("error");
    },
    [onError]
  );

  const commitTranscription = useCallback(
    (result: TranscribeResult, durationMs: number, mode: VoiceMode) => {
      if (!result.ok) {
        handleError(result.message || "Transcription failed.");
        return;
      }
      const text = result.text?.trim();
      if (!text) {
        handleError("Didn't catch that. Try again.");
        return;
      }
      if (mode === "dictate") {
        onInsertText(text);
        onFocusComposer?.();
      } else {
        onSubmitVoice(text, durationMs);
      }
      setTranscriptError(null);
    },
    [handleError, onFocusComposer, onInsertText, onSubmitVoice]
  );

  const startRecording = useCallback(
    async (mode: VoiceMode) => {
      if (voiceState === "transcribing") return;
      if (voiceState === "recording") {
        stopRecording();
        return;
      }

      try {
        setTranscriptError(null);
        recordingModeRef.current = mode;
        if (mode === "dictate") {
          setIsVoiceMode(false);
        }
        const { stream, mediaRecorder } = await startRecorder(mode, { preferHeadset: true });

        audioChunksRef.current = [];
        mediaRecorderRef.current = mediaRecorder;
        setCurrentRecordingStream(stream);
        setVoiceState("recording");
        if (mode === "voice") {
          setIsVoiceMode(true);
          utteranceStartRef.current = Date.now();
        }

        silenceCleanupRef.current = attachSilenceDetector(
          stream,
          { threshold: cfg.silenceThreshold, silenceMs: cfg.silenceMs },
          () => {
            if (mode === "voice") {
              speechEndRef.current = Date.now();
              stopRecording();
            }
          },
          () => {
            // speech detected
          }
        );

        mediaRecorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          if (partialIntervalRef.current) {
            clearInterval(partialIntervalRef.current);
            partialIntervalRef.current = null;
          }
          if (voiceModeExitingRef.current) {
            voiceModeExitingRef.current = false;
            reset();
            return;
          }
          silenceCleanupRef.current();
          silenceCleanupRef.current = () => {};

          if (voiceModeExitingRef.current) {
            voiceModeExitingRef.current = false;
            reset();
            return;
          }

          const modeWhenStopped = recordingModeRef.current;
          recordingModeRef.current = null;
          if (!modeWhenStopped) return;

          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          if (blob.size < 500) {
            setVoiceState("idle");
            if (modeWhenStopped === "voice") {
              startRecording("voice");
            }
            return;
          }
          const utteranceEnd = Date.now();
          const durationMs = Math.max(0, utteranceEnd - (utteranceStartRef.current || utteranceEnd));

          setVoiceState("transcribing");
          const transcriptTarget = new Blob(audioChunksRef.current, { type: "audio/webm" });

          if (modeWhenStopped === "dictate") {
            const result = await transcribeOnce(transcriptTarget, { minWordCount: cfg.minWordCount });
            commitTranscription(result, durationMs, modeWhenStopped);
            setVoiceState("idle");
            return;
          }

          await transcribeBlobRef.current?.(transcriptTarget, modeWhenStopped, durationMs);
        };

        if (mode === "voice") {
          partialIntervalRef.current = setInterval(() => {
            const chunks = audioChunksRef.current;
            if (!chunks.length) return;
            const blob = new Blob([...chunks], { type: "audio/webm" });
            if (blob.size < 500) return;
            transcribeOnce(blob, { minWordCount: cfg.minWordCount })
              .then((r) => {
                if (r.ok && typeof r.text === "string") {
                  setPartialTranscript(r.text.trim());
                }
              })
              .catch(() => {});
          }, cfg.partialIntervalMs);
        }

        mediaRecorder.start();
      } catch (err: any) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          handleError("Microphone access denied. Allow mic in browser settings.");
        } else {
          handleError("Could not access microphone.");
        }
        reset();
      }
    },
    [cfg.minWordCount, cfg.partialIntervalMs, cfg.silenceMs, cfg.silenceThreshold, commitTranscription, handleError, reset, stopRecording, voiceState]
  );

  const transcribeBlob = useCallback(
    async (blob: Blob, mode: VoiceMode, durationMs: number) => {
      try {
        const before = Date.now();
        const result = enableStreaming
          ? await transcribeStream(audioChunksRef.current, {
              minWordCount: cfg.minWordCount,
              onPartial: setPartialTranscript,
            })
          : await transcribeOnce(blob, { minWordCount: cfg.minWordCount });
        const after = Date.now();
        if (devLog) {
          console.log("[voice] stt latency ms:", after - before);
        }
        commitTranscription(result, durationMs, mode);
      } catch (err) {
        console.error("[voice] transcribe error", err);
        handleError("Connection error. Check your network and try again.");
      } finally {
        audioChunksRef.current = [];
        speechEndRef.current = null;
        setVoiceState("idle");
        if (mode === "voice" && !voiceModeExitingRef.current && isVoiceMode) {
          startRecording("voice");
        }
      }
    },
    [cfg.minWordCount, commitTranscription, devLog, enableStreaming, handleError, isVoiceMode, startRecording]
  );
  transcribeBlobRef.current = transcribeBlob;

  return {
    voiceState,
    isVoiceMode,
    isTranscribing: voiceState === "transcribing",
    isRecording: voiceState === "recording",
    partialTranscript,
    transcriptError,
    currentRecordingStream,
    startDictate: () => startRecording("dictate"),
    startVoice: () => startRecording("voice"),
    stopRecording,
    exitVoiceMode,
    setTranscriptError,
    setPartialTranscript,
  };
}
