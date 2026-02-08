import express from "express";
import { buildRuntimeAwareness, getTimeContext } from "../services/awarenessService.js";

const router = express.Router();

router.get("/awareness", async (req, res) => {
  try {
    const runtime = typeof req.query.runtime === "string" ? req.query.runtime : "zen";
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

// Time context endpoint for Lin and GPTs
router.get("/time", async (req, res) => {
  try {
    const timeContext = getTimeContext({ req });
    res.json(timeContext);
  } catch (error) {
    console.error("Time context error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to get time context",
    });
  }
});

export default router;
