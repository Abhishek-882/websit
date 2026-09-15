import React, { useState } from 'react';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';

export default function BotControlsModal({ isOpen, onClose }) {
  const botConfig = useBotStore(s => s.botConfig);
  const updateBotConfig = useBotStore(s => s.updateBotConfig);
  const updateTP = useBotStore(s => s.updateTP);
  const sessionPubkey = useBotStore(s => s.sessionPubkey);
  const sessionBalance = useBotStore(s => s.sessionBalanceSol);
  const setSessionPubkey = useBotStore(s => s.setSessionPubkey);
  const setSessionBalance = useBotStore(s => s.setSessionBalance);
  const connectedWallet = useBotStore(s => s.connectedWallet);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  if (!isOpen) return null;

  const handleCreateSession = async () => {
    if (!connectedWallet) {
      alert('Please connect your Phantom or Solflare wallet first.');
      return;
    }
    setLoading(true);
    setStatusMsg('Creating encrypted session keypair...');
    try {
      const res = await botApi.createSession(connectedWallet, botConfig);
      setSessionPubkey(res.sessionPubkey);
      setSessionBalance(res.balanceSol || 0);
      setStatusMsg('Session wallet activated! Send SOL to start auto-trading.');
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      alert(`Error creating session wallet: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!sessionPubkey || sessionBalance <= 0) {
      alert('No funds in session wallet to withdraw.');
      return;
    }
    if (!confirm(`Are you sure you want to withdraw ${sessionBalance.toFixed(4)} SOL back to your main wallet (${connectedWallet})?`)) {
      return;
    }
    setLoading(true);
    setStatusMsg('Executing on-chain withdrawal bundle...');
    try {
      const res = await botApi.withdrawSession(connectedWallet);
      setSessionBalance(0);
      setStatusMsg(`Withdrawn ${res.amountSol?.toFixed(4) || ''} SOL back to main wallet!`);
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      alert(`Withdrawal failed: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!connectedWallet) {
      alert('Connect wallet to persist bot settings.');
      return;
    }
    setLoading(true);
    try {
      await botApi.updateConfig(connectedWallet, botConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copySessionKey = () => {
    if (sessionPubkey) {
      navigator.clipboard.writeText(sessionPubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0e1422] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-6 my-auto text-slate-100 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-500 text-slate-950 font-bold text-lg">
              🤖
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Solana Trading Bot</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  Jupiter v6 + Jito MEV
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Paced criteria auto-buying, take-profit laddering, and zero-popup session authority.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {statusMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-700 text-cyan-300 text-xs font-mono animate-pulse">
            ℹ️ {statusMsg}
          </div>
        )}

        {/* 1. Delegated Session Wallet Card */}
        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800 mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                Autonomous Delegated Session
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">Session Keypair</h3>
              <p className="text-[11px] text-slate-400">
                The bot signs Jupiter swaps automatically in the background with zero popups.
              </p>
            </div>
            <div className="text-right sm:text-right">
              <span className="text-[10px] text-slate-400 block font-mono">Session Balance</span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                {sessionBalance.toFixed(4)} SOL
              </span>
            </div>
          </div>

          {sessionPubkey ? (
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-700/80 space-y-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-xs text-slate-400 shrink-0">Deposit:</span>
                  <span className="font-mono text-xs text-cyan-300 select-all bg-slate-950 px-2 py-1 rounded border border-slate-800 truncate flex-1">
                    {sessionPubkey}
                  </span>
                  <button
                    onClick={copySessionKey}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 transition-colors"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleWithdraw}
                    disabled={loading || sessionBalance <= 0}
                    className="px-3 py-1 rounded bg-amber-600/30 border border-amber-600/60 hover:bg-amber-600/50 text-amber-200 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Withdraw All
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                💡 Send SOL from your Phantom/Solflare wallet to this deposit address to fund autonomous trades.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-slate-900/60 border border-dashed border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <span className="text-xs text-slate-400">
                No active session wallet. Generate one to enable 24/7 background trade execution.
              </span>
              <button
                onClick={handleCreateSession}
                disabled={loading || !connectedWallet}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50 shrink-0"
              >
                {loading ? 'Creating...' : 'Create Session Wallet'}
              </button>
            </div>
          )}
        </div>

        {/* 2. Buy Rules & Criteria Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          
          {/* Buy Criteria Card */}
          <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-1.5 border-b border-slate-800 flex items-center justify-between">
              <span>Paced Buy Rules</span>
              <span className="text-[10px] text-cyan-400 font-mono">Solana DEX</span>
            </h4>

            {/* Auto Buy Toggle */}
            <div className="flex items-center justify-between p-2 rounded bg-slate-900/70 border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">Auto-Buy Enabled</span>
                <span className="text-[10px] text-slate-400">Triggers when coin matches active filters</span>
              </div>
              <input
                type="checkbox"
                checked={botConfig.autoBuy}
                onChange={(e) => updateBotConfig({ autoBuy: e.target.checked })}
                className="w-4 h-4 accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Buy Amount per Coin */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Buy Amount per Coin (SOL)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={botConfig.buyAmountSol}
                  onChange={(e) => updateBotConfig({ buyAmountSol: parseFloat(e.target.value) || 0.05 })}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
                <span className="text-xs font-mono text-slate-400 font-bold">SOL</span>
              </div>
            </div>

            {/* Max Concurrent Positions */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Max Concurrent Positions</label>
              <input
                type="number"
                min="1"
                max="20"
                value={botConfig.maxPositions}
                onChange={(e) => updateBotConfig({ maxPositions: parseInt(e.target.value, 10) || 5 })}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Max Slippage BPS */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Max Slippage (BPS)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="50"
                  value={botConfig.slippageBps}
                  onChange={(e) => updateBotConfig({ slippageBps: parseInt(e.target.value, 10) || 500 })}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
                <span className="text-xs font-mono text-cyan-400 font-bold w-12 text-right">
                  {((botConfig.slippageBps || 500) / 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Jito MEV Bundle Toggle */}
            <div className="flex items-center justify-between p-2 rounded bg-slate-900/70 border border-emerald-800/50">
              <div>
                <span className="text-xs font-bold text-emerald-300 block">⚡ Jito MEV Bundle</span>
                <span className="text-[10px] text-slate-400">&lt;600ms private landing, zero sandwich</span>
              </div>
              <input
                type="checkbox"
                checked={botConfig.useJito ?? true}
                onChange={(e) => updateBotConfig({ useJito: e.target.checked })}
                className="w-4 h-4 accent-emerald-400 cursor-pointer"
              />
            </div>

            {/* Duplicate prevention indicator */}
            <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="text-cyan-400">🛡️</span>
              <span>
                <strong className="text-slate-200">Anti-Duplicate Guard:</strong> Prevents rebuying the same token twice.
              </span>
            </div>
          </div>

          {/* Take Profit Ladder & Stop Loss Card */}
          <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-1.5 border-b border-slate-800 flex items-center justify-between">
              <span>Take-Profit Ladder</span>
              <span className="text-[10px] text-emerald-400 font-mono">3-Stage Exit</span>
            </h4>

            {botConfig.tpLevels.map((tp, idx) => (
              <div key={idx} className="p-2 rounded bg-slate-900/70 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-white">TP Stage {idx + 1}</span>
                  <span className="text-emerald-400 font-mono">
                    Sell {tp.closePct}% at +{tp.triggerPct}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block">Gain Target (%)</label>
                    <input
                      type="number"
                      value={tp.triggerPct}
                      onChange={(e) => updateTP(idx, { triggerPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Sell Amount (%)</label>
                    <input
                      type="number"
                      value={tp.closePct}
                      onChange={(e) => updateTP(idx, { closePct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Stop Loss Input */}
            <div className="pt-1">
              <label className="text-[11px] text-slate-400 block mb-1">Stop-Loss Trigger (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={botConfig.stopLossPct}
                  onChange={(e) => updateBotConfig({ stopLossPct: parseFloat(e.target.value) || -50 })}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-rose-400 font-mono font-bold focus:outline-none focus:border-rose-500"
                />
                <span className="text-xs font-mono text-rose-400 font-bold">% loss</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {saveSuccess ? (
            <span className="text-xs font-bold text-emerald-400 animate-pulse">
              ✓ Settings saved to bot backend!
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-mono">
              Bot runs 24/7 on backend
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={loading}
              className="px-5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 text-xs font-black transition-all shadow-md active:scale-95"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
