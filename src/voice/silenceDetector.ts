export interface SilenceDetectorOptions {
  threshold: number; // normalized 0..1
  silenceMs: number;
}

/**
 * Attaches a lightweight analyser-based silence detector to a stream.
 * Calls onSilenceEnd when sustained silence reaches threshold.
 */
export function attachSilenceDetector(
  stream: MediaStream,
  { threshold, silenceMs }: SilenceDetectorOptions,
  onSilenceEnd: () => void,
  onSpeech?: () => void
): () => void {
  const AudioCtx =
    typeof window !== "undefined"
      ? (window.AudioContext ||
          // @ts-expect-error webkit fallback
          window.webkitAudioContext)
      : null;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  let silenceStart: number | null = null;

  const tick = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const level = sum / dataArray.length / 255;
    const now = Date.now();
    if (level > threshold) {
      silenceStart = null;
      onSpeech?.();
    } else if (silenceStart === null) {
      silenceStart = now;
    } else if (now - silenceStart >= silenceMs) {
      onSilenceEnd();
      silenceStart = null;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    try {
      ctx.close();
    } catch {
      // ignore
    }
  };
}
