import { Router } from 'express';
import { tokenAggregatorService } from '../services/tokenAggregator.service.js';
import { gmgnKeyPool } from '../services/gmgnKeyPool.service.js';
import { sessionWalletService } from '../services/sessionWallet.service.js';
import { tradingService } from '../services/trading.service.js';
import { getBotConfig, updateBotConfig, getTrades, saveSetFile, getSetFiles, getSetFile, deleteSetFile, getActiveSetFile, setActiveSetFile } from '../db/database.js';
import { sendOtp, verifyOtp, verifyToken } from '../services/auth.service.js';

const router = Router();

// ── Auth Endpoints ──────────────────────────────────────────────────

router.post('/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Valid Gmail address required' });
    }
    await sendOtp(email);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    const { token, user } = await verifyOtp(email, otp);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/auth/me', verifyToken, async (req, res) => {
  res.json({ success: true, user: req.user });
});

router.use('/bot', verifyToken);

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
 * Get session wallet pubkey, balance and configuration.
 */
router.get('/bot/session/:wallet', async (req, res) => {
  try {
    const userWallet = req.params.wallet;
    const session = await sessionWalletService.getSession(userWallet);
    const config = await getBotConfig(userWallet);
    res.json({
      success: true,
      userWallet,
      sessionPubkey: session ? session.sessionPubkey : null,
      balanceSol: session ? session.balanceSol : 0,
      botConfig: config,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/export-key
 * Secure export of session private key requiring Phantom signature proof-of-ownership.
 */
router.post('/bot/export-key', async (req, res) => {
  try {
    const { userWallet, signature, message } = req.body;
    if (!userWallet || !signature || !message) {
      return res.status(400).json({ error: 'Missing userWallet, signature, or message' });
    }
    const result = await sessionWalletService.exportPrivateKey(userWallet, signature, message);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/bot/verify-deposit
 * Verifies on-chain deposit tx and refreshes live session balance.
 */
router.post('/bot/verify-deposit', async (req, res) => {
  try {
    const { userWallet, txSignature } = req.body;
    if (!userWallet) {
      return res.status(400).json({ error: 'Missing userWallet' });
    }
    const result = await sessionWalletService.verifyDeposit(userWallet, txSignature);
    res.json(result);
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

router.post('/bot/manual-buy', async (req, res) => {
  try {
    const { userWallet, tokenAddress, coinName, coinSymbol, amountSol, slippageBps } = req.body;
    
    const token = tokenAggregatorService.tokensMap.get(tokenAddress);
    if (!token) {
      console.warn('[AutoBuy] BLOCKED: Token not found in aggregator for', coinSymbol);
      return res.status(400).json({ error: 'Token data not found' });
    }
    if (!token.marketCap || token.marketCap <= 0) {
      console.warn('[AutoBuy] BLOCKED: No valid market cap for', token.symbol);
      return res.status(400).json({ error: 'No valid market cap' });
    }
    if (!token.priceUsd || token.priceUsd <= 0) {
      console.warn('[AutoBuy] BLOCKED: No valid price for', token.symbol);
      return res.status(400).json({ error: 'No valid price' });
    }
    if (!token.devFund || token.devFund.error) {
      console.warn('[AutoBuy] BLOCKED: Dev fund check failed for', token.symbol);
      return res.status(400).json({ error: 'Dev fund check failed' });
    }
    if (!token.enrichedAt) {
      console.warn('[AutoBuy] BLOCKED: Token not fully enriched', token.symbol);
      return res.status(400).json({ error: 'Token not fully enriched' });
    }

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

// ── Set File Endpoints ──────────────────────────────────────────────

router.get('/bot/set-files/:wallet', async (req, res) => {
  try {
    const files = await getSetFiles(req.params.wallet);
    res.json({ success: true, setFiles: files || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bot/set-file', async (req, res) => {
  try {
    const { userWallet, setFile } = req.body;
    if (!userWallet || !setFile) return res.status(400).json({ error: 'Missing userWallet or setFile' });
    const saved = await saveSetFile(userWallet, setFile);
    res.json({ success: true, setFile: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/bot/set-file', async (req, res) => {
  try {
    const { userWallet, id } = req.body;
    if (!userWallet || !id) return res.status(400).json({ error: 'Missing userWallet or id' });
    const deleted = await deleteSetFile(userWallet, id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bot/set-file/activate', async (req, res) => {
  try {
    const { userWallet, id } = req.body;
    if (!userWallet || !id) return res.status(400).json({ error: 'Missing userWallet or id' });
    const activated = await setActiveSetFile(userWallet, id);
    res.json({ success: true, activeSetFile: activated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bot/set-file/deactivate', async (req, res) => {
  try {
    const { userWallet } = req.body;
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });
    // Deactivate all set files for this wallet by activating a non-existent ID
    await setActiveSetFile(userWallet, null);
    res.json({ success: true });
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
