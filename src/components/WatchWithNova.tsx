// @ts-nocheck
import React, { useRef, useState, useCallback, useEffect } from "react";
import { Monitor, MonitorOff, Eye, EyeOff, Pen, PenLine } from "lucide-react";

interface WatchWithNovaProps {
  sessionId: string;
  onContextUpdate: (ocrText: string) => void;
  isActive: boolean;
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

const WatchWithNova: React.FC<WatchWithNovaProps> = ({
  sessionId,
  onContextUpdate,
  isActive,
}) => {
  const [watching, setWatching] = useState(false);
  const [writeAccess, setWriteAccess] = useState(true);
  const [lastOcrText, setLastOcrText] = useState("");
  const [captureCount, setCaptureCount] = useState(0);
  const [status, setStatus] = useState<string>("idle");

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<any>(null);
  const captureTimestampsRef = useRef<number[]>([]);

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
    setWatching(false);
    setStatus("idle");
    setCaptureCount(0);
    captureTimestampsRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const reportToolEvents = useCallback(
    async (events: Array<{ tool: string; detail?: string }>) => {
      try {
        await fetch("/api/vvault/tool-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sessionId, events }),
        });
      } catch (err) {
        console.warn("[WatchWithNova] Failed to report tool events:", err);
      }
    },
    [sessionId]
  );

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;

    const now = Date.now();
    captureTimestampsRef.current = captureTimestampsRef.current.filter(
      (ts) => now - ts < 60000
    );
    if (captureTimestampsRef.current.length >= MAX_CAPTURES_PER_MIN) {
      setStatus("rate-limited");
      return;
    }
    captureTimestampsRef.current.push(now);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.videoWidth === 0) return;

    const scale = CANVAS_WIDTH / video.videoWidth;
    canvas.width = CANVAS_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setStatus("ocr...");

    try {
      if (writeAccess) {
        await reportToolEvents([{ tool: "screen_capture", detail: "frame captured" }]);
      }

      const {
        data: { text },
      } = await workerRef.current.recognize(canvas);

      const trimmed = text.trim();
      if (!trimmed) {
        setStatus("no text");
        return;
      }

      const similarity = levenshteinSimilarity(trimmed, lastOcrText);
      if (similarity > SIMILARITY_THRESHOLD) {
        setStatus("dedup (same frame)");
        return;
      }

      setLastOcrText(trimmed);
      setCaptureCount((c) => c + 1);

      if (writeAccess) {
        await reportToolEvents([{ tool: "ocr", detail: `${trimmed.length} chars extracted` }]);
      }

      if (writeAccess) {
        const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
        const topLines = trimmed.split("\n").slice(0, 20).join("\n");
        const contextBlock = `[VIDEO_CONTEXT_UPDATE]\nts=${timestamp}\nocr="${topLines}"`;
        onContextUpdate(contextBlock);
        setStatus(`injected (${trimmed.length} chars)`);
      } else {
        setStatus(`captured (${trimmed.length} chars, write OFF)`);
      }
    } catch (err) {
      console.error("[WatchWithNova] OCR error:", err);
      setStatus("ocr error");
    }
  }, [lastOcrText, writeAccess, onContextUpdate, reportToolEvents]);

  const startWatching = useCallback(async () => {
    try {
      setStatus("requesting screen...");

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        cleanup();
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;

      setStatus("loading OCR...");
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng");
      workerRef.current = worker;

      setWatching(true);
      setStatus("watching");

      intervalRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
    } catch (err: any) {
      console.error("[WatchWithNova] Start failed:", err);
      if (err.name === "NotAllowedError") {
        setStatus("permission denied");
      } else {
        setStatus("start failed");
      }
      cleanup();
    }
  }, [captureFrame, cleanup]);

  const stopWatching = useCallback(() => {
    cleanup();
  }, [cleanup]);

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-app-chat-50 rounded-lg border border-app-butter-300">
      <button
        onClick={watching ? stopWatching : startWatching}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          watching
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
            : "bg-app-green-600/20 text-app-green-600 hover:bg-app-green-600/30 border border-app-green-600/30"
        }`}
        title={watching ? "Stop watching" : "Start screen capture"}
      >
        {watching ? <MonitorOff size={14} /> : <Monitor size={14} />}
        {watching ? "Stop" : "Watch"}
      </button>

      {watching && (
        <>
          <button
            onClick={() => setWriteAccess((w) => !w)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              writeAccess
                ? "bg-app-green-600/20 text-app-green-600 border border-app-green-600/30"
                : "bg-app-orange-600/20 text-app-orange-400 border border-app-orange-500/30"
            }`}
            title={writeAccess ? "Write Access ON — OCR text injected into chat" : "Write Access OFF — capturing but not injecting"}
          >
            {writeAccess ? <Pen size={12} /> : <PenLine size={12} />}
            {writeAccess ? "Write ON" : "Write OFF"}
          </button>

          <span className="text-xs text-app-text-800">
            {status} {captureCount > 0 && `· ${captureCount} frames`}
          </span>
        </>
      )}
    </div>
  );
};

export default WatchWithNova;
