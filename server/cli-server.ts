// Minimal CLI-based Express server
// Replaces complex backend with simple CLI functionality

import express from 'express';
import cors from 'cors';
import { CLIWebBridge } from './cli-web-bridge.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize CLI bridge
const cliBridge = new CLIWebBridge();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Chatty CLI Web Bridge',
    model: cliBridge.getModel(),
    timestamp: new Date().toISOString()
  });
});

// Auth endpoints (simplified for CLI mode)
app.get('/api/me', (req, res) => {
  // For CLI mode, return a mock user (no real auth needed)
  res.json({
    ok: true,
    user: {
      sub: 'cli-user',
      email: 'user@chatty.local',
      name: 'Chatty User',
      picture: null
    }
  });
});

app.get('/api/auth/google', (req, res) => {
  // Redirect to app (skip Google auth in CLI mode)
  res.redirect('/app');
});

app.post('/api/auth/login', (req, res) => {
  // Mock login for CLI mode
  res.json({
    ok: true,
    user: {
      sub: 'cli-user',
      email: req.body.email || 'user@chatty.local',
      name: req.body.name || 'Chatty User',
      picture: null
    }
  });
});

app.post('/api/auth/signup', (req, res) => {
  // Mock signup for CLI mode
  res.json({
    ok: true,
    user: {
      sub: 'cli-user',
      email: req.body.email || 'user@chatty.local',
      name: req.body.name || 'Chatty User',
      picture: null
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  // Mock logout for CLI mode
  res.json({ ok: true });
});

// Main chat endpoint - replaces complex chatty-api.ts
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await cliBridge.processMessage(message);
    res.json(result);
  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    });
  }
});

// Command endpoint for slash commands
app.post('/api/command', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command is required' });
    }

    const result = await cliBridge.processCommand(command);
    res.json(result);
  } catch (error: any) {
    console.error('Command endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    });
  }
});

// Status endpoint
app.get('/api/status', (req, res) => {
  try {
    const context = cliBridge.getContext();
    res.json({
      model: cliBridge.getModel(),
      memoryCount: context.history?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
});

// Legacy compatibility endpoints (for existing frontend)
app.post('/chatty-sync', async (req, res) => {
  try {
    const { prompt, seat = 'synth' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // Set model if specified
    if (seat !== 'synth') {
      cliBridge.setModel(seat);
    }

    const result = await cliBridge.processMessage(prompt);
    
    // Format response to match legacy API
    res.json({
      answer: result.content,
      model: result.metadata?.model || seat,
      metadata: result.metadata
    });
  } catch (error: any) {
    console.error('Legacy sync endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error?.message || 'Unknown error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Chatty CLI Web Bridge running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`⚡ Command endpoint: http://localhost:${PORT}/api/command`);
});

export default app;
