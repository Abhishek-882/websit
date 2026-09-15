import { dexscreenerService } from './dexscreener.service.js';
import { gmgnKeyPool } from './gmgnKeyPool.service.js';
import { devFundService } from './devFund.service.js';

export class TokenAggregatorService {
  constructor() {
    this.chain = 'base'; // Default network: Base chain
    this.chainTokens = {
      base: new Map(),
      sol: new Map(),
    };
    // Compatibility reference
    this.tokensMap = this.chainTokens.base;
    this.lastScanTimestamp = null;
    this.isScanning = false;
    this.scanIntervalMs = 60 * 1000; // 60 seconds automated background cycle
    this.timer = null;
    this.fastTickerTimer = null;
    this.cacheTtlMs = 10 * 60 * 1000; // 10 minutes cache TTL
    this.maxGmgnEnrichmentsPerCycle = 6; // Rate-safe limit per cycle
  }

  startAutoScan() {
    if (this.timer) return;
    console.log(`[Token Aggregator] 🚀 Autonomous 60s multi-chain auto-scan initialized (Default: Base).`);
    
    // 1. Run initial scan after 1.5s startup delay
    setTimeout(() => {
      this.runScanCycle().catch(err => console.warn('[Token Aggregator] Initial scan notice:', err.message));
    }, 1500);

    // 2. Schedule regular 60-second cycle for deep discovery and dev telemetry
    this.timer = setInterval(() => {
      this.runScanCycle().catch(err => console.warn('[Token Aggregator] Periodic scan notice:', err.message));
    }, this.scanIntervalMs);

    // 3. Start ultra-low-latency 3.5s GMGN market cap & price fast ticker
    this.startFastTicker();
  }

  startFastTicker() {
    if (this.fastTickerTimer) return;
    console.log(`[Token Aggregator] ⚡ Ultra-low latency 3.5s GMGN market cap ticker active.`);
    
    let tickerChain = 'base';
    this.fastTickerTimer = setInterval(async () => {
      try {
        if (!gmgnKeyPool.isAvailable()) return;
        await this.syncFastTicker(tickerChain);
        tickerChain = tickerChain === 'base' ? 'sol' : 'base';
      } catch (err) {
        // Ticker pass-through
      }
    }, 3500);
  }

  async syncFastTicker(chainKey = 'base') {
    const isBase = chainKey.toLowerCase() === 'base';
    const chain = isBase ? 'base' : 'sol';
    const chainMap = this.chainTokens[chain];
    if (!chainMap) return;

    try {
      const trending = await gmgnKeyPool.getTrendingSwaps(chain, '1h');
      const rankList = trending?.data?.rank || trending?.data || [];
      if (!Array.isArray(rankList)) return;

      const now = Date.now();
      for (const item of rankList) {
        if (!item.address) continue;
        const rawMcap = Number(item.market_cap || item.fdv || 0);
        const rawPrice = Number(item.price || 0);
        if (rawMcap <= 0 && rawPrice <= 0) continue;

        if (chainMap.has(item.address)) {
          const t = chainMap.get(item.address);
          const oldMcap = t.marketCap || 0;
          if (rawMcap > 0 && Math.abs(rawMcap - oldMcap) > 0.01) {
            t.priceDirection = rawMcap > oldMcap ? 'up' : 'down';
            t.marketCap = rawMcap;
            t.gmgnMcap = rawMcap;
            t.gmgnSynced = true;
            t.lastPriceUpdate = now;
          }
          if (rawPrice > 0) {
            t.priceUsd = rawPrice;
          }
          if (item.logo && !t.icon) t.icon = item.logo;
        } else {
          // Instantly ingest newly trending meme tokens from GMGN
          const openTs = item.open_timestamp ? item.open_timestamp * 1000 : null;
          chainMap.set(item.address, {
            address: item.address,
            chain: chain,
            chainId: isBase ? 'base' : 'solana',
            symbol: item.symbol || 'TOKEN',
            name: item.name || item.symbol || 'Meme Token',
            icon: item.logo || null,
            priceUsd: rawPrice,
            marketCap: rawMcap,
            gmgnMcap: rawMcap,
            gmgnSynced: true,
            priceDirection: 'neutral',
            lastPriceUpdate: now,
            liquidityUsd: Number(item.liquidity || 0),
            volume24h: Number(item.volume24h || item.volume || 0),
            volume1h: Number(item.volume1h || 0),
            pairCreatedAt: openTs,
            ageMs: openTs ? (now - openTs) : null,
            ageFormatted: openTs ? dexscreenerService.formatTimeAgo(openTs) : '--',
            dexId: isBase ? 'uniswap' : 'raydium',
            url: isBase ? `https://dexscreener.com/base/${item.address}` : `https://dexscreener.com/solana/${item.address}`,
            gmgnUrl: `https://gmgn.ai/${chain}/token/${item.address}`,
            smartMoneyCount: null,
            smartMoneySoldCount: 0,
            smartHolders: [],
            smartSold: [],
            kolCount: null,
            kolSoldCount: 0,
            kolHolders: [],
            kolSold: [],
            devFund: null,
            enrichedAt: 0,
          });
        }
      }
    } catch (err) {
      // Ticker error caught cleanly
    }
  }

  stopAutoScan() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fastTickerTimer) {
      clearInterval(this.fastTickerTimer);
      this.fastTickerTimer = null;
    }
  }

  /**
   * Scan and enrich tokens for a specific chain ('base' or 'sol')
   */
  async scanChain(chainKey = 'base') {
    const isBase = chainKey.toLowerCase() === 'base';
    const chain = isBase ? 'base' : 'sol';
    const chainMap = this.chainTokens[chain];

    try {
      // Stage 1a: Ingest GMGN Official Trending Swaps
      if (gmgnKeyPool.isAvailable()) {
        try {
          const gmgnTrending = await gmgnKeyPool.getTrendingSwaps(chain, '1h');
          const rankList = gmgnTrending?.data?.rank || gmgnTrending?.data || [];
          if (Array.isArray(rankList)) {
            for (const item of rankList) {
              if (item.address && !chainMap.has(item.address)) {
                const openTs = item.open_timestamp ? item.open_timestamp * 1000 : null;
                const mcap = Number(item.market_cap || item.fdv || 0);
                const price = Number(item.price || 0);
                chainMap.set(item.address, {
                  address: item.address,
                  chain: chain,
                  chainId: isBase ? 'base' : 'solana',
                  symbol: item.symbol || 'TOKEN',
                  name: item.name || item.symbol || 'Meme Token',
                  icon: item.logo || null,
                  priceUsd: price,
                  marketCap: mcap,
                  gmgnMcap: mcap,
                  gmgnSynced: true,
                  priceDirection: 'neutral',
                  lastPriceUpdate: Date.now(),
                  liquidityUsd: Number(item.liquidity || 0),
                  volume24h: Number(item.volume24h || item.volume || 0),
                  volume1h: Number(item.volume1h || 0),
                  pairCreatedAt: openTs,
                  ageMs: openTs ? (Date.now() - openTs) : null,
                  ageFormatted: openTs ? dexscreenerService.formatTimeAgo(openTs) : '--',
                  dexId: isBase ? 'uniswap' : 'raydium',
                  url: isBase ? `https://dexscreener.com/base/${item.address}` : `https://dexscreener.com/solana/${item.address}`,
                  gmgnUrl: `https://gmgn.ai/${chain}/token/${item.address}`,
                  smartMoneyCount: null,
                  smartMoneySoldCount: 0,
                  smartHolders: [],
                  smartSold: [],
                  kolCount: null,
                  kolSoldCount: 0,
                  kolHolders: [],
                  kolSold: [],
                  devFund: null,
                  enrichedAt: 0,
                });
              }
            }
          }
        } catch (trendErr) {
          console.warn(`[Token Aggregator] GMGN trending notice for ${chain}:`, trendErr.message);
        }
      }

      // Stage 1b: DexScreener Discovery & Pre-Filter
      const candidates = await dexscreenerService.fetchActivePairs(chain);

      for (const cand of candidates) {
        if (!chainMap.has(cand.address)) {
          chainMap.set(cand.address, {
            address: cand.address,
            chain: chain,
            chainId: isBase ? 'base' : 'solana',
            symbol: cand.symbol,
            name: cand.name,
            icon: cand.icon,
            priceUsd: cand.priceUsd,
            marketCap: cand.marketCap,
            gmgnMcap: 0,
            gmgnSynced: false,
            priceDirection: 'neutral',
            lastPriceUpdate: Date.now(),
            liquidityUsd: cand.liquidityUsd,
            volume24h: cand.volume24h,
            volume1h: cand.volume1h,
            pairCreatedAt: cand.pairCreatedAt,
            ageMs: cand.ageMs,
            ageFormatted: cand.ageFormatted,
            dexId: cand.dexId,
            url: cand.url,
            gmgnUrl: `https://gmgn.ai/${chain}/token/${cand.address}`,
            // GMGN Telemetry fields
            smartMoneyCount: null,
            smartMoneySoldCount: 0,
            smartHolders: [],
            smartSold: [],
            kolCount: null,
            kolSoldCount: 0,
            kolHolders: [],
            kolSold: [],
            devFund: null,
            enrichedAt: 0,
          });
        } else {
          const t = chainMap.get(cand.address);
          // Do not overwrite authoritative GMGN market cap if already synced
          if (!t.gmgnSynced || !t.marketCap || t.marketCap <= 0) {
            t.priceUsd = cand.priceUsd;
            t.marketCap = cand.marketCap;
          }
          t.liquidityUsd = cand.liquidityUsd || t.liquidityUsd;
          t.volume24h = cand.volume24h || t.volume24h;
          t.volume1h = cand.volume1h || t.volume1h;
          if (!t.icon && cand.icon) t.icon = cand.icon;
          if (cand.pairCreatedAt && (!t.pairCreatedAt || cand.pairCreatedAt < t.pairCreatedAt)) {
            t.pairCreatedAt = cand.pairCreatedAt;
          }
          t.ageMs = t.pairCreatedAt ? (Date.now() - t.pairCreatedAt) : cand.ageMs;
          t.ageFormatted = dexscreenerService.formatTimeAgo(t.pairCreatedAt || cand.pairCreatedAt);
          t.url = cand.url || t.url;
          t.gmgnUrl = `https://gmgn.ai/${chain}/token/${cand.address}`;
        }
      }

      // Stage 2: Targeted GMGN & Dev Fund Enrichment
      const now = Date.now();
      const needEnrichment = Array.from(chainMap.values())
        .filter(t => (now - (t.enrichedAt || 0)) > this.cacheTtlMs)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, this.maxGmgnEnrichmentsPerCycle);

      console.log(`[Token Aggregator] Enriching ${needEnrichment.length} ${chain.toUpperCase()} tokens with GMGN telemetry...`);

      for (const token of needEnrichment) {
        if (!gmgnKeyPool.isAvailable()) {
          console.warn(`[Token Aggregator] GMGN Key Pool cooldown active. Skipping remaining ${chain.toUpperCase()} tokens.`);
          break;
        }

        try {
          const gmgnRes = await gmgnKeyPool.getTokenInfo(chain, token.address);
          const gmgnInfo = gmgnRes?.data || gmgnRes || {};

          // Extract GMGN authoritative market cap and price
          const gmgnLivePrice = Number(gmgnInfo?.price?.price || gmgnInfo?.price || 0);
          const gmgnSupply = Number(gmgnInfo?.circulating_supply || gmgnInfo?.total_supply || 0);
          const calculatedMcap = gmgnLivePrice > 0 && gmgnSupply > 0 ? (gmgnLivePrice * gmgnSupply) : 0;
          if (calculatedMcap > 0) {
            const oldMcap = token.marketCap || 0;
            if (oldMcap > 0 && Math.abs(calculatedMcap - oldMcap) > 0.01) {
              token.priceDirection = calculatedMcap > oldMcap ? 'up' : 'down';
            }
            token.marketCap = calculatedMcap;
            token.gmgnMcap = calculatedMcap;
            token.priceUsd = gmgnLivePrice;
            token.gmgnSynced = true;
            token.lastPriceUpdate = Date.now();
          }
          if (gmgnInfo?.logo && !token.icon) token.icon = gmgnInfo.logo;

          const tagStats = gmgnInfo?.wallet_tags_stat || {};
          const candidateSmartCount = Number(tagStats.smart_wallets || tagStats.smart_degen || 0);
          const candidateKolCount = Number(tagStats.renowned_wallets || tagStats.kol_wallets || 0);

          let activeKolHolders = [];
          let soldKolHolders = [];
          let activeSmartHolders = [];
          let soldSmartHolders = [];

          if (candidateKolCount > 0) {
            try {
              const kolRes = await gmgnKeyPool.getTokenTopTraders(chain, token.address, { tag: 'renowned' });
              const kolList = kolRes?.list || kolRes?.data?.list || kolRes?.data || [];
              const parsedKol = this.parseHoldersAndSold(kolList, 0.80);
              activeKolHolders = parsedKol.holding;
              soldKolHolders = parsedKol.sold;
            } catch (kolErr) {
              console.warn(`[Token Aggregator] KOL notice for ${token.symbol}:`, kolErr.message);
            }
          }

          if (candidateSmartCount > 0) {
            try {
              const smartRes = await gmgnKeyPool.getTokenTopTraders(chain, token.address, { tag: 'smart_degen' });
              const smartList = smartRes?.list || smartRes?.data?.list || smartRes?.data || [];
              const parsedSmart = this.parseHoldersAndSold(smartList, 0.80);
              activeSmartHolders = parsedSmart.holding;
              soldSmartHolders = parsedSmart.sold;
            } catch (smartErr) {
              console.warn(`[Token Aggregator] Smart Money notice for ${token.symbol}:`, smartErr.message);
            }
          }

          const devInfo = gmgnInfo?.dev || {};
          const devFund = await devFundService.resolveDevFund(devInfo, token.address);

          token.smartMoneyCount = activeSmartHolders.length;
          token.smartMoneySoldCount = soldSmartHolders.length;
          token.smartHolders = activeSmartHolders;
          token.smartSold = soldSmartHolders;

          token.kolCount = activeKolHolders.length;
          token.kolSoldCount = soldKolHolders.length;
          token.kolHolders = activeKolHolders;
          token.kolSold = soldKolHolders;

          token.devFund = devFund;
          token.enrichedAt = Date.now();

          console.log(`[Token Aggregator] ✓ Enriched $${token.symbol} (${chain.toUpperCase()}): MCap=$${token.marketCap.toLocaleString()}, Smart=${token.smartMoneyCount}h/${token.smartMoneySoldCount}s, KOL=${token.kolCount}h/${token.kolSoldCount}s, Dev=${devFund?.fundingSource}, Balance=${devFund?.devBalanceSol ?? '--'}`);
        } catch (enrichErr) {
          console.warn(`[Token Aggregator] Enrichment error for $${token.symbol}:`, enrichErr.message);
        }
      }
    } catch (err) {
      console.warn(`[Token Aggregator] Error scanning ${chainKey}:`, err.message);
    }
  }

  /**
   * Two-Stage Discovery & Enrichment Cycle:
   * Defaults to Base chain, and also updates Solana.
   */
  async runScanCycle() {
    if (this.isScanning) {
      console.log('[Token Aggregator] Scan cycle already running, skipping overlapping tick.');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();
    console.log('[Token Aggregator] ⚡ Starting autonomous multi-chain scan cycle...');

    try {
      // 1. Scan Base (default user priority)
      await this.scanChain('base');

      // 2. Scan Solana
      await this.scanChain('sol');

      this.lastScanTimestamp = Date.now();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Token Aggregator] Scan cycle finished in ${elapsed}s. Tracked Base: ${this.chainTokens.base.size}, Solana: ${this.chainTokens.sol.size}`);
    } catch (cycleErr) {
      console.error('[Token Aggregator] Scan cycle error:', cycleErr.message);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Parse tagged GMGN trader list into active holding vs sold:
   * STRICT USER DIRECTIVE:
   * - Holding: usd_value >= 50, balance > 0, and sell_amount_percentage < 1 (exclude sold out)
   * - Sold: sell_amount_percentage >= 1 or balance === 0 or usd_value < 50
   */
  parseHoldersAndSold(traderList, sellThreshold = 1.0) {
    const holding = [];
    const sold = [];

    if (!Array.isArray(traderList)) return { holding, sold };

    for (const tr of traderList) {
      const usdVal = Number(tr.usd_value || 0);
      const balance = Number(tr.balance || tr.amount_cur || 0);
      const sellPct = Number(tr.sell_amount_percentage || 0);

      // Rule: Must hold >= $50 USD value, have balance > 0, and sell_amount_percentage < sellThreshold (< 1)
      const isHolding = usdVal >= 50 && (balance > 0 || usdVal >= 50) && sellPct < sellThreshold;

      const item = {
        address: tr.address || tr.wallet_address,
        name: tr.name || null,
        twitterUsername: tr.twitter_username || null,
        avatar: tr.avatar || null,
        usdValue: Math.round(usdVal * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        sellPercentage: Math.round(sellPct * 100) / 100,
        holdingPercent: Math.round(Math.max(0, 1 - sellPct) * 100),
        realizedProfit: Math.round(Number(tr.realized_profit || 0)),
        tags: Array.isArray(tr.tags) ? tr.tags : [],
      };

      if (isHolding) {
        holding.push(item);
      } else {
        sold.push(item);
      }
    }

    return { holding, sold };
  }

  /**
   * Filter general top trader list for active Smart Money and KOL holders:
   * STRICT USER DIRECTIVE: MUST BE CURRENTLY HOLDING WITH >= $50 USD value, EXCLUDE SOLD OUT (sell_amount_percentage < 1)
   */
  filterActiveHolders(traderList) {
    const activeSmartHolders = [];
    const activeKolHolders = [];

    if (!Array.isArray(traderList)) return { activeSmartHolders, activeKolHolders };

    for (const tr of traderList) {
      const usdVal = Number(tr.usd_value || 0);
      const sellPct = Number(tr.sell_amount_percentage || 0);

      // Strict user requirement: usd_value >= 50 and sell_amount_percentage < 1
      if (usdVal < 50 || sellPct >= 1) continue;

      const tags = Array.isArray(tr.tags) ? tr.tags.map(t => String(t).toLowerCase()) : [];
      const singleTag = String(tr.tag || '').toLowerCase();
      const makerTags = Array.isArray(tr.maker_token_tags) ? tr.maker_token_tags.map(t => String(t).toLowerCase()) : [];
      const tagV2 = String(tr.wallet_tag_v2 || '').toLowerCase();
      const allTags = [...tags, ...makerTags, singleTag, tagV2];

      const isSmart = allTags.some(t => t.includes('smart') || t === 'smart_degen' || t === 'smart_wallet');
      const isKol = allTags.some(t => t.includes('kol') || t.includes('renowned') || t.includes('influencer')) || Boolean(tr.twitter_username);

      if (isSmart) {
        activeSmartHolders.push({
          address: tr.address || tr.wallet_address,
          usdValue: Math.round(usdVal * 100) / 100,
          sellPercentage: Math.round(sellPct * 100) / 100,
          tags: Array.isArray(tr.tags) ? tr.tags : [],
        });
      }

      if (isKol) {
        activeKolHolders.push({
          address: tr.address || tr.wallet_address,
          usdValue: Math.round(usdVal * 100) / 100,
          sellPercentage: Math.round(sellPct * 100) / 100,
          holdingPercent: Math.round((1 - sellPct) * 100),
          name: tr.name || null,
          twitterUsername: tr.twitter_username || null,
          avatar: tr.avatar || null,
        });
      }
    }

    return { activeSmartHolders, activeKolHolders };
  }

  getEnrichedTokens(chain = 'base') {
    const isSol = String(chain).toLowerCase().startsWith('sol');
    const targetChain = isSol ? 'sol' : 'base';
    const map = this.chainTokens ? (this.chainTokens[targetChain] || this.chainTokens.base) : this.tokensMap;
    const tokens = Array.from(map.values());
    return {
      tokens,
      chain: targetChain,
      lastScanTimestamp: this.lastScanTimestamp,
      totalCount: tokens.length,
      isScanning: this.isScanning,
    };
  }
}

export const tokenAggregatorService = new TokenAggregatorService();
