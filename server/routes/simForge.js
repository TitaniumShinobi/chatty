/**
 * simForge API Routes
 * 
 * Endpoints for personality extraction and identity forging
 */

import { Router } from 'express';
import { simForge } from '../lib/simForge.js';

const router = Router();

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
      forgeResult.identityFiles
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
