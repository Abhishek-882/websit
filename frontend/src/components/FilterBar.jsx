import React from 'react';

import { DEFAULT_FILTERS, isTokenMatchingFilters } from '../engine/filterEngine.js';

export { DEFAULT_FILTERS, isTokenMatchingFilters };

export default function FilterBar({ filters, setFilters, onReset, activeFilterCount }) {
  const [isExpandedMobile, setIsExpandedMobile] = React.useState(false);

  const update = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="bg-[#0e1422] rounded-xl border border-slate-800 p-3 sm:p-4 shadow-md space-y-3 sm:space-y-4">
      
      {/* Top Bar: Search + Quick Stats + Reset */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pb-2.5 sm:pb-3 border-b border-slate-800/80">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search symbol, name, or address..."
            value={filters.search}
            onChange={e => update('search', e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
          />
          {filters.search && (
            <button
              onClick={() => update('search', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Action Buttons & User Settings */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
          {/* Mobile Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setIsExpandedMobile(!isExpandedMobile)}
            className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-300"
          >
            <span>🎛️ Filters</span>
            {activeFilterCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <span>{isExpandedMobile ? '▲' : '▼'}</span>
          </button>

          {/* Use Settings: Sell Percentage Threshold */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 shadow-inner">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
              <span>⚙️ Sell:</span>
            </span>
            <div className="flex items-center gap-1">
              {[70, 80, 90].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => update('sellThreshold', val)}
                  className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded font-mono font-bold transition-all ${
                    (filters.sellThreshold ?? 80) === val
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Count as sold if sold >= ${val}%`}
                >
                  {val}%{val === 80 ? ' (Def)' : ''}
                </button>
              ))}
              <div className="flex items-center ml-0.5">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={filters.sellThreshold ?? 80}
                  onChange={e => {
                    const num = parseInt(e.target.value, 10);
                    if (!isNaN(num) && num >= 1 && num <= 99) update('sellThreshold', num);
                  }}
                  className="w-10 sm:w-12 px-1 py-0.5 text-center text-xs font-mono font-bold bg-slate-950 border border-slate-700 rounded text-purple-300 focus:outline-none focus:border-purple-400"
                  title="Custom sell percentage threshold"
                />
                <span className="text-[10px] text-slate-400 ml-0.5">%</span>
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <span className="hidden sm:inline-block text-xs px-2.5 py-1 bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 rounded-md font-medium">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={onReset}
            disabled={activeFilterCount === 0 && !filters.search && (filters.sellThreshold ?? 80) === 80}
            className={`text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
              activeFilterCount > 0 || filters.search || (filters.sellThreshold ?? 80) !== 80
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 cursor-pointer'
                : 'bg-slate-900/40 border-slate-800/60 text-slate-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* The 5 Interactive Filter Metric Blocks (Collapsible on mobile) */}
      <div className={`${isExpandedMobile ? 'grid' : 'hidden sm:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3`}>

        {/* 1. Market Cap Filter */}
        <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              1. Market Cap
            </span>
            <span className="text-[10px] text-slate-400">DexScreener</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: '<50k', label: '< $50K' },
              { id: '50k-250k', label: '$50K-250K' },
              { id: '250k-1m', label: '$250K-1M' },
              { id: '>1m', label: '> $1M' },
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => {
                  update('mcapPreset', btn.id);
                  if (btn.id !== 'custom') {
                    update('mcapMin', '');
                    update('mcapMax', '');
                  }
                }}
                className={`text-[11px] px-2 py-0.5 rounded transition-all font-medium ${
                  filters.mcapPreset === btn.id && filters.mcapMinSlider === 0
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Custom Min / Max inputs */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <input
              type="number"
              placeholder="Min $"
              value={filters.mcapMin}
              onChange={e => {
                update('mcapMin', e.target.value);
                update('mcapPreset', 'custom');
              }}
              className="w-1/2 px-2 py-1 text-[11px] bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-400 font-mono focus:outline-none focus:border-cyan-500"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="number"
              placeholder="Max $"
              value={filters.mcapMax}
              onChange={e => {
                update('mcapMax', e.target.value);
                update('mcapPreset', 'custom');
              }}
              className="w-1/2 px-2 py-1 text-[11px] bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-400 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Interactive Min Market Cap Slider */}
          <div className="pt-1 border-t border-slate-800/60">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Min MCap Slider:</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {filters.mcapMinSlider > 0 ? `$${Math.round(filters.mcapMinSlider / 1000)}K` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1000000"
              step="25000"
              value={filters.mcapMinSlider}
              onChange={e => update('mcapMinSlider', Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* 2. Age Filter */}
        <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              2. Launch Age
            </span>
            <span className="text-[10px] text-slate-400">DexScreener</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: '<15m', label: '< 15m' },
              { id: '<1h', label: '< 1h' },
              { id: '<6h', label: '< 6h' },
              { id: '<24h', label: '< 24h' },
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => update('agePreset', btn.id)}
                className={`text-[11px] px-2 py-0.5 rounded transition-all font-medium ${
                  filters.agePreset === btn.id && filters.ageMaxHours === 0
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Interactive Max Age Slider */}
          <div className="pt-1 border-t border-slate-800/60">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Max Age Slider:</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {filters.ageMaxHours > 0 ? `${filters.ageMaxHours}h` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="48"
              step="1"
              value={filters.ageMaxHours}
              onChange={e => update('ageMaxHours', Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* 3. Smart Money Filter (Active >= $50) */}
        <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
              3. Smart Money
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">≥ $50 Holding</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: '>=1', label: '≥ 1' },
              { id: '>=5', label: '≥ 5' },
              { id: '>=10', label: '≥ 10' },
              { id: '>=25', label: '≥ 25' },
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => {
                  update('smartPreset', btn.id);
                  if (btn.id === '>=5') update('smartMinSlider', 5);
                  else if (btn.id === '>=10') update('smartMinSlider', 10);
                  else if (btn.id === '>=25') update('smartMinSlider', 25);
                  else if (btn.id === 'all') update('smartMinSlider', 0);
                }}
                className={`text-[11px] px-2 py-0.5 rounded transition-all font-medium ${
                  (filters.smartPreset === btn.id && filters.smartMinSlider === 0) || (btn.id !== 'all' && filters.smartMinSlider === parseInt(btn.id.replace('>=', '')))
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Interactive Min Smart Money Slider (Up to 50) */}
          <div className="pt-1 border-t border-slate-800/60">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Min Smart Slider (Max 50):</span>
              <span className="font-mono text-emerald-300 font-semibold">
                {filters.smartMinSlider > 0 ? `≥ ${filters.smartMinSlider}` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={filters.smartMinSlider}
              onChange={e => update('smartMinSlider', Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>

        {/* 4. KOL Filter (Active >= $50) */}
        <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-purple-400">
              4. KOL Holders
            </span>
            <span className="text-[10px] text-purple-400 font-medium">≥ $50 Holding</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: '>=1', label: '≥ 1' },
              { id: '>=3', label: '≥ 3' },
              { id: '>=5', label: '≥ 5' },
              { id: '>=10', label: '≥ 10' },
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => {
                  update('kolPreset', btn.id);
                  if (btn.id === '>=3') update('kolMinSlider', 3);
                  else if (btn.id === '>=5') update('kolMinSlider', 5);
                  else if (btn.id === '>=10') update('kolMinSlider', 10);
                  else if (btn.id === 'all') update('kolMinSlider', 0);
                }}
                className={`text-[11px] px-2 py-0.5 rounded transition-all font-medium ${
                  (filters.kolPreset === btn.id && filters.kolMinSlider === 0) || (btn.id !== 'all' && filters.kolMinSlider === parseInt(btn.id.replace('>=', '')))
                    ? 'bg-purple-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Interactive Min KOL Slider (Up to 50) */}
          <div className="pt-1 border-t border-slate-800/60">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Min KOL Slider (Max 50):</span>
              <span className="font-mono text-purple-300 font-semibold">
                {filters.kolMinSlider > 0 ? `≥ ${filters.kolMinSlider}` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={filters.kolMinSlider}
              onChange={e => update('kolMinSlider', Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
          </div>
        </div>

        {/* 5. Fund in Dev Filter & Money in Dev Bar */}
        <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
              5. Fund in Dev
            </span>
            <span className="text-[10px] text-amber-400 font-medium">On-Chain RPC</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'cex', label: 'CEX' },
              { id: 'holding', label: 'Dev Hold' },
              { id: 'not_dumped', label: 'Not Dump' },
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => update('devPreset', btn.id)}
                className={`text-[11px] px-2 py-0.5 rounded transition-all font-medium ${
                  filters.devPreset === btn.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* User Directive: Bar / Slider for Money in Dev Wallet */}
          <div className="pt-1 border-t border-slate-800/60">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Min Dev Balance Bar:</span>
              <span className="font-mono text-amber-300 font-semibold">
                {(filters.devMinMoneySlider ?? 0) > 0 ? `≥ ${filters.devMinMoneySlider}` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="0.5"
              value={filters.devMinMoneySlider ?? 0}
              onChange={e => update('devMinMoneySlider', Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              title="Filter by minimum money/SOL/ETH in dev wallet"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
