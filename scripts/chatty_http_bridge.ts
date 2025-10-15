import express from 'express';
import fs from 'fs';
import { CLIAIService, ensurePhi3 } from '../src/cli/chatty-cli.js';

(async () => {
  // Ensure Phi-3 / Ollama is running
  await ensurePhi3({ preferredPort: 8003, host: 'http://localhost' });

  // Reusable Chatty instance (timestamps enabled)
  const chatty = new CLIAIService(false, true);

  const app = express();
  app.use(express.json());

  app.post('/api/sendMessageToChatty', async (req, res) => {
    const message = req.body?.message ?? '';
    if (!message) {
      return res.status(400).json({ error: 'missing message' });
    }

    try {
      const reply = await chatty.processMessage(message);

      // Persist log
      fs.appendFileSync(
        '.chatty_katana_log.json',
        JSON.stringify({ ts: new Date().toISOString(), message, reply }) + '\n'
      );

      res.json({ reply });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  const PORT = 5060;
  app.listen(PORT, () => console.log(`Chatty HTTP bridge listening on :${PORT}`));
})();
