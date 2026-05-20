/**
 * Web Audio API helpers for orb: input (mic) and output (TTS) amplitude.
 * No static assets. Used by orbRenderer to drive visual intensity.
 */

const SMOOTHING = 0.4;
const FFT_SIZE = 256;

export type AmplitudeCallback = (value: number) => void;

/**
 * Subscribe to normalized amplitude (0–1) from a MediaStream (e.g. mic).
 * Returns cleanup function.
 */
export function subscribeInputAmplitude(
  stream: MediaStream | null,
  onAmplitude: AmplitudeCallback,
): () => void {
  if (!stream || stream.getAudioTracks().length === 0) {
    onAmplitude(0);
    return () => {};
  }

  const AudioCtx =
    typeof window !== "undefined"
      ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : null;
  if (!AudioCtx) {
    onAmplitude(0);
    return () => {};
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const avg = sum / dataArray.length / 255;
    onAmplitude(Math.min(1, avg * 2.5));
    rafId = requestAnimationFrame(tick);
  };

  (async () => {
    if (ctx.state === "suspended") await ctx.resume();
    if (!cancelled) rafId = requestAnimationFrame(tick);
  })();

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    try {
      ctx.close();
    } catch {
      void 0;
    }
  };
}

/**
 * Subscribe to normalized amplitude (0–1) from an HTMLAudioElement (e.g. TTS).
 * Returns cleanup function.
 */
export function subscribeOutputAmplitude(
  audio: HTMLAudioElement | null,
  onAmplitude: AmplitudeCallback,
): () => void {
  if (!audio) {
    onAmplitude(0);
    return () => {};
  }

  const AudioCtx =
    typeof window !== "undefined"
      ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : null;
  if (!AudioCtx) {
    onAmplitude(0);
    return () => {};
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  source.connect(analyser);
  source.connect(ctx.destination);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const avg = sum / dataArray.length / 255;
    onAmplitude(Math.min(1, avg * 2.5));
    rafId = requestAnimationFrame(tick);
  };

  (async () => {
    if (ctx.state === "suspended") await ctx.resume();
    if (!cancelled) rafId = requestAnimationFrame(tick);
  })();

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    try {
      ctx.close();
    } catch {
      void 0;
    }
  };
}
