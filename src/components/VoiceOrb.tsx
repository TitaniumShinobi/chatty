import React from "react";
import { OrbRenderer, ORB_SIZE } from "../voice-renderer/orbRenderer";

export type VoiceOrbState = "idle" | "userSpeaking" | "transcribing" | "aiSpeaking";

interface VoiceOrbProps {
  active: boolean;
  state: VoiceOrbState;
  /** Input: mic stream (userSpeaking). Drives input amplitude when present. */
  stream?: MediaStream | null;
  /** Output: TTS playback element (aiSpeaking). Used for output amplitude. */
  outputAudio?: HTMLAudioElement | null;
  /** Optional override for mic-driven amplitude (0–1). */
  inputAmplitude?: number;
  /** Optional TTS/output amplitude (0–1) for aiSpeaking state. */
  outputAmplitude?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Lir'Vahxir | Yunémun (Celestial Anchor) — central voice-mode orb.
 * Center is the procedural OrbRenderer from voice-renderer (no static image).
 * Wrapper provides glow, ring, and breathing animation when idle.
 */
export default function VoiceOrb({
  active,
  state,
  stream,
  outputAudio,
  className = "",
  style,
}: VoiceOrbProps) {
  if (!active) return null;

  const intensity =
    state === "userSpeaking"
      ? 0.6
      : state === "transcribing"
        ? 0.7
        : state === "aiSpeaking"
          ? 0.6
          : 0.4;

  return (
    <div
      className={`voice-orb voice-orb--${state} ${className}`}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 100,
        zIndex: 5,
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: "50%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        ["--orb-intensity" as string]: intensity,
        ...style,
      }}
    >
      <div
        className="voice-orb__glow"
        style={{
          position: "absolute",
          inset: -20,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)`,
          opacity: 0.4 + intensity * 0.5,
          animation: state === "idle" ? "voice-orb-breathe 3s ease-in-out infinite" : "none",
        }}
      />
      <div
        className="voice-orb__ring"
        style={{
          position: "absolute",
          inset: -8,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.15)",
          opacity: 0.5 + intensity * 0.3,
        }}
      />
      <div
        style={{
          position: "relative",
          width: ORB_SIZE,
          height: ORB_SIZE,
          flexShrink: 0,
        }}
      >
        <OrbRenderer
          state={state}
          inputStream={stream ?? null}
          outputAudio={outputAudio ?? null}
        />
      </div>
    </div>
  );
}
