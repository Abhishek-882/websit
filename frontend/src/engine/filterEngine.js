/**
 * Filter Engine
 * 
 * Instant Client-Side In-Memory Filtering (<1ms, 0 API calls).
 * Evaluates tokens across the 5 core discovery metrics:
 * 1. Market Cap (presets, custom min/max, slider)
 * 2. Launch Age (presets, slider)
 * 3. Smart Money (active holding >= $50 USD, presets, slider up to 50)
 * 4. KOL Holders (active holding >= $50 USD, presets, slider up to 50)
 * 5. Fund in Dev (CEX funding origin, Dev holding / dumped status, Dev Money $0 to $10,000 USD)
 */

export const DEFAULT_FILTERS = {
  search: '',
  mcapPreset: 'all', // 'all', '<50k', '50k-250k', '250k-1m', '>1m', 'custom'
  mcapMin: '',
  mcapMax: '',
  mcapMinSlider: 0, // 0 = all
  agePreset: 'all', // 'all', '<15m', '<1h', '<6h', '<24h'
  ageMaxHours: 0, // 0 = all
  smartPreset: 'all', // 'all', '>=1', '>=5', '>=10', '>=25', '>=50'
  smartMinSlider: 0, // 0 = all, max = 50
  kolPreset: 'all', // 'all', '>=1', '>=3', '>=5', '>=10', '>=25', '>=50'
  kolMinSlider: 0, // 0 = all, max = 50
  devPreset: 'all', // 'all', 'cex', 'holding', 'not_dumped'
  devMinMoneySliderUsd: 0, // 0 to 10000 USD
  devMinMoneySlider: 0, // for backward compatibility
};

/**
 * Unified Filter Matching Function:
 * Evaluates token against active search, presets, custom ranges, and sliders (<1ms, 100% in-memory).
 */
export function isTokenMatchingFilters(token, filters) {
  if (!token) return false;

  // Search filter (symbol, name, or contract address)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    const symbolMatch = (token.symbol || '').toLowerCase().includes(q);
    const nameMatch = (token.name || '').toLowerCase().includes(q);
    const addrMatch = (token.address || '').toLowerCase().includes(q);
    if (!symbolMatch && !nameMatch && !addrMatch) return false;
  }

  // 1. Market Cap
  const mcap = token.marketCap || 0;
  if (filters.mcapPreset === '<50k' && mcap >= 50000) return false;
  if (filters.mcapPreset === '50k-250k' && (mcap < 50000 || mcap > 250000)) return false;
  if (filters.mcapPreset === '250k-1m' && (mcap < 250000 || mcap > 1000000)) return false;
  if (filters.mcapPreset === '>1m' && mcap <= 1000000) return false;
  if (filters.mcapPreset === 'custom') {
    const min = parseFloat(filters.mcapMin);
    const max = parseFloat(filters.mcapMax);
    if (!isNaN(min) && mcap < min) return false;
    if (!isNaN(max) && mcap > max) return false;
  }
  if (filters.mcapMinSlider > 0 && mcap < filters.mcapMinSlider) return false;

  // 2. Launch Age (pair creation time)
  const age = token.ageMs;
  if (filters.agePreset === '<15m' && (age === null || age > 15 * 60 * 1000)) return false;
  if (filters.agePreset === '<1h' && (age === null || age > 60 * 60 * 1000)) return false;
  if (filters.agePreset === '<6h' && (age === null || age > 6 * 3600 * 1000)) return false;
  if (filters.agePreset === '<24h' && (age === null || age > 24 * 3600 * 1000)) return false;
  if (filters.ageMaxHours > 0 && (age === null || age > filters.ageMaxHours * 3600 * 1000)) return false;

  // 3. Smart Money (Strict active holding >= $50 USD, up to 50)
  const smart = token.smartMoneyCount ?? 0;
  if (filters.smartPreset === '>=1' && smart < 1) return false;
  if (filters.smartPreset === '>=2' && smart < 2) return false;
  if (filters.smartPreset === '>=3' && smart < 3) return false;
  if (filters.smartPreset === '>=5' && smart < 5) return false;
  if (filters.smartPreset === '>=10' && smart < 10) return false;
  if (filters.smartPreset === '>=25' && smart < 25) return false;
  if (filters.smartPreset === '>=50' && smart < 50) return false;
  if (filters.smartMinSlider > 0 && smart < filters.smartMinSlider) return false;

  // 4. KOL (Strict active holding >= $50 USD, up to 50)
  const kol = token.kolCount ?? 0;
  if (filters.kolPreset === '>=1' && kol < 1) return false;
  if (filters.kolPreset === '>=3' && kol < 3) return false;
  if (filters.kolPreset === '>=5' && kol < 5) return false;
  if (filters.kolPreset === '>=10' && kol < 10) return false;
  if (filters.kolPreset === '>=25' && kol < 25) return false;
  if (filters.kolPreset === '>=50' && kol < 50) return false;
  if (filters.kolMinSlider > 0 && kol < filters.kolMinSlider) return false;

  // 5. Fund in Dev & Dev Money Bar ($0 to $10k USD)
  const dev = token.devFund || {};
  if (filters.devPreset === 'cex' && !dev.isCexFunded) return false;
  if (filters.devPreset === 'holding' && (dev.devStatus !== 'Holding' || dev.isDumped)) return false;
  if (filters.devPreset === 'not_dumped' && dev.isDumped) return false;

  const minUsd = filters.devMinMoneySliderUsd > 0
    ? filters.devMinMoneySliderUsd
    : (filters.devMinMoneySlider > 0 ? filters.devMinMoneySlider : 0);

  if (minUsd > 0) {
    const devBalUsd = dev.devBalanceUsd !== undefined && dev.devBalanceUsd !== null
      ? Number(dev.devBalanceUsd)
      : Math.round(Number(dev.devBalanceSol ?? dev.fundingAmountSol ?? 0) * 150);
    if (devBalUsd < minUsd) return false;
  }

  return true;
}

/**
 * Determines whether user has any active/restrictive filter criteria enabled.
 * If false, user is viewing the full unfiltered firehose (no alert toasts or chimes).
 */
export function hasActiveFilterCriteria(filters) {
  if (!filters) return false;
  if (filters.search && filters.search.trim() !== '') return true;
  if (filters.mcapPreset && filters.mcapPreset !== 'all') return true;
  if (filters.mcapMin !== '' && filters.mcapMin !== undefined && !isNaN(parseFloat(filters.mcapMin))) return true;
  if (filters.mcapMax !== '' && filters.mcapMax !== undefined && !isNaN(parseFloat(filters.mcapMax))) return true;
  if ((filters.mcapMinSlider || 0) > 0) return true;
  if (filters.agePreset && filters.agePreset !== 'all') return true;
  if ((filters.ageMaxHours || 0) > 0) return true;
  if (filters.smartPreset && filters.smartPreset !== 'all') return true;
  if ((filters.smartMinSlider || 0) > 0) return true;
  if (filters.kolPreset && filters.kolPreset !== 'all') return true;
  if ((filters.kolMinSlider || 0) > 0) return true;
  if (filters.devPreset && filters.devPreset !== 'all') return true;
  if ((filters.devMinMoneySliderUsd || 0) > 0) return true;
  if ((filters.devMinMoneySlider || 0) > 0) return true;
  return false;
}
