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
      broker_configured: false,
      active_broker_id: null,
      active_broker_name: null,
      account_type: 'unknown',
      message: 'FXShinobi API not configured. Set FXSHINOBI_API_BASE_URL environment variable.',
    });
  }

  try {
    const response = await fetchWithTimeout(`${FXSHINOBI_API_BASE}/api/status`, { method: 'GET' }, 5000);
    
    if (response.ok) {
      const data = await response.json();
      
      const oandaConfigured = data.oanda_configured ?? false;
      const activeBrokerId = data.active_broker_id || (oandaConfigured ? 'oanda' : null);
      const isOandaActive = activeBrokerId === 'oanda' && oandaConfigured;
      
      return res.json({
        status: data.status || 'online',
        live_mode: data.live_mode ?? false,
        oanda_configured: oandaConfigured,
        broker_configured: data.broker_configured ?? isOandaActive,
        active_broker_id: activeBrokerId,
        active_broker_name: data.active_broker_name || (isOandaActive ? 'OANDA' : null),
        account_type: data.account_type || (data.live_mode ? 'live' : 'demo'),
        environment: data.environment || (data.live_mode ? 'live' : 'demo'),
        account_balance: data.account?.balance ?? data.account_balance ?? null,
        equity: data.account?.equity ?? data.equity ?? null,
        pnl_today: data.account?.pnl_today ?? data.pnl_today ?? null,
        open_pnl: data.account?.open_pnl ?? data.open_pnl ?? null,
        account: data.account || null,
        brokers: data.brokers || null,
        vvault_status: data.vvault_status || 'unknown',
        supabase_status: data.supabase_status || 'unknown',
        version: data.version || '1.0.0',
        uptime: data.uptime,
        active_strategies: data.active_strategies || 0,
        open_positions: data.open_positions || data.account?.open_positions || 0,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(response.status).json({
        status: 'error',
        live_mode: false,
        broker_configured: false,
        active_broker_id: null,
        active_broker_name: null,
        account_type: 'unknown',
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
      broker_configured: false,
      active_broker_id: null,
      active_broker_name: null,
      account_type: 'unknown',
      message: 'FXShinobi engine is not reachable',
    });
  }
});

router.get('/snapshot', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      fallback: true,
      live_mode: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/snapshot`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        ...data,
        live_mode: data.live_mode ?? false,
        current_symbol: data.current_symbol || data.symbol || 'EURUSD',
        current_timeframe: data.current_timeframe || data.timeframe || '15m',
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

router.get('/logs/recent', async (req, res) => {
  const { limit = 20 } = req.query;
  
  if (!isConfigured()) {
    return res.json({
      logs: [],
      fallback: true,
      message: 'FXShinobi not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/logs/recent?limit=${limit}`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        logs: data.logs || [],
        fallback: false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Logs fetch failed:', err.message);
    return res.json({
      logs: [],
      fallback: true,
      message: 'Failed to fetch logs from FXShinobi',
    });
  }
});

router.get('/brokers', async (req, res) => {
  if (!isConfigured()) {
    return res.json({
      brokers: [
        { id: 'oanda', name: 'OANDA', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id', 'environment'] },
        { id: 'tastyfx', name: 'TastyFX', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'ig', name: 'IG', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id', 'environment'] },
        { id: 'pepperstone', name: 'Pepperstone', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'forex_com', name: 'Forex.com', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'ic_markets', name: 'IC Markets', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
      ],
      active_broker_id: null,
      fallback: true,
      message: 'FXShinobi not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/brokers`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        brokers: data.brokers || [],
        active_broker_id: data.active_broker_id || null,
        fallback: false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Brokers fetch failed:', err.message);
    return res.json({
      brokers: [
        { id: 'oanda', name: 'OANDA', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id', 'environment'] },
        { id: 'tastyfx', name: 'TastyFX', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'ig', name: 'IG', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id', 'environment'] },
        { id: 'pepperstone', name: 'Pepperstone', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'forex_com', name: 'Forex.com', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
        { id: 'ic_markets', name: 'IC Markets', status: 'not_configured', auth_type: 'api_key', fields: ['api_key', 'account_id'] },
      ],
      active_broker_id: null,
      fallback: true,
      message: 'Failed to fetch brokers from FXShinobi',
    });
  }
});

router.post('/set-active-broker', async (req, res) => {
  const { broker_id } = req.body;
  
  if (!broker_id) {
    return res.status(400).json({ error: 'broker_id is required' });
  }
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'FXShinobi not configured',
      success: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/set-active-broker`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker_id }),
      },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        success: true,
        active_broker_id: data.active_broker_id || broker_id,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Set active broker failed:', err.message);
    return res.status(503).json({
      error: 'Failed to set active broker',
      success: false,
    });
  }
});

router.get('/account', async (req, res) => {
  if (!isConfigured()) {
    return res.json({
      account_balance: null,
      open_pnl: null,
      pnl_today: null,
      fallback: true,
      message: 'FXShinobi not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${FXSHINOBI_API_BASE}/api/account`,
      { method: 'GET' },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        account_balance: data.account_balance ?? null,
        open_pnl: data.open_pnl ?? null,
        pnl_today: data.pnl_today ?? null,
        currency: data.currency || 'USD',
        margin_used: data.margin_used ?? null,
        margin_available: data.margin_available ?? null,
        fallback: false,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.log('[FXShinobi] Account fetch failed:', err.message);
    return res.json({
      account_balance: null,
      open_pnl: null,
      pnl_today: null,
      fallback: true,
      message: 'Failed to fetch account data',
    });
  }
});

export default router;
