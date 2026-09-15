import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from './components/Header';
import FilterBar, { DEFAULT_FILTERS, isTokenMatchingFilters } from './components/FilterBar';
import TokenTable from './components/TokenTable';
import ToastContainer from './components/ToastContainer';
import { soundFX } from './engine/soundFX';
import { showTokenNotification, initServiceWorker } from './engine/phoneNotification';

export default function App() {
  const [selectedChain, setSelectedChain] = useState('base'); // User directive: default only based tokens
  const [tokens, setTokens] = useState([]);
  const [lastScanTimestamp, setLastScanTimestamp] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [gmgnPool, setGmgnPool] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [soundMuted, setSoundMuted] = useState(soundFX.isMuted());
  const [highlightedAddress, setHighlightedAddress] = useState(null);

  // Anti-Spam Toast Notification Engine
  const [activeToast, setActiveToast] = useState(null);
  const toastQueueRef = useRef([]);
  const alertedHistoryRef = useRef(new Map()); // address -> timestampMs
  const isDisplayingToastRef = useRef(false);
  const knownAddressSetRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  const toastTimerRef = useRef(null);

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
  // 1. Fetch Tokens Loop (every 10 seconds for selected chain)
  // ─────────────────────────────────────────────────────────────
  const fetchTokens = async () => {
    try {
      const res = await fetch(`/api/tokens?chain=${selectedChain}`);
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
    } catch (err) {
      // Backend API momentarily unreachable during startup
    }
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 10000); // 10s polling
    return () => {
      clearInterval(interval);
      clearToastTimer();
    };
  }, [selectedChain]);

  // When switching chain, reset first load seed
  const handleSelectChain = (newChain) => {
    if (newChain !== selectedChain) {
      setSelectedChain(newChain);
      setTokens([]);
      isFirstLoadRef.current = true;
    }
  };

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
    if (filters.mcapPreset !== 'all' || filters.mcapMinSlider > 0) count++;
    if (filters.agePreset !== 'all' || filters.ageMaxHours > 0) count++;
    if (filters.smartPreset !== 'all' || filters.smartMinSlider > 0) count++;
    if (filters.kolPreset !== 'all' || filters.kolMinSlider > 0) count++;
    if (filters.devPreset !== 'all' || (filters.devMinMoneySlider ?? 0) > 0) count++;
    return count;
  }, [filters]);

  // Reset filters helper
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // ─────────────────────────────────────────────────────────────
  // 3. Anti-Spam Filter Match Toast & Phone Notification Engine
  // ─────────────────────────────────────────────────────────────
  const handleIncomingTokens = (freshTokens) => {
    if (!Array.isArray(freshTokens) || freshTokens.length === 0) return;

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

    for (const t of freshTokens) {
      knownAddressSetRef.current.add(t.address);

      if (isTokenMatchingFilters(t, filters)) {
        const lastAlerted = alertedHistoryRef.current.get(t.address) || 0;
        if (now - lastAlerted > DEDUP_COOLDOWN_MS) {
          alertedHistoryRef.current.set(t.address, now);

          // 1. In-app toast popup
          toastQueueRef.current.push({
            token: t,
            title: `New Match: $${t.symbol}`,
            message: `MCap: $${Math.round(t.marketCap || 0).toLocaleString()} | Smart: ${t.smartMoneyCount ?? 0} holding`,
          });

          // 2. User directive: Phone Chrome notification popup
          showTokenNotification(t, `🐾 Meme Cat Alert: $${t.symbol}`).catch(() => {});
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
    soundFX.playAlertChime();

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
      
      {/* 1. Header with Network Selector (Base default), Live Ticker, Phone Alerts & Mute */}
      <Header
        lastScanTimestamp={lastScanTimestamp}
        isScanning={isScanning}
        totalTokens={tokens.length}
        filteredCount={filteredTokens.length}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        gmgnPool={gmgnPool}
        selectedChain={selectedChain}
        onSelectChain={handleSelectChain}
      />

      {/* 2. Main Content Container (Mobile-friendly max width & padding) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">
        
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
          selectedChain={selectedChain}
        />

      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Meme Cat Discovery Radar • 100% On-Chain &amp; Official GMGN Telemetry</span>
          <span className="font-mono text-[11px] text-slate-400">Ban-Proof Multi-Chain Engine • 2000ms Pacing Shield</span>
        </div>
      </footer>

      {/* 4. Anti-Spam Corner Toast Container */}
      <ToastContainer
        activeToast={activeToast}
        onDismiss={handleDismissToast}
        onView={handleViewToken}
      />

    </div>
  );
}
