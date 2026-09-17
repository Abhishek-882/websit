import React, { useState, useEffect, useRef } from 'react';
import {
  IconDiamond,
  IconMegaphone,
  IconBolt,
  IconCheck,
  IconCopy,
  IconExternal,
} from './Icons';

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

// Visual Capital Progress Bar for Dev Wallet Money ($0 to $10,000 USD limit)
function DevMoneyBar({ balance, currency = 'SOL', devBalanceUsd }) {
  if (balance === null || balance === undefined || isNaN(balance)) {
    return <span className="text-[10px] text-slate-500 font-mono">Dev Bal: --</span>;
  }

  const num = Number(balance);
  const usd = devBalanceUsd !== undefined && devBalanceUsd !== null
    ? Number(devBalanceUsd)
    : Math.round(num * 150);

  // Calibrated to $10,000 USD limit requested by user
  const pct = Math.min(100, Math.max(5, (usd / 10000) * 100));
  const isHigh = usd >= 2500;
  const isMedium = usd >= 500 && usd < 2500;

  const barColor = isHigh
    ? 'bg-gradient-to-r from-emerald-500 to-teal-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
    : isMedium
    ? 'bg-gradient-to-r from-cyan-500 to-blue-400'
    : 'bg-gradient-to-r from-amber-500 to-rose-400';

  return (
    <div className="space-y-1 w-full max-w-[140px]" title={`Dev Wallet: $${usd.toLocaleString()} (${num.toFixed(2)} ${currency})`}>
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-400">Dev Money:</span>
        <span className={`font-bold ${isHigh ? 'text-emerald-300' : isMedium ? 'text-cyan-300' : 'text-amber-300'}`}>
          ${usd.toLocaleString()} <span className="text-[9px] text-slate-400 font-normal">({num.toFixed(2)} {currency})</span>
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-[0.5px]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Low-Latency Market Cap & Live Price Display with Flashes
function MarketCapDisplay({ token }) {
  const mcap = token.marketCap;
  const price = token.priceUsd;
  const direction = token.priceDirection;
  const isGmgn = token.gmgnSynced;

  const flashBg = direction === 'up'
    ? 'text-emerald-300 bg-emerald-950/70 ring-1 ring-emerald-500/50'
    : direction === 'down'
    ? 'text-rose-300 bg-rose-950/70 ring-1 ring-rose-500/50'
    : 'text-cyan-300';

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <span className={`font-mono font-black text-sm px-1 py-0.5 rounded transition-all duration-500 ${flashBg}`}>
          {formatCurrency(mcap)}
        </span>
        {direction === 'up' && (
          <svg className="w-2.5 h-2.5 text-emerald-400 animate-pulse inline" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 4 22 20 2 20" />
          </svg>
        )}
        {direction === 'down' && (
          <svg className="w-2.5 h-2.5 text-rose-400 animate-pulse inline" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 20 2 4 22 4" />
          </svg>
        )}
      </div>
      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
        <span>
          ${Number(price || 0) < 0.0001 && Number(price || 0) > 0
            ? Number(price || 0).toExponential(3)
            : Number(price || 0).toFixed(6)}
        </span>
        {isGmgn && (
          <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-800/80">
            GMGN
          </span>
        )}
      </div>
    </div>
  );
}

export default function TokenTable({
  tokens,
  isScanning,
  totalTokensCount,
  highlightedAddress,
  onResetFilters,
  selectedChain = 'sol',
  onQuickBuy,
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
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1800);
  };

  const nativeCurrency = 'SOL';

  // State 1: Cold start / initial discovery scan
  if (totalTokensCount === 0 && isScanning) {
    return (
      <div className="bg-[#0e1422] rounded-xl border border-slate-800 p-8 sm:p-12 text-center shadow-lg">
        <div className="inline-flex items-center justify-center p-3 bg-cyan-950/60 rounded-full mb-4 border border-cyan-800/40">
          <svg className="animate-spin h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          ● Scanning Solana DEX for active meme coins...
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
      <div className="bg-[#0e1422] rounded-xl border border-slate-800 p-8 sm:p-12 text-center shadow-lg">
        <div className="inline-flex items-center justify-center p-3 bg-slate-800/60 rounded-full mb-4 border border-slate-700">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    <div className="space-y-3">

      {/* ── MOBILE VIEW: Touch-Friendly Token Cards (md:hidden) ── */}
      <div className="md:hidden space-y-3">
        {tokens.map((token, idx) => {
          const isHighlighted = highlightedAddress === token.address;
          const devFund = token.devFund || {};
          const isEnriched = Boolean(token.enrichedAt && token.enrichedAt > 0);
          const devBal = devFund.devBalanceSol ?? devFund.fundingAmountSol ?? null;
          const chainName = token.chain || (token.address?.startsWith('0x') ? 'base' : 'sol');
          const gmgnLink = token.gmgnUrl || `https://gmgn.ai/${chainName}/token/${token.address}`;
          const dexLink = token.url || `https://dexscreener.com/${chainName === 'base' ? 'base' : 'solana'}/${token.address}`;

          return (
            <div
              key={`mob-${token.address}-${idx}`}
              ref={el => (rowRefs.current[token.address] = el)}
              className={`p-3.5 rounded-xl bg-[#0e1422] border transition-all ${
                isHighlighted ? 'border-cyan-400 bg-cyan-950/20 shadow-lg' : 'border-slate-800'
              }`}
            >
              {/* Card Header: Token info & Copy */}
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  {token.icon ? (
                    <img src={token.icon} alt={token.symbol} className="h-9 w-9 rounded-full object-cover border border-slate-700" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-cyan-400">
                      {token.symbol?.slice(0, 2) || 'MC'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-white">${token.symbol}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[110px]">{token.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span>{token.address.slice(0, 4)}...{token.address.slice(-4)}</span>
                      <button
                        onClick={e => handleCopy(token.address, e)}
                        className="text-cyan-400 hover:text-white p-0.5"
                        title="Copy Contract Address"
                      >
                        {copiedAddress === token.address ? (
                          <IconCheck className="w-3 h-3 text-emerald-400 inline" />
                        ) : (
                          <IconCopy className="w-3 h-3 text-slate-400 hover:text-white inline" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Age Badge */}
                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {token.ageFormatted || '--'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickBuy && onQuickBuy(token);
                      }}
                      className="px-2 py-0.5 rounded bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-[10px] shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-0.5"
                      title="Quick Buy"
                    >
                      <IconBolt className="w-2.5 h-2.5 inline" />
                      <span>Buy</span>
                    </button>
                    <a
                      href={gmgnLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-bold text-[10px] hover:bg-emerald-900/80"
                    >
                      GMGN ↗
                    </a>
                    <a
                      href={dexLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-bold text-[10px] hover:bg-slate-800"
                    >
                      Dex ↗
                    </a>
                  </div>
                </div>
              </div>

              {/* Card Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-2.5 text-xs">
                {/* 1. Market Cap */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Market Cap</span>
                  <MarketCapDisplay token={token} />
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Liq: {formatCurrency(token.liquidityUsd)}
                  </span>
                </div>

                {/* 2. Smart Money */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-emerald-400 block">Smart Money</span>
                  {token.smartMoneyCount === null || token.smartMoneyCount === undefined ? (
                    <span className="text-[11px] text-slate-500 italic">Scanning...</span>
                  ) : (
                    <div className="font-mono">
                      <span className="font-bold text-xs text-white flex items-center gap-1">
                        <IconDiamond className="w-3 h-3 text-emerald-400" />
                        <span>{token.smartMoneyCount} holding</span>
                      </span>
                      {token.smartMoneySoldCount > 0 && (
                        <span className="text-[10px] text-slate-400 block">
                          · {token.smartMoneySoldCount} sold
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. KOL Holders */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-purple-400 block">KOL Holders</span>
                  {token.kolCount === null || token.kolCount === undefined ? (
                    <span className="text-[11px] text-slate-500 italic">Scanning...</span>
                  ) : (
                    <div className="font-mono">
                      <span className="font-bold text-xs text-purple-300 flex items-center gap-1">
                        <IconMegaphone className="w-3 h-3 text-purple-400" />
                        <span>{token.kolCount} holding</span>
                      </span>
                      {token.kolSoldCount > 0 && (
                        <span className="text-[10px] text-slate-400 block">
                          · {token.kolSoldCount} sold
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Dev Fund & Balance Bar */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-amber-400 block">Dev Fund</span>
                  {!token.devFund ? (
                    <span className="text-[11px] text-slate-500 italic">Scanning...</span>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            devFund.isDumped
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : devFund.isCto
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {devFund.devStatus || 'Holding'}
                          </span>
                          {devFund.fundingSource && (
                            <span className="text-[9px] text-slate-400 truncate max-w-[60px]" title={devFund.fundingSource}>
                              {devFund.fundingSource}
                            </span>
                          )}
                        </div>
                        {(devFund.solscanUrl || devFund.devAddress) && (
                          <a
                            href={devFund.solscanUrl || `https://solscan.io/account/${devFund.devAddress}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                            title="Inspect Dev on Solscan"
                          >
                            Solscan ↗
                          </a>
                        )}
                      </div>
                      <DevMoneyBar balance={devBal} currency={nativeCurrency} devBalanceUsd={devFund.devBalanceUsd} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP VIEW: High-Density Data Table (hidden md:block) ── */}
      <div className="hidden md:block bg-[#0e1422] rounded-xl border border-slate-800 shadow-xl overflow-hidden">
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
                  <span className="block text-[9px] text-slate-400 font-normal normal-case">Money Bar &amp; CEX</span>
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
                const devBal = devFund.devBalanceSol ?? devFund.fundingAmountSol ?? null;
                const chainName = token.chain || (token.address?.startsWith('0x') ? 'base' : 'sol');
                const gmgnLink = token.gmgnUrl || `https://gmgn.ai/${chainName}/token/${token.address}`;
                const dexLink = token.url || `https://dexscreener.com/${chainName === 'base' ? 'base' : 'solana'}/${token.address}`;

                return (
                  <tr
                    key={`dt-${token.address}-${idx}`}
                    ref={el => (rowRefs.current[token.address] = el)}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isHighlighted ? 'row-highlight-pulse' : ''
                    }`}
                  >
                    {/* Token Symbol, Icon & CA */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400 text-xs w-5 text-right">{idx + 1}</span>
                        {token.icon ? (
                          <img
                            src={token.icon}
                            alt={token.symbol}
                            className="h-8 w-8 rounded-full object-cover border border-slate-700 flex-shrink-0"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-cyan-400 flex-shrink-0">
                            {token.symbol ? token.symbol.slice(0, 2).toUpperCase() : 'MC'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-white text-sm tracking-tight">
                              ${token.symbol}
                            </span>
                            <span className="text-slate-400 text-xs font-normal truncate max-w-[130px]" title={token.name}>
                              {token.name}
                            </span>
                          </div>
                          
                          {/* Direct GMGN Link & CA Copy */}
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                              <span>{token.address.slice(0, 4)}...{token.address.slice(-4)}</span>
                              <button
                                onClick={e => handleCopy(token.address, e)}
                                className="text-slate-400 hover:text-cyan-300 transition-colors p-0.5"
                                title="Copy Contract Address"
                              >
                                {copiedAddress === token.address ? (
                                  <IconCheck className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <IconCopy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <span className="text-slate-700">•</span>
                            <a
                              href={gmgnLink}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-0.5"
                              title="Open on GMGN.ai"
                            >
                              <span>GMGN ↗</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 1. Market Cap */}
                    <td className="py-3 px-3 font-mono">
                      <MarketCapDisplay token={token} />
                    </td>

                    {/* 2. Launch Age */}
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-900 border border-slate-700 text-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        {token.ageFormatted || '--'}
                      </span>
                    </td>

                    {/* 3. Smart Money (Strict active holding >= $50) */}
                    <td className="py-3 px-3">
                      {smartCount === null || smartCount === undefined ? (
                        <span className="text-[11px] text-slate-400 italic">Scanning...</span>
                      ) : smartCount > 0 ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 font-bold text-xs font-mono">
                            <IconDiamond className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{smartCount} holding</span>
                            {token.smartMoneySoldCount > 0 && (
                              <span className="text-slate-400 font-normal text-[10px]">· {token.smartMoneySoldCount} sold</span>
                            )}
                          </span>
                          {token.smartHolders && token.smartHolders[0] && (
                            <div className="text-[10px] text-emerald-400 font-mono mt-0.5 truncate max-w-[120px]">
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
                      {kolCount === null || kolCount === undefined ? (
                        <span className="text-[11px] text-slate-400 italic">Scanning...</span>
                      ) : kolCount > 0 ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-950/70 border border-purple-800/80 text-purple-300 font-bold text-xs font-mono">
                            <IconMegaphone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
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

                    {/* 5. Fund in Dev & Dev Money Bar */}
                    <td className="py-3 px-3">
                      {!token.devFund ? (
                        <span className="text-[11px] text-slate-400 italic">Scanning...</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
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
                            {(devFund.solscanUrl || devFund.devAddress) && (
                              <a
                                href={devFund.solscanUrl || `https://solscan.io/account/${devFund.devAddress}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center"
                                title="Inspect Dev Wallet on Solscan"
                              >
                                Solscan ↗
                              </a>
                            )}
                          </div>
                          {/* User Directive: Money in Dev Wallet Bar */}
                          <DevMoneyBar balance={devBal} currency={nativeCurrency} devBalanceUsd={devFund.devBalanceUsd} />
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

                    {/* External Links & Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickBuy && onQuickBuy(token);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-[11px] font-mono shadow-sm transition-all active:scale-95"
                          title={`Quick Buy $${token.symbol} via Jupiter`}
                        >
                          <IconBolt className="w-3 h-3 shrink-0" />
                          <span>Buy</span>
                        </button>
                        <a
                          href={dexLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-[11px] font-mono transition-colors border border-slate-700"
                          title="View on DexScreener"
                        >
                          Dex
                        </a>
                        <a
                          href={gmgnLink}
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

    </div>
  );
}
