import { Router } from 'express';
import { tokenAggregatorService } from '../services/tokenAggregator.service.js';
import { gmgnKeyPool } from '../services/gmgnKeyPool.service.js';
import { sessionWalletService } from '../services/sessionWallet.service.js';
import { tradingService } from '../services/trading.service.js';
import { jupiterPriceService } from '../services/jupiterPrice.service.js';
import { getBotConfig, updateBotConfig, getTrades, saveSetFile, getSetFiles, getSetFile, deleteSetFile, getActiveSetFile, setActiveSetFile } from '../db/database.js';
import { sendOtp, verifyOtp, verifyToken, setPinForUser, verifyPinAndIssueToken, hasPinSet } from '../services/auth.service.js';
import { rpcProxyService } from '../services/rpcProxy.service.js';

const router = Router();

// ── Auth Endpoints ──────────────────────────────────────────────────

router.post('/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Valid Gmail address required' });
    }
    const result = await sendOtp(email);
    // Only forward the message — NEVER forward an OTP code to the client
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    const { token, user, hasPinSet: pinSet } = await verifyOtp(email, otp);
    res.json({ success: true, token, user, hasPinSet: pinSet });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/auth/me', verifyToken, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// Check whether a PIN has been configured for a given email (no auth required)
router.get('/auth/pin-status', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !email.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Valid Gmail address required' });
    }
    const hasPin = await hasPinSet(email);
    res.json({ success: true, hasPin });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set a 4-digit PIN for the authenticated user (requires valid JWT from OTP verification)
router.post('/auth/set-pin', verifyToken, async (req, res) => {
  try {
    const { pin } = req.body;
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits (0-9)' });
    }
    await setPinForUser(email, pin);
    res.json({ success: true, message: 'PIN saved. You can now use your 4-digit PIN to log in.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify a 4-digit PIN and issue a fresh JWT (no existing JWT required)
router.post('/auth/verify-pin', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!email || !email.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Valid Gmail address required' });
    }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const { token, user } = await verifyPinAndIssueToken(email, pin);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
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
 * POST /api/bot/session/delete
 * Safely deletes a session wallet:
 * - Sweeps 100% remaining SOL balance back to user's connected wallet
 * - Permanently preserves private key in backup vault
 * - Clears session so user can create fresh new one
 */
router.post('/bot/session/delete', async (req, res) => {
  try {
    const { userWallet } = req.body;
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });
    const result = await sessionWalletService.deleteAndRefundSession(userWallet);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/bot/session/backups/:wallet
 * Get list of archived session keys and refund histories.
 */
router.get('/bot/session/backups/:wallet', async (req, res) => {
  try {
    const backups = await sessionWalletService.getBackups(req.params.wallet);
    res.json({ success: true, backups: backups || [] });
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
    const { userWallet, signature, message, sessionPubkey } = req.body;
    if (!userWallet || !signature || !message) {
      return res.status(400).json({ error: 'Missing userWallet, signature, or message' });
    }
    const result = await sessionWalletService.exportPrivateKey(userWallet, signature, message, sessionPubkey);
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

// ── RPC Gateway Endpoints ─────────────────────────────────────────

/**
 * GET /api/rpc/blockhash
 * Cached recent blockhash (<15ms, 0 CORS risk)
 */
router.get('/rpc/blockhash', async (req, res) => {
  try {
    const data = await rpcProxyService.getLatestBlockhash();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rpc/balance/:address
 * Cached wallet balance (<15ms, 0 CORS risk)
 */
router.get('/rpc/balance/:address', async (req, res) => {
  try {
    const data = await rpcProxyService.getBalance(req.params.address);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rpc
 * Whitelisted JSON-RPC proxy for browser clients
 */
router.post('/rpc', async (req, res) => {
  try {
    const data = await rpcProxyService.forwardJsonRpc(req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32600, message: err.message }
    });
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
 * GET /api/bot/portfolio/live/:wallet
 * Returns live prices and unrealized P&L for all open trades.
 * Powered by Jupiter Price V3 cache (refreshed every 1.5s).
 */
router.get('/bot/portfolio/live/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const trades = await getTrades(wallet);
    const openTrades = (trades || []).filter(t => !t.closed_at && !t.is_closed);

    const livePositions = openTrades.map(trade => {
      const jupPrice = jupiterPriceService.getPrice(trade.coin_address);
      const currentPriceUsd = jupPrice?.usdPrice || null;
      const buyPriceUsd = trade.buy_price_usd || null;

      let unrealizedPnlPct = null;
      let unrealizedPnlUsd = null;
      if (currentPriceUsd && buyPriceUsd && buyPriceUsd > 0) {
        unrealizedPnlPct = ((currentPriceUsd - buyPriceUsd) / buyPriceUsd) * 100;
        const tokenAmountUi = (trade.out_amount || 0) / Math.pow(10, 6);
        unrealizedPnlUsd = tokenAmountUi * (currentPriceUsd - buyPriceUsd);
      }

      return {
        tradeId: trade.id,
        coinAddress: trade.coin_address,
        coinSymbol: trade.coin_symbol,
        coinName: trade.coin_name,
        buyPriceUsd,
        currentPriceUsd,
        unrealizedPnlPct: unrealizedPnlPct != null ? parseFloat(unrealizedPnlPct.toFixed(2)) : null,
        unrealizedPnlUsd: unrealizedPnlUsd != null ? parseFloat(unrealizedPnlUsd.toFixed(4)) : null,
        priceAgeMs: jupPrice?.ageMs || null,
        isStale: jupPrice?.isStale ?? true,
        amountSol: trade.amount_sol,
        outAmount: trade.out_amount,
        txSignature: trade.tx_signature,
        boughtAt: trade.created_at,
      };
    });

    res.json({ success: true, positions: livePositions, count: livePositions.length });
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

    const activeSet = await getActiveSetFile(userWallet);
    const tpPct = req.body.tpPct ?? activeSet?.tradeConfig?.tpPct ?? activeSet?.tpPct ?? null;
    const slPct = req.body.slPct ?? activeSet?.tradeConfig?.slPct ?? activeSet?.slPct ?? null;

    const result = await tradingService.autoBuy({
      userWallet,
      tokenAddress,
      coinName,
      coinSymbol,
      amountSol: Number(amountSol || 0.1),
      slippageBps: Number(slippageBps || 500),
      tpPct,
      slPct,
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
    if (!userWallet) return res.status(400).json({ error: 'Missing userWallet' });
    if (!id) return res.status(400).json({ error: 'Missing set file id to activate' });
    const activated = await setActiveSetFile(userWallet, id);
    if (!activated) {
      return res.status(404).json({ error: `Set file not found for this wallet` });
    }
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
