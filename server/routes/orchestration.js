import express from "express";
import { routeViaOrchestration, isOrchestrationEnabled } from "../services/orchestrationBridge.js";

const router = express.Router();

/**
 * POST /api/orchestration/route
 * Route a message through the orchestration framework
 */
router.post("/route", async (req, res) => {
  try {
    const { agent_id, message, context = {} } = req.body || {};
    
    if (!agent_id || typeof agent_id !== 'string') {
      return res.status(400).json({
        ok: false,
        error: "agent_id is required and must be a string"
      });
    }
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        ok: false,
        error: "message is required and must be a string"
      });
    }
    
    // Check if orchestration is enabled
    const enabled = isOrchestrationEnabled();
    if (!enabled) {
      return res.status(503).json({
        ok: false,
        error: "Orchestration is disabled. Set ENABLE_ORCHESTRATION=true to enable.",
        status: "disabled"
      });
    }
    
    // Add user context if available
    const fullContext = {
      ...context,
      user_id: req.user?.id || req.user?.sub,
    };
    
    // Route via orchestration
    const result = await routeViaOrchestration(agent_id, message, fullContext);
    
    res.json({
      ok: true,
      ...result
    });
    
  } catch (error) {
    console.error("[Orchestration API] Error routing message:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to route message via orchestration",
      status: "error"
    });
  }
});

/**
 * GET /api/orchestration/status
 * Check orchestration status
 */
router.get("/status", async (req, res) => {
  try {
    const enabled = isOrchestrationEnabled();
    
    res.json({
      ok: true,
      enabled: enabled,
      message: enabled 
        ? "Orchestration is enabled" 
        : "Orchestration is disabled. Set ENABLE_ORCHESTRATION=true to enable."
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to check orchestration status"
    });
  }
});

/**
 * POST /api/orchestration/identity
 * Load identity files (prompt.txt, conditioning.txt) for a construct
 */
router.post("/identity", async (req, res) => {try {
    const { constructId } = req.body || {};
    const userId = req.user?.id || req.user?.sub;
    
    if (!constructId) {return res.status(400).json({
        ok: false,
        error: "constructId is required"
      });
    }
    
    if (!userId) {return res.status(401).json({
        ok: false,
        error: "User not authenticated"
      });
    }
    
    const identityLoader = await import('../lib/identityLoader.js');
    const includeUndertone = req.body?.includeUndertone === true;
    const identity = await identityLoader.loadIdentityFiles(userId, constructId, includeUndertone);res.json({
      ok: true,
      constructId,
      identity
    });
    
  } catch (error) {
    console.error("[Orchestration API] Error loading identity:", error);res.status(500).json({
      ok: false,
      error: error.message || "Failed to load identity files"
    });
  }
});

export default router;

