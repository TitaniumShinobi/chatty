// @ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { parseOcrToDevInfo, formatMirrorDevInfo } from '../lib/mirrorParser';

interface MirrorConfig {
  source: 'tab' | 'window' | 'screen';
  permission: 'read' | 'write' | 'both';
}

interface MirrorProps {
  sessionId: string;
  config: MirrorConfig | null;
  onContextUpdate: (block: string) => void;
  onStatusChange: (status: string, captureCount: number) => void;
}

const CAPTURE_INTERVAL_MS = 5000;
const MAX_CAPTURES_PER_MIN = 12;
const CANVAS_WIDTH = 1280;
const SIMILARITY_THRESHOLD = 0.85;

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;
  if (longer.length === 0) return 1;
  const editDistance = (() => {
    const costs: number[] = [];
    for (let i = 0; i <= shorter.length; i++) {
      let lastVal = i;
      for (let j = 0; j <= longer.length; j++) {
        if (i === 0) { costs[j] = j; }
        else if (j > 0) {
          let newVal = costs[j - 1];
          if (shorter[i - 1] !== longer[j - 1]) {
            newVal = Math.min(newVal, lastVal, costs[j]) + 1;
          }
          costs[j - 1] = lastVal;
          lastVal = newVal;
        }
      }
      if (i > 0) costs[longer.length] = lastVal;
    }
    return costs[longer.length];
  })();
  return 1 - editDistance / longer.length;
}

const Mirror: React.FC<MirrorProps> = ({ sessionId, config, onContextUpdate, onStatusChange }) => {
  const [lastOcrText, setLastOcrText] = useState('');
  const [captureCount, setCaptureCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<any>(null);
  const captureTimestampsRef = useRef<number[]>([]);
  const configRef = useRef<MirrorConfig | null>(null);
  const lastOcrRef = useRef<string>('');

  configRef.current = config;

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLastOcrText('');
    setCaptureCount(0);
    captureTimestampsRef.current = [];
    lastOcrRef.current = '';
    onStatusChange('idle', 0);
  }, [onStatusChange]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const reportToolEvents = useCallback(
    async (events: Array<{ tool: string; detail?: string }>) => {
      try {
        await fetch('/api/vvault/tool-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, events }),
        });
      } catch (err) {
        console.warn('[Mirror] Failed to report tool events:', err);
      }
    },
    [sessionId]
  );

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;
    const currentConfig = configRef.current;
    if (!currentConfig) return;

    const now = Date.now();
    captureTimestampsRef.current = captureTimestampsRef.current.filter((ts) => now - ts < 60000);
    if (captureTimestampsRef.current.length >= MAX_CAPTURES_PER_MIN) {
      onStatusChange('rate-limited', captureCount);
      return;
    }
    captureTimestampsRef.current.push(now);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    const scale = CANVAS_WIDTH / video.videoWidth;
    canvas.width = CANVAS_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    onStatusChange('ocr...', captureCount);

    try {
      const canWrite = currentConfig.permission === 'write' || currentConfig.permission === 'both';

      if (canWrite) {
        await reportToolEvents([{ tool: 'mirror_capture', detail: 'frame captured' }]);
      }

      const { data: { text } } = await workerRef.current.recognize(canvas);
      const trimmed = text.trim();
      if (!trimmed) {
        onStatusChange('no text', captureCount);
        return;
      }

      const similarity = levenshteinSimilarity(trimmed, lastOcrRef.current);
      if (similarity > SIMILARITY_THRESHOLD) {
        onStatusChange('dedup (same frame)', captureCount);
        return;
      }

      lastOcrRef.current = trimmed;
      setLastOcrText(trimmed);
      const newCount = captureCount + 1;
      setCaptureCount(newCount);

      if (canWrite) {
        await reportToolEvents([{ tool: 'mirror_ocr', detail: `${trimmed.length} chars extracted` }]);

        const devInfo = parseOcrToDevInfo(trimmed, currentConfig.source);
        const contextBlock = formatMirrorDevInfo(devInfo);
        onContextUpdate(contextBlock);
        onStatusChange(`injected (${trimmed.length} chars)`, newCount);
      } else {
        onStatusChange(`captured (${trimmed.length} chars, read-only)`, newCount);
      }
    } catch (err) {
      console.error('[Mirror] OCR error:', err);
      onStatusChange('ocr error', captureCount);
    }
  }, [captureCount, onContextUpdate, onStatusChange, reportToolEvents]);

  const startCapture = useCallback(async (cfg: MirrorConfig) => {
    try {
      onStatusChange('requesting screen...', 0);

      const displayMediaOptions: any = {
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      if (cfg.source === 'tab') {
        displayMediaOptions.preferCurrentTab = false;
        if (displayMediaOptions.video) {
          displayMediaOptions.video.displaySurface = 'browser';
        }
      } else if (cfg.source === 'window') {
        if (displayMediaOptions.video) {
          displayMediaOptions.video.displaySurface = 'window';
        }
      } else {
        if (displayMediaOptions.video) {
          displayMediaOptions.video.displaySurface = 'monitor';
        }
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      streamRef.current = stream;

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        cleanup();
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      onStatusChange('loading OCR...', 0);
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng');
      workerRef.current = worker;

      onStatusChange('watching', 0);
      intervalRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
    } catch (err: any) {
      console.error('[Mirror] Start failed:', err);
      if (err.name === 'NotAllowedError') {
        onStatusChange('permission denied', 0);
      } else {
        onStatusChange('start failed', 0);
      }
      cleanup();
    }
  }, [captureFrame, cleanup, onStatusChange]);

  useEffect(() => {
    if (config && !streamRef.current) {
      startCapture(config);
    } else if (!config && streamRef.current) {
      cleanup();
    }
  }, [config, startCapture, cleanup]);

  if (typeof window !== 'undefined') {
    (window as any).__mirrorControls = {
      ...(window as any).__mirrorControls,
      stop: cleanup,
    };
  }

  return null;
};

export default Mirror;
