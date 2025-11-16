/**
 * Developer Note:
 * The chat identity pipeline validates every inbound message before it reaches
 * downstream orchestration. Always short-circuit on failures to prevent
 * impersonation or construct conflation.
 */

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  enforcementService,
  attributionService,
  driftDetectorInstance,
} from "../services/identity/index.js";

const router = express.Router();
router.use(requireAuth);

export async function handleChatRequest(req, res) {
  const { message, constructId = "synth", fingerprint, metadata = {}, actingConstructId } =
    req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Missing message content" });
  }

  const validation = enforcementService.validateIncomingMessage({
    constructId,
    fingerprint,
    content: message,
  });

  if (!validation.valid) {
    console.warn("[Identity] Validation failed", validation.reason);
    return res.status(403).json({ ok: false, error: validation.reason });
  }

  if (actingConstructId) {
    const shellCheck = enforcementService.enforceShellProtection(actingConstructId, constructId);
    if (!shellCheck.valid) {
      console.warn("[Identity] Shell impersonation attempt", shellCheck.reason);
      return res.status(403).json({ ok: false, error: shellCheck.reason });
    }
  }

  const driftStatus = enforcementService.recordDrift(validation.construct, message);
  if (!driftStatus && driftDetectorInstance?.resetHistory) {
    // ensure drift state exists for construct even without detector result
    driftDetectorInstance.recordMessage(validation.construct, message);
  }
  const attribution = attributionService.attachMetadata({
    constructId,
    content: message,
    metadata: {
      userId: req.user?.sub,
      direction: "inbound",
      driftScore: driftStatus?.driftScore ?? 0,
      ...metadata,
    },
  });

  console.log("[Identity] Message accepted", {
    constructId: validation.construct.id,
    userId: req.user?.sub,
    driftScore: driftStatus?.driftScore ?? 0,
  });

  return res.json({
    ok: true,
    construct: {
      id: validation.construct.id,
      name: validation.construct.name,
      isSystemShell: validation.construct.isSystemShell,
    },
    attribution,
    drift: driftStatus,
  });
}

router.post("/", handleChatRequest);

export const __identityTestUtils = {
  driftDetectorInstance,
};

export default router;
