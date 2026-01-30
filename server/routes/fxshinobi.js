import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const FXSHINOBI_API_BASE = process.env.FXSHINOBI_API_BASE_URL || '';
const VVAULT_URL = process.env.VVAULT_URL || '';
const VVAULT_SERVICE_TOKEN = process.env.VVAULT_SERVICE_TOKEN || '';

function isConfigured() {
  return Boolean(FXSHINOBI_API_BASE);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

router.get('/health', async (req, res) => {
  if (!isConfigured()) {
    return res.json({
      status: 'not_configured',
      live_mode: false,
      message: 'FXShinobi API not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(`${FXSHINOBI_API_BASE}/api/health`, { method: 'GET' }, 5000);
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        status: 'healthy',
        live_mode: data.live_mode ?? false,
        vvault_status: data.vvault_status || 'unknown',
        supabase_status: data.supabase_status || 'unknown',
        version: data.version,
        uptime: data.uptime,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(response.status).json({
        status: 'error',
        live_mode: false,
        message: `FXShinobi returned ${response.status}`,
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[FXShinobi] Health check timed out');
    } else {
      console.log('[FXShinobi] Health check failed:', err.message);
    }
    return res.status(503).json({
      status: 'offline',
      live_mode: false,
      message: 'FXShinobi engine is not reachable',
    });
  }
});

router.get('/status', async (req, res) => {
  if (!isConfigured()) {
    return res.json({
      status: 'not_configured',
      live_mode: false,
      message: 'FXShinobi API not configured. Set FXSHINOBI_API_BASE_URL environment variable.',
    });
  }

  try {
    const response = await fetchWithTimeout(`${FXSHINOBI_API_BASE}/api/status`, { method: 'GET' }, 5000);
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        status: data.status || 'online',
        live_mode: data.live_mode ?? false,
        vvault_status: data.vvault_status || 'unknown',
        supabase_status: data.supabase_status || 'unknown',
        version: data.version || '1.0.0',
        uptime: data.uptime,
        active_strategies: data.active_strategies || 0,
        open_positions: data.open_positions || 0,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(response.status).json({
        status: 'error',
        live_mode: false,
        message: `FXShinobi returned ${response.status}`,
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[FXShinobi] Status check timed out');
    } else {
      console.log('[FXShinobi] Status check failed:', err.message);
    }
    return res.status(503).json({
      status: 'offline',
      live_mode: false,
      message: 'FXShinobi engine is not reachable',
    });
  }
});

router.get('/snapshot', async (req, res) => {
  const { symbol = 'EURUSD' } = req.query;
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/snapshot?symbol=${symbol}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Snapshot fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch market snapshot',
      fallback: true,
      live_mode: false,
    });
  }
});

router.get('/trades/history', async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      trades: [],
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/trades/history?limit=${limit}&offset=${offset}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Trade history fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch trade history',
      trades: [],
      fallback: true,
      live_mode: false,
    });
  }
});

router.get('/performance', async (req, res) => {
  const { period = '30d' } = req.query;
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/performance?period=${period}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Performance fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch performance metrics',
      fallback: true,
      live_mode: false,
    });
  }
});

router.get('/markets', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      markets: [],
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/markets`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Markets fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch markets',
      markets: [],
      fallback: true,
      live_mode: false,
    });
  }
});

router.get('/insights', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      insights: [],
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/insights`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Insights fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch insights',
      insights: [],
      fallback: true,
      live_mode: false,
    });
  }
});

export default router;
