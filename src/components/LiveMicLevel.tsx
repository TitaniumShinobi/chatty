import React, { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 16;
const SMOOTHING = 0.45;
const MIN_BAR_HEIGHT = 7;
const BAR_HEIGHT_SCALE = 56;

interface LiveMicLevelProps {
  stream: MediaStream | null;
  className?: string;
  style?: React.CSSProperties;
}

type WindowWithWebkitAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Live audio-level bars driven by mic input. Uses AnalyserNode for real
 * amplitude data; no fake animation when stream is available.
 */
export default function LiveMicLevel({ stream, className = '', style }: LiveMicLevelProps) {
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevels(Array(BAR_COUNT).fill(0));
      return;
    }

    const AudioCtx =
      window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioCtx) {
      setLevels(Array(BAR_COUNT).fill(0));
      return;
    }

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = SMOOTHING;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    const bucketSize = Math.floor(bufferLength / BAR_COUNT);

    let cancelled = false;

    const tick = () => {
      if (cancelled || !analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(dataArray);
      const next: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += Math.abs(dataArray[i * bucketSize + j] - 128);
        }
        next.push(Math.min(1, (sum / bucketSize) / 42));
      }
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try {
        source.disconnect();
        ctx.close();
      } catch {
        // Ignore teardown errors from already-closed audio nodes.
      }
      analyserRef.current = null;
      setLevels(Array(BAR_COUNT).fill(0));
    };
  }, [stream]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        minHeight: 44,
        paddingTop: 4,
        paddingBottom: 4,
        ...style,
      }}
      aria-hidden
    >
      {levels.map((level, i) => (
        <div
          key={i}
          style={{
            width: 5,
            minHeight: MIN_BAR_HEIGHT,
            height: `${Math.max(MIN_BAR_HEIGHT, 10 + level * BAR_HEIGHT_SCALE)}px`,
            borderRadius: 999,
            backgroundColor: 'var(--chatty-accent)',
            opacity: 0.72 + level * 0.28,
            boxShadow: level > 0.08 ? '0 0 12px rgba(255, 255, 255, 0.16)' : 'none',
            transition: 'height 0.05s ease-out, opacity 0.05s ease-out',
          }}
        />
      ))}
    </div>
  );
}
