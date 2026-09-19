import axios from 'axios';
import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { recordTrade, hasBought, updateTradeTP, getTrades, closeTrade, getBotConfig, getActiveSetFile } from '../db/database.js';
import { sessionWalletService } from './sessionWallet.service.js';
import { tradeExecutionService } from './tradeExecution.service.js';
import { jupiterPriceService } from './jupiterPrice.service.js';
import { jupiterLimitOrderService } from './jupiterLimitOrder.service.js';

const JUPITER_API = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
const RPC_URL     = process.env.SOLANA_RPC_URL   || 'https://api.mainnet-beta.solana.com';
const SOL_MINT    = 'So11111111111111111111111111111111111111112';

export class TradingService {
  constructor() {
    this.connection     = new Connection(RPC_URL, 'confirmed');
    this.sessionService = sessionWalletService;
  }

  /**
   * AUTONOMOUS BUY: swaps SOL for meme token using delegated session keypair.
   * Zero wallet popups — signs directly on server.
   */
  async autoBuy({ userWallet, tokenAddress, coinName, coinSymbol, amountSol, slippageBps = 500, useJito = true, feeSpeed = 'fast', tpPct = null, slPct = null }) {
    if (!userWallet || !tokenAddress) {
      throw new Error('Missing userWallet or tokenAddress');
    }

    // Resolve TP/SL from active Set File if not explicitly provided
    if (tpPct == null && slPct == null) {
      try {
        const activeSet = await getActiveSetFile(userWallet);
        tpPct = activeSet?.tradeConfig?.tpPct ?? activeSet?.tpPct ?? null;
        slPct = activeSet?.tradeConfig?.slPct ?? activeSet?.slPct ?? null;
      } catch (err) {
        console.warn('[AutoBuy] Could not load activeSet for tp/sl:', err.message);
      }
    }

    // 1. Anti-Duplicate Guard
    if (await hasBought(tokenAddress, userWallet)) {
      throw new Error(`SKIP: already bought ${coinSymbol} for ${userWallet.slice(0, 8)}`);
    }

    // 2. Retrieve session keypair
    const keypair = await this.sessionService.getKeypair(userWallet);
    const sessionPubkey = keypair.publicKey.toBase58();

    // 3. Verify session wallet balance
    const balLamports = await this.connection.getBalance(keypair.publicKey);
    const balSol = balLamports / LAMPORTS_PER_SOL;
    if (balSol < amountSol + 0.005) {
      throw new Error(`Insufficient session balance: ${balSol.toFixed(4)} SOL (needs ${amountSol + 0.005} SOL)`);
    }

    // 4. Request Jupiter Swap Quote
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: SOL_MINT,
        outputMint: tokenAddress,
        amount: Math.floor(amountSol * LAMPORTS_PER_SOL),
        slippageBps,
        onlyDirectRoutes: false,
      },
      timeout: 6000,
    });
    const quote = quoteRes.data;
    if (!quote?.outAmount) throw new Error('Jupiter: no valid swap route found');

    // 5. Build Swap Transaction
    // Map feeSpeed to Jupiter priority fee: slow = minimal, medium/fast = auto
    const priorityFee = feeSpeed === 'slow' ? 1000 : 'auto';
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: sessionPubkey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: priorityFee,
    }, { timeout: 6000 });

    const { swapTransaction } = swapRes.data;
    if (!swapTransaction) throw new Error('Jupiter: swap transaction build failed');

    // 6. Deserialize and sign with session keypair
    const txBuf = Buffer.from(swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    // 7. Execute via Jito MEV Bundle with 0ms RPC fallback
    // feeSpeed mapping: slow = no Jito, medium = Jito p50 tip, fast = Jito p99 tip
    const effectiveUseJito = feeSpeed === 'slow' ? false : useJito;
    const jitoTier = feeSpeed === 'medium' ? 'medium' : 'fast';
    const execRes = await tradeExecutionService.execute({
      connection: this.connection,
      tx,
      keypair,
      tradeSizeSol: amountSol,
      useJito: effectiveUseJito,
      jitoTier,
    });
    const sig = execRes.txSignature;

    // 8. Record in DB
    const outAmount = parseInt(quote.outAmount, 10) || 1;
    const buyPrice = amountSol / outAmount;

    // Estimate buy price in USD for limit order pricing
    // Use Jupiter price cache if available, fallback to SOL estimate
    const solPriceUsd = 145; // Conservative fallback
    const jupPrice = jupiterPriceService.getPrice(tokenAddress);
    const buyPriceUsd = jupPrice?.usdPrice || ((amountSol * solPriceUsd) / (outAmount / 1e6));

    const trade = await recordTrade({
      coin_address: tokenAddress,
      coin_name: coinName,
      coin_symbol: coinSymbol,
      buy_price_sol: buyPrice,
      buy_price_usd: buyPriceUsd,
      amount_sol: amountSol,
      out_amount: outAmount,
      wallet_address: userWallet,
      session_pubkey: sessionPubkey,
      tx_signature: sig,
      method: execRes.method,
    });

    console.log(`[BOT] AUTO-BUY ${coinSymbol} | ${amountSol} SOL | tx: ${sig.slice(0, 12)}...`);

    // 9. Place on-chain TP/SL sell limit orders immediately (zero server dependency)
    if ((tpPct && tpPct > 0) || (slPct && slPct > 0)) {
      jupiterLimitOrderService.placeExitOrders({
        connection: this.connection,
        keypair,
        tokenMint: tokenAddress,
        tokenAmountRaw: outAmount,
        buyPriceUsd,
        amountSol,
        tpPct,
        slPct,
      }).then(result => {
        if (result.errors.length > 0) {
          console.warn(`[Jupiter Limit] Exit order warnings for ${coinSymbol}:`, result.errors.map(e => e.message).join(', '));
        }
      }).catch(err => {
        console.warn(`[Jupiter Limit] Exit order placement notice for ${coinSymbol}:`, err.message);
      });
    }

    return { success: true, txSignature: sig, tradeId: trade.id, outAmount };
  }

  /**
   * AUTO-SELL / MANUAL-SELL: swaps token for SOL
   */
  async sell({ userWallet, tokenAddress, tokenAmount, tradeId = null, tpLevel = null, slippageBps = 500, useJito = true, feeSpeed = 'fast' }) {
    const keypair = await this.sessionService.getKeypair(userWallet);
    const sessionPubkey = keypair.publicKey.toBase58();

    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: tokenAddress,
        outputMint: SOL_MINT,
        amount: String(Math.floor(tokenAmount)),
        slippageBps,
      },
      timeout: 6000,
    });
    const quote = quoteRes.data;
    if (!quote?.outAmount) throw new Error('Jupiter sell: no valid swap route');

    // Map feeSpeed to Jupiter priority fee: slow = minimal, medium/fast = auto
    const priorityFee = feeSpeed === 'slow' ? 1000 : 'auto';
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: sessionPubkey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: priorityFee,
    }, { timeout: 6000 });

    const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    const outSol = (parseInt(quote.outAmount, 10) || 0) / LAMPORTS_PER_SOL;

    // feeSpeed mapping: slow = no Jito, medium = Jito p50 tip, fast = Jito p99 tip
    const effectiveUseJito = feeSpeed === 'slow' ? false : useJito;
    const jitoTier = feeSpeed === 'medium' ? 'medium' : 'fast';
    const execRes = await tradeExecutionService.execute({
      connection: this.connection,
      tx,
      keypair,
      tradeSizeSol: outSol,
      useJito: effectiveUseJito,
      jitoTier,
    });
    const sig = execRes.txSignature;

    if (tradeId && tpLevel) {
      await updateTradeTP(tradeId, tpLevel);
    }
    if (tradeId && tpLevel === 3) {
      await closeTrade(tradeId, { exit_price_sol: outSol });
    }

    console.log(`[BOT] 📤 SOLD ${tokenAddress.slice(0, 6)}... for ${outSol.toFixed(4)} SOL | tx: ${sig.slice(0, 12)}...`);
    return { success: true, txSignature: sig, outSol };
  }

  /**
   * Monitor open trade positions against GMGN-style Advanced Trading Strategy rules
   * Evaluates:
   * - TP: Fixed Take Profit
   * - TP DD: Trailing Take Profit with Drawdown
   * - SL DD: Trailing Stop Loss with Drawdown
   * - SL: Fixed Stop Loss
   *
   * Price source priority:
   *  1. Jupiter Price V3 (1.5s freshness) — primary
   *  2. tokensMap (12s GMGN freshness) — fallback
   */
  async checkPositionsAgainstStrategy(tokensMap) {
    try {
      const allTrades = await getTrades();
      const openTrades = (allTrades || []).filter(t => t.status === 'open');
      if (openTrades.length === 0) return;

      for (const trade of openTrades) {
        // Priority 1: Jupiter V3 real-time price (1.5s freshness)
        let currentPrice = 0;
        let priceSource = 'none';
        const jupPrice = jupiterPriceService.getPrice(trade.coin_address);
        if (jupPrice && !jupPrice.isStale && jupPrice.usdPrice > 0) {
          currentPrice = jupPrice.usdPrice;
          priceSource = `jupiter (${jupPrice.ageMs}ms old)`;
        } else {
          // Priority 2: tokensMap fallback (12s GMGN freshness)
          const token = tokensMap ? tokensMap.get(trade.coin_address) : null;
          if (token && token.priceUsd > 0) {
            currentPrice = token.priceUsd;
            priceSource = 'gmgn_ticker';
          }
        }

        if (currentPrice <= 0) continue;

        // Retrieve user bot config
        const config = await getBotConfig(trade.wallet_address);
        const rules = config?.strategyRules || [];
        if (!Array.isArray(rules) || rules.length === 0) continue;

        // Update trade peak price
        const entryPrice = trade.buy_price_usd || (trade.buy_price_sol * (tokensMap?.get(trade.coin_address)?.solPriceUsd || 145)) || currentPrice;
        const peakPrice = Math.max(trade.peak_price_usd || entryPrice, currentPrice);
        trade.peak_price_usd = peakPrice;

        const currentPnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const peakPnlPct = ((peakPrice - entryPrice) / entryPrice) * 100;
        const ddFromPeakPct = peakPnlPct - currentPnlPct;

        for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
          const rule = rules[ruleIdx];
          const executedKey = `rule_${ruleIdx}_hit`;
          if (trade[executedKey]) continue;

          let triggerSell = false;
          let reason = '';

          // 1. Fixed TP: Trigger when current PnL >= target
          if (rule.type === 'TP' && currentPnlPct >= Number(rule.triggerPct || 100)) {
            triggerSell = true;
            reason = `Fixed TP +${rule.triggerPct}% hit (Current: +${currentPnlPct.toFixed(1)}%)`;
          }

          // 2. Trailing TP with Drawdown (TP DD): Trigger once peak was >= target and pulled back by ddPct
          else if (rule.type === 'TP DD' && peakPnlPct >= Number(rule.triggerPct || 100) && ddFromPeakPct >= Number(rule.ddPct || 20)) {
            triggerSell = true;
            reason = `Trailing TP DD hit: Peak was +${peakPnlPct.toFixed(1)}%, pulled back ${ddFromPeakPct.toFixed(1)}% (Limit: ${rule.ddPct}%)`;
          }

          // 3. Trailing Stop Loss with Drawdown (SL DD): Trigger when price drops ddPct from peak
          else if (rule.type === 'SL DD' && ddFromPeakPct >= Number(rule.ddPct || 20)) {
            triggerSell = true;
            reason = `Trailing SL DD hit: Dropped ${ddFromPeakPct.toFixed(1)}% from peak ${peakPrice.toFixed(6)}`;
          }

          // 4. Fixed Stop Loss (SL): Trigger when loss drops below -triggerPct
          else if (rule.type === 'SL' && currentPnlPct <= -Math.abs(Number(rule.triggerPct || 50))) {
            triggerSell = true;
            reason = `Fixed SL hit: Loss ${currentPnlPct.toFixed(1)}% (Threshold: -${Math.abs(rule.triggerPct)}%)`;
          }

          if (triggerSell) {
            console.log(`[BOT] 🚨 Strategy Trigger for $${trade.coin_symbol} (${trade.wallet_address.slice(0, 6)}...): ${reason}. Selling ${rule.sellPct}%!`);

            const closingType = config?.closingType || 'amount';
            const baseAmount = closingType === 'amount'
              ? (trade.out_amount || 1000)
              : (trade.remaining_amount || trade.out_amount || 1000);

            const sellTokenAmount = Math.max(1, Math.floor(baseAmount * (Number(rule.sellPct || 100) / 100)));

            try {
              await this.sell({
                userWallet: trade.wallet_address,
                tokenAddress: trade.coin_address,
                tokenAmount: sellTokenAmount,
                tradeId: trade.id,
                slippageBps: Number(config?.slippageBps || 500),
                useJito: config?.useJito ?? true,
              });

              trade[executedKey] = true;
              trade.remaining_amount = Math.max(0, (trade.remaining_amount || trade.out_amount) - sellTokenAmount);

              if (rule.sellPct >= 100 || trade.remaining_amount <= 0 || ruleIdx === rules.length - 1) {
                await closeTrade(trade.id, { exit_price_usd: currentPrice, close_reason: reason });
              }
            } catch (sellErr) {
              console.warn(`[BOT] Strategy execution notice for $${trade.coin_symbol}:`, sellErr.message);
            }
            break; // Evaluate one rule per tick
          }
        }
      }
    } catch (err) {
      // Monitor error caught cleanly
    }
  }
}

export const tradingService = new TradingService();
