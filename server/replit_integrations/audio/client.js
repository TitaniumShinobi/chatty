import OpenAI, { toFile } from "openai";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const getFfmpegPath = () => {
  try {
    const p = require("ffmpeg-static");
    if (p && existsSync(p)) return p;
  } catch {
    // optional dependency not installed
  }
  return "ffmpeg";
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const FASTER_WHISPER_SCRIPT = join(__dirname, "..", "..", "scripts", "transcribe_faster_whisper.py");

const openaiApiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  "dummy";

const keySource = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? "AI_INTEGRATIONS_OPENAI_API_KEY"
  : process.env.OPENAI_API_KEY
    ? "OPENAI_API_KEY"
    : "none (dummy)";
console.log("[Transcribe] API key source:", keySource);
const ffmpegPath = getFfmpegPath();
console.log("[Transcribe] ffmpeg:", ffmpegPath === "ffmpeg" ? "ffmpeg (PATH)" : ffmpegPath);

export const openai = new OpenAI({
  apiKey: openaiApiKey,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const TRANSCRIBE_KEY_PLACEHOLDER = "dummy";
function isTranscribeConfigured() {
  const key = (openaiApiKey || "").trim();
  return key.length > 0 && key !== TRANSCRIBE_KEY_PLACEHOLDER;
}

export function detectAudioFormat(buffer) {
  if (!buffer || buffer.length < 12) return "unknown";

  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

export async function convertToWav(audioBuffer) {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise((resolve, reject) => {
      const stderrChunks = [];
      const ffmpegBin = getFfmpegPath();
      const ffmpeg = spawn(ffmpegBin, [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk);
      });
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else {
          const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
          const detail = stderr ? `: ${stderr.slice(-500)}` : "";
          reject(new Error(`ffmpeg exited with code ${code}${detail}`));
        }
      });
      ffmpeg.on("error", (err) => {
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export async function ensureCompatibleFormat(audioBuffer) {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") {
    console.log("[Transcribe] ensureCompatibleFormat: passthrough wav");
    return { buffer: audioBuffer, format: "wav" };
  }
  if (detected === "mp3") {
    console.log("[Transcribe] ensureCompatibleFormat: passthrough mp3");
    return { buffer: audioBuffer, format: "mp3" };
  }
  if (detected === "webm") {
    console.log("[Transcribe] ensureCompatibleFormat: passthrough webm (no ffmpeg)");
    return { buffer: audioBuffer, format: "webm" };
  }
  console.log("[Transcribe] ensureCompatibleFormat: converting via ffmpeg, detected:", detected);
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

export async function speechToText(audioBuffer, format = "wav", options = {}) {
  if (!isTranscribeConfigured()) {
    throw new Error(
      "Transcription not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY (and optionally AI_INTEGRATIONS_OPENAI_BASE_URL for Replit)."
    );
  }
  const file = await toFile(audioBuffer, `audio.${format}`);
  const params = { file, model: "gpt-4o-mini-transcribe" };
  if (options.language) params.language = options.language; // e.g. "en" for English
  const response = await openai.audio.transcriptions.create(params);
  return response.text;
}

/**
 * Prepare audio for local faster-whisper: ensure WAV and write to a temp file.
 * Browser WebM is converted via ffmpeg; WAV is written as-is.
 * Caller must unlink the returned path when done.
 */
export async function prepareWavForLocalTranscribe(audioBuffer) {
  const detected = detectAudioFormat(audioBuffer);
  let wavBuffer;
  if (detected === "wav") {
    wavBuffer = audioBuffer;
  } else {
    console.log("[Transcribe] Local backend: converting to WAV (detected:", detected, ")");
    wavBuffer = await convertToWav(audioBuffer);
  }
  const wavPath = join(tmpdir(), `transcribe_${randomUUID()}.wav`);
  await writeFile(wavPath, wavBuffer);
  return wavPath;
}

/**
 * Transcribe using local faster-whisper. Requires Python 3 and `pip install faster-whisper`.
 * For browser WebM uploads, ffmpeg must be installed (used by prepareWavForLocalTranscribe).
 */
function getTranscribePython() {
  if (process.env.TRANSCRIBE_PYTHON) return process.env.TRANSCRIBE_PYTHON;
  const venvPython = join(__dirname, "..", "..", "venv", "bin", "python3");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}
export function transcribeWithFasterWhisper(wavFilePath, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonCmd = getTranscribePython();
    const args = [FASTER_WHISPER_SCRIPT, wavFilePath];
    if (options.language) args.push(options.language);
    const proc = spawn(pythonCmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    proc.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code === 0) {
        resolve(stdout || "");
      } else {
        reject(
          new Error(
            stderr || `faster-whisper exited with code ${code}. Install: pip install faster-whisper`
          )
        );
      }
    });
    proc.on("error", (err) => {
      reject(
        new Error(
          `Local transcription failed: ${err.message}. Ensure Python 3 is on PATH (or set TRANSCRIBE_PYTHON).`
        )
      );
    });
  });
}
