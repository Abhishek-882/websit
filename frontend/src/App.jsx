import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from './components/Header';
import FilterBar, { DEFAULT_FILTERS, isTokenMatchingFilters, hasActiveFilterCriteria } from './components/FilterBar';
import TokenTable from './components/TokenTable';
import ToastContainer from './components/ToastContainer';
import BotControlsModal from './components/BotControlsModal';
import TradesModal from './components/TradesModal';
import { useBotStore } from './stores/botStore';
import { botApi } from './api/botClient';
import { soundFX } from './engine/soundFX';
import { showTokenNotification, initServiceWorker } from './engine/phoneNotification';
import {
  IconRadar,
  IconTarget,
  IconBot,
  IconOrders,
  IconDownload,
  IconVolume,
  IconVolumeX,
} from './components/Icons';

const STORAGE_KEY_FILTERS = 'solana_radar_filters';

function loadSavedFilters() {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch (e) {
    console.warn('[Solana Radar] Error loading saved filters:', e);
  }
  return DEFAULT_FILTERS;
}

export default function App() {
  const [tokens, setTokens] = useState([]);
  const [lastScanTimestamp, setLastScanTimestamp] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [gmgnPool, setGmgnPool] = useState(null);
  const [filters, setFilters] = useState(loadSavedFilters);
  const [soundMuted, setSoundMuted] = useState(soundFX.isMuted());
  const [highlightedAddress, setHighlightedAddress] = useState(null);

  // Synchronize ref and localStorage with current filters
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
    try {
      localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filters));
    } catch (e) {
      console.warn('[Solana Radar] Error saving filters:', e);
    }
  }, [filters]);

  // Trading Bot store & modal state
  const isBotModalOpen = useBotStore(s => s.isBotModalOpen);
  const setIsBotModalOpen = useBotStore(s => s.setIsBotModalOpen);
  const isTradesModalOpen = useBotStore(s => s.isTradesModalOpen);
  const setIsTradesModalOpen = useBotStore(s => s.setIsTradesModalOpen);
  const trades = useBotStore(s => s.trades);
  const setTrades = useBotStore(s => s.setTrades);
  const connectedWallet = useBotStore(s => s.connectedWallet);
  const sessionBalance = useBotStore(s => s.sessionBalanceSol);
  const botConfig = useBotStore(s => s.botConfig);

  // Anti-Spam Toast Notification Engine
  const [activeToast, setActiveToast] = useState(null);
  const toastQueueRef = useRef([]);
  const alertedHistoryRef = useRef(new Map()); // address -> timestampMs
  const isDisplayingToastRef = useRef(false);
  const knownAddressSetRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  const toastTimerRef = useRef(null);

  // PWA Home Screen Installation State
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  };

  // Initialize service worker on app startup for phone notifications
  useEffect(() => {
    initServiceWorker().catch(() => {});
  }, []);

  const clearToastTimer = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  // Toggle audio chime mute
  const handleToggleSound = () => {
    const nextMuted = soundFX.toggleMute();
    setSoundMuted(nextMuted);
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Fetch Tokens Loop (Strictly Solana, every 3.5s ultra-low latency)
  // ─────────────────────────────────────────────────────────────
  const fetchTokens = async () => {
    try {
      const res = await fetch('/api/tokens?chain=sol');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.tokens)) {
        setTokens(data.tokens);
        setLastScanTimestamp(data.lastScanTimestamp);
        setIsScanning(Boolean(data.isScanning));
        setGmgnPool(data.gmgnPool);

        // Process newly seen tokens for filter-match toast alerts
        handleIncomingTokens(data.tokens);
      }
    } catch {
      // Backend API momentarily unreachable during startup
    }
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 3500); // 3.5s ultra-low latency GMGN sync
    return () => {
      clearInterval(interval);
      clearToastTimer();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 2. Client-Side Instant In-Memory Filter Engine (<1ms, 0 API)
  // ─────────────────────────────────────────────────────────────
  const filteredTokens = useMemo(() => {
    const sellThresholdDecimal = (filters.sellThreshold ?? 80) / 100;

    return tokens.map(token => {
      const allKols = [...(token.kolHolders || []), ...(token.kolSold || [])];
      const kolMap = new Map();
      for (const k of allKols) {
        if (k?.address && !kolMap.has(k.address)) kolMap.set(k.address, k);
      }
      const uniqueKols = Array.from(kolMap.values());
      const activeKols = uniqueKols.filter(k => (k.usdValue >= 50 || k.balance > 0) && (k.sellPercentage < sellThresholdDecimal));
      const soldKols = uniqueKols.filter(k => (k.sellPercentage >= sellThresholdDecimal || k.balance === 0 || k.usdValue < 50));

      const allSmarts = [...(token.smartHolders || []), ...(token.smartSold || [])];
      const smartMap = new Map();
      for (const s of allSmarts) {
        if (s?.address && !smartMap.has(s.address)) smartMap.set(s.address, s);
      }
      const uniqueSmarts = Array.from(smartMap.values());
      const activeSmarts = uniqueSmarts.filter(s => (s.usdValue >= 50 || s.balance > 0) && (s.sellPercentage < sellThresholdDecimal));
      const soldSmarts = uniqueSmarts.filter(s => (s.sellPercentage >= sellThresholdDecimal || s.balance === 0 || s.usdValue < 50));

      return {
        ...token,
        kolCount: uniqueKols.length > 0 ? activeKols.length : (token.kolCount ?? 0),
        kolSoldCount: uniqueKols.length > 0 ? soldKols.length : (token.kolSoldCount ?? 0),
        kolHolders: uniqueKols.length > 0 ? activeKols : token.kolHolders,
        kolSold: uniqueKols.length > 0 ? soldKols : token.kolSold,
        smartMoneyCount: uniqueSmarts.length > 0 ? activeSmarts.length : (token.smartMoneyCount ?? 0),
        smartMoneySoldCount: uniqueSmarts.length > 0 ? soldSmarts.length : (token.smartMoneySoldCount ?? 0),
        smartHolders: uniqueSmarts.length > 0 ? activeSmarts : token.smartHolders,
        smartSold: uniqueSmarts.length > 0 ? soldSmarts : token.smartSold,
      };
    }).filter(token => isTokenMatchingFilters(token, filters));
  }, [tokens, filters]);

  // Calculate active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.mcapPreset !== 'all' || filters.mcapMinSlider > 0 || filters.mcapMin || filters.mcapMax) count++;
    if (filters.agePreset !== 'all' || filters.ageMaxHours > 0) count++;
    if (filters.smartPreset !== 'all' || filters.smartMinSlider > 0) count++;
    if (filters.kolPreset !== 'all' || filters.kolMinSlider > 0) count++;
    if (filters.devPreset !== 'all' || (filters.devMinMoneySliderUsd ?? 0) > 0 || (filters.devMinMoneySlider ?? 0) > 0) count++;
    if (filters.search && filters.search.trim() !== '') count++;
    return count;
  }, [filters]);

  // Reset filters helper
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    try {
      localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(DEFAULT_FILTERS));
    } catch (e) {
      console.warn('[Solana Radar] Error resetting saved filters:', e);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 3. Quick Buy via Bot Execution
  // ─────────────────────────────────────────────────────────────
  const handleQuickBuy = async (token) => {
    if (!connectedWallet) {
      alert('Please connect your Phantom / Solflare wallet first.');
      return;
    }
    if (sessionBalance <= 0) {
      alert('Your autonomous session wallet has 0 SOL balance. Please top up your session wallet to pace trades.');
      setIsBotModalOpen(true);
      return;
    }
    const buyAmt = botConfig.buyAmountSol || 0.1;
    if (!confirm(`Execute autonomous purchase of ${buyAmt} SOL for $${token.symbol} (${token.name}) via Jupiter DEX?`)) {
      return;
    }
    try {
      const res = await botApi.manualBuy({
        userWallet: connectedWallet,
        tokenAddress: token.address,
        coinName: token.name,
        coinSymbol: token.symbol,
        amountSol: buyAmt,
        slippageBps: botConfig.slippageBps || 500,
      });
      if (res.success) {
        alert(`Buy order landed! Tx: ${res.txSignature?.slice(0, 8)}...`);
        // Refresh trades
        const tradesRes = await botApi.getTrades(connectedWallet);
        if (Array.isArray(tradesRes.trades)) setTrades(tradesRes.trades);
      } else {
        alert(`Buy failed: ${res.error}`);
      }
    } catch (err) {
      alert(`Buy failed: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 4. Anti-Spam Filter Match Toast & Phone Notification Engine
  // ─────────────────────────────────────────────────────────────
  const handleIncomingTokens = (freshTokens) => {
    if (!Array.isArray(freshTokens) || freshTokens.length === 0) return;

    const currentFilters = filtersRef.current || filters;
    const hasActiveFilters = hasActiveFilterCriteria(currentFilters);

    const now = Date.now();
    const DEDUP_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per token

    if (isFirstLoadRef.current) {
      freshTokens.forEach(t => {
        knownAddressSetRef.current.add(t.address);
        alertedHistoryRef.current.set(t.address, now);
      });
      isFirstLoadRef.current = false;
      return;
    }

    // STRICT USER DIRECTIVE:
    // Sound & notifications must NOT fire for every new coin!
    // When no active filters are set (idle mode), do not spam notifications or sounds.
    if (!hasActiveFilters) {
      freshTokens.forEach(t => {
        knownAddressSetRef.current.add(t.address);
      });
      return;
    }

    for (const t of freshTokens) {
      knownAddressSetRef.current.add(t.address);

      // Evaluate token strictly against user's active filter settings
      if (isTokenMatchingFilters(t, currentFilters)) {
        const lastAlerted = alertedHistoryRef.current.get(t.address) || 0;
        if (now - lastAlerted > DEDUP_COOLDOWN_MS) {
          alertedHistoryRef.current.set(t.address, now);

          // 1. In-app toast popup (ONLY for qualified filter matches)
          toastQueueRef.current.push({
            token: t,
            title: `Signal Match: $${t.symbol}`,
            message: `MCap: $${Math.round(t.marketCap || 0).toLocaleString()} | Smart: ${t.smartMoneyCount ?? 0} holding`,
          });

          // 2. User directive: Phone Chrome notification popup
          showTokenNotification(t, `Signal Alert: $${t.symbol}`).catch(() => {});
        }
      }
    }

    processToastQueue();
  };

  const processToastQueue = () => {
    if (isDisplayingToastRef.current || toastQueueRef.current.length === 0) return;

    const next = toastQueueRef.current.shift();
    if (!next) return;

    isDisplayingToastRef.current = true;
    setActiveToast(next);

    // Sound alert only fires for qualified filter matches and respects mute setting
    if (hasActiveFilterCriteria(filtersRef.current)) {
      soundFX.playAlertChime();
    }

    clearToastTimer();
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
      isDisplayingToastRef.current = false;
      toastTimerRef.current = setTimeout(() => processToastQueue(), 500);
    }, 8000);
  };

  const handleDismissToast = () => {
    clearToastTimer();
    setActiveToast(null);
    isDisplayingToastRef.current = false;
    setTimeout(() => processToastQueue(), 300);
  };

  const handleViewToken = (address) => {
    setHighlightedAddress(address);
    handleDismissToast();
    setTimeout(() => setHighlightedAddress(null), 4000);
  };

  return (
    <div className="min-h-screen bg-[#080b12] text-slate-100 flex flex-col font-sans">
      
      {/* 1. Header with Solana Lock, Live Ticker, Phone Alerts, Bot & Trades Modals */}
      <Header
        lastScanTimestamp={lastScanTimestamp}
        isScanning={isScanning}
        totalTokens={tokens.length}
        filteredCount={filteredTokens.length}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        gmgnPool={gmgnPool}
        canInstall={Boolean(installPrompt) && !isInstalled}
        onInstallApp={handleInstallApp}
        onOpenBotModal={() => setIsBotModalOpen(true)}
        onOpenTradesModal={() => setIsTradesModalOpen(true)}
        tradesCount={trades.length}
      />

      {/* 2. Main Content Container (Mobile-friendly max width & padding) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-16 md:pb-6">
        
        {/* Filter Panel */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          onReset={handleResetFilters}
          activeFilterCount={activeFilterCount}
        />

        {/* 5-Metric Token Table & Mobile Cards */}
        <TokenTable
          tokens={filteredTokens}
          isScanning={isScanning}
          totalTokensCount={tokens.length}
          highlightedAddress={highlightedAddress}
          onResetFilters={handleResetFilters}
          selectedChain="sol"
          onQuickBuy={handleQuickBuy}
        />

      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-4 text-center text-xs text-slate-400 mb-12 md:mb-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Solana Token Radar Pro • 100% On-Chain &amp; Official GMGN Telemetry</span>
          <span className="font-mono text-[11px] text-slate-400">Solana Autonomous Trading Bot • Jupiter v6 &amp; Jito MEV</span>
        </div>
      </footer>

      {/* 4. Mobile Native Floating Bottom Dock (md:hidden) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a0e18]/95 backdrop-blur-lg border-t border-slate-800/90 px-4 py-2 flex items-center justify-around shadow-2xl safe-area-bottom">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex flex-col items-center gap-0.5 text-cyan-400 hover:text-white transition-colors"
        >
          <IconRadar className="w-5 h-5" />
          <span className="text-[10px] font-bold">Radar</span>
        </button>

        <button
          onClick={() => {
            const el = document.querySelector('button[title*="Filter"]') || document.querySelector('main');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex flex-col items-center gap-0.5 text-slate-300 hover:text-white transition-colors"
        >
          <IconTarget className="w-5 h-5" />
          <span className="text-[10px] font-bold">Filters ({activeFilterCount})</span>
        </button>

        <button
          onClick={() => setIsBotModalOpen(true)}
          className="flex flex-col items-center gap-0.5 text-purple-400 hover:text-purple-300 transition-colors"
        >
          <IconBot className="w-5 h-5" />
          <span className="text-[10px] font-bold">Bot</span>
        </button>

        <button
          onClick={() => setIsTradesModalOpen(true)}
          className="flex flex-col items-center gap-0.5 text-emerald-400 hover:text-emerald-300 transition-colors relative"
        >
          <IconOrders className="w-5 h-5" />
          <span className="text-[10px] font-bold">Trades</span>
          {trades.length > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
              {trades.length}
            </span>
          )}
        </button>

        {Boolean(installPrompt) && !isInstalled && (
          <button
            onClick={handleInstallApp}
            className="flex flex-col items-center gap-0.5 text-rose-400 hover:text-rose-300 font-bold transition-colors animate-pulse"
          >
            <IconDownload className="w-5 h-5" />
            <span className="text-[10px] font-black">Install</span>
          </button>
        )}

        <button
          onClick={handleToggleSound}
          className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-white transition-colors"
        >
          {soundMuted ? <IconVolumeX className="w-5 h-5" /> : <IconVolume className="w-5 h-5" />}
          <span className="text-[10px] font-bold">{soundMuted ? 'Muted' : 'Chime'}</span>
        </button>
      </div>

      {/* 5. Anti-Spam Corner Toast Container */}
      <ToastContainer
        activeToast={activeToast}
        onDismiss={handleDismissToast}
        onView={handleViewToken}
      />

      {/* 6. Trading Bot Controls Modal */}
      <BotControlsModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
      />

      {/* 7. Positions & Trades Modal */}
      <TradesModal
        isOpen={isTradesModalOpen}
        onClose={() => setIsTradesModalOpen(false)}
      />

    </div>
  );
}
