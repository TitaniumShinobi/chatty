import express from "express";
import { routeViaOrchestration, isOrchestrationEnabled } from "../services/orchestrationBridge.js";

const router = express.Router();

/**
 * POST /api/orchestration/route
 * Route a message through the orchestration framework
 */
router.post("/route", async (req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/orchestration.js:11',message:'orchestration route: entry',data:{hasBody:!!req.body,userId:req.user?.id},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'M'})}).catch(()=>{});
  // #endregion
  try {
    const { agent_id, message, context = {} } = req.body || {};
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/orchestration.js:15',message:'orchestration route: request params',data:{agent_id,messageLength:message?.length,hasContext:Object.keys(context).length>0},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'N'})}).catch(()=>{});
    // #endregion
    
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/orchestration.js:25',message:'orchestration route: enabled check',data:{enabled,agent_id},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'O'})}).catch(()=>{});
    // #endregion
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/orchestration.js:35',message:'orchestration route: calling routeViaOrchestration',data:{agent_id,contextKeys:Object.keys(fullContext)},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'P'})}).catch(()=>{});
    // #endregion
    
    // Route via orchestration
    const result = await routeViaOrchestration(agent_id, message, fullContext);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/orchestration.js:40',message:'orchestration route: result received',data:{agent_id,status:result.status,responseLength:result.response?.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'Q'})}).catch(()=>{});
    // #endregion
    
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
router.post("/identity", async (req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestration.js:107',message:'identity API entry',data:{constructId:req.body?.constructId,userId:req.user?.id||req.user?.sub},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  try {
    const { constructId } = req.body || {};
    const userId = req.user?.id || req.user?.sub;
    
    if (!constructId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestration.js:112',message:'identity API: missing constructId',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return res.status(400).json({
        ok: false,
        error: "constructId is required"
      });
    }
    
    if (!userId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestration.js:120',message:'identity API: missing userId',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return res.status(401).json({
        ok: false,
        error: "User not authenticated"
      });
    }
    
    const identityLoader = await import('../lib/identityLoader.js');
    const includeUndertone = req.body?.includeUndertone === true;
    const identity = await identityLoader.loadIdentityFiles(userId, constructId, includeUndertone);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestration.js:128',message:'identity API: loaded identity',data:{constructId,hasPrompt:!!identity.prompt,hasConditioning:!!identity.conditioning,promptLength:identity.prompt?.length||0,conditioningLength:identity.conditioning?.length||0,hasUndertone:!!identity.undertone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    res.json({
      ok: true,
      constructId,
      identity
    });
    
  } catch (error) {
    console.error("[Orchestration API] Error loading identity:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestration.js:140',message:'identity API: error',data:{errorMessage:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to load identity files"
    });
  }
});

export default router;

