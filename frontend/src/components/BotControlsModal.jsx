import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';
import {
  IconBot,
  IconClose,
  IconInfo,
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
  IconAlertTriangle,
} from './Icons';

const DEPOSIT_PRESETS = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0];

import SetFileManager from './SetFileManager';
import { getRecentBlockhashWithFallback, confirmTransactionWithFallback } from '../config/rpc.js';

export default function BotControlsModal({ isOpen, onClose }) {
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

  const botConfig = useBotStore(s => s.botConfig);

  const sessionPubkey = useBotStore(s => s.sessionPubkey);
  const sessionBalance = useBotStore(s => s.sessionBalanceSol);
  const setSessionPubkey = useBotStore(s => s.setSessionPubkey);
  const setSessionBalance = useBotStore(s => s.setSessionBalance);
  const connectedWallet = useBotStore(s => s.connectedWallet);
  const activeSetFile = useBotStore(s => s.activeSetFile);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Tab state: 'setFiles' (primary strategy profiles) | 'session' (delegated wallet & funding)
  const [activeTab, setActiveTab] = useState('setFiles');

  // Execution Engine state: 'jupiter' (Active / Live) | 'phantom_agent' (Under Development)
  const [executionEngine, setExecutionEngine] = useState('jupiter');

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

  // Import Session Key state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState('');
  const [isImportingKey, setIsImportingKey] = useState(false);
  const [isReactivatingKey, setIsReactivatingKey] = useState(false);

  // Backup Vault state
  const [backups, setBackups] = useState([]);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await botApi.getSessionBackups(connectedWallet || 'current');
      if (res?.backups) setBackups(res.backups);
    } catch (err) {
      console.warn('Failed to load session backups:', err.message);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBackups();
    }
  }, [isOpen, connectedWallet]);

  if (!isOpen) return null;

  const handleImportSessionKey = async () => {
    if (!importKeyInput || !importKeyInput.trim()) {
      alert('Please enter a valid Base58 private key.');
      return;
    }
    setIsImportingKey(true);
    setStatusMsg('Importing and activating session keypair...');
    try {
      const res = await botApi.importSession(importKeyInput.trim(), connectedWallet);
      setSessionPubkey(res.sessionPubkey);
      setSessionBalance(res.balanceSol || 0);
      setShowImportModal(false);
      setImportKeyInput('');
      setStatusMsg(`Session wallet imported! Public Key: ${res.sessionPubkey.slice(0, 6)}... (Balance: ${res.balanceSol?.toFixed(4) || '0.0000'} SOL)`);
      setTimeout(() => setStatusMsg(null), 5000);
      loadBackups();
    } catch (err) {
      alert(`Failed to import session key: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setIsImportingKey(false);
    }
  };

  const handleReactivateSession = async (pubkey) => {
    if (!pubkey) return;
    setIsReactivatingKey(true);
    setStatusMsg(`Reactivating session ${pubkey.slice(0, 6)}...`);
    try {
      const res = await botApi.reactivateSession(pubkey, connectedWallet);
      setSessionPubkey(res.sessionPubkey);
      setSessionBalance(res.balanceSol || 0);
      setStatusMsg(`Session ${pubkey.slice(0, 6)}... reactivated! Balance: ${res.balanceSol?.toFixed(4) || '0.0000'} SOL`);
      setTimeout(() => setStatusMsg(null), 5000);
      loadBackups();
    } catch (err) {
      alert(`Failed to reactivate session: ${err.message}`);
      setStatusMsg(null);
    } finally {
      setIsReactivatingKey(false);
    }
  };

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
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(sessionPubkey),
          lamports,
        })
      );

      // Pre-populate feePayer and recentBlockhash with multi-RPC fallback
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight, connection: healthyConn } = await getRecentBlockhashWithFallback(connection);
      tx.recentBlockhash = blockhash;

      const signature = await sendTransaction(tx, healthyConn || connection);
      setStatusMsg(`Confirming deposit on Solana Mainnet (${signature.slice(0, 8)}...)...`);

      // 1. Wait for signature confirmation polling (up to 20s)
      try {
        await confirmTransactionWithFallback(signature, healthyConn || connection, 20000);
      } catch (confirmErr) {
        console.warn('[Deposit] Client confirmation loop notice:', confirmErr.message);
        if (confirmErr.message?.includes('Transaction failed on-chain')) {
          throw confirmErr;
        }
      }

      // 2. Verify on backend and update session balance (with retry loop)
      setStatusMsg(`Verifying deposit on-chain...`);
      let verified = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await botApi.verifyDeposit(connectedWallet, signature);
          if (res?.success && typeof res.balanceSol === 'number' && res.balanceSol > 0) {
            setSessionBalance(res.balanceSol);
            setStatusMsg(`Successfully deposited ${solVal} SOL! Live balance: ${res.balanceSol.toFixed(4)} SOL`);
            setTimeout(() => setStatusMsg(null), 5000);
            verified = true;
            break;
          }
        } catch (err) {
          console.warn('[Deposit] Backend verify attempt notice:', err.message);
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!verified) {
        const sessionRes = await botApi.getSession(connectedWallet);
        if (sessionRes?.balanceSol > 0) {
          setSessionBalance(sessionRes.balanceSol);
          setStatusMsg(`Deposit confirmed! Live balance: ${sessionRes.balanceSol.toFixed(4)} SOL`);
          setTimeout(() => setStatusMsg(null), 5000);
        } else {
          setStatusMsg(`Deposit broadcasted (${signature.slice(0, 8)}...). Refreshing balance in a few moments...`);
          setTimeout(() => setStatusMsg(null), 6000);
        }
      }
    } catch (err) {
      console.error('Deposit error:', err);
      if (err.message?.includes('User rejected')) {
        setStatusMsg(null);
      } else {
        alert(`Deposit notice: ${err.message}`);
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

        {/* Execution Engine Selector (Jupiter vs Full Phantom Agent) */}
        <div className="mb-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <IconBolt className="w-3.5 h-3.5 text-cyan-400" />
              <span>Execution Engine</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Choose automated trading backend
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Option 1: Jupiter Limit Engine */}
            <button
              type="button"
              onClick={() => setExecutionEngine('jupiter')}
              className={`p-2.5 rounded-lg border text-left transition-all relative ${
                executionEngine === 'jupiter'
                  ? 'bg-cyan-950/40 border-cyan-500/80 text-white ring-1 ring-cyan-500/40 shadow-sm shadow-cyan-950/50'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                  <IconBolt className="w-3 h-3 text-cyan-400" />
                  <span>Jupiter Limit Engine</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                  Active / Live
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Sub-second delegated session keypair with on-chain Jupiter v2 limit order exits (zero API delay).
              </p>
            </button>

            {/* Option 2: Full Phantom Agent (KMS) */}
            <button
              type="button"
              onClick={() => setExecutionEngine('phantom_agent')}
              className={`p-2.5 rounded-lg border text-left transition-all relative ${
                executionEngine === 'phantom_agent'
                  ? 'bg-purple-950/40 border-purple-500/80 text-white ring-1 ring-purple-500/40 shadow-sm shadow-purple-950/50'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1">
                  <IconShield className="w-3 h-3 text-purple-400" />
                  <span>Full Phantom Agent</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950/90 text-amber-300 border border-amber-800/80 font-semibold animate-pulse">
                  Under Development
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Official Phantom MCP / CLI agent wallet. TEE/HSM KMS security, 0% platform swap fees &amp; Hyperliquid perps.
              </p>
            </button>
          </div>

          {executionEngine === 'phantom_agent' && (
            <div className="p-2 rounded bg-amber-950/30 border border-amber-800/50 text-amber-300 text-[11px] font-mono flex items-center gap-2">
              <IconAlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Under Development:</strong> Official Phantom MCP Server / CLI integration is currently in progress. Active trades and session orders continue running on the high-speed Jupiter Limit Engine.
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('setFiles')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'setFiles' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Strategy Profiles (Set Files)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('session')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'session' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Session &amp; Wallet
          </button>
        </div>

        {activeTab === 'setFiles' && <SetFileManager />}
        
        {activeTab === 'session' && (
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
                    {/* Import Session Key Button */}
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition-all flex items-center gap-1"
                      title="Import an existing session private key"
                    >
                      <IconKey className="w-3 h-3 text-cyan-400" />
                      <span>Import Key</span>
                    </button>

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
              <div>
                <span className="text-xs text-slate-300 font-semibold block">
                  No active session wallet
                </span>
                <span className="text-[11px] text-slate-400">
                  Generate a fresh trading keypair or import your existing session key to enable 24/7 background execution.
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold text-xs transition-all flex items-center gap-1.5"
                >
                  <IconKey className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Import Key</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Fresh Session'}
                </button>
              </div>
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
                        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                          {b.session_pubkey !== sessionPubkey && (
                            <button
                              type="button"
                              onClick={() => handleReactivateSession(b.session_pubkey)}
                              disabled={isReactivatingKey}
                              className="px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900/90 border border-emerald-800 text-emerald-300 text-[11px] font-semibold transition-all flex items-center gap-1"
                              title="Restore and activate this session"
                            >
                              <IconBolt className="w-2.5 h-2.5 text-emerald-400" />
                              <span>{isReactivatingKey ? 'Activating...' : 'Re-activate'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleExportPrivateKey(b.session_pubkey)}
                            disabled={isExportingKey}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1"
                          >
                            <IconKey className="w-2.5 h-2.5 text-amber-400" />
                            <span>Export Key</span>
                          </button>
                        </div>
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

        {/* Import Session Key Modal */}
        {showImportModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="relative w-full max-w-lg bg-[#0c101a] border border-cyan-500/70 rounded-2xl shadow-2xl p-5 text-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
                    <IconKey className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Import Session Keypair</h3>
                    <p className="text-[11px] text-slate-400">Restore your session wallet and on-chain funds</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowImportModal(false); setImportKeyInput(''); }}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 text-xs flex items-start gap-2">
                <IconShield className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                <span>
                  Paste your Base58 session private key below. It will be encrypted with AES-256 and securely bound to your email account and connected Phantom wallet.
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-slate-400 block font-mono">
                  Solana Base58 Private Key
                </label>
                <textarea
                  rows={3}
                  value={importKeyInput}
                  onChange={(e) => setImportKeyInput(e.target.value)}
                  placeholder="Paste your 87-88 character Base58 private key here (e.g. 24VY3xrMzgPd5yp...)"
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-300 focus:border-cyan-400 focus:outline-none placeholder:text-slate-600 resize-none break-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowImportModal(false); setImportKeyInput(''); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSessionKey}
                  disabled={isImportingKey || !importKeyInput.trim()}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5 shadow"
                >
                  <IconCheck className="w-3.5 h-3.5" />
                  <span>{isImportingKey ? 'Importing & Verifying...' : 'Import & Activate Session'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

            {/* Active Strategy Profile Overview Card */}
            <div className="p-4 rounded-xl bg-[#080c14] border border-slate-800 mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Active Strategy Profile
                  </span>
                  {activeSetFile ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ACTIVE: {activeSetFile.name}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/50 text-amber-300 flex items-center gap-1">
                      <IconAlertTriangle className="w-3 h-3 text-amber-400" />
                      NO PROFILE ACTIVE (PAUSED)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('setFiles')}
                  className="px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-700/60 hover:border-cyan-500 text-cyan-300 text-xs font-bold transition-colors self-start sm:self-auto"
                >
                  {activeSetFile ? 'Switch / Edit Profiles' : 'Select Strategy Profile'}
                </button>
              </div>

              {activeSetFile ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    All autonomous execution parameters, trade size, slippage, and TP/SL exit ladders are driven directly by this profile.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-sans">Trade Size</span>
                      <span className="font-bold text-white text-sm">
                        {activeSetFile.tradeSizeSol || 0.1} SOL
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-sans">Order Type</span>
                      <span className="font-bold text-cyan-300 uppercase">
                        {activeSetFile.orderType || 'market'}
                        {activeSetFile.orderType === 'limit' && ` (-${activeSetFile.limitDipPct || 20}%)`}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-sans">Slippage</span>
                      <span className="font-bold text-amber-300">
                        {((activeSetFile.slippageBps || 500) / 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-sans">Gas / MEV</span>
                      <span className="font-bold text-emerald-300 uppercase">
                        {activeSetFile.feeSpeed || 'fast'} {activeSetFile.useJito !== false ? '• Jito' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Take Profit</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {activeSetFile.tpPct ? `+${activeSetFile.tpPct}%` : 'Off'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Stop Loss</span>
                        <span className="font-mono font-bold text-rose-400">
                          {activeSetFile.slPct ? `-${activeSetFile.slPct}%` : 'Off'}
                        </span>
                      </div>
                      {activeSetFile.trailingStop && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Trailing Stop</span>
                          <span className="font-mono font-bold text-cyan-400">
                            -{activeSetFile.trailingStopPct || 10}%
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('setFiles')}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold"
                    >
                      Adjust Profile Rules &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-2 text-xs">
                  <p className="text-amber-200">
                    No strategy profile is currently active. The bot is paused and will <strong>not</strong> auto-buy incoming tokens until you activate a profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('setFiles')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
                  >
                    Go to Strategy Profiles to Activate One
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <span className="text-xs text-slate-400 font-mono">
            Autonomous bot runs 24/7 on backend
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
