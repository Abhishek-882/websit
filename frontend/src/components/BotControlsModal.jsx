import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';
import {
  IconBot,
  IconClose,
  IconInfo,
  IconChartDip,
  IconBolt,
  IconTrash,
  IconCheck,
  IconKey,
  IconWallet,
  IconChevronDown,
  IconChevronUp,
  IconLock,
  IconSolana,
  IconShield,
  IconRefresh,
  IconExternal,
} from './Icons';

const FIBONACCI_SPOTS = [
  { label: '-10% (Fib 0.236)', value: 10 },
  { label: '-20% (Fib 0.382 Golden Dip)', value: 20 },
  { label: '-30% (Fib 0.500 Deep Retracement)', value: 30 },
];

const QUICK_BUY_AMOUNTS = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0];
const DEPOSIT_PRESETS = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0];

import SetFileManager from './SetFileManager';

export default function BotControlsModal({ isOpen, onClose }) {
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

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

  // Tab state
  const [activeTab, setActiveTab] = useState('trading'); // 'trading' | 'setFiles'

  // 1-Click Deposit state
  const [depositAmount, setDepositAmount] = useState(0.1);
  const [isDepositing, setIsDepositing] = useState(false);

  // Educational Accordion state
  const [isEducationalOpen, setIsEducationalOpen] = useState(false);

  // Export Private Key state
  const [isExportingKey, setIsExportingKey] = useState(false);
  const [exportedKey, setExportedKey] = useState(null);
  const [exportedPubkey, setExportedPubkey] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copiedExportKey, setCopiedExportKey] = useState(false);

  // Backup Vault state
  const [backups, setBackups] = useState([]);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const loadBackups = async () => {
    if (!connectedWallet) return;
    setLoadingBackups(true);
    try {
      const res = await botApi.getSessionBackups(connectedWallet);
      if (res?.backups) setBackups(res.backups);
    } catch (err) {
      console.warn('Failed to load session backups:', err.message);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (isOpen && connectedWallet) {
      loadBackups();
    }
  }, [isOpen, connectedWallet]);

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
      setStatusMsg('Session wallet activated! Deposit SOL to start autonomous trading.');
      setTimeout(() => setStatusMsg(null), 4000);
      loadBackups();
    } catch (err) {
      alert(`Error creating session wallet: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDepositViaPhantom = async () => {
    if (!connectedWallet || !publicKey) {
      alert('Please connect your Phantom or Solflare wallet first.');
      return;
    }
    if (!sessionPubkey) {
      alert('Session wallet not initialized. Please click Create Session Wallet first.');
      return;
    }
    const solVal = parseFloat(depositAmount);
    if (!solVal || solVal <= 0) {
      alert('Please select or enter a valid SOL deposit amount.');
      return;
    }

    setIsDepositing(true);
    setStatusMsg(`Awaiting approval in Phantom to transfer ${solVal} SOL...`);
    try {
      const lamports = Math.round(solVal * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(sessionPubkey),
          lamports,
        })
      );

      const signature = await sendTransaction(tx, connection);
      setStatusMsg(`Confirming deposit on Solana Mainnet (${signature.slice(0, 8)}...)...`);

      await connection.confirmTransaction(signature, 'confirmed');

      // Verify on backend and update session balance
      const res = await botApi.verifyDeposit(connectedWallet, signature);
      setSessionBalance(res.balanceSol);
      setStatusMsg(`Successfully deposited ${solVal} SOL! Live balance: ${res.balanceSol.toFixed(4)} SOL`);
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      console.error('Deposit error:', err);
      if (err.message?.includes('User rejected')) {
        setStatusMsg(null);
      } else {
        alert(`Deposit failed: ${err.message}`);
        setStatusMsg(null);
      }
    } finally {
      setIsDepositing(false);
    }
  };

  const handleExportPrivateKey = async (targetPubkey = null) => {
    if (!connectedWallet || !publicKey) {
      alert('Please connect your Phantom or Solflare wallet first.');
      return;
    }
    const pubkeyToExport = targetPubkey || sessionPubkey;
    if (!pubkeyToExport) {
      alert('No session wallet exists to export.');
      return;
    }
    if (!signMessage) {
      alert('Your connected wallet does not support message signing. Please use Phantom or Solflare.');
      return;
    }

    setIsExportingKey(true);
    try {
      const message = `Authorize private key export for MEME_CAT Session (${pubkeyToExport}) at timestamp ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);

      const signatureBytes = await signMessage(messageBytes);
      const signatureB58 = bs58.encode(signatureBytes);

      const res = await botApi.exportKey(connectedWallet, signatureB58, message, pubkeyToExport);
      setExportedKey(res.privateKey);
      setExportedPubkey(pubkeyToExport);
      setShowExportModal(true);
    } catch (err) {
      if (err.message?.includes('User rejected') || err.message?.includes('cancelled')) {
        // user clicked cancel in phantom
      } else {
        alert(`Export authentication failed: ${err.message}`);
      }
    } finally {
      setIsExportingKey(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!connectedWallet) {
      alert('Please connect your Phantom or Solflare wallet first.');
      return;
    }
    if (!sessionPubkey) {
      alert('No active session wallet to delete.');
      return;
    }

    const hasFunds = sessionBalance > 0.0001;
    const msg = hasFunds
      ? `Delete & Reset Session Wallet?\n\nAUTOMATIC REFUND GUARANTEE:\nThis session wallet currently holds ${sessionBalance.toFixed(4)} SOL.\n100% of remaining funds will be automatically swept back to your connected Phantom wallet before deletion.\n\nYour session private key will also be permanently archived in the Backup Vault for self-custody.\n\nProceed with safe deletion?`
      : `Delete & Reset Session Wallet?\n\nYour session private key will be permanently archived in the Backup Vault so you can always export it later.\n\nYou can immediately create a brand new session wallet after resetting.\n\nProceed with reset?`;

    if (!confirm(msg)) return;

    setLoading(true);
    setStatusMsg(hasFunds ? 'Sweeping funds back to your Phantom wallet and archiving key...' : 'Archiving session and resetting...');
    try {
      const res = await botApi.deleteSession(connectedWallet);
      setSessionPubkey(null);
      setSessionBalance(0);
      if (res.refundedSol > 0) {
        setStatusMsg(`Session deleted! Refunded ${res.refundedSol.toFixed(4)} SOL back to your connected wallet.`);
      } else {
        setStatusMsg('Session deleted and permanently archived in Backup Vault.');
      }
      setTimeout(() => setStatusMsg(null), 5000);
      loadBackups();
    } catch (err) {
      alert(`Session deletion failed: ${err.message}`);
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
    const shortDest = connectedWallet ? `${connectedWallet.slice(0, 4)}...${connectedWallet.slice(-4)}` : '';
    if (!confirm(`Emergency Sweep: Withdraw all ${sessionBalance.toFixed(4)} SOL back to your connected Phantom wallet (${shortDest})?`)) {
      return;
    }
    setLoading(true);
    setStatusMsg(`Executing withdrawal bundle to ${shortDest}...`);
    try {
      const res = await botApi.withdrawSession(connectedWallet);
      setSessionBalance(0);
      setStatusMsg(`Withdrawn ${res.amountSol?.toFixed(4) || ''} SOL back to your Phantom wallet!`);
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      alert(`Withdrawal failed: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      if (connectedWallet) {
        await botApi.updateConfig(connectedWallet, botConfig);
      }
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

  const copyExportedKey = () => {
    if (exportedKey) {
      navigator.clipboard.writeText(exportedKey);
      setCopiedExportKey(true);
      setTimeout(() => setCopiedExportKey(false), 2000);
    }
  };

  const rules = botConfig.strategyRules || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c101a] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-6 my-auto text-slate-100 max-h-[92vh] overflow-y-auto font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 text-slate-950 font-bold">
              <IconBot className="w-5 h-5 text-slate-950" />
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
            aria-label="Close modal"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Network & Asset Specification Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 mb-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800/80 text-purple-300 font-bold flex items-center gap-1">
              <IconSolana className="w-3 h-3 text-purple-300" />
              <span>Solana Mainnet-Beta</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 font-bold">
              Asset: Native SOL
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Required for DEX pools, gas &amp; Jito MEV tips
          </span>
        </div>

        {statusMsg && (
          <div className="mb-3 p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-700 text-cyan-300 text-xs font-mono flex items-center gap-2 animate-pulse">
            <IconInfo className="w-4 h-4 shrink-0 text-cyan-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('trading')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'trading' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trading Config
          </button>
          <button
            onClick={() => setActiveTab('setFiles')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'setFiles' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Set Files
          </button>
        </div>

        {activeTab === 'setFiles' && <SetFileManager />}
        
        {activeTab === 'trading' && (
          <>
            {/* 1. Delegated Session Wallet & 1-Click Phantom Deposit Card */}
            <div className="p-4 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                  Autonomous Delegated Session
                </span>
                {sessionPubkey && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex items-center gap-1">
                    <IconBolt className="w-2.5 h-2.5 text-emerald-400" />
                    24h Active Background
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-0.5">Trading Session Keypair</h3>
              <p className="text-[11px] text-slate-400">
                Executes orders 24/7 even when website or app is closed. Isolated from your main wallet.
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
            <div className="space-y-3">
              {/* 1-Click Automatic Deposit via Phantom */}
              <div className="p-3 rounded-lg bg-slate-900/90 border border-cyan-900/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <IconWallet className="w-4 h-4 text-cyan-400" />
                    <span>1-Click Deposit via Phantom</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Instant on-chain transfer
                  </span>
                </div>

                {/* Preset Deposit Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {DEPOSIT_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all border ${
                        depositAmount === amt
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {amt} SOL
                    </button>
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0.1)}
                      className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-cyan-300 font-mono font-bold text-right"
                    />
                    <span className="text-xs font-mono text-slate-400 font-bold">SOL</span>
                  </div>
                </div>

                {/* Primary Deposit Action */}
                <button
                  type="button"
                  onClick={handleDepositViaPhantom}
                  disabled={isDepositing || !connectedWallet}
                  className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <IconSolana className="w-3.5 h-3.5 text-white" />
                  <span>
                    {isDepositing ? 'Confirming in Phantom...' : `Deposit ${depositAmount} SOL via Phantom (1-Click)`}
                  </span>
                </button>
              </div>

              {/* Deposit Address Box & Actions */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] text-slate-400 shrink-0">Session Address:</span>
                    <span className="font-mono text-xs text-cyan-300 select-all bg-slate-950 px-2 py-1 rounded border border-slate-800 truncate flex-1">
                      {sessionPubkey}
                    </span>
                    <button
                      type="button"
                      onClick={copySessionKey}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 transition-colors"
                      title="Copy Session Wallet Public Key"
                    >
                      {copied ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <IconCheck className="w-3 h-3" /> Copied
                        </span>
                      ) : (
                        'Copy'
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Export Private Key Button */}
                    <button
                      type="button"
                      onClick={() => handleExportPrivateKey(sessionPubkey)}
                      disabled={isExportingKey || !connectedWallet}
                      className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1"
                      title="Export private key to import into Phantom wallet"
                    >
                      <IconKey className="w-3 h-3 text-amber-400" />
                      <span>{isExportingKey ? 'Signing...' : 'Backup Key'}</span>
                    </button>

                    {/* Emergency 1-Click Sweep Button */}
                    <button
                      type="button"
                      onClick={handleWithdraw}
                      disabled={loading || sessionBalance <= 0}
                      className="px-3 py-1 rounded bg-rose-950/70 border border-rose-800/80 hover:bg-rose-900/80 text-rose-300 text-xs font-bold transition-all disabled:opacity-50"
                      title="Sweep all funds back to your connected Phantom wallet"
                    >
                      Withdraw All
                    </button>

                    {/* Safe Delete & Reset Session Button */}
                    <button
                      type="button"
                      onClick={handleDeleteSession}
                      disabled={loading || !connectedWallet}
                      className="px-2.5 py-1 rounded bg-red-950/80 border border-red-800/80 hover:bg-red-900/80 text-red-300 text-xs font-semibold transition-all flex items-center gap-1 disabled:opacity-50"
                      title="Safely delete and reset session (automatically sweeps all funds and archives private key)"
                    >
                      <IconTrash className="w-3 h-3 text-red-400" />
                      <span>Delete &amp; Reset</span>
                    </button>
                  </div>
                </div>
              </div>
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

          {/* Educational Collapsible Accordion: Why Session Wallet & Recovery */}
          <div className="pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsEducationalOpen(!isEducationalOpen)}
              className="w-full flex items-center justify-between py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <IconShield className="w-3.5 h-3.5 text-cyan-400" />
                <span>Why do I need a Trading Session Wallet? (Zero-Loss Guarantee)</span>
              </span>
              {isEducationalOpen ? (
                <IconChevronUp className="w-3.5 h-3.5" />
              ) : (
                <IconChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {isEducationalOpen && (
              <div className="mt-2 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-2 leading-relaxed">
                <div>
                  <span className="font-bold text-white block mb-0.5">1. Zero Popups for Sub-Second Trades</span>
                  <p className="text-slate-400">
                    Solana wallets (Phantom/Solflare) require a manual popup approval for every transaction. Smart contracts cannot silently debit your Phantom wallet. To buy dips on Fibonacci retracements and trigger stop-losses while you sleep, an isolated session keypair is used.
                  </p>
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">2. Total Main Wallet Isolation</span>
                  <p className="text-slate-400">
                    Your primary Phantom wallet is never exposed. You only deposit what you wish to trade (e.g. 0.1 SOL). You can withdraw 100% of your SOL at any second.
                  </p>
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">3. Zero-Loss Crash &amp; Device Recovery</span>
                  <p className="text-slate-400">
                    Your session wallet is permanently mapped to your Phantom wallet login. If your browser crashes, cache is cleared, or you open the app on another phone, reconnecting the same Phantom wallet instantly restores your session and funds.
                  </p>
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">4. 100% Self-Custody (Export to Phantom)</span>
                  <p className="text-slate-400">
                    Click &ldquo;Backup Key&rdquo; to export the session private key and import it directly into Phantom (<span className="text-slate-200 font-mono">Settings &rarr; Manage Accounts &rarr; Add Wallet &rarr; Import Private Key</span>). Even if this website went offline, you retain full custody.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Backup Vault Collapsible Accordion: Permanent Self-Custody Archive */}
          <div className="pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                const nextState = !isBackupsOpen;
                setIsBackupsOpen(nextState);
                if (nextState) loadBackups();
              }}
              className="w-full flex items-center justify-between py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <IconKey className="w-3.5 h-3.5 text-amber-400" />
                <span>Session Backup Vault ({backups.length} Archived Keys)</span>
              </span>
              {isBackupsOpen ? (
                <IconChevronUp className="w-3.5 h-3.5" />
              ) : (
                <IconChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {isBackupsOpen && (
              <div className="mt-2 p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Permanent archival of all active &amp; reset session keypairs.</span>
                  <button
                    type="button"
                    onClick={loadBackups}
                    disabled={loadingBackups}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                  >
                    <IconRefresh className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
                {backups.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic py-1">No archived sessions found for this wallet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {backups.map((b, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                            <span className="text-cyan-400">{b.session_pubkey ? `${b.session_pubkey.slice(0, 6)}...${b.session_pubkey.slice(-4)}` : 'Session'}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">{b.reason || 'Archived'}</span>
                            {b.refunded_sol > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                                Refunded {b.refunded_sol.toFixed(4)} SOL
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {b.archived_at ? new Date(b.archived_at).toLocaleString() : 'Past Session'}
                            {b.refund_tx && (
                              <a
                                href={`https://solscan.io/tx/${b.refund_tx}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 text-cyan-400 hover:underline inline-flex items-center gap-0.5"
                              >
                                Solscan <IconExternal className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExportPrivateKey(b.session_pubkey)}
                          disabled={isExportingKey}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 self-start sm:self-auto"
                        >
                          <IconKey className="w-2.5 h-2.5 text-amber-400" />
                          <span>Export Key</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Export Private Key Modal */}
        {showExportModal && exportedKey && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="relative w-full max-w-lg bg-[#0c101a] border border-amber-500/70 rounded-2xl shadow-2xl p-5 text-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-950 text-amber-400 border border-amber-800">
                    <IconKey className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Session Keypair Backup (Self-Custody)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
                <IconLock className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>
                  <strong>Confidential</strong>: Never share this private key. Anyone with this key has direct control of the session wallet.
                </span>
              </div>

              <div>
                {exportedPubkey && (
                  <div className="mb-2 text-[11px] text-slate-400 font-mono">
                    <span>Session Address: </span>
                    <span className="text-cyan-300 font-bold">{exportedPubkey}</span>
                  </div>
                )}
                <label className="text-[11px] text-slate-400 block mb-1 font-mono">Base58 Private Key</label>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300 break-all select-all flex items-center justify-between gap-2">
                  <span>{exportedKey}</span>
                  <button
                    type="button"
                    onClick={copyExportedKey}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 transition-colors"
                  >
                    {copiedExportKey ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <IconCheck className="w-3 h-3" /> Copied
                      </span>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                <span className="font-bold text-white block">How to Import into Phantom:</span>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                  <li>Open Phantom &rarr; click top-left menu &rarr; click gear icon (<strong>Settings</strong>).</li>
                  <li>Tap <strong>Manage Accounts</strong> &rarr; <strong>Add / Connect Wallet</strong>.</li>
                  <li>Select <strong>Import Private Key</strong>.</li>
                  <li>Paste this key and name it <strong>&ldquo;MEME_CAT Bot&rdquo;</strong>.</li>
                </ol>
                <span className="text-[10px] text-emerald-400 block pt-1">
                  &check; You now have direct control inside Phantom even without this website!
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                I have saved my backup key
              </button>
            </div>
          </div>
        )}

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
                  <IconChartDip className="w-4 h-4 text-cyan-400" />
                  <span>Fibonacci Retracement Dip Spot</span>
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
                onChange={(e) => updateBotConfig({ buyAmountSol: parseFloat(e.target.value) || 0.01 })}
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
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <IconBolt className="w-3.5 h-3.5 text-emerald-400" />
                <span>Jito MEV Bundle</span>
              </span>
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
                    <IconTrash className="w-3.5 h-3.5" />
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
        </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {saveSuccess ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 animate-pulse">
              <IconCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Settings saved to bot backend!</span>
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
