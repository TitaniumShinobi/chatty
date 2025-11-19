import express from "express";
import { buildRuntimeAwareness } from "../services/awarenessService.js";

const router = express.Router();

router.get("/awareness", async (req, res) => {
  try {
    const runtime = typeof req.query.runtime === "string" ? req.query.runtime : "synth";
    const context = await buildRuntimeAwareness(req, runtime);
    res.json({ ok: true, ...context });
  } catch (error) {
    console.error("Runtime awareness error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to construct runtime awareness snapshot",
    });
  }
});

export default router;
