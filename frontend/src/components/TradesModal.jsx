import React, { useState } from 'react';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';

export default function TradesModal({ isOpen, onClose }) {
  const trades = useBotStore(s => s.trades);
  const setTrades = useBotStore(s => s.setTrades);
  const connectedWallet = useBotStore(s => s.connectedWallet);

  const [sellingId, setSellingId] = useState(null);
  const [manualAddress, setManualAddress] = useState('');
  const [manualAmount, setManualAmount] = useState('0.1');
  const [isBuying, setIsBuying] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!isOpen) return null;

  const refreshTrades = async () => {
    if (!connectedWallet) return;
    try {
      const res = await botApi.getTrades(connectedWallet);
      if (Array.isArray(res.trades)) setTrades(res.trades);
    } catch { /* ignore */ }
  };

  const handleManualBuy = async (e) => {
    e.preventDefault();
    if (!connectedWallet) {
      alert('Connect wallet first.');
      return;
    }
    if (!manualAddress) {
      alert('Enter token contract address.');
      return;
    }
    setIsBuying(true);
    setFeedback('Routing swap on Jupiter v6...');
    try {
      const res = await botApi.manualBuy({
        userWallet: connectedWallet,
        tokenAddress: manualAddress.trim(),
        coinSymbol: 'MANUAL',
        amountSol: parseFloat(manualAmount) || 0.1,
        slippageBps: 500,
      });
      if (res.success) {
        setFeedback(`✓ Purchased! Tx: ${res.txSignature?.slice(0, 8)}...`);
        setManualAddress('');
        refreshTrades();
      } else {
        setFeedback(`Failed: ${res.error}`);
      }
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsBuying(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleSellPosition = async (trade) => {
    if (!connectedWallet) return;
    if (!confirm(`Sell 100% position of ${trade.coin_symbol || 'token'}?`)) return;

    setSellingId(trade.id);
    try {
      const res = await botApi.manualSell({
        userWallet: connectedWallet,
        tokenAddress: trade.coin_address,
        tokenAmount: trade.token_amount,
        slippageBps: 500,
      });
      if (res.success) {
        alert(`Sold successfully! Tx: ${res.txSignature?.slice(0, 8)}...`);
        refreshTrades();
      } else {
        alert(`Sell error: ${res.error}`);
      }
    } catch (err) {
      alert(`Sell failed: ${err.message}`);
    } finally {
      setSellingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0e1422] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-6 my-auto text-slate-100 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-slate-950 font-bold text-lg">
              💼
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Active Positions &amp; Trades</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {trades.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Paced buy executions, take-profit triggers, and manual sell controls.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshTrades}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh Trades"
            >
              🔄 Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Manual Instant Buy Bar */}
        <form onSubmit={handleManualBuy} className="mb-4 p-3 rounded-xl bg-[#090d16] border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Paste token contract address to quick-buy..."
              value={manualAddress}
              onChange={e => setManualAddress(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={manualAmount}
              onChange={e => setManualAmount(e.target.value)}
              className="w-20 px-2 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white text-center"
              title="Amount in SOL"
            />
            <span className="text-xs font-mono text-slate-400">SOL</span>
            <button
              type="submit"
              disabled={isBuying || !connectedWallet}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50 shrink-0"
            >
              {isBuying ? 'Buying...' : '⚡ Quick Buy'}
            </button>
          </div>
        </form>

        {feedback && (
          <div className="mb-3 p-2 rounded bg-slate-900 border border-cyan-800 text-cyan-300 text-xs font-mono">
            {feedback}
          </div>
        )}

        {/* Trades Table */}
        {!connectedWallet ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Connect your wallet to inspect positions and past trades.
          </div>
        ) : trades.length === 0 ? (
          <div className="py-12 text-center bg-[#090d16] rounded-xl border border-slate-800 space-y-2">
            <div className="text-3xl">📜</div>
            <h3 className="text-sm font-bold text-white">No trades executed yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Activate the bot, fund your session wallet, and trades will automatically execute when tokens pass your criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#090d16] border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="p-3">Token</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">TP Triggers</th>
                  <th className="p-3">Time</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {trades.map((trade) => {
                  const shortCoin = trade.coin_address
                    ? `${trade.coin_address.slice(0, 4)}...${trade.coin_address.slice(-4)}`
                    : '';
                  const shortSig = trade.tx_signature
                    ? `${trade.tx_signature.slice(0, 4)}...${trade.tx_signature.slice(-4)}`
                    : null;
                  const isOpen = trade.status === 'open' || !trade.status;

                  return (
                    <tr key={trade.id || trade.coin_address} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white text-xs">{trade.coin_symbol || 'TOKEN'}</div>
                        <span className="text-[10px] text-slate-400">{shortCoin}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-bold">{trade.amount_sol ? parseFloat(trade.amount_sol).toFixed(3) : '-'} SOL</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isOpen ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isOpen ? 'OPEN' : 'CLOSED'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className={`px-1.5 py-0.2 rounded font-bold ${trade.tp1_hit ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                            TP1
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-bold ${trade.tp2_hit ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                            TP2
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-bold ${trade.tp3_hit ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                            TP3
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-[11px] text-slate-400">
                        {trade.created_at ? new Date(trade.created_at).toLocaleTimeString() : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {shortSig && (
                            <a
                              href={`https://solscan.io/tx/${trade.tx_signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:underline text-[11px]"
                            >
                              {shortSig} ↗
                            </a>
                          )}
                          {isOpen && (
                            <button
                              onClick={() => handleSellPosition(trade)}
                              disabled={sellingId === trade.id}
                              className="px-2.5 py-1 rounded bg-rose-600/30 border border-rose-600/60 hover:bg-rose-600/50 text-rose-200 text-xs font-bold transition-all disabled:opacity-50"
                            >
                              {sellingId === trade.id ? 'Selling...' : 'Sell'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 mt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
