import React, { useState } from 'react';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';

const FIBONACCI_SPOTS = [
  { label: '-10% (Fib 0.236)', value: 10 },
  { label: '-20% (Fib 0.382 Golden Dip)', value: 20 },
  { label: '-30% (Fib 0.500 Deep Retracement)', value: 30 },
];

const QUICK_BUY_AMOUNTS = [0.05, 0.1, 0.2, 0.5, 1.0];

export default function BotControlsModal({ isOpen, onClose }) {
  const botConfig = useBotStore(s => s.botConfig);
  const updateBotConfig = useBotStore(s => s.updateBotConfig);
  const addStrategyRule = useBotStore(s => s.addStrategyRule);
  const removeStrategyRule = useBotStore(s => s.removeStrategyRule);
  const updateStrategyRule = useBotStore(s => s.updateStrategyRule);

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

  const rules = botConfig.strategyRules || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c101a] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-6 my-auto text-slate-100 max-h-[92vh] overflow-y-auto font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 text-slate-950 font-bold text-lg">
              🤖
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Solana Auto-Trading Bot</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  Jupiter v6 + Jito MEV
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Paced criteria auto-buying, Fibonacci dip entry, and GMGN-style profit laddering.
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
        <div className="p-4 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                Autonomous Delegated Session
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">Session Keypair</h3>
              <p className="text-[11px] text-slate-400">
                Signs swaps automatically in the background with zero wallet popups.
              </p>
            </div>
            <div className="text-right">
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
                💡 Send SOL from Phantom/Solflare to this deposit address to fund trades.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-slate-900/60 border border-dashed border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <span className="text-xs text-slate-400">
                No active session wallet. Generate one to enable 24/7 background execution.
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

        {/* 2. GMGN Order Type & Exact Switch (Matching Image 3) */}
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            {/* Market vs Limit Switch Tabs */}
            <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-700/80">
              <button
                type="button"
                onClick={() => updateBotConfig({ orderType: 'market' })}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  botConfig.orderType === 'market' || !botConfig.orderType
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Market
              </button>
              <button
                type="button"
                onClick={() => updateBotConfig({ orderType: 'limit' })}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  botConfig.orderType === 'limit'
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Limit</span>
                <span className="text-[10px] text-slate-400 font-normal">ⓘ</span>
              </button>
            </div>

            {/* EXACT Toggle Switch */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                <span>EXACT</span>
                <span className="text-[10px] text-slate-400 cursor-help" title="Require strict exact filter match before triggering buy">ⓘ</span>
              </span>
              <button
                type="button"
                onClick={() => updateBotConfig({ isExact: !botConfig.isExact })}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  botConfig.isExact ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
                title="Strict Exact Match Filter"
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
              </button>
            </div>
          </div>

          {/* Fibonacci Retracement Limit Spot Controls */}
          {botConfig.orderType === 'limit' && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-cyan-800/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <span>📉 Fibonacci Retracement Dip Spot</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Trigger Spot: -{botConfig.limitDipPct || 20}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Instead of buying instantly at market top, waits for the token to retrace to the selected Fibonacci dip spot before executing the buy.
              </p>
              
              {/* Preset Retracement Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {FIBONACCI_SPOTS.map((spot) => (
                  <button
                    key={spot.value}
                    type="button"
                    onClick={() => updateBotConfig({ limitDipPct: spot.value })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold font-mono transition-all border ${
                      (botConfig.limitDipPct || 20) === spot.value
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {spot.label}
                  </button>
                ))}
              </div>

              {/* Custom Retracement Input */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400">Custom Dip Spot:</span>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={botConfig.limitDipPct || 20}
                  onChange={(e) => updateBotConfig({ limitDipPct: Math.abs(parseFloat(e.target.value) || 20) })}
                  className="w-20 px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-cyan-300 font-mono font-bold"
                />
                <span className="text-xs font-mono text-cyan-400">% dip from trigger price</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Buy Rules & Criteria Configuration */}
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-1.5 border-b border-slate-800 flex items-center justify-between">
            <span>Buy Execution Rules</span>
            <span className="text-[10px] text-cyan-400 font-mono">Solana DEX</span>
          </h4>

          {/* Auto Buy Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
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

          {/* Quick Buy Amount per Coin */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Buy Amount per Coin (SOL)</label>
            <div className="flex items-center gap-2 mb-2">
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
            {/* Quick buttons */}
            <div className="flex items-center gap-1.5">
              {QUICK_BUY_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => updateBotConfig({ buyAmountSol: amt })}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all border ${
                    botConfig.buyAmountSol === amt
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {amt} SOL
                </button>
              ))}
            </div>
          </div>

          {/* Max Positions & Slippage Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
          </div>

          {/* Jito MEV Bundle Toggle */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-emerald-800/50">
            <div>
              <span className="text-xs font-bold text-emerald-300 block">⚡ Jito MEV Bundle</span>
              <span className="text-[10px] text-slate-400">&lt;600ms private landing, anti-sandwich protection</span>
            </div>
            <input
              type="checkbox"
              checked={botConfig.useJito ?? true}
              onChange={(e) => updateBotConfig({ useJito: e.target.checked })}
              className="w-4 h-4 accent-emerald-400 cursor-pointer"
            />
          </div>
        </div>

        {/* 4. Advanced Trading Strategy (Exact GMGN Layout from Images 2 & 4) */}
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={botConfig.advancedStrategyEnabled ?? true}
                onChange={(e) => updateBotConfig({ advancedStrategyEnabled: e.target.checked })}
                className="w-4 h-4 accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Advanced Trading Strategy
              </span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">GMGN Mode</span>
          </div>

          {/* Dynamic Rule Rows */}
          <div className="space-y-2">
            {rules.map((rule, idx) => {
              const isTP = rule.type === 'TP';
              const isTPDD = rule.type === 'TP DD';
              const isSLDD = rule.type === 'SL DD';
              const isSL = rule.type === 'SL';

              return (
                <div
                  key={rule.id || idx}
                  className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  {/* Type Selector */}
                  <select
                    value={rule.type}
                    onChange={(e) => updateStrategyRule(idx, { type: e.target.value })}
                    className="px-2 py-1.5 text-xs font-bold bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="TP">TP</option>
                    <option value="TP DD">TP DD</option>
                    <option value="SL DD">SL DD</option>
                    <option value="SL">SL</option>
                  </select>

                  {/* Trigger % (for TP, TP DD, SL) */}
                  {(isTP || isTPDD || isSL) && (
                    <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      <span className="text-[11px] text-slate-400 font-semibold">{isSL ? 'SL' : 'TP'}</span>
                      <input
                        type="number"
                        value={rule.triggerPct}
                        onChange={(e) => updateStrategyRule(idx, { triggerPct: parseFloat(e.target.value) || 0 })}
                        className="w-14 text-xs font-mono font-bold bg-transparent text-white text-right focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">%</span>
                    </div>
                  )}

                  {/* Drawdown % (for TP DD, SL DD) */}
                  {(isTPDD || isSLDD) && (
                    <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      <span className="text-[11px] text-amber-400 font-semibold">DD</span>
                      <input
                        type="number"
                        value={rule.ddPct || 20}
                        onChange={(e) => updateStrategyRule(idx, { ddPct: parseFloat(e.target.value) || 0 })}
                        className="w-12 text-xs font-mono font-bold bg-transparent text-white text-right focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">%</span>
                    </div>
                  )}

                  {/* Sell Amount % */}
                  <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 ml-auto">
                    <span className="text-[11px] text-slate-400 font-semibold">Sell</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={rule.sellPct}
                      onChange={(e) => updateStrategyRule(idx, { sellPct: parseFloat(e.target.value) || 100 })}
                      className="w-12 text-xs font-mono font-bold bg-transparent text-emerald-400 text-right focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">%</span>
                  </div>

                  {/* Delete Row Button (Trash Can) */}
                  <button
                    type="button"
                    onClick={() => removeStrategyRule(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                    title="Delete Rule"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>

          {/* Closing Type Radio: Amount vs Holding (Image 4) */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="closingType"
                  value="amount"
                  checked={botConfig.closingType === 'amount' || !botConfig.closingType}
                  onChange={() => updateBotConfig({ closingType: 'amount' })}
                  className="accent-cyan-400 cursor-pointer"
                />
                <span className="text-slate-300 font-semibold">Amount</span>
                <span className="text-[10px] text-slate-400 cursor-help" title="Calculates sell ratio against original bought token position">ⓘ</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="closingType"
                  value="holding"
                  checked={botConfig.closingType === 'holding'}
                  onChange={() => updateBotConfig({ closingType: 'holding' })}
                  className="accent-cyan-400 cursor-pointer"
                />
                <span className="text-slate-300 font-semibold">Holding</span>
                <span className="text-[10px] text-slate-400 cursor-help" title="Calculates sell ratio against currently remaining tokens">ⓘ</span>
              </label>
            </div>

            {/* + Add Rule Button */}
            <button
              type="button"
              onClick={() => addStrategyRule()}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition-colors border border-slate-700"
            >
              + Add
            </button>
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
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Close
            </button>
            <button
              type="button"
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
