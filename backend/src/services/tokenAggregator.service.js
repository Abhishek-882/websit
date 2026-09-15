import { dexscreenerService } from './dexscreener.service.js';
import { gmgnKeyPool } from './gmgnKeyPool.service.js';
import { devFundService } from './devFund.service.js';
import { getAllActiveSessions } from '../db/database.js';
import { tradingService } from './trading.service.js';

export class TokenAggregatorService {
  constructor() {
    this.chain = 'sol'; // Strictly Solana Network
    this.tokensMap = new Map(); // address -> tokenRecord
    this.lastScanTimestamp = null;
    this.isScanning = false;
    this.scanIntervalMs = 60 * 1000; // 60 seconds automated background cycle
    this.timer = null;
    this.fastTickerTimer = null;
    this.cacheTtlMs = 10 * 60 * 1000; // 10 minutes cache TTL
    this.maxGmgnEnrichmentsPerCycle = 6; // Rate-safe limit per cycle
    this.solPriceUsd = 145; // Live SOL price in USD
  }

  startAutoScan() {
    if (this.timer) return;
    console.log(`[Token Aggregator] 🚀 Autonomous Solana meme coin auto-scan initialized.`);
    
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
    console.log(`[Token Aggregator] ⚡ Ultra-low latency 3.5s GMGN Solana market cap ticker active.`);
    
    this.fastTickerTimer = setInterval(async () => {
      try {
        if (!gmgnKeyPool.isAvailable()) return;
        await this.syncFastTicker();
      } catch (err) {
        // Ticker pass-through
      }
    }, 3500);
  }

  async syncFastTicker() {
    try {
      const trending = await gmgnKeyPool.getTrendingSwaps('sol', '1h');
      const rankList = trending?.data?.rank || trending?.data || [];
      if (!Array.isArray(rankList)) return;

      const now = Date.now();
      for (const item of rankList) {
        if (!item.address) continue;
        const rawMcap = Number(item.market_cap || item.fdv || 0);
        const rawPrice = Number(item.price || 0);
        if (rawMcap <= 0 && rawPrice <= 0) continue;

        if (this.tokensMap.has(item.address)) {
          const t = this.tokensMap.get(item.address);
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
          // Instantly ingest newly trending Solana meme tokens from GMGN
          const openTs = item.open_timestamp ? item.open_timestamp * 1000 : null;
          this.tokensMap.set(item.address, {
            address: item.address,
            chain: 'sol',
            chainId: 'solana',
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
            dexId: 'raydium',
            url: `https://dexscreener.com/solana/${item.address}`,
            gmgnUrl: `https://gmgn.ai/sol/token/${item.address}`,
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
   * Scan and enrich Solana tokens
   */
  async scanSolana() {
    try {
      // Stage 1a: Ingest GMGN Official Trending Swaps
      if (gmgnKeyPool.isAvailable()) {
        try {
          const gmgnTrending = await gmgnKeyPool.getTrendingSwaps('sol', '1h');
          const rankList = gmgnTrending?.data?.rank || gmgnTrending?.data || [];
          if (Array.isArray(rankList)) {
            for (const item of rankList) {
              if (item.address && !this.tokensMap.has(item.address)) {
                const openTs = item.open_timestamp ? item.open_timestamp * 1000 : null;
                const mcap = Number(item.market_cap || item.fdv || 0);
                const price = Number(item.price || 0);
                this.tokensMap.set(item.address, {
                  address: item.address,
                  chain: 'sol',
                  chainId: 'solana',
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
                  dexId: 'raydium',
                  url: `https://dexscreener.com/solana/${item.address}`,
                  gmgnUrl: `https://gmgn.ai/sol/token/${item.address}`,
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
          console.warn(`[Token Aggregator] GMGN trending notice:`, trendErr.message);
        }
      }

      // Stage 1b: DexScreener Discovery & Pre-Filter
      const candidates = await dexscreenerService.fetchActivePairs('solana');

      for (const cand of candidates) {
        if (!this.tokensMap.has(cand.address)) {
          this.tokensMap.set(cand.address, {
            address: cand.address,
            chain: 'sol',
            chainId: 'solana',
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
            dexId: cand.dexId || 'raydium',
            url: cand.url,
            gmgnUrl: `https://gmgn.ai/sol/token/${cand.address}`,
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
          const t = this.tokensMap.get(cand.address);
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
          t.gmgnUrl = `https://gmgn.ai/sol/token/${cand.address}`;
        }
      }

      // Stage 2: Targeted GMGN & Dev Fund Enrichment
      const now = Date.now();
      const needEnrichment = Array.from(this.tokensMap.values())
        .filter(t => (now - (t.enrichedAt || 0)) > this.cacheTtlMs)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, this.maxGmgnEnrichmentsPerCycle);

      console.log(`[Token Aggregator] Enriching ${needEnrichment.length} SOL tokens with GMGN telemetry...`);

      for (const token of needEnrichment) {
        if (!gmgnKeyPool.isAvailable()) {
          console.warn(`[Token Aggregator] GMGN Key Pool cooldown active. Skipping remaining SOL tokens.`);
          break;
        }

        try {
          const gmgnRes = await gmgnKeyPool.getTokenInfo('sol', token.address);
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
              const kolRes = await gmgnKeyPool.getTokenTopTraders('sol', token.address, { tag: 'renowned' });
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
              const smartRes = await gmgnKeyPool.getTokenTopTraders('sol', token.address, { tag: 'smart_degen' });
              const smartList = smartRes?.list || smartRes?.data?.list || smartRes?.data || [];
              const parsedSmart = this.parseHoldersAndSold(smartList, 0.80);
              activeSmartHolders = parsedSmart.holding;
              soldSmartHolders = parsedSmart.sold;
            } catch (smartErr) {
              console.warn(`[Token Aggregator] Smart Money notice for ${token.symbol}:`, smartErr.message);
            }
          }

          const devInfo = gmgnInfo?.dev || {};
          const devFund = await devFundService.resolveDevFund(devInfo, token.address, this.solPriceUsd);

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

          console.log(`[Token Aggregator] ✓ Enriched $${token.symbol} (SOL): MCap=$${Math.round(token.marketCap).toLocaleString()}, Smart=${token.smartMoneyCount}h/${token.smartMoneySoldCount}s, KOL=${token.kolCount}h/${token.kolSoldCount}s, Dev=${devFund?.fundingSource}, Balance=${devFund?.devBalanceSol ?? '--'} SOL ($${devFund?.devBalanceUsd ?? 0})`);

          // ── Autonomous Auto-Buy Trigger for Active Sessions ──
          await this.evaluateAutoBuyTriggers(token);

        } catch (enrichErr) {
          console.warn(`[Token Aggregator] Enrichment error for $${token.symbol}:`, enrichErr.message);
        }
      }
    } catch (err) {
      console.warn(`[Token Aggregator] Error scanning Solana:`, err.message);
    }
  }

  /**
   * Evaluates if an enriched token qualifies for auto-buy across active bot sessions
   */
  async evaluateAutoBuyTriggers(token) {
    try {
      const activeSessions = await getAllActiveSessions();
      if (!Array.isArray(activeSessions) || activeSessions.length === 0) return;

      for (const session of activeSessions) {
        const cfg = session.bot_config || {};
        if (!cfg.autoBuy) continue;

        // Verify criteria
        const mcap = token.marketCap || 0;
        const smart = token.smartMoneyCount ?? 0;
        const kol = token.kolCount ?? 0;
        const devMoneyUsd = token.devFund?.devBalanceUsd ?? 0;

        if (cfg.minMcap && mcap < cfg.minMcap) continue;
        if (cfg.maxMcap && mcap > cfg.maxMcap) continue;
        if (cfg.minSmart && smart < cfg.minSmart) continue;
        if (cfg.minKol && kol < cfg.minKol) continue;
        if (cfg.minDevUsd && devMoneyUsd < cfg.minDevUsd) continue;

        console.log(`[BOT] 🎯 Auto-Buy criteria matched for $${token.symbol} by wallet ${session.user_wallet.slice(0, 8)}...`);

        tradingService.autoBuy({
          userWallet: session.user_wallet,
          tokenAddress: token.address,
          coinName: token.name,
          coinSymbol: token.symbol,
          amountSol: Number(cfg.buyAmountSol || 0.1),
          slippageBps: Number(cfg.slippageBps || 500),
          useJito: cfg.useJito ?? true,
        }).catch(err => {
          console.warn(`[BOT] Auto-buy execution notice for $${token.symbol}:`, err.message);
        });
      }
    } catch (err) {
      // Pass-through
    }
  }

  async runScanCycle() {
    if (this.isScanning) {
      console.log('[Token Aggregator] Scan cycle already running, skipping overlapping tick.');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();
    console.log('[Token Aggregator] ⚡ Starting autonomous Solana scan cycle...');

    try {
      await this.scanSolana();
      this.lastScanTimestamp = Date.now();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Token Aggregator] Scan cycle finished in ${elapsed}s. Tracked Solana: ${this.tokensMap.size}`);
    } catch (cycleErr) {
      console.error('[Token Aggregator] Scan cycle error:', cycleErr.message);
    } finally {
      this.isScanning = false;
    }
  }

  parseHoldersAndSold(traderList, sellThreshold = 1.0) {
    const holding = [];
    const sold = [];

    if (!Array.isArray(traderList)) return { holding, sold };

    for (const tr of traderList) {
      const usdVal = Number(tr.usd_value || 0);
      const balance = Number(tr.balance || tr.amount_cur || 0);
      const sellPct = Number(tr.sell_amount_percentage || 0);

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
   * Evaluates active holders for tests and telemetry
   */
  filterActiveHolders(traders = []) {
    const activeSmartHolders = [];
    const activeKolHolders = [];

    for (const t of traders) {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      const tagV2 = (t.wallet_tag_v2 || '').toLowerCase();
      const isSmart = tags.some(tag => tag.includes('smart')) || tagV2.includes('smart');
      const isKol = tags.some(tag => tag.includes('renowned') || tag.includes('kol')) || tagV2.includes('kol') || Boolean(t.twitter_username);

      const usdVal = Number(t.usd_value || t.usdValue || 0);
      const sellPct = Number(t.sell_amount_percentage ?? t.sellPercentage ?? 0);

      // Must be currently holding with >= $50 USD value and not 100% sold out (sell < 1)
      const isActiveHolder = usdVal >= 50 && sellPct < 1;

      if (isSmart && isActiveHolder) {
        activeSmartHolders.push(t);
      }
      if (isKol && isActiveHolder) {
        activeKolHolders.push(t);
      }
    }

    return { activeSmartHolders, activeKolHolders };
  }

  getEnrichedTokens() {
    const tokens = Array.from(this.tokensMap.values());
    return {
      tokens,
      chain: 'sol',
      solPriceUsd: this.solPriceUsd,
      lastScanTimestamp: this.lastScanTimestamp,
      totalCount: tokens.length,
      isScanning: this.isScanning,
    };
  }
}

export const tokenAggregatorService = new TokenAggregatorService();
