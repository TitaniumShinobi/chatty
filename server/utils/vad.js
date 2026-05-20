import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const VAD_SCRIPT = join(__dirname, "vad.py");

function getPythonBinary() {
  if (process.env.TRANSCRIBE_PYTHON) return process.env.TRANSCRIBE_PYTHON;
  const venvPython = join(__dirname, "..", "venv", "bin", "python3");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

function getFfmpegBinary() {
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath;
  } catch {
    // Optional dependency fallback.
  }
  return "ffmpeg";
}

export async function runVADOnWavBuffer(buffer, envOverrides = {}) {
  const wavPath = join(tmpdir(), `vad_${randomUUID()}.wav`);
  await writeFile(wavPath, buffer);
  try {
    return await runVADOnPath(wavPath, envOverrides);
  } finally {
    await unlink(wavPath).catch(() => {});
  }
}

export async function runVADOnPath(wavPath, envOverrides = {}) {
  const pythonCmd = getPythonBinary();
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [VAD_SCRIPT, wavPath], {
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    proc.stdout.on("data", (d) => stdout.push(d));
    proc.stderr.on("data", (d) => stderr.push(d));
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `vad.py exited with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`
          )
        );
      }
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    proc.on("error", reject);
  });
}

export function shouldUseVAD() {
  return (process.env.TRANSCRIBE_VAD || "on").toLowerCase() !== "off";
}

export function getVADEnv() {
  return {
    VAD_MODE: process.env.VAD_MODE || "3",
    VAD_FRAME_MS: process.env.VAD_FRAME_MS || "30",
    VAD_MIN_VOICE_MS: process.env.VAD_MIN_VOICE_MS || "400",
  };
}

export async function trimWavSegment(inputPath, startMs, endMs) {
  const outputPath = join(tmpdir(), `trim_${randomUUID()}.wav`);
  const args = [
    "-i",
    inputPath,
    "-ss",
    `${startMs / 1000}`,
    "-to",
    `${endMs / 1000}`,
    "-acodec",
    "copy",
    "-y",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegBinary(), args, { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg trim exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
