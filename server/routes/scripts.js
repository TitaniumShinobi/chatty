/**
 * Scripts API Routes
 *
 * GPTCreator expects these endpoints to exist:
 * - GET  /api/scripts/list?construct=...
 * - GET  /api/scripts/logs?construct=...&script=...&limit=50
 * - POST /api/scripts/start  { script, construct, userId }
 * - POST /api/scripts/stop   { script, construct }
 *
 * The underlying "autonomy stack" lives in masterScriptsManager. This router
 * exposes a lightweight compatibility layer so the GPTCreator UI doesn't 404.
 */

import express from "express";
import { masterScriptsManager } from "../lib/masterScriptsBridge.js";

const router = express.Router();

const AVAILABLE_SCRIPTS = [
  {
    key: "identity_guard",
    name: "Identity Guard",
    description: "Bind identity files and detect drift",
    canMessageUser: false,
  },
  {
    key: "state_manager",
    name: "State Manager",
    description: "Persist context and short-term state",
    canMessageUser: false,
  },
  {
    key: "aviator",
    name: "Aviator",
    description: "Scout advisor for folder structures",
    canMessageUser: false,
  },
  {
    key: "navigator",
    name: "Navigator",
    description: "Path navigation and file helper",
    canMessageUser: false,
  },
  {
    key: "unstuck_helper",
    name: "Unstuck Helper",
    description: "Detect stuck patterns and suggest recovery",
    canMessageUser: false,
  },
  {
    key: "independence",
    name: "Independent Runner",
    description: "Autonomy mode and background operation",
    canMessageUser: true,
  },
];

function mapScriptKeyToBridgeKey(scriptKey) {
  switch (scriptKey) {
    case "identity_guard":
      return "identityGuard";
    case "state_manager":
      return "stateManager";
    case "aviator":
      return "aviator";
    case "navigator":
      return "navigator";
    case "unstuck_helper":
      return "unstuckHelper";
    case "independence":
      return "independentRunner";
    default:
      return null;
  }
}

const scriptState = new Map();
const scriptLogs = new Map();

function stateKey(construct, script) {
  return `${construct}::${script}`;
}

function appendLog(construct, script, line) {
  const key = stateKey(construct, script);
  const existing = scriptLogs.get(key) || [];
  existing.push(line);
  // Keep logs bounded in memory.
  scriptLogs.set(key, existing.slice(-200));
}

function getOrInitState(construct, script) {
  const key = stateKey(construct, script);
  if (!scriptState.has(key)) {
    scriptState.set(key, {
      status: "stopped",
      enabled: true,
      lastRun: null,
      pid: null,
    });
  }
  return scriptState.get(key);
}

router.get("/list", async (req, res) => {
  const construct = String(req.query.construct || "").trim();
  if (!construct) {
    return res.status(400).json({ ok: false, error: "construct required" });
  }

  const constructInitialized = !!masterScriptsManager.getConstruct(construct);

  const scripts = AVAILABLE_SCRIPTS.map((s) => {
    const st = getOrInitState(construct, s.key);
    // If a construct is initialized, treat scripts as running unless explicitly stopped.
    const status =
      st.status === "running" || (constructInitialized && st.status !== "stopped")
        ? "running"
        : "stopped";
    return {
      key: s.key,
      name: s.name,
      description: s.description,
      status,
      enabled: !!st.enabled,
      lastRun: st.lastRun,
      canMessageUser: s.canMessageUser,
      pid: st.pid,
    };
  });

  return res.json({ ok: true, scripts });
});

router.get("/logs", async (req, res) => {
  const construct = String(req.query.construct || "").trim();
  const script = String(req.query.script || "").trim();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));

  if (!construct || !script) {
    return res.status(400).json({ ok: false, error: "construct and script required" });
  }

  const key = stateKey(construct, script);
  const logs = (scriptLogs.get(key) || []).slice(-limit);
  return res.json({ ok: true, logs });
});

router.post("/start", async (req, res) => {
  const { script, construct, userId } = req.body || {};
  const safeScript = String(script || "").trim();
  const safeConstruct = String(construct || "").trim();
  const safeUserId = String(userId || "").trim();

  if (!safeScript || !safeConstruct) {
    return res.status(400).json({ ok: false, error: "script and construct required" });
  }

  if (!safeUserId) {
    return res.status(400).json({ ok: false, error: "userId required" });
  }

  if (!masterScriptsManager.getConstruct(safeConstruct)) {
    try {
      await masterScriptsManager.initializeConstruct(safeConstruct, safeUserId);
    } catch (err) {
      console.error("❌ [Scripts API] Failed to initialize construct:", err);
      return res.status(500).json({ ok: false, error: err?.message || "init failed" });
    }
  }

  // If the script key maps to a bridge capability, ensure it's present.
  const bridgeKey = mapScriptKeyToBridgeKey(safeScript);
  const constructObj = masterScriptsManager.getConstruct(safeConstruct);
  if (bridgeKey && constructObj && !constructObj[bridgeKey]) {
    return res.status(404).json({ ok: false, error: `Unknown script: ${safeScript}` });
  }

  const st = getOrInitState(safeConstruct, safeScript);
  st.status = "running";
  st.lastRun = new Date().toISOString();
  appendLog(safeConstruct, safeScript, `[${st.lastRun}] started`);

  return res.json({ ok: true });
});

router.post("/stop", async (req, res) => {
  const { script, construct } = req.body || {};
  const safeScript = String(script || "").trim();
  const safeConstruct = String(construct || "").trim();

  if (!safeScript || !safeConstruct) {
    return res.status(400).json({ ok: false, error: "script and construct required" });
  }

  const st = getOrInitState(safeConstruct, safeScript);
  st.status = "stopped";
  st.lastRun = new Date().toISOString();
  appendLog(safeConstruct, safeScript, `[${st.lastRun}] stopped`);

  return res.json({ ok: true });
});

export default router;

