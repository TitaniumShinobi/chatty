import express from "express";

const router = express.Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const REQUIRED_MODELS = ["deepseek-coder", "mistral", "phi3"];

router.get("/ollama-status", async (_req, res) => {
  const timeoutMs = 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const payload = await response.json();
    const allModels = Array.isArray(payload.models) ? payload.models.map((model) => model.name).filter(Boolean) : [];

    const modelStatuses = REQUIRED_MODELS.map((model) => {
      const baseModel = model.split(":")[0];
      const matches = allModels.filter((name) => name.startsWith(baseModel));
      return {
        model,
        available: matches.length > 0,
        matches,
      };
    });

    res.json({
      ok: true,
      baseUrl: OLLAMA_BASE_URL,
      checkedAt: new Date().toISOString(),
      models: modelStatuses,
      detectedModels: allModels.length,
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error?.message || "Unknown error";
    console.error("❌ [Diagnostics] Ollama status check failed:", message);
    res.status(502).json({
      ok: false,
      error: `Failed to reach Ollama tags endpoint: ${message}`,
      baseUrl: OLLAMA_BASE_URL,
    });
  }
});

export default router;
