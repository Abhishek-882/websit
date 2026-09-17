import React, { useEffect, useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';
import { IconClose } from './Icons';

export default function WalletConnector() {
  const { setVisible } = useWalletModal();
  const { publicKey, disconnect, connected, wallet } = useWallet();
  const { connection } = useConnection();

  const setConnected = useBotStore(s => s.setConnectedWallet);
  const sessionPubkey = useBotStore(s => s.sessionPubkey);
  const sessionBalance = useBotStore(s => s.sessionBalanceSol);
  const setSessionPubkey = useBotStore(s => s.setSessionPubkey);
  const setSessionBalance = useBotStore(s => s.setSessionBalance);
  const setBotConfig = useBotStore(s => s.setBotConfig);
  const setTrades = useBotStore(s => s.setTrades);

  const [solBal, setSolBal] = useState(0);

  const address = publicKey?.toBase58();
  const short = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null;

  // Sync wallet address to store
  useEffect(() => {
    setConnected(address || null);
    if (!address) {
      setSessionBalance(0);
      return;
    }

    // Fetch existing session wallet & trades on connect
    botApi.getSession(address)
      .then(res => {
        if (res.sessionPubkey) setSessionPubkey(res.sessionPubkey);
        if (res.balanceSol !== undefined) setSessionBalance(res.balanceSol);
        if (res.botConfig) setBotConfig(res.botConfig);
      })
      .catch(() => {});

    botApi.getTrades(address)
      .then(res => {
        if (Array.isArray(res.trades)) setTrades(res.trades);
      })
      .catch(() => {});
  }, [address]);

  // Fetch main wallet SOL balance
  useEffect(() => {
    if (!publicKey || !connection) return;
    const fetchBal = () => {
      connection.getBalance(publicKey)
        .then(b => setSolBal(b / LAMPORTS_PER_SOL))
        .catch(() => {});
    };
    fetchBal();
    const id = setInterval(fetchBal, 15000);
    return () => clearInterval(id);
  }, [publicKey, connection]);

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
        title="Connect Phantom / Solflare wallet"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className="hidden xs:inline">Connect Wallet</span>
        <span className="xs:hidden">Connect</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Session wallet indicator */}
      {sessionPubkey && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700/70 text-emerald-300 text-xs font-mono font-bold shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Bot: {sessionBalance.toFixed(3)} SOL</span>
        </div>
      )}

      {/* Connected Main Wallet */}
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/90 shadow-sm text-xs">
        <img
          src={wallet?.adapter?.icon || ''}
          alt=""
          className="w-4 h-4 rounded"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <div className="flex flex-col leading-tight font-mono">
          <span className="text-white font-semibold">{short}</span>
          <span className="text-[10px] text-slate-400">{solBal.toFixed(3)} SOL</span>
        </div>
        <button
          onClick={disconnect}
          title="Disconnect Wallet"
          className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
          aria-label="Disconnect Wallet"
        >
          <IconClose className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
