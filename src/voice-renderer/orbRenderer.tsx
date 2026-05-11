/**
 * Procedural cosmic orb renderer. No static images or textures.
 * Uses audioAnalyzer for input/output amplitude; amplitude refs feed the draw loop.
 */

import React, { useEffect, useRef } from "react";
import { subscribeInputAmplitude, subscribeOutputAmplitude } from "./audioAnalyzer";
import {
  createParticles,
  drawParticles,
  updateParticles,
  type OrbState,
} from "./orbParticles";

export const ORB_SIZE = 160;

export interface OrbRendererProps {
  state: OrbState;
  inputStream?: MediaStream | null;
  outputAudio?: HTMLAudioElement | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Single procedural orb: vortex, glow, core, halo particles.
 * Idle = breathing; userSpeaking = mic amplitude; transcribing = slow vortex; aiSpeaking = TTS amplitude.
 */
export function OrbRenderer({
  state,
  inputStream = null,
  outputAudio = null,
  className = "",
  style,
}: OrbRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const particlesRef = useRef(createParticles());
  const lastTimeRef = useRef(performance.now() / 1000);
  const inputAmplitudeRef = useRef(0);
  const outputAmplitudeRef = useRef(0);

  useEffect(() => {
    const unsubInput = subscribeInputAmplitude(
      state === "userSpeaking" ? inputStream ?? null : null,
      (value) => {
        inputAmplitudeRef.current = value;
      },
    );
    return unsubInput;
  }, [state, inputStream]);

  useEffect(() => {
    const unsubOutput = subscribeOutputAmplitude(
      state === "aiSpeaking" ? outputAudio ?? null : null,
      (value) => {
        outputAmplitudeRef.current = value;
      },
    );
    return unsubOutput;
  }, [state, outputAudio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const w = ORB_SIZE;
    const h = ORB_SIZE;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    let cancelled = false;

    const draw = () => {
      if (cancelled) return;

      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - lastTimeRef.current);
      lastTimeRef.current = now;

      phaseRef.current += 0.016;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2;

      const inputAmp = inputAmplitudeRef.current;
      const outputAmp = outputAmplitudeRef.current;
      const amp =
        state === "userSpeaking"
          ? inputAmp
          : state === "aiSpeaking"
            ? outputAmp
            : state === "transcribing"
              ? 0.4 + 0.3 * Math.sin(now * 2)
              : 0.4 + 0.15 * Math.sin(now * 1.2);

      updateParticles(particlesRef.current, state, amp, dt);

      // Outer glow (radial)
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR + 20);
      const glowAlpha = 0.15 + amp * 0.35;
      glowGrad.addColorStop(0, `rgba(99, 102, 241, ${glowAlpha * 0.8})`);
      glowGrad.addColorStop(0.5, `rgba(99, 102, 241, ${glowAlpha * 0.3})`);
      glowGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);

      // Halo particles
      drawParticles(ctx, cx, cy, maxR, particlesRef.current, state, amp);

      // Vortex / swirl arcs
      const swirlCount = 12;
      const swirlSpeed = state === "transcribing" ? 0.3 : state === "idle" ? 0.15 : 0.5 + amp * 0.8;
      const rotation = phaseRef.current * swirlSpeed;

      for (let i = 0; i < swirlCount; i++) {
        const a = (i / swirlCount) * Math.PI * 2 + rotation;
        const innerR = maxR * (0.2 + 0.15 * Math.sin(now + i * 0.5));
        const outerR = maxR * (0.6 + 0.25 * amp + 0.1 * Math.sin(now * 0.7 + i));
        const sweep = ((Math.PI * 2) / swirlCount) * (1.2 + 0.3 * amp);
        const alpha = 0.08 + 0.2 * amp + 0.05 * Math.sin(now + i);
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, a, a + sweep);
        ctx.arc(cx, cy, innerR, a + sweep, a, true);
        ctx.closePath();
        ctx.strokeStyle = `rgba(180, 180, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Luminous core
      const coreR = maxR * (0.25 + 0.15 * amp);
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreGrad.addColorStop(0, `rgba(220, 220, 255, ${0.5 + amp * 0.4})`);
      coreGrad.addColorStop(0.5, `rgba(99, 102, 241, ${0.3 + amp * 0.3})`);
      coreGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      const nucleusR = maxR * 0.08 * (1 + amp * 0.5);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + amp * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={ORB_SIZE}
      height={ORB_SIZE}
      className={className}
      style={{
        width: ORB_SIZE,
        height: ORB_SIZE,
        display: "block",
        borderRadius: "50%",
        ...style,
      }}
      aria-hidden
    />
  );
}
