import axios from 'axios';
import { getTrades } from '../db/database.js';

const JUPITER_PRICE_V3_URL = 'https://api.jup.ag/price/v3';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';

/**
 * JupiterPriceService — Real-time token price polling via Jupiter Price API v3.
 *
 * Provides ~1.5s price freshness for held positions (TP/SL monitoring),
 * replacing the 12s GMGN polling for price-critical operations.
 *
 * Architecture:
 *  - Maintains a watchList of token mints being actively monitored
 *  - Polls Jupiter V3 in batches of 50 mints every 1.5s
 *  - Caches prices with timestamps for staleness detection
 *  - Auto-syncs watchList from open trades on startup
 */
export class JupiterPriceService {
  constructor() {
    this.priceCache = new Map(); // mint -> { usdPrice, updatedAt, liquidity, priceChange24h }
    this.watchList = new Set();  // mints being actively monitored
    this.pollIntervalMs = 1500;  // 1.5s polling cycle (within free tier 0.5 req/s)
    this.staleThresholdMs = 10000; // prices older than 10s are considered stale
    this.timer = null;
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 10;
    this.lastPollMs = 0;
  }

  /**
   * Start the price polling loop.
   * Auto-loads open trade mints from DB on startup.
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Jupiter Price] Real-time price monitor started (1.5s cycle).');

    // Auto-subscribe to all open trade token addresses
    try {
      const allTrades = await getTrades();
      const openTrades = (allTrades || []).filter(t => t.status === 'open');
      for (const trade of openTrades) {
        if (trade.coin_address) {
          this.watchList.add(trade.coin_address);
        }
      }
      if (this.watchList.size > 0) {
        console.log(`[Jupiter Price] Auto-subscribed to ${this.watchList.size} open position(s).`);
      }
    } catch (err) {
      console.warn('[Jupiter Price] Auto-subscribe notice:', err.message);
    }

    // Initial poll immediately
    await this._pollPrices();

    // Start interval
    this.timer = setInterval(async () => {
      try {
        await this._pollPrices();
      } catch (err) {
        // Handled inside _pollPrices
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop the price polling loop.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[Jupiter Price] Price monitor stopped.');
  }

  /**
   * Add mints to the active watch list.
   */
  subscribeMints(mints) {
    if (!Array.isArray(mints)) mints = [mints];
    for (const mint of mints) {
      if (mint && typeof mint === 'string') {
        this.watchList.add(mint);
      }
    }
  }

  /**
   * Remove a mint from the watch list.
   */
  unsubscribeMint(mint) {
    this.watchList.delete(mint);
    // Keep the cached price for a while in case it's needed
  }

  /**
   * Get the latest cached price for a token mint.
   * Returns { usdPrice, ageMs, isStale, liquidity } or null if not cached.
   */
  getPrice(mint) {
    const cached = this.priceCache.get(mint);
    if (!cached) return null;

    const ageMs = Date.now() - cached.updatedAt;
    return {
      usdPrice: cached.usdPrice,
      ageMs,
      isStale: ageMs > this.staleThresholdMs,
      liquidity: cached.liquidity || 0,
      priceChange24h: cached.priceChange24h || 0,
    };
  }

  /**
   * Get all cached prices.
   */
  getAllPrices() {
    const result = new Map();
    for (const [mint, data] of this.priceCache) {
      const ageMs = Date.now() - data.updatedAt;
      result.set(mint, {
        usdPrice: data.usdPrice,
        ageMs,
        isStale: ageMs > this.staleThresholdMs,
      });
    }
    return result;
  }

  /**
   * Internal: Poll Jupiter V3 for batch prices.
   */
  async _pollPrices() {
    if (this.watchList.size === 0) return;

    // Rate limit safety: ensure minimum gap between polls
    const now = Date.now();
    const elapsed = now - this.lastPollMs;
    if (elapsed < 1000) return; // Never poll faster than 1 req/s

    const mints = Array.from(this.watchList);
    // Jupiter V3 supports up to 50 mints per request
    const batches = [];
    for (let i = 0; i < mints.length; i += 50) {
      batches.push(mints.slice(i, i + 50));
    }

    for (const batch of batches) {
      try {
        const headers = {};
        if (JUPITER_API_KEY) {
          headers['x-api-key'] = JUPITER_API_KEY;
        }

        const res = await axios.get(JUPITER_PRICE_V3_URL, {
          params: { ids: batch.join(',') },
          headers,
          timeout: 4000,
        });

        this.lastPollMs = Date.now();
        const data = res.data;
        if (!data || typeof data !== 'object') continue;

        const updateTime = Date.now();
        for (const mint of batch) {
          const priceData = data[mint];
          if (priceData && priceData.usdPrice != null && priceData.usdPrice > 0) {
            this.priceCache.set(mint, {
              usdPrice: Number(priceData.usdPrice),
              updatedAt: updateTime,
              liquidity: Number(priceData.liquidity || 0),
              priceChange24h: Number(priceData.priceChange24h || 0),
            });
          }
          // If mint is missing from response, Jupiter has no price for it — keep stale cache
        }

        this.consecutiveErrors = 0;
      } catch (err) {
        this.consecutiveErrors++;

        if (err.response?.status === 429) {
          // Rate limited — back off
          console.warn('[Jupiter Price] Rate limited. Backing off for 5s.');
          await new Promise(r => setTimeout(r, 5000));
        } else if (this.consecutiveErrors <= 3) {
          // Only log first few errors to avoid spam
          console.warn(`[Jupiter Price] Poll error (${this.consecutiveErrors}):`, err.message);
        }

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error('[Jupiter Price] Too many consecutive errors. Pausing for 30s.');
          await new Promise(r => setTimeout(r, 30000));
          this.consecutiveErrors = 0;
        }
      }
    }
  }
}

export const jupiterPriceService = new JupiterPriceService();
