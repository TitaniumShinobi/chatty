import { useCallback, useEffect, useState } from "react";

type MockVoiceState = {
  voiceState: "idle" | "recording" | "transcribing";
  isVoiceMode: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  partialTranscript: string;
  transcriptError: string | null;
  currentRecordingStream: MediaStream | null;
};

const defaultState: MockVoiceState = {
  voiceState: "idle",
  isVoiceMode: false,
  isRecording: false,
  isTranscribing: false,
  partialTranscript: "",
  transcriptError: null,
  currentRecordingStream: null,
};

let currentState: MockVoiceState = { ...defaultState };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function patchState(patch: Partial<MockVoiceState>) {
  currentState = { ...currentState, ...patch };
  emit();
}

export function __resetMockVoiceController() {
  currentState = { ...defaultState };
  emit();
}

export function __setMockVoiceControllerState(patch: Partial<MockVoiceState>) {
  patchState(patch);
}

// Jest mock for useVoiceController (avoids import.meta in Node)
export function useVoiceController(options: {
  onError?: (msg: string | null) => void;
  onFocusComposer?: () => void;
} = {}) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const startVoice = useCallback(async () => {
    patchState({
      voiceState: "recording",
      isVoiceMode: true,
      isRecording: true,
      isTranscribing: false,
      partialTranscript: "",
    });
    options.onFocusComposer?.();
    return true;
  }, [options]);

  const startDictate = useCallback(async () => {
    patchState({
      voiceState: "recording",
      isVoiceMode: false,
      isRecording: true,
      isTranscribing: false,
      partialTranscript: "",
    });
    options.onFocusComposer?.();
    return true;
  }, [options]);

  const stopRecording = useCallback(() => {
    patchState({
      voiceState: "idle",
      isVoiceMode: false,
      isRecording: false,
      isTranscribing: false,
      partialTranscript: "",
    });
  }, []);

  const exitVoiceMode = useCallback(() => {
    patchState({
      voiceState: "idle",
      isVoiceMode: false,
      isRecording: false,
      isTranscribing: false,
      partialTranscript: "",
    });
  }, []);

  const setTranscriptError = useCallback((msg: string | null) => {
    patchState({ transcriptError: msg });
    options.onError?.(msg);
  }, [options]);

  return {
    voiceState: currentState.voiceState,
    isVoiceMode: currentState.isVoiceMode,
    isRecording: currentState.isRecording,
    isTranscribing: currentState.isTranscribing,
    partialTranscript: currentState.partialTranscript,
    transcriptError: currentState.transcriptError,
    currentRecordingStream: currentState.currentRecordingStream,
    startVoice,
    startDictate,
    stopRecording,
    exitVoiceMode,
    setTranscriptError,
    supported: true,
    startListening: startDictate,
    stopListening: stopRecording,
    isListening: currentState.isRecording,
    error: currentState.transcriptError,
  };
}
