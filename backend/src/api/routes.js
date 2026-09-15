import { Router } from 'express';
import { tokenAggregatorService } from '../services/tokenAggregator.service.js';
import { gmgnKeyPool } from '../services/gmgnKeyPool.service.js';

const router = Router();

/**
 * GET /api/tokens
 * Returns the latest list of tokens discovered from DexScreener and enriched via GMGN Key Pool.
 */
router.get('/tokens', (req, res) => {
  try {
    const chainParam = req.query.chain || 'base';
    const data = tokenAggregatorService.getEnrichedTokens(chainParam);
    res.json({
      success: true,
      chain: data.chain || 'base',
      tokens: data.tokens,
      lastScanTimestamp: data.lastScanTimestamp,
      totalCount: data.totalCount,
      isScanning: data.isScanning,
      gmgnPool: gmgnKeyPool.getHealth(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/health
 * Returns service health status, scan state, and GMGN key pool health.
 */
router.get('/health', (req, res) => {
  try {
    const data = tokenAggregatorService.getEnrichedTokens();
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      lastScanTimestamp: data.lastScanTimestamp,
      tokensCount: data.totalCount,
      isScanning: data.isScanning,
      gmgnPool: gmgnKeyPool.getHealth(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
});

export default router;
