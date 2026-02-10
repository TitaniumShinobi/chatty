import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const VVAULT_URL = process.env.VVAULT_URL || '';
const VVAULT_SERVICE_TOKEN = process.env.VVAULT_SERVICE_TOKEN || '';

function isConfigured() {
  return Boolean(VVAULT_URL && VVAULT_SERVICE_TOKEN);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
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

function getVaultHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${VVAULT_SERVICE_TOKEN}`,
  };
}

router.get('/health', async (req, res) => {
  if (!isConfigured()) {
    return res.json({
      status: 'not_configured',
      message: 'VVAULT not configured. Set VVAULT_URL and VVAULT_SERVICE_TOKEN.',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/health`,
      { method: 'GET', headers: getVaultHeaders() },
      5000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({
        status: 'healthy',
        version: data.version,
        services: data.services,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(response.status).json({
        status: 'error',
        message: `VVAULT returned ${response.status}`,
      });
    }
  } catch (err) {
    console.log('[VVAULT] Health check failed:', err.message);
    return res.status(503).json({
      status: 'offline',
      message: 'VVAULT is not reachable',
    });
  }
});

router.get('/configs/:service', async (req, res) => {
  const { service } = req.params;
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'VVAULT not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/configs/${service}`,
      { method: 'GET', headers: getVaultHeaders() },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else if (response.status === 404) {
      return res.status(404).json({ error: 'Config not found' });
    } else {
      throw new Error(`VVAULT returned ${response.status}`);
    }
  } catch (err) {
    console.log('[VVAULT] Config fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch config from VVAULT',
    });
  }
});

router.post('/credentials', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'VVAULT not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/credentials`,
      {
        method: 'POST',
        headers: getVaultHeaders(),
        body: JSON.stringify(req.body),
      },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, ...data });
    } else {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      return res.status(response.status).json({
        success: false,
        error: error.message || `VVAULT returned ${response.status}`,
      });
    }
  } catch (err) {
    console.log('[VVAULT] Credential store failed:', err.message);
    return res.status(503).json({
      success: false,
      error: 'Failed to store credentials in VVAULT',
    });
  }
});

router.get('/credentials/:key', async (req, res) => {
  const { key } = req.params;
  
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'VVAULT not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/credentials/${key}`,
      { method: 'GET', headers: getVaultHeaders() },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else if (response.status === 404) {
      return res.status(404).json({ error: 'Credential not found' });
    } else {
      throw new Error(`VVAULT returned ${response.status}`);
    }
  } catch (err) {
    console.log('[VVAULT] Credential fetch failed:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch credential from VVAULT',
    });
  }
});

router.delete('/credentials/:key', async (req, res) => {
  const { key } = req.params;
  
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'VVAULT not configured',
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/credentials/${key}`,
      { method: 'DELETE', headers: getVaultHeaders() },
      10000
    );
    
    if (response.ok) {
      return res.json({ success: true });
    } else if (response.status === 404) {
      return res.status(404).json({ success: false, error: 'Credential not found' });
    } else {
      throw new Error(`VVAULT returned ${response.status}`);
    }
  } catch (err) {
    console.log('[VVAULT] Credential delete failed:', err.message);
    return res.status(503).json({
      success: false,
      error: 'Failed to delete credential from VVAULT',
    });
  }
});

router.get('/connections', async (req, res) => {
  if (!isConfigured()) {
    return res.json({ connections: [] });
  }

  try {
    const response = await fetchWithTimeout(
      `${VVAULT_URL}/api/vault/credentials`,
      { method: 'GET', headers: getVaultHeaders() },
      10000
    );
    
    if (response.ok) {
      const data = await response.json();
      const connections = (data.credentials || []).map((cred) => ({
        id: cred.key,
        serviceId: cred.service_id || cred.key.split('_')[0],
        serviceName: cred.service_name || cred.key,
        status: 'active',
        connectedAt: cred.created_at,
        lastUsed: cred.last_used,
      }));
      return res.json({ connections });
    } else {
      return res.json({ connections: [] });
    }
  } catch (err) {
    console.log('[VVAULT] Connections list failed:', err.message);
    return res.json({ connections: [] });
  }
});

export default router;
