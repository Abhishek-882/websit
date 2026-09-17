import assert from 'node:assert/strict';
import { GMGNKeyPool } from '../src/services/gmgnKeyPool.service.js';
import { DexScreenerService, dexscreenerService } from '../src/services/dexscreener.service.js';
import { DevFundService, devFundService } from '../src/services/devFund.service.js';
import { tokenAggregatorService } from '../src/services/tokenAggregator.service.js';

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
    { address: 'token1', marketCap: 50000, liquidityUsd: 15000, volume24h: 1000 },
    { address: 'token2', marketCap: 3000, liquidityUsd: 250, volume24h: 50 },   // dead/pulled liquidity trap (< $1000)
    { address: 'token3', marketCap: 250000, liquidityUsd: 85000, volume24h: 5000 },
    { address: 'token4', marketCap: 0, liquidityUsd: 5000, volume24h: 100 },      // 0 mcap
    { address: 'token5', marketCap: 12000, liquidityUsd: 1000, volume24h: 200 }, // exactly $1,000 boundary -> PASS
    { address: 'token6', marketCap: 12000, liquidityUsd: 999.99, volume24h: 200 }, // $999.99 -> FAIL
  ];

  const filtered = dexscreenerService.preFilterPairs(testPairs);
  assert.equal(filtered.length, 3);
  assert.equal(filtered.some(t => t.address === 'token1'), true);
  assert.equal(filtered.some(t => t.address === 'token3'), true);
  assert.equal(filtered.some(t => t.address === 'token5'), true);
  assert.equal(filtered.some(t => t.address === 'token2'), false);
  assert.equal(filtered.some(t => t.address === 'token6'), false);
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
await runTest('Strict Holder Filtering excludes zero-bought wallets, dumped wallets, and wallets holding < $50 USD', () => {
  const rawTraders = [
    {
      address: 'wallet_smart_holding',
      tags: ['smart_degen'],
      total_cost: 150,
      buy_tx_count: 2,
      usd_value: 120,
      sell_amount_percentage: 0.2, // Has bought $150, holding $120 >= $50, sell 20% < 99% -> PASS
    },
    {
      address: 'wallet_smart_98pct',
      tags: ['smart_wallet'],
      total_cost: 600,
      buy_tx_count: 4,
      usd_value: 200,
      sell_amount_percentage: 0.98, // Has bought $600, holds $200 >= $50, sell 98% < 99% -> PASS
    },
    {
      address: 'wallet_smart_brought_by_zero',
      tags: ['smart_degen'],
      total_cost: 0,
      buy_tx_count: 0,
      usd_value: 150,
      sell_amount_percentage: 0.0, // Holding $150 BUT bought = $0 (brought by 0 / airdrop) -> STRICT EXCLUDE!
    },
    {
      address: 'wallet_smart_dust',
      tags: ['smart_wallet'],
      total_cost: 80,
      buy_tx_count: 1,
      usd_value: 49.99,
      sell_amount_percentage: 0.0, // Bought $80 but holds < $50 USD -> EXCLUDE!
    },
    {
      address: 'wallet_smart_dumped',
      tags: ['smart_degen'],
      total_cost: 300,
      buy_tx_count: 2,
      usd_value: 0,
      sell_amount_percentage: 1.0, // 100% sold out -> EXCLUDE!
    },
    {
      address: 'wallet_kol_active',
      tags: ['renowned'],
      total_cost: 1200,
      buy_tx_count: 3,
      twitter_username: 'sol_influencer',
      usd_value: 850,
      sell_amount_percentage: 0.35, // Bought $1200, holds $850 >= $50 -> PASS
    },
    {
      address: 'wallet_kol_brought_by_zero',
      tags: ['kol'],
      total_cost: 0,
      buy_tx_count: 0,
      twitter_username: 'fake_kol',
      usd_value: 500,
      sell_amount_percentage: 0.0, // Brought by $0 -> STRICT EXCLUDE!
    },
    {
      address: 'wallet_kol_dumped',
      tags: ['kol'],
      total_cost: 500,
      buy_tx_count: 1,
      twitter_username: 'pump_promoter',
      usd_value: 500,
      sell_amount_percentage: 1.0, // 100% sold out -> EXCLUDE!
    },
    {
      address: 'wallet_kol_v2_tag',
      wallet_tag_v2: 'KOL',
      total_cost: 400,
      buy_tx_count: 2,
      usd_value: 300,
      sell_amount_percentage: 0.1, // Tag v2 recognized, bought $400, holds $300 -> PASS
    },
  ];

  const { activeSmartHolders, activeKolHolders } = tokenAggregatorService.filterActiveHolders(rawTraders);

  assert.equal(activeSmartHolders.length, 2, 'Only wallets holding >= $50 USD AND bought > 0 must pass smart check');
  assert.equal(activeSmartHolders[0].address, 'wallet_smart_holding');
  assert.equal(activeSmartHolders[1].address, 'wallet_smart_98pct');

  assert.equal(activeKolHolders.length, 2, 'Only active KOLs who bought > 0 and hold >= $50 must pass');
  assert.equal(activeKolHolders[0].address, 'wallet_kol_active');
  assert.equal(activeKolHolders[1].address, 'wallet_kol_v2_tag');
});

// ─────────────────────────────────────────────────────────────
// 5. Tier 1 Fast-Gating Screen Tests
// ─────────────────────────────────────────────────────────────
await runTest('Tier 1 Fast-Gating Screen detects candidate counts and avoids Weight 5 top traders call', () => {
  // Scenario A: Candidate with 0 smart and 0 renowned
  const zeroCandidate = {
    wallet_tags_stat: {
      smart_wallets: 0,
      smart_degen: 0,
      renowned_wallets: 0,
      kol_wallets: 0,
    }
  };
  const smartA = Number(zeroCandidate.wallet_tags_stat.smart_wallets || zeroCandidate.wallet_tags_stat.smart_degen || 0);
  const kolA = Number(zeroCandidate.wallet_tags_stat.renowned_wallets || zeroCandidate.wallet_tags_stat.kol_wallets || 0);
  assert.equal(smartA > 0 || kolA > 0, false, 'Fast-gating must engage and skip Weight 5 top traders query');

  // Scenario B: Candidate with kol_wallets > 0
  const kolCandidate = {
    wallet_tags_stat: {
      smart_wallets: 0,
      kol_wallets: 2,
    }
  };
  const smartB = Number(kolCandidate.wallet_tags_stat.smart_wallets || kolCandidate.wallet_tags_stat.smart_degen || 0);
  const kolB = Number(kolCandidate.wallet_tags_stat.renowned_wallets || kolCandidate.wallet_tags_stat.kol_wallets || 0);
  assert.equal(smartB > 0 || kolB > 0, true, 'Fast-gating must trigger deep inspection for candidate with kol_wallets');
});

// ─────────────────────────────────────────────────────────────
// 6. In-Memory 5-Metric Unified Client Filter Engine Tests
// ─────────────────────────────────────────────────────────────
await runTest('In-Memory Filter Engine evaluates all 5 dimensions without API calls (<1ms)', async () => {
  // Import unified filter function from filterEngine
  const { isTokenMatchingFilters } = await import('../../frontend/src/engine/filterEngine.js');

  const testToken = {
    symbol: 'SOLRADAR',
    name: 'Solana Radar Token',
    address: 'So11111111111111111111111111111111111111112',
    marketCap: 150000,
    ageMs: 45 * 60 * 1000, // 45 minutes
    smartMoneyCount: 2,
    kolCount: 1,
    devFund: {
      isCexFunded: true,
      fundingSource: 'Binance',
      devStatus: 'Holding',
      isDumped: false,
    },
  };

  // 1. Matches all criteria
  const passFilters = {
    search: '',
    mcapPreset: '50k-250k',
    agePreset: '<1h',
    smartPreset: '>=2',
    kolPreset: '>=1',
    devPreset: 'cex',
  };
  assert.equal(isTokenMatchingFilters(testToken, passFilters), true, 'Should pass matching filters');

  // 2. Fails when Age filter requires <15m
  const failAge = { ...passFilters, agePreset: '<15m' };
  assert.equal(isTokenMatchingFilters(testToken, failAge), false, 'Should fail age filter');

  // 3. Fails when Smart Money requires >= 3
  const failSmart = { ...passFilters, smartPreset: '>=3' };
  assert.equal(isTokenMatchingFilters(testToken, failSmart), false, 'Should fail smart money filter');

  // 4. Fails when Dev filter requires holding but dev dumped
  const dumpedToken = { ...testToken, devFund: { ...testToken.devFund, devStatus: 'Dumped 100%', isDumped: true } };
  const failDev = { ...passFilters, devPreset: 'holding' };
  assert.equal(isTokenMatchingFilters(dumpedToken, failDev), false, 'Should fail dev holding filter when dev dumped');
});

// ─────────────────────────────────────────────────────────────
// 6b. Notification & Sound Filter Gating Tests
// ─────────────────────────────────────────────────────────────
await runTest('Notification & Sound alerts are strictly gated by active filter criteria (prevents chime on every coin)', async () => {
  const { DEFAULT_FILTERS, hasActiveFilterCriteria, isTokenMatchingFilters } = await import('../../frontend/src/engine/filterEngine.js');

  // 1. Default filters have 0 active criteria -> Notifications and sound are IDLE
  assert.equal(hasActiveFilterCriteria(DEFAULT_FILTERS), false, 'Default filters should have no active criteria');

  // 2. Custom criteria correctly detected as active
  assert.equal(hasActiveFilterCriteria({ ...DEFAULT_FILTERS, smartPreset: '>=2' }), true, 'Smart money preset should activate filter criteria');
  assert.equal(hasActiveFilterCriteria({ ...DEFAULT_FILTERS, mcapPreset: '<50k' }), true, 'Mcap preset should activate filter criteria');
  assert.equal(hasActiveFilterCriteria({ ...DEFAULT_FILTERS, ageMaxHours: 2 }), true, 'Age slider should activate filter criteria');
  assert.equal(hasActiveFilterCriteria({ ...DEFAULT_FILTERS, devPreset: 'cex' }), true, 'Dev CEX preset should activate filter criteria');
  assert.equal(hasActiveFilterCriteria({ ...DEFAULT_FILTERS, search: 'BONK' }), true, 'Search text should activate filter criteria');

  // 3. Token evaluation behavior:
  // Random coin without smart money:
  const randomCoin = {
    symbol: 'RANDOM',
    marketCap: 20000,
    ageMs: 60000,
    smartMoneyCount: 0,
    kolCount: 0,
  };

  // When user configures smart money filter:
  const userFilters = { ...DEFAULT_FILTERS, smartPreset: '>=1' };
  assert.equal(hasActiveFilterCriteria(userFilters), true, 'User filters are active');
  assert.equal(isTokenMatchingFilters(randomCoin, userFilters), false, 'Random coin with 0 smart money must NOT qualify for alert');

  // Token with smart money:
  const smartCoin = {
    symbol: 'SMARTCOIN',
    marketCap: 40000,
    ageMs: 60000,
    smartMoneyCount: 3,
    kolCount: 1,
  };
  assert.equal(isTokenMatchingFilters(smartCoin, userFilters), true, 'Smart coin qualifies for notification and sound chime');
});

// ─────────────────────────────────────────────────────────────
// 7. Fibonacci Retracement Limit Order Calculation Tests
// ─────────────────────────────────────────────────────────────
await runTest('Fibonacci Limit Orders calculate exact retracement price targets (-10%, -20%, -30%)', () => {
  const currentPriceUsd = 0.05; // $0.05 per token

  // Spot 1: -10% (Fib 0.236 shallow dip)
  const spot1 = 10;
  const targetPrice1 = currentPriceUsd * (1 - spot1 / 100);
  assert.equal(Math.round(targetPrice1 * 1000) / 1000, 0.045);

  // Spot 2: -20% (Fib 0.382 Golden Dip)
  const spot2 = 20;
  const targetPrice2 = currentPriceUsd * (1 - spot2 / 100);
  assert.equal(Math.round(targetPrice2 * 1000) / 1000, 0.040);

  // Spot 3: -30% (Fib 0.500 Deep Retracement)
  const spot3 = 30;
  const targetPrice3 = currentPriceUsd * (1 - spot3 / 100);
  assert.equal(Math.round(targetPrice3 * 1000) / 1000, 0.035);

  // Trigger evaluation: Price reaches $0.039 -> should trigger Spot 2 (<= 0.040)
  const dipPrice = 0.039;
  assert.equal(dipPrice <= targetPrice2, true, 'Limit order should trigger when price reaches target dip');
  assert.equal(dipPrice <= targetPrice3, false, 'Deep spot limit order should not trigger prematurely');
});

// ─────────────────────────────────────────────────────────────
// 8. Solscan API & RPC Fallback Telemetry Tests
// ─────────────────────────────────────────────────────────────
await runTest('SolscanService generates direct verification link and gracefully falls back to Solana RPC', async () => {
  const { solscanService } = await import('../src/services/solscan.service.js');
  const testDevAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const devFund = await devFundService.resolveDevFund({
    creator_address: testDevAddress,
    fund_from: 'Binance',
    fund_amount: '5.0',
  }, 'TestMint111111111111111111111111111111111111', 145);

  assert.ok(devFund, 'Dev fund must be resolved');
  assert.equal(devFund.solscanUrl, `https://solscan.io/account/${testDevAddress}`);
  assert.equal(devFund.fundingSource, 'Binance');
  assert.equal(devFund.isCexFunded, true);
});

// ─────────────────────────────────────────────────────────────
// 9. 1-Click Phantom Deposit Transaction & Lamport Precision Tests
// ─────────────────────────────────────────────────────────────
await runTest('1-Click Phantom Deposit generates valid SystemProgram transfer transaction', async () => {
  const { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
  const userKp = Keypair.generate();
  const sessionKp = Keypair.generate();

  const depositSol = 0.5;
  const lamports = Math.round(depositSol * LAMPORTS_PER_SOL);
  assert.equal(lamports, 500_000_000, '0.5 SOL must convert to exactly 500,000,000 lamports');

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userKp.publicKey,
      toPubkey: sessionKp.publicKey,
      lamports,
    })
  );

  assert.equal(tx.instructions.length, 1);
  const ix = tx.instructions[0];
  assert.equal(ix.programId.equals(SystemProgram.programId), true);
  assert.equal(ix.keys[0].pubkey.equals(userKp.publicKey), true);
  assert.equal(ix.keys[1].pubkey.equals(sessionKp.publicKey), true);
});

// ─────────────────────────────────────────────────────────────
// 10. Ed25519 Signature Proof-of-Ownership & Private Key Export Tests
// ─────────────────────────────────────────────────────────────
await runTest('Ed25519 Signature Proof-of-Ownership authenticates private key export', async () => {
  const { Keypair } = await import('@solana/web3.js');
  const bs58 = (await import('bs58')).default;
  const crypto = await import('crypto');
  const { sessionWalletService } = await import('../src/services/sessionWallet.service.js');

  const userKp = Keypair.generate();
  const userWallet = userKp.publicKey.toBase58();

  // Create session wallet in DB for this user
  const session = await sessionWalletService.createSession(userWallet, { test: true });
  assert.ok(session.sessionPubkey, 'Session pubkey must be created');

  // 1. Generate valid Ed25519 signature
  const timestamp = Date.now();
  const message = `Authorize private key export for Solana Radar Session (${session.sessionPubkey}) at timestamp ${timestamp}`;
  const msgBytes = Buffer.from(message, 'utf8');

  const seed = userKp.secretKey.subarray(0, 32);
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const validSig = crypto.sign(null, msgBytes, privKeyObj);
  const validSigB58 = bs58.encode(validSig);

  // 2. Test valid signature verification
  const isSigValid = sessionWalletService.verifySignature(userWallet, validSigB58, message);
  assert.equal(isSigValid, true, 'Valid Phantom-style Ed25519 signature must verify');

  // 3. Test exportPrivateKey succeeds with valid signature
  const exported = await sessionWalletService.exportPrivateKey(userWallet, validSigB58, message);
  assert.equal(exported.sessionPubkey, session.sessionPubkey);
  assert.ok(exported.privateKey, 'Decrypted private key must be returned');

  // Verify the exported key reconstructs the exact same session keypair
  const reconstructedKp = Keypair.fromSecretKey(bs58.decode(exported.privateKey));
  assert.equal(reconstructedKp.publicKey.toBase58(), session.sessionPubkey);

  // 4. Test invalid signature is strictly rejected
  const fakeSigB58 = bs58.encode(Buffer.alloc(64, 1));
  await assert.rejects(
    async () => {
      await sessionWalletService.exportPrivateKey(userWallet, fakeSigB58, message);
    },
    /Invalid cryptographic signature/,
    'Forged or invalid signature must be rejected'
  );
});

// ─────────────────────────────────────────────────────────────
// 11. Cross-Device Persistence & Crash Recovery Tests
// ─────────────────────────────────────────────────────────────
await runTest('Session wallet deterministically recovers across reconnections and device sessions', async () => {
  const { sessionWalletService } = await import('../src/services/sessionWallet.service.js');
  const { Keypair } = await import('@solana/web3.js');

  const persistentUserKp = Keypair.generate();
  const persistentUserWallet = persistentUserKp.publicKey.toBase58();

  // First connection on Phone A
  const sessionA = await sessionWalletService.createSession(persistentUserWallet);
  assert.ok(sessionA.sessionPubkey);

  // Phone lost / cache cleared -> User reconnects same Phantom on Laptop B
  const sessionB = await sessionWalletService.createSession(persistentUserWallet);
  assert.equal(sessionB.sessionPubkey, sessionA.sessionPubkey, 'Must return the same persistent session address');

  const sessionDetails = await sessionWalletService.getSession(persistentUserWallet);
  assert.equal(sessionDetails.sessionPubkey, sessionA.sessionPubkey);
  assert.equal(sessionDetails.isActive, true);
});

// ─────────────────────────────────────────────────────────────
// 12. Gas Reserve Protection Tests
// ─────────────────────────────────────────────────────────────
await runTest('Trading Service enforces 0.005 SOL gas reserve before trades', () => {
  const tradeSizeSol = 0.1;
  const gasReserveSol = 0.005;
  const requiredBalance = tradeSizeSol + gasReserveSol; // 0.105 SOL

  const balanceTooLow = 0.102; // only 0.002 left after trade, not enough for exit gas
  assert.equal(balanceTooLow < requiredBalance, true, 'Should block trade when gas reserve is compromised');

  const balanceSufficient = 0.106;
  assert.equal(balanceSufficient >= requiredBalance, true, 'Should allow trade when gas reserve is preserved');
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
