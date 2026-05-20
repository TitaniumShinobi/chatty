import React, { createContext, useContext, useState } from "react";

interface TtsPlaybackContextValue {
  isTtsPlaying: boolean;
  setTtsPlaying: (playing: boolean) => void;
  currentAudioElement: HTMLAudioElement | null;
  setCurrentAudioElement: (el: HTMLAudioElement | null) => void;
}

const TtsPlaybackContext = createContext<TtsPlaybackContextValue | undefined>(undefined);

export function TtsPlaybackProvider({ children }: { children: React.ReactNode }) {
  const [isTtsPlaying, setTtsPlaying] = useState(false);
  const [currentAudioElement, setCurrentAudioElement] = useState<HTMLAudioElement | null>(null);
  const value = { isTtsPlaying, setTtsPlaying, currentAudioElement, setCurrentAudioElement };
  return (
    <TtsPlaybackContext.Provider value={value}>
      {children}
    </TtsPlaybackContext.Provider>
  );
}

export function useTtsPlayback(): TtsPlaybackContextValue {
  const ctx = useContext(TtsPlaybackContext);
  if (ctx === undefined) {
    throw new Error("useTtsPlayback must be used within TtsPlaybackProvider");
  }
  return ctx;
}
