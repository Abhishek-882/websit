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
            smartHolders: [],
            kolCount: null,
            kolHolders: [],
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
          t.ageMs = cand.ageMs;
          t.ageFormatted = cand.ageFormatted;
          t.url = cand.url;
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
          const candidateSmartCount = Number(tagStats.smart_wallets || 0);
          const candidateKolCount = Number(tagStats.renowned_wallets || 0);

          let activeSmartHolders = [];
          let activeKolHolders = [];

          // ── Tier 2 Conditional Deep Verification (Weight 5) ──
          // Only query top traders if GMGN detected candidate smart or KOL wallets
          if (candidateSmartCount > 0 || candidateKolCount > 0) {
            try {
              const tradersRes = await gmgnKeyPool.getTokenTopTraders(this.chain, token.address, { limit: 50 });
              const traderList = Array.isArray(tradersRes?.list)
                ? tradersRes.list
                : (Array.isArray(tradersRes?.data?.list)
                  ? tradersRes.data.list
                  : (Array.isArray(tradersRes?.data) ? tradersRes.data : []));

              for (const tr of traderList) {
                const usdVal = Number(tr.usd_value || 0);
                const sellPct = Number(tr.sell_amount_percentage || 0);

                // STRICT USER DIRECTIVE: MUST BE CURRENTLY HOLDING WITH >= $50 USD value, EXCLUDE SOLD OUT
                if (usdVal < 50 || sellPct >= 0.99) continue;

                const tags = Array.isArray(tr.tags) ? tr.tags.map(t => String(t).toLowerCase()) : [];
                const singleTag = String(tr.tag || '').toLowerCase();
                const makerTags = Array.isArray(tr.maker_token_tags) ? tr.maker_token_tags.map(t => String(t).toLowerCase()) : [];
                const allTags = [...tags, ...makerTags, singleTag];

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
            } catch (tradersErr) {
              console.warn(`[Token Aggregator] Top traders inspection notice for ${token.symbol}:`, tradersErr.message);
            }
          } else {
            // Fast-gate engaged: GMGN confirms 0 smart and 0 renowned wallets touched this token.
            // Weight 5 call safely avoided!
          }

          // ── Tier 3 Dev Funding & On-chain SOL balance (0 GMGN Cost) ──
          const devInfo = gmgnInfo?.dev || {};
          const devFund = await devFundService.resolveDevFund(devInfo, token.address);

          // Update token record with verified active holding counts
          token.smartMoneyCount = activeSmartHolders.length;
          token.smartHolders = activeSmartHolders;
          token.kolCount = activeKolHolders.length;
          token.kolHolders = activeKolHolders;
          token.devFund = devFund;
          token.enrichedAt = Date.now();

          // Sync launch age if GMGN has earlier timestamp
          const gmgnTs = (gmgnInfo.open_timestamp || gmgnInfo.creation_timestamp) ? (gmgnInfo.open_timestamp || gmgnInfo.creation_timestamp) * 1000 : null;
          if (gmgnTs && (!token.pairCreatedAt || gmgnTs < token.pairCreatedAt)) {
            token.pairCreatedAt = gmgnTs;
            token.ageMs = Date.now() - gmgnTs;
            token.ageFormatted = dexscreenerService.formatTimeAgo(gmgnTs);
          }

          console.log(`[Token Aggregator] ✓ Enriched $${token.symbol} (${token.address.slice(0, 6)}...): MCap=$${Math.round(token.marketCap).toLocaleString()}, Smart=${activeSmartHolders.length} holding (>= $50), KOL=${activeKolHolders.length} holding (>= $50), Dev=${devFund.fundingDisplay}, SOL=${devFund.devBalanceSol ?? '--'}`);
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
