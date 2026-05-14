import express from "express";
import fetch from "node-fetch";
import { LIN_MODEL_DEFAULTS } from "../lib/linModelDefaults.js";

const router = express.Router();

function stripOllamaPrefix(model) {
  return String(model || '').replace(/^ollama:/, '');
}

// Lazy-load ensureOllama to avoid circular dependencies
let ensureOllama = null;

async function getEnsureOllama() {
  if (!ensureOllama) {
    try {
      // Simple implementation of ensureOllama for server-side Ollama auto-start
      const http = require('http');
      const { spawn } = require('child_process');
      
      ensureOllama = async (opts) => {
        const portsToTry = [
          opts.preferredPort,
          11434, // Ollama default
        ];

        const host = opts.host.replace(/\/$/, '');

        async function ping(port, path = '/api/tags') {
          return new Promise((resolve) => {
            const req = http.get(`${host}:${port}${path}`, (res) => {
              resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(3000, () => {
              req.destroy();
              resolve(false);
            });
          });
        }

        // 1) See if an instance is already running on any tried port
        for (const p of portsToTry) {
          if (await ping(p)) {
            if (!opts.silent) console.log(`✓ Found existing Ollama at ${host}:${p}`);
            return { child: null, port: p };
          }
        }

        // 2) Spawn our own on preferredPort
        const port = opts.preferredPort;
        if (!opts.silent) console.log(`Starting Ollama on port ${port}…`);

        let child = null;
        try {
          child = spawn('ollama', ['serve', '--port', String(port)], {
            env: { ...process.env },
            stdio: 'ignore',
          });
        } catch (err) {
          throw new Error(`Failed to spawn ollama: ${err.message}`);
        }

        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          if (await ping(port, '/api/generate')) {
            if (!opts.silent) console.log('Ollama ready.');
            return { child, port };
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (child) child.kill();
        throw new Error('Failed to start Ollama within 30s.');
      };
    } catch (error) {
      console.warn('Could not initialize ensureOllama, proceeding without auto-start:', error);
      // Fallback: just return the default port
      ensureOllama = async () => ({ child: null, port: 11434 });
    }
  }
  return ensureOllama;
}

/**
 * POST /api/preview/run
 * Body: { prompt: string, model?: string, timeoutMs?: number }
 *
 * Runs a single Ollama generation server-side to keep previews out of the browser.
 * Automatically starts Ollama if it's not running.
 */
router.post("/run", async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "request body must be an object" });
    }
    const allowedKeys = new Set(["prompt", "model", "timeoutMs"]);
    const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length) return res.status(400).json({ error: "unknown request field" });
    const { prompt, model, timeoutMs } = body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }

    // Auto-start Ollama if needed (server-side only)
    const targetHost = "http://127.0.0.1";
    let targetPort = 11434;
    
    try {
      const ensureOllamaFn = await getEnsureOllama();
      const { port: actualPort } = await ensureOllamaFn({
        preferredPort: targetPort,
        host: targetHost,
        silent: true
      });
      targetPort = actualPort;
    } catch (error) {
      // If auto-start fails, continue with default port (might already be running)
      console.warn('Ollama auto-start failed, using default port:', error?.message || error);
    }

    if (model != null && typeof model !== "string") return res.status(400).json({ error: "model must be a string" });
    if (timeoutMs != null && (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)) return res.status(400).json({ error: "timeoutMs is invalid" });
    const targetModel = model || process.env.OLLAMA_MODEL || stripOllamaPrefix(LIN_MODEL_DEFAULTS.smalltalk);
    const timeout = timeoutMs || 90000; // 90 seconds for preview

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(`${targetHost}:${targetPort}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2000
        }
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text();
      let errorMessage = `Ollama error ${resp.status}: ${text}`;
      try {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // Use text as-is
      }
      return res.status(resp.status).json({ error: errorMessage });
    }

    const data = await resp.json();
    if (!data.response) {
      return res.status(500).json({ error: "Empty response from Ollama. The model may not be responding correctly." });
    }
    return res.json({ response: data.response });
  } catch (err) {
    const message = err?.message || "Unknown error";
    // Provide helpful error messages
    if (message.includes('aborted') || message.includes('timeout')) {
      return res.status(504).json({ error: `Request timeout. The model may be taking too long to respond. ${message}` });
    }
    if (message.includes('ECONNREFUSED') || message.includes('Failed to fetch')) {
      return res.status(503).json({ error: `Cannot connect to Ollama service. Ollama may not be running or accessible. ${message}` });
    }
    return res.status(500).json({ error: message });
  }
});

export default router;
