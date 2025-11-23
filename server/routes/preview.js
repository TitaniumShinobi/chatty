import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/**
 * POST /api/preview/run
 * Body: { prompt: string, model?: string, host?: string, port?: number, timeoutMs?: number }
 *
 * Runs a single Ollama generation server-side to keep previews out of the browser.
 */
router.post("/run", async (req, res) => {
  try {
    const { prompt, model, host, port, timeoutMs } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }

    const targetHost = (host || process.env.OLLAMA_HOST || "http://localhost").replace(/\/$/, "");
    const targetPort = port || Number(process.env.OLLAMA_PORT) || 11434;
    const targetModel = model || process.env.OLLAMA_MODEL || "phi3:latest";
    const timeout = timeoutMs || 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(`${targetHost}:${targetPort}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Ollama error ${resp.status}: ${text}` });
    }

    const data = await resp.json();
    return res.json({ response: data.response ?? "" });
  } catch (err) {
    const message = err?.message || "Unknown error";
    return res.status(500).json({ error: message });
  }
});

export default router;
