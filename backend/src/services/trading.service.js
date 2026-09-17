import axios from 'axios';
import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { recordTrade, hasBought, updateTradeTP, getTrades, closeTrade, getBotConfig } from '../db/database.js';
import { sessionWalletService } from './sessionWallet.service.js';
import { tradeExecutionService } from './tradeExecution.service.js';

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
  async autoBuy({ userWallet, tokenAddress, coinName, coinSymbol, amountSol, slippageBps = 500, useJito = true }) {
    if (!userWallet || !tokenAddress) {
      throw new Error('Missing userWallet or tokenAddress');
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
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: sessionPubkey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }, { timeout: 6000 });

    const { swapTransaction } = swapRes.data;
    if (!swapTransaction) throw new Error('Jupiter: swap transaction build failed');

    // 6. Deserialize and sign with session keypair
    const txBuf = Buffer.from(swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    // 7. Execute via Jito MEV Bundle with 0ms RPC fallback
    const execRes = await tradeExecutionService.execute({
      connection: this.connection,
      tx,
      keypair,
      tradeSizeSol: amountSol,
      useJito,
    });
    const sig = execRes.txSignature;

    // 8. Record in DB
    const outAmount = parseInt(quote.outAmount, 10) || 1;
    const buyPrice = amountSol / outAmount;
    const trade = await recordTrade({
      coin_address: tokenAddress,
      coin_name: coinName,
      coin_symbol: coinSymbol,
      buy_price_sol: buyPrice,
      amount_sol: amountSol,
      out_amount: outAmount,
      wallet_address: userWallet,
      session_pubkey: sessionPubkey,
      tx_signature: sig,
      method: execRes.method,
    });

    console.log(`[BOT] ✅ AUTO-BUY ${coinSymbol} | ${amountSol} SOL | tx: ${sig.slice(0, 12)}...`);
    return { success: true, txSignature: sig, tradeId: trade.id, outAmount };
  }

  /**
   * AUTO-SELL / MANUAL-SELL: swaps token for SOL
   */
  async sell({ userWallet, tokenAddress, tokenAmount, tradeId = null, tpLevel = null, slippageBps = 500, useJito = true }) {
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

    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: sessionPubkey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }, { timeout: 6000 });

    const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    const outSol = (parseInt(quote.outAmount, 10) || 0) / LAMPORTS_PER_SOL;

    const execRes = await tradeExecutionService.execute({
      connection: this.connection,
      tx,
      keypair,
      tradeSizeSol: outSol,
      useJito,
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
   */
  async checkPositionsAgainstStrategy(tokensMap) {
    try {
      const allTrades = await getTrades();
      const openTrades = (allTrades || []).filter(t => t.status === 'open');
      if (openTrades.length === 0) return;

      for (const trade of openTrades) {
        const token = tokensMap.get(trade.coin_address);
        if (!token || !token.priceUsd || token.priceUsd <= 0) continue;

        // Retrieve user bot config
        const config = await getBotConfig(trade.wallet_address);
        const rules = config?.strategyRules || [];
        if (!Array.isArray(rules) || rules.length === 0) continue;

        // Update trade peak price
        const currentPrice = token.priceUsd;
        const entryPrice = trade.buy_price_usd || (trade.buy_price_sol * (token.solPriceUsd || 145)) || currentPrice;
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
