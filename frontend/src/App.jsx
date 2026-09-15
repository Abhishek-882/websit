import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from './components/Header';
import FilterBar, { DEFAULT_FILTERS } from './components/FilterBar';
import TokenTable from './components/TokenTable';
import ToastContainer from './components/ToastContainer';
import { soundFX } from './engine/soundFX';

export default function App() {
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

  // Toggle audio chime mute
  const handleToggleSound = () => {
    const nextMuted = soundFX.toggleMute();
    setSoundMuted(nextMuted);
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Fetch Tokens Loop (every 10 seconds)
  // ─────────────────────────────────────────────────────────────
  const fetchTokens = async () => {
    try {
      const res = await fetch('/api/tokens');
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
    return () => clearInterval(interval);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 2. Client-Side Instant In-Memory Filter Engine (<1ms, 0 API)
  // ─────────────────────────────────────────────────────────────
  const filteredTokens = useMemo(() => {
    return tokens.filter(token => {
      // Search filter
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        const symbolMatch = (token.symbol || '').toLowerCase().includes(q);
        const nameMatch = (token.name || '').toLowerCase().includes(q);
        const addrMatch = (token.address || '').toLowerCase().includes(q);
        if (!symbolMatch && !nameMatch && !addrMatch) return false;
      }

      // 1. Market Cap
      const mcap = token.marketCap || 0;
      if (filters.mcapPreset === '<50k' && mcap >= 50000) return false;
      if (filters.mcapPreset === '50k-250k' && (mcap < 50000 || mcap > 250000)) return false;
      if (filters.mcapPreset === '250k-1m' && (mcap < 250000 || mcap > 1000000)) return false;
      if (filters.mcapPreset === '>1m' && mcap <= 1000000) return false;
      if (filters.mcapPreset === 'custom') {
        const min = parseFloat(filters.mcapMin);
        const max = parseFloat(filters.mcapMax);
        if (!isNaN(min) && mcap < min) return false;
        if (!isNaN(max) && mcap > max) return false;
      }

      // 2. Age (pair creation time)
      const age = token.ageMs;
      if (filters.agePreset === '<15m' && (age === null || age > 15 * 60 * 1000)) return false;
      if (filters.agePreset === '<1h' && (age === null || age > 60 * 60 * 1000)) return false;
      if (filters.agePreset === '<6h' && (age === null || age > 6 * 3600 * 1000)) return false;
      if (filters.agePreset === '<24h' && (age === null || age > 24 * 3600 * 1000)) return false;

      // 3. Smart Money (Strict active holding >= $50 USD)
      const smart = token.smartMoneyCount ?? 0;
      if (filters.smartPreset === '>=1' && smart < 1) return false;
      if (filters.smartPreset === '>=2' && smart < 2) return false;
      if (filters.smartPreset === '>=3' && smart < 3) return false;

      // 4. KOL (Strict active holding >= $50 USD)
      const kol = token.kolCount ?? 0;
      if (filters.kolPreset === '>=1' && kol < 1) return false;
      if (filters.kolPreset === '>=2' && kol < 2) return false;

      // 5. Fund in Dev
      const dev = token.devFund || {};
      if (filters.devPreset === 'cex' && !dev.isCexFunded) return false;
      if (filters.devPreset === 'holding' && dev.isDumped) return false;
      if (filters.devPreset === 'not_dumped' && dev.isDumped) return false;

      return true;
    });
  }, [tokens, filters]);

  // Calculate active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.mcapPreset !== 'all') count++;
    if (filters.agePreset !== 'all') count++;
    if (filters.smartPreset !== 'all') count++;
    if (filters.kolPreset !== 'all') count++;
    if (filters.devPreset !== 'all') count++;
    return count;
  }, [filters]);

  // Reset filters helper
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // ─────────────────────────────────────────────────────────────
  // 3. Anti-Spam Filter Match Toast Notification Engine
  // ─────────────────────────────────────────────────────────────
  const matchesActiveFilters = (token) => {
    const mcap = token.marketCap || 0;
    if (filters.mcapPreset === '<50k' && mcap >= 50000) return false;
    if (filters.mcapPreset === '50k-250k' && (mcap < 50000 || mcap > 250000)) return false;
    if (filters.mcapPreset === '250k-1m' && (mcap < 250000 || mcap > 1000000)) return false;
    if (filters.mcapPreset === '>1m' && mcap <= 1000000) return false;

    const smart = token.smartMoneyCount ?? 0;
    if (filters.smartPreset === '>=1' && smart < 1) return false;
    if (filters.smartPreset === '>=2' && smart < 2) return false;
    if (filters.smartPreset === '>=3' && smart < 3) return false;

    const kol = token.kolCount ?? 0;
    if (filters.kolPreset === '>=1' && kol < 1) return false;
    if (filters.kolPreset === '>=2' && kol < 2) return false;

    return true;
  };

  const handleIncomingTokens = (freshTokens) => {
    if (isFirstLoadRef.current) {
      // Seed known addresses on cold start without flooding notifications
      freshTokens.forEach(t => knownAddressSetRef.current.add(t.address));
      isFirstLoadRef.current = false;
      return;
    }

    const now = Date.now();
    const DEDUP_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per token

    for (const t of freshTokens) {
      const isNewArrival = !knownAddressSetRef.current.has(t.address);
      knownAddressSetRef.current.add(t.address);

      // Check if newly discovered or newly matching
      if (isNewArrival && matchesActiveFilters(t)) {
        const lastAlerted = alertedHistoryRef.current.get(t.address) || 0;
        if (now - lastAlerted > DEDUP_COOLDOWN_MS) {
          alertedHistoryRef.current.set(t.address, now);
          toastQueueRef.current.push({
            token: t,
            title: `🔥 New Match: $${t.symbol}`,
            message: `MCap: $${Math.round(t.marketCap || 0).toLocaleString()} | Smart: ${t.smartMoneyCount ?? 0} holding`,
          });
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

    // 8-second auto-dismiss with queue progression
    setTimeout(() => {
      setActiveToast(null);
      isDisplayingToastRef.current = false;
      // Process next item in queue after brief delay
      setTimeout(() => processToastQueue(), 500);
    }, 8000);
  };

  const handleDismissToast = () => {
    setActiveToast(null);
    isDisplayingToastRef.current = false;
  };

  const handleViewToken = (address) => {
    setHighlightedAddress(address);
    handleDismissToast();
    setTimeout(() => setHighlightedAddress(null), 4000);
  };

  return (
    <div className="min-h-screen bg-[#080b12] text-slate-100 flex flex-col font-sans">
      
      {/* 1. Header with Live Ticker & Mute Toggle */}
      <Header
        lastScanTimestamp={lastScanTimestamp}
        isScanning={isScanning}
        totalTokens={tokens.length}
        filteredCount={filteredTokens.length}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        gmgnPool={gmgnPool}
      />

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-5">
        
        {/* Filter Panel */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          onReset={handleResetFilters}
          activeFilterCount={activeFilterCount}
        />

        {/* 5-Metric Token Table */}
        <TokenTable
          tokens={filteredTokens}
          isScanning={isScanning}
          totalTokensCount={tokens.length}
          highlightedAddress={highlightedAddress}
          onResetFilters={handleResetFilters}
        />

      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Websit Solana Discovery Radar • 100% On-Chain &amp; Official GMGN Telemetry</span>
          <span className="font-mono text-[11px] text-slate-400">Ban-Proof Key Pool Engine • 2000ms Mutex Delay</span>
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
