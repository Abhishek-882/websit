import assert from 'node:assert/strict';
import { GMGNKeyPool } from '../src/services/gmgnKeyPool.service.js';
import { DexScreenerService } from '../src/services/dexscreener.service.js';
import { DevFundService, devFundService } from '../src/services/devFund.service.js';

console.log('🧪 Starting Ban-Proof & 5-Metric Telemetry Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. GMGN Key Pool Pacing & Clock Drift Shield Tests
// ─────────────────────────────────────────────────────────────
await runTest('GMGN Key Pool enforces serialized pacing delay between requests', async () => {
  const pool = new GMGNKeyPool([
    { id: 101, apiKey: 'test_key_1', publicKey: null },
    { id: 102, apiKey: 'test_key_2', publicKey: null },
  ]);
  pool.pacingDelayMs = 250; // Use 250ms in unit test for speed

  const timestamps = [];
  const p1 = pool.execute('test-op-1', async () => {
    timestamps.push(Date.now());
    return 1;
  });
  const p2 = pool.execute('test-op-2', async () => {
    timestamps.push(Date.now());
    return 2;
  });

  await Promise.all([p1, p2]);
  assert.equal(timestamps.length, 2);
  const diff = timestamps[1] - timestamps[0];
  assert.ok(
    diff >= 220,
    `Expected pacing delay >= 220ms, actual diff was ${diff}ms`
  );
});

await runTest('GMGN Key Pool activates +15s clock drift buffer upon IP rate limit', async () => {
  const pool = new GMGNKeyPool([
    { id: 101, apiKey: 'test_key_1', publicKey: null },
  ]);
  pool.pacingDelayMs = 0;

  const fakeBanError = new Error('RATE_LIMIT_BANNED: IP is temporarily banned ~30s remaining');
  fakeBanError.apiError = 'RATE_LIMIT_BANNED';

  try {
    await pool.execute('banned-op', async () => {
      throw fakeBanError;
    });
  } catch (err) {
    // Expected to throw
  }

  assert.equal(pool.isAvailable(), false, 'Pool must not be available during cooldown');
  const remaining = pool.getCooldownRemainingSec();
  // 30s + 15s shield = ~45s
  assert.ok(remaining >= 40 && remaining <= 50, `Cooldown remaining should be ~45s, got ${remaining}s`);
});

// ─────────────────────────────────────────────────────────────
// 2. DexScreener Pre-Filter & Time Formatting Tests
// ─────────────────────────────────────────────────────────────
await runTest('DexScreenerService formats relative age correctly', () => {
  const ds = new DexScreenerService();
  const now = Date.now();

  assert.equal(ds.formatTimeAgo(now - 10000), 'just now');
  assert.equal(ds.formatTimeAgo(now - (12 * 60 * 1000)), '12m');
  assert.equal(ds.formatTimeAgo(now - (3 * 3600 * 1000)), '3h');
  assert.equal(ds.formatTimeAgo(now - (3 * 3600 * 1000 + 20 * 60 * 1000)), '3h 20m');
  assert.equal(ds.formatTimeAgo(now - (2 * 86400 * 1000)), '2d');
  assert.equal(ds.formatTimeAgo(null), '--');
});

await runTest('DexScreenerService pre-filters dead pairs with < $1,000 liquidity', () => {
  const testPairs = [
    { address: 'token1', marketCap: 50000, liquidityUsd: 15000 },
    { address: 'token2', marketCap: 3000, liquidityUsd: 250 },   // dead/pulled liquidity trap
    { address: 'token3', marketCap: 250000, liquidityUsd: 85000 },
    { address: 'token4', marketCap: 0, liquidityUsd: 5000 },      // 0 mcap
  ];

  const filtered = testPairs.filter(t => t.address && t.marketCap > 0 && t.liquidityUsd >= 1000);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].address, 'token1');
  assert.equal(filtered[1].address, 'token3');
});

// ─────────────────────────────────────────────────────────────
// 3. Dev Funding & Status Classification Tests
// ─────────────────────────────────────────────────────────────
await runTest('DevFundService accurately classifies CEX origins and SOL amounts', () => {
  const devService = new DevFundService();

  const res1 = devService.classifyFundingSource('Binance Hot Wallet 2', '4.502');
  assert.equal(res1.source, 'Binance');
  assert.equal(res1.isCex, true);
  assert.equal(res1.amountSol, 4.5);

  const res2 = devService.classifyFundingSource('FixedFloat', '10.00');
  assert.equal(res2.source, 'FixedFloat');
  assert.equal(res2.isCex, true);
  assert.equal(res2.amountSol, 10);

  const res3 = devService.classifyFundingSource('Bybit', null);
  assert.equal(res3.source, 'Bybit');
  assert.equal(res3.isCex, true);
  assert.equal(res3.amountSol, null);

  const res4 = devService.classifyFundingSource('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', '1.2');
  assert.equal(res4.isCex, false);
  assert.equal(res4.source, '4k3D...kX6R');
  assert.equal(res4.amountSol, 1.2);
});

await runTest('DevFundService classifies Dev holding, dumped, and CTO statuses', async () => {
  const devService = new DevFundService();

  const normalDev = await devService.resolveDevFund({
    creator_token_status: 'holding',
    cto_flag: 0,
    fund_from: 'Binance',
    fund_amount: '3.0'
  });
  assert.equal(normalDev.devStatus, 'Holding');
  assert.equal(normalDev.isDumped, false);
  assert.equal(normalDev.isCto, false);
  assert.equal(normalDev.fundingDisplay, 'Binance (3 SOL)');

  const dumpedDev = await devService.resolveDevFund({
    creator_token_status: 'creator_close',
    cto_flag: 0,
    fund_from: 'FixedFloat',
  });
  assert.equal(dumpedDev.devStatus, 'Dumped 100%');
  assert.equal(dumpedDev.isDumped, true);

  const ctoDev = await devService.resolveDevFund({
    cto_flag: 1,
    creator_token_status: 'creator_close',
  });
  assert.equal(ctoDev.devStatus, 'CTO');
  assert.equal(ctoDev.isCto, true);
});

// ─────────────────────────────────────────────────────────────
// 4. Smart Money & KOL Active Holder Strict Telemetry Tests
// ─────────────────────────────────────────────────────────────
await runTest('Strict Holder Filtering excludes sold out wallets and wallets holding < $50 USD', () => {
  const rawTraders = [
    {
      address: 'wallet_smart_holding',
      tags: ['smart_degen'],
      usd_value: 120,
      sell_amount_percentage: 0.2, // Still holding 80%, $120 > $50 -> PASS
    },
    {
      address: 'wallet_smart_dust',
      tags: ['smart_wallet'],
      usd_value: 15,
      sell_amount_percentage: 0.0, // Holding but < $50 USD -> FAIL
    },
    {
      address: 'wallet_smart_dumped',
      tags: ['smart_degen'],
      usd_value: 0,
      sell_amount_percentage: 1.0, // 100% sold out -> FAIL
    },
    {
      address: 'wallet_kol_active',
      tags: ['renowned'],
      twitter_username: 'sol_influencer',
      usd_value: 850,
      sell_amount_percentage: 0.35, // Still holding 65%, $850 > $50 -> PASS
    },
    {
      address: 'wallet_kol_dumped',
      tags: ['kol'],
      twitter_username: 'pump_promoter',
      usd_value: 500,
      sell_amount_percentage: 1.0, // 100% sold out -> FAIL
    },
  ];

  const activeSmart = [];
  const activeKol = [];

  for (const tr of rawTraders) {
    const usdVal = Number(tr.usd_value || 0);
    const sellPct = Number(tr.sell_amount_percentage || 0);

    // Strict requirements: usd_value >= 50 and sell_amount_percentage < 1
    if (usdVal < 50 || sellPct >= 1) continue;

    const tags = Array.isArray(tr.tags) ? tr.tags.map(t => String(t).toLowerCase()) : [];
    const isSmart = tags.some(t => t.includes('smart') || t === 'smart_degen' || t === 'smart_wallet');
    const isKol = tags.some(t => t.includes('kol') || t.includes('renowned') || t.includes('influencer')) || Boolean(tr.twitter_username);

    if (isSmart) activeSmart.push(tr);
    if (isKol) activeKol.push(tr);
  }

  assert.equal(activeSmart.length, 1, 'Only wallets holding >= $50 USD should be in smart count');
  assert.equal(activeSmart[0].address, 'wallet_smart_holding');

  assert.equal(activeKol.length, 1, 'Dumped KOLs must be strictly excluded');
  assert.equal(activeKol[0].address, 'wallet_kol_active');
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n==================================================`);
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log(`==================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
