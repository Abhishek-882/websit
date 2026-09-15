import React, { useState, useEffect, useRef } from 'react';

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export default function TokenTable({
  tokens,
  isScanning,
  totalTokensCount,
  highlightedAddress,
  onResetFilters,
}) {
  const [copiedAddress, setCopiedAddress] = useState(null);
  const rowRefs = useRef({});

  // Auto-scroll and focus when a token is highlighted from a toast alert
  useEffect(() => {
    if (highlightedAddress && rowRefs.current[highlightedAddress]) {
      const el = rowRefs.current[highlightedAddress];
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedAddress]);

  const handleCopy = (address, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1800);
  };

  // State 1: Cold start / initial discovery scan
  if (totalTokensCount === 0 && isScanning) {
    return (
      <div className="bg-[#0e1422] rounded-xl border border-slate-800 p-12 text-center shadow-lg">
        <div className="inline-flex items-center justify-center p-3 bg-cyan-950/60 rounded-full mb-4 border border-cyan-800/40">
          <svg className="animate-spin h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          ● Scanning Solana DEX for active tokens...
        </h3>
        <p className="text-xs text-slate-400 font-mono">
          [100% Live Telemetry • Zero Hardcoded Fallbacks • Pre-filtering Liquidity &gt; $1,000]
        </p>
      </div>
    );
  }

  // State 2: No tokens match active filter panel
  if (tokens.length === 0) {
    return (
      <div className="bg-[#0e1422] rounded-xl border border-slate-800 p-12 text-center shadow-lg">
        <div className="inline-flex items-center justify-center p-3 bg-slate-800/60 rounded-full mb-4 border border-slate-700">
          <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          No tokens currently match your active filters.
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Try relaxing Market Cap, Age, Smart Money, or Dev criteria to view more candidates.
        </p>
        <button
          onClick={onResetFilters}
          className="text-xs px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-all shadow-md"
        >
          Reset All Filters
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#0e1422] rounded-xl border border-slate-800 shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0a0e18] border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
              <th className="py-3 px-4"># Token</th>
              <th className="py-3 px-3">Market Cap</th>
              <th className="py-3 px-3">Age</th>
              <th className="py-3 px-3">
                <span className="text-emerald-400">Smart Money</span>
                <span className="block text-[9px] text-slate-400 font-normal normal-case">≥ $50 Holding</span>
              </th>
              <th className="py-3 px-3">
                <span className="text-purple-400">KOL</span>
                <span className="block text-[9px] text-slate-400 font-normal normal-case">≥ $50 Holding</span>
              </th>
              <th className="py-3 px-3">
                <span className="text-amber-400">Fund in Dev</span>
                <span className="block text-[9px] text-slate-400 font-normal normal-case">CEX &amp; SOL Balance</span>
              </th>
              <th className="py-3 px-3">Liquidity / Vol</th>
              <th className="py-3 px-4 text-right">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {tokens.map((token, idx) => {
              const isHighlighted = highlightedAddress === token.address;
              const devFund = token.devFund || {};
              const smartCount = token.smartMoneyCount;
              const kolCount = token.kolCount;
              const isEnriched = Boolean(token.enrichedAt && token.enrichedAt > 0);

              return (
                <tr
                  key={token.address}
                  ref={el => (rowRefs.current[token.address] = el)}
                  className={`transition-colors hover:bg-slate-800/40 ${
                    isHighlighted ? 'row-highlight-pulse' : ''
                  }`}
                >
                  {/* Token Identity */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-400 text-[11px] w-5">
                        {idx + 1}
                      </span>
                      {token.icon ? (
                        <img
                          src={token.icon}
                          alt={token.symbol}
                          className="w-7 h-7 rounded-full bg-slate-800 object-cover border border-slate-700"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                          {token.symbol ? token.symbol.slice(0, 2).toUpperCase() : '??'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white tracking-wide text-xs">
                            ${token.symbol}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate max-w-[110px]">
                            {token.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-400">
                            {token.address.slice(0, 4)}...{token.address.slice(-4)}
                          </span>
                          <button
                            onClick={e => handleCopy(token.address, e)}
                            title="Copy Contract Address"
                            className="text-slate-400 hover:text-cyan-400 transition-colors"
                          >
                            {copiedAddress === token.address ? (
                              <span className="text-[10px] text-emerald-400 font-bold">✓ Copied</span>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>

                        {/* Direct GMGN & DexScreener Links Below Token */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <a
                            href={`https://gmgn.ai/sol/token/${token.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-bold text-[10px] transition-all hover:scale-105 shadow-sm"
                            title="Open in GMGN.ai"
                          >
                            <span>GMGN</span>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          {token.url && (
                            <a
                              href={token.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-200 text-[10px] transition-colors"
                              title="Open in DexScreener"
                            >
                              <span>DexScreener ↗</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 1. Market Cap */}
                  <td className="py-3 px-3">
                    <div className="font-mono font-bold text-slate-100 text-xs">
                      {formatCurrency(token.marketCap)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ${Number(token.priceUsd || 0).toFixed(6)}
                    </div>
                  </td>

                  {/* 2. Age */}
                  <td className="py-3 px-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-medium">
                      {token.ageFormatted || '--'}
                    </span>
                  </td>

                  {/* 3. Smart Money (Strict active holding >= $50) */}
                  <td className="py-3 px-3">
                    {!isEnriched ? (
                      <span className="text-[11px] text-slate-400 italic">Queueing...</span>
                    ) : smartCount > 0 ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 font-bold text-xs font-mono">
                          <span>💎</span>
                          <span>{smartCount} holding</span>
                          {token.smartMoneySoldCount > 0 && (
                            <span className="text-slate-400 font-normal text-[10px]">· {token.smartMoneySoldCount} sold</span>
                          )}
                        </span>
                        {token.smartHolders && token.smartHolders.length > 0 && (
                          <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                            Top: {formatCurrency(token.smartHolders[0].usdValue)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="font-mono text-xs">
                        <span className="text-slate-400">0 holding</span>
                        {token.smartMoneySoldCount > 0 && (
                          <span className="text-rose-400/80 text-[11px] ml-1 font-semibold">
                            ({token.smartMoneySoldCount} sold)
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 4. KOL (Strict active holding >= $50) */}
                  <td className="py-3 px-3">
                    {!isEnriched ? (
                      <span className="text-[11px] text-slate-400 italic">Queueing...</span>
                    ) : kolCount > 0 ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/70 border border-purple-800/80 text-purple-300 font-bold text-xs font-mono">
                          <span>📣</span>
                          <span>{kolCount} holding</span>
                          {token.kolSoldCount > 0 && (
                            <span className="text-slate-400 font-normal text-[10px]">· {token.kolSoldCount} sold</span>
                          )}
                        </span>
                        {token.kolHolders && token.kolHolders[0] && (
                          <div className="text-[10px] text-purple-400 font-mono mt-0.5 truncate max-w-[120px]">
                            @{token.kolHolders[0].twitterUsername || token.kolHolders[0].name || 'KOL'} ({formatCurrency(token.kolHolders[0].usdValue)})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="font-mono text-xs">
                        <span className="text-slate-400">0 holding</span>
                        {token.kolSoldCount > 0 && (
                          <span className="text-rose-400/80 text-[11px] ml-1 font-semibold">
                            ({token.kolSoldCount} sold)
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 5. Fund in Dev */}
                  <td className="py-3 px-3">
                    {!isEnriched ? (
                      <span className="text-[11px] text-slate-400 italic">Queueing...</span>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {devFund.isCexFunded ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80">
                              {devFund.fundingSource}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {devFund.fundingSource || 'Direct'}
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            devFund.isDumped
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                              : devFund.isCto
                              ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                          }`}>
                            {devFund.devStatus || 'Holding'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Dev SOL: {devFund.devBalanceSol !== null && devFund.devBalanceSol !== undefined ? `${devFund.devBalanceSol} SOL` : '--'}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Liquidity / Volume */}
                  <td className="py-3 px-3">
                    <div className="text-[11px] font-mono text-slate-300 font-medium">
                      Liq: {formatCurrency(token.liquidityUsd)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      24h Vol: {formatCurrency(token.volume24h)}
                    </div>
                  </td>

                  {/* External Links */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={token.url || `https://dexscreener.com/solana/${token.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-[11px] font-mono transition-colors border border-slate-700"
                        title="View on DexScreener"
                      >
                        Dex
                      </a>
                      <a
                        href={`https://gmgn.ai/sol/token/${token.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 text-[11px] font-mono transition-colors border border-slate-700"
                        title="View on GMGN.ai"
                      >
                        GMGN
                      </a>
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
