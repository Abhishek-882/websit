import { Router } from 'express';
import { tokenAggregatorService } from '../services/tokenAggregator.service.js';
import { gmgnKeyPool } from '../services/gmgnKeyPool.service.js';
import { sessionWalletService } from '../services/sessionWallet.service.js';
import { tradingService } from '../services/trading.service.js';
import { getBotConfig, updateBotConfig, getTrades } from '../db/database.js';

const router = Router();

/**
 * GET /api/tokens
 * Returns Solana meme tokens with GMGN market cap, smart money, KOLs, and dev fund in USD.
 */
router.get('/tokens', (req, res) => {
  try {
    const data = tokenAggregatorService.getEnrichedTokens();
    res.json({
      success: true,
      chain: 'sol',
      tokens: data.tokens,
      solPriceUsd: data.solPriceUsd,
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

// ── Bot & Session Wallet Endpoints ─────────────────────────────────

/**
 * POST /api/bot/session
 * Generates or fetches dedicated session wallet for connected Phantom address.
 */
router.post('/bot/session', async (req, res) => {
  try {
    const { userWallet, botConfig } = req.body;
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });

    const session = await sessionWalletService.createSession(userWallet, botConfig);
    const balance = await sessionWalletService.getSessionBalance(userWallet);
    res.json({ success: true, sessionPubkey: session.sessionPubkey, balanceSol: balance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/bot/session/:wallet
 * Get session wallet balance and configuration.
 */
router.get('/bot/session/:wallet', async (req, res) => {
  try {
    const userWallet = req.params.wallet;
    const balance = await sessionWalletService.getSessionBalance(userWallet);
    const config = await getBotConfig(userWallet);
    res.json({ success: true, userWallet, balanceSol: balance, botConfig: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/withdraw
 * Withdraw session wallet balance back to user's main wallet.
 */
router.post('/bot/withdraw', async (req, res) => {
  try {
    const { userWallet } = req.body;
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });

    const result = await sessionWalletService.withdrawAll(userWallet);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/bot/config/:wallet
 */
router.get('/bot/config/:wallet', async (req, res) => {
  try {
    const config = await getBotConfig(req.params.wallet);
    res.json({ success: true, botConfig: config || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/config
 */
router.post('/bot/config', async (req, res) => {
  try {
    const { userWallet, botConfig } = req.body;
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });

    await updateBotConfig(userWallet, botConfig);
    res.json({ success: true, botConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/bot/trades/:wallet
 */
router.get('/bot/trades/:wallet', async (req, res) => {
  try {
    const trades = await getTrades(req.params.wallet);
    res.json({ success: true, trades: trades || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/manual-buy
 */
router.post('/bot/manual-buy', async (req, res) => {
  try {
    const { userWallet, tokenAddress, coinName, coinSymbol, amountSol, slippageBps } = req.body;
    const result = await tradingService.autoBuy({
      userWallet,
      tokenAddress,
      coinName,
      coinSymbol,
      amountSol: Number(amountSol || 0.1),
      slippageBps: Number(slippageBps || 500),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/manual-sell
 */
router.post('/bot/manual-sell', async (req, res) => {
  try {
    const { userWallet, tokenAddress, tokenAmount, slippageBps } = req.body;
    const result = await tradingService.sell({
      userWallet,
      tokenAddress,
      tokenAmount: Number(tokenAmount),
      slippageBps: Number(slippageBps || 500),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/health
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
