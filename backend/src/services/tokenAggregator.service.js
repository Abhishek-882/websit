import { dexscreenerService } from './dexscreener.service.js';
import { gmgnKeyPool } from './gmgnKeyPool.service.js';
import { devFundService } from './devFund.service.js';

export class TokenAggregatorService {
  constructor() {
    this.chain = 'sol';
    this.tokensMap = new Map(); // address -> enrichedToken
    this.lastScanTimestamp = null;
    this.isScanning = false;
    this.scanIntervalMs = 60 * 1000; // 60 seconds automated background cycle
    this.timer = null;
    this.cacheTtlMs = 10 * 60 * 1000; // 10 minutes cache TTL
    this.maxGmgnEnrichmentsPerCycle = 6; // At most 6 GMGN calls per 60s cycle (only ~3 req/min)
  }

  startAutoScan() {
    if (this.timer) return;
    console.log(`[Token Aggregator] 🚀 Autonomous 60s auto-scan initialized (zero user-trigger needed).`);
    
    // Run initial scan after 1.5s startup delay
    setTimeout(() => {
      this.runScanCycle().catch(err => console.warn('[Token Aggregator] Initial scan notice:', err.message));
    }, 1500);

    // Schedule regular 60-second cycle
    this.timer = setInterval(() => {
      this.runScanCycle().catch(err => console.warn('[Token Aggregator] Periodic scan notice:', err.message));
    }, this.scanIntervalMs);
  }

  stopAutoScan() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Two-Stage Discovery & Enrichment Cycle:
   * Stage 1: DexScreener free discovery & pre-filter
   * Stage 2: GMGN Key Pool targeted enrichment for Smart Money, KOL, Dev Funding (2,000ms delay)
   */
  async runScanCycle() {
    if (this.isScanning) {
      console.log('[Token Aggregator] Scan cycle already running, skipping overlapping tick.');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();
    console.log('[Token Aggregator] ⚡ Starting autonomous scan cycle...');

    try {
      // ── Stage 1: DexScreener Discovery & Pre-Filter ──
      const candidates = await dexscreenerService.fetchActiveSolanaPairs();

      // Merge raw DexScreener market data into tokens map
      for (const cand of candidates) {
        if (!this.tokensMap.has(cand.address)) {
          this.tokensMap.set(cand.address, {
            address: cand.address,
            symbol: cand.symbol,
            name: cand.name,
            icon: cand.icon,
            priceUsd: cand.priceUsd,
            marketCap: cand.marketCap,
            liquidityUsd: cand.liquidityUsd,
            volume24h: cand.volume24h,
            volume1h: cand.volume1h,
            pairCreatedAt: cand.pairCreatedAt,
            ageMs: cand.ageMs,
            ageFormatted: cand.ageFormatted,
            dexId: cand.dexId,
            url: cand.url,
            // GMGN Telemetry fields (initially null until enriched)
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
          // Update live market metrics from DexScreener
          const t = this.tokensMap.get(cand.address);
          t.priceUsd = cand.priceUsd;
          t.marketCap = cand.marketCap;
          t.liquidityUsd = cand.liquidityUsd;
          t.volume24h = cand.volume24h;
          t.volume1h = cand.volume1h;
          if (!t.icon && cand.icon) t.icon = cand.icon;
          // Preserve earliest launch timestamp
          if (cand.pairCreatedAt && (!t.pairCreatedAt || cand.pairCreatedAt < t.pairCreatedAt)) {
            t.pairCreatedAt = cand.pairCreatedAt;
          }
          t.ageMs = t.pairCreatedAt ? (Date.now() - t.pairCreatedAt) : cand.ageMs;
          t.ageFormatted = dexscreenerService.formatTimeAgo(t.pairCreatedAt || cand.pairCreatedAt);
          t.url = cand.url || t.url;
        }
      }

      // ── Stage 2: Targeted GMGN & Dev Fund Enrichment ──
      // Pick tokens that need enrichment (enrichedAt is 0 or older than cache TTL)
      const now = Date.now();
      const needEnrichment = Array.from(this.tokensMap.values())
        .filter(t => (now - (t.enrichedAt || 0)) > this.cacheTtlMs)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, this.maxGmgnEnrichmentsPerCycle);

      console.log(`[Token Aggregator] Enriching ${needEnrichment.length} tokens with GMGN Smart/KOL/Dev telemetry...`);

      for (const token of needEnrichment) {
        if (!gmgnKeyPool.isAvailable()) {
          console.warn(`[Token Aggregator] GMGN Key Pool cooldown active (${gmgnKeyPool.getCooldownRemainingSec()}s remaining). Skipping remaining tokens this cycle.`);
          break;
        }

        try {
          // Query GMGN single token info endpoint (dev metadata and timestamps)
          const gmgnRes = await gmgnKeyPool.getTokenInfo(this.chain, token.address);
          const gmgnInfo = gmgnRes?.data || gmgnRes || {};

          // ── Tier 1 Fast-Gating via Token Info (Weight 1) ──
          const tagStats = gmgnInfo?.wallet_tags_stat || {};
          const candidateSmartCount = Number(tagStats.smart_wallets || tagStats.smart_degen || 0);
          const candidateKolCount = Number(tagStats.renowned_wallets || tagStats.kol_wallets || 0);

          let activeKolHolders = [];
          let soldKolHolders = [];
          let activeSmartHolders = [];
          let soldSmartHolders = [];

          // ── Tier 2 Tagged KOL Deep Verification (tag: renowned) ──
          if (candidateKolCount > 0) {
            try {
              const kolRes = await gmgnKeyPool.getTokenTopTraders(this.chain, token.address, { tag: 'renowned' });
              const kolList = kolRes?.list || kolRes?.data?.list || kolRes?.data || [];
              const parsedKol = this.parseHoldersAndSold(kolList, 0.80);
              activeKolHolders = parsedKol.holding;
              soldKolHolders = parsedKol.sold;
            } catch (kolErr) {
              console.warn(`[Token Aggregator] KOL inspection notice for ${token.symbol}:`, kolErr.message);
            }
          }

          // ── Tier 2 Tagged Smart Money Deep Verification (tag: smart_degen) ──
          if (candidateSmartCount > 0) {
            try {
              const smartRes = await gmgnKeyPool.getTokenTopTraders(this.chain, token.address, { tag: 'smart_degen' });
              const smartList = smartRes?.list || smartRes?.data?.list || smartRes?.data || [];
              const parsedSmart = this.parseHoldersAndSold(smartList, 0.80);
              activeSmartHolders = parsedSmart.holding;
              soldSmartHolders = parsedSmart.sold;
            } catch (smartErr) {
              console.warn(`[Token Aggregator] Smart Money inspection notice for ${token.symbol}:`, smartErr.message);
            }
          }

          // ── Tier 3 Dev Funding & On-chain SOL balance (0 GMGN Cost) ──
          const devInfo = gmgnInfo?.dev || {};
          const devFund = await devFundService.resolveDevFund(devInfo, token.address);

          // Update token record with verified active holding and sold counts
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

          // Sync launch age if GMGN has earlier timestamp
          const gmgnTs = (gmgnInfo.open_timestamp || gmgnInfo.creation_timestamp) ? (gmgnInfo.open_timestamp || gmgnInfo.creation_timestamp) * 1000 : null;
          if (gmgnTs && (!token.pairCreatedAt || gmgnTs < token.pairCreatedAt)) {
            token.pairCreatedAt = gmgnTs;
            token.ageMs = Date.now() - gmgnTs;
            token.ageFormatted = dexscreenerService.formatTimeAgo(gmgnTs);
          }

          console.log(`[Token Aggregator] ✓ Enriched $${token.symbol} (${token.address.slice(0, 6)}...): MCap=$${Math.round(token.marketCap).toLocaleString()}, Smart=${activeSmartHolders.length}h/${soldSmartHolders.length}s, KOL=${activeKolHolders.length}h/${soldKolHolders.length}s, Dev=${devFund.fundingDisplay}, SOL=${devFund.devBalanceSol ?? '--'}`);
        } catch (err) {
          console.warn(`[Token Aggregator] Enrichment notice for ${token.symbol}:`, err.message);
          // Mark enriched to prevent hammering failed tokens repeatedly in tight loops
          token.enrichedAt = Date.now() - (this.cacheTtlMs / 2);
        }
      }

      this.lastScanTimestamp = Date.now();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Token Aggregator] Autonomous scan cycle completed in ${elapsed}s. Total tracked: ${this.tokensMap.size} tokens.`);
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

  getEnrichedTokens() {
    const tokens = Array.from(this.tokensMap.values());
    return {
      tokens,
      lastScanTimestamp: this.lastScanTimestamp,
      totalCount: tokens.length,
      isScanning: this.isScanning,
    };
  }
}

export const tokenAggregatorService = new TokenAggregatorService();
