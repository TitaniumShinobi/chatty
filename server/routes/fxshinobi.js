import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const FXSHINOBI_API_BASE = process.env.FXSHINOBI_API_BASE_URL || 'http://localhost:8080';

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

router.get('/status', async (req, res) => {
  try {
    const response = await fetchWithTimeout(`${FXSHINOBI_API_BASE}/api/status`, { method: 'GET' }, 5000);
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        status: 'online',
        version: data.version || '1.0.0',
        uptime: data.uptime,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(response.status).json({
        status: 'error',
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
      message: 'FXShinobi engine is not reachable',
    });
  }
});

router.get('/snapshot', async (req, res) => {
  const { symbol = 'EURUSD' } = req.query;
  
  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/snapshot?symbol=${symbol}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Snapshot fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch market snapshot',
      fallback: true,
    });
  }
});

router.get('/trades/history', async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/trades/history?limit=${limit}&offset=${offset}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Trade history fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch trade history',
      trades: [],
      fallback: true,
    });
  }
});

router.get('/performance', async (req, res) => {
  const { period = '30d' } = req.query;
  
  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/performance?period=${period}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Performance fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch performance metrics',
      fallback: true,
    });
  }
});

router.get('/markets', async (req, res) => {
  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/markets`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Markets fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch markets',
      markets: [],
      fallback: true,
    });
  }
});

router.get('/insights', async (req, res) => {
  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/insights`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Insights fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch insights',
      insights: [],
      fallback: true,
    });
  }
});

export default router;
