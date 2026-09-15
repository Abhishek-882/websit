import React, { useState, useEffect } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
} from '../engine/phoneNotification.js';

export default function Header({
  lastScanTimestamp,
  isScanning,
  totalTokens,
  filteredCount,
  soundMuted,
  onToggleSound,
  gmgnPool,
  selectedChain = 'base',
  onSelectChain,
}) {
  const [secondsAgo, setSecondsAgo] = useState(null);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);

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

  const handleEnablePhoneAlerts = async () => {
    setIsRequestingNotif(true);
    try {
      const res = await requestNotificationPermission();
      setNotifPermission(res);
    } finally {
      setIsRequestingNotif(false);
    }
  };

  const formatAgoString = () => {
    if (isScanning && !lastScanTimestamp) {
      return `Scanning ${selectedChain === 'base' ? 'Base' : 'Solana'} DEX...`;
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
    <header className="sticky top-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 sm:gap-3">
        
        {/* Left: Brand, Cat Logo & Network Selector */}
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-emerald-400 to-purple-500 p-[1.5px] shadow-sm flex items-center justify-center overflow-hidden">
              <img src="/cat-icon.svg" alt="Meme Cat" className="h-full w-full object-cover rounded-[10px]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-1">
                  <span>Meme Cat</span>
                  <span className="text-cyan-400 text-xs font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
                    Radar 🐾
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:flex items-center gap-1.5">
                <span>Autonomous 60s Discovery</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400">Strict Pacing Shield</span>
              </p>
            </div>
          </div>

          {/* User Directive: Network Selection (Default: Base tokens) */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-700/80 shadow-inner">
            <button
              onClick={() => onSelectChain && onSelectChain('base')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                selectedChain === 'base'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Base Network (Default)"
            >
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-sm animate-pulse"></span>
              <span>🔵 Base</span>
              {selectedChain === 'base' && (
                <span className="text-[9px] bg-blue-700 px-1 py-0.2 rounded uppercase tracking-wider font-extrabold">Def</span>
              )}
            </button>
            <button
              onClick={() => onSelectChain && onSelectChain('sol')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                selectedChain === 'sol'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Solana Network"
            >
              <span className="h-2 w-2 rounded-full bg-purple-400 shadow-sm"></span>
              <span>🟣 Solana</span>
            </button>
          </div>
        </div>

        {/* Center: Live Ticker */}
        <div className="flex items-center justify-between sm:justify-center gap-2 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800 shadow-inner">
          <div className="flex items-center gap-2">
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
                <span className="text-amber-300">● Scanning {selectedChain.toUpperCase()}...</span>
              ) : (
                <span className="text-slate-300">● Live | {formatAgoString()}</span>
              )}
            </span>
          </div>

          <div className="sm:hidden flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <span>Tracked:</span>
            <span className="font-bold text-white">{totalTokens}</span>
          </div>
        </div>

        {/* Right: Phone Chrome Alerts, Audio & Stats */}
        <div className="flex items-center justify-end flex-wrap gap-2 text-xs">
          
          {/* Chrome Phone Notification Button */}
          {isNotificationSupported() && (
            <div className="flex items-center gap-1">
              <button
                onClick={notifPermission === 'granted' ? sendTestNotification : handleEnablePhoneAlerts}
                disabled={isRequestingNotif}
                title={notifPermission === 'granted' ? 'Tap to test Phone Notification' : 'Enable Chrome Phone Notification Popups'}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50'
                    : notifPermission === 'denied'
                    ? 'bg-slate-900 border-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-amber-950/40 border-amber-700/60 text-amber-300 hover:bg-amber-900/50 animate-pulse'
                }`}
              >
                <span>🔔</span>
                <span className="hidden sm:inline">
                  {notifPermission === 'granted' ? 'Phone Alerts On' : 'Enable Phone Alerts'}
                </span>
                <span className="sm:hidden">Alerts</span>
              </button>
            </div>
          )}

          {/* Token Counts */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800">
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium transition-all ${
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
