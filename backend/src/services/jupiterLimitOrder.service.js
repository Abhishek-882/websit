import axios from 'axios';
import { VersionedTransaction } from '@solana/web3.js';
import { jupiterPriceService } from './jupiterPrice.service.js';

const JUPITER_LIMIT_ORDER_API = 'https://api.jup.ag/limit/v2';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * JupiterLimitOrderService — places on-chain sell limit orders for TP and SL.
 *
 * Orders are placed IMMEDIATELY after every autoBuy() success.
 * They execute fully on-chain via Jupiter keepers — zero server dependency.
 * If the backend goes down, orders still trigger at the target price.
 *
 * Architecture:
 *  - TP order: sell 100% of bought tokens at buyPrice × (1 + tpPct/100)
 *  - SL order: sell 100% of bought tokens at buyPrice × (1 - slPct/100)
 *  - Both signed by the session keypair (no wallet popup)
 *  - Orphaned order (if TP fills, SL order remains) fails harmlessly — tokens are gone
 */
export class JupiterLimitOrderService {
  constructor() {
    this.apiBase = JUPITER_LIMIT_ORDER_API;
  }

  /**
   * Place both a TP sell order and an SL sell order immediately after a buy.
   *
   * @param {Object} params
   * @param {Object} params.connection - Solana connection
   * @param {Object} params.keypair   - Session keypair (signs both orders)
   * @param {string} params.tokenMint - Token mint address (what was bought)
   * @param {number} params.tokenAmountRaw - Raw token amount bought (lamports/smallest unit)
   * @param {number} params.buyPriceUsd - USD price at time of buy
   * @param {number} params.amountSol - SOL amount spent on buy (for direct authentic SOL taking amount)
   * @param {number} params.tpPct - Take profit percentage (e.g. 50 = +50%)
   * @param {number} params.slPct - Stop loss percentage (e.g. 20 = -20%)
   * @param {number} params.tokenDecimals - Token decimals (default 6 for most Solana meme coins)
   */
  async placeExitOrders({ connection, keypair, tokenMint, tokenAmountRaw, buyPriceUsd, amountSol = null, tpPct, slPct, tokenDecimals = 6 }) {
    const results = { tp: null, sl: null, errors: [] };

    if (!tpPct && !slPct) return results;
    if (!tokenAmountRaw || tokenAmountRaw <= 0) return results;

    const sessionPubkey = keypair.publicKey.toBase58();

    // Calculate target prices in terms of SOL received per token
    // We use a 24-hour expiry (86400 seconds from now)
    const expiredAt = Math.floor(Date.now() / 1000) + 86400;

    // Place TP order
    if (tpPct && tpPct > 0) {
      try {
        const tpOrder = await this._placeOrder({
          connection,
          keypair,
          sessionPubkey,
          tokenMint,
          tokenAmountRaw,
          amountSol,
          tpPct,
          slPct: null,
          buyPriceUsd,
          tokenDecimals,
          expiredAt,
          orderLabel: 'TP',
        });
        results.tp = tpOrder;
        console.log(`[Jupiter Limit] TP order placed for ${tokenMint.slice(0, 8)}... at +${tpPct}%: ${tpOrder?.signature || 'submitted'}`);
      } catch (err) {
        console.warn(`[Jupiter Limit] TP order placement notice:`, err.message);
        results.errors.push({ type: 'tp', message: err.message });
      }
    }

    // Place SL order
    if (slPct && slPct > 0) {
      try {
        const slOrder = await this._placeOrder({
          connection,
          keypair,
          sessionPubkey,
          tokenMint,
          tokenAmountRaw,
          amountSol,
          tpPct: null,
          slPct,
          buyPriceUsd,
          tokenDecimals,
          expiredAt,
          orderLabel: 'SL',
        });
        results.sl = slOrder;
        console.log(`[Jupiter Limit] SL order placed for ${tokenMint.slice(0, 8)}... at -${slPct}%: ${slOrder?.signature || 'submitted'}`);
      } catch (err) {
        console.warn(`[Jupiter Limit] SL order placement notice:`, err.message);
        results.errors.push({ type: 'sl', message: err.message });
      }
    }

    return results;
  }

  /**
   * Internal: build, sign, and submit one limit order.
   */
  async _placeOrder({ connection, keypair, sessionPubkey, tokenMint, tokenAmountRaw, amountSol, tpPct, slPct, buyPriceUsd, tokenDecimals, expiredAt, orderLabel }) {
    // Calculate target price factor
    const targetPriceFactor = orderLabel === 'TP' ? (1 + (tpPct / 100)) : (1 - (slPct / 100));
    const targetPriceUsd = buyPriceUsd ? buyPriceUsd * targetPriceFactor : null;

    // Convert to token→SOL rate:
    // We're selling `tokenAmountRaw` of the token and want SOL back.
    // takingAmount is in SOL lamports.
    const LAMPORTS_PER_SOL = 1_000_000_000;
    let solLamports;

    if (amountSol && amountSol > 0) {
      // Direct authentic SOL-denominated math: amountSol * targetPriceFactor
      solLamports = Math.floor(amountSol * targetPriceFactor * LAMPORTS_PER_SOL);
    } else {
      // Dynamic fallback via live SOL price from jupiterPriceService
      const liveSolPrice = jupiterPriceService.getPrice(SOL_MINT)?.usdPrice || 140;
      const tokenAmountUi = tokenAmountRaw / Math.pow(10, tokenDecimals);
      const totalValueUsd = tokenAmountUi * (targetPriceUsd || 0);
      solLamports = Math.floor((totalValueUsd / liveSolPrice) * LAMPORTS_PER_SOL);
    }

    if (solLamports <= 0) {
      throw new Error(`Invalid taking amount for ${orderLabel}: ${solLamports} lamports`);
    }

    // Build the limit order transaction via Jupiter API
    const res = await axios.post(`${this.apiBase}/order/create`, {
      payer: sessionPubkey,
      inputMint: tokenMint,         // Selling the meme token
      outputMint: SOL_MINT,         // Receiving SOL
      makingAmount: String(tokenAmountRaw),  // All tokens
      takingAmount: String(solLamports),     // SOL to receive at target price
      expiredAt,
      computeUnitPrice: 'auto',
      wrapAndUnwrapSol: true,
    }, { timeout: 8000 });

    const { tx: txBase64 } = res.data;
    if (!txBase64) throw new Error(`Jupiter Limit Order API returned no transaction for ${orderLabel}`);

    // Deserialize, sign, submit
    const txBuf = Buffer.from(txBase64, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    const serialized = tx.serialize();
    const signature = await connection.sendRawTransaction(serialized, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    return { signature, orderLabel, targetPriceUsd, solLamports };
  }
}

export const jupiterLimitOrderService = new JupiterLimitOrderService();
