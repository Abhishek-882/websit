import React, { useState, useEffect } from 'react';
import WalletConnector from './WalletConnector';
import {
  IconRadar,
  IconBot,
  IconOrders,
  IconSolana,
  IconDownload,
  IconBell,
  IconVolume,
  IconVolumeX,
} from './Icons';
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
  canInstall = false,
  onInstallApp,
  onOpenBotModal,
  onOpenTradesModal,
  tradesCount = 0,
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

  return (
    <header className="sticky top-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 sm:gap-3">
        
        {/* Left: Brand, Icon & Network Lock */}
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-slate-900 border border-slate-700/80 p-1.5 shadow-sm flex items-center justify-center text-cyan-400">
              <IconRadar className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-1.5 font-mono">
                  <span>SOLANA RADAR</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80 tracking-wider">
                    PRO TERMINAL
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:flex items-center gap-1.5 font-mono">
                <span>Live DEX Telemetry</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400">Automated Trading Bot</span>
              </p>
            </div>
          </div>

          {/* Locked to Solana Network Only */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-800/80 text-purple-300 text-xs font-mono font-bold shadow-sm">
            <IconSolana className="w-3.5 h-3.5 text-purple-300" />
            <span>Solana Mainnet</span>
          </div>

          {/* Quick Bot & Trades Nav Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenBotModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 hover:bg-cyan-900/80 text-xs font-bold transition-all shadow-sm active:scale-95 font-mono"
              title="Open Solana Trading Bot Control Center"
            >
              <IconBot className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Bot</span>
            </button>

            <button
              onClick={onOpenTradesModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all shadow-sm active:scale-95 font-mono"
              title="Open Active Positions & Trade History"
            >
              <IconOrders className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">Trades</span>
              {tradesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black">
                  {tradesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Center: Live Ticker */}
        <div className="flex items-center justify-between sm:justify-center gap-2 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isScanning ? 'bg-amber-400' : 'bg-emerald-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isScanning ? 'bg-amber-500' : 'bg-emerald-500'
              }`}></span>
            </span>
            <span className="text-xs font-mono font-medium text-slate-200">
              {isScanning ? (
                <span className="text-amber-300">Scanning Solana DEX...</span>
              ) : (
                <span className="text-slate-300">Live | {formatAgoString()}</span>
              )}
            </span>
            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-full shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>GMGN Telemetry Active</span>
            </span>
          </div>

          <div className="sm:hidden flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <span>Tracked:</span>
            <span className="font-bold text-white">{totalTokens}</span>
          </div>
        </div>

        {/* Right: Wallet Connect, PWA Install, Alerts & Audio Mute */}
        <div className="flex items-center justify-end flex-wrap gap-2 text-xs">
          
          {/* Solana Phantom / Solflare Wallet Connector */}
          <WalletConnector />

          {/* PWA 1-Tap App Install Button */}
          {canInstall && (
            <button
              onClick={onInstallApp}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow-sm active:scale-95 transition-all"
              title="Install App on your device Home Screen"
            >
              <IconDownload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Install App</span>
            </button>
          )}
          
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
                    : 'bg-amber-950/40 border-amber-700/60 text-amber-300 hover:bg-amber-900/50'
                }`}
              >
                <IconBell className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {notifPermission === 'granted' ? 'Alerts Active' : 'Enable Alerts'}
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
                <IconVolumeX className="w-3.5 h-3.5" />
                <span>Muted</span>
              </>
            ) : (
              <>
                <IconVolume className="w-3.5 h-3.5" />
                <span>Audio On</span>
              </>
            )}
          </button>

        </div>
      </div>
    </header>
  );
}
