import { Router } from 'express';
import { needling, formatForPromptInjection } from '../scripts/needle.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const {
      q,
      paths,
      glob,
      max = '50',
      around = '1',
      format,
    } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({
        query: '',
        total_hits: 0,
        receipts: [],
        message: 'no receipts found',
        engine: 'none',
      });
    }

    const searchPaths = paths ? String(paths).split(',').map(p => p.trim()) : undefined;

    const result = await needling(q, {
      paths: searchPaths,
      glob: glob || undefined,
      max: Math.min(parseInt(max, 10) || 50, 200),
      around: Math.min(parseInt(around, 10) || 1, 5),
    });

    if (format === 'prompt') {
      const topN = parseInt(req.query.topN || '8', 10);
      return res.json({
        ...result,
        prompt_injection: formatForPromptInjection(result, topN),
      });
    }

    return res.json(result);
  } catch (error) {
    console.error(`[Needle API] Error:`, error.message);
    return res.status(500).json({
      error: 'Needle search failed',
      message: error.message,
    });
  }
});

export default router;
