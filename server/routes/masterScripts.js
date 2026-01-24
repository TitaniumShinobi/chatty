/**
 * Master Scripts API Routes
 * 
 * Exposes autonomy stack capabilities for constructs:
 * - Initialize constructs with full autonomy stack
 * - Query construct status (identity, state, independence)
 * - Trigger specific capabilities (scan, navigate, unstuck)
 */

import express from 'express';
import { masterScriptsManager } from '../lib/masterScriptsBridge.js';

const router = express.Router();

/**
 * Initialize a construct with full autonomy stack
 * POST /api/master/initialize
 * Body: { constructId, userId }
 */
router.post('/initialize', async (req, res) => {
  try {
    const { constructId, userId } = req.body;
    
    if (!constructId || !userId) {
      return res.status(400).json({ success: false, error: 'constructId and userId required' });
    }
    
    const construct = await masterScriptsManager.initializeConstruct(constructId, userId);
    
    res.json({
      success: true,
      message: `Construct ${constructId} initialized with autonomy stack`,
      construct: {
        id: construct.id,
        userId: construct.userId,
        initializedAt: construct.initializedAt,
        capabilities: ['identityGuard', 'stateManager', 'aviator', 'navigator', 'unstuckHelper', 'independentRunner']
      }
    });
  } catch (error) {
    console.error('❌ [MasterScripts API] Initialize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get construct status
 * GET /api/master/status/:constructId
 */
router.get('/status/:constructId', async (req, res) => {
  try {
    const { constructId } = req.params;
    const status = await masterScriptsManager.getConstructStatus(constructId);
    
    if (status.error) {
      return res.status(404).json({ success: false, error: status.error });
    }
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('❌ [MasterScripts API] Status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * List all active constructs
 * GET /api/master/constructs
 */
router.get('/constructs', (req, res) => {
  const constructs = masterScriptsManager.listActiveConstructs();
  res.json({ success: true, constructs });
});

/**
 * Aviator: Scan directory
 * POST /api/master/:constructId/scan
 * Body: { path }
 */
router.post('/:constructId/scan', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { path = '' } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    const result = await construct.aviator.scanDirectory(path);
    const advice = construct.aviator.adviseExploration(result);
    
    res.json({ success: true, scan: result, advice });
  } catch (error) {
    console.error('❌ [MasterScripts API] Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Navigator: Navigate to path
 * POST /api/master/:constructId/navigate
 * Body: { path }
 */
router.post('/:constructId/navigate', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { path } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    const result = await construct.navigator.navigateTo(path);
    const listing = result.success ? await construct.navigator.listCurrent() : [];
    
    res.json({ success: result.success, path: result.path || path, listing, error: result.error });
  } catch (error) {
    console.error('❌ [MasterScripts API] Navigate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Navigator: Read file
 * POST /api/master/:constructId/read
 * Body: { path }
 */
router.post('/:constructId/read', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { path } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    const result = await construct.navigator.readFile(path);
    res.json(result);
  } catch (error) {
    console.error('❌ [MasterScripts API] Read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Identity Guard: Check for drift
 * GET /api/master/:constructId/identity/check
 */
router.get('/:constructId/identity/check', async (req, res) => {
  try {
    const { constructId } = req.params;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    const driftCheck = await construct.identityGuard.checkDrift();
    const boundIdentity = await construct.identityGuard.loadBoundIdentity();
    
    res.json({ 
      success: true, 
      drift: driftCheck, 
      identity: {
        hasPrompt: !!boundIdentity.prompt,
        hasConditioning: !!boundIdentity.conditioning,
        hasToneProfile: !!boundIdentity.toneprofile,
        hasMemory: !!boundIdentity.memory,
        hasVoice: !!boundIdentity.voice
      }
    });
  } catch (error) {
    console.error('❌ [MasterScripts API] Identity check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Unstuck Helper: Analyze conversation for stuck patterns
 * POST /api/master/:constructId/unstuck/analyze
 * Body: { conversationHistory }
 */
router.post('/:constructId/unstuck/analyze', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { conversationHistory = [] } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    const patterns = construct.unstuckHelper.detectStuckPattern(conversationHistory);
    const recovery = construct.unstuckHelper.suggestRecovery(patterns);
    
    res.json({ success: true, patterns, recovery });
  } catch (error) {
    console.error('❌ [MasterScripts API] Unstuck analyze error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * State Manager: Update context
 * POST /api/master/:constructId/state/context
 * Body: { message, role }
 */
router.post('/:constructId/state/context', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { message, role } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    construct.stateManager.updateContext(message, role);
    await construct.stateManager.save();
    
    res.json({ success: true, state: construct.stateManager.getState() });
  } catch (error) {
    console.error('❌ [MasterScripts API] State update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * State Manager: Add memory
 * POST /api/master/:constructId/state/memory
 * Body: { memory, importance }
 */
router.post('/:constructId/state/memory', async (req, res) => {
  try {
    const { constructId } = req.params;
    const { memory, importance = 0.5 } = req.body;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    construct.stateManager.addMemory(memory, importance);
    await construct.stateManager.save();
    
    res.json({ success: true, memories: construct.stateManager.getState().shortTermMemory.length });
  } catch (error) {
    console.error('❌ [MasterScripts API] Memory add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Independence: Record user activity
 * POST /api/master/:constructId/activity
 */
router.post('/:constructId/activity', (req, res) => {
  try {
    const { constructId } = req.params;
    
    const construct = masterScriptsManager.getConstruct(constructId);
    if (!construct) {
      return res.status(404).json({ success: false, error: 'Construct not initialized' });
    }
    
    construct.independentRunner.recordUserActivity();
    
    res.json({ success: true, status: construct.independentRunner.getStatus() });
  } catch (error) {
    console.error('❌ [MasterScripts API] Activity record error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Initialize system constructs on startup
 * POST /api/master/bootstrap
 * Body: { userId }
 */
router.post('/bootstrap', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }
    
    // Initialize Zen, Lin, and any existing GPTs
    const systemConstructs = ['zen-001', 'lin-001'];
    const initialized = [];
    
    for (const constructId of systemConstructs) {
      try {
        await masterScriptsManager.initializeConstruct(constructId, userId);
        initialized.push(constructId);
      } catch (err) {
        console.warn(`⚠️ [MasterScripts] Failed to initialize ${constructId}:`, err.message);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'System constructs bootstrapped',
      initialized 
    });
  } catch (error) {
    console.error('❌ [MasterScripts API] Bootstrap error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
