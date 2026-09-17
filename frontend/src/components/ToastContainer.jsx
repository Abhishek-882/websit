import React from 'react';
import { IconSignal } from './Icons';

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export default function ToastContainer({ activeToast, onDismiss, onView }) {
  if (!activeToast) return null;

  const { token, title, message } = activeToast;
  const cleanTitle = (title || `Signal Match: $${token?.symbol || 'TOKEN'}`).replace(/^🔥\s*/, '');

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm z-50 animate-bounce-in">
      <div className="bg-[#0f172a] border-2 border-cyan-500/80 rounded-xl p-4 shadow-2xl shadow-cyan-950/60 backdrop-blur-md">
        
        {/* Top: Header with close */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <IconSignal className="w-4 h-4 text-cyan-400 shrink-0" />
            <h4 className="text-xs font-bold text-white tracking-wide">
              {cleanTitle}
            </h4>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Middle: Details */}
        <div className="text-xs text-slate-300 space-y-1 mb-3 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Market Cap:</span>
            <span className="font-mono font-bold text-cyan-300">
              {formatCurrency(token?.marketCap)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Smart Money:</span>
            <span className="font-mono font-bold text-emerald-400">
              {token?.smartMoneyCount ?? 0} holding
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Dev Origin:</span>
            <span className="font-mono font-medium text-amber-300 truncate max-w-[130px]">
              {token?.devFund?.fundingDisplay || 'Direct'}
            </span>
          </div>
        </div>

        {/* Bottom: Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="text-xs px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => onView(token?.address)}
            className="text-xs px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold hover:brightness-110 transition-all shadow-md flex items-center gap-1"
          >
            <span>View Token</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}
