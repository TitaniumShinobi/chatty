import { WebSocketServer } from "ws";
import { speechToText, detectAudioFormat, convertToWav } from "../replit_integrations/audio/client.js";
import { runVADOnPath, shouldUseVAD, getVADEnv } from "../utils/vad.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

const MIN_WORDS = Number(process.env.VOICE_MIN_WORDS || 2);

function countWords(text = "") {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function writeTemp(buffer) {
  const p = join(tmpdir(), `transcribe_stream_${Date.now()}.wav`);
  await writeFile(p, buffer);
  return p;
}

export function setupTranscribeStream(server) {
  if ((process.env.TRANSCRIBE_WS || "off") !== "on") {
    console.log("[Transcribe][WS] Disabled (TRANSCRIBE_WS!=on)");
    return null;
  }

  const backend = (process.env.TRANSCRIPTION_BACKEND || "local").toLowerCase();
  const wss = new WebSocketServer({ server, path: "/api/transcribe/stream" });
  console.log("[Transcribe][WS] WebSocket server ready on /api/transcribe/stream");

  wss.on("connection", (ws) => {
    if (backend !== "openai") {
      ws.close(1013, "Streaming unsupported for local backend");
      return;
    }

    const chunks = [];

    ws.on("message", (data, isBinary) => {
      const text = !isBinary ? data.toString() : null;
      if (text === "end") {
        void handleComplete(ws, Buffer.concat(chunks));
        return;
      }
      chunks.push(Buffer.from(data));
    });
  });

  return wss;
}

async function handleComplete(ws, buffer) {
  let tmpPath = null;
  try {
    const detected = detectAudioFormat(buffer);
    let wavBuffer = buffer;
    if (detected !== "wav") {
      wavBuffer = await convertToWav(buffer);
    }
    tmpPath = await writeTemp(wavBuffer);

    if (shouldUseVAD()) {
      const vadResult = await runVADOnPath(tmpPath, getVADEnv());
      if (!vadResult?.hasSpeech) {
        ws.send(JSON.stringify({ type: "error", message: "No speech detected" }));
        ws.close(1008, "no speech");
        return;
      }
    }

    const final = (await speechToText(wavBuffer, "wav")) || "";
    const okWords = countWords(final) >= MIN_WORDS;
    ws.send(
      JSON.stringify(
        okWords
          ? { type: "final", text: final.trim() }
          : { type: "error", message: "Didn't catch that. Try again." }
      )
    );
    ws.close(1000);
  } catch (err) {
    console.error("[Transcribe][WS] error", err);
    ws.send(JSON.stringify({ type: "error", message: "Transcription failed." }));
    ws.close(1011, "stt error");
  } finally {
    if (tmpPath) await unlink(tmpPath).catch(() => {});
  }
}
