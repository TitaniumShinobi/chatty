/**
 * simForge API Routes
 *
 * Endpoints for personality extraction and identity forging
 */

import { Router } from 'express';
import { simForge } from '../lib/simForge.js';
import { normalizeZenCallsign } from '../lib/zenIdentity.js';
import { startJob, getJob } from '../lib/zenSimBuildService.js';
import {
  startJob as startConstructBuildJob,
  getJob as getConstructBuildJob,
  isPlatformConstruct,
} from '../lib/constructSimBuildService.js';
import { evaluateConstructSovereignty, isCanonicalOwner } from '../lib/constructSovereigntyPolicy.js';

const router = Router();

function buildSovereigntyActor(req) {
  return {
    id: req.user?.id,
    uid: req.user?.uid,
    sub: req.user?.sub,
    email: req.user?.email,
    userId: req.user?.id || req.user?.sub || req.user?.email,
  };
}

function sendSovereigntyPolicyFailure(res, result, okKey = 'ok') {
  const body = {
    [okKey]: false,
    error: result.reason,
    message: result.message,
    constructSovereignty: result.receipt,
  };
  return res.status(result.statusCode || 403).json(body);
}

router.post('/build/sim', async (req, res) => {
  try {
    const {
      callsign,
      dryRun = true,
      watch = false,
      includeCapsuleSummary = true,
      requestId,
    } = req.body || {};

    const normalizedCallsign = String(callsign || '').trim().toLowerCase();

    if (!normalizedCallsign) {
      return res.status(400).json({ ok: false, error: 'invalid_callsign' });
    }

    if (watch) {
      return res.status(400).json({ ok: false, error: 'watch_not_supported' });
    }

    const actor = buildSovereigntyActor(req);

    if (isPlatformConstruct(normalizedCallsign) && !isCanonicalOwner(actor)) {
      return res.status(403).json({
        ok: false,
        error: 'platform_construct_managed',
      });
    }

    const sovereignty = evaluateConstructSovereignty({
      constructCallsign: normalizedCallsign,
      actor,
      operation: 'simforge_build',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty);

    let started;
    try {
      started = startConstructBuildJob(normalizedCallsign, {
        dryRun,
        includeCapsuleSummary,
        requestId,
        actor,
      });
    } catch (jobErr) {
      if (jobErr.statusCode === 400) {
        return res.status(400).json({ ok: false, error: 'invalid_callsign' });
      }

      if (jobErr.statusCode === 403) {
        return res.status(403).json({ ok: false, error: jobErr.code || jobErr.message || 'platform_construct_managed' });
      }

      if (jobErr.statusCode === 409) {
        return res.status(409).json({
          ok: false,
          error: 'build_already_running_for_construct',
          activeJobId: jobErr.activeJobId,
        });
      }

      throw jobErr;
    }

    return res.status(202).json({
      ok: true,
      jobId: started.jobId,
      normalizedCallsign: started.normalizedCallsign,
      status: started.status,
      acceptedAt: started.acceptedAt,
      mode: started.mode,
    });
  } catch (error) {
    console.error('❌ [SimForge API] Construct sim build trigger error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'internal_error',
    });
  }
});

router.get('/build/sim/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getConstructBuildJob(jobId);

    if (!job) {
      return res.status(404).json({ ok: false, error: 'job_not_found' });
    }

    return res.status(200).json({
      ok: true,
      jobId: job.jobId,
      normalizedCallsign: job.normalizedCallsign,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      summary: job.summary,
      logsTail: job.logsTail,
    });
  } catch (error) {
    console.error('❌ [SimForge API] Construct sim build status error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'internal_error',
    });
  }
});

router.post('/build/zen', async (req, res) => {
  try {
    const {
      callsign = 'zen-001',
      dryRun = true,
      watch = false,
      includeCapsuleSummary = true,
      requestId,
    } = req.body || {};

    const requested = String(callsign || '').trim().toLowerCase();
    const actor = buildSovereigntyActor(req);
    if ((requested === 'zen' || requested === 'zen-001' || requested === 'lin' || requested === 'lin-001') && !isCanonicalOwner(actor)) {
      return res.status(403).json({
        ok: false,
        error: 'platform_construct_managed',
      });
    }

    const normalized = normalizeZenCallsign(callsign);
    if (!normalized.ok) {
      return res.status(400).json({ ok: false, error: normalized.error });
    }

    let started;
    try {
      started = startJob(normalized.normalizedCallsign, {
        dryRun,
        watch,
        includeCapsuleSummary,
        requestId,
        actor,
      });
    } catch (jobErr) {
      if (jobErr.statusCode === 409) {
        return res.status(409).json({
          ok: false,
          error: 'build_already_running_for_zen',
          activeJobId: jobErr.activeJobId,
        });
      }
      throw jobErr;
    }

    return res.status(202).json({
      ok: true,
      jobId: started.jobId,
      normalizedCallsign: started.normalizedCallsign,
      status: started.status,
      acceptedAt: started.acceptedAt,
      mode: started.mode,
    });
  } catch (error) {
    console.error('❌ [SimForge API] Zen build trigger error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'internal_error',
    });
  }
});

router.get('/build/zen/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      return res.status(404).json({ ok: false, error: 'job_not_found' });
    }

    return res.status(200).json({
      ok: true,
      jobId: job.jobId,
      normalizedCallsign: job.normalizedCallsign,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      summary: job.summary,
      logsTail: job.logsTail,
    });
  } catch (error) {
    console.error('❌ [SimForge API] Zen build status error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'internal_error',
    });
  }
});

router.post('/forge', async (req, res) => {
  try {
    const userId = req.user?.email || req.user?.id;
    const { constructCallsign, constructName } = req.body;

    if (!constructCallsign) {
      return res.status(400).json({
        success: false,
        error: 'constructCallsign is required'
      });
    }

    const sovereignty = evaluateConstructSovereignty({
      name: constructName,
      constructCallsign,
      actor: buildSovereigntyActor(req),
      operation: 'simforge_forge',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty, 'success');

    console.log(`🔥 [SimForge API] Forge request for ${constructCallsign} from user ${userId}`);

    const result = await simForge.forge(
      userId,
      constructCallsign,
      constructName || constructCallsign
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ [SimForge API] Forge error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/forge-and-save', async (req, res) => {
  try {
    const userId = req.user?.email || req.user?.id;
    const { constructCallsign, constructName } = req.body;

    if (!constructCallsign) {
      return res.status(400).json({
        success: false,
        error: 'constructCallsign is required'
      });
    }

    const sovereignty = evaluateConstructSovereignty({
      name: constructName,
      constructCallsign,
      actor: buildSovereigntyActor(req),
      operation: 'simforge_forge_and_save',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty, 'success');

    console.log(`🔥 [SimForge API] Forge and save request for ${constructCallsign}`);

    const forgeResult = await simForge.forge(
      userId,
      constructCallsign,
      constructName || constructCallsign
    );

    if (!forgeResult.success) {
      return res.status(400).json(forgeResult);
    }

    const saveResult = await simForge.saveToVVAULT(
      userId,
      constructCallsign,
      forgeResult.identityFiles,
      forgeResult.capsule  // Pass capsule to save with CapsuleIntegration
    );

    res.json({
      ...forgeResult,
      saved: saveResult
    });
  } catch (error) {
    console.error('❌ [SimForge API] Forge and save error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/preview/:constructCallsign', async (req, res) => {
  try {
    const userId = req.user?.email || req.user?.id;
    const { constructCallsign } = req.params;

    const sovereignty = evaluateConstructSovereignty({
      constructCallsign,
      actor: buildSovereigntyActor(req),
      operation: 'simforge_preview',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty, 'success');

    console.log(`👁️ [SimForge API] Preview request for ${constructCallsign}`);

    const transcripts = await simForge.loadTranscriptsForConstruct(userId, constructCallsign);
    const messages = simForge.extractMessagesFromTranscripts(transcripts);

    res.json({
      constructCallsign,
      transcriptCount: transcripts.length,
      messageCount: messages.length,
      sampleMessages: messages.slice(0, 10).map(m => ({
        role: m.role,
        preview: m.content?.substring(0, 100) + (m.content?.length > 100 ? '...' : '')
      })),
      readyToForge: messages.length >= 10
    });
  } catch (error) {
    console.error('❌ [SimForge API] Preview error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/analyze-text', async (req, res) => {
  try {
    const { text, constructName } = req.body;

    if (!text || text.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 100 characters of text to analyze'
      });
    }

    const sovereignty = evaluateConstructSovereignty({
      name: constructName,
      actor: buildSovereigntyActor(req),
      operation: 'simforge_analyze_text',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty, 'success');

    console.log(`🧠 [SimForge API] Direct text analysis for ${constructName || 'unknown'}`);

    const messages = [{ role: 'assistant', content: text }];
    const analysis = await simForge.analyzePersonality(messages, constructName || 'Construct');

    if (!analysis) {
      return res.status(400).json({
        success: false,
        error: 'Analysis failed'
      });
    }

    res.json({
      success: true,
      analysis,
      identityFiles: {
        'prompt.json': simForge.generatePromptJson(analysis),
        'prompt.txt': simForge.generatePromptTxt(analysis),
        'conditioning.txt': simForge.generateConditioningTxt(analysis),
        'tone_profile.json': JSON.stringify(simForge.generateToneProfile(analysis), null, 2)
      }
    });
  } catch (error) {
    console.error('❌ [SimForge API] Analyze text error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
