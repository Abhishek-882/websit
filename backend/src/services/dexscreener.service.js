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
   * Fetch trending and newly created pairs from DexScreener.
   * Default chain: 'base'. Also supports 'sol' / 'solana'.
   * Pre-filters:
   * - Must match specified chain ('base' or 'solana')
   * - Minimum liquidity ($1,000+) to eliminate 100% dead/rugged abandoned pairs upfront.
   */
  async fetchActivePairs(chain = 'base') {
    const isBase = chain.toLowerCase() === 'base';
    const targetChainId = isBase ? 'base' : 'solana';
    const chainQuery = isBase ? 'base' : 'solana';
    const candidateMap = new Map();

    // 1. Fetch latest token profiles
    try {
      const resp = await fetch(`${this.baseUrl}/token-profiles/latest/v1`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (resp.ok) {
        const profiles = await resp.json();
        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            if (p.chainId === targetChainId && p.tokenAddress) {
              candidateMap.set(p.tokenAddress, {
                address: p.tokenAddress,
                chainId: targetChainId,
                icon: p.icon || null,
                header: p.header || null,
                description: p.description || null,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[DexScreener] ${targetChainId} profiles fetch notice:`, err.message);
    }

    // 2. Fetch latest & top token boosts on target chain (real meme coins)
    try {
      const [latestBoostsResp, topBoostsResp] = await Promise.all([
        fetch(`${this.baseUrl}/token-boosts/latest/v1`, { signal: AbortSignal.timeout(this.timeoutMs) }).catch(() => null),
        fetch(`${this.baseUrl}/token-boosts/top/v1`, { signal: AbortSignal.timeout(this.timeoutMs) }).catch(() => null),
      ]);

      const processBoosts = async (resp) => {
        if (resp && resp.ok) {
          const items = await resp.json().catch(() => []);
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.chainId === targetChainId && item.tokenAddress) {
                const existing = candidateMap.get(item.tokenAddress) || {};
                candidateMap.set(item.tokenAddress, {
                  ...existing,
                  address: item.tokenAddress,
                  chainId: targetChainId,
                  icon: item.icon || existing.icon || null,
                  header: item.header || existing.header || null,
                  description: item.description || existing.description || null,
                });
              }
            }
          }
        }
      };

      await Promise.all([processBoosts(latestBoostsResp), processBoosts(topBoostsResp)]);
    } catch (boostErr) {
      console.warn(`[DexScreener] ${targetChainId} boosts notice:`, boostErr.message);
    }

    // 3. Batch query token pairs from DexScreener in chunks of 30
    const addresses = Array.from(candidateMap.keys());
    for (let i = 0; i < addresses.length; i += 30) {
      const chunk = addresses.slice(i, i + 30);
      try {
        const resp = await fetch(`${this.baseUrl}/tokens/v1/${targetChainId}/${chunk.join(',')}`, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (resp.ok) {
          const pairs = await resp.json();
          if (Array.isArray(pairs)) {
            for (const pair of pairs) {
              const baseAddr = pair.baseToken?.address;
              const quoteAddr = pair.quoteToken?.address;
              
              // Determine which token is the actual meme coin (exclude quote currency wrappers)
              const baseSym = (pair.baseToken?.symbol || '').toUpperCase();
              const isBaseSystem = ['SOL', 'WSOL', 'USDC', 'USDT', 'WETH', 'ETH', 'DAI'].includes(baseSym);
              
              const targetAddr = isBaseSystem ? quoteAddr : baseAddr;
              const targetToken = isBaseSystem ? pair.quoteToken : pair.baseToken;

              if (targetAddr && candidateMap.has(targetAddr)) {
                const c = candidateMap.get(targetAddr);
                c.pairAddress = pair.pairAddress;
                c.symbol = targetToken?.symbol || c.symbol;
                c.name = targetToken?.name || c.name;
                c.priceUsd = parseFloat(pair.priceUsd) || c.priceUsd || 0;
                c.marketCap = pair.marketCap || pair.fdv || c.marketCap || 0;
                c.liquidityUsd = pair.liquidity?.usd || c.liquidityUsd || 0;
                c.volume24h = pair.volume?.h24 || c.volume24h || 0;
                c.volume1h = pair.volume?.h1 || 0;
                c.pairCreatedAt = pair.pairCreatedAt || c.pairCreatedAt || null;
                c.ageMs = c.pairCreatedAt ? (Date.now() - c.pairCreatedAt) : null;
                c.ageFormatted = this.formatTimeAgo(c.pairCreatedAt);
                c.dexId = pair.dexId || (isBase ? 'uniswap' : 'raydium');
                c.url = pair.url || `https://dexscreener.com/${targetChainId}/${pair.pairAddress}`;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[DexScreener] ${targetChainId} chunk batch lookup notice:`, err.message);
      }
    }

    // Convert map to array and apply Stage 1 Pre-Filter:
    const validTokens = this.preFilterPairs(Array.from(candidateMap.values()));
    console.log(`[DexScreener] Stage 1 Pre-Filter: Discovered ${validTokens.length} active high-liquidity ${targetChainId.toUpperCase()} tokens.`);
    return validTokens;
  }

  /**
   * Backwards-compatible alias for Solana
   */
  async fetchActiveSolanaPairs() {
    return this.fetchActivePairs('solana');
  }

  /**
   * Pre-filter candidate pairs:
   * Discard pairs with missing address, 0 market cap, or liquidity < $1,000.
   * Purges native system quote tokens (SOL, WSOL, WETH, ETH, USDC, USDT) and nameless tokens.
   */
  preFilterPairs(pairs) {
    const SYSTEM_SYMBOLS = new Set([
      'SOL', 'WSOL', 'USDC', 'USDT', 'WETH', 'ETH', 'DAI', 'WBTC',
      'MSOL', 'BSOL', 'JITOSOL', 'CBBTC', 'CBETH'
    ]);

    return (pairs || [])
      .filter(t => {
        if (!t || !t.address) return false;
        if ((t.marketCap || 0) <= 0) return false;
        if ((t.liquidityUsd || 0) < 1000) return false;

        // Discard system currencies & placeholder tokens
        const sym = String(t.symbol || '').trim().toUpperCase();
        if (SYSTEM_SYMBOLS.has(sym) || sym === 'TOKEN') return false;
        const name = String(t.name || '').trim().toLowerCase();
        if (name === 'token') return false;

        return true;
      })
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  }
}

export const dexscreenerService = new DexScreenerService();
