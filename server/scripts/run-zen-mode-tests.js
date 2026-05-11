#!/usr/bin/env node
/**
 * Run Zen mode test prompts via POST /api/vvault/message, write responses to
 * documents/zen-mode-tests/ and produce DIGEST.md. Research use.
 * Run from repo root: node server/scripts/run-zen-mode-tests.js
 */
import "../loadEnv.js";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "documents", "zen-mode-tests");

const JWT_SECRET = process.env.JWT_SECRET;
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || "sid";
const TEST_USER_ID = process.env.TEST_USER_ID || "dev-agent";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const REQUEST_TIMEOUT_MS = 20000;

const PROMPTS = [
  {
    slug: "01-general-non-codex",
    label: "General (should stay non-codex)",
    prompt:
      "Zen, quick check-in—how's the day going? No code.",
  },
  {
    slug: "02-coding-intent",
    label: "Coding intent",
    prompt:
      "Scan this repo for likely circular deps and tell me which files to inspect first.",
  },
  {
    slug: "03-coding-file-paths",
    label: "Coding + file paths",
    prompt:
      "Open `src/lib/modelProviders.ts` and `server/routes/vvault.js`; list concrete edits to route coding requests to the coder model.",
  },
  {
    slug: "04-coding-tests",
    label: "Coding + tests",
    prompt:
      "Tell me which tests to add for the coder routing guard and where to place them.",
  },
  {
    slug: "05-override-persistence",
    label: "Override persistence",
    prompt:
      "Apply my system override: 'Stay terse and technical.' Now refactor `gptService.ts` to avoid duplicate model resolution.",
  },
  {
    slug: "06-vision-guard",
    label: "Vision guard (no codex switch)",
    prompt:
      "I'm sending an image; only describe it briefly—don't switch to coder mode.",
  },
  {
    slug: "07-fallback-visibility",
    label: "Fallback visibility",
    prompt:
      "If the coder provider isn't available, say which provider/model you'll use instead and why.",
  },
];

function getToken() {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
  const payload = { sub: TEST_USER_ID };
  if (TEST_USER_EMAIL) payload.email = TEST_USER_EMAIL;
  return jwt.sign(payload, JWT_SECRET);
}

async function sendMessage(prompt, constructId = "zen-001") {
  const url = `${API_BASE_URL}/api/vvault/message`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${COOKIE_NAME}=${getToken()}`,
      },
      body: JSON.stringify({ constructId, message: prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, statusText: res.statusText, data };
  } catch (err) {
    clearTimeout(timeout);
    return {
      status: 0,
      statusText: err.name === "AbortError" ? "Timeout" : err.message,
      data: { error: String(err.message) },
    };
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const results = [];
  for (const { slug, label, prompt } of PROMPTS) {
    const outPath = path.join(OUT_DIR, `${slug}.json`);
    const response = await sendMessage(prompt);
    const record = {
      slug,
      label,
      prompt,
      requestedAt: new Date().toISOString(),
      status: response.status,
      statusText: response.statusText,
      response: response.data,
    };
    results.push(record);
    await fs.writeFile(outPath, JSON.stringify(record, null, 2), "utf8");
  }

  const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const digestLines = [
    "# Zen mode test digest",
    "",
    "Prompts exercised via `POST /api/vvault/message` (constructId: zen-001).",
    "",
    `Completed: ${new Date().toISOString()}`,
    `Responses: ${ok}/${results.length} OK`,
    "",
    "## Per-prompt summary",
    "",
  ];
  for (const r of results) {
    const statusStr =
      r.status >= 200 && r.status < 300
        ? "OK"
        : `HTTP ${r.status} ${r.statusText || ""}`;
    const preview =
      r.response?.response != null
        ? String(r.response.response).slice(0, 200).replace(/\n/g, " ")
        : r.response?.error ?? JSON.stringify(r.response).slice(0, 120);
    digestLines.push(`- **${r.label}** (` + r.slug + `): ${statusStr}`);
    digestLines.push(`  - ${preview}${preview.length >= 200 ? "…" : ""}`);
    digestLines.push("");
  }
  digestLines.push("## Output patterns (research notes)");
  digestLines.push("");
  digestLines.push(
    "- General (01): Expect conversational reply, no code blocks or coder handoff."
  );
  digestLines.push(
    "- Coding intent (02–04): May trigger coder/model routing; check for file paths and concrete edits."
  );
  digestLines.push(
    "- Override (05): Check response obeys terse/technical and references gptService refactor."
  );
  digestLines.push(
    "- Vision (06): No image sent; response may state that or ask for image; should not switch to coder."
  );
  digestLines.push(
    "- Fallback (07): Response should name fallback provider/model when coder unavailable."
  );
  digestLines.push("");

  await fs.writeFile(
    path.join(OUT_DIR, "DIGEST.md"),
    digestLines.join("\n"),
    "utf8"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
