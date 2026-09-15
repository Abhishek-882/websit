import React, { useState, useEffect } from 'react';

export default function Header({
  lastScanTimestamp,
  isScanning,
  totalTokens,
  filteredCount,
  soundMuted,
  onToggleSound,
  gmgnPool,
}) {
  const [secondsAgo, setSecondsAgo] = useState(null);

  useEffect(() => {
    const updateTicker = () => {
      if (!lastScanTimestamp) {
        setSecondsAgo(null);
        return;
      }
      const elapsed = Math.max(0, Math.floor((Date.now() - lastScanTimestamp) / 1000));
      setSecondsAgo(elapsed);
    };

    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [lastScanTimestamp]);

  const formatAgoString = () => {
    if (isScanning && !lastScanTimestamp) {
      return 'Scanning Solana DEX...';
    }
    if (secondsAgo === null) {
      return 'Waiting for first scan...';
    }
    if (secondsAgo < 2) return 'Updated just now';
    if (secondsAgo < 60) return `Updated ${secondsAgo}s ago`;
    const mins = Math.floor(secondsAgo / 60);
    const remSecs = secondsAgo % 60;
    return `Updated ${mins}m ${remSecs}s ago`;
  };

  const isPoolAvailable = gmgnPool?.available ?? true;
  const cooldownSec = gmgnPool?.cooldownRemainingSec ?? 0;

  return (
    <header className="sticky top-0 z-40 bg-[#0b0f19]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        
        {/* Left: Brand & Badges */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-600 via-emerald-500 to-teal-400 p-[1px] shadow-sm flex items-center justify-center">
            <div className="h-full w-full bg-[#0b0f19] rounded-[7px] flex items-center justify-center">
              <span className="text-cyan-400 text-lg font-black tracking-tight">W</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Websit <span className="text-cyan-400 font-semibold text-sm">Radar</span>
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-cyan-950/70 text-cyan-300 border border-cyan-800/50">
                Solana Live
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Autonomous 60s DEX Discovery</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400">Strict Pacing Shield</span>
            </p>
          </div>
        </div>

        {/* Center: Live Ticker */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 shadow-inner">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isScanning ? 'bg-amber-400' : 'bg-emerald-400'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isScanning ? 'bg-amber-500' : 'bg-emerald-500'
            }`}></span>
          </span>
          <span className="text-xs font-mono font-medium text-slate-200">
            {isScanning ? (
              <span className="text-amber-300">● Scanning in progress...</span>
            ) : (
              <span className="text-slate-300">● Live | {formatAgoString()}</span>
            )}
          </span>
        </div>

        {/* Right: Telemetry Health & Controls */}
        <div className="flex items-center gap-3 text-xs">
          
          {/* Rate Shield Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800">
            <span className="text-slate-400">Shield:</span>
            {cooldownSec > 0 ? (
              <span className="text-amber-400 font-mono font-semibold">
                Cooldown ({cooldownSec}s)
              </span>
            ) : isPoolAvailable ? (
              <span className="text-emerald-400 font-medium">Safe (2000ms delay)</span>
            ) : (
              <span className="text-red-400 font-medium">Throttled</span>
            )}
          </div>

          {/* Token Counts */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800">
            <span className="text-slate-400">Tracked:</span>
            <span className="font-mono font-bold text-white">{totalTokens}</span>
            {filteredCount !== totalTokens && (
              <span className="text-cyan-400 font-mono text-[11px]">
                ({filteredCount} matched)
              </span>
            )}
          </div>

          {/* Audio Alert Mute Toggle */}
          <button
            onClick={onToggleSound}
            title={soundMuted ? 'Unmute Audio Alert Chime' : 'Mute Audio Alert Chime'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-medium transition-all ${
              soundMuted
                ? 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
                : 'bg-cyan-950/40 border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/40'
            }`}
          >
            {soundMuted ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
                <span>Muted</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span>Chime On</span>
              </>
            )}
          </button>

        </div>
      </div>
    </header>
  );
}
