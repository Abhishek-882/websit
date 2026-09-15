/**
 * DexScreener Service
 * 
 * Free-tier discovery & market data service:
 * - 300 requests/min rate limit (generous ceiling, NO API key required, ZERO ban risk)
 * - Fetches real-time Solana tokens, market caps, launch ages, liquidity, and volumes.
 * - Stage 1 pre-filters dead/low-liquidity tokens before sending candidates to GMGN.
 */

export class DexScreenerService {
  constructor() {
    this.baseUrl = 'https://api.dexscreener.com';
    this.timeoutMs = 8000;
  }

  formatTimeAgo(timestampMs) {
    if (!timestampMs) return '--';
    const diff = Math.max(0, Date.now() - timestampMs);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  /**
   * Fetch trending and newly created Solana pairs from DexScreener.
   * Pre-filters:
   * - Must be on Solana chain
   * - Minimum liquidity ($1,000+) to eliminate 100% dead/rugged abandoned pairs upfront.
   */
  async fetchActiveSolanaPairs() {
    const candidateMap = new Map();

    // 1. Fetch latest token profiles on Solana
    try {
      const resp = await fetch(`${this.baseUrl}/token-profiles/latest/v1`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (resp.ok) {
        const profiles = await resp.json();
        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            if (p.chainId === 'solana' && p.tokenAddress) {
              candidateMap.set(p.tokenAddress, {
                address: p.tokenAddress,
                icon: p.icon || null,
                header: p.header || null,
                description: p.description || null,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[DexScreener] Profiles fetch notice:', err.message);
    }

    // 2. Fetch search results for active Solana tokens
    try {
      const resp = await fetch(`${this.baseUrl}/latest/dex/search?q=solana`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (resp.ok) {
        const searchData = await resp.json();
        const pairs = Array.isArray(searchData?.pairs) ? searchData.pairs : [];
        for (const pair of pairs) {
          if (pair.chainId === 'solana' && pair.baseToken?.address) {
            const addr = pair.baseToken.address;
            const existing = candidateMap.get(addr) || {};
            candidateMap.set(addr, {
              ...existing,
              address: addr,
              pairAddress: pair.pairAddress,
              symbol: pair.baseToken.symbol || 'TOKEN',
              name: pair.baseToken.name || pair.baseToken.symbol || 'Solana Token',
              priceUsd: parseFloat(pair.priceUsd) || 0,
              marketCap: pair.marketCap || pair.fdv || 0,
              liquidityUsd: pair.liquidity?.usd || 0,
              volume24h: pair.volume?.h24 || 0,
              volume1h: pair.volume?.h1 || 0,
              pairCreatedAt: pair.pairCreatedAt || null,
              ageMs: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) : null,
              ageFormatted: this.formatTimeAgo(pair.pairCreatedAt),
              dexId: pair.dexId || 'raydium',
              url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[DexScreener] Search fetch notice:', err.message);
    }

    // 3. If candidates have missing pair stats, batch query them via /tokens/v1/solana/{addresses}
    const needDetails = Array.from(candidateMap.values())
      .filter(c => !c.marketCap && c.address)
      .slice(0, 30)
      .map(c => c.address);

    if (needDetails.length > 0) {
      try {
        const resp = await fetch(`${this.baseUrl}/tokens/v1/solana/${needDetails.join(',')}`, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (resp.ok) {
          const pairs = await resp.json();
          if (Array.isArray(pairs)) {
            for (const pair of pairs) {
              const addr = pair.baseToken?.address;
              if (addr && candidateMap.has(addr)) {
                const c = candidateMap.get(addr);
                c.pairAddress = pair.pairAddress;
                c.symbol = c.symbol || pair.baseToken.symbol || 'TOKEN';
                c.name = c.name || pair.baseToken.name || 'Solana Token';
                c.priceUsd = parseFloat(pair.priceUsd) || c.priceUsd || 0;
                c.marketCap = pair.marketCap || pair.fdv || c.marketCap || 0;
                c.liquidityUsd = pair.liquidity?.usd || c.liquidityUsd || 0;
                c.volume24h = pair.volume?.h24 || c.volume24h || 0;
                c.pairCreatedAt = pair.pairCreatedAt || c.pairCreatedAt || null;
                c.ageMs = c.pairCreatedAt ? (Date.now() - c.pairCreatedAt) : null;
                c.ageFormatted = this.formatTimeAgo(c.pairCreatedAt);
                c.url = pair.url || c.url;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[DexScreener] Batch lookup notice:', err.message);
      }
    }

    // Convert map to array and apply Stage 1 Pre-Filter:
    // Discard tokens with liquidity < $1,000 (filters out dead or pulled liquidity traps)
    const validTokens = this.preFilterPairs(Array.from(candidateMap.values()));

    console.log(`[DexScreener] Stage 1 Pre-Filter: Discovered ${validTokens.length} active high-liquidity Solana tokens.`);
    return validTokens;
  }

  /**
   * Pre-filter candidate pairs:
   * Discard pairs with missing address, 0 market cap, or liquidity < $1,000.
   */
  preFilterPairs(pairs) {
    return (pairs || [])
      .filter(t => t && t.address && (t.marketCap || 0) > 0 && (t.liquidityUsd || 0) >= 1000)
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  }
}

export const dexscreenerService = new DexScreenerService();
