import { dexscreenerService } from './dexscreener.service.js';
import { gmgnKeyPool } from './gmgnKeyPool.service.js';
import { devFundService } from './devFund.service.js';
import { getAllActiveSessions, createLimitOrder, getPendingLimitOrders, hasPendingLimitOrder, fillLimitOrder, getActiveSetFile, isBoughtRecently, addBoughtToken, getTrades } from '../db/database.js';
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
    this.maxGmgnEnrichmentsPerCycle = 8; // Safely paced throughput across 5 keys
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

    // 3. Start sustainable 12s GMGN market cap & price fast ticker
    this.startFastTicker();
  }

  startFastTicker() {
    if (this.fastTickerTimer) return;
    console.log(`[Token Aggregator] ⚡ Sustainable 12s GMGN Solana market cap ticker active.`);
    
    this.fastTickerTimer = setInterval(async () => {
      try {
        if (!gmgnKeyPool.isAvailable()) return;
        await this.syncFastTicker();
      } catch (err) {
        // Ticker pass-through
      }
    }, 12000);
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

      // Check pending Fibonacci Limit Orders & Advanced TP/SL positions
      await this.checkPendingLimitOrders();
      await tradingService.checkPositionsAgainstStrategy(this.tokensMap);
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

      // Proactively resolve on-chain dev funds for discovered tokens in parallel (zero GMGN rate-limit risk)
      const tokensNeedingDevFund = Array.from(this.tokensMap.values())
        .filter(t => !t.devFund)
        .slice(0, 10);

      if (tokensNeedingDevFund.length > 0) {
        Promise.all(tokensNeedingDevFund.map(async (token) => {
          try {
            const devFund = await devFundService.resolveDevFund({}, token.address, this.solPriceUsd);
            if (devFund) token.devFund = devFund;
          } catch {}
        })).catch(() => {});
      }

      // Stage 2: Targeted GMGN & Dev Fund Enrichment
      const now = Date.now();
      const needEnrichment = Array.from(this.tokensMap.values())
        .filter(t => (now - (t.enrichedAt || 0)) > this.cacheTtlMs)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, this.maxGmgnEnrichmentsPerCycle);

      console.log(`[Token Aggregator] Enriching ${needEnrichment.length} SOL tokens with GMGN telemetry & on-chain dev funds...`);

      for (const token of needEnrichment) {
        if (!gmgnKeyPool.isAvailable()) {
          console.warn(`[Token Aggregator] GMGN Key Pool cooldown active (${gmgnKeyPool.getCooldownRemainingSec()}s). Maintaining on-chain telemetry for $${token.symbol}.`);
          try {
            if (!token.devFund) {
              const devFund = await devFundService.resolveDevFund({}, token.address, this.solPriceUsd);
              token.devFund = devFund;
            }
            if (token.smartMoneyCount === null) token.smartMoneyCount = 0;
            if (token.kolCount === null) token.kolCount = 0;
            token.enrichedAt = Date.now();
          } catch {}
          continue;
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

          // Fast-gated top traders queries (only if candidates actually exist)
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
          console.warn(`[Token Aggregator] Enrichment notice for $${token.symbol}:`, enrichErr.message);
          try {
            if (!token.devFund) {
              const devFund = await devFundService.resolveDevFund({}, token.address, this.solPriceUsd);
              token.devFund = devFund;
            }
            if (token.smartMoneyCount === null) token.smartMoneyCount = 0;
            if (token.kolCount === null) token.kolCount = 0;
            token.enrichedAt = Date.now();
          } catch {}
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
    if (!token.marketCap || token.marketCap <= 0) {
      console.warn('[AutoBuy] BLOCKED: No valid market cap for', token.symbol);
      return;
    }
    if (!token.priceUsd || token.priceUsd <= 0) {
      console.warn('[AutoBuy] BLOCKED: No valid price for', token.symbol);
      return;
    }
    if (!token.devFund || token.devFund.error) {
      console.warn('[AutoBuy] BLOCKED: Dev fund check failed for', token.symbol);
      return;
    }
    if (!token.enrichedAt) {
      console.warn('[AutoBuy] BLOCKED: Token not fully enriched', token.symbol);
      return;
    }

    try {
      const activeSessions = await getAllActiveSessions();
      if (!Array.isArray(activeSessions) || activeSessions.length === 0) return;

      for (const session of activeSessions) {
        // Load active set file from DB (not session.bot_config)
        const activeSetFile = await getActiveSetFile(session.user_wallet);
        if (!activeSetFile) continue;

        const filters = activeSetFile.buyFilters || {};
        const tradeCfg = activeSetFile.tradeConfig || {};
        
        // Normalized trade parameters (supports both nested tradeConfig and flat properties)
        const buyAmount = Number(tradeCfg.buyAmountSol || activeSetFile.tradeSizeSol || 0.1);
        const slippageBps = Number(tradeCfg.slippageBps || activeSetFile.slippageBps || 500);
        const useJito = tradeCfg.useJito ?? true;
        const orderType = tradeCfg.orderType || 'market';
        const limitDipPct = Math.abs(Number(tradeCfg.limitDipPct || 20));

        // Normalized re-entry cooldown (default 7 days)
        const reentryEnabled = activeSetFile.reentryRule ? activeSetFile.reentryRule.enabled !== false : (activeSetFile.reentry ? (activeSetFile.reentry.enabled ?? true) : true);
        const reentryDays = Number(activeSetFile.reentryRule?.noReentryDays || activeSetFile.reentry?.cooldownDays || 7);

        // Normalized DCA configuration
        const isDcaEnabled = Boolean(tradeCfg.isDca || activeSetFile.dcaConfig?.enabled || activeSetFile.dca?.enabled);
        let dcaDipLevels = [];
        if (Array.isArray(activeSetFile.dcaConfig?.dipLevels) && activeSetFile.dcaConfig.dipLevels.length > 0) {
          dcaDipLevels = activeSetFile.dcaConfig.dipLevels;
        } else if (activeSetFile.dca?.enabled) {
          dcaDipLevels = [
            { part: 1, dipPct: 0, amountSol: buyAmount },
            { part: 2, dipPct: Math.abs(Number(activeSetFile.dca.part2DipPct || 10)), amountSol: buyAmount },
            { part: 3, dipPct: Math.abs(Number(activeSetFile.dca.part3DipPct || 20)), amountSol: buyAmount },
          ];
        }

        // ── CRITICAL SAFETY GUARDS ─────────────────────────────────────────
        // NEVER buy if any required data fetch failed or is missing.
        // This is a money-safety measure: don't buy what you can't verify.
        if (!token.marketCap || token.marketCap <= 0) {
          console.warn(`[AutoBuy] BLOCKED: No valid market cap for ${token.symbol} (${token.address?.slice(0, 8)})`);
          continue;
        }
        if (!token.priceUsd || token.priceUsd <= 0) {
          console.warn(`[AutoBuy] BLOCKED: No valid price for ${token.symbol} (${token.address?.slice(0, 8)})`);
          continue;
        }
        if (!token.devFund || token.devFund.error) {
          console.warn(`[AutoBuy] BLOCKED: Dev fund check failed/missing for ${token.symbol} (${token.address?.slice(0, 8)})`);
          continue;
        }
        if (!token.enrichedAt) {
          console.warn(`[AutoBuy] BLOCKED: Token not fully enriched ${token.symbol} (${token.address?.slice(0, 8)})`);
          continue;
        }
        // ── END SAFETY GUARDS ──────────────────────────────────────────────

        // Verify criteria against setFile.buyFilters
        const mcap = token.marketCap || 0;
        const smart = token.smartMoneyCount ?? 0;
        const kol = token.kolCount ?? 0;
        const devMoneyUsd = token.devFund?.devBalanceUsd ?? 0;

        if (filters.mcapMin && mcap < filters.mcapMin) continue;
        if (filters.mcapMax && mcap > filters.mcapMax) continue;
        if (filters.smartMin && smart < filters.smartMin) continue;
        if (filters.kolMin && kol < filters.kolMin) continue;
        if (filters.devNetWorthMinUsd && devMoneyUsd < filters.devNetWorthMinUsd) continue;

        // Age filter (Min and Max in minutes, with legacy ageMaxHours fallback)
        const minAgeMinutes = Number(filters.ageMinMinutes || 0);
        const maxAgeMinutes = Number(
          filters.ageMaxMinutes !== undefined && filters.ageMaxMinutes !== null && filters.ageMaxMinutes !== ''
            ? filters.ageMaxMinutes
            : (filters.ageMaxHours ? Number(filters.ageMaxHours) * 60 : 0)
        );

        if (token.ageMs != null) {
          const tokenAgeMinutes = token.ageMs / (60 * 1000);
          if (minAgeMinutes > 0 && tokenAgeMinutes < minAgeMinutes) {
            continue; // Token is younger than minimum required age
          }
          if (maxAgeMinutes > 0 && tokenAgeMinutes > maxAgeMinutes) {
            continue; // Token is older than maximum allowed age
          }
        } else if (minAgeMinutes > 0 || maxAgeMinutes > 0) {
          // If token age is unverified and an age filter is enforced, block for safety
          continue;
        }

        // Dev checks
        if (filters.devMustBeCex && !token.devFund?.isCexFunded) continue;
        if (filters.devMustHold && (token.devFund?.devStatus !== 'Holding' || token.devFund?.isDumped)) continue;
        if (filters.devMaxHoldingPct > 0 && (token.devFund?.devHoldingPct || 0) > filters.devMaxHoldingPct) continue;
        if (filters.devMustNotHold && token.devFund?.devStatus !== 'Dumped 100%' && token.devFund?.devStatus !== 'CTO') continue;

        // Check isBoughtRecently for no-re-entry cooldown
        if (reentryEnabled) {
          const isRecent = await isBoughtRecently(session.user_wallet, token.address, reentryDays);
          if (isRecent) continue; // Skip, cooldown active
        }

        // ── MAX POSITIONS GUARD ────────────────────────────────────────────
        const maxPositions = Number(tradeCfg.maxPositions || activeSetFile.maxPositions || 0);
        if (maxPositions > 0) {
          const openTrades = await getTrades(session.user_wallet);
          const openCount = openTrades.filter(t => t.status === 'open').length;
          if (openCount >= maxPositions) {
            console.warn(`[AutoBuy] BLOCKED: Max positions (${maxPositions}) reached for wallet ${session.user_wallet.slice(0, 8)}...`);
            continue;
          }
        }
        // ── END MAX POSITIONS GUARD ────────────────────────────────────────

        console.log(`[BOT] 🎯 Set File "${activeSetFile.name}" matched for $${token.symbol} by wallet ${session.user_wallet.slice(0, 8)}...`);

        // Track the bought token to enforce cooldown
        await addBoughtToken(session.user_wallet, token.address);

        if (isDcaEnabled && dcaDipLevels.length > 0) {
          // DCA Part 1 immediate execution
          const part1 = dcaDipLevels.find(d => d.part === 1);
          if (part1) {
            tradingService.autoBuy({
              userWallet: session.user_wallet,
              tokenAddress: token.address,
              coinName: token.name,
              coinSymbol: token.symbol,
              amountSol: Number(part1.amountSol || buyAmount),
              slippageBps,
              useJito,
            }).catch(err => {
              console.warn(`[BOT] DCA Part 1 execution notice for $${token.symbol}:`, err.message);
            });
          }
          
          // DCA Parts 2+ as pending limit orders
          for (const part of dcaDipLevels) {
            if (part.part === 1) continue;
            const spotPct = Math.abs(Number(part.dipPct || 0));
            if (spotPct <= 0) continue;
            
            const targetPriceUsd = (token.priceUsd || 0.001) * (1 - spotPct / 100);
            await createLimitOrder({
              userWallet: session.user_wallet,
              tokenAddress: token.address,
              coinName: token.name,
              coinSymbol: token.symbol,
              entryPriceUsd: token.priceUsd,
              targetPriceUsd,
              limitDipPct: spotPct,
              amountSol: Number(part.amountSol || buyAmount),
              slippageBps,
              useJito,
              strategyRules: tradeCfg.strategyRules || [],
              closingType: tradeCfg.closingType || 'amount',
              isDca: true,
              dcaPart: part.part
            });
            console.log(`[BOT] 📉 DCA Part ${part.part} pending order set for $${token.symbol} at -${spotPct}% ($${targetPriceUsd.toFixed(6)})`);
          }
        } else {
          // Standard Buy
          if (orderType === 'limit') {
            const targetPriceUsd = (token.priceUsd || 0.001) * (1 - limitDipPct / 100);

            await createLimitOrder({
              userWallet: session.user_wallet,
              tokenAddress: token.address,
              coinName: token.name,
              coinSymbol: token.symbol,
              entryPriceUsd: token.priceUsd,
              targetPriceUsd,
              limitDipPct,
              amountSol: buyAmount,
              slippageBps,
              useJito,
              strategyRules: tradeCfg.strategyRules || [],
              closingType: tradeCfg.closingType || 'amount',
            });
            console.log(`[BOT] 📉 Limit Order set for $${token.symbol} at -${limitDipPct}%`);
          } else {
            // Immediate Market Buy
            tradingService.autoBuy({
              userWallet: session.user_wallet,
              tokenAddress: token.address,
              coinName: token.name,
              coinSymbol: token.symbol,
              amountSol: buyAmount,
              slippageBps,
              useJito,
            }).catch(err => {
              console.warn(`[BOT] Auto-buy execution notice for $${token.symbol}:`, err.message);
            });
          }
        }
      }
    } catch (err) {
      // Pass-through
    }
  }

  async checkPendingLimitOrders() {
    try {
      const pendingOrders = await getPendingLimitOrders();
      if (!Array.isArray(pendingOrders) || pendingOrders.length === 0) return;

      for (const order of pendingOrders) {
        const token = this.tokensMap.get(order.tokenAddress);
        if (!token) continue;

        if (!token.priceUsd || token.priceUsd <= 0) {
          console.warn('[AutoBuy] BLOCKED: No valid price for pending limit order', order.coinSymbol);
          continue;
        }

        if (token.priceUsd <= order.targetPriceUsd) {
          console.log(`[BOT] 🎯 Fibonacci Retracement Hit for $${order.coinSymbol}! Target: $${order.targetPriceUsd.toFixed(6)}, Live: $${token.priceUsd.toFixed(6)}. Executing Limit Buy!`);
          try {
            await tradingService.autoBuy({
              userWallet: order.userWallet,
              tokenAddress: order.tokenAddress,
              coinName: order.coinName,
              coinSymbol: order.coinSymbol,
              amountSol: order.amountSol,
              slippageBps: order.slippageBps,
              useJito: order.useJito,
            });
            await fillLimitOrder(order.id, { filled_price_usd: token.priceUsd });
          } catch (buyErr) {
            console.warn(`[BOT] Limit order execution notice for $${order.coinSymbol}:`, buyErr.message);
          }
        }
      }
    } catch (err) {
      // Ignore
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

  parseHoldersAndSold(traderList, sellThreshold = 0.99) {
    const holding = [];
    const sold = [];

    if (!Array.isArray(traderList)) return { holding, sold };

    for (const tr of traderList) {
      const usdVal = Number(tr.usd_value || tr.balance_usd || 0);
      const balance = Number(tr.balance || tr.amount_cur || 0);
      const sellPct = Number(tr.sell_amount_percentage || 0);
      const boughtUsd = Number(tr.total_cost || tr.buy_volume_cur || tr.cost_cur || tr.history_bought_cost || 0);
      const buyTxCount = Number(tr.buy_tx_count_cur || tr.buy_tx_count || tr.tx_count || 0);
      const hasBought = (boughtUsd > 0 || buyTxCount > 0 || Number(tr.history_bought_amount || 0) > 0);

      // STRICT USER CRITERIA:
      // 1. Must have actually bought the token with real capital (bought > 0, NOT brought by 0)
      // 2. Must CURRENTLY hold token worth >= $50 USD
      // 3. Must not have dumped 100% (sellPct < 0.99)
      const isHolding = usdVal >= 50 && hasBought && sellPct < sellThreshold;

      const item = {
        address: tr.address || tr.wallet_address,
        name: tr.name || null,
        twitterUsername: tr.twitter_username || null,
        avatar: tr.avatar || null,
        usdValue: Math.round(usdVal * 100) / 100,
        boughtUsd: Math.round(boughtUsd * 100) / 100,
        buyTxCount,
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

      const usdVal = Number(t.usd_value || t.usdValue || t.balance_usd || 0);
      const boughtUsd = Number(t.total_cost || t.buy_volume_cur || t.cost_cur || t.boughtUsd || t.history_bought_cost || 0);
      const buyTx = Number(t.buy_tx_count_cur || t.buy_tx_count || t.buyTxCount || t.tx_count || 0);
      const hasBought = (boughtUsd > 0 || buyTx > 0 || Number(t.history_bought_amount || 0) > 0);
      const sellPct = Number(t.sell_amount_percentage ?? t.sellPercentage ?? 0);

      // Must be currently holding with >= $50 USD value, have actually bought with > $0, and not dumped
      const isActiveHolder = usdVal >= 50 && sellPct < 0.99 && hasBought;

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
