import axios from 'axios';
import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { recordTrade, hasBought, updateTradeTP, getTrades, closeTrade } from '../db/database.js';
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

    const execRes = await tradeExecutionService.execute({
      connection: this.connection,
      tx,
      keypair,
      tradeSizeSol: 0.05,
      useJito,
    });
    const sig = execRes.txSignature;
    const outSol = (parseInt(quote.outAmount, 10) || 0) / LAMPORTS_PER_SOL;

    if (tradeId && tpLevel) {
      await updateTradeTP(tradeId, tpLevel);
    }
    if (tradeId && tpLevel === 3) {
      await closeTrade(tradeId, { exit_price_sol: outSol });
    }

    console.log(`[BOT] 📤 SOLD ${tokenAddress.slice(0, 6)}... for ${outSol.toFixed(4)} SOL | tx: ${sig.slice(0, 12)}...`);
    return { success: true, txSignature: sig, outSol };
  }
}

export const tradingService = new TradingService();
