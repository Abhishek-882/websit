import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';
import { IconClose } from './Icons';
import { RPC_ENDPOINTS, PUBLIC_NODE_RPC, PUBLIC_NODE_ALT } from '../config/rpc.js';

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
  const setSetFiles = useBotStore(s => s.setSetFiles);
  const setActiveSetFile = useBotStore(s => s.setActiveSetFile);

  const [solBal, setSolBal] = useState(null); // null = unverified/loading
  const [balLoading, setBalLoading] = useState(false);
  const debounceRef = useRef(null);
  const prevAddressRef = useRef(null);

  const address = publicKey?.toBase58();
  const short = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null;

  // Sync wallet address to store — debounced 300ms to avoid double-firing on mobile reconnect
  useEffect(() => {
    setConnected(address || null);
    if (!address) {
      // Only reset session state if a previously connected wallet was explicitly disconnected
      if (prevAddressRef.current) {
        setSessionBalance(0);
        setSessionPubkey(null);
      }
      prevAddressRef.current = null;
      return;
    }
    prevAddressRef.current = address;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Fire all 3 API calls in PARALLEL — no waiting for one before the next
      Promise.allSettled([
        botApi.getSession(address),
        botApi.getTrades(address),
        botApi.getSetFiles(address),
      ]).then(([sessionRes, tradesRes, setFilesRes]) => {
        // Session
        if (sessionRes.status === 'fulfilled') {
          const res = sessionRes.value;
          setSessionPubkey(res.sessionPubkey || null);
          setSessionBalance(res.balanceSol || 0);
          if (res.botConfig) setBotConfig(res.botConfig);
        } else {
          setSessionPubkey(null);
          setSessionBalance(0);
        }
        // Trades
        if (tradesRes.status === 'fulfilled') {
          const res = tradesRes.value;
          if (Array.isArray(res.trades)) setTrades(res.trades);
        }
        // Set Files
        if (setFilesRes.status === 'fulfilled') {
          const res = setFilesRes.value;
          const currentCached = useBotStore.getState().setFiles || [];
          if (Array.isArray(res.setFiles) && res.setFiles.length > 0) {
            setSetFiles(res.setFiles);
            const active = res.setFiles.find(f => f.isActive) || null;
            setActiveSetFile(active);
          } else if (currentCached.length > 0) {
            // Auto-heal: Server might have restarted or has empty setFiles, but localStorage has cached files
            Promise.all(currentCached.map(f => botApi.saveSetFile(address, f))).then(() => {
              const cachedActive = useBotStore.getState().activeSetFile;
              if (cachedActive?.isActive && cachedActive?.id) {
                botApi.activateSetFile(address, cachedActive.id).then(() => {
                  botApi.getSetFiles(address).then(r => {
                    if (r?.setFiles) {
                      setSetFiles(r.setFiles);
                      const act = r.setFiles.find(f => f.isActive) || null;
                      setActiveSetFile(act);
                    }
                  });
                });
              }
            });
          }
        }
      });
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [address]);

  // Fetch main wallet SOL balance with two-tier failover
  const fetchBalWithFallback = useCallback(async (pubkey) => {
    if (!pubkey) return;
    const addr = pubkey.toBase58 ? pubkey.toBase58() : String(pubkey);
    setBalLoading(true);

    // Tier 1: Same-Origin Backend Gateway (/api/rpc/balance/:address, <15ms, 0 CORS risk)
    try {
      const res = await fetch(`/api/rpc/balance/${addr}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.balanceSol === 'number') {
          setSolBal(data.balanceSol);
          setBalLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[Balance] Backend gateway balance unavailable, falling back to client RPC pool:', err.message);
    }

    // Tier 2: Direct Client PublicNode RPCs
    const clientEndpoints = [PUBLIC_NODE_RPC, PUBLIC_NODE_ALT];
    for (const ep of clientEndpoints) {
      try {
        const conn = new Connection(ep, 'confirmed');
        const lamports = await Promise.race([
          conn.getBalance(new PublicKey(addr)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout (5s)')), 5000)),
        ]);
        setSolBal(lamports / LAMPORTS_PER_SOL);
        setBalLoading(false);
        return;
      } catch (err) {
        console.warn(`[Balance] Public node ${ep} failed:`, err.message);
      }
    }

    setBalLoading(false);
  }, []);

  // Fetch balance on connect, poll every 30s (reduced from 15s — saves mobile data/battery)
  useEffect(() => {
    if (!publicKey) return;
    fetchBalWithFallback(publicKey);
    const id = setInterval(() => fetchBalWithFallback(publicKey), 30000);
    return () => clearInterval(id);
  }, [publicKey, fetchBalWithFallback]);

  const [showMobileModal, setShowMobileModal] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isInAppBrowser = typeof window !== 'undefined' && Boolean(window.phantom?.solana || window.solana);

  const handleConnectClick = () => {
    if (isMobile && !isInAppBrowser) {
      setShowMobileModal(true);
    } else {
      setVisible(true);
    }
  };

  const phantomDeepLink = typeof window !== 'undefined'
    ? `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`
    : '#';

  const solflareDeepLink = typeof window !== 'undefined'
    ? `https://solflare.com/ul/v1/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`
    : '#';

  if (!connected) {
    return (
      <>
        <button
          onClick={handleConnectClick}
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

        {showMobileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  Connect Mobile Wallet
                </h3>
                <button
                  onClick={() => setShowMobileModal(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Mobile Safari & Chrome don't allow direct Web3 communication. Tap below to launch directly inside your wallet app:
              </p>

              <div className="space-y-2.5">
                <a
                  href={phantomDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-purple-950/60 border border-purple-700/50 hover:bg-purple-900/60 text-purple-200 text-xs font-bold transition-all shadow-md active:scale-98"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                    Open in Phantom App
                  </span>
                  <span className="text-[10px] text-purple-400 bg-purple-900/80 px-2 py-0.5 rounded font-mono">1-Tap</span>
                </a>

                <a
                  href={solflareDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-amber-950/60 border border-amber-700/50 hover:bg-amber-900/60 text-amber-200 text-xs font-bold transition-all shadow-md active:scale-98"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    Open in Solflare App
                  </span>
                  <span className="text-[10px] text-amber-400 bg-amber-900/80 px-2 py-0.5 rounded font-mono">1-Tap</span>
                </a>

                <button
                  onClick={() => {
                    setShowMobileModal(false);
                    setVisible(true);
                  }}
                  className="w-full text-center py-2.5 text-xs text-slate-400 hover:text-white transition-colors border border-slate-800 rounded-lg bg-slate-950/50"
                >
                  Standard Wallet Selector
                </button>
              </div>
            </div>
          </div>
        )}
      </>
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
          <span className="text-[10px] text-slate-400">
            {solBal !== null ? `${solBal.toFixed(3)} SOL` : (balLoading ? '... SOL' : '-- SOL')}
          </span>
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
